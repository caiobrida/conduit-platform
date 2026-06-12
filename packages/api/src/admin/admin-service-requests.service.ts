import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UpdateStatusInput } from '@org/shared-types';
import { requireTenantId } from '@org/database';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';
import { CACHE_TTL, cacheKeys } from '../redis/cache.constants';
import { StatusTransitionService } from '../service-requests/status-transition.service';
import {
  SERVICE_REQUEST_STATUS_CHANGED,
  ServiceRequestStatusChangedEvent,
} from '../events/domain-events';
import { ListServiceRequestsQuery } from './list-service-requests.query';

/** Cached page shape — Dates round-trip through Redis as ISO strings. */
export interface ListResult {
  items: unknown[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

@Injectable()
export class AdminServiceRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: StatusTransitionService,
    private readonly events: EventEmitter2,
    private readonly cache: CacheService,
  ) {}

  /**
   * C4: paginated queue with whitelisted sorting and filters. Reporter PII
   * is visible here by design (spec §9) — the route is admin-only and the
   * query runs inside the tenant scope enforced by the Prisma extension.
   */
  async list(query: ListServiceRequestsQuery) {
    // D2: cache-aside keyed by tenant + namespace version + query hash.
    // Writes bump the version (D3), lazily invalidating every cached page
    // in O(1); the short TTL bounds staleness and reaps old versions. The
    // key is tenant-prefixed and this route is admin-only, so cached PII
    // never crosses tenants and expires within seconds.
    const tenantId = requireTenantId();
    const queryHash = createHash('sha1')
      .update(JSON.stringify(query))
      .digest('hex');
    const version = await this.cache.getVersion(
      cacheKeys.adminListVersion(tenantId),
    );
    const cacheKey = cacheKeys.adminList(tenantId, version, queryHash);

    const cached = await this.cache.get<ListResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await this.queryList(query);
    await this.cache.set(cacheKey, result, CACHE_TTL.ADMIN_LIST);
    return result;
  }

  private async queryList(query: ListServiceRequestsQuery) {
    const where = {
      ...(query.status && { status: query.status }),
      ...(query.category && { category: query.category }),
      ...(query.city && {
        city: { equals: query.city, mode: 'insensitive' as const },
      }),
      ...(query.state && {
        state: { equals: query.state, mode: 'insensitive' as const },
      }),
      ...((query.createdFrom || query.createdTo) && {
        createdAt: {
          ...(query.createdFrom && { gte: query.createdFrom }),
          ...(query.createdTo && { lte: query.createdTo }),
        },
      }),
      ...(query.search && {
        OR: [
          {
            protocol: { contains: query.search, mode: 'insensitive' as const },
          },
          {
            reporterName: {
              contains: query.search,
              mode: 'insensitive' as const,
            },
          },
          {
            reporterPhone: {
              contains: query.search,
              mode: 'insensitive' as const,
            },
          },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.client.serviceRequest.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.serviceRequest.count({ where }),
    ]);

    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  /** C5: validated status transition + auditable StatusEvent + domain event. */
  async updateStatus(
    serviceRequestId: string,
    input: UpdateStatusInput,
    author: string,
  ) {
    const { request, previousStatus } = await this.transitions.transition({
      serviceRequestId,
      newStatus: input.newStatus,
      comment: input.comment,
      author,
    });

    const event: ServiceRequestStatusChangedEvent = {
      tenantId: request.tenantId,
      serviceRequestId: request.id,
      protocol: request.protocol,
      previousStatus,
      newStatus: input.newStatus,
      comment: input.comment ?? null,
      changedAt: new Date().toISOString(),
    };
    this.events.emit(SERVICE_REQUEST_STATUS_CHANGED, event);

    return request;
  }
}
