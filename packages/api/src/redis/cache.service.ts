import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './cache.constants';

/**
 * D1 — thin typed cache wrapper over the shared Redis client.
 *
 * Fail-soft by design: the cache must never take the API down. Every Redis
 * error is logged and treated as a miss (reads) or a no-op (writes), so an
 * outage degrades to "no cache" instead of 500s. When REDIS_URL is not set
 * (local dev/test) the client is null and everything is a no-op.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  get isEnabled(): boolean {
    return this.redis !== null;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch (error) {
      this.warnOnce('get', key, error);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.warnOnce('set', key, error);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.redis || keys.length === 0) return;
    try {
      await this.redis.del(...keys);
    } catch (error) {
      this.warnOnce('del', keys.join(','), error);
    }
  }

  /**
   * Current version of a namespace (0 when unset). Combined with
   * bumpVersion this gives O(1) invalidation of a whole key family
   * without SCAN/KEYS (which managed Redis providers penalize).
   */
  async getVersion(key: string): Promise<number> {
    if (!this.redis) return 0;
    try {
      const raw = await this.redis.get(key);
      return raw === null ? 0 : Number(raw);
    } catch (error) {
      this.warnOnce('getVersion', key, error);
      return 0;
    }
  }

  async bumpVersion(key: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.incr(key);
    } catch (error) {
      this.warnOnce('bumpVersion', key, error);
    }
  }

  /** Health probe for the /health endpoint. */
  async ping(): Promise<'up' | 'down' | 'disabled'> {
    if (!this.redis) return 'disabled';
    try {
      await this.redis.ping();
      return 'up';
    } catch {
      return 'down';
    }
  }

  private warnOnce(op: string, key: string, error: unknown): void {
    this.logger.warn(
      `Redis ${op} failed for "${key}" — continuing without cache: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
