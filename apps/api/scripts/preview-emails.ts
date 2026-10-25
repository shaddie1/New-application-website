/**
 * Render every email template with sample data to apps/api/email-previews/,
 * plus an index page showing each at desktop and phone width, so they can be
 * checked in a browser before deploy. Switch the OS to dark mode to see the
 * dark variant. Needs no environment variables or database.
 *
 *   pnpm --filter @onyxhawk/api preview-emails
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { escapeHtml } from '../src/email/format.js';
import {
  adminSignInCodeEmail,
  signInEmailChangedEmail,
  staffRoleChangedEmail,
  staffWelcomeEmail,
  type EmailMessage,
} from '../src/email/templates.js';

const OUT_DIR = fileURLToPath(new URL('../email-previews/', import.meta.url));

const samples: { file: string; title: string; message: EmailMessage }[] = [
  {
    file: 'admin-sign-in-code',
    title: 'Sign-in code (POST /auth/admin/request-otp)',
    // 10 minutes is OTP_TTL_MS in src/auth/otp.ts, which passes its real value.
    message: adminSignInCodeEmail({ code: '482913', expiresInMinutes: 10 }),
  },
  {
    file: 'staff-welcome',
    title: 'You’ve been added (POST /admin/staff, or the new address on an email change)',
    message: staffWelcomeEmail({ fullName: 'Wanjiku Kamau', roleLabel: 'Marketing Personnel', addedBy: 'Shadrack Amihanda' }),
  },
  {
    file: 'staff-welcome-own-email',
    title: 'You’ve been added, with no “added by” (the owner changed their own email)',
    message: staffWelcomeEmail({ fullName: 'Shadrack Amihanda', roleLabel: 'Owner', addedBy: null }),
  },
  {
    file: 'sign-in-email-changed',
    title: 'Sign-in email changed (the old address on PATCH /admin/staff/:id)',
    message: signInEmailChangedEmail({ fullName: 'Wanjiku Kamau', newEmail: 'wanjiku.kamau@example.com' }),
  },
  {
    file: 'staff-role-changed',
    title: 'Role changed (the primary owner moved an owner to a staff role)',
    message: staffRoleChangedEmail({ fullName: 'Zachary Mwangi', oldRoleLabel: 'Owner', newRoleLabel: 'Shareholder', changedBy: 'Shadrack Amihanda' }),
  },
  {
    file: 'escaping-check',
    title: 'Escaping check: names containing markup must show as text',
    message: staffWelcomeEmail({
      fullName: '<script>alert("name")</script> & Co',
      roleLabel: '<b>Admin</b>',
      addedBy: '<img src=x onerror=alert(1)>',
    }),
  },
];

await mkdir(OUT_DIR, { recursive: true });
for (const { file, message } of samples) {
  await writeFile(join(OUT_DIR, `${file}.html`), message.html);
  await writeFile(join(OUT_DIR, `${file}.txt`), `Subject: ${message.subject}\n\n${message.text}`);
}

const sections = samples
  .map(
    ({ file, title, message }) => `
  <section>
    <h2>${escapeHtml(title)}</h2>
    <p class="meta">Subject: <strong>${escapeHtml(message.subject)}</strong> · <a href="${file}.html">Open HTML</a> · <a href="${file}.txt">Plain text</a></p>
    <div class="frames">
      <figure><iframe src="${file}.html" width="640" height="760" title="${escapeHtml(title)}, desktop"></iframe><figcaption>Desktop, 640px</figcaption></figure>
      <figure><iframe src="${file}.html" width="375" height="760" title="${escapeHtml(title)}, phone"></iframe><figcaption>Phone, 375px</figcaption></figure>
    </div>
  </section>`,
  )
  .join('\n');

await writeFile(
  join(OUT_DIR, 'index.html'),
  `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>OnyxHawk email previews</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; color: #16202E; background: #fff; }
  section { margin-bottom: 48px; }
  h2 { font-size: 18px; margin: 0 0 4px; }
  .meta { margin: 0 0 12px; color: #556274; font-size: 14px; }
  .frames { display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start; }
  figure { margin: 0; }
  iframe { border: 1px solid #DCE3EA; border-radius: 8px; background: #fff; }
  figcaption { font-size: 12px; color: #556274; margin-top: 4px; }
</style>
</head>
<body>
<h1>OnyxHawk email previews</h1>
<p>Rendered from <code>apps/api/src/email/templates.ts</code> with sample data. Switch your OS to dark mode and reload to see the dark variant. Real inboxes differ: Gmail strips the dark-mode styles and Outlook ignores some spacing, so send a test to the clients you care about too.</p>
${sections}
</body>
</html>
`,
);

console.log(`Wrote ${samples.length} emails (HTML + plain text) to ${OUT_DIR}`);
console.log(`Open ${pathToFileURL(join(OUT_DIR, 'index.html')).href}`);
