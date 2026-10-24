'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientSegment, SaveWebsiteJobInput, SiteUpdateStatus, WebsiteJobDto } from '@onyxhawk/types';

import { api, ApiError } from '../../../src/lib/api';
import { useRequireAdmin } from '../../../src/lib/auth';
import { preparePhoto } from '../../../src/lib/photoPrep';

const SEGMENT_LABELS: Record<ClientSegment, string> = {
  RESIDENTIAL: 'Residential',
  COMMERCIAL: 'Commercial',
  MEDICAL: 'Medical',
  DEVELOPER: 'Developer',
};
const SEGMENTS = Object.keys(SEGMENT_LABELS) as ClientSegment[];

// The API enforces the same limits.
const AREA_MAX = 60;
const DESCRIPTION_MAX = 280;
const PHOTOS_MAX = 8;

const input = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm';
const btn = 'rounded-lg bg-navy text-white px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50';
const btnSmall = 'rounded-lg bg-navy text-white px-3 py-1.5 text-xs hover:opacity-90 disabled:opacity-50';
const btnGhost = 'rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-mist disabled:opacity-50';

/** Today on the Nairobi calendar, which is how the API judges "no later than today". */
function nairobiToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }); // YYYY-MM-DD
}

/** "October 2026", from a YYYY-MM-DD date. */
function monthYear(isoDate: string) {
  return new Date(`${isoDate.slice(0, 7)}-01T00:00:00`).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });
}

type Notice = { tone: 'success' | 'warning'; text: string };

/** What staff are told after a change that can reach the live site. */
function siteUpdateNotice(siteUpdate: SiteUpdateStatus): Notice {
  if (siteUpdate === 'queued') return { tone: 'success', text: 'The website will update in about 5 minutes.' };
  if (siteUpdate === 'disabled') {
    return {
      tone: 'warning',
      text: "The change is saved, but the website did not start updating: automatic site updates aren't set up yet.",
    };
  }
  return {
    tone: 'warning',
    text: 'The change is saved, but the website did not start updating, so it does not show this change yet.',
  };
}

function uploadErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.status === 503 ? "Photo uploads aren't set up yet." : `Upload failed (${err.status}).`;
  }
  return err instanceof Error ? err.message : 'Upload failed.';
}

/** A photo in the form: one already saved with the job, or a new one on its way up. */
interface PhotoItem {
  id: string;
  status: 'preparing' | 'uploading' | 'done' | 'failed';
  /** Set once uploaded; the job is saved with these, in list order. */
  objectKey: string | null;
  previewUrl: string | null;
  /** The re-encoded JPEG, kept so a failed upload can be retried. Null for saved photos. */
  blob: Blob | null;
  progress: number;
  error: string | null;
}

let photoSeq = 0;
const nextPhotoId = () => `photo-${++photoSeq}`;

/** Local previews are object URLs; saved photos are plain URLs and need nothing. */
function releasePreviews(items: PhotoItem[]) {
  for (const p of items) if (p.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(p.previewUrl);
}

/**
 * Presigned PUT straight to storage. XHR rather than fetch, because only XHR
 * reports upload progress — which matters on a phone connection.
 */
async function uploadPhoto(blob: Blob, onProgress: (percent: number) => void): Promise<string> {
  const presigned = await api.websiteJobPhotoUploadUrl();
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presigned.uploadUrl);
    xhr.setRequestHeader('Content-Type', 'image/jpeg');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`));
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    xhr.send(blob);
  });
  return presigned.objectKey;
}

const EMPTY_FORM = {
  serviceLineCode: '', clientSegment: '' as '' | ClientSegment, area: '', completedOn: '', description: '',
};
type FormState = typeof EMPTY_FORM;
type FieldErrors = Partial<Record<keyof FormState, string>>;

/** Every field is required, so any saved job can be published. */
function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.serviceLineCode) errors.serviceLineCode = 'Choose the service.';
  if (!form.clientSegment) errors.clientSegment = 'Choose the client type.';
  if (!form.area.trim()) errors.area = 'Enter the neighbourhood or town.';
  if (!form.completedOn) errors.completedOn = 'Enter the date the job was finished.';
  else if (form.completedOn > nairobiToday()) errors.completedOn = "The date can't be later than today.";
  if (!form.description.trim()) errors.description = 'Describe the work.';
  return errors;
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs text-danger">{message}</p> : null;
}

export default function WebsiteJobsPage() {
  const session = useRequireAdmin();
  const [jobs, setJobs] = useState<WebsiteJobDto[]>([]);
  const [serviceLines, setServiceLines] = useState<{ code: string; name: string }[]>([]);
  // Assumed on until the API says otherwise, so the warning never flashes while loading.
  const [uploadEnabled, setUploadEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // The add / edit form. editingId is null while adding a new job.
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photoErrors, setPhotoErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // The ids in `photos`, updated at once, so slow work for a photo that was removed
  // (or whose form was closed) is dropped instead of uploading a photo no job uses.
  const photoIds = useRef(new Set<string>());
  const photosRef = useRef(photos);
  photosRef.current = photos;

  // Leaving the page drops any work still running and frees the previews.
  useEffect(() => () => {
    photoIds.current.clear();
    releasePreviews(photosRef.current);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.websiteJobs();
      setJobs(res.jobs);
      setUploadEnabled(res.uploadEnabled);
      setForbidden(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(err instanceof ApiError ? `Could not load website jobs (${err.status}).` : 'Could not load website jobs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Service is required, so an empty list would block every save — say so.
  useEffect(() => {
    api.serviceLines()
      .then((r) => setServiceLines(r.serviceLines))
      .catch(() => setError('Could not load the service list. Reload the page to try again.'));
  }, []);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((errs) => ({ ...errs, [key]: undefined }));
  };

  const openForm = (job: WebsiteJobDto | null) => {
    releasePreviews(photos);
    setEditingId(job?.id ?? null);
    setForm(
      job
        ? {
            serviceLineCode: job.serviceLineCode,
            clientSegment: job.clientSegment,
            area: job.area,
            completedOn: job.completedOn,
            description: job.description,
          }
        : EMPTY_FORM,
    );
    // Saved photos are kept by sending their object keys back on save.
    const saved = (job?.photos ?? []).map((p): PhotoItem => ({
      id: nextPhotoId(), status: 'done', objectKey: p.objectKey, previewUrl: p.url, blob: null, progress: 100, error: null,
    }));
    photoIds.current = new Set(saved.map((p) => p.id));
    setPhotos(saved);
    setFieldErrors({});
    setPhotoErrors([]);
    setError(null);
    setNotice(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeForm = () => {
    // The ref, not `photos`: after a save's await, `photos` is the list from before it.
    releasePreviews(photosRef.current);
    photoIds.current.clear();
    setShowForm(false);
    setEditingId(null);
    setPhotos([]);
  };

  /** Does nothing once the photo is removed, so a late upload result is ignored. */
  const patchPhoto = (id: string, patch: Partial<PhotoItem>) => {
    if (!photoIds.current.has(id)) return;
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const upload = async (id: string, blob: Blob) => {
    patchPhoto(id, { status: 'uploading', progress: 0, error: null });
    try {
      const objectKey = await uploadPhoto(blob, (progress) => patchPhoto(id, { progress }));
      patchPhoto(id, { status: 'done', objectKey });
    } catch (err) {
      // Storage was switched off after the page loaded.
      if (err instanceof ApiError && err.status === 503) setUploadEnabled(false);
      patchPhoto(id, { status: 'failed', error: uploadErrorMessage(err) });
    }
  };

  const addPhotos = async (files: File[]) => {
    setPhotoErrors([]);
    const added = files.map((file) => ({ id: nextPhotoId(), file }));
    for (const { id } of added) photoIds.current.add(id);
    setPhotos((prev) => [
      ...prev,
      ...added.map(({ id }): PhotoItem => ({
        id, status: 'preparing', objectKey: null, previewUrl: null, blob: null, progress: 0, error: null,
      })),
    ]);

    // One at a time: decoding several 12-megapixel photos at once can exhaust a
    // phone's memory. Uploads are not awaited, so a slow one holds up nothing.
    // A photo removed (or its form closed) before or during its turn is skipped.
    for (const { id, file } of added) {
      if (!photoIds.current.has(id)) continue;
      let blob: Blob;
      try {
        blob = await preparePhoto(file);
      } catch (err) {
        if (!photoIds.current.has(id)) continue;
        // Left out of the job entirely: there is nothing the website could show.
        photoIds.current.delete(id);
        setPhotos((prev) => prev.filter((p) => p.id !== id));
        setPhotoErrors((prev) => [
          ...prev,
          `${file.name}: ${err instanceof Error ? err.message : "Can't read this photo. Use a JPEG instead."}`,
        ]);
        continue;
      }
      if (!photoIds.current.has(id)) continue;
      patchPhoto(id, { blob, previewUrl: URL.createObjectURL(blob) });
      void upload(id, blob);
    }
  };

  const movePhoto = (id: string, by: -1 | 1) =>
    setPhotos((prev) => {
      const from = prev.findIndex((p) => p.id === id);
      const a = prev[from];
      const b = prev[from + by];
      if (!a || !b) return prev;
      const next = [...prev];
      next[from] = b;
      next[from + by] = a;
      return next;
    });

  const removePhoto = (photo: PhotoItem) => {
    releasePreviews([photo]);
    photoIds.current.delete(photo.id);
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
  };

  // Why Save is disabled, said next to it. Missing fields are reported on submit instead.
  const saveBlocker =
    photos.some((p) => p.status === 'preparing' || p.status === 'uploading') ? 'Wait for the photos to finish uploading.'
    : photos.some((p) => p.status === 'failed') ? 'Retry or remove the photos that failed.'
    : photos.length === 0 ? 'Add at least one photo.'
    : photos.length > PHOTOS_MAX ? `Up to ${PHOTOS_MAX} photos. Remove ${photos.length - PHOTOS_MAX}.`
    : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validate(form);
    setFieldErrors(errors);
    const { clientSegment } = form;
    if (Object.keys(errors).length > 0 || saveBlocker || !clientSegment) return;

    const body: SaveWebsiteJobInput = {
      serviceLineCode: form.serviceLineCode,
      clientSegment,
      area: form.area.trim(),
      completedOn: form.completedOn,
      description: form.description.trim(),
      photoKeys: photos.flatMap((p) => (p.objectKey ? [p.objectKey] : [])),
    };

    setSaving(true);
    setError(null);
    try {
      const res = editingId ? await api.updateWebsiteJob(editingId, body) : await api.createWebsiteJob(body);
      closeForm();
      // siteUpdate is null only when the job is unpublished, so the live site is untouched.
      setNotice(
        res.siteUpdate
          ? siteUpdateNotice(res.siteUpdate)
          : { tone: 'success', text: 'Saved. The job stays off the website until you publish it.' },
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? `Could not save the job (${err.status}).` : 'Could not save the job.');
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (job: WebsiteJobDto) => {
    const action = job.publishedAt ? 'unpublish' : 'publish';
    setBusyId(job.id);
    setError(null);
    setNotice(null);
    try {
      const res = job.publishedAt ? await api.unpublishWebsiteJob(job.id) : await api.publishWebsiteJob(job.id);
      setJobs((prev) => prev.map((j) => (j.id === res.job.id ? res.job : j)));
      if (res.siteUpdate) setNotice(siteUpdateNotice(res.siteUpdate));
    } catch (err) {
      setError(err instanceof ApiError ? `Could not ${action} the job (${err.status}).` : `Could not ${action} the job.`);
    } finally {
      setBusyId(null);
    }
  };

  if (session === undefined) return <div className="text-charcoal-muted">Loading…</div>;
  if (!session) return null;

  if (forbidden) {
    return (
      <div className="rounded-xl border border-line bg-white p-8 text-center">
        <h1 className="text-2xl" style={{ fontFamily: 'Georgia, serif' }}>No access</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-charcoal-muted">
          Website jobs are managed by the owner, admins and marketing. Ask one of them to add or publish a job.
        </p>
      </div>
    );
  }

  const today = nairobiToday();
  const serviceName = (code: string) => serviceLines.find((l) => l.code === code)?.name ?? code;
  // A job saved under a service since retired from the catalog keeps it selectable.
  const serviceRetired = form.serviceLineCode !== '' && !serviceLines.some((l) => l.code === form.serviceLineCode);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl" style={{ fontFamily: 'Georgia, serif' }}>Website jobs</h1>
          <p className="mt-1 text-sm text-charcoal-muted">
            Finished jobs shown on the website under Our work. A new job stays off the website until you publish it.
          </p>
        </div>
        {/* Locked while saving: the save closes the form when it finishes. */}
        <button className={btn} disabled={saving} onClick={() => (showForm ? closeForm() : openForm(null))}>
          {showForm ? 'Cancel' : '+ Add job'}
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 underline">Dismiss</button>
        </div>
      )}

      {notice && (
        <div
          className={`mb-4 flex items-start justify-between gap-4 rounded-lg px-4 py-3 text-sm ${
            notice.tone === 'success' ? 'bg-success/10 text-success' : 'border border-warning/30 bg-warning/10 text-warning'
          }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="shrink-0 underline">Dismiss</button>
        </div>
      )}

      {!uploadEnabled && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          <span className="font-medium text-warning">Photo uploads aren&apos;t set up yet.</span>
          <span className="text-charcoal-muted">
            {' '}Object storage is not configured on the API, so new photos cannot be added. Existing jobs can still be
            edited and published.
          </span>
        </div>
      )}

      {showForm && (
        <form
          noValidate
          onSubmit={(e) => void save(e)}
          className="mb-6 grid gap-4 rounded-xl border border-aqua/40 bg-white p-5 sm:grid-cols-2"
        >
          <h2 className="font-medium text-charcoal sm:col-span-2">{editingId ? 'Edit job' : 'New job'}</h2>

          <div>
            <label className="mb-1 block text-xs text-charcoal-muted">Service</label>
            <select className={input} value={form.serviceLineCode}
              onChange={(e) => setField('serviceLineCode', e.target.value)}>
              <option value="">Choose the service</option>
              {serviceRetired && <option value={form.serviceLineCode}>{form.serviceLineCode}</option>}
              {serviceLines.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
            <FieldError message={fieldErrors.serviceLineCode} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-charcoal-muted">Client type</label>
            <select className={input} value={form.clientSegment}
              onChange={(e) => setField('clientSegment', e.target.value as '' | ClientSegment)}>
              <option value="">Choose the client type</option>
              {SEGMENTS.map((s) => <option key={s} value={s}>{SEGMENT_LABELS[s]}</option>)}
            </select>
            <FieldError message={fieldErrors.clientSegment} />
          </div>

          <div>
            <div className="mb-1 flex items-baseline justify-between text-xs text-charcoal-muted">
              <label>Area</label>
              <span className="tabular-nums">{form.area.length}/{AREA_MAX}</span>
            </div>
            <input className={input} maxLength={AREA_MAX} value={form.area} placeholder="e.g. Westlands"
              onChange={(e) => setField('area', e.target.value)} />
            <p className="mt-1 text-xs text-charcoal-muted">
              Neighbourhood or town only, e.g. Westlands. Never a street, building or client name.
            </p>
            <FieldError message={fieldErrors.area} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-charcoal-muted">Completed on</label>
            <input type="date" className={input} max={today} value={form.completedOn}
              onChange={(e) => setField('completedOn', e.target.value)} />
            <FieldError message={fieldErrors.completedOn} />
          </div>

          <div className="sm:col-span-2">
            <div className="mb-1 flex items-baseline justify-between text-xs text-charcoal-muted">
              <label>Description</label>
              <span className="tabular-nums">{form.description.length}/{DESCRIPTION_MAX}</span>
            </div>
            <textarea rows={3} className={input} maxLength={DESCRIPTION_MAX} value={form.description}
              placeholder="e.g. Deep clean of a three-bedroom apartment after renovation."
              onChange={(e) => setField('description', e.target.value)} />
            <p className="mt-1 text-xs text-charcoal-muted">
              Describe the work only. Never name a client, building or street.
            </p>
            <FieldError message={fieldErrors.description} />
          </div>

          <div className="sm:col-span-2">
            <p className="mb-2 text-xs text-charcoal-muted">
              Photos ({photos.length} of up to {PHOTOS_MAX}) · the first is the cover
            </p>
            {photos.length > 0 && (
              <ul className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {photos.map((p, i) => (
                  <PhotoTile
                    key={p.id}
                    photo={p}
                    index={i}
                    count={photos.length}
                    onMove={(by) => movePhoto(p.id, by)}
                    onRemove={() => removePhoto(p)}
                    onRetry={() => { if (p.blob) void upload(p.id, p.blob); }}
                  />
                ))}
              </ul>
            )}
            {uploadEnabled ? (
              <input
                type="file"
                accept="image/*"
                multiple
                className={input}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = ''; // so the same photo can be picked again after removing it
                  if (files.length > 0) void addPhotos(files);
                }}
              />
            ) : (
              <p className="text-xs text-charcoal-muted">
                Photo uploads aren&apos;t set up yet, so new photos cannot be added.
              </p>
            )}
            {photoErrors.map((msg, i) => <p key={i} className="mt-1 text-xs text-danger">{msg}</p>)}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 sm:col-span-2">
            {saveBlocker && <span className="text-xs text-charcoal-muted">{saveBlocker}</span>}
            <button type="submit" disabled={saving || saveBlocker !== null} className={btn}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save job'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="rounded-xl border border-line bg-white py-10 text-center text-sm text-charcoal-muted">Loading…</div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-line bg-white py-10 text-center text-sm text-charcoal-muted">
          No jobs yet. Click <strong>+ Add job</strong> to add your first one.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <ul className="divide-y divide-line">
            {jobs.map((job) => {
              const cover = job.photos[0];
              const busy = busyId === job.id;
              return (
                <li key={job.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-mist">
                    {cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover.url} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-charcoal">{serviceName(job.serviceLineCode)}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          job.publishedAt ? 'bg-success/10 text-success' : 'bg-mist text-charcoal-muted'
                        }`}
                      >
                        {job.publishedAt ? 'Published' : 'Not published'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-charcoal-muted">
                      {SEGMENT_LABELS[job.clientSegment]} · {job.area} · {monthYear(job.completedOn)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button className={btnGhost} disabled={busy || saving} onClick={() => openForm(job)}>Edit</button>
                    {job.publishedAt ? (
                      <button className={btnGhost} disabled={busy} onClick={() => void togglePublished(job)}>
                        {busy ? 'Unpublishing…' : 'Unpublish'}
                      </button>
                    ) : (
                      <button className={btnSmall} disabled={busy} onClick={() => void togglePublished(job)}>
                        {busy ? 'Publishing…' : 'Publish'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** One photo in the form, with its upload state and the controls to order it. */
function PhotoTile({
  photo, index, count, onMove, onRemove, onRetry,
}: {
  photo: PhotoItem;
  index: number;
  count: number;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  onRetry: () => void;
}) {
  return (
    <li className="overflow-hidden rounded-lg border border-line bg-mist">
      <div className="relative aspect-[4/3]">
        {photo.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.previewUrl} alt={`Photo ${index + 1}`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-charcoal-muted">Preparing…</div>
        )}
        {index === 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-charcoal px-2 py-0.5 text-[11px] text-white">Cover</span>
        )}
        {photo.status === 'uploading' && (
          <div className="absolute inset-x-0 bottom-0 bg-white/85 px-2 py-1">
            <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--chart-track)' }}>
              <div
                className="h-full rounded-full transition-[width]"
                style={{ width: `${photo.progress}%`, backgroundColor: 'var(--chart-accent)' }}
              />
            </div>
            <p className="mt-0.5 text-[11px] tabular-nums text-charcoal-muted">Uploading {photo.progress}%</p>
          </div>
        )}
        {photo.status === 'failed' && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90 p-2 text-center">
            <p className="text-xs text-danger">{photo.error ?? 'Upload failed.'}</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-1 bg-white px-2 py-1.5">
        <div className="flex gap-1">
          <button type="button" className={btnGhost} disabled={index === 0} onClick={() => onMove(-1)}
            aria-label="Move earlier">↑</button>
          <button type="button" className={btnGhost} disabled={index === count - 1} onClick={() => onMove(1)}
            aria-label="Move later">↓</button>
        </div>
        <div className="flex gap-2">
          {photo.status === 'failed' && (
            <button type="button" className="text-xs text-aqua-deep hover:underline" onClick={onRetry}>Retry</button>
          )}
          <button type="button" className="text-xs text-danger hover:underline" onClick={onRemove}>Remove</button>
        </div>
      </div>
    </li>
  );
}
