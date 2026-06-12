import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';

/**
 * C7 (horizontal scaling) — socket.io Redis adapter so tenant rooms work
 * across multiple API instances. Only attached when REDIS_URL is set;
 * without it the default in-memory adapter is kept (single instance dev).
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  async connectToRedis(url: string): Promise<void> {
    const pubClient = new Redis(url, { maxRetriesPerRequest: 1 });
    const subClient = pubClient.duplicate();
    for (const client of [pubClient, subClient]) {
      client.on('error', (error) =>
        this.logger.warn(`Redis (socket.io adapter) error: ${error.message}`),
      );
    }
    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log('socket.io Redis adapter enabled');
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
