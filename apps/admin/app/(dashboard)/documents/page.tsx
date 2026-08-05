'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CompanyDocumentDto, DocumentCategory } from '@onyxhawk/types';

import { api, ApiError } from '../../../src/lib/api';
import { useRequireAdmin } from '../../../src/lib/auth';

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  INCORPORATION: 'Incorporation',
  TAX: 'Tax',
  LICENCE: 'Licence & permit',
  INSURANCE: 'Insurance',
  CONTRACT: 'Contract',
  BANK: 'Banking',
  POLICY: 'Policy',
  MINUTES: 'Minutes & resolutions',
  OTHER: 'Other',
};
const CATEGORIES = Object.keys(CATEGORY_LABELS) as DocumentCategory[];

const input = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';
const btn = 'rounded-lg bg-gold-deep text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50';
const btnGhost = 'rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-cream-deep';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fileSize(bytes: number | null) {
  if (!bytes) return null;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/** Expiry chip — the reason the renewal date is worth capturing at all. */
function ExpiryBadge({ days, date }: { days: number | null; date: string | null }) {
  if (days === null || !date) return null;
  const tone =
    days < 0 ? 'bg-danger/10 text-danger'
      : days <= 30 ? 'bg-warning/15 text-warning'
      : 'bg-success/10 text-success';
  const text =
    days < 0 ? `Expired ${Math.abs(days)}d ago`
      : days === 0 ? 'Expires today'
      : `Expires in ${days}d`;
  return <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`} title={date}>{text}</span>;
}

export default function DocumentsPage() {
  const session = useRequireAdmin();
  const [docs, setDocs] = useState<CompanyDocumentDto[]>([]);
  const [uploadEnabled, setUploadEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    title: '', category: 'OTHER' as DocumentCategory, description: '', link: '', expiresAt: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.documents();
      setDocs(res.documents);
      setUploadEnabled(res.uploadEnabled);
      setForbidden(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(err instanceof ApiError ? `Could not load documents (${err.status}).` : 'Could not load documents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    if (!file && !form.link.trim()) {
      setError('Attach a file or paste a link to the document.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let fileUrl = form.link.trim();
      let isExternal = true;
      let fileName: string | undefined;
      let contentType: string | undefined;
      let sizeBytes: number | undefined;

      if (file) {
        // Presigned PUT: the file goes straight to storage, never through the API.
        const presigned = await api.documentUploadUrl(file.name, file.type || 'application/octet-stream');
        const put = await fetch(presigned.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
        if (!put.ok) throw new Error(`Upload failed (${put.status})`);
        fileUrl = presigned.publicUrl;
        isExternal = false;
        fileName = file.name;
        contentType = file.type || undefined;
        sizeBytes = file.size;
      }

      await api.addDocument({
        title: form.title.trim(),
        category: form.category,
        description: form.description.trim() || undefined,
        fileUrl,
        fileName,
        contentType,
        sizeBytes,
        isExternal,
        expiresAt: form.expiresAt || null,
      });

      setForm({ title: '', category: 'OTHER', description: '', link: '', expiresAt: '' });
      setFile(null);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Could not save document (${err.status}).`
          : err instanceof Error ? err.message : 'Could not save document.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (session === undefined) return <div className="text-charcoal-muted">Loading…</div>;
  if (!session) return null;

  if (forbidden) {
    return (
      <div className="rounded-xl border border-line bg-white p-8 text-center">
        <h1 className="text-2xl" style={{ fontFamily: 'Georgia, serif' }}>Shareholders only</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-charcoal-muted">
          Company documents are visible only to the owner and people on the cap table.
        </p>
      </div>
    );
  }

  // Group by category so the register reads like a filing cabinet.
  const grouped = new Map<DocumentCategory, CompanyDocumentDto[]>();
  for (const d of docs) grouped.set(d.category, [...(grouped.get(d.category) ?? []), d]);

  const expiringSoon = docs.filter((d) => d.daysUntilExpiry !== null && d.daysUntilExpiry <= 30);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl" style={{ fontFamily: 'Georgia, serif' }}>Company documents</h1>
          <p className="mt-1 text-sm text-charcoal-muted">
            Incorporation, tax, licences, insurance and contracts — visible to shareholders only.
          </p>
        </div>
        <button className={btn} onClick={() => { setShowForm((v) => !v); setError(null); }}>
          {showForm ? 'Cancel' : '+ Add document'}
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 underline">Dismiss</button>
        </div>
      )}

      {expiringSoon.length > 0 && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          <span className="font-medium text-warning">
            {expiringSoon.length} document{expiringSoon.length === 1 ? '' : 's'} expiring or expired
          </span>
          <span className="text-charcoal-muted"> — {expiringSoon.map((d) => d.title).join(', ')}</span>
        </div>
      )}

      {showForm && (
        <form onSubmit={(e) => void submit(e)} className="mb-6 grid gap-3 rounded-xl border border-gold-bright/40 bg-gold-bright/[0.06] p-5 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-charcoal-muted">Title</label>
            <input required className={input} value={form.title} placeholder="e.g. Certificate of Incorporation"
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-charcoal-muted">Category</label>
            <select className={input} value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as DocumentCategory }))}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-charcoal-muted">
              {uploadEnabled ? 'Attach a file' : 'File upload unavailable — paste a link below'}
            </label>
            {uploadEnabled ? (
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                className={input}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            ) : (
              <p className="text-xs text-charcoal-muted">
                Object storage is not configured on the API, so files cannot be uploaded yet. Store the document in
                Drive or Dropbox and paste a share link instead.
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-charcoal-muted">
              {uploadEnabled ? '…or paste a link instead' : 'Document link'}
            </label>
            <input type="url" className={input} value={form.link} placeholder="https://…"
              onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))} />
          </div>

          <div>
            <label className="mb-1 block text-xs text-charcoal-muted">Expiry / renewal date (optional)</label>
            <input type="date" className={input} value={form.expiresAt} min={todayIso()}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-charcoal-muted">Notes (optional)</label>
            <input className={input} value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>

          <div className="flex justify-end sm:col-span-2">
            <button type="submit" disabled={saving} className={btn}>
              {saving ? 'Saving…' : 'Save document'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="rounded-xl border border-line bg-white py-10 text-center text-sm text-charcoal-muted">Loading…</div>
      ) : docs.length === 0 ? (
        <div className="rounded-xl border border-line bg-white py-10 text-center text-sm text-charcoal-muted">
          No documents yet. Click <strong>+ Add document</strong> to store your first one.
        </div>
      ) : (
        <div className="space-y-6">
          {CATEGORIES.filter((c) => grouped.has(c)).map((category) => (
            <section key={category}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-charcoal-muted">
                {CATEGORY_LABELS[category]}
              </h2>
              <div className="overflow-hidden rounded-xl border border-line bg-white">
                <ul className="divide-y divide-line">
                  {grouped.get(category)!.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={d.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-charcoal hover:text-bronze hover:underline"
                          >
                            {d.title}
                          </a>
                          <ExpiryBadge days={d.daysUntilExpiry} date={d.expiresAt} />
                          {d.isExternal && (
                            <span className="rounded-full bg-cream-deep px-2 py-0.5 text-xs text-charcoal-muted">Link</span>
                          )}
                        </div>
                        {d.description && <p className="mt-0.5 text-sm text-charcoal-muted">{d.description}</p>}
                        <p className="mt-0.5 text-xs text-charcoal-muted">
                          Added by {d.uploadedByName ?? 'unknown'} · {new Date(d.createdAt).toLocaleDateString('en-KE')}
                          {d.fileName ? ` · ${d.fileName}` : ''}
                          {fileSize(d.sizeBytes) ? ` · ${fileSize(d.sizeBytes)}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className={btnGhost}>Open</a>
                        <button
                          className="text-xs text-danger hover:underline"
                          onClick={async () => {
                            if (!confirm(`Delete "${d.title}"?`)) return;
                            try { await api.deleteDocument(d.id); await load(); }
                            catch { setError('Could not delete document.'); }
                          }}
                        >Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
