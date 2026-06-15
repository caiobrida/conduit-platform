import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { runWithTenant, systemPrisma } from '@org/database';
import {
  Category,
  CreateServiceRequestInput,
  ForwardGeocodeResult,
  isWithinServiceArea,
  PublicServiceRequest,
  ServiceArea,
  ServiceAreaLevel,
  Status,
} from '@org/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { GeocodingService } from '../geocoding/geocoding.service';
import { generateProtocol } from '../service-requests/protocol';
import {
  SERVICE_REQUEST_CREATED,
  ServiceRequestCreatedEvent,
} from '../events/domain-events';
import { CacheService } from '../redis/cache.service';
import { CACHE_TTL, cacheKeys } from '../redis/cache.constants';

const PROTOCOL_MAX_RETRIES = 3;

/** Tenant fields the public flow needs — only these are cached (no overshare). */
interface ResolvedTenant {
  id: string;
  slug: string;
  serviceAreaLevel: ServiceAreaLevel | null;
  serviceAreaValues: string[];
}

@Injectable()
export class PublicService {
  private readonly logger = new Logger(PublicService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoding: GeocodingService,
    private readonly events: EventEmitter2,
    private readonly cache: CacheService,
  ) {}

  /**
   * Resolves a tenant by public slug (bootstrap — runs before tenant scope).
   * D2: cached — cuts one query from every public request.
   */
  private async resolveTenant(slug: string): Promise<ResolvedTenant> {
    const key = cacheKeys.tenantBySlug(slug);
    const cached = await this.cache.get<ResolvedTenant>(key);
    if (cached) {
      return cached;
    }

    // Soft delete: an inactive (suspended) tenant resolves to nothing, so all
    // public endpoints (create/track/geocode) 404 just like an unknown slug.
    const tenant = await systemPrisma.tenant.findFirst({
      where: { slug, active: true },
      select: {
        id: true,
        slug: true,
        serviceAreaLevel: true,
        serviceAreaValues: true,
      },
    });
    if (!tenant) {
      // Generic 404: do not reveal which slugs exist. Misses (incl. inactive
      // tenants) are NOT cached, so a tenant created/reactivated later is
      // visible immediately.
      throw new NotFoundException();
    }

    const resolved: ResolvedTenant = {
      ...tenant,
      serviceAreaLevel: tenant.serviceAreaLevel as ServiceAreaLevel | null,
    };
    await this.cache.set(key, resolved, CACHE_TTL.TENANT_BY_SLUG);
    return resolved;
  }

  /** C1 + C8: create a service request, validating the tenant service area. */
  async createServiceRequest(slug: string, input: CreateServiceRequestInput) {
    const tenant = await this.resolveTenant(slug);

    const locality = await this.geocoding.reverseGeocode(
      input.latitude,
      input.longitude,
    );

    const serviceArea: ServiceArea | null = tenant.serviceAreaLevel
      ? {
          level: tenant.serviceAreaLevel as ServiceAreaLevel,
          values: tenant.serviceAreaValues,
        }
      : null;

    const within = isWithinServiceArea(serviceArea, locality);
    if (within === false) {
      // C8: outside the tenant's service area — friendly, actionable error.
      throw new UnprocessableEntityException({
        code: 'OUTSIDE_SERVICE_AREA',
        message: this.serviceAreaMessage(serviceArea as ServiceArea),
      });
    }
    if (within === null && serviceArea) {
      // Geocoder unavailable/unresolved: accept (never deny service because
      // of an upstream outage) — locality stays null for manual triage.
      this.logger.warn(
        'Service request accepted without resolved locality (geocoder unavailable)',
      );
    }

    return runWithTenant(tenant.id, async () => {
      for (let attempt = 1; attempt <= PROTOCOL_MAX_RETRIES; attempt++) {
        const protocol = generateProtocol();
        try {
          const created = await this.prisma.client.serviceRequest.create({
            data: {
              tenantId: tenant.id,
              protocol,
              category: input.category,
              description: input.description,
              latitude: input.latitude,
              longitude: input.longitude,
              addressText: input.addressText ?? null,
              city: locality?.city ?? null,
              state: locality?.state ?? null,
              country: locality?.country ?? null,
              reporterName: input.reporterName,
              reporterPhone: input.reporterPhone,
            },
            select: {
              id: true,
              protocol: true,
              category: true,
              status: true,
              latitude: true,
              longitude: true,
              city: true,
              state: true,
              createdAt: true,
            },
          });

          const event: ServiceRequestCreatedEvent = {
            tenantId: tenant.id,
            serviceRequestId: created.id,
            protocol: created.protocol,
            category: created.category as Category,
            status: created.status as Status,
            latitude: created.latitude,
            longitude: created.longitude,
            city: created.city,
            state: created.state,
            createdAt: created.createdAt.toISOString(),
          };
          this.events.emit(SERVICE_REQUEST_CREATED, event);

          return { protocol: created.protocol };
        } catch (error) {
          if (isUniqueViolation(error) && attempt < PROTOCOL_MAX_RETRIES) {
            continue; // protocol collision (~2^-59): retry with a new one
          }
          throw error;
        }
      }
      // Unreachable, but keeps the compiler honest.
      throw new Error('Failed to generate a unique protocol');
    });
  }

  /**
   * B10: resolve a free-text address into coordinates for the citizen's
   * manual-address path (F4). Validates the tenant slug (generic 404) and
   * distinguishes "address does not exist" (422) from "geocoder unavailable"
   * (503) so the mobile can show the right message and offer a retry. The
   * address is never logged (LGPD).
   */
  async geocodeAddress(
    slug: string,
    address: string,
  ): Promise<ForwardGeocodeResult> {
    await this.resolveTenant(slug);

    let result: ForwardGeocodeResult | null;
    try {
      result = await this.geocoding.forwardGeocode(address);
    } catch {
      this.logger.warn('Forward geocoding unavailable (no PII logged)');
      throw new ServiceUnavailableException({
        code: 'GEOCODER_UNAVAILABLE',
        message: 'Address lookup is temporarily unavailable. Please try again.',
      });
    }

    if (!result) {
      throw new UnprocessableEntityException({
        code: 'ADDRESS_NOT_FOUND',
        message: 'We could not find that address. Check it and try again.',
      });
    }
    return result;
  }

  /**
   * C3: public tracking by protocol — minimal payload, ZERO reporter PII
   * (LGPD): explicit select, status + timeline only.
   *
   * D2: cache-aside on the hot public read. Only the PII-free
   * PublicServiceRequest payload ever reaches Redis; the key is actively
   * invalidated on status changes (D3) with the TTL as a staleness bound.
   */
  async getByProtocol(
    slug: string,
    protocol: string,
  ): Promise<PublicServiceRequest> {
    const tenant = await this.resolveTenant(slug);
    const normalized = protocol.toUpperCase();
    const key = cacheKeys.protocolDetail(tenant.id, normalized);

    const cached = await this.cache.get<PublicServiceRequest>(key);
    if (cached) {
      return cached;
    }

    const result = await this.loadByProtocol(tenant.id, normalized);
    await this.cache.set(key, result, CACHE_TTL.PROTOCOL_DETAIL);
    return result;
  }

  private async loadByProtocol(
    tenantId: string,
    protocol: string,
  ): Promise<PublicServiceRequest> {
    return runWithTenant(tenantId, async () => {
      const request = await this.prisma.client.serviceRequest.findUnique({
        where: { protocol: protocol.toUpperCase() },
        select: {
          protocol: true,
          category: true,
          status: true,
          createdAt: true,
          statusEvents: {
            select: {
              previousStatus: true,
              newStatus: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (!request) {
        throw new NotFoundException();
      }
      return {
        protocol: request.protocol,
        category: request.category as Category,
        status: request.status as Status,
        createdAt: request.createdAt.toISOString(),
        timeline: request.statusEvents.map((event) => ({
          previousStatus: event.previousStatus as Status | null,
          newStatus: event.newStatus as Status,
          createdAt: event.createdAt.toISOString(),
        })),
      };
    });
  }

  private serviceAreaMessage(area: ServiceArea): string {
    const values = area.values.join(', ');
    switch (area.level) {
      case ServiceAreaLevel.CITY:
        return `This service only covers the following cities: ${values}.`;
      case ServiceAreaLevel.STATE:
        return `This service only covers the following states: ${values}.`;
      case ServiceAreaLevel.COUNTRY:
        return `This service only covers the following countries: ${values}.`;
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  );
}
