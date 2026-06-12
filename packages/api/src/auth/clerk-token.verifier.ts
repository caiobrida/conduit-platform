import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/backend';

export interface VerifiedToken {
  clerkUserId: string;
}

/**
 * Thin wrapper around Clerk JWT verification so the auth middleware/guard
 * can be unit tested without network access. Returns null for any invalid
 * token — callers translate that into 401.
 */
@Injectable()
export class ClerkTokenVerifier {
  private readonly logger = new Logger(ClerkTokenVerifier.name);
  private readonly secretKey: string | undefined;

  constructor(config: ConfigService) {
    this.secretKey = config.get<string>('CLERK_SECRET_KEY');
  }

  get isConfigured(): boolean {
    return Boolean(this.secretKey);
  }

  async verify(token: string): Promise<VerifiedToken | null> {
    if (!this.secretKey) {
      this.logger.warn('CLERK_SECRET_KEY not configured; rejecting token');
      return null;
    }
    try {
      const payload = await verifyToken(token, { secretKey: this.secretKey });
      return payload.sub ? { clerkUserId: payload.sub } : null;
    } catch {
      // Invalid/expired token — no details logged (could contain user data).
      return null;
    }
  }
}
