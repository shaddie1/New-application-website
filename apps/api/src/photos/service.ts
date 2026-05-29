/**
 * Booking photo service — presign uploads, persist confirmed photos, and
 * read them back grouped into before/after room pairs (mockup 11).
 *
 * Authorization (crew-assigned vs. booking-owner) is enforced by the calling
 * route; this layer assumes the bookingId is already permitted.
 */
import { PhotoKind, Prisma } from '@prisma/client';
import type {
  BookingPhotoDto,
  BookingPhotosResult,
  PhotoKind as PhotoKindDto,
  RoomPhotoGroup,
} from '@onyxhawk/types';

import { prisma } from '../db.js';
import { presignUpload, type PresignedUpload } from '../storage/r2.js';

const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

export class PhotoError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'PhotoError';
  }
}

export async function requestUploadUrl(opts: {
  bookingId: string;
  room: string;
  kind: PhotoKindDto;
  contentType: string;
}): Promise<PresignedUpload> {
  const ext = ALLOWED_CONTENT_TYPES[opts.contentType.toLowerCase()];
  if (!ext) throw new PhotoError(`unsupported content type: ${opts.contentType}`, 400);

  const objectKey = buildObjectKey(opts.bookingId, opts.room, opts.kind, ext);
  return presignUpload(objectKey, opts.contentType);
}

export async function savePhoto(opts: {
  bookingId: string;
  room: string;
  kind: PhotoKindDto;
  url: string;
  thumbnailUrl?: string;
  takenByUserId: string;
}): Promise<BookingPhotoDto> {
  const row = await prisma.bookingPhoto.create({
    data: {
      bookingId: opts.bookingId,
      room: opts.room.trim(),
      kind: opts.kind as PhotoKind,
      url: opts.url,
      thumbnailUrl: opts.thumbnailUrl,
      takenByUserId: opts.takenByUserId,
    },
  });
  return toPhotoDto(row);
}

export async function listBookingPhotos(bookingId: string): Promise<BookingPhotosResult> {
  const rows = await prisma.bookingPhoto.findMany({
    where: { bookingId },
    orderBy: { takenAt: 'desc' },
  });

  const byRoom = new Map<string, BookingPhotoDto[]>();
  for (const r of rows) {
    const dto = toPhotoDto(r);
    const list = byRoom.get(dto.room) ?? [];
    list.push(dto);
    byRoom.set(dto.room, list);
  }

  const groups: RoomPhotoGroup[] = [];
  for (const [room, photos] of byRoom) {
    // photos are already newest-first, so find() picks the latest of each kind.
    const before = photos.find((p) => p.kind === 'BEFORE') ?? null;
    const after = photos.find((p) => p.kind === 'AFTER') ?? null;
    groups.push({
      room,
      before,
      after,
      documented: Boolean(before && after),
      all: photos,
    });
  }

  // Documented rooms first, then alphabetical for stable ordering.
  groups.sort((a, b) => {
    if (a.documented !== b.documented) return a.documented ? -1 : 1;
    return a.room.localeCompare(b.room);
  });

  return {
    bookingId,
    rooms: groups,
    documentedRoomCount: groups.filter((g) => g.documented).length,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function toPhotoDto(r: Prisma.BookingPhotoGetPayload<object>): BookingPhotoDto {
  return {
    id: r.id,
    room: r.room,
    kind: r.kind as PhotoKindDto,
    url: r.url,
    thumbnailUrl: r.thumbnailUrl,
    takenAt: r.takenAt.toISOString(),
  };
}

function buildObjectKey(bookingId: string, room: string, kind: PhotoKindDto, ext: string): string {
  const slug = room
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'room';
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `bookings/${bookingId}/${kind.toLowerCase()}-${slug}-${stamp}-${rand}.${ext}`;
}
