import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DarajaError, _invalidateToken, stkPush } from './daraja.js';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Routes oauth vs stkpush by URL; returns the supplied stk response/error. */
function mockDaraja(stk: { status?: number; body: unknown }) {
  const oauthBody = { access_token: 'tok-abc', expires_in: '3599' };
  return vi.fn(async (url: string | URL, _init?: RequestInit): Promise<Response> => {
    const u = String(url);
    if (u.includes('/oauth/')) return jsonResponse(oauthBody);
    if (u.includes('/mpesa/stkpush/')) return jsonResponse(stk.body, stk.status ?? 200);
    throw new Error(`unexpected fetch to ${u}`);
  });
}

const okStk = {
  MerchantRequestID: 'm-1',
  CheckoutRequestID: 'c-1',
  ResponseCode: '0',
  ResponseDescription: 'Success',
  CustomerMessage: 'Success',
};

describe('stkPush', () => {
  beforeEach(() => {
    _invalidateToken();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the Daraja response on success', async () => {
    vi.stubGlobal('fetch', mockDaraja({ body: okStk }));
    const res = await stkPush({
      msisdn: '+254712480392',
      amountKes: 3500,
      accountReference: 'OH-2603-001',
      transactionDesc: 'OnyxHawk clean',
    });
    expect(res).toEqual(okStk);
  });

  it('strips the leading + from the msisdn and caps reference/desc lengths', async () => {
    const fetchMock = mockDaraja({ body: okStk });
    vi.stubGlobal('fetch', fetchMock);

    await stkPush({
      msisdn: '+254712480392',
      amountKes: 3500,
      accountReference: 'OH-2603-001-EXTRA-LONG',
      transactionDesc: 'A very long transaction description',
    });

    const stkCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/mpesa/stkpush/'));
    expect(stkCall).toBeDefined();
    const body = JSON.parse((stkCall![1] as RequestInit).body as string);
    expect(body.PartyA).toBe('254712480392'); // no leading +
    expect(body.PhoneNumber).toBe('254712480392');
    expect(body.AccountReference).toHaveLength(12); // Daraja caps at 12
    expect(body.TransactionDesc).toHaveLength(13); // and 13
    expect(body.Amount).toBe(3500);
  });

  it('caches the OAuth token across calls and re-fetches after invalidation', async () => {
    const fetchMock = mockDaraja({ body: okStk });
    vi.stubGlobal('fetch', fetchMock);

    await stkPush({ msisdn: '+254700000000', amountKes: 100, accountReference: 'r', transactionDesc: 'd' });
    await stkPush({ msisdn: '+254700000000', amountKes: 100, accountReference: 'r', transactionDesc: 'd' });

    const oauthCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes('/oauth/')).length;
    expect(oauthCalls()).toBe(1); // token reused for the 2nd push

    _invalidateToken();
    await stkPush({ msisdn: '+254700000000', amountKes: 100, accountReference: 'r', transactionDesc: 'd' });
    expect(oauthCalls()).toBe(2); // refetched after invalidation
  });

  it('throws a DarajaError when the STK push is rejected', async () => {
    vi.stubGlobal('fetch', mockDaraja({ status: 400, body: { errorMessage: 'Bad Request' } }));
    await expect(
      stkPush({ msisdn: '+254700000000', amountKes: 100, accountReference: 'r', transactionDesc: 'd' }),
    ).rejects.toBeInstanceOf(DarajaError);
  });
});
