import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  tenantId: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

/** Runs `fn` with the given tenant bound to the async execution context. */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return storage.run({ tenantId }, fn);
}

/** Returns the tenant bound to the current async context, if any. */
export function getTenantId(): string | undefined {
  return storage.getStore()?.tenantId;
}

/** Returns the current tenant or throws — for code paths that must be scoped. */
export function requireTenantId(): string {
  const tenantId = getTenantId();
  if (!tenantId) {
    throw new Error(
      'No tenant bound to the current context. Wrap the call in runWithTenant().',
    );
  }
  return tenantId;
}
