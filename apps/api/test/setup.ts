/**
 * Test environment. src/env.ts parses process.env at import time and calls
 * process.exit(1) when required vars are missing — so we populate just enough
 * here for the modules under test to import cleanly. These are dummy values;
 * the M-Pesa tests mock `fetch`, so no real network/credentials are used.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/onyxhawk_test';
process.env.JWT_SECRET ??= 'test-jwt-secret-that-is-at-least-32-characters-long';

process.env.MPESA_BASE_URL ??= 'https://sandbox.safaricom.co.ke';
process.env.MPESA_CONSUMER_KEY ??= 'test-consumer-key';
process.env.MPESA_CONSUMER_SECRET ??= 'test-consumer-secret';
process.env.MPESA_SHORTCODE ??= '174379';
process.env.MPESA_PASSKEY ??= 'test-passkey';
process.env.MPESA_CALLBACK_URL ??= 'https://example.com/webhooks/mpesa';
