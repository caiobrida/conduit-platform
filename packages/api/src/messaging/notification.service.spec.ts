import { ConfigService } from '@nestjs/config';
import { Category, Status } from '@org/shared-types';
import { NotificationService } from './notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { EvolutionClient } from './evolution.client';
import type {
  ServiceRequestCreatedMessage,
  ServiceRequestStatusChangedMessage,
} from '../events/domain-events';

jest.mock('@org/database', () => {
  const actual = jest.requireActual('@org/database');
  return {
    ...actual,
    systemPrisma: { tenant: { findUnique: jest.fn() } },
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { systemPrisma } = require('@org/database') as {
  systemPrisma: { tenant: { findUnique: jest.Mock } };
};

const CREATED: ServiceRequestCreatedMessage = {
  tenantId: 'tenant-a',
  serviceRequestId: 'sr-1',
  eventId: 'evt-1',
  protocol: 'ABCDEFGH2345',
  category: Category.SEWAGE,
  status: Status.OPEN,
  latitude: -22.9,
  longitude: -47.0,
  city: 'Campinas',
  state: 'SP',
  createdAt: '2026-06-13T12:00:00.000Z',
};

const STATUS_CHANGED: ServiceRequestStatusChangedMessage = {
  tenantId: 'tenant-a',
  serviceRequestId: 'sr-1',
  eventId: 'evt-2',
  protocol: 'ABCDEFGH2345',
  previousStatus: Status.OPEN,
  newStatus: Status.IN_TRIAGE,
  comment: null,
  changedAt: '2026-06-13T13:00:00.000Z',
};

describe('NotificationService', () => {
  const findFirst = jest.fn();
  const findFirstOrThrow = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const srFindUnique = jest.fn();
  const prisma = {
    client: {
      notification: { findFirst, findFirstOrThrow, create, update },
      serviceRequest: { findUnique: srFindUnique },
    },
  } as unknown as PrismaService;
  const sendText = jest.fn();
  const evolution = { sendText } as unknown as EvolutionClient;
  const config = {
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as ConfigService;
  const service = new NotificationService(prisma, evolution, config);

  beforeEach(() => {
    jest.clearAllMocks();
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: 'notif-1' });
    update.mockResolvedValue({ id: 'notif-1' });
    sendText.mockResolvedValue({ messageId: 'WAMID.1' });
  });

  describe('handleServiceRequestCreated (admin)', () => {
    it('sends to the tenant notification phone and marks SENT', async () => {
      systemPrisma.tenant.findUnique.mockResolvedValue({
        notificationPhone: '5519999990000',
      });

      await service.handleServiceRequestCreated(CREATED);

      expect(sendText).toHaveBeenCalledWith(
        '5519999990000',
        expect.stringContaining('ABCDEFGH2345'),
      );
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SENT' }),
        }),
      );
    });

    it('skips when the tenant has no notification phone', async () => {
      systemPrisma.tenant.findUnique.mockResolvedValue({
        notificationPhone: null,
      });

      await service.handleServiceRequestCreated(CREATED);

      expect(sendText).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });

    it('is idempotent: an already-SENT record short-circuits (redelivery)', async () => {
      systemPrisma.tenant.findUnique.mockResolvedValue({
        notificationPhone: '5519999990000',
      });
      findFirst.mockResolvedValue({ id: 'notif-1', status: 'SENT' });

      await service.handleServiceRequestCreated(CREATED);

      expect(sendText).not.toHaveBeenCalled();
    });

    it('marks FAILED and rethrows on send error (triggers retry/DLX)', async () => {
      systemPrisma.tenant.findUnique.mockResolvedValue({
        notificationPhone: '5519999990000',
      });
      sendText.mockRejectedValue(new Error('boom'));

      await expect(
        service.handleServiceRequestCreated(CREATED),
      ).rejects.toThrow('boom');
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED', error: 'boom' }),
        }),
      );
    });
  });

  describe('handleStatusChanged (citizen)', () => {
    it('sends to the reporter phone from the service request', async () => {
      srFindUnique.mockResolvedValue({ reporterPhone: '5519888887777' });

      await service.handleStatusChanged(STATUS_CHANGED);

      expect(sendText).toHaveBeenCalledWith(
        '5519888887777',
        expect.stringContaining('ABCDEFGH2345'),
      );
    });

    it('skips when the service request is gone', async () => {
      srFindUnique.mockResolvedValue(null);

      await service.handleStatusChanged(STATUS_CHANGED);

      expect(sendText).not.toHaveBeenCalled();
    });
  });
});
