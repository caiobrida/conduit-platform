import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedAdmin, RequestWithAdmin } from './authenticated-admin';

/** Injects the authenticated admin (set by ClerkAuthMiddleware). */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedAdmin => {
    const request = context.switchToHttp().getRequest<RequestWithAdmin>();
    if (!request.admin) {
      // AdminGuard runs first; this is a programming-error safety net.
      throw new Error('CurrentAdmin used on a route without AdminGuard');
    }
    return request.admin;
  },
);
