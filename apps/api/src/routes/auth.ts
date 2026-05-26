import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { RegisterInput, RequestOtpInput, VerifyOtpInput } from '@onyxhawk/types';

import { prisma } from '../db.js';
import { issueSignInOtp, verifySignInOtp, OtpError } from '../auth/otp.js';
import { signRegistrationToken, verifyRegistrationToken } from '../auth/jwt.js';
import { issueSession, rotateRefreshToken, revokeRefreshToken, toPublicUser, RefreshError } from '../auth/tokens.js';
import { generateUniqueReferralCode } from '../auth/referral.js';
import { requireAuth } from '../auth/middleware.js';

// E.164 phone, lenient on length (Kenya is +254 + 9 digits = 13 chars, but allow other markets).
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'phone must be E.164 (e.g. +254712480392)');

const RequestOtpSchema = z.object({ phone: phoneSchema }) satisfies z.ZodType<RequestOtpInput>;
const VerifyOtpSchema = z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/) }) satisfies z.ZodType<VerifyOtpInput>;
const RefreshSchema = z.object({ refreshToken: z.string().min(1) });
const LogoutSchema = z.object({ refreshToken: z.string().min(1) });
const RegisterSchema = z.object({
  registrationToken: z.string().min(1),
  fullName: z.string().trim().min(1).max(120),
  email: z.string().email().optional(),
  defaultAddress: z
    .object({
      label: z.string().min(1).max(40),
      line1: z.string().min(1).max(200),
      area: z.string().max(80).optional(),
      city: z.string().max(80).optional(),
    })
    .optional(),
  referralCode: z.string().trim().toUpperCase().optional(),
}) satisfies z.ZodType<RegisterInput>;

export const authRoutes: FastifyPluginAsync = async (app) => {
  // ── Step 1: request OTP ────────────────────────────────────────────────
  app.post('/request-otp', async (req, reply) => {
    const parsed = RequestOtpSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    try {
      const { devOtp } = await issueSignInOtp(parsed.data.phone, req.log);
      const body: { ok: true; devOtp?: string } = { ok: true };
      if (devOtp) body.devOtp = devOtp;
      return reply.send(body);
    } catch (err) {
      if (err instanceof OtpError) return reply.code(429).send({ error: err.message, code: err.code });
      throw err;
    }
  });

  // ── Step 2: verify OTP → either authenticated session or registration token ─
  app.post('/verify-otp', async (req, reply) => {
    const parsed = VerifyOtpSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    let ok: boolean;
    try {
      ok = await verifySignInOtp(parsed.data.phone, parsed.data.code);
    } catch (err) {
      if (err instanceof OtpError) return reply.code(429).send({ error: err.message, code: err.code });
      throw err;
    }
    if (!ok) return reply.code(401).send({ error: 'invalid or expired code' });

    const user = await prisma.user.findUnique({ where: { phone: parsed.data.phone } });
    if (!user) {
      // New phone — issue a short-lived registration token; client routes to screen 02.
      const { token } = await signRegistrationToken(parsed.data.phone);
      return reply.send({ kind: 'NEEDS_REGISTRATION', registrationToken: token, phone: parsed.data.phone });
    }

    if (user.deletedAt) return reply.code(403).send({ error: 'account is deactivated' });

    // Mark the phone verified on first successful OTP sign-in for an existing user.
    if (!user.phoneVerified) {
      await prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true } });
    }

    const tokens = await issueSession({ id: user.id, role: user.role }, { device: req.headers['user-agent'] ?? undefined });
    return reply.send({
      kind: 'AUTHENTICATED',
      session: {
        user: toPublicUser(user),
        accessToken: tokens.accessToken,
        accessExpiresAt: tokens.accessExpiresAt.toISOString(),
        refreshToken: tokens.refreshToken,
        refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
      },
    });
  });

  // ── Step 3 (new users only): finish account creation ────────────────────
  app.post('/register', async (req, reply) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    let phone: string;
    try {
      const claims = await verifyRegistrationToken(parsed.data.registrationToken);
      phone = claims.sub;
    } catch (err) {
      req.log.debug({ err }, 'registration token invalid');
      return reply.code(401).send({ error: 'invalid or expired registration token' });
    }

    // Guard against double-registration.
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) return reply.code(409).send({ error: 'account already exists for this phone' });

    // Resolve optional referrer.
    let referredByUserId: string | undefined;
    if (parsed.data.referralCode) {
      const referrer = await prisma.user.findUnique({ where: { referralCode: parsed.data.referralCode } });
      if (referrer && !referrer.deletedAt) referredByUserId = referrer.id;
      // Silently ignore unknown codes — UX choice; we don't want to block signup on a typo.
    }

    const referralCode = await generateUniqueReferralCode();

    const user = await prisma.user.create({
      data: {
        phone,
        phoneVerified: true,
        fullName: parsed.data.fullName,
        email: parsed.data.email,
        referralCode,
        referredByUserId,
        addresses: parsed.data.defaultAddress
          ? {
              create: {
                label: parsed.data.defaultAddress.label,
                line1: parsed.data.defaultAddress.line1,
                area: parsed.data.defaultAddress.area,
                city: parsed.data.defaultAddress.city ?? 'Nairobi',
                isDefault: true,
              },
            }
          : undefined,
        notificationPrefs: {
          create: [
            { channel: 'PUSH', enabled: true },
            { channel: 'SMS', enabled: true },
            { channel: 'EMAIL', enabled: false },
          ],
        },
      },
    });

    const tokens = await issueSession({ id: user.id, role: user.role }, { device: req.headers['user-agent'] ?? undefined });
    return reply.code(201).send({
      kind: 'AUTHENTICATED',
      session: {
        user: toPublicUser(user),
        accessToken: tokens.accessToken,
        accessExpiresAt: tokens.accessExpiresAt.toISOString(),
        refreshToken: tokens.refreshToken,
        refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
      },
    });
  });

  // ── Refresh ─────────────────────────────────────────────────────────────
  app.post('/refresh', async (req, reply) => {
    const parsed = RefreshSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    try {
      const result = await rotateRefreshToken(parsed.data.refreshToken, { device: req.headers['user-agent'] ?? undefined });
      const user = await prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
      return reply.send({
        user: toPublicUser(user),
        accessToken: result.accessToken,
        accessExpiresAt: result.accessExpiresAt.toISOString(),
        refreshToken: result.refreshToken,
        refreshExpiresAt: result.refreshExpiresAt.toISOString(),
      });
    } catch (err) {
      if (err instanceof RefreshError) {
        // Reuse means session compromise — communicate, don't hide.
        return reply.code(401).send({ error: err.message, code: err.code });
      }
      throw err;
    }
  });

  // ── Logout ──────────────────────────────────────────────────────────────
  app.post('/logout', async (req, reply) => {
    const parsed = LogoutSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    await revokeRefreshToken(parsed.data.refreshToken);
    return reply.send({ ok: true });
  });

  // ── Whoami ──────────────────────────────────────────────────────────────
  app.get('/me', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.auth!.sub;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) return reply.code(404).send({ error: 'user not found' });
    return reply.send({ user: toPublicUser(user) });
  });

};
