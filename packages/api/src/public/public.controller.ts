import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  createServiceRequestSchema,
  protocolLookupSchema,
} from '@org/shared-types';
import type { CreateServiceRequestInput } from '@org/shared-types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PublicService } from './public.service';

@ApiTags('public')
@Controller('public/:tenantSlug/service-requests')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  /** C1 — anti-flood: tight per-IP limit (I6; Redis storage lands in D1). */
  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create a service request (citizen, no login)' })
  @ApiParam({ name: 'tenantSlug', example: 'saae-campinas' })
  @ApiResponse({ status: 201, description: 'Returns the tracking protocol' })
  @ApiResponse({ status: 422, description: 'Outside the tenant service area' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  create(
    @Param('tenantSlug') tenantSlug: string,
    @Body(new ZodValidationPipe(createServiceRequestSchema))
    body: CreateServiceRequestInput,
  ) {
    return this.publicService.createServiceRequest(tenantSlug, body);
  }

  /** C3 — anti-enumeration: rate limited + non-enumerable protocol (I1/I6). */
  @Get(':protocol')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Track a service request by protocol (minimal payload, no PII)',
  })
  @ApiResponse({ status: 200, description: 'Status and timeline only' })
  @ApiResponse({ status: 404, description: 'Unknown protocol' })
  getByProtocol(
    @Param('tenantSlug') tenantSlug: string,
    @Param('protocol') protocol: string,
  ) {
    const { protocol: validated } = protocolLookupSchema.parse({ protocol });
    return this.publicService.getByProtocol(tenantSlug, validated);
  }
}
