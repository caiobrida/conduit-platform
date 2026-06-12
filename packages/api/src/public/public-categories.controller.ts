import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Category } from '@org/shared-types';

/**
 * D2 — service request categories for the public form. The enum is a build
 * constant, so the right cache is the HTTP layer (Cache-Control lets the
 * mobile app and any CDN cache it for a day) — no datastore round trip at
 * all, which beats a Redis hop for immutable data.
 */
@ApiTags('public')
@Controller('public/categories')
export class PublicCategoriesController {
  @Get()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiOperation({ summary: 'List service request categories' })
  @ApiOkResponse({ description: 'Stable category list (cacheable for 24h)' })
  list(): { categories: Category[] } {
    return { categories: Object.values(Category) };
  }
}
