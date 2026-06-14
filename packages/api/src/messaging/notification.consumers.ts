import { Injectable, Logger } from '@nestjs/common';
import {
  AmqpConnection,
  Nack,
  RabbitSubscribe,
} from '@golevelup/nestjs-rabbitmq';
import type { ConsumeMessage } from 'amqplib';
import type {
  ServiceRequestCreatedMessage,
  ServiceRequestStatusChangedMessage,
} from '../events/domain-events';
import { NotificationService } from './notification.service';
import {
  EXCHANGE,
  MAX_ATTEMPTS,
  QUEUE,
  ROUTING_KEY,
} from './messaging.constants';

/**
 * E2 — in-process workers (same service as the API). On failure a message is
 * nacked and dead-lettered to the retry exchange, delayed in the retry queue
 * (backoff), then replayed onto the main exchange. After MAX_ATTEMPTS it is
 * parked in the DLQ instead of looping forever.
 *
 * Main queues dead-letter to the retry exchange; the retry/DLQ queues and
 * their bindings are asserted by MessagingTopology.
 */
@Injectable()
export class NotificationConsumers {
  private readonly logger = new Logger(NotificationConsumers.name);

  constructor(
    private readonly notifications: NotificationService,
    private readonly amqp: AmqpConnection,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGE.MAIN,
    routingKey: ROUTING_KEY.SR_CREATED,
    queue: QUEUE.SR_CREATED,
    queueOptions: { durable: true, deadLetterExchange: EXCHANGE.RETRY },
  })
  async onServiceRequestCreated(
    message: ServiceRequestCreatedMessage,
    amqpMsg: ConsumeMessage,
  ): Promise<Nack | undefined> {
    return this.process(ROUTING_KEY.SR_CREATED, amqpMsg, () =>
      this.notifications.handleServiceRequestCreated(message),
    );
  }

  @RabbitSubscribe({
    exchange: EXCHANGE.MAIN,
    routingKey: ROUTING_KEY.SR_STATUS_CHANGED,
    queue: QUEUE.SR_STATUS_CHANGED,
    queueOptions: { durable: true, deadLetterExchange: EXCHANGE.RETRY },
  })
  async onStatusChanged(
    message: ServiceRequestStatusChangedMessage,
    amqpMsg: ConsumeMessage,
  ): Promise<Nack | undefined> {
    return this.process(ROUTING_KEY.SR_STATUS_CHANGED, amqpMsg, () =>
      this.notifications.handleStatusChanged(message),
    );
  }

  private async process(
    routingKey: string,
    amqpMsg: ConsumeMessage,
    work: () => Promise<void>,
  ): Promise<Nack | undefined> {
    try {
      await work();
      return undefined; // ack
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempt = rejectionCount(amqpMsg) + 1;

      if (attempt >= MAX_ATTEMPTS) {
        this.logger.error(
          `Giving up on ${routingKey} after ${attempt} attempts — parking in DLQ: ${message}`,
        );
        await this.amqp.publish(EXCHANGE.DLQ, routingKey, amqpMsg.content, {
          headers: amqpMsg.properties.headers,
          messageId: amqpMsg.properties.messageId,
          persistent: true,
        });
        return undefined; // ack: it now lives in the DLQ
      }

      this.logger.warn(
        `Attempt ${attempt} for ${routingKey} failed, will retry: ${message}`,
      );
      return new Nack(false); // → retry exchange → delay → main exchange
    }
  }
}

/**
 * How many times the main queue has already rejected this message — i.e. the
 * retry count, read from the AMQP `x-death` header.
 */
function rejectionCount(msg: ConsumeMessage): number {
  const xDeath = msg.properties.headers?.['x-death'];
  if (!Array.isArray(xDeath)) {
    return 0;
  }
  const rejected = xDeath.find((entry) => entry?.reason === 'rejected') as
    | { count?: number }
    | undefined;
  return rejected?.count ? Number(rejected.count) : 0;
}
