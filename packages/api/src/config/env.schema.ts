import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().url(),
    DIRECT_URL: z.string().url().optional(),
    GEOCODING_BASE_URL: z
      .string()
      .url()
      .default('https://nominatim.openstreetmap.org'),
    CLERK_SECRET_KEY: z.string().min(1).optional(),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_KEY: z.string().min(1).optional(),
    /** Use rediss:// (TLS) in production — e.g. Upstash. Optional in dev. */
    REDIS_URL: z
      .string()
      .regex(/^rediss?:\/\//, 'Must be a redis:// or rediss:// URL')
      .optional(),
    /** Self-hosted Evolution API (WhatsApp) base URL — e.g. http://localhost:8080. */
    EVOLUTION_API_URL: z.string().url().optional(),
    EVOLUTION_API_KEY: z.string().min(1).optional(),
    /** Evolution instance the app sends WhatsApp messages from (dev: caiotest). */
    EVOLUTION_INSTANCE: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') {
      return;
    }
    for (const key of [
      'CLERK_SECRET_KEY',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_KEY',
      'REDIS_URL',
      'EVOLUTION_API_URL',
      'EVOLUTION_API_KEY',
      'EVOLUTION_INSTANCE',
    ] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'Required in production',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}
