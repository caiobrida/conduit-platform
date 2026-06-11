-- B5 — Row Level Security as the second tenant-isolation layer.
--
-- The application's Prisma connection uses the table owner role, which
-- bypasses non-FORCED RLS — app-level isolation is enforced by the tenant
-- middleware (B4). RLS here protects every OTHER access path (Supabase
-- PostgREST anon/authenticated roles, leaked low-privilege credentials):
-- with RLS enabled and tenant-scoped policies, those roles read nothing
-- unless app.tenant_id is set for their session.

ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "status_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_users" ENABLE ROW LEVEL SECURITY;

-- Tenant-scoped policies driven by the app.tenant_id session setting.
-- current_setting(..., true) returns NULL when unset -> no rows match.
CREATE POLICY "tenant_isolation_service_requests" ON "service_requests"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_photos" ON "photos"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_status_events" ON "status_events"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_admin_users" ON "admin_users"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

-- tenants has no tenant_id column; with RLS enabled and no policy it is
-- simply invisible to non-owner roles (deny by default).
