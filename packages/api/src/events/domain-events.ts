import { Category, Status } from '@org/shared-types';

/**
 * In-process domain events (@nestjs/event-emitter). Consumed by the
 * WebSocket gateway (C7) and bridged to RabbitMQ for async work in E1.
 * Payloads carry no reporter PII beyond what each consumer needs.
 */
export const SERVICE_REQUEST_CREATED = 'service-request.created';
export const SERVICE_REQUEST_STATUS_CHANGED = 'service-request.status-changed';

export interface ServiceRequestCreatedEvent {
  tenantId: string;
  serviceRequestId: string;
  protocol: string;
  category: Category;
  status: Status;
  latitude: number;
  longitude: number;
  city: string | null;
  state: string | null;
  createdAt: string;
}

export interface ServiceRequestStatusChangedEvent {
  tenantId: string;
  serviceRequestId: string;
  protocol: string;
  previousStatus: Status;
  newStatus: Status;
  comment: string | null;
  changedAt: string;
}
