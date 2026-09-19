import { Resend } from 'resend';

import { env } from '../env.js';
import type { SmsLogger } from './sms.js';

/**
 * Send a transactional email through Resend. In development (or when the API
 * key is missing) the message is logged instead, with the OTP visible, so the
 * flow can be finished without a verified sending domain.
 *
 * One-time setup outside the code: the domain of EMAIL_FROM_ADDRESS must be
 * verified in Resend (its SPF and DKIM records added to the domain's DNS),
 * otherwise the codes go to spam or are refused.
 */
export async function sendEmail(
  to: string,
  message: { subject: string; text: string; html?: string },
  log: SmsLogger,
): Promise<void> {
  const configured = env.RESEND_API_KEY && env.EMAIL_FROM_ADDRESS;
  if (!configured) {
    if (env.NODE_ENV === 'production') {
      throw new Error('Email provider not configured (RESEND_API_KEY / EMAIL_FROM_ADDRESS missing)');
    }
    log.info({ to, subject: message.subject, text: message.text }, '[DEV EMAIL] (Resend not configured — message logged only)');
    return;
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: `OnyxHawk <${env.EMAIL_FROM_ADDRESS}>`,
    to,
    subject: message.subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
  });
  if (error) {
    log.error({ to, error }, 'Resend refused the email');
    throw new Error(`Email not delivered: ${error.message}`);
  }
}

/** "olive.ceo@onyxhawk.co.ke" → "o*******o@onyxhawk.co.ke" — enough to recognise, not enough to leak. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0]}***${domain}`;
  return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 7))}${local[local.length - 1]}${domain}`;
}

export function signInCodeEmail(code: string): { subject: string; text: string; html: string } {
  return {
    subject: `${code} is your OnyxHawk sign-in code`,
    text: `Your OnyxHawk back-office sign-in code is ${code}. It expires in 10 minutes and works once.\n\nIf you did not try to sign in, ignore this email.`,
    html: `<p>Your OnyxHawk back-office sign-in code is</p>
<p style="font-family:ui-monospace,Menlo,monospace;font-size:28px;letter-spacing:0.3em;margin:12px 0">${code}</p>
<p>It expires in 10 minutes and works once.</p>
<p style="color:#5a5348;font-size:13px">If you did not try to sign in, ignore this email.</p>`,
  };
}
