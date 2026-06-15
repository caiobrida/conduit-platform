import { BadRequestException } from '@nestjs/common';
import { MediaType } from '@org/shared-types';
import { MediaService } from './media.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

jest.mock('@org/database', () => {
  const actual = jest.requireActual('@org/database');
  return {
    ...actual,
    systemPrisma: { tenant: { findUnique: jest.fn() } },
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { systemPrisma } = require('@org/database') as {
  systemPrisma: { tenant: { findUnique: jest.Mock } };
};

// ── Crafted buffers ───────────────────────────────────────────────────────

const u16be = (n: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
};

const jpegWithExif = () => {
  const exif = Buffer.concat([
    Buffer.from('Exif\0\0', 'latin1'),
    Buffer.from([0x01, 0x02, 0x03, 0x04]),
  ]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    Buffer.from([0xff, 0xe0]),
    u16be(2 + 6),
    Buffer.from('JFIF\0\0', 'latin1'), // APP0
    Buffer.from([0xff, 0xe1]),
    u16be(2 + exif.length),
    exif, // APP1 (EXIF)
    Buffer.from([0xff, 0xda]),
    u16be(2 + 1),
    Buffer.from([0x00]), // SOS
    Buffer.from([0x12, 0x34, 0x56]), // scan
    Buffer.from([0xff, 0xd9]), // EOI
  ]);
};

const boxOf = (type: string, data: Buffer) => {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(8 + data.length);
  return Buffer.concat([size, Buffer.from(type, 'latin1'), data]);
};

const mp4 = (timescale: number, duration: number) => {
  const d = Buffer.alloc(120);
  d.writeUInt32BE(timescale, 12);
  d.writeUInt32BE(duration, 16);
  return Buffer.concat([
    boxOf('ftyp', Buffer.from('isom')),
    boxOf('moov', boxOf('mvhd', d)),
  ]);
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe('MediaService', () => {
  const findUnique = jest.fn(); // serviceRequest.findUnique
  const create = jest.fn(); // media.create
  const prisma = {
    client: { serviceRequest: { findUnique }, media: { create } },
  } as unknown as PrismaService;

  const upload = jest.fn();
  const storage = {
    isConfigured: true,
    upload,
    createSignedUrl: jest.fn(),
  } as unknown as StorageService;

  const service = new MediaService(prisma, storage);

  beforeEach(() => {
    jest.clearAllMocks();
    systemPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-a' });
    findUnique.mockResolvedValue({ id: 'sr-1', _count: { media: 0 } });
    create.mockImplementation(async ({ data }) => ({
      id: 'media-1',
      type: data.type,
      mimeType: data.mimeType,
      createdAt: new Date(),
    }));
    upload.mockResolvedValue(undefined);
  });

  it('strips EXIF/GPS from a photo before uploading it', async () => {
    await service.attach('saae-campinas', 'ABCDEFGH2345', {
      buffer: jpegWithExif(),
      size: jpegWithExif().length,
    });

    const uploaded = upload.mock.calls[0][1] as Buffer;
    expect(uploaded.includes(Buffer.from('Exif', 'latin1'))).toBe(false);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: MediaType.PHOTO }),
      }),
    );
  });

  it('measures video duration server-side and stores it', async () => {
    const video = mp4(600, 3000); // 5s
    await service.attach('saae-campinas', 'ABCDEFGH2345', {
      buffer: video,
      size: video.length,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: MediaType.VIDEO,
          durationSeconds: 5,
        }),
      }),
    );
  });

  it('rejects a video longer than the cap using the measured duration', async () => {
    const video = mp4(600, 600 * 11); // 11s
    await expect(
      service.attach('saae-campinas', 'ABCDEFGH2345', {
        buffer: video,
        size: video.length,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects a video whose duration cannot be read', async () => {
    const unreadable = boxOf('ftyp', Buffer.from('isommore')); // no moov
    await expect(
      service.attach('saae-campinas', 'ABCDEFGH2345', {
        buffer: unreadable,
        size: unreadable.length,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects an unsupported file type', async () => {
    const junk = Buffer.alloc(16, 0);
    await expect(
      service.attach('saae-campinas', 'ABCDEFGH2345', {
        buffer: junk,
        size: junk.length,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces the per-request attachment cap', async () => {
    findUnique.mockResolvedValue({ id: 'sr-1', _count: { media: 3 } });
    const photo = jpegWithExif();
    await expect(
      service.attach('saae-campinas', 'ABCDEFGH2345', {
        buffer: photo,
        size: photo.length,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upload).not.toHaveBeenCalled();
  });
});
