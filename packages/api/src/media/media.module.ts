import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageService } from './storage.service';
import { MediaService } from './media.service';
import {
  AdminMediaController,
  PublicMediaController,
} from './media.controller';

@Module({
  imports: [AuthModule],
  controllers: [PublicMediaController, AdminMediaController],
  providers: [StorageService, MediaService],
})
export class MediaModule {}
