import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Status } from '@org/shared-types';
import { runWithTenant } from '@org/database';
import { StatusTransitionService } from './status-transition.service';
import { PrismaService } from '../prisma/prisma.service';

describe('StatusTransitionService', () => {
  const findUnique = jest.fn();
  const update = jest.fn();
  const create = jest.fn();

  const tx = {
    serviceRequest: { findUnique, update },
    statusEvent: { create },
  };
  const client = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const service = new StatusTransitionService({
    client,
  } as unknown as PrismaService);

  const run = (input: Parameters<StatusTransitionService['transition']>[0]) =>
    runWithTenant('tenant-a', () => service.transition(input));

  beforeEach(() => jest.clearAllMocks());

  it('applies a valid transition and records a StatusEvent', async () => {
    findUnique.mockResolvedValue({ id: 'sr-1', status: Status.OPEN });
    update.mockResolvedValue({ id: 'sr-1', status: Status.IN_TRIAGE });

    const result = await run({
      serviceRequestId: 'sr-1',
      newStatus: Status.IN_TRIAGE,
      comment: 'triaging',
      author: 'operator-1',
    });

    expect(result.request).toEqual({ id: 'sr-1', status: Status.IN_TRIAGE });
    expect(result.previousStatus).toBe(Status.OPEN);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'sr-1' },
      data: { status: Status.IN_TRIAGE },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        serviceRequestId: 'sr-1',
        previousStatus: Status.OPEN,
        newStatus: Status.IN_TRIAGE,
        comment: 'triaging',
        author: 'operator-1',
        tenantId: 'tenant-a',
      }),
    });
  });

  it('rejects an invalid transition without writing anything', async () => {
    findUnique.mockResolvedValue({ id: 'sr-1', status: Status.OPEN });

    await expect(
      run({
        serviceRequestId: 'sr-1',
        newStatus: Status.RESOLVED,
        author: 'operator-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('throws NotFound for an unknown service request', async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      run({
        serviceRequestId: 'missing',
        newStatus: Status.IN_TRIAGE,
        author: 'operator-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
