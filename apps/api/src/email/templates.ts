import { html, maskEmail } from './format.js';
import { ADMIN_LOGIN_URL, button, codeBlock, finePrint, link, paragraph, renderLayout, strong } from './layout.js';

export type EmailTemplate =
  | 'admin-sign-in-code'
  | 'staff-welcome'
  | 'sign-in-email-changed'
  | 'staff-role-changed'
  | 'email-change-code'
  | 'email-change-approval';

export interface EmailMessage {
  /** Names the email in logs, which never include the subject or body (the body carries sign-in codes). */
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
  // The code stays out of the subject: lock screens and notifications show subjects.
  return { template: 'admin-sign-in-code', subject: 'Your OnyxHawk sign-in code', html: page, text };
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

/** Sent after the primary owner moves an owner to a staff role (Change role on the Team page). */
export function staffRoleChangedEmail({
  fullName,
  oldRoleLabel,
  newRoleLabel,
  changedBy,
}: {
  fullName: string;
  oldRoleLabel: string;
  newRoleLabel: string;
  changedBy: string | null;
}): EmailMessage {
  const change = changedBy
    ? html`${changedBy} changed your role on the OnyxHawk platform from ${oldRoleLabel} to ${strong(newRoleLabel)}.`
    : html`Your role on the OnyxHawk platform changed from ${oldRoleLabel} to ${strong(newRoleLabel)}.`;
  const changeText = changedBy
    ? `${changedBy} changed your role on the OnyxHawk platform from ${oldRoleLabel} to ${newRoleLabel}.`
    : `Your role on the OnyxHawk platform changed from ${oldRoleLabel} to ${newRoleLabel}.`;
  const signedOut = 'You’ve been signed out everywhere. Sign in again with this email address, and the back-office will show what your new role allows.';

  const { html: page, text } = renderLayout({
    preheader: `You are now ${newRoleLabel} on the OnyxHawk platform.`,
    heading: 'Your role changed',
    body: html`${paragraph(`Hi ${fullName},`)}
${paragraph(change)}
${paragraph(signedOut)}
${button('Sign in to OnyxHawk', ADMIN_LOGIN_URL)}
${finePrint(html`Button not working? Open ${link(ADMIN_LOGIN_URL, ADMIN_LOGIN_URL)}`)}`,
    bodyText: [`Hi ${fullName},`, '', changeText, '', signedOut, '', `Sign in: ${ADMIN_LOGIN_URL}`].join('\n'),
    reason: 'You received this because your role on an OnyxHawk team account changed.',
  });
  return {
    template: 'staff-role-changed',
    subject: `Your role on the OnyxHawk platform changed to ${newRoleLabel}`,
    html: page,
    text,
  };
}

/** Code to the new address when a staff member changes their own sign-in email (POST /profile/email/request). */
export function emailChangeCodeEmail({ code, expiresInMinutes }: { code: string; expiresInMinutes: number }): EmailMessage {
  const expiry = `${expiresInMinutes} ${expiresInMinutes === 1 ? 'minute' : 'minutes'}`;
  const notMe = 'If you didn’t ask for this, ignore this email. This address won’t be used.';
  const { html: page, text } = renderLayout({
    preheader: `Use it to confirm your new OnyxHawk sign-in email. It expires in ${expiry}.`,
    heading: 'Confirm your new email',
    body: html`${paragraph('Enter this code on your OnyxHawk profile to make this address your sign-in email:')}
${codeBlock(code)}
${paragraph(`It expires in ${expiry} and works once.`)}
${finePrint(notMe)}`,
    bodyText: [
      'Enter this code on your OnyxHawk profile to make this address your sign-in email:',
      '',
      code,
      '',
      `It expires in ${expiry} and works once.`,
      '',
      notMe,
    ].join('\n'),
    reason: 'You received this because someone asked to make this address the sign-in email for an OnyxHawk team account.',
  });
  return { template: 'email-change-code', subject: 'Confirm your new OnyxHawk sign-in email', html: page, text };
}

/**
 * Code to an owner's current address approving a change of their sign-in
 * email: owners confirm with both this and the code sent to the new address.
 */
export function emailChangeApprovalEmail({
  code,
  expiresInMinutes,
  newEmail,
}: {
  code: string;
  expiresInMinutes: number;
  newEmail: string;
}): EmailMessage {
  const masked = maskEmail(newEmail);
  const expiry = `${expiresInMinutes} ${expiresInMinutes === 1 ? 'minute' : 'minutes'}`;
  const notMe = 'If you didn’t ask for this, don’t share the code. Your email stays as it is. Tell the primary owner.';
  const { html: page, text } = renderLayout({
    preheader: `Approve changing your OnyxHawk sign-in email to ${masked}.`,
    heading: 'Approve the change',
    body: html`${paragraph(html`You asked to change your OnyxHawk sign-in email to ${strong(masked)}. To approve it, enter this code on your profile, together with the code sent to the new address:`)}
${codeBlock(code)}
${paragraph(`It expires in ${expiry} and works once.`)}
${finePrint(notMe)}`,
    bodyText: [
      `You asked to change your OnyxHawk sign-in email to ${masked}. To approve it, enter this code on your profile, together with the code sent to the new address:`,
      '',
      code,
      '',
      `It expires in ${expiry} and works once.`,
      '',
      notMe,
    ].join('\n'),
    reason: 'You received this because this is the sign-in email for an OnyxHawk owner account.',
  });
  return { template: 'email-change-approval', subject: 'Approve changing your OnyxHawk sign-in email', html: page, text };
}
