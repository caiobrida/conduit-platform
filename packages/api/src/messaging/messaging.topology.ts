import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGE, QUEUE, RETRY_DELAY_MS } from './messaging.constants';

/**
 * Asserts the retry/DLQ topology the @RabbitSubscribe decorators don't own
 * (the main queues are declared by the consumers themselves):
 *  - retry queue: holds failed messages for RETRY_DELAY_MS (TTL), then
 *    dead-letters them back to the main exchange (preserving routing key)
 *    for another attempt — this is the backoff.
 *  - dlq queue: parking lot for messages that exhausted their retries.
 */
@Injectable()
export class MessagingTopology implements OnApplicationBootstrap {
  private readonly logger = new Logger(MessagingTopology.name);

  constructor(private readonly amqp: AmqpConnection) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const channel = this.amqp.channel;

      await channel.assertExchange(EXCHANGE.RETRY, 'topic', { durable: true });
      await channel.assertExchange(EXCHANGE.DLQ, 'topic', { durable: true });

      await channel.assertQueue(QUEUE.RETRY, {
        durable: true,
        deadLetterExchange: EXCHANGE.MAIN,
        messageTtl: RETRY_DELAY_MS,
      });
      await channel.bindQueue(QUEUE.RETRY, EXCHANGE.RETRY, '#');

      await channel.assertQueue(QUEUE.DLQ, { durable: true });
      await channel.bindQueue(QUEUE.DLQ, EXCHANGE.DLQ, '#');

      this.logger.log('RabbitMQ retry/DLQ topology asserted');
    } catch (error) {
      this.logger.error(
        `Failed to assert RabbitMQ topology: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
