import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { runWithTenant, systemPrisma } from '@org/database';
import { NotificationRecipient } from '@org/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import {
  SERVICE_REQUEST_CREATED,
  SERVICE_REQUEST_STATUS_CHANGED,
  ServiceRequestCreatedMessage,
  ServiceRequestStatusChangedMessage,
} from '../events/domain-events';
import { EvolutionClient } from './evolution.client';
import {
  newRequestAdminMessage,
  statusChangedCitizenMessage,
} from './notification-messages';

interface DispatchInput {
  tenantId: string;
  serviceRequestId: string;
  eventId: string;
  eventType: string;
  recipient: NotificationRecipient;
  phone: string;
  text: string;
}

/**
 * E4/E5 — turns domain events into WhatsApp notifications, idempotently.
 * Every send is recorded in the `notifications` ledger; the unique
 * (tenant, eventId, recipient) makes redeliveries no-ops. No phone number
 * is persisted — it is resolved per send from the tenant / service request.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evolution: EvolutionClient,
    private readonly config: ConfigService,
  ) {}

  /** New service request → alert the tenant's admin WhatsApp number. */
  async handleServiceRequestCreated(
    event: ServiceRequestCreatedMessage,
  ): Promise<void> {
    const phone = await this.tenantNotificationPhone(event.tenantId);
    if (!phone) {
      this.logger.log(
        `Tenant ${event.tenantId} has no notificationPhone — skipping admin alert`,
      );
      return;
    }

    const text = newRequestAdminMessage({
      protocol: event.protocol,
      category: event.category,
      city: event.city,
    });

    await runWithTenant(event.tenantId, () =>
      this.recordAndSend({
        tenantId: event.tenantId,
        serviceRequestId: event.serviceRequestId,
        eventId: event.eventId,
        eventType: SERVICE_REQUEST_CREATED,
        recipient: NotificationRecipient.ADMIN,
        phone,
        text,
      }),
    );
  }

  /** Status change → notify the citizen with the public tracking link. */
  async handleStatusChanged(
    event: ServiceRequestStatusChangedMessage,
  ): Promise<void> {
    await runWithTenant(event.tenantId, async () => {
      const request = await this.prisma.client.serviceRequest.findUnique({
        where: { id: event.serviceRequestId },
        select: { reporterPhone: true },
      });
      if (!request) {
        this.logger.warn(
          `Service request ${event.serviceRequestId} not found — skipping citizen notification`,
        );
        return;
      }

      const text = statusChangedCitizenMessage({
        protocol: event.protocol,
        newStatus: event.newStatus,
        trackingUrl: this.trackingUrl(event.protocol),
      });

      await this.recordAndSend({
        tenantId: event.tenantId,
        serviceRequestId: event.serviceRequestId,
        eventId: event.eventId,
        eventType: SERVICE_REQUEST_STATUS_CHANGED,
        recipient: NotificationRecipient.CITIZEN,
        phone: request.reporterPhone,
        text,
      });
    });
  }

  /**
   * Records the notification and sends it. Idempotent: a row already marked
   * SENT short-circuits (redelivery), so the citizen/admin is never messaged
   * twice for the same event. Must run inside runWithTenant.
   */
  private async recordAndSend(input: DispatchInput): Promise<void> {
    const existing = await this.prisma.client.notification.findFirst({
      where: { eventId: input.eventId, recipient: input.recipient },
      select: { id: true, status: true },
    });

    if (existing?.status === 'SENT') {
      this.logger.log(
        `Notification ${input.eventType}/${input.recipient} for event ${input.eventId} already sent — skipping`,
      );
      return;
    }

    const row = existing
      ? await this.prisma.client.notification.update({
          where: { id: existing.id },
          data: { status: 'PENDING', attempts: { increment: 1 } },
          select: { id: true },
        })
      : await this.createRecord(input);

    try {
      const { messageId } = await this.evolution.sendText(
        input.phone,
        input.text,
      );
      await this.prisma.client.notification.update({
        where: { id: row.id },
        data: { status: 'SENT', providerMessageId: messageId, error: null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.client.notification.update({
        where: { id: row.id },
        data: { status: 'FAILED', error: message },
      });
      // Rethrow so the consumer nacks → retry/DLX pipeline takes over.
      throw error;
    }
  }

  /** Creates the ledger row, tolerating a concurrent insert (unique race). */
  private async createRecord(input: DispatchInput): Promise<{ id: string }> {
    try {
      return await this.prisma.client.notification.create({
        data: {
          tenantId: input.tenantId,
          serviceRequestId: input.serviceRequestId,
          eventId: input.eventId,
          eventType: input.eventType,
          recipient: input.recipient,
          status: 'PENDING',
          attempts: 1,
        },
        select: { id: true },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const row = await this.prisma.client.notification.findFirstOrThrow({
          where: { eventId: input.eventId, recipient: input.recipient },
          select: { id: true },
        });
        return row;
      }
      throw error;
    }
  }

  private async tenantNotificationPhone(
    tenantId: string,
  ): Promise<string | null> {
    // Tenant is the bootstrap entity (not tenant-scoped) — use systemPrisma.
    const tenant = await systemPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { notificationPhone: true },
    });
    return tenant?.notificationPhone ?? null;
  }

  private trackingUrl(protocol: string): string | null {
    const base = this.config.get<string>('PUBLIC_TRACKING_BASE_URL');
    if (!base) {
      return null;
    }
    return `${base.replace(/\/$/, '')}/${protocol}`;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  );
}
