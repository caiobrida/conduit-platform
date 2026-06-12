import { EventEmitter2 } from '@nestjs/event-emitter';
import { Status, Category } from '@org/shared-types';
import { AdminServiceRequestsService } from './admin-service-requests.service';
import { listServiceRequestsQuerySchema } from './list-service-requests.query';
import { PrismaService } from '../prisma/prisma.service';
import { StatusTransitionService } from '../service-requests/status-transition.service';
import { SERVICE_REQUEST_STATUS_CHANGED } from '../events/domain-events';

describe('listServiceRequestsQuerySchema', () => {
  it('applies safe defaults', () => {
    const parsed = listServiceRequestsQuerySchema.parse({});
    expect(parsed).toMatchObject({
      page: 1,
      pageSize: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it('rejects non-whitelisted sort fields (orderBy injection)', () => {
    expect(() =>
      listServiceRequestsQuerySchema.parse({ sortBy: 'reporterPhone' }),
    ).toThrow();
    expect(() =>
      listServiceRequestsQuerySchema.parse({ sortBy: 'tenantId' }),
    ).toThrow();
  });

  it('caps the page size at 100', () => {
    expect(() =>
      listServiceRequestsQuerySchema.parse({ pageSize: '500' }),
    ).toThrow();
  });
});

describe('AdminServiceRequestsService', () => {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  const prisma = {
    client: { serviceRequest: { findMany, count } },
  } as unknown as PrismaService;
  const transition = jest.fn();
  const transitions = { transition } as unknown as StatusTransitionService;
  const emit = jest.fn();
  const events = { emit } as unknown as EventEmitter2;
  const service = new AdminServiceRequestsService(prisma, transitions, events);

  beforeEach(() => jest.clearAllMocks());

  it('builds filters and search into the where clause (C4)', async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    await service.list(
      listServiceRequestsQuerySchema.parse({
        status: Status.OPEN,
        city: 'Campinas',
        search: 'Maria',
        page: '2',
        pageSize: '10',
        sortBy: 'city',
        sortOrder: 'asc',
      }),
    );

    const args = findMany.mock.calls[0][0];
    expect(args.where.status).toBe(Status.OPEN);
    expect(args.where.city).toEqual({
      equals: 'Campinas',
      mode: 'insensitive',
    });
    expect(args.where.OR).toHaveLength(3); // protocol, name, phone
    expect(args.orderBy).toEqual({ city: 'asc' });
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
  });

  it('applies the status transition and emits the domain event (C5)', async () => {
    transition.mockResolvedValue({
      request: {
        id: 'sr-1',
        tenantId: 'tenant-a',
        protocol: 'ABCDEFGH2345',
        status: Status.IN_TRIAGE,
        category: Category.SEWAGE,
      },
      previousStatus: Status.OPEN,
    });

    await service.updateStatus(
      'sr-1',
      { newStatus: Status.IN_TRIAGE, comment: 'on it' },
      'admin-1',
    );

    expect(transition).toHaveBeenCalledWith({
      serviceRequestId: 'sr-1',
      newStatus: Status.IN_TRIAGE,
      comment: 'on it',
      author: 'admin-1',
    });
    expect(emit).toHaveBeenCalledWith(
      SERVICE_REQUEST_STATUS_CHANGED,
      expect.objectContaining({
        tenantId: 'tenant-a',
        protocol: 'ABCDEFGH2345',
        previousStatus: Status.OPEN,
        newStatus: Status.IN_TRIAGE,
      }),
    );
  });
});
