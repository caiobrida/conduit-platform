import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const MEDIA_BUCKET = 'media';
const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Supabase Storage wrapper (C2/I5). The bucket is PRIVATE — content is
 * only reachable through short-lived signed URLs issued to authenticated
 * admins. The service key never leaves the server.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: SupabaseClient | null = null;

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return this.client !== null;
  }

  onModuleInit() {
    const url = this.config.get<string>('SUPABASE_URL');
    const serviceKey = this.config.get<string>('SUPABASE_SERVICE_KEY');
    if (!url || !serviceKey) {
      this.logger.warn('Supabase storage not configured; uploads disabled');
      return;
    }
    // Tolerate URLs pasted with a path (e.g. .../rest/v1/): the SDK
    // expects just the project origin.
    this.client = createClient(new URL(url).origin, serviceKey, {
      auth: { persistSession: false },
    });
    void this.ensureBucket();
  }

  private async ensureBucket() {
    if (!this.client) return;
    const { data } = await this.client.storage.getBucket(MEDIA_BUCKET);
    if (!data) {
      const { error } = await this.client.storage.createBucket(MEDIA_BUCKET, {
        public: false,
      });
      if (error && !/already exists/i.test(error.message)) {
        this.logger.error(`Failed to create media bucket: ${error.message}`);
        return;
      }
    }
    this.logger.log(`Media bucket ready (private)`);
  }

  async upload(path: string, buffer: Buffer, contentType: string) {
    if (!this.client) {
      throw new Error('Storage not configured');
    }
    const { error } = await this.client.storage
      .from(MEDIA_BUCKET)
      .upload(path, buffer, { contentType, upsert: false });
    if (error) {
      throw new Error(`Storage upload failed: ${error.message}`);
    }
  }

  async createSignedUrl(path: string): Promise<string> {
    if (!this.client) {
      throw new Error('Storage not configured');
    }
    const { data, error } = await this.client.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error || !data) {
      throw new Error(`Failed to sign URL: ${error?.message}`);
    }
    return data.signedUrl;
  }
}
