import { html, SafeHtml } from './format.js';

/**
 * The shared layout for every transactional email, in the admin site's look.
 *
 * Hand-written tables with inline styles rather than mjml or react-email: there
 * are three templates, and plain functions keep the API free of a React or
 * mjml build step. The <style> blocks only add what inline styles cannot (dark
 * mode, narrow screens); every email still reads correctly where they are
 * stripped, as Gmail does with the dark-mode query.
 */

// Brand colours from packages/ui-tokens/src/index.ts (the admin Tailwind
// theme). The API cannot load that package at runtime, and email clients
// cannot read CSS variables, so the hex values are copied here. Change both.
const C = {
  navy: '#133A68',
  navyDeep: '#0B2748',
  aquaDeep: '#0F766E',
  aquaSoft: '#E3F5F2',
  aquaLight: '#5EEAD4',
  mist: '#F3F7FA',
  text: '#16202E',
  textMuted: '#556274',
  border: '#DCE3EA',
  white: '#FFFFFF',
  // Dark mode uses the admin's "ink" surfaces.
  ink: '#0B1F38',
  inkRaised: '#0B2748',
  inkBorder: '#24466F',
  textOnDark: '#F3F6FA',
  textOnDarkMuted: '#A9B8CB',
} as const;

// Raleway is the admin's body face; clients that cannot load web fonts fall
// back down the stack. Headings use Georgia, as the admin's do. Family names
// are left unquoted (valid CSS) so they survive HTML escaping untouched.
const SANS = 'Raleway, Segoe UI, Helvetica, Arial, sans-serif';
const SERIF = 'Georgia, Times New Roman, serif';
const MONO = 'SF Mono, Menlo, Consolas, Courier New, monospace';

// Served by the public website (apps/web/public/logo.png). Email clients need
// an absolute HTTPS URL; most refuse data: URIs and none resolve relative paths.
// The square PNG has wide transparent margins, which double as header padding.
export const LOGO_URL = 'https://onyxhawkcleaningservice.com/logo.png';
export const ADMIN_LOGIN_URL = 'https://admin.onyxhawkcleaningservice.com/login';
export const CONTACT_EMAIL = 'info@onyxhawkcleaningservice.com';
export const COMPANY_NAME = 'OnyxHawk Cleaning Services';

// Zero-width filler after the preheader, so the inbox preview stops there
// instead of running on into the heading and body.
const PREHEADER_FILLER = new SafeHtml('&#847;&zwnj;&nbsp;'.repeat(40));

export interface LayoutInput {
  /** Inbox preview line shown after the subject. Lock screens show it too, so never put a code here. */
  preheader: string;
  heading: string;
  body: SafeHtml;
  /** The same content as `body`, as plain text. */
  bodyText: string;
  /** Why the recipient got this email, for the footer. */
  reason: string;
}

export function renderLayout({ preheader, heading, body, bodyText, reason }: LayoutInput): { html: string; text: string } {
  const page = html`<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${heading}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>body, table, td, p, a, h1, span { font-family: Segoe UI, Arial, sans-serif !important; }</style>
<![endif]-->
<!--[if !mso]><!-->
<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;700&amp;display=swap" rel="stylesheet">
<!--<![endif]-->
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
  @media only screen and (max-width: 620px) {
    .oh-card { padding: 28px 20px !important; }
    .oh-heading { font-size: 24px !important; }
    .oh-code { font-size: 30px !important; letter-spacing: 8px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .oh-canvas { background-color: ${C.ink} !important; }
    .oh-card { background-color: ${C.inkRaised} !important; border-color: ${C.inkBorder} !important; }
    .oh-text { color: ${C.textOnDark} !important; }
    .oh-muted { color: ${C.textOnDarkMuted} !important; }
    .oh-link, .oh-accent { color: ${C.aquaLight} !important; }
    .oh-code-box { background-color: ${C.ink} !important; border-color: ${C.inkBorder} !important; }
    .oh-code { color: ${C.aquaLight} !important; }
    .oh-button-cell { background-color: ${C.aquaLight} !important; }
    .oh-button { color: ${C.navyDeep} !important; }
  }
</style>
<!-- Outlook.com dark mode marks the elements it recolours. Kept in its own block
     because a client that rejects the attribute selectors drops the whole block. -->
<style>
  [data-ogsc] .oh-text { color: ${C.textOnDark} !important; }
  [data-ogsc] .oh-muted { color: ${C.textOnDarkMuted} !important; }
  [data-ogsc] .oh-link, [data-ogsc] .oh-accent, [data-ogsc] .oh-code { color: ${C.aquaLight} !important; }
  [data-ogsb] .oh-card { background-color: ${C.inkRaised} !important; }
  [data-ogsb] .oh-code-box { background-color: ${C.ink} !important; }
</style>
</head>
<body class="oh-canvas" style="margin:0;padding:0;background-color:${C.mist};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;mso-hide:all;opacity:0;color:transparent;font-size:1px;line-height:1px;">${preheader}${PREHEADER_FILLER}</div>
<table role="presentation" class="oh-canvas" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.mist}" style="background-color:${C.mist};">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:separate;">
        <tr>
          <td align="center" bgcolor="${C.navy}" style="background-color:${C.navy};border-radius:12px 12px 0 0;padding:0 24px;">
            <img src="${LOGO_URL}" width="150" height="150" alt="OnyxHawk Cleaning Service" style="display:block;width:150px;height:150px;border:0;color:${C.white};font-family:${SANS};font-size:18px;font-weight:700;">
          </td>
        </tr>
        <tr>
          <td class="oh-card" bgcolor="${C.white}" style="background-color:${C.white};border:1px solid ${C.border};border-top:0;border-radius:0 0 12px 12px;padding:36px 40px;">
            <h1 class="oh-heading oh-text" style="margin:0 0 20px;font-family:${SERIF};font-size:28px;line-height:1.25;font-weight:normal;color:${C.text};">${heading}<span class="oh-accent" style="color:${C.aquaDeep};font-style:italic;">.</span></h1>
            ${body}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 24px 8px;">
            <p class="oh-muted" style="margin:0 0 4px;font-family:${SANS};font-size:12px;line-height:1.6;font-weight:700;color:${C.textMuted};">${COMPANY_NAME}</p>
            <p class="oh-muted" style="margin:0 0 4px;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.textMuted};">${reason}</p>
            <p class="oh-muted" style="margin:0;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.textMuted};">Questions? ${link(CONTACT_EMAIL, `mailto:${CONTACT_EMAIL}`)}</p>
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>
`;

  const text = [heading, '', bodyText.trim(), '', '—', COMPANY_NAME, reason, `Questions? ${CONTACT_EMAIL}`, ''].join('\n');
  return { html: page.value, text };
}

/** A body paragraph. Strings are escaped; pass an `html` fragment for inline markup. */
export function paragraph(content: string | SafeHtml): SafeHtml {
  return html`<p class="oh-text" style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.6;color:${C.text};">${content}</p>`;
}

/** Smaller, muted text for asides. */
export function finePrint(content: string | SafeHtml): SafeHtml {
  return html`<p class="oh-muted" style="margin:0 0 12px;font-family:${SANS};font-size:14px;line-height:1.6;color:${C.textMuted};">${content}</p>`;
}

export function strong(content: string): SafeHtml {
  return html`<strong style="font-weight:700;">${content}</strong>`;
}

export function link(label: string, href: string): SafeHtml {
  return html`<a href="${href}" class="oh-link" style="color:${C.aquaDeep};text-decoration:underline;word-break:break-all;">${label}</a>`;
}

/**
 * A one-time code, large and spaced. The spacing is letter-spacing, not spaces,
 * so selecting and copying it gives the bare digits. The extra left padding
 * balances the letter-spacing after the last digit, keeping it centred.
 */
export function codeBlock(code: string): SafeHtml {
  return html`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;border-collapse:separate;">
  <tr>
    <td align="center" class="oh-code-box" bgcolor="${C.aquaSoft}" style="background-color:${C.aquaSoft};border:1px solid ${C.aquaSoft};border-radius:10px;padding:20px 12px 20px 24px;">
      <span class="oh-code" style="font-family:${MONO};font-size:36px;line-height:44px;font-weight:700;letter-spacing:12px;color:${C.navyDeep};mso-line-height-rule:exactly;">${code}</span>
    </td>
  </tr>
</table>`;
}

/** A button the table cell paints, so Outlook, which ignores padding on links, still shows it. */
export function button(label: string, href: string): SafeHtml {
  return html`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr>
    <td align="center" class="oh-button-cell" bgcolor="${C.navy}" style="background-color:${C.navy};border-radius:8px;">
      <a href="${href}" target="_blank" class="oh-button" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:16px;line-height:20px;font-weight:700;color:${C.white};text-decoration:none;border-radius:8px;">${label}</a>
    </td>
  </tr>
</table>`;
}
