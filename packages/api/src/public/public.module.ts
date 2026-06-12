import { Module } from '@nestjs/common';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { PublicController } from './public.controller';
import { PublicCategoriesController } from './public-categories.controller';
import { PublicService } from './public.service';

@Module({
  imports: [GeocodingModule],
  controllers: [PublicController, PublicCategoriesController],
  providers: [PublicService],
})
export class PublicModule {}
