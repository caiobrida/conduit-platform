import { applyTenantScope } from './tenant-scope.js';
import {
  runWithTenant,
  getTenantId,
  requireTenantId,
} from './tenant-context.js';

const TENANT = 'tenant-a';

describe('applyTenantScope', () => {
  it('injects tenantId into where on reads', () => {
    // StatusEvent is tenant-scoped but NOT soft-delete, so only tenantId.
    const result = applyTenantScope(
      'StatusEvent',
      'findMany',
      { where: { newStatus: 'OPEN' } },
      TENANT,
    );
    expect(result['where']).toEqual({ newStatus: 'OPEN', tenantId: TENANT });
  });

  it('injects tenantId into where on writes', () => {
    const result = applyTenantScope('Media', 'deleteMany', {}, TENANT);
    expect(result['where']).toEqual({ tenantId: TENANT });
  });

  it('injects tenantId into data on create', () => {
    const result = applyTenantScope(
      'StatusEvent',
      'create',
      { data: { newStatus: 'IN_TRIAGE' } },
      TENANT,
    );
    expect(result['data']).toEqual({
      newStatus: 'IN_TRIAGE',
      tenantId: TENANT,
    });
  });

  it('injects tenantId into every item on createMany with array data', () => {
    const result = applyTenantScope(
      'Media',
      'createMany',
      { data: [{ storageUrl: 'a' }, { storageUrl: 'b' }] },
      TENANT,
    );
    expect(result['data']).toEqual([
      { storageUrl: 'a', tenantId: TENANT },
      { storageUrl: 'b', tenantId: TENANT },
    ]);
  });

  it('scopes where, create and update on upsert', () => {
    const result = applyTenantScope(
      'AdminUser',
      'upsert',
      { where: { clerkUserId: 'u1' }, create: { role: 'ADMIN' }, update: {} },
      TENANT,
    );
    expect(result['where']).toEqual({ clerkUserId: 'u1', tenantId: TENANT });
    expect(result['create']).toEqual({ role: 'ADMIN', tenantId: TENANT });
    expect(result['update']).toEqual({ tenantId: TENANT });
  });

  it('scopes the Notification model (E5 idempotency ledger)', () => {
    const result = applyTenantScope(
      'Notification',
      'findFirst',
      { where: { eventId: 'evt-1', recipient: 'CITIZEN' } },
      TENANT,
    );
    expect(result['where']).toEqual({
      eventId: 'evt-1',
      recipient: 'CITIZEN',
      tenantId: TENANT,
    });
  });

  it('leaves non tenant-scoped models untouched', () => {
    const args = { where: { slug: 'saae' } };
    expect(applyTenantScope('Tenant', 'findFirst', args, TENANT)).toBe(args);
  });

  describe('soft delete (active)', () => {
    it('injects active: true on ServiceRequest reads', () => {
      const result = applyTenantScope(
        'ServiceRequest',
        'findMany',
        { where: { status: 'OPEN' } },
        TENANT,
      );
      expect(result['where']).toEqual({
        status: 'OPEN',
        tenantId: TENANT,
        active: true,
      });
    });

    it('injects active: true on findUnique reads (e.g. by protocol)', () => {
      const result = applyTenantScope(
        'ServiceRequest',
        'findUnique',
        { where: { protocol: 'ABCDEFGH2345' } },
        TENANT,
      );
      expect(result['where']).toEqual({
        protocol: 'ABCDEFGH2345',
        tenantId: TENANT,
        active: true,
      });
    });

    it('does NOT inject active on writes (so toggling active can reach the row)', () => {
      const result = applyTenantScope(
        'ServiceRequest',
        'update',
        { where: { id: 'sr-1' }, data: { active: false } },
        TENANT,
      );
      expect(result['where']).toEqual({ id: 'sr-1', tenantId: TENANT });
    });

    it('does NOT inject active on tenant-scoped models without the flag', () => {
      const result = applyTenantScope(
        'StatusEvent',
        'findMany',
        { where: {} },
        TENANT,
      );
      expect(result['where']).toEqual({ tenantId: TENANT });
    });
  });
});

describe('tenant context', () => {
  it('binds and reads the tenant within runWithTenant', () => {
    runWithTenant(TENANT, () => {
      expect(getTenantId()).toBe(TENANT);
      expect(requireTenantId()).toBe(TENANT);
    });
  });

  it('is empty outside of a tenant scope', () => {
    expect(getTenantId()).toBeUndefined();
  });

  it('requireTenantId throws outside of a tenant scope (fail-closed)', () => {
    expect(() => requireTenantId()).toThrow(/runWithTenant/);
  });
});
