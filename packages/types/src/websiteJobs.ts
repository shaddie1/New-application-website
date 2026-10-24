import type { ClientSegment } from './admin.js';

// ── Website jobs ────────────────────────────────────────────────────────────
// Finished jobs staff publish from admin; the public site shows them in "Our
// work" and on the portfolio. Client type and area only — there is deliberately
// no field for a client's name, phone or address.

/** Outcome of asking the host to rebuild the public website after a change. */
export type SiteUpdateStatus = 'queued' | 'failed' | 'disabled';

export interface WebsiteJobPhotoDto {
  objectKey: string;
  url: string;
}

/** A job as staff see it in admin. */
export interface WebsiteJobDto {
  id: string;
  serviceLineCode: string;
  clientSegment: ClientSegment;
  area: string;
  completedOn: string; // YYYY-MM-DD
  description: string;
  /** Null while the job is unpublished. */
  publishedAt: string | null;
  /** In display order; the first photo is the cover. */
  photos: WebsiteJobPhotoDto[];
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebsiteJobsResult {
  jobs: WebsiteJobDto[];
  /** False when object storage is not configured — photos cannot be uploaded. */
  uploadEnabled: boolean;
}

/** Create and update share one shape: every field is required on save. */
export interface SaveWebsiteJobInput {
  serviceLineCode: string;
  clientSegment: ClientSegment;
  area: string;
  completedOn: string; // YYYY-MM-DD
  description: string;
  /** Object keys returned by the upload-url endpoint, in display order. */
  photoKeys: string[];
}

export interface WebsiteJobPhotoUploadUrlInput {
  contentType: string;
}

export interface WebsiteJobPhotoUploadUrlResult {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
  expiresAt: string;
}

/** Response to create, update, publish and unpublish. */
export interface WebsiteJobMutationResult {
  job: WebsiteJobDto;
  /** Whether a website rebuild was started; null when the change cannot affect the live site. */
  siteUpdate: SiteUpdateStatus | null;
}

/** A published job as the public website receives it. */
export interface PublicWebsiteJobDto {
  id: string;
  serviceLineCode: string;
  /** Null when the code is no longer in the catalog. */
  serviceName: string | null;
  clientSegment: ClientSegment;
  area: string;
  completedOn: string; // YYYY-MM-DD
  description: string;
  photos: { url: string }[];
}

export interface PublicWebsiteJobsResult {
  jobs: PublicWebsiteJobDto[];
}
