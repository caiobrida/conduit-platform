import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    EventEmitterModule.forRoot(),
    // Global safety-net rate limit; public routes set tighter per-route
    // limits via @Throttle (I6 — Redis storage arrives with Épico D).
    ThrottlerModule.forRoot([{ limit: 100, ttl: 60_000 }]),
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
    { provide: APP_GUARD, useClass: ThrottlerGuard },
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
