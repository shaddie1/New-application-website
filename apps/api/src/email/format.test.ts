import { describe, expect, it } from 'vitest';

import { escapeHtml, html, maskEmail, SafeHtml } from './format.js';

describe('escapeHtml', () => {
  it('escapes the five characters that matter in text and attributes', () => {
    expect(escapeHtml(`<a href="x" title='y'>Tom & Jerry</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;Tom &amp; Jerry&lt;/a&gt;',
    );
  });
});

describe('html', () => {
  it('escapes every interpolated value', () => {
    const name = '<script>alert(1)</script>';
    expect(html`<p>Hi ${name}</p>`.value).toBe('<p>Hi &lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it('escapes values inside attributes so they cannot break out', () => {
    const href = '" onclick="steal()';
    expect(html`<a href="${href}">x</a>`.value).toBe('<a href="&quot; onclick=&quot;steal()">x</a>');
  });

  it('inserts nested fragments as markup, and joins arrays', () => {
    const bold = html`<b>${'A & B'}</b>`;
    expect(html`<p>${bold}</p>`.value).toBe('<p><b>A &amp; B</b></p>');
    expect(html`<ul>${['<1>', html`<li>2</li>`]}</ul>`.value).toBe('<ul>&lt;1&gt;<li>2</li></ul>');
  });

  it('renders nothing for null, undefined and false, but keeps 0', () => {
    expect(html`[${null}${undefined}${false}${0}]`.value).toBe('[0]');
  });

  it('returns SafeHtml', () => {
    expect(html`x`).toBeInstanceOf(SafeHtml);
  });
});

describe('maskEmail', () => {
  it('masks the middle of a long local part', () => {
    expect(maskEmail('olive.ceo@onyxhawk.co.ke')).toBe('o*******o@onyxhawk.co.ke');
  });

  it('keeps the domain fully visible', () => {
    expect(maskEmail('jane@onyxhawk.co.ke')).toContain('@onyxhawk.co.ke');
  });

  it('handles a very short local part without negative-length stars', () => {
    expect(maskEmail('ab@x.com')).toBe('a***@x.com');
    expect(maskEmail('a@x.com')).toBe('a***@x.com');
  });

  it('caps the mask at 7 stars for long local parts', () => {
    const masked = maskEmail('a.very.long.local.part@example.com');
    expect(masked).toMatch(/^a\*{7}t@example\.com$/);
  });

  it('falls back to *** for something with no @', () => {
    expect(maskEmail('not-an-email')).toBe('***');
  });
});
