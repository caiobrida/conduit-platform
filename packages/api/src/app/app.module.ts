import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { HttpThrottlerGuard } from '../common/http-throttler.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from '../config/env.schema';
import { PrismaModule } from '../prisma/prisma.module';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { AuthModule } from '../auth/auth.module';
import { PublicModule } from '../public/public.module';
import { AdminModule } from '../admin/admin.module';
import { MediaModule } from '../media/media.module';
import { ClerkAuthMiddleware } from '../auth/clerk-auth.middleware';
import { TenantContextMiddleware } from '../tenant/tenant-context.middleware';
import { StatusTransitionService } from '../service-requests/status-transition.service';
import { RedisModule } from '../redis/redis.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    EventEmitterModule.forRoot(),
    // Global safety-net rate limit; public routes set tighter per-route
    // limits via @Throttle. With REDIS_URL the counters live in Redis (I6 —
    // distributed limit across instances); without it, in-memory (dev).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        return {
          throttlers: [{ limit: 100, ttl: 60_000 }],
          ...(redisUrl && {
            storage: new ThrottlerStorageRedisService(redisUrl),
          }),
        };
      },
    }),
    RedisModule,
    MessagingModule.register(),
    PrismaModule,
    GeocodingModule,
    AuthModule,
    PublicModule,
    AdminModule,
    MediaModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    StatusTransitionService,
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Order matters: Clerk authentication first (binds the tenant context
    // for admin requests); the dev-only x-tenant-id fallback never overrides
    // an authenticated request.
    consumer.apply(ClerkAuthMiddleware, TenantContextMiddleware).forRoutes('*');
  }
}
