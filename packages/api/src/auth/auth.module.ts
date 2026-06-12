import { Module } from '@nestjs/common';
import { ClerkTokenVerifier } from './clerk-token.verifier';
import { AdminGuard } from './admin.guard';

@Module({
  providers: [ClerkTokenVerifier, AdminGuard],
  exports: [ClerkTokenVerifier, AdminGuard],
})
export class AuthModule {}
