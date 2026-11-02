/**
 * Re-encodes a photo in the browser before it is uploaded for the website:
 * upright, longest edge at most 1600 px, JPEG at quality 0.82 — the same
 * settings as apps/web/scripts/prepare-photos.ps1. Drawing through a canvas
 * also drops the EXIF block, GPS coordinates included, which could otherwise
 * give away where a client lives.
 */

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

interface Decoded {
  image: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/** Returns the re-encoded JPEG. Throws an Error with a message fit to show staff. */
export async function preparePhoto(file: File): Promise<Blob> {
  const source = await decode(file);
  try {
    // Never upscale: a small photo keeps its size.
    const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
    const width = Math.round(source.width * scale);
    const height = Math.round(source.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot prepare photos. Try another browser.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source.image, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not prepare this photo. Try again.'))),
        'image/jpeg',
        JPEG_QUALITY,
      );
    });
  } finally {
    source.release();
  }
}

/**
 * Phone cameras store the picture sideways and record the turn in EXIF, so the
 * decode must apply it. `imageOrientation: 'from-image'` asks for exactly that;
 * a browser that does not know the option rejects it, and the <img> fallback is
 * drawn upright by every current engine.
 */
async function decode(file: File): Promise<Decoded> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    return decodeWithImage(file);
  }
}

function decodeWithImage(file: File): Promise<Decoded> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ image: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) });
    // Both decoders refused it — typically a HEIC photo outside Safari.
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Can't read this photo. Use a JPEG instead."));
    };
    img.src = url;
  });
}
