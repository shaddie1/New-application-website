import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// scrypt is in Node's standard library, so staff passwords need no native
// dependency. N=2^15 is the usual interactive-login cost.
const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELISATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// 128 * N * r is exactly 32 MiB here, which bumps against Node's default
// maxmem — without headroom scrypt throws "memory limit exceeded".
const OPTIONS: ScryptOptions = {
  N: COST,
  r: BLOCK_SIZE,
  p: PARALLELISATION,
  maxmem: 64 * 1024 * 1024,
};

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, OPTIONS, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export const MIN_PASSWORD_LENGTH = 10;

/** Hash a password for storage. Format: scrypt$<saltHex>$<keyHex>. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

/**
 * Check a password against a stored hash. Always compares in constant time, and
 * returns false (rather than throwing) for malformed or legacy hashes.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;

  const expected = Buffer.from(keyHex, 'hex');
  if (expected.length !== KEY_LENGTH) return false;

  const actual = await derive(password, Buffer.from(saltHex, 'hex'));
  return timingSafeEqual(actual, expected);
}
