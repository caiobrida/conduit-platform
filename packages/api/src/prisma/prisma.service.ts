import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { prisma, TenantScopedPrismaClient } from '@org/database';

/**
 * Thin Nest wrapper around the tenant-scoped Prisma client from
 * @org/database. Connects on boot (validating the Supabase pooler
 * connection) and disconnects on shutdown.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  readonly client: TenantScopedPrismaClient = prisma;

  async onModuleInit() {
    await this.client.$connect();
    await this.client.$queryRaw`SELECT 1`;
    this.logger.log('Connected to database (Supabase pooler)');
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
