import { randomBytes } from 'node:crypto';

/**
 * Unambiguous alphabet (no 0/O/1/I/L) — protocols are read over the phone.
 * 12 chars over 31 symbols ≈ 59 bits of entropy: non-enumerable by design
 * (I1) so the public tracking route cannot be brute-forced for PII.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const LENGTH = 12;

export function generateProtocol(): string {
  const bytes = randomBytes(LENGTH);
  let protocol = '';
  for (let i = 0; i < LENGTH; i++) {
    protocol += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return protocol;
}
