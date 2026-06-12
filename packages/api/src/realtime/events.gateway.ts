import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { systemPrisma } from '@org/database';
import { ClerkTokenVerifier } from '../auth/clerk-token.verifier';
import {
  SERVICE_REQUEST_CREATED,
  SERVICE_REQUEST_STATUS_CHANGED,
} from '../events/domain-events';
import type {
  ServiceRequestCreatedEvent,
  ServiceRequestStatusChangedEvent,
} from '../events/domain-events';

const tenantRoom = (tenantId: string) => `tenant:${tenantId}`;

/**
 * C7 — real-time admin updates. Handshake is authenticated with the same
 * Clerk verifier as HTTP; each socket joins only its tenant room, so
 * tenant isolation also holds for real-time events. Event payloads carry
 * no reporter PII.
 *
 * Horizontal scaling note: with >1 instance attach the socket.io Redis
 * adapter (Épico D provides the Redis connection).
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class EventsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly verifier: ClerkTokenVerifier) {}

  async handleConnection(socket: Socket) {
    const token =
      (socket.handshake.auth['token'] as string | undefined) ??
      this.bearerFrom(socket.handshake.headers.authorization);

    const verified = token ? await this.verifier.verify(token) : null;
    if (!verified) {
      socket.disconnect(true);
      return;
    }

    const adminUser = await systemPrisma.adminUser.findUnique({
      where: { clerkUserId: verified.clerkUserId },
    });
    if (!adminUser) {
      socket.disconnect(true);
      return;
    }

    await socket.join(tenantRoom(adminUser.tenantId));
    this.logger.log(`Admin socket connected (tenant ${adminUser.tenantId})`);
  }

  @OnEvent(SERVICE_REQUEST_CREATED)
  onServiceRequestCreated(event: ServiceRequestCreatedEvent) {
    this.server
      ?.to(tenantRoom(event.tenantId))
      .emit('service-request.created', event);
  }

  @OnEvent(SERVICE_REQUEST_STATUS_CHANGED)
  onStatusChanged(event: ServiceRequestStatusChangedEvent) {
    this.server
      ?.to(tenantRoom(event.tenantId))
      .emit('service-request.status-changed', event);
  }

  private bearerFrom(header: string | undefined): string | undefined {
    return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  }
}
