import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { runWithTenant, systemPrisma } from '@org/database';
import { MEDIA_LIMITS, MediaType } from '@org/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import { detectMediaKind, validateMediaLimits } from './media-validation';

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * C2/C9 — attach media to a service request: magic-byte sniffing, size
   * and duration limits re-validated server-side, per-request cap, private
   * bucket. Path layout: {tenantId}/{serviceRequestId}/{uuid}.{ext}.
   */
  async attach(
    tenantSlug: string,
    protocol: string,
    file: { buffer: Buffer; size: number },
    durationSeconds: number | undefined,
  ) {
    if (!this.storage.isConfigured) {
      throw new ServiceUnavailableException('Media uploads are unavailable');
    }

    const tenant = await systemPrisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });
    if (!tenant) {
      throw new NotFoundException();
    }

    const detected = detectMediaKind(file.buffer);
    const rejection = validateMediaLimits(detected, file.size, durationSeconds);
    if (rejection || !detected) {
      throw new BadRequestException({
        code: rejection ?? 'UNSUPPORTED_TYPE',
        message: this.rejectionMessage(rejection ?? 'UNSUPPORTED_TYPE'),
      });
    }

    return runWithTenant(tenant.id, async () => {
      const request = await this.prisma.client.serviceRequest.findUnique({
        where: { protocol: protocol.toUpperCase() },
        select: { id: true, _count: { select: { media: true } } },
      });
      if (!request) {
        throw new NotFoundException();
      }
      if (request._count.media >= MEDIA_LIMITS.MAX_PER_SERVICE_REQUEST) {
        throw new BadRequestException({
          code: 'MEDIA_LIMIT_REACHED',
          message: `A service request can have at most ${MEDIA_LIMITS.MAX_PER_SERVICE_REQUEST} attachments.`,
        });
      }

      const extension = EXTENSION_BY_MIME[detected.mimeType];
      const storagePath = `${tenant.id}/${request.id}/${randomUUID()}.${extension}`;

      await this.storage.upload(storagePath, file.buffer, detected.mimeType);

      const media = await this.prisma.client.media.create({
        data: {
          tenantId: tenant.id,
          serviceRequestId: request.id,
          type: detected.type,
          storagePath,
          mimeType: detected.mimeType,
          sizeBytes: file.size,
          durationSeconds:
            detected.type === MediaType.VIDEO
              ? (durationSeconds ?? null)
              : null,
        },
        select: { id: true, type: true, mimeType: true, createdAt: true },
      });

      return media;
    });
  }

  /** Admin-only: short-lived signed URL for a media item (I5). */
  async getSignedUrl(mediaId: string) {
    const media = await this.prisma.client.media.findUnique({
      where: { id: mediaId },
      select: { storagePath: true },
    });
    if (!media) {
      throw new NotFoundException();
    }
    const url = await this.storage.createSignedUrl(media.storagePath);
    return { url, expiresInSeconds: 300 };
  }

  private rejectionMessage(code: string): string {
    switch (code) {
      case 'PHOTO_TOO_LARGE':
        return `Photos must be at most ${MEDIA_LIMITS.PHOTO_MAX_BYTES / 1024 / 1024} MB.`;
      case 'VIDEO_TOO_LARGE':
        return `Videos must be at most ${MEDIA_LIMITS.VIDEO_MAX_BYTES / 1024 / 1024} MB.`;
      case 'VIDEO_TOO_LONG':
        return `Videos must be at most ${MEDIA_LIMITS.VIDEO_MAX_SECONDS} seconds long.`;
      case 'VIDEO_DURATION_REQUIRED':
        return 'Video duration is required.';
      default:
        return 'Unsupported file type. Use JPEG/PNG/WebP photos or MP4/QuickTime videos.';
    }
  }
}
