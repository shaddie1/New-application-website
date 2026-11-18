/**
 * Daraja (Safaricom M-Pesa) STK Push and STK query client.
 *
 * Docs: https://developer.safaricom.co.ke/docs#m-pesa-express
 *
 * The OAuth token is cached in-memory until ~60 seconds before its stated
 * expiry. STK push timestamps and the password are derived per request from
 * the configured shortcode + passkey.
 */
import type {
  MpesaStkQueryRequest,
  MpesaStkQueryResponse,
  MpesaStkRequest,
  MpesaStkResponse,
} from '@onyxhawk/types';

import { env } from '../env.js';

interface CachedToken {
  token: string;
  /** Epoch ms when the token expires (with safety margin already applied). */
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

export class DarajaError extends Error {
  constructor(message: string, public status: number, public payload: unknown) {
    super(message);
    this.name = 'DarajaError';
  }
}

/** Force the cached token to expire — used by tests and the cancel-on-401 path. */
export function _invalidateToken(): void {
  cachedToken = null;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  const basic = Buffer.from(`${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const res = await fetch(`${env.MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    method: 'GET',
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new DarajaError(`oauth token request failed`, res.status, text);
  }
  const body = (await res.json()) as { access_token?: string; expires_in?: string | number };
  if (!body.access_token) {
    throw new DarajaError('oauth response missing access_token', 502, body);
  }
  const ttlSec = Number(body.expires_in ?? 3599);
  cachedToken = {
    token: body.access_token,
    // 60s safety margin so we never present an about-to-expire token.
    expiresAt: Date.now() + (ttlSec - 60) * 1000,
  };
  return cachedToken.token;
}

/**
 * Trigger an STK push. `msisdn` should be E.164 (e.g. +254712480392); Daraja
 * wants it without the leading +.
 */
export async function stkPush(input: {
  msisdn: string;          // E.164
  amountKes: number;       // whole KES
  accountReference: string;
  transactionDesc: string;
}): Promise<MpesaStkResponse> {
  const token = await getAccessToken();

  const partyA = input.msisdn.replace(/^\+/, '');

  const body: MpesaStkRequest = {
    ...stkCredentials(),
    TransactionType: 'CustomerPayBillOnline',
    Amount: input.amountKes,
    PartyA: partyA,
    PartyB: env.MPESA_SHORTCODE,
    PhoneNumber: partyA,
    CallBackURL: env.MPESA_CALLBACK_URL,
    AccountReference: input.accountReference.slice(0, 12), // Daraja caps this at 12
    TransactionDesc: input.transactionDesc.slice(0, 13),   // and this at 13
  };

  const res = await fetch(`${env.MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    // Token was invalidated server-side — drop cache and force a retry one level up.
    _invalidateToken();
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = await res.text().catch(() => null);
  }

  if (!res.ok) {
    throw new DarajaError(`stk push failed`, res.status, payload);
  }
  return payload as MpesaStkResponse;
}

/**
 * Ask Daraja for the result of an STK push. This, not the callback, is
 * Safaricom's word on whether the customer paid. Before the result is final
 * Daraja answers 500 with errorCode "500.001.1001", which arrives here as a
 * DarajaError carrying that payload.
 */
export async function stkQuery(checkoutRequestId: string): Promise<MpesaStkQueryResponse> {
  const token = await getAccessToken();

  const body: MpesaStkQueryRequest = { ...stkCredentials(), CheckoutRequestID: checkoutRequestId };

  const res = await fetch(`${env.MPESA_BASE_URL}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // The callback waits on this answer; a hung Daraja must not hold it.
    signal: AbortSignal.timeout(10_000),
  });

  if (res.status === 401) _invalidateToken();

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = await res.text().catch(() => null);
  }

  if (!res.ok) {
    throw new DarajaError(`stk query failed`, res.status, payload);
  }
  return payload as MpesaStkQueryResponse;
}

/** Shortcode, timestamp and password, as both STK push and STK query send them. */
function stkCredentials(): Pick<MpesaStkRequest, 'BusinessShortCode' | 'Password' | 'Timestamp'> {
  const timestamp = formatDarajaTimestamp(new Date());
  return {
    BusinessShortCode: env.MPESA_SHORTCODE,
    Password: Buffer.from(`${env.MPESA_SHORTCODE}${env.MPESA_PASSKEY}${timestamp}`).toString('base64'),
    Timestamp: timestamp,
  };
}

/** "YYYYMMDDHHmmss" in Africa/Nairobi (the timezone Daraja expects). */
function formatDarajaTimestamp(d: Date): string {
  // Build the string from individual locale parts so we avoid string-parsing.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '00';
  // The "hour" part can come back as "24" at midnight — normalize to "00".
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}${get('month')}${get('day')}${hour}${get('minute')}${get('second')}`;
}
