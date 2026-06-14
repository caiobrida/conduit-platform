import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { EventPublisherListener } from './event-publisher.listener';
import { EXCHANGE, ROUTING_KEY } from './messaging.constants';
import type { ServiceRequestCreatedEvent } from '../events/domain-events';

const CREATED = {
  tenantId: 'tenant-a',
  serviceRequestId: 'sr-1',
  protocol: 'ABCDEFGH2345',
} as ServiceRequestCreatedEvent;

describe('EventPublisherListener', () => {
  it('publishes to the main exchange with the routing key and a stamped eventId', async () => {
    const publish = jest.fn().mockResolvedValue(true);
    const listener = new EventPublisherListener({
      publish,
    } as unknown as AmqpConnection);

    await listener.onServiceRequestCreated(CREATED);

    expect(publish).toHaveBeenCalledWith(
      EXCHANGE.MAIN,
      ROUTING_KEY.SR_CREATED,
      expect.objectContaining({
        tenantId: 'tenant-a',
        eventId: expect.any(String),
      }),
      expect.objectContaining({ persistent: true }),
    );
  });

  it('no-ops when there is no broker connection', async () => {
    const listener = new EventPublisherListener(undefined);
    await expect(
      listener.onServiceRequestCreated(CREATED),
    ).resolves.toBeUndefined();
  });
});
