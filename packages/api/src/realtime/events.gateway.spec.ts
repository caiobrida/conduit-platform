import { Socket } from 'socket.io';
import { EventsGateway } from './events.gateway';
import { ClerkTokenVerifier } from '../auth/clerk-token.verifier';

jest.mock('@org/database', () => {
  const actual = jest.requireActual('@org/database');
  return {
    ...actual,
    systemPrisma: { adminUser: { findUnique: jest.fn() } },
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { systemPrisma } = require('@org/database') as {
  systemPrisma: { adminUser: { findUnique: jest.Mock } };
};

const makeSocket = (token?: string) =>
  ({
    handshake: { auth: { token }, headers: {} },
    join: jest.fn(),
    disconnect: jest.fn(),
  }) as unknown as Socket;

describe('EventsGateway (C7)', () => {
  const verify = jest.fn();
  const gateway = new EventsGateway({
    verify,
  } as unknown as ClerkTokenVerifier);
  const emit = jest.fn();
  gateway.server = {
    to: jest.fn().mockReturnValue({ emit }),
  } as never;

  beforeEach(() => jest.clearAllMocks());

  it('disconnects sockets without a valid token', async () => {
    verify.mockResolvedValue(null);
    const socket = makeSocket('bad');
    await gateway.handleConnection(socket);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('disconnects authenticated users that are not admins', async () => {
    verify.mockResolvedValue({ clerkUserId: 'user_x' });
    systemPrisma.adminUser.findUnique.mockResolvedValue(null);
    const socket = makeSocket('valid');
    await gateway.handleConnection(socket);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('joins exactly the tenant room of the admin (isolation)', async () => {
    verify.mockResolvedValue({ clerkUserId: 'user_1' });
    systemPrisma.adminUser.findUnique.mockResolvedValue({
      id: 'admin-1',
      tenantId: 'tenant-a',
    });
    const socket = makeSocket('valid');
    await gateway.handleConnection(socket);
    expect(socket.join).toHaveBeenCalledWith('tenant:tenant-a');
    expect(socket.join).toHaveBeenCalledTimes(1);
  });

  it('emits created/status events only to the tenant room', () => {
    gateway.onServiceRequestCreated({
      tenantId: 'tenant-a',
    } as Parameters<EventsGateway['onServiceRequestCreated']>[0]);
    expect(gateway.server.to).toHaveBeenCalledWith('tenant:tenant-a');
    expect(emit).toHaveBeenCalledWith(
      'service-request.created',
      expect.objectContaining({ tenantId: 'tenant-a' }),
    );

    gateway.onStatusChanged({
      tenantId: 'tenant-b',
    } as Parameters<EventsGateway['onStatusChanged']>[0]);
    expect(gateway.server.to).toHaveBeenCalledWith('tenant:tenant-b');
  });
});
