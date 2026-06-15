/** Business models that carry tenant_id and must always be tenant-scoped. */
export const TENANT_SCOPED_MODELS: ReadonlySet<string> = new Set([
  'ServiceRequest',
  'Media',
  'StatusEvent',
  'AdminUser',
  'Notification',
]);

/**
 * Models with an `active` soft-delete flag: reads filter out inactive rows
 * automatically, so a soft-deleted record is invisible everywhere without
 * touching each call-site. Writes are NOT filtered, so an update can still
 * reach an inactive row to reactivate it (or deactivate an active one).
 */
export const SOFT_DELETE_MODELS: ReadonlySet<string> = new Set([
  'ServiceRequest',
]);

const READ_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);
const WRITE_OPS = new Set(['update', 'updateMany', 'delete', 'deleteMany']);
const CREATE_OPS = new Set(['create', 'createMany', 'upsert']);

type Args = Record<string, unknown>;

/**
 * Returns `args` with the tenant filter/data injected for the given model
 * and operation. Pure — used by the Prisma query extension in client.ts.
 */
export function applyTenantScope(
  model: string,
  operation: string,
  args: Args,
  tenantId: string,
): Args {
  if (!TENANT_SCOPED_MODELS.has(model)) {
    return args;
  }

  const scoped: Args = { ...args };

  if (READ_OPS.has(operation) || WRITE_OPS.has(operation)) {
    scoped['where'] = { ...((scoped['where'] as object) ?? {}), tenantId };
  }
  // Soft delete: hide inactive rows on reads only (writes must still reach
  // them to toggle `active`).
  if (READ_OPS.has(operation) && SOFT_DELETE_MODELS.has(model)) {
    scoped['where'] = { ...((scoped['where'] as object) ?? {}), active: true };
  }
  if (CREATE_OPS.has(operation)) {
    if (Array.isArray(scoped['data'])) {
      scoped['data'] = (scoped['data'] as object[]).map((d) => ({
        ...d,
        tenantId,
      }));
    } else if (scoped['data']) {
      scoped['data'] = { ...(scoped['data'] as object), tenantId };
    }
    if (operation === 'upsert') {
      scoped['where'] = { ...((scoped['where'] as object) ?? {}), tenantId };
      scoped['create'] = { ...((scoped['create'] as object) ?? {}), tenantId };
      scoped['update'] = { ...((scoped['update'] as object) ?? {}), tenantId };
    }
  }

  return scoped;
}
