import { Injectable, NestMiddleware } from '@nestjs/common';
import { Response, NextFunction } from 'express';
import { RequestWithAdmin } from './authenticated-admin';
import { runWithTenant, systemPrisma } from '@org/database';
import { AdminRole } from '@org/shared-types';
import { ClerkTokenVerifier } from './clerk-token.verifier';

/**
 * Authenticates admin routes (C6): validates the Clerk JWT, resolves the
 * AdminUser (tenant bootstrap — uses the unscoped system client), attaches
 * the identity to the request and binds the tenant to the async context so
 * the Prisma tenant-scoping extension covers the whole request.
 *
 * Implemented as middleware (not a guard) because the AsyncLocalStorage
 * scope must wrap the entire downstream pipeline. AdminGuard enforces the
 * 401/403 per route.
 */
@Injectable()
export class ClerkAuthMiddleware implements NestMiddleware {
  constructor(private readonly verifier: ClerkTokenVerifier) {}

  async use(req: RequestWithAdmin, _res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      return next();
    }

    const verified = await this.verifier.verify(token);
    if (!verified) {
      return next();
    }

    const adminUser = await systemPrisma.adminUser.findUnique({
      where: { clerkUserId: verified.clerkUserId },
    });
    if (!adminUser) {
      return next();
    }

    req.admin = {
      adminUserId: adminUser.id,
      clerkUserId: adminUser.clerkUserId,
      tenantId: adminUser.tenantId,
      role: adminUser.role as AdminRole,
    };

    runWithTenant(adminUser.tenantId, () => next());
  }
}
