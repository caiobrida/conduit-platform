import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RequestWithAdmin } from './authenticated-admin';

/**
 * Allows only requests authenticated by ClerkAuthMiddleware. Applied to
 * admin routes via @UseGuards(AdminGuard); public routes never use it.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithAdmin>();
    if (!request.admin) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
