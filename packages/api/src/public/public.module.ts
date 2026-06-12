import { Module } from '@nestjs/common';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [GeocodingModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
