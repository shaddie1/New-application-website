import { html, maskEmail } from './format.js';
import { ADMIN_LOGIN_URL, button, codeBlock, finePrint, link, paragraph, renderLayout, strong } from './layout.js';

export type EmailTemplate = 'admin-sign-in-code' | 'staff-welcome' | 'sign-in-email-changed';

export interface EmailMessage {
  /** Names the email in logs, which never include the subject or body: sign-in codes are in both. */
  template: EmailTemplate;
  subject: string;
  html: string;
  text: string;
}

const IGNORE_IF_UNEXPECTED = 'If you didn’t request this, ignore this email.';

/** Staff back-office sign-in code (POST /auth/admin/request-otp). */
export function adminSignInCodeEmail({ code, expiresInMinutes }: { code: string; expiresInMinutes: number }): EmailMessage {
  const expiry = `${expiresInMinutes} ${expiresInMinutes === 1 ? 'minute' : 'minutes'}`;
  const { html: page, text } = renderLayout({
    preheader: `Use it to sign in to the OnyxHawk back-office. It expires in ${expiry}.`,
    heading: 'Your sign-in code',
    body: html`${paragraph('Enter this code on the OnyxHawk back-office sign-in page:')}
${codeBlock(code)}
${paragraph(`It expires in ${expiry} and works once.`)}
${finePrint(IGNORE_IF_UNEXPECTED)}`,
    bodyText: [
      'Enter this code on the OnyxHawk back-office sign-in page:',
      '',
      code,
      '',
      `It expires in ${expiry} and works once.`,
      '',
      IGNORE_IF_UNEXPECTED,
    ].join('\n'),
    reason: 'You received this because someone asked for a sign-in code for this address on the OnyxHawk back-office.',
  });
  return { template: 'admin-sign-in-code', subject: `Your OnyxHawk sign-in code: ${code}`, html: page, text };
}

/**
 * Sent when the owner adds someone to the team, and to the new address when a
 * member's sign-in email changes. `addedBy` is null when unknown, or when the
 * owner changed their own email.
 */
export function staffWelcomeEmail({
  fullName,
  roleLabel,
  addedBy,
}: {
  fullName: string;
  roleLabel: string;
  addedBy: string | null;
}): EmailMessage {
  const intro = addedBy
    ? html`${addedBy} has added you to the OnyxHawk platform as ${strong(roleLabel)}.`
    : html`You’ve been added to the OnyxHawk platform as ${strong(roleLabel)}.`;
  const introText = addedBy
    ? `${addedBy} has added you to the OnyxHawk platform as ${roleLabel}.`
    : `You’ve been added to the OnyxHawk platform as ${roleLabel}.`;
  const howToSignIn = 'Sign in with this email address and we’ll send you a 6-digit code. There’s no password to remember.';

  const { html: page, text } = renderLayout({
    preheader: `You can now sign in to the OnyxHawk back-office as ${roleLabel}.`,
    heading: 'Welcome to the team',
    body: html`${paragraph(`Hi ${fullName},`)}
${paragraph(intro)}
${paragraph(howToSignIn)}
${button('Sign in to OnyxHawk', ADMIN_LOGIN_URL)}
${finePrint(html`Button not working? Open ${link(ADMIN_LOGIN_URL, ADMIN_LOGIN_URL)}`)}`,
    bodyText: [`Hi ${fullName},`, '', introText, '', howToSignIn, '', `Sign in: ${ADMIN_LOGIN_URL}`].join('\n'),
    reason: 'You received this because this address was set as the sign-in email for an OnyxHawk team account.',
  });
  return { template: 'staff-welcome', subject: 'You’ve been added to the OnyxHawk platform', html: page, text };
}

/** Security notice to a member's previous address after their sign-in email changes. Shows the new address masked. */
export function signInEmailChangedEmail({ fullName, newEmail }: { fullName: string; newEmail: string }): EmailMessage {
  const masked = maskEmail(newEmail);
  const contactOwner = 'If this wasn’t expected, contact the owner.';

  const { html: page, text } = renderLayout({
    preheader: `Sign-in codes now go to ${masked}.`,
    heading: 'Your sign-in email changed',
    body: html`${paragraph(`Hi ${fullName},`)}
${paragraph(html`The sign-in email for your OnyxHawk account was changed to ${strong(masked)}. Sign-in codes now go there instead of this address.`)}
${paragraph(contactOwner)}`,
    bodyText: [
      `Hi ${fullName},`,
      '',
      `The sign-in email for your OnyxHawk account was changed to ${masked}. Sign-in codes now go there instead of this address.`,
      '',
      contactOwner,
    ].join('\n'),
    reason: 'You received this because this address was the sign-in email for an OnyxHawk account.',
  });
  return { template: 'sign-in-email-changed', subject: 'Your OnyxHawk sign-in email was changed', html: page, text };
}
