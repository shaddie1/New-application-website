import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resend } from 'resend';

import { env } from '../env.js';
import { maskEmail } from './format.js';
import type { EmailMessage, EmailTemplate } from './templates.js';

export interface EmailLogger {
  info: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
}

/** Extra log fields naming the record an email is about, e.g. `{ staffId }`. */
type LogContext = Record<string, unknown>;

export class EmailDeliveryError extends Error {
  constructor(
    readonly template: EmailTemplate,
    providerMessage: string,
  ) {
    // The admin login page keys off the "Email" prefix: it keeps the code box
    // open, because the code was saved and can be issued another way.
    super(`Email not delivered: ${providerMessage}`);
    this.name = 'EmailDeliveryError';
  }
}

/** Outside production nothing is sent; each email is written here instead (apps/api/email-previews/sent). */
export const PREVIEW_DIR = fileURLToPath(new URL('../../email-previews/sent/', import.meta.url));

let resend: Resend | undefined;

/**
 * The one place email leaves the API. In production it goes through Resend;
 * anywhere else it is written to PREVIEW_DIR and only the file's path is logged.
 *
 * Throws EmailDeliveryError, after logging, when Resend refuses the email or
 * cannot be reached. Logs never include the subject or body (sign-in codes are
 * in both) or the API key.
 */
export async function sendEmail(to: string, message: EmailMessage, log: EmailLogger, context: LogContext = {}): Promise<void> {
  if (env.NODE_ENV !== 'production') {
    const preview = await writePreview(message);
    log.info({ ...context, template: message.template, to, preview }, '[DEV EMAIL] not sent outside production; preview written');
    return;
  }

  let failure: { name: string; message: string; statusCode?: number | null } | null = null;
  try {
    // env.ts refuses to start in production without both Resend variables.
    resend ??= new Resend(env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: `OnyxHawk <${env.EMAIL_FROM_ADDRESS}>`,
      to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    failure = error;
  } catch (err) {
    failure = err instanceof Error ? { name: err.name, message: err.message } : { name: 'Error', message: String(err) };
  }

  if (failure) {
    log.error(
      {
        ...context,
        template: message.template,
        to: maskEmail(to),
        provider: { name: failure.name, message: failure.message, statusCode: failure.statusCode ?? null },
      },
      'Email not sent',
    );
    throw new EmailDeliveryError(message.template, failure.message);
  }
}

/**
 * sendEmail for notices that follow a saved change. Never throws, so a failed
 * email cannot fail or roll back the request; returns whether it went out.
 */
export async function trySendEmail(to: string, message: EmailMessage, log: EmailLogger, context: LogContext = {}): Promise<boolean> {
  try {
    await sendEmail(to, message, log, context);
    return true;
  } catch (err) {
    // sendEmail has already logged delivery failures; anything else (a preview write) is logged here.
    if (!(err instanceof EmailDeliveryError)) log.error({ ...context, template: message.template, err }, 'Email not sent');
    return false;
  }
}

async function writePreview(message: EmailMessage): Promise<string> {
  await mkdir(PREVIEW_DIR, { recursive: true });
  const base = join(PREVIEW_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}-${message.template}`);
  await writeFile(`${base}.html`, message.html);
  await writeFile(`${base}.txt`, `Subject: ${message.subject}\n\n${message.text}`);
  return `${base}.html`;
}
