import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { NotificationChannel, PointsDirection } from '@prisma/client';
import type {
  ConfirmEmailChangeInput,
  ConfirmEmailChangeResult,
  LoyaltyTier,
  NotificationChannel as NotificationChannelDto,
  NotificationPreferenceDto,
  ProfileOverview,
  RequestEmailChangeInput,
  UpdateNotificationInput,
  UpdateProfileInput,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { EMAIL_SIGN_IN_REQUIRED } from '../auth/adminAccess.js';
import { confirmEmailChange, requestEmailChange, type ConfirmOutcome } from '../auth/emailChange.js';
import type { AccessClaims } from '../auth/jwt.js';
import { requireAuth } from '../auth/middleware.js';
import { OtpError } from '../auth/otp.js';
import { PRIMARY_OWNER_LOCKED, STAFF_ROLES } from '../auth/staff.js';
import { toPublicUser } from '../auth/tokens.js';

const UpdateProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  email: z.string().email().nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
}) satisfies z.ZodType<UpdateProfileInput>;

const UpdateNotificationSchema = z.object({
  channel: z.enum(['PUSH', 'SMS', 'EMAIL']),
  enabled: z.boolean(),
}) satisfies z.ZodType<UpdateNotificationInput>;

const RequestEmailChangeSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
}) satisfies z.ZodType<RequestEmailChangeInput>;

const ConfirmEmailChangeSchema = z.object({
  newCode: z.string().regex(/^\d{6}$/),
  currentCode: z.string().regex(/^\d{6}$/).optional(),
}) satisfies z.ZodType<ConfirmEmailChangeInput>;

const CONFIRM_REFUSALS: Record<Exclude<ConfirmOutcome, { ok: true }>['reason'], [number, string]> = {
  NO_REQUEST: [400, 'That code has expired or been replaced. Ask for a new one.'],
  CURRENT_CODE_REQUIRED: [400, 'Enter the code sent to your current email as well.'],
  WRONG_CODE: [401, 'That code isn’t right. Check it and try again.'],
  TOO_MANY_ATTEMPTS: [429, 'Too many wrong codes. Ask for a new one.'],
  TAKEN: [409, 'That email is already on another account.'],
};

/**
 * Why this account may not change its own sign-in email, or null. Only staff
 * use this flow (customers edit their email directly), never the primary owner
 * (by script only), and only from a session that began with an email code: a
 * phone alone must not be able to redirect the email that opens the back-office.
 */
function emailChangeRefusal(member: { role: string; isOwner: boolean; isPrimaryOwner: boolean }, auth: AccessClaims) {
  if (!(member.isOwner || STAFF_ROLES.has(member.role as never))) {
    return { status: 403, body: { error: 'Only team members change their sign-in email here.' } };
  }
  if (member.isPrimaryOwner) return { status: 403, body: { error: PRIMARY_OWNER_LOCKED } };
  if (auth.signInMethod !== 'EMAIL') return { status: 403, body: { error: EMAIL_SIGN_IN_REQUIRED, code: 'EMAIL_SIGN_IN_REQUIRED' } };
  return null;
}

const memberSelect = { id: true, phone: true, email: true, fullName: true, role: true, isOwner: true, isPrimaryOwner: true } as const;

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // GET /profile — header card data for mockup 13.
  app.get('/', async (req, reply) => {
    const userId = req.auth!.sub;

    const [user, balanceRows, bookingsCount] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.hawkPointsLedger.groupBy({
        by: ['direction'],
        where: { userId },
        _sum: { points: true },
      }),
      prisma.booking.count({ where: { userId } }),
    ]);
    if (!user || user.deletedAt) return reply.code(404).send({ error: 'user not found' });

    let credit = 0;
    let debit = 0;
    for (const row of balanceRows) {
      if (row.direction === PointsDirection.CREDIT) credit = row._sum.points ?? 0;
      if (row.direction === PointsDirection.DEBIT) debit = row._sum.points ?? 0;
    }

    const overview: ProfileOverview = {
      user: toPublicUser(user),
      tier: user.tier as LoyaltyTier,
      pointsBalance: credit - debit,
      lifetimeEarnedPoints: user.lifetimeEarnedPoints,
      bookingsCount,
      memberSince: user.createdAt.toISOString(),
    };
    return reply.send({ profile: overview });
  });

  // PATCH /profile — edit name / email / avatar.
  app.patch('/', async (req, reply) => {
    const parsed = UpdateProfileSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    // A staff email is the sign-in key, so it changes only on the Team page,
    // which applies the owner rules, signs the account out and tells both
    // addresses. The primary owner's email changes only by script (see
    // DEPLOY.md, "Primary owner"); his name and avatar he may edit here.
    const me = await prisma.user.findUniqueOrThrow({
      where: { id: req.auth!.sub },
      select: { email: true, role: true, isOwner: true, isPrimaryOwner: true },
    });
    const emailChanges = parsed.data.email !== undefined && parsed.data.email?.trim().toLowerCase() !== me.email?.toLowerCase();
    if (emailChanges && me.isPrimaryOwner) return reply.code(403).send({ error: PRIMARY_OWNER_LOCKED });
    if (emailChanges && (me.isOwner || STAFF_ROLES.has(me.role))) {
      return reply.code(403).send({ error: 'Change your sign-in email from your Profile page in the back-office.' });
    }

    // Reject an email already taken by another account.
    if (parsed.data.email) {
      const clash = await prisma.user.findFirst({
        where: { email: parsed.data.email, id: { not: req.auth!.sub } },
        select: { id: true },
      });
      if (clash) return reply.code(409).send({ error: 'email already in use' });
    }

    const user = await prisma.user.update({
      where: { id: req.auth!.sub },
      data: {
        fullName: parsed.data.fullName,
        email: parsed.data.email,
        avatarUrl: parsed.data.avatarUrl,
      },
    });
    return reply.send({ user: toPublicUser(user) });
  });

  // ── A team member changing their own sign-in email (back-office Profile page) ──

  // Step 1: a code to the new address; owners also get one at their current address.
  app.post('/email/request', async (req, reply) => {
    const parsed = RequestEmailChangeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Enter a valid email address.' });
    const newEmail = parsed.data.email;

    const member = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub }, select: memberSelect });
    const refusal = emailChangeRefusal(member, req.auth!);
    if (refusal) return reply.code(refusal.status).send(refusal.body);
    if (newEmail === member.email?.toLowerCase()) return reply.code(400).send({ error: 'That is already your sign-in email.' });
    const taken = await prisma.user.findFirst({
      where: { email: { equals: newEmail, mode: 'insensitive' }, id: { not: member.id } },
      select: { id: true },
    });
    if (taken) return reply.code(409).send({ error: 'That email is already on another account.' });

    try {
      return reply.send(await requestEmailChange(member, newEmail, req.log));
    } catch (err) {
      if (err instanceof OtpError) return reply.code(429).send({ error: err.message, code: err.code });
      throw err;
    }
  });

  // Step 2: the code(s) back. On success the email changes and every session,
  // this one included, is signed out: sign in again with the new address.
  app.post('/email/confirm', async (req, reply) => {
    const parsed = ConfirmEmailChangeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Enter the 6-digit code.' });

    const member = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub }, select: memberSelect });
    const refusal = emailChangeRefusal(member, req.auth!);
    if (refusal) return reply.code(refusal.status).send(refusal.body);

    const outcome = await confirmEmailChange(member, parsed.data, req.log);
    if (outcome.ok) return reply.send({ ok: true, email: outcome.email } satisfies ConfirmEmailChangeResult);
    const [status, error] = CONFIRM_REFUSALS[outcome.reason];
    return reply.code(status).send({ error, code: outcome.reason });
  });

  // GET /profile/notifications — channel preferences.
  app.get('/notifications', async (req, reply) => {
    const prefs = await prisma.notificationPreference.findMany({
      where: { userId: req.auth!.sub },
      orderBy: { channel: 'asc' },
    });
    const dto: NotificationPreferenceDto[] = prefs.map((p) => ({
      channel: p.channel as NotificationChannelDto,
      enabled: p.enabled,
    }));
    return reply.send({ preferences: dto });
  });

  // PATCH /profile/notifications — toggle one channel.
  app.patch('/notifications', async (req, reply) => {
    const parsed = UpdateNotificationSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const pref = await prisma.notificationPreference.upsert({
      where: { userId_channel: { userId: req.auth!.sub, channel: parsed.data.channel as NotificationChannel } },
      create: { userId: req.auth!.sub, channel: parsed.data.channel as NotificationChannel, enabled: parsed.data.enabled },
      update: { enabled: parsed.data.enabled },
    });
    return reply.send({ preference: { channel: pref.channel as NotificationChannelDto, enabled: pref.enabled } });
  });
};
