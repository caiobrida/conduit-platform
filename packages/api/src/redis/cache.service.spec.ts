import type Redis from 'ioredis';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  const redisMock = () =>
    ({
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
      ping: jest.fn(),
    }) as unknown as jest.Mocked<Redis>;

  describe('with a Redis client', () => {
    let redis: jest.Mocked<Redis>;
    let cache: CacheService;

    beforeEach(() => {
      redis = redisMock();
      cache = new CacheService(redis);
    });

    it('round-trips JSON values', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ a: 1 }));
      await expect(cache.get('k')).resolves.toEqual({ a: 1 });

      await cache.set('k', { a: 1 }, 60);
      expect(redis.set).toHaveBeenCalledWith('k', '{"a":1}', 'EX', 60);
    });

    it('returns null on miss', async () => {
      redis.get.mockResolvedValue(null);
      await expect(cache.get('missing')).resolves.toBeNull();
    });

    it('is fail-soft: a Redis error behaves like a miss / no-op', async () => {
      redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
      redis.set.mockRejectedValue(new Error('ECONNREFUSED'));
      redis.del.mockRejectedValue(new Error('ECONNREFUSED'));
      redis.incr.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(cache.get('k')).resolves.toBeNull();
      await expect(cache.set('k', 1, 10)).resolves.toBeUndefined();
      await expect(cache.del('k')).resolves.toBeUndefined();
      await expect(cache.bumpVersion('v')).resolves.toBeUndefined();
      await expect(cache.getVersion('v')).resolves.toBe(0);
    });

    it('reads and bumps namespace versions', async () => {
      redis.get.mockResolvedValue('3');
      await expect(cache.getVersion('v')).resolves.toBe(3);

      await cache.bumpVersion('v');
      expect(redis.incr).toHaveBeenCalledWith('v');
    });

    it('reports redis up/down via ping', async () => {
      redis.ping.mockResolvedValue('PONG');
      await expect(cache.ping()).resolves.toBe('up');

      redis.ping.mockRejectedValue(new Error('down'));
      await expect(cache.ping()).resolves.toBe('down');
    });
  });

  describe('without a Redis client (REDIS_URL unset)', () => {
    const cache = new CacheService(null);

    it('is a complete no-op and reports disabled', async () => {
      await expect(cache.get('k')).resolves.toBeNull();
      await expect(cache.set('k', 1, 10)).resolves.toBeUndefined();
      await expect(cache.del('k')).resolves.toBeUndefined();
      await expect(cache.getVersion('v')).resolves.toBe(0);
      await expect(cache.ping()).resolves.toBe('disabled');
      expect(cache.isEnabled).toBe(false);
    });
  });
});
