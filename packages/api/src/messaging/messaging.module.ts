import { DynamicModule, Logger, Module } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGE } from './messaging.constants';
import { EvolutionClient } from './evolution.client';
import { NotificationService } from './notification.service';
import { EventPublisherListener } from './event-publisher.listener';
import { NotificationConsumers } from './notification.consumers';
import { MessagingTopology } from './messaging.topology';

/**
 * E1 — wires the WhatsApp notification pipeline. RabbitMQ is registered only
 * when RABBITMQ_URL is set (dev brings it up via docker compose; prod
 * requires it). Without it, the EventPublisherListener no-ops (AmqpConnection
 * absent) and the app runs normally — same fail-soft philosophy as Redis.
 *
 * A single broker connection is used (golevelup default) to respect managed
 * broker connection limits (e.g. CloudAMQP free tier).
 */
@Module({})
export class MessagingModule {
  static register(): DynamicModule {
    const uri = process.env.RABBITMQ_URL;

    if (!uri) {
      new Logger(MessagingModule.name).warn(
        'RABBITMQ_URL not set — WhatsApp notification pipeline disabled',
      );
      return {
        module: MessagingModule,
        providers: [
          EvolutionClient,
          NotificationService,
          EventPublisherListener,
        ],
        exports: [EvolutionClient, NotificationService],
      };
    }

    return {
      module: MessagingModule,
      imports: [
        RabbitMQModule.forRoot({
          uri,
          exchanges: [
            { name: EXCHANGE.MAIN, type: 'topic' },
            { name: EXCHANGE.RETRY, type: 'topic' },
            { name: EXCHANGE.DLQ, type: 'topic' },
          ],
          // Don't block boot if the broker is briefly unavailable.
          connectionInitOptions: { wait: false },
        }),
      ],
      providers: [
        EvolutionClient,
        NotificationService,
        EventPublisherListener,
        NotificationConsumers,
        MessagingTopology,
      ],
      exports: [EvolutionClient, NotificationService],
    };
  }
}
