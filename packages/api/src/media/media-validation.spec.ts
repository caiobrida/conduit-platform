import { MediaType } from '@org/shared-types';
import { detectMediaKind, validateMediaLimits } from './media-validation';

const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(16),
]);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16),
]);
const webp = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBP'),
  Buffer.alloc(16),
]);
const mp4 = Buffer.concat([
  Buffer.alloc(4),
  Buffer.from('ftypisom'),
  Buffer.alloc(16),
]);
const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(32)]);

describe('detectMediaKind (magic bytes)', () => {
  it('detects photos (jpeg/png/webp)', () => {
    expect(detectMediaKind(jpeg)).toEqual({
      type: MediaType.PHOTO,
      mimeType: 'image/jpeg',
    });
    expect(detectMediaKind(png)?.mimeType).toBe('image/png');
    expect(detectMediaKind(webp)?.mimeType).toBe('image/webp');
  });

  it('detects mp4 video', () => {
    expect(detectMediaKind(mp4)).toEqual({
      type: MediaType.VIDEO,
      mimeType: 'video/mp4',
    });
  });

  it('rejects disguised executables and tiny buffers', () => {
    expect(detectMediaKind(exe)).toBeNull();
    expect(detectMediaKind(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe('validateMediaLimits (C9)', () => {
  const photo = { type: MediaType.PHOTO, mimeType: 'image/jpeg' };
  const video = { type: MediaType.VIDEO, mimeType: 'video/mp4' };
  const MB = 1024 * 1024;

  it('accepts a photo up to 5MB and rejects above', () => {
    expect(validateMediaLimits(photo, 5 * MB, undefined)).toBeNull();
    expect(validateMediaLimits(photo, 5 * MB + 1, undefined)).toBe(
      'PHOTO_TOO_LARGE',
    );
  });

  it('accepts a video up to 25MB/10s and rejects above', () => {
    expect(validateMediaLimits(video, 25 * MB, 10)).toBeNull();
    expect(validateMediaLimits(video, 25 * MB + 1, 10)).toBe('VIDEO_TOO_LARGE');
    expect(validateMediaLimits(video, MB, 11)).toBe('VIDEO_TOO_LONG');
  });

  it('requires duration for videos and a known type', () => {
    expect(validateMediaLimits(video, MB, undefined)).toBe(
      'VIDEO_DURATION_REQUIRED',
    );
    expect(validateMediaLimits(null, MB, undefined)).toBe('UNSUPPORTED_TYPE');
  });
});
