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
import {
  measureVideoDurationSeconds,
  stripImageMetadata,
} from './media-sanitize';

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
    if (!detected) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_TYPE',
        message: this.rejectionMessage('UNSUPPORTED_TYPE'),
      });
    }

    // C9: enforce the duration cap from the real file, not a client-reported
    // value — measured from the MP4/MOV header, no transcode.
    let durationSeconds: number | undefined;
    if (detected.type === MediaType.VIDEO) {
      const measured = measureVideoDurationSeconds(file.buffer);
      if (measured === null) {
        throw new BadRequestException({
          code: 'VIDEO_DURATION_UNREADABLE',
          message: this.rejectionMessage('VIDEO_DURATION_UNREADABLE'),
        });
      }
      durationSeconds = measured;
    }

    const rejection = validateMediaLimits(detected, file.size, durationSeconds);
    if (rejection) {
      throw new BadRequestException({
        code: rejection,
        message: this.rejectionMessage(rejection),
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

      // C2/§9: strip EXIF/GPS from photos before persisting (no re-encode).
      const payload =
        detected.type === MediaType.PHOTO
          ? stripImageMetadata(file.buffer, detected.mimeType)
          : file.buffer;

      await this.storage.upload(storagePath, payload, detected.mimeType);

      const media = await this.prisma.client.media.create({
        data: {
          tenantId: tenant.id,
          serviceRequestId: request.id,
          type: detected.type,
          storagePath,
          mimeType: detected.mimeType,
          sizeBytes: payload.length,
          durationSeconds:
            durationSeconds !== undefined ? Math.round(durationSeconds) : null,
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
      case 'VIDEO_DURATION_UNREADABLE':
        return 'Could not read the video duration. Please re-record and try again.';
      default:
        return 'Unsupported file type. Use JPEG/PNG/WebP photos or MP4/QuickTime videos.';
    }
  }
}
