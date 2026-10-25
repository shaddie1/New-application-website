import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

const mkdir = vi.fn();
const writeFile = vi.fn();
vi.mock('node:fs/promises', () => ({ mkdir, writeFile }));

const { env } = await import('../env.js');
const { EmailDeliveryError, PREVIEW_DIR, sendEmail, trySendEmail } = await import('./service.js');
const { adminSignInCodeEmail } = await import('./templates.js');

const CODE = '482913';
const API_KEY = 're_live_secret_key';
const message = adminSignInCodeEmail({ code: CODE, expiresInMinutes: 10 });

function captureLog() {
  const lines: { level: 'info' | 'error'; obj: object; msg?: string }[] = [];
  return {
    lines,
    info: (obj: object, msg?: string) => lines.push({ level: 'info', obj, msg }),
    error: (obj: object, msg?: string) => lines.push({ level: 'error', obj, msg }),
    /** Everything logged, for checking that secrets never appear. */
    dump: () => JSON.stringify(lines),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('outside production', () => {
  it('writes a preview instead of sending, and logs only where it went', async () => {
    const log = captureLog();
    await sendEmail('jane@onyxhawk.co.ke', message, log, { staffId: 'u1' });

    expect(send).not.toHaveBeenCalled();
    const [htmlPath, html] = writeFile.mock.calls[0]!;
    expect(htmlPath).toMatch(/admin-sign-in-code\.html$/);
    expect(String(htmlPath).startsWith(PREVIEW_DIR.replace(/[\\/]$/, ''))).toBe(true);
    expect(html).toBe(message.html);
    expect(writeFile.mock.calls[1]![1]).toContain(message.text);

    expect(log.lines).toEqual([
      expect.objectContaining({ level: 'info', obj: expect.objectContaining({ staffId: 'u1', template: 'admin-sign-in-code', preview: htmlPath }) }),
    ]);
    expect(log.dump()).not.toContain(CODE);
  });
});

describe('in production', () => {
  const saved = { NODE_ENV: env.NODE_ENV, RESEND_API_KEY: env.RESEND_API_KEY, EMAIL_FROM_ADDRESS: env.EMAIL_FROM_ADDRESS };
  beforeEach(() => {
    Object.assign(env, { NODE_ENV: 'production', RESEND_API_KEY: API_KEY, EMAIL_FROM_ADDRESS: 'noreply@onyxhawkcleaningservice.com' });
  });
  afterEach(() => {
    Object.assign(env, saved);
  });

  it('sends the HTML and plain-text versions through Resend', async () => {
    send.mockResolvedValue({ data: { id: 'email_1' }, error: null });
    await sendEmail('jane@onyxhawk.co.ke', message, captureLog());

    expect(send).toHaveBeenCalledWith({
      from: 'OnyxHawk <noreply@onyxhawkcleaningservice.com>',
      to: 'jane@onyxhawk.co.ke',
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('throws when Resend refuses, logging enough to debug but never the code, subject or key', async () => {
    send.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'The onyxhawkcleaningservice.com domain is not verified.', statusCode: 403 },
    });
    const log = captureLog();

    const failure = sendEmail('jane@onyxhawk.co.ke', message, log, { staffId: 'u1' });
    await expect(failure).rejects.toBeInstanceOf(EmailDeliveryError);
    await expect(failure).rejects.toThrow(/^Email not delivered: The onyxhawkcleaningservice\.com domain is not verified\.$/);

    expect(log.lines).toEqual([
      {
        level: 'error',
        msg: 'Email not sent',
        obj: {
          staffId: 'u1',
          template: 'admin-sign-in-code',
          to: 'j**e@onyxhawk.co.ke',
          provider: { name: 'validation_error', message: 'The onyxhawkcleaningservice.com domain is not verified.', statusCode: 403 },
        },
      },
    ]);
    for (const secret of [CODE, message.subject, API_KEY]) expect(log.dump()).not.toContain(secret);
  });

  it('throws the same way when Resend cannot be reached', async () => {
    send.mockRejectedValue(new TypeError('fetch failed'));
    const log = captureLog();

    await expect(sendEmail('jane@onyxhawk.co.ke', message, log)).rejects.toThrow('Email not delivered: fetch failed');
    expect(log.lines[0]).toMatchObject({ level: 'error', obj: { provider: { name: 'TypeError', message: 'fetch failed' } } });
  });

  it('trySendEmail reports failure instead of throwing', async () => {
    send.mockResolvedValueOnce({ data: null, error: { name: 'rate_limit_exceeded', message: 'Too many requests', statusCode: 429 } });
    await expect(trySendEmail('jane@onyxhawk.co.ke', message, captureLog())).resolves.toBe(false);

    send.mockRejectedValueOnce(new Error('socket hang up'));
    await expect(trySendEmail('jane@onyxhawk.co.ke', message, captureLog())).resolves.toBe(false);

    send.mockResolvedValueOnce({ data: { id: 'email_2' }, error: null });
    await expect(trySendEmail('jane@onyxhawk.co.ke', message, captureLog())).resolves.toBe(true);
  });
});
