import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

/** Result of a successful send — the provider's message id for auditing. */
export interface SendTextResult {
  messageId: string | null;
}

/**
 * E3 — thin outbound client for the self-hosted Evolution API (WhatsApp).
 * Sends free-form text (Evolution needs no Meta-approved templates). Throws
 * on any non-2xx so the consumer's retry/DLX pipeline can take over. Never
 * logs the recipient number or message body (LGPD).
 */
@Injectable()
export class EvolutionClient {
  private readonly logger = new Logger(EvolutionClient.name);
  private readonly http: AxiosInstance | null;
  private readonly instance: string;

  constructor(config: ConfigService) {
    const baseURL = config.get<string>('EVOLUTION_API_URL');
    const apiKey = config.get<string>('EVOLUTION_API_KEY');
    this.instance = config.get<string>('EVOLUTION_INSTANCE') ?? '';

    this.http =
      baseURL && apiKey
        ? axios.create({
            baseURL,
            timeout: 10_000,
            headers: { apikey: apiKey, 'Content-Type': 'application/json' },
          })
        : null;

    if (!this.http) {
      this.logger.warn(
        'Evolution API not configured (EVOLUTION_API_URL/KEY) — WhatsApp sending disabled',
      );
    }
  }

  get isEnabled(): boolean {
    return this.http !== null && this.instance.length > 0;
  }

  /**
   * Sends a WhatsApp text message. `phone` is any human-entered number; it is
   * normalized to digits with the Brazil country code before sending.
   */
  async sendText(phone: string, text: string): Promise<SendTextResult> {
    if (!this.http || !this.instance) {
      throw new Error('Evolution API is not configured');
    }

    const number = normalizePhone(phone);
    const { data } = await this.http.post(
      `/message/sendText/${encodeURIComponent(this.instance)}`,
      { number, text },
    );

    // Evolution returns the WA message key; shape is lenient across versions.
    const messageId: string | null = data?.key?.id ?? data?.id ?? null;
    return { messageId };
  }
}

/**
 * Normalizes a phone number to the digits-only form Evolution expects
 * (country code + area code + number). Assumes Brazil (55) when no country
 * code is present. Exported for testing.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55')) {
    return digits;
  }
  // 10 (landline) or 11 (mobile) digits → local number missing the country code.
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}
