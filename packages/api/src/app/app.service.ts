import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  getData(): { message: string } {
    return { message: 'Hello API' };
  }

  async getHealth(): Promise<{
    status: string;
    database: string;
    redis: 'up' | 'down' | 'disabled';
  }> {
    const [, redis] = await Promise.all([
      this.prisma.client.$queryRaw`SELECT 1`,
      this.cache.ping(),
    ]);
    return { status: 'ok', database: 'up', redis };
  }
}
