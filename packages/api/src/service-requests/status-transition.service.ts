import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { canTransition, Status } from '@org/shared-types';
import { requireTenantId } from '@org/database';
import { PrismaService } from '../prisma/prisma.service';

export interface TransitionInput {
  serviceRequestId: string;
  newStatus: Status;
  comment?: string | null;
  author: string;
}

/**
 * Applies a status transition to a service request (B8):
 * validates it against the state machine, updates the request and records
 * an auditable StatusEvent — atomically. Consumed by the admin update
 * endpoint (card C5).
 */
@Injectable()
export class StatusTransitionService {
  constructor(private readonly prisma: PrismaService) {}

  async transition(input: TransitionInput) {
    const { serviceRequestId, newStatus, comment, author } = input;
    const client = this.prisma.client;

    return client.$transaction(async (tx) => {
      const request = await tx.serviceRequest.findUnique({
        where: { id: serviceRequestId },
      });
      if (!request) {
        throw new NotFoundException(
          `Service request ${serviceRequestId} not found`,
        );
      }

      const currentStatus = request.status as Status;
      if (!canTransition(currentStatus, newStatus)) {
        throw new BadRequestException(
          `Invalid status transition: ${currentStatus} -> ${newStatus}`,
        );
      }

      const updated = await tx.serviceRequest.update({
        where: { id: serviceRequestId },
        data: { status: newStatus },
      });

      await tx.statusEvent.create({
        data: {
          // Also injected by the tenant-scoping extension; explicit here to
          // satisfy the generated create-input type.
          tenantId: requireTenantId(),
          serviceRequestId,
          previousStatus: currentStatus,
          newStatus,
          comment: comment ?? null,
          author,
        },
      });

      return updated;
    });
  }
}
