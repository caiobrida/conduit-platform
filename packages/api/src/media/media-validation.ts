import { MEDIA_LIMITS, MediaType } from '@org/shared-types';

export interface DetectedMedia {
  type: MediaType;
  mimeType: string;
}

/**
 * Detects the real media kind from file magic bytes — never trust the
 * client-provided mimetype alone (content sniffing is the first defense
 * against disguised uploads).
 */
export function detectMediaKind(buffer: Buffer): DetectedMedia | null {
  if (buffer.length < 12) {
    return null;
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { type: MediaType.PHOTO, mimeType: 'image/jpeg' };
  }
  // PNG: 89 50 4E 47
  if (buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
    return { type: MediaType.PHOTO, mimeType: 'image/png' };
  }
  // WebP: "RIFF"...."WEBP"
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { type: MediaType.PHOTO, mimeType: 'image/webp' };
  }
  // MP4/QuickTime: "ftyp" at offset 4
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii');
    return {
      type: MediaType.VIDEO,
      mimeType: brand.startsWith('qt') ? 'video/quicktime' : 'video/mp4',
    };
  }
  return null;
}

export type MediaRejection =
  | 'UNSUPPORTED_TYPE'
  | 'PHOTO_TOO_LARGE'
  | 'VIDEO_TOO_LARGE'
  | 'VIDEO_TOO_LONG'
  | 'VIDEO_DURATION_REQUIRED';

/** Validates size/duration against the C9 product limits. */
export function validateMediaLimits(
  detected: DetectedMedia | null,
  sizeBytes: number,
  durationSeconds: number | undefined,
): MediaRejection | null {
  if (!detected) {
    return 'UNSUPPORTED_TYPE';
  }
  if (detected.type === MediaType.PHOTO) {
    return sizeBytes > MEDIA_LIMITS.PHOTO_MAX_BYTES ? 'PHOTO_TOO_LARGE' : null;
  }
  if (sizeBytes > MEDIA_LIMITS.VIDEO_MAX_BYTES) {
    return 'VIDEO_TOO_LARGE';
  }
  if (durationSeconds === undefined) {
    return 'VIDEO_DURATION_REQUIRED';
  }
  if (durationSeconds > MEDIA_LIMITS.VIDEO_MAX_SECONDS) {
    return 'VIDEO_TOO_LONG';
  }
  return null;
}
