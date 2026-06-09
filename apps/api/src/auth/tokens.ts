import type { Session } from '@onyxhawk/types';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { sha256, randomToken } from './hash.js';
import { signAccessToken } from './jwt.js';

function parseRefreshTtlMs(): number {
  const m = env.JWT_REFRESH_TTL.match(/^(\d+)([smhd])$/);
  if (!m) throw new Error(`invalid JWT_REFRESH_TTL: ${env.JWT_REFRESH_TTL}`);
  const n = Number(m[1]);
  switch (m[2]) {
    case 's': return n * 1000;
    case 'm': return n * 60_000;
    case 'h': return n * 3_600_000;
    case 'd': return n * 86_400_000;
    default: throw new Error(`invalid duration unit: ${m[2]}`);
  }
}

/** Mint a fresh access + refresh pair for a user and persist the refresh row. */
export async function issueSession(
  user: { id: string; role: string },
  opts: { device?: string } = {},
): Promise<{ accessToken: string; accessExpiresAt: Date; refreshToken: string; refreshExpiresAt: Date }> {
  const { token: accessToken, expiresAt: accessExpiresAt } = await signAccessToken(user.id, user.role);

  const refreshToken = randomToken();
  const refreshExpiresAt = new Date(Date.now() + parseRefreshTtlMs());
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      device: opts.device,
      expiresAt: refreshExpiresAt,
    },
  });

  return { accessToken, accessExpiresAt, refreshToken, refreshExpiresAt };
}

/**
 * Rotate a refresh token: validate the supplied one, revoke it, mint a new pair.
 * If the supplied token is already revoked, that's a reuse attempt — revoke
 * all of the user's refresh tokens (assume compromise) and refuse.
 */
export async function rotateRefreshToken(
  presentedRefreshToken: string,
  opts: { device?: string } = {},
): Promise<{ accessToken: string; accessExpiresAt: Date; refreshToken: string; refreshExpiresAt: Date; userId: string }> {
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(presentedRefreshToken) } });

  if (!row) throw new RefreshError('UNKNOWN', 'refresh token not recognised');
  if (row.expiresAt < new Date()) throw new RefreshError('EXPIRED', 'refresh token expired');

  if (row.revokedAt) {
    // Reuse of a revoked token — assume compromise; revoke ALL of this user's refresh tokens.
    await prisma.refreshToken.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new RefreshError('REUSED', 'refresh token reuse detected — all sessions revoked');
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: row.userId } });
  if (user.deletedAt) throw new RefreshError('USER_DISABLED', 'user is deactivated');

  // Revoke the old refresh row and mint a new pair atomically.
  const result = await prisma.$transaction(async (tx) => {
    await tx.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    const { token: accessToken, expiresAt: accessExpiresAt } = await signAccessToken(user.id, user.role);
    const newRefresh = randomToken();
    const newRefreshExpiresAt = new Date(Date.now() + parseRefreshTtlMs());
    await tx.refreshToken.create({
      data: { userId: user.id, tokenHash: sha256(newRefresh), device: opts.device, expiresAt: newRefreshExpiresAt },
    });
    return { accessToken, accessExpiresAt, refreshToken: newRefresh, refreshExpiresAt: newRefreshExpiresAt };
  });

  return { ...result, userId: user.id };
}

/** Revoke a specific refresh token (called on logout). No-op if already revoked or unknown. */
export async function revokeRefreshToken(presentedRefreshToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(presentedRefreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export class RefreshError extends Error {
  constructor(public code: 'UNKNOWN' | 'EXPIRED' | 'REUSED' | 'USER_DISABLED', message: string) {
    super(message);
    this.name = 'RefreshError';
  }
}

/** Project a Prisma User row into the public DTO. */
export function toPublicUser(user: {
  id: string;
  phone: string;
  email: string | null;
  fullName: string;
  role: string;
  isOwner?: boolean;
  avatarUrl: string | null;
}): Session['user'] {
  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    fullName: user.fullName,
    role: user.role as Session['user']['role'],
    isOwner: user.isOwner ?? false,
    avatarUrl: user.avatarUrl,
  };
}
