import { env } from '../env.js';

export interface SmsLogger {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
}

/**
 * Send an SMS via Africa's Talking. In development (or when AT credentials are
 * missing) the message is logged to the server console instead, with the OTP
 * visible so devs can finish the flow without burning SMS credits.
 */
export async function sendSms(to: string, body: string, log: SmsLogger): Promise<void> {
  const credsConfigured = env.AT_USERNAME && env.AT_API_KEY;
  if (!credsConfigured) {
    if (env.NODE_ENV === 'production') {
      throw new Error('SMS provider not configured (AT_USERNAME / AT_API_KEY missing)');
    }
    log.info({ to, body }, '[DEV SMS] (Africa\'s Talking not configured — message logged only)');
    return;
  }

  const form = new URLSearchParams({
    username: env.AT_USERNAME!,
    to,
    message: body,
  });
  // Only claim a sender ID when one is configured (and therefore approved);
  // otherwise Africa's Talking uses its shared default sender.
  const senderId = env.SMS_SENDER_ID?.trim();
  if (senderId) form.set('from', senderId);

  const res = await fetch('https://api.africastalking.com/version1/messaging', {
    method: 'POST',
    headers: {
      apiKey: env.AT_API_KEY!,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '<unreadable body>');
    log.error({ status: res.status, text }, 'Africa\'s Talking SMS send failed');
    throw new Error(`SMS send failed: ${res.status}`);
  }
}
