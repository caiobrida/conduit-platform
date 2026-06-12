import { Global, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './cache.constants';
import { CacheService } from './cache.service';
import { CacheInvalidationListener } from './cache-invalidation.listener';

/**
 * D1 — shared Redis connection + cache services, global so any module can
 * inject CacheService without re-importing. The client is null when
 * REDIS_URL is unset (local dev/test): every consumer degrades to no-op.
 *
 * TLS: use a rediss:// URL (Upstash in production) — ioredis enables TLS
 * automatically from the scheme. enableOfflineQueue=false makes commands
 * fail fast while disconnected so the fail-soft CacheService can treat
 * outages as cache misses instead of piling up requests.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis | null => {
        const logger = new Logger('RedisModule');
        const url = config.get<string>('REDIS_URL');
        if (!url) {
          logger.warn('REDIS_URL not set — cache and Redis features disabled');
          return null;
        }
        const client = new Redis(url, {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        });
        // Without a listener, a connection error crashes the process.
        client.on('error', (error) =>
          logger.warn(`Redis connection error: ${error.message}`),
        );
        return client;
      },
    },
    CacheService,
    CacheInvalidationListener,
  ],
  exports: [REDIS_CLIENT, CacheService],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis | null) {}

  async onApplicationShutdown() {
    await this.redis?.quit().catch(() => this.redis?.disconnect());
  }
}
