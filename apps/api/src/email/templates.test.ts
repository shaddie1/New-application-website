import { describe, expect, it } from 'vitest';

import { ADMIN_LOGIN_URL, COMPANY_NAME, CONTACT_EMAIL, LOGO_URL } from './layout.js';
import {
  adminSignInCodeEmail,
  emailChangeApprovalEmail,
  emailChangeCodeEmail,
  signInEmailChangedEmail,
  staffRoleChangedEmail,
  staffWelcomeEmail,
  type EmailMessage,
} from './templates.js';

const HOSTILE = '<script>alert("x")</script> & Co';
const HOSTILE_ESCAPED = '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Co';

/** The hidden inbox-preview line at the top of the body. */
function preheader(message: EmailMessage): string {
  return /<div style="display:none[^>]*>([\s\S]*?)&#847;/.exec(message.html)?.[1] ?? '';
}

const everyTemplate: [string, EmailMessage][] = [
  ['sign-in code', adminSignInCodeEmail({ code: '482913', expiresInMinutes: 10 })],
  ['welcome', staffWelcomeEmail({ fullName: 'Wanjiku Kamau', roleLabel: 'Admin', addedBy: 'Shadrack Amihanda' })],
  ['email changed', signInEmailChangedEmail({ fullName: 'Wanjiku Kamau', newEmail: 'wanjiku@example.com' })],
  ['role changed', staffRoleChangedEmail({ fullName: 'Zachary Mwangi', oldRoleLabel: 'Owner', newRoleLabel: 'Shareholder', changedBy: 'Shadrack Amihanda' })],
  ['email change code', emailChangeCodeEmail({ code: '482913', expiresInMinutes: 10 })],
  ['email change approval', emailChangeApprovalEmail({ code: '482913', expiresInMinutes: 10, newEmail: 'zachary.m@example.com' })],
];

describe.each(everyTemplate)('%s email layout', (_name, message) => {
  it('has the footer: company, why they got it, and a contact address', () => {
    for (const body of [message.html, message.text]) {
      expect(body).toContain(COMPANY_NAME);
      expect(body).toContain('You received this because');
      expect(body).toContain(CONTACT_EMAIL);
    }
    expect(message.html).toContain(`href="mailto:${CONTACT_EMAIL}"`);
  });

  it('loads the logo, and every image, from an absolute HTTPS URL', () => {
    expect(message.html).toContain(`src="${LOGO_URL}"`);
    const sources = [...message.html.matchAll(/<img[^>]*\ssrc="([^"]*)"/g)].map((m) => m[1]);
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) expect(src).toMatch(/^https:\/\//);
  });

  it('is a 600px table layout that declares dark-mode support', () => {
    expect(message.html).toContain('max-width:600px');
    expect(message.html).toContain('role="presentation"');
    expect(message.html).toContain('<meta name="color-scheme" content="light dark">');
    expect(message.html).toContain('@media (prefers-color-scheme: dark)');
  });

  it('has a plain-text version with no markup', () => {
    expect(message.text.length).toBeGreaterThan(0);
    expect(message.text).not.toMatch(/<[a-z][^>]*>/i);
  });
});

describe('adminSignInCodeEmail', () => {
  const message = adminSignInCodeEmail({ code: '482913', expiresInMinutes: 10 });

  it('keeps the code out of the subject, which lock screens show', () => {
    expect(message.subject).toBe('Your OnyxHawk sign-in code');
    expect(message.subject).not.toContain('482913');
    expect(message.template).toBe('admin-sign-in-code');
  });

  it('shows the code large and spaced by letter-spacing, so copying it gives the bare digits', () => {
    const code = /<span class="oh-code" style="([^"]*)">([^<]*)<\/span>/.exec(message.html);
    expect(code?.[2]).toBe('482913');
    expect(code?.[1]).toContain('font-size:36px');
    expect(code?.[1]).toContain('letter-spacing:12px');
    expect(message.text).toContain('\n482913\n');
  });

  it('states the expiry it is given, not a fixed one', () => {
    expect(message.html).toContain('It expires in 10 minutes and works once.');
    expect(message.text).toContain('It expires in 10 minutes and works once.');
    expect(adminSignInCodeEmail({ code: '482913', expiresInMinutes: 15 }).text).toContain('expires in 15 minutes');
    expect(adminSignInCodeEmail({ code: '482913', expiresInMinutes: 1 }).text).toContain('expires in 1 minute and');
  });

  it('tells someone who did not ask to ignore it', () => {
    expect(message.html).toContain('If you didn’t request this, ignore this email.');
    expect(message.text).toContain('If you didn’t request this, ignore this email.');
  });

  it('keeps the code out of the inbox preview line', () => {
    expect(preheader(message)).toContain('expires in 10 minutes');
    expect(preheader(message)).not.toContain('482913');
  });
});

describe('staffWelcomeEmail', () => {
  const message = staffWelcomeEmail({ fullName: 'Wanjiku Kamau', roleLabel: 'Marketing Personnel', addedBy: 'Shadrack Amihanda' });

  it('names the person, their role and who added them', () => {
    expect(message.template).toBe('staff-welcome');
    expect(message.subject).toBe('You’ve been added to the OnyxHawk platform');
    expect(message.html).toContain('Hi Wanjiku Kamau,');
    expect(message.html).toContain('Shadrack Amihanda has added you to the OnyxHawk platform as <strong style="font-weight:700;">Marketing Personnel</strong>.');
    expect(message.text).toContain('Shadrack Amihanda has added you to the OnyxHawk platform as Marketing Personnel.');
  });

  it('links to the admin sign-in page and explains the emailed code', () => {
    expect(message.html).toContain(`href="${ADMIN_LOGIN_URL}"`);
    expect(message.html).toContain('>Sign in to OnyxHawk</a>');
    expect(message.text).toContain(ADMIN_LOGIN_URL);
    for (const body of [message.html, message.text]) {
      expect(body).toContain('Sign in with this email address and we’ll send you a 6-digit code.');
    }
  });

  it('leaves out "added by" when it is not known', () => {
    const anonymous = staffWelcomeEmail({ fullName: 'Shadrack Amihanda', roleLabel: 'Owner', addedBy: null });
    expect(anonymous.text).toContain('You’ve been added to the OnyxHawk platform as Owner.');
    expect(anonymous.text).not.toContain('has added you');
  });

  it('escapes the name, role and adder in the HTML', () => {
    const hostile = staffWelcomeEmail({ fullName: HOSTILE, roleLabel: HOSTILE, addedBy: HOSTILE });
    expect(hostile.html).not.toContain('<script>');
    expect(hostile.html.split(HOSTILE_ESCAPED).length - 1).toBeGreaterThanOrEqual(4); // greeting, adder, role, preheader
    expect(hostile.text).toContain(`Hi ${HOSTILE},`);
  });
});

describe('signInEmailChangedEmail', () => {
  const message = signInEmailChangedEmail({ fullName: 'Wanjiku Kamau', newEmail: 'wanjiku.new@example.com' });

  it('tells the old address where codes now go, masked', () => {
    expect(message.template).toBe('sign-in-email-changed');
    expect(message.subject).toBe('Your OnyxHawk sign-in email was changed');
    for (const body of [message.html, message.text]) {
      expect(body).toContain('w*******w@example.com');
      expect(body).toContain('If this wasn’t expected, contact the owner.');
      expect(body).not.toContain('wanjiku.new@example.com');
    }
    expect(message.text).toContain('The sign-in email for your OnyxHawk account was changed to w*******w@example.com.');
  });

  it('escapes the name in the HTML', () => {
    const hostile = signInEmailChangedEmail({ fullName: HOSTILE, newEmail: 'a@example.com' });
    expect(hostile.html).not.toContain('<script>');
    expect(hostile.html).toContain(`Hi ${HOSTILE_ESCAPED},`);
  });
});

describe('staffRoleChangedEmail', () => {
  const message = staffRoleChangedEmail({ fullName: 'Zachary Mwangi', oldRoleLabel: 'Owner', newRoleLabel: 'Shareholder', changedBy: 'Shadrack Amihanda' });

  it('names the new role in the subject and says who changed it and that they were signed out', () => {
    expect(message.template).toBe('staff-role-changed');
    expect(message.subject).toBe('Your role on the OnyxHawk platform changed to Shareholder');
    expect(message.html).toContain('Hi Zachary Mwangi,');
    expect(message.html).toContain('Shadrack Amihanda changed your role on the OnyxHawk platform from Owner to <strong style="font-weight:700;">Shareholder</strong>.');
    for (const body of [message.html, message.text]) expect(body).toContain('You’ve been signed out everywhere.');
    expect(message.html).toContain(`href="${ADMIN_LOGIN_URL}"`);
  });

  it('leaves out who changed it when unknown', () => {
    const anonymous = staffRoleChangedEmail({ fullName: 'Zachary Mwangi', oldRoleLabel: 'Owner', newRoleLabel: 'Shareholder', changedBy: null });
    expect(anonymous.text).toContain('Your role on the OnyxHawk platform changed from Owner to Shareholder.');
  });

  it('escapes every name and label in the HTML', () => {
    const hostile = staffRoleChangedEmail({ fullName: HOSTILE, oldRoleLabel: HOSTILE, newRoleLabel: HOSTILE, changedBy: HOSTILE });
    expect(hostile.html).not.toContain('<script>');
    expect(hostile.html).toContain(`Hi ${HOSTILE_ESCAPED},`);
  });
});

describe('the email-change codes', () => {
  const code = emailChangeCodeEmail({ code: '482913', expiresInMinutes: 10 });
  const approval = emailChangeApprovalEmail({ code: '615204', expiresInMinutes: 10, newEmail: 'zachary.m@example.com' });

  it('show the code in the body, never in the subject or the preview line', () => {
    for (const [message, digits] of [[code, '482913'], [approval, '615204']] as const) {
      expect(/<span class="oh-code" style="[^"]*">([^<]*)<\/span>/.exec(message.html)?.[1]).toBe(digits);
      expect(message.text).toContain(`\n${digits}\n`);
      expect(message.subject).not.toContain(digits);
      expect(preheader(message)).not.toContain(digits);
    }
    expect(code.subject).toBe('Confirm your new OnyxHawk sign-in email');
    expect(approval.subject).toBe('Approve changing your OnyxHawk sign-in email');
  });

  it("tell the owner's current address where the change is going, masked", () => {
    for (const body of [approval.html, approval.text]) {
      expect(body).toContain('z*******m@example.com');
      expect(body).not.toContain('zachary.m@example.com');
      expect(body).toContain('together with the code sent to the new address');
    }
  });
});
