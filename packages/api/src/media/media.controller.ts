import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MEDIA_LIMITS } from '@org/shared-types';
import { AdminGuard } from '../auth/admin.guard';
import { MediaService } from './media.service';

@ApiTags('public')
@Controller('public/:tenantSlug/service-requests/:protocol/media')
export class PublicMediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MEDIA_LIMITS.VIDEO_MAX_BYTES, files: 1 },
    }),
  )
  @ApiOperation({ summary: 'Attach a photo (≤5MB) or video (≤10s/25MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, description: 'Media attached' })
  @ApiResponse({ status: 400, description: 'Invalid type/size/duration' })
  upload(
    @Param('tenantSlug') tenantSlug: string,
    @Param('protocol') protocol: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.media.attach(tenantSlug, protocol, {
      buffer: file.buffer,
      size: file.size,
    });
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/media')
export class AdminMediaController {
  constructor(private readonly media: MediaService) {}

  @Get(':id/signed-url')
  @ApiOperation({
    summary: 'Short-lived signed URL for a media item (private bucket, I5)',
  })
  @ApiResponse({ status: 200, description: 'Signed URL valid for 5 minutes' })
  getSignedUrl(@Param('id', ParseUUIDPipe) id: string) {
    return this.media.getSignedUrl(id);
  }
}
