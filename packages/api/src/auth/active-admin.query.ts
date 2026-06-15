/**
 * Bootstrap lookup filter for "an active admin of an active tenant", keyed by
 * Clerk user id. Shared by the HTTP middleware and the WebSocket handshake so
 * a deactivated admin — or any admin of a suspended tenant — loses access
 * (soft delete) without the row being removed. Used with `findFirst` because
 * the filter is no longer a single unique field.
 */
export const activeAdminWhere = (clerkUserId: string) => ({
  clerkUserId,
  active: true,
  tenant: { is: { active: true } },
});
