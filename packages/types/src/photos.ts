/** Before/after photo DTOs (mockup 11) shared between API and clients. */

export type PhotoKind = 'BEFORE' | 'AFTER';

export interface BookingPhotoDto {
  id: string;
  room: string;
  kind: PhotoKind;
  url: string;
  thumbnailUrl: string | null;
  takenAt: string; // ISO
}

/** Photos for one room, paired for the before/after comparison UI. */
export interface RoomPhotoGroup {
  room: string;
  before: BookingPhotoDto | null; // latest BEFORE
  after: BookingPhotoDto | null;  // latest AFTER
  documented: boolean;            // has both a before and an after
  all: BookingPhotoDto[];         // every photo for the room, newest first
}

export interface BookingPhotosResult {
  bookingId: string;
  rooms: RoomPhotoGroup[];
  documentedRoomCount: number;
}

/** POST …/photos/upload-url — ask the server for a presigned PUT target. */
export interface PhotoUploadUrlInput {
  room: string;
  kind: PhotoKind;
  contentType: string; // e.g. "image/jpeg"
}

export interface PhotoUploadUrlResult {
  /** Presigned URL the client PUTs the binary to. */
  uploadUrl: string;
  /** Public URL the object will be served from once uploaded. */
  publicUrl: string;
  /** Storage key (opaque to the client; echoed back on confirm). */
  objectKey: string;
  expiresAt: string; // ISO
}

/** POST …/photos — confirm an uploaded object and create the row. */
export interface CreatePhotoInput {
  room: string;
  kind: PhotoKind;
  url: string;          // the publicUrl returned by upload-url
  thumbnailUrl?: string;
}
