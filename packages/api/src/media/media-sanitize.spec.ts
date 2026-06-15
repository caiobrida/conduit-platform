import {
  measureVideoDurationSeconds,
  stripImageMetadata,
} from './media-sanitize';

// ── Builders for crafted test buffers ─────────────────────────────────────

const u16be = (n: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
};

const jpegWithExif = () => {
  const SOI = Buffer.from([0xff, 0xd8]);
  const EOI = Buffer.from([0xff, 0xd9]);
  const exif = Buffer.concat([
    Buffer.from('Exif\0\0', 'latin1'),
    Buffer.from([0x01, 0x02, 0x03, 0x04]),
  ]);
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1]),
    u16be(2 + exif.length),
    exif,
  ]);
  const jfif = Buffer.from('JFIF\0\0\0\0\0\0', 'latin1');
  const app0 = Buffer.concat([
    Buffer.from([0xff, 0xe0]),
    u16be(2 + jfif.length),
    jfif,
  ]);
  const sos = Buffer.concat([
    Buffer.from([0xff, 0xda]),
    u16be(2 + 3),
    Buffer.from([0x01, 0x01, 0x00]),
  ]);
  return Buffer.concat([
    SOI,
    app0,
    app1,
    sos,
    Buffer.from([0x12, 0x34, 0x56]),
    EOI,
  ]);
};

const pngChunk = (type: string, data: Buffer) =>
  Buffer.concat([
    (() => {
      const b = Buffer.alloc(4);
      b.writeUInt32BE(data.length);
      return b;
    })(),
    Buffer.from(type, 'latin1'),
    data,
    Buffer.alloc(4), // CRC (not validated by the stripper)
  ]);

const pngWithExif = () =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', Buffer.alloc(13)),
    pngChunk('eXIf', Buffer.from([0x01, 0x02, 0x03])),
    pngChunk('IDAT', Buffer.from([0xaa, 0xbb])),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);

const webpChunk = (fourcc: string, data: Buffer) => {
  const size = Buffer.alloc(4);
  size.writeUInt32LE(data.length);
  const pad = data.length % 2 ? Buffer.from([0]) : Buffer.alloc(0);
  return Buffer.concat([Buffer.from(fourcc, 'latin1'), size, data, pad]);
};

const webpWithExif = () => {
  const vp8xData = Buffer.alloc(10);
  vp8xData[0] = 0x08; // EXIF flag set
  const body = Buffer.concat([
    webpChunk('VP8X', vp8xData),
    webpChunk('VP8 ', Buffer.from([0x00, 0x01, 0x02, 0x03])),
    webpChunk('EXIF', Buffer.from([0xde, 0xad, 0xbe, 0xef])),
  ]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(4 + body.length);
  return Buffer.concat([
    Buffer.from('RIFF', 'latin1'),
    size,
    Buffer.from('WEBP', 'latin1'),
    body,
  ]);
};

const box = (type: string, data: Buffer) => {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(8 + data.length);
  return Buffer.concat([size, Buffer.from(type, 'latin1'), data]);
};

const mp4 = (timescale: number, duration: number, version = 0) => {
  const d = Buffer.alloc(120);
  d[0] = version;
  if (version === 1) {
    d.writeUInt32BE(timescale, 20);
    d.writeUInt32BE(Math.floor(duration / 2 ** 32), 24);
    d.writeUInt32BE(duration >>> 0, 28);
  } else {
    d.writeUInt32BE(timescale, 12);
    d.writeUInt32BE(duration, 16);
  }
  return Buffer.concat([
    box('ftyp', Buffer.from('isom')),
    box('moov', box('mvhd', d)),
  ]);
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe('stripImageMetadata', () => {
  it('removes the EXIF (APP1) segment from a JPEG, keeping pixels and JFIF', () => {
    const out = stripImageMetadata(jpegWithExif(), 'image/jpeg');
    expect(out.includes(Buffer.from('Exif', 'latin1'))).toBe(false);
    expect(out.includes(Buffer.from([0xff, 0xe1]))).toBe(false); // no APP1
    expect(out.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8])); // SOI
    expect(out.includes(Buffer.from('JFIF', 'latin1'))).toBe(true); // APP0 kept
    expect(out.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9])); // EOI
    expect(out.includes(Buffer.from([0x12, 0x34, 0x56]))).toBe(true); // scan data
  });

  it('removes the eXIf chunk from a PNG, keeping image chunks', () => {
    const out = stripImageMetadata(pngWithExif(), 'image/png');
    expect(out.includes(Buffer.from('eXIf', 'latin1'))).toBe(false);
    expect(out.includes(Buffer.from('IHDR', 'latin1'))).toBe(true);
    expect(out.includes(Buffer.from('IDAT', 'latin1'))).toBe(true);
    expect(out.includes(Buffer.from('IEND', 'latin1'))).toBe(true);
  });

  it('removes the EXIF chunk from a WebP, clears the VP8X flag and fixes size', () => {
    const out = stripImageMetadata(webpWithExif(), 'image/webp');
    expect(out.includes(Buffer.from('EXIF', 'latin1'))).toBe(false);
    expect(out.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(out.readUInt32LE(4)).toBe(out.length - 8); // RIFF size = rest
    expect(out[20] & 0x08).toBe(0); // VP8X EXIF flag cleared
  });

  it('leaves unknown types untouched', () => {
    const buf = Buffer.from([1, 2, 3, 4]);
    expect(stripImageMetadata(buf, 'application/octet-stream')).toBe(buf);
  });
});

describe('measureVideoDurationSeconds', () => {
  it('reads duration from a version-0 mvhd', () => {
    expect(measureVideoDurationSeconds(mp4(600, 3000))).toBeCloseTo(5);
  });

  it('reads duration from a version-1 mvhd', () => {
    expect(measureVideoDurationSeconds(mp4(600, 6000, 1))).toBeCloseTo(10);
  });

  it('finds moov even when it follows another top-level box (e.g. mdat)', () => {
    const withMdat = Buffer.concat([
      box('ftyp', Buffer.from('isom')),
      box('mdat', Buffer.alloc(32)),
      box(
        'moov',
        box(
          'mvhd',
          (() => {
            const d = Buffer.alloc(120);
            d.writeUInt32BE(1000, 12);
            d.writeUInt32BE(8000, 16);
            return d;
          })(),
        ),
      ),
    ]);
    expect(measureVideoDurationSeconds(withMdat)).toBeCloseTo(8);
  });

  it('returns null when there is no moov/mvhd', () => {
    expect(
      measureVideoDurationSeconds(box('ftyp', Buffer.from('isommore'))),
    ).toBeNull();
  });

  it('returns null for an unknown/zero duration', () => {
    expect(measureVideoDurationSeconds(mp4(600, 0))).toBeNull();
    expect(measureVideoDurationSeconds(mp4(600, 0xffffffff))).toBeNull();
  });
});
