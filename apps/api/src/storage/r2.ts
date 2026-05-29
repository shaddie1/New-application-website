/**
 * Cloudflare R2 storage (S3-compatible) — presigned PUT URLs for direct
 * client uploads.
 *
 * The client asks us for an upload URL, PUTs the binary straight to R2, then
 * confirms with the API. Bytes never pass through our server.
 *
 * R2 needs CORS configured on the bucket to allow PUT from the app origin.
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { env } from '../env.js';

export class StorageNotConfiguredError extends Error {
  constructor() {
    super('object storage (R2) is not configured');
    this.name = 'StorageNotConfiguredError';
  }
}

const UPLOAD_URL_TTL_SECONDS = 300;

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!isConfigured()) throw new StorageNotConfiguredError();
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

export function isConfigured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET &&
      env.R2_PUBLIC_URL,
  );
}

export interface PresignedUpload {
  uploadUrl: string;
  publicUrl: string;
  objectKey: string;
  expiresAt: Date;
}

/** Create a presigned PUT URL for an object at `objectKey`. */
export async function presignUpload(objectKey: string, contentType: string): Promise<PresignedUpload> {
  const s3 = getClient();
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET!,
    Key: objectKey,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });

  return {
    uploadUrl,
    publicUrl: `${env.R2_PUBLIC_URL!.replace(/\/$/, '')}/${objectKey}`,
    objectKey,
    expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000),
  };
}
