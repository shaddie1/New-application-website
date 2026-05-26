import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env } from '../env.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = 'onyxhawk-api';

export type AccessClaims = JWTPayload & {
  sub: string;
  role: string;
};

export type RegistrationClaims = JWTPayload & {
  sub: string; // phone (E.164)
  purpose: 'REGISTER';
};

export async function signAccessToken(userId: string, role: string): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + parseDurationMs(env.JWT_ACCESS_TTL));
  const token = await new SignJWT({ role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret);
  return { token, expiresAt };
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, secret, { issuer: ISSUER });
  if (typeof payload.sub !== 'string') throw new Error('access token missing sub');
  return payload as AccessClaims;
}

export async function signRegistrationToken(phone: string): Promise<{ token: string; expiresAt: Date }> {
  // Short-lived (5 min) — only used to finish account creation immediately after OTP verify.
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const token = await new SignJWT({ purpose: 'REGISTER' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setSubject(phone)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret);
  return { token, expiresAt };
}

export async function verifyRegistrationToken(token: string): Promise<RegistrationClaims> {
  const { payload } = await jwtVerify(token, secret, { issuer: ISSUER });
  if (typeof payload.sub !== 'string' || payload.purpose !== 'REGISTER') {
    throw new Error('not a registration token');
  }
  return payload as RegistrationClaims;
}

/** Tiny duration parser: "15m" | "30d" | "12h" | "45s" → milliseconds. */
function parseDurationMs(input: string): number {
  const m = input.match(/^(\d+)([smhd])$/);
  if (!m) throw new Error(`invalid duration: ${input}`);
  const n = Number(m[1]);
  switch (m[2]) {
    case 's': return n * 1000;
    case 'm': return n * 60_000;
    case 'h': return n * 3_600_000;
    case 'd': return n * 86_400_000;
    default: throw new Error(`invalid duration unit: ${m[2]}`);
  }
}

export const _internal = { parseDurationMs };
