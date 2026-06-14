import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate limiting only makes sense for HTTP requests. As a global APP_GUARD the
 * stock ThrottlerGuard also runs for non-HTTP execution contexts (e.g. the
 * RabbitMQ message handlers), where it crashes trying to read the HTTP
 * response (`res.header is not a function`). Skip everything that isn't HTTP.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    return super.canActivate(context);
  }
}
