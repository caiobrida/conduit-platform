import { Request } from 'express';
import { AdminRole } from '@org/shared-types';

/** Identity attached to the request by the Clerk auth middleware. */
export interface AuthenticatedAdmin {
  adminUserId: string;
  clerkUserId: string;
  tenantId: string;
  role: AdminRole;
}

/** Express request carrying the authenticated admin (set by middleware). */
export interface RequestWithAdmin extends Request {
  admin?: AuthenticatedAdmin;
}
