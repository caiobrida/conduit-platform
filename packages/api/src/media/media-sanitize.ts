/**
 * Dependency-free media sanitization for the upload path (C2/C9):
 *  - stripImageMetadata: removes EXIF/GPS/XMP (and other metadata) from photos
 *    WITHOUT re-encoding — pixels are untouched, so there is no quality loss
 *    and no CPU-heavy transcode.
 *  - measureVideoDurationSeconds: reads the real duration from the MP4/MOV
 *    `mvhd` atom so the 10s cap (C9) is enforced server-side, not trusted from
 *    the client.
 *
 * Both operate on the in-memory buffer in a single pass (no native deps, no
 * temp files, no external service), so they stay cheap on the request path.
 */

// ── Image metadata stripping ──────────────────────────────────────────────

/** Strips metadata (incl. EXIF/GPS) from a photo, preserving the pixels. */
export function stripImageMetadata(buffer: Buffer, mimeType: string): Buffer {
  switch (mimeType) {
    case 'image/jpeg':
      return stripJpeg(buffer);
    case 'image/png':
      return stripPng(buffer);
    case 'image/webp':
      return stripWebp(buffer);
    default:
      return buffer;
  }
}

/**
 * Keeps the JPEG structure but drops APP1–APP15 (EXIF/XMP/IPTC/ICC) and COM
 * segments — APP1 is where the GPS lives. APP0 (JFIF) and all coding segments
 * (DQT/DHT/SOF/SOS + entropy data) are preserved verbatim.
 */
function stripJpeg(buf: Buffer): Buffer {
  if (buf.length < 2 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    return buf; // not a JPEG we recognize — leave untouched
  }
  const out: Buffer[] = [buf.subarray(0, 2)]; // SOI
  let i = 2;
  while (i + 1 < buf.length) {
    if (buf[i] !== 0xff) {
      out.push(buf.subarray(i)); // unexpected — copy the remainder and stop
      break;
    }
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    // Standalone markers without a length payload.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (marker === 0xd9) {
      out.push(buf.subarray(i)); // EOI + trailer
      break;
    }
    if (i + 4 > buf.length) {
      out.push(buf.subarray(i));
      break;
    }
    const segEnd = i + 2 + buf.readUInt16BE(i + 2);
    if (segEnd > buf.length) {
      out.push(buf.subarray(i));
      break;
    }
    if (marker === 0xda) {
      out.push(buf.subarray(i)); // SOS: copy scan data + EOI as-is
      break;
    }
    const isMetadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!isMetadata) {
      out.push(buf.subarray(i, segEnd));
    }
    i = segEnd;
  }
  return Buffer.concat(out);
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const PNG_METADATA_CHUNKS = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);

/** Drops ancillary metadata chunks (eXIf/text/time); keeps image chunks. */
function stripPng(buf: Buffer): Buffer {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return buf;
  }
  const out: Buffer[] = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 8 <= buf.length) {
    const chunkEnd = i + 12 + buf.readUInt32BE(i); // len(4)+type(4)+data+crc(4)
    const type = buf.subarray(i + 4, i + 8).toString('ascii');
    if (chunkEnd > buf.length) {
      out.push(buf.subarray(i));
      break;
    }
    if (!PNG_METADATA_CHUNKS.has(type)) {
      out.push(buf.subarray(i, chunkEnd));
    }
    i = chunkEnd;
    if (type === 'IEND') {
      break;
    }
  }
  return Buffer.concat(out);
}

/** Removes EXIF/XMP chunks from a RIFF/WebP container and clears the VP8X
 * metadata flags. Simple (non-VP8X) WebP carries no metadata and is returned
 * unchanged. */
function stripWebp(buf: Buffer): Buffer {
  if (
    buf.length < 12 ||
    buf.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    buf.subarray(8, 12).toString('ascii') !== 'WEBP'
  ) {
    return buf;
  }
  const chunks: Buffer[] = [];
  let i = 12;
  let dropped = false;
  while (i + 8 <= buf.length) {
    const fourcc = buf.subarray(i, i + 4).toString('ascii');
    const size = buf.readUInt32LE(i + 4);
    const chunkEnd = Math.min(i + 8 + size + (size % 2), buf.length); // even pad
    if (fourcc === 'EXIF' || fourcc === 'XMP ') {
      dropped = true;
    } else {
      chunks.push(Buffer.from(buf.subarray(i, chunkEnd)));
    }
    i = chunkEnd;
  }
  if (!dropped) {
    return buf;
  }
  // Clear the EXIF (0x08) / XMP (0x04) flag bits in the VP8X header chunk.
  if (chunks.length && chunks[0].subarray(0, 4).toString('ascii') === 'VP8X') {
    chunks[0][8] &= ~0x08 & ~0x04;
  }
  const body = Buffer.concat(chunks);
  const head = Buffer.from(buf.subarray(0, 12));
  head.writeUInt32LE(4 + body.length, 4); // RIFF size = 'WEBP' + chunks
  return Buffer.concat([head, body]);
}

// ── Video duration (ISO base media file format: MP4 / QuickTime) ───────────

interface BoxLocation {
  dataStart: number;
  end: number;
}

/**
 * Returns the video duration in seconds from the `moov/mvhd` atom, or null if
 * it cannot be determined (unknown/zero duration or an unparseable container).
 */
export function measureVideoDurationSeconds(buf: Buffer): number | null {
  const moov = findBox(buf, 0, buf.length, 'moov');
  if (!moov) {
    return null;
  }
  const mvhd = findBox(buf, moov.dataStart, moov.end, 'mvhd');
  if (!mvhd) {
    return null;
  }

  const p = mvhd.dataStart;
  if (p >= buf.length) {
    return null;
  }
  const version = buf[p];

  let timescale: number;
  let duration: number;
  if (version === 1) {
    const base = p + 4 + 16; // version+flags(4) + created+modified(8+8)
    if (base + 12 > buf.length) {
      return null;
    }
    timescale = buf.readUInt32BE(base);
    duration =
      buf.readUInt32BE(base + 4) * 2 ** 32 + buf.readUInt32BE(base + 8);
  } else {
    const base = p + 4 + 8; // version+flags(4) + created+modified(4+4)
    if (base + 8 > buf.length) {
      return null;
    }
    timescale = buf.readUInt32BE(base);
    duration = buf.readUInt32BE(base + 4);
  }

  if (!timescale || duration === 0 || duration === 0xffffffff) {
    return null;
  }
  return duration / timescale;
}

/** Finds the first child box of `type` between [start, end). */
function findBox(
  buf: Buffer,
  start: number,
  end: number,
  type: string,
): BoxLocation | null {
  let i = start;
  while (i + 8 <= end) {
    let size = buf.readUInt32BE(i);
    let headerSize = 8;
    if (size === 1) {
      if (i + 16 > end) {
        return null;
      }
      size = buf.readUInt32BE(i + 8) * 2 ** 32 + buf.readUInt32BE(i + 12);
      headerSize = 16;
    } else if (size === 0) {
      size = end - i; // extends to the end of the parent
    }
    if (size < headerSize || i + size > end) {
      return null;
    }
    if (buf.subarray(i + 4, i + 8).toString('ascii') === type) {
      return { dataStart: i + headerSize, end: i + size };
    }
    i += size;
  }
  return null;
}
