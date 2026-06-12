import { Status } from '@org/shared-types';
import { CacheInvalidationListener } from './cache-invalidation.listener';
import { cacheKeys } from './cache.constants';
import type { CacheService } from './cache.service';
import type {
  ServiceRequestCreatedEvent,
  ServiceRequestStatusChangedEvent,
} from '../events/domain-events';

describe('CacheInvalidationListener (D3)', () => {
  const cache = {
    del: jest.fn(),
    bumpVersion: jest.fn(),
  } as unknown as jest.Mocked<CacheService>;
  const listener = new CacheInvalidationListener(cache);

  beforeEach(() => jest.clearAllMocks());

  it('drops the protocol detail and bumps the list version on status change', async () => {
    const event: ServiceRequestStatusChangedEvent = {
      tenantId: 'tenant-1',
      serviceRequestId: 'sr-1',
      protocol: 'ABCDEFGH2345',
      previousStatus: Status.OPEN,
      newStatus: Status.IN_TRIAGE,
      comment: null,
      changedAt: new Date().toISOString(),
    };

    await listener.onStatusChanged(event);

    expect(cache.del).toHaveBeenCalledWith(
      cacheKeys.protocolDetail('tenant-1', 'ABCDEFGH2345'),
    );
    expect(cache.bumpVersion).toHaveBeenCalledWith(
      cacheKeys.adminListVersion('tenant-1'),
    );
  });

  it('bumps the list version on creation', async () => {
    const event = { tenantId: 'tenant-2' } as ServiceRequestCreatedEvent;

    await listener.onCreated(event);

    expect(cache.bumpVersion).toHaveBeenCalledWith(
      cacheKeys.adminListVersion('tenant-2'),
    );
    expect(cache.del).not.toHaveBeenCalled();
  });
});
