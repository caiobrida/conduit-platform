/** Injection token for the shared ioredis client (null when Redis is off). */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * TTLs (seconds) per key type. Short TTLs are a safety net on top of the
 * active invalidation (D3) — they bound staleness even if an invalidation
 * event is lost.
 */
export const CACHE_TTL = {
  /** Public tracking detail — hot read, actively invalidated on writes. */
  PROTOCOL_DETAIL: 60,
  /** Tenant resolution by public slug — changes rarely. */
  TENANT_BY_SLUG: 300,
  /** Admin queue pages — actively invalidated via version bump. */
  ADMIN_LIST: 30,
} as const;

/**
 * Key builders. Every tenant-scoped key is prefixed with `t:{tenantId}` so
 * tenant isolation also holds inside Redis — a bug in one tenant's key can
 * never read another tenant's data.
 */
export const cacheKeys = {
  tenantBySlug: (slug: string) => `tenant:slug:${slug}`,
  protocolDetail: (tenantId: string, protocol: string) =>
    `t:${tenantId}:sr:proto:${protocol}`,
  /** Version counter for the tenant's admin list pages (O(1) invalidation). */
  adminListVersion: (tenantId: string) => `t:${tenantId}:sr:list:ver`,
  adminList: (tenantId: string, version: number, queryHash: string) =>
    `t:${tenantId}:sr:list:v${version}:${queryHash}`,
} as const;
