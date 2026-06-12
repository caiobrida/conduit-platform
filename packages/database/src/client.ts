import { PrismaClient, Prisma } from './generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { requireTenantId } from './tenant-context.js';
import { applyTenantScope, TENANT_SCOPED_MODELS } from './tenant-scope.js';

/**
 * Query extension that injects the tenant filter on every operation against
 * tenant-scoped models (fail-closed: throws when no tenant is bound).
 * First isolation layer — RLS in Postgres is the second.
 */
export function tenantScopingExtension() {
  return Prisma.defineExtension({
    name: 'tenant-scoping',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }
          const tenantId = requireTenantId();
          return query(
            applyTenantScope(
              model,
              operation,
              args as Record<string, unknown>,
              tenantId,
            ) as typeof args,
          );
        },
      },
    },
  });
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const baseClient = new PrismaClient({ adapter });

/**
 * Client WITHOUT tenant scoping — shares the same connection pool as
 * `prisma`. Restricted to bootstrap paths that run before a tenant is
 * known (e.g. resolving AdminUser from a Clerk user id, resolving a
 * public tenant slug). Never use it inside request handlers.
 */
export const systemPrisma = baseClient;

export const prisma = baseClient.$extends(tenantScopingExtension());

export type TenantScopedPrismaClient = typeof prisma;
