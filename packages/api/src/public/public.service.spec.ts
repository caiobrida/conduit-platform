import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Category, ServiceAreaLevel } from '@org/shared-types';
import { PublicService } from './public.service';
import { PrismaService } from '../prisma/prisma.service';
import { GeocodingService } from '../geocoding/geocoding.service';
import { SERVICE_REQUEST_CREATED } from '../events/domain-events';

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

const TENANT = {
  id: 'tenant-a',
  slug: 'saae-campinas',
  serviceAreaLevel: ServiceAreaLevel.CITY,
  serviceAreaValues: ['Campinas'],
};

const VALID_INPUT = {
  category: Category.STREET_LEAK,
  description: 'Water leaking on the street for two days',
  latitude: -22.9056,
  longitude: -47.0608,
  reporterName: 'Maria Silva',
  reporterPhone: '+5519999990000',
};

describe('PublicService', () => {
  const create = jest.fn();
  const findUnique = jest.fn();
  const prisma = {
    client: { serviceRequest: { create, findUnique } },
  } as unknown as PrismaService;
  const reverseGeocode = jest.fn();
  const geocoding = { reverseGeocode } as unknown as GeocodingService;
  const emit = jest.fn();
  const events = { emit } as unknown as EventEmitter2;

  const service = new PublicService(prisma, geocoding, events);

  beforeEach(() => {
    jest.clearAllMocks();
    systemPrisma.tenant.findUnique.mockResolvedValue(TENANT);
    create.mockImplementation(async ({ data, select: _select }) => ({
      id: 'sr-1',
      protocol: data.protocol,
      category: data.category,
      status: 'OPEN',
      latitude: data.latitude,
      longitude: data.longitude,
      city: data.city,
      state: data.state,
      createdAt: new Date('2026-06-12T12:00:00Z'),
    }));
  });

  describe('createServiceRequest (C1 + C8)', () => {
    it('creates inside the service area and emits the domain event', async () => {
      reverseGeocode.mockResolvedValue({
        city: 'Campinas',
        state: 'SP',
        country: 'BR',
      });

      const result = await service.createServiceRequest(
        'saae-campinas',
        VALID_INPUT,
      );

      expect(result.protocol).toMatch(/^[2-9A-HJ-KM-NP-Z]{12}$/);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-a',
            city: 'Campinas',
            state: 'SP',
            country: 'BR',
          }),
        }),
      );
      expect(emit).toHaveBeenCalledWith(
        SERVICE_REQUEST_CREATED,
        expect.objectContaining({
          tenantId: 'tenant-a',
          protocol: result.protocol,
        }),
      );
    });

    it('rejects requests outside the service area with a friendly 422 (C8)', async () => {
      reverseGeocode.mockResolvedValue({
        city: 'Guarulhos',
        state: 'SP',
        country: 'BR',
      });

      await expect(
        service.createServiceRequest('saae-campinas', VALID_INPUT),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(create).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('accepts with null locality when the geocoder is down (never denies service)', async () => {
      reverseGeocode.mockResolvedValue(null);

      const result = await service.createServiceRequest(
        'saae-campinas',
        VALID_INPUT,
      );

      expect(result.protocol).toBeDefined();
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ city: null, state: null }),
        }),
      );
    });

    it('retries on protocol collision', async () => {
      reverseGeocode.mockResolvedValue({
        city: 'Campinas',
        state: 'SP',
        country: 'BR',
      });
      create
        .mockRejectedValueOnce({ code: 'P2002' })
        .mockImplementationOnce(async ({ data }) => ({
          id: 'sr-1',
          protocol: data.protocol,
          category: data.category,
          status: 'OPEN',
          latitude: data.latitude,
          longitude: data.longitude,
          city: data.city,
          state: data.state,
          createdAt: new Date(),
        }));

      const result = await service.createServiceRequest(
        'saae-campinas',
        VALID_INPUT,
      );
      expect(result.protocol).toBeDefined();
      expect(create).toHaveBeenCalledTimes(2);
    });

    it('404s for unknown tenant slugs without revealing details', async () => {
      systemPrisma.tenant.findUnique.mockResolvedValue(null);
      await expect(
        service.createServiceRequest('nope', VALID_INPUT),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getByProtocol (C3 — LGPD minimal payload)', () => {
    it('returns status + timeline and nothing else (no reporter PII)', async () => {
      findUnique.mockResolvedValue({
        protocol: 'ABCDEFGH2345',
        category: 'STREET_LEAK',
        status: 'IN_TRIAGE',
        createdAt: new Date('2026-06-12T12:00:00Z'),
        statusEvents: [
          {
            previousStatus: 'OPEN',
            newStatus: 'IN_TRIAGE',
            createdAt: new Date('2026-06-12T13:00:00Z'),
          },
        ],
      });

      const result = await service.getByProtocol(
        'saae-campinas',
        'abcdefgh2345',
      );

      expect(result).toEqual({
        protocol: 'ABCDEFGH2345',
        category: 'STREET_LEAK',
        status: 'IN_TRIAGE',
        createdAt: '2026-06-12T12:00:00.000Z',
        timeline: [
          {
            previousStatus: 'OPEN',
            newStatus: 'IN_TRIAGE',
            createdAt: '2026-06-12T13:00:00.000Z',
          },
        ],
      });
      // LGPD: assert the payload cannot leak reporter PII.
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('reporterName');
      expect(serialized).not.toContain('reporterPhone');
      expect(Object.keys(result).sort()).toEqual([
        'category',
        'createdAt',
        'protocol',
        'status',
        'timeline',
      ]);
      // Query must select explicitly (no select: undefined / find all).
      expect(findUnique.mock.calls[0][0].select).toBeDefined();
    });

    it('404s for unknown protocols', async () => {
      findUnique.mockResolvedValue(null);
      await expect(
        service.getByProtocol('saae-campinas', 'ZZZZZZZZ9999'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
