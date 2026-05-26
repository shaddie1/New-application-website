import { createHash, randomBytes } from 'node:crypto';

/** Deterministic SHA-256 hash, hex-encoded. Used for OTP codes and refresh tokens. */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Crypto-secure random token, URL-safe base64. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
