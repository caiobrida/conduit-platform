import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { geocodeAddressSchema } from '@org/shared-types';
import type { GeocodeAddressInput } from '@org/shared-types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PublicService } from './public.service';

@ApiTags('public')
@Controller('public/:tenantSlug/geocode')
export class PublicGeocodeController {
  constructor(private readonly publicService: PublicService) {}

  /**
   * B10 — resolve a typed address to coordinates (F4). Anti-abuse rate limit
   * sits between create (5/min) and tracking (30/min): a citizen only calls
   * this a couple of times while fixing an address.
   */
  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Resolve an address to coordinates (citizen, no login)',
  })
  @ApiParam({ name: 'tenantSlug', example: 'saae-campinas' })
  @ApiResponse({
    status: 200,
    description: 'Coordinates + normalized address + locality',
  })
  @ApiResponse({ status: 422, description: 'Address not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiResponse({ status: 503, description: 'Geocoder temporarily unavailable' })
  geocode(
    @Param('tenantSlug') tenantSlug: string,
    @Body(new ZodValidationPipe(geocodeAddressSchema))
    body: GeocodeAddressInput,
  ) {
    return this.publicService.geocodeAddress(tenantSlug, body.address);
  }
}
