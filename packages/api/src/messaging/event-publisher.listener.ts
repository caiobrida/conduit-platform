import { randomUUID } from 'node:crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import {
  SERVICE_REQUEST_CREATED,
  SERVICE_REQUEST_STATUS_CHANGED,
} from '../events/domain-events';
import type {
  ServiceRequestCreatedEvent,
  ServiceRequestStatusChangedEvent,
} from '../events/domain-events';
import { EXCHANGE, ROUTING_KEY } from './messaging.constants';

/**
 * E1 — bridges the in-process domain events to RabbitMQ for durable async
 * processing. A stable `eventId` is stamped here and used as the AMQP message
 * id and idempotency key (E5). The in-process listeners (WebSocket C7, cache
 * invalidation D3) keep working independently. No broker (AmqpConnection
 * absent in dev/test without RABBITMQ_URL) → no-op.
 */
@Injectable()
export class EventPublisherListener {
  private readonly logger = new Logger(EventPublisherListener.name);

  constructor(@Optional() private readonly amqp?: AmqpConnection) {}

  @OnEvent(SERVICE_REQUEST_CREATED)
  async onServiceRequestCreated(
    event: ServiceRequestCreatedEvent,
  ): Promise<void> {
    await this.publish(ROUTING_KEY.SR_CREATED, event);
  }

  @OnEvent(SERVICE_REQUEST_STATUS_CHANGED)
  async onStatusChanged(
    event: ServiceRequestStatusChangedEvent,
  ): Promise<void> {
    await this.publish(ROUTING_KEY.SR_STATUS_CHANGED, event);
  }

  private async publish(routingKey: string, event: object): Promise<void> {
    if (!this.amqp) {
      return;
    }
    const eventId = randomUUID();
    try {
      await this.amqp.publish(
        EXCHANGE.MAIN,
        routingKey,
        { ...event, eventId },
        { messageId: eventId, persistent: true },
      );
    } catch (error) {
      // Publishing must never break the request path; the in-process
      // listeners already handled the realtime/cache concerns.
      this.logger.error(
        `Failed to publish ${routingKey} to RabbitMQ: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
