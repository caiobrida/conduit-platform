import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from '../config/env.schema';
import { PrismaModule } from '../prisma/prisma.module';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { AuthModule } from '../auth/auth.module';
import { ClerkAuthMiddleware } from '../auth/clerk-auth.middleware';
import { TenantContextMiddleware } from '../tenant/tenant-context.middleware';
import { StatusTransitionService } from '../service-requests/status-transition.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    GeocodingModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService, StatusTransitionService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Order matters: Clerk authentication first (binds the tenant context
    // for admin requests); the dev-only x-tenant-id fallback never overrides
    // an authenticated request.
    consumer.apply(ClerkAuthMiddleware, TenantContextMiddleware).forRoutes('*');
  }
}
