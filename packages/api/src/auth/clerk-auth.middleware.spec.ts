import { Response } from 'express';
import { RequestWithAdmin } from './authenticated-admin';
import { getTenantId } from '@org/database';
import { ClerkAuthMiddleware } from './clerk-auth.middleware';
import { ClerkTokenVerifier } from './clerk-token.verifier';
import { AdminGuard } from './admin.guard';
import { UnauthorizedException, ExecutionContext } from '@nestjs/common';

jest.mock('@org/database', () => {
  const actual = jest.requireActual('@org/database');
  return {
    ...actual,
    systemPrisma: { adminUser: { findFirst: jest.fn() } },
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { systemPrisma } = require('@org/database') as {
  systemPrisma: { adminUser: { findFirst: jest.Mock } };
};

const makeReq = (authorization?: string) =>
  ({ headers: { authorization } }) as unknown as RequestWithAdmin;
const res = {} as Response;

describe('ClerkAuthMiddleware', () => {
  const verify = jest.fn();
  const middleware = new ClerkAuthMiddleware({
    verify,
  } as unknown as ClerkTokenVerifier);

  beforeEach(() => jest.clearAllMocks());

  it('passes through without a bearer token (no admin attached)', async () => {
    const req = makeReq(undefined);
    await middleware.use(req, res, () => {
      expect(req.admin).toBeUndefined();
      expect(getTenantId()).toBeUndefined();
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it('passes through on invalid token (route guard returns 401 later)', async () => {
    verify.mockResolvedValue(null);
    const req = makeReq('Bearer bad-token');
    await middleware.use(req, res, () => {
      expect(req.admin).toBeUndefined();
    });
  });

  it('passes through when there is no active AdminUser (unknown, deactivated, or suspended tenant)', async () => {
    // The active-admin filter excludes inactive admins and suspended tenants,
    // so all three collapse to "no row" here.
    verify.mockResolvedValue({ clerkUserId: 'user_stranger' });
    systemPrisma.adminUser.findFirst.mockResolvedValue(null);
    const req = makeReq('Bearer valid');
    await middleware.use(req, res, () => {
      expect(req.admin).toBeUndefined();
    });
  });

  it('looks up only active admins of active tenants (soft delete)', async () => {
    verify.mockResolvedValue({ clerkUserId: 'user_1' });
    systemPrisma.adminUser.findFirst.mockResolvedValue(null);
    await middleware.use(makeReq('Bearer valid'), res, () => undefined);
    expect(systemPrisma.adminUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clerkUserId: 'user_1',
          active: true,
          tenant: { is: { active: true } },
        },
      }),
    );
  });

  it('attaches the admin and binds the tenant context on success', async () => {
    verify.mockResolvedValue({ clerkUserId: 'user_1' });
    systemPrisma.adminUser.findFirst.mockResolvedValue({
      id: 'admin-1',
      clerkUserId: 'user_1',
      tenantId: 'tenant-a',
      role: 'OPERATOR',
    });
    const req = makeReq('Bearer valid');
    let observedTenant: string | undefined;
    await middleware.use(req, res, () => {
      observedTenant = getTenantId();
    });
    expect(req.admin).toEqual({
      adminUserId: 'admin-1',
      clerkUserId: 'user_1',
      tenantId: 'tenant-a',
      role: 'OPERATOR',
    });
    expect(observedTenant).toBe('tenant-a');
  });
});

describe('AdminGuard', () => {
  const contextFor = (req: Partial<RequestWithAdmin>) =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
    }) as unknown as ExecutionContext;

  it('rejects unauthenticated requests with 401', () => {
    expect(() => new AdminGuard().canActivate(contextFor({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('allows authenticated requests', () => {
    const req = { admin: { tenantId: 't' } } as unknown as RequestWithAdmin;
    expect(new AdminGuard().canActivate(contextFor(req))).toBe(true);
  });
});
