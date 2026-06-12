import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response, NextFunction } from 'express';
import { RequestWithAdmin } from '../auth/authenticated-admin';
import { runWithTenant } from '@org/database';

/**
 * Binds the tenant to the async context of each request so the Prisma
 * tenant-scoping extension can filter every query.
 *
 * PROVISIONAL tenant source: the `x-tenant-id` header, accepted only
 * outside production. The real source will be the Clerk JWT -> AdminUser
 * lookup (card C6); this middleware is the single place to swap it in.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  use(req: RequestWithAdmin, _res: Response, next: NextFunction) {
    // Never override a request already authenticated by ClerkAuthMiddleware.
    if (req.admin) {
      return next();
    }
    const isProduction = this.config.get('NODE_ENV') === 'production';
    const tenantId = isProduction
      ? undefined
      : (req.headers['x-tenant-id'] as string | undefined);

    if (tenantId) {
      runWithTenant(tenantId, () => next());
    } else {
      next();
    }
  }
}
