/**
 * RabbitMQ topology (E1/E2). A single topic exchange carries the domain
 * events; failed messages flow through a retry tier (TTL backoff) and end
 * up in a parking DLQ after MAX_ATTEMPTS — see messaging.module.ts.
 */
export const EXCHANGE = {
  /** Primary topic exchange domain events are published to. */
  MAIN: 'conduit.events',
  /** Failed messages are dead-lettered here, then delayed and replayed. */
  RETRY: 'conduit.events.retry',
  /** Poison messages (exhausted retries) are parked here. */
  DLQ: 'conduit.events.dlq',
} as const;

export const QUEUE = {
  SR_CREATED: 'notifications.sr.created',
  SR_STATUS_CHANGED: 'notifications.sr.status-changed',
  /** TTL queue that replays messages back to the main exchange (backoff). */
  RETRY: 'notifications.retry',
  /** Parking lot for messages that exhausted their retries. */
  DLQ: 'notifications.dlq',
} as const;

/** Routing keys mirror the domain event names. */
export const ROUTING_KEY = {
  SR_CREATED: 'service-request.created',
  SR_STATUS_CHANGED: 'service-request.status-changed',
} as const;

/** Backoff delay (ms) a failed message waits in the retry queue before replay. */
export const RETRY_DELAY_MS = 10_000;

/** Total processing attempts before a message is parked in the DLQ. */
export const MAX_ATTEMPTS = 5;
