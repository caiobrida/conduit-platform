import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  SERVICE_REQUEST_CREATED,
  SERVICE_REQUEST_STATUS_CHANGED,
} from '../events/domain-events';
import type {
  ServiceRequestCreatedEvent,
  ServiceRequestStatusChangedEvent,
} from '../events/domain-events';
import { CacheService } from './cache.service';
import { cacheKeys } from './cache.constants';

/**
 * D3 — write-side cache invalidation, decoupled from the write services via
 * the existing domain events: the public tracking detail is deleted and the
 * tenant's admin list namespace version is bumped (lazy O(1) invalidation of
 * every cached page). Guarantees the public tracking (C3) never serves a
 * stale status after a transition (C5).
 */
@Injectable()
export class CacheInvalidationListener {
  constructor(private readonly cache: CacheService) {}

  @OnEvent(SERVICE_REQUEST_STATUS_CHANGED)
  async onStatusChanged(event: ServiceRequestStatusChangedEvent) {
    await Promise.all([
      this.cache.del(cacheKeys.protocolDetail(event.tenantId, event.protocol)),
      this.cache.bumpVersion(cacheKeys.adminListVersion(event.tenantId)),
    ]);
  }

  @OnEvent(SERVICE_REQUEST_CREATED)
  async onCreated(event: ServiceRequestCreatedEvent) {
    // New requests change list contents; the detail key cannot exist yet.
    await this.cache.bumpVersion(cacheKeys.adminListVersion(event.tenantId));
  }
}
