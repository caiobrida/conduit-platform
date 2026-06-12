import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UpdateStatusInput } from '@org/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { StatusTransitionService } from '../service-requests/status-transition.service';
import {
  SERVICE_REQUEST_STATUS_CHANGED,
  ServiceRequestStatusChangedEvent,
} from '../events/domain-events';
import { ListServiceRequestsQuery } from './list-service-requests.query';

@Injectable()
export class AdminServiceRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: StatusTransitionService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * C4: paginated queue with whitelisted sorting and filters. Reporter PII
   * is visible here by design (spec §9) — the route is admin-only and the
   * query runs inside the tenant scope enforced by the Prisma extension.
   */
  async list(query: ListServiceRequestsQuery) {
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
