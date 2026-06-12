import { EventEmitter2 } from '@nestjs/event-emitter';
import { Status, Category } from '@org/shared-types';
import { runWithTenant } from '@org/database';
import { CacheService } from '../redis/cache.service';
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
  // No-op cache (null client) — exercises the uncached path; list() reads
  // the tenant from the AsyncLocalStorage context, hence runWithTenant.
  const service = new AdminServiceRequestsService(
    prisma,
    transitions,
    events,
    new CacheService(null),
  );

  beforeEach(() => jest.clearAllMocks());

  it('builds filters and search into the where clause (C4)', async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    await runWithTenant('tenant-a', () =>
      service.list(
        listServiceRequestsQuerySchema.parse({
          status: Status.OPEN,
          city: 'Campinas',
          search: 'Maria',
          page: '2',
          pageSize: '10',
          sortBy: 'city',
          sortOrder: 'asc',
        }),
      ),
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

  it('caches list pages and a version bump invalidates them (D2/D3)', async () => {
    const store = new Map<string, string>();
    let version = 0;
    const fakeRedis = {
      get: jest.fn(async (k: string) =>
        k.endsWith(':sr:list:ver') ? String(version) : (store.get(k) ?? null),
      ),
      set: jest.fn(async (k: string, v: string) => void store.set(k, v)),
      del: jest.fn(),
      incr: jest.fn(async () => ++version),
      ping: jest.fn(),
    };
    const cache = new CacheService(
      fakeRedis as unknown as ConstructorParameters<typeof CacheService>[0],
    );
    const cachedService = new AdminServiceRequestsService(
      prisma,
      transitions,
      events,
      cache,
    );
    const query = listServiceRequestsQuerySchema.parse({});
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await runWithTenant('tenant-a', () => cachedService.list(query));
    await runWithTenant('tenant-a', () => cachedService.list(query));
    expect(findMany).toHaveBeenCalledTimes(1); // second page from cache

    await cache.bumpVersion('t:tenant-a:sr:list:ver');
    await runWithTenant('tenant-a', () => cachedService.list(query));
    expect(findMany).toHaveBeenCalledTimes(2); // new version → fresh query
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
