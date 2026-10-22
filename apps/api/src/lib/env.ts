/**
 * Environment variable configuration
 */

import { z } from 'zod';

const DEFAULT_DEV_WEB_ORIGINS = ['http://localhost:5173'];

/**
 * Parse WEB_ORIGIN as a comma-separated CORS allowlist.
 * Rejects "*" entries. Empty list fails in production; otherwise defaults to localhost.
 */
export function parseWebOrigins(raw: string | undefined, nodeEnv: string): string[] {
  const schema = z
    .string()
    .optional()
    .transform((value) =>
      (value ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    )
    .superRefine((origins, ctx) => {
      if (origins.includes('*')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'WEB_ORIGIN must not include "*"',
        });
      }
      if (origins.length === 0 && nodeEnv === 'production') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'WEB_ORIGIN must be set in production',
        });
      }
    })
    .transform((origins) => (origins.length === 0 ? [...DEFAULT_DEV_WEB_ORIGINS] : origins));

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(result.error.errors[0]?.message ?? 'Invalid WEB_ORIGIN');
  }
  return result.data;
}

const NODE_ENV = process.env.NODE_ENV || 'development';

export const env = {
  // Server
  PORT: parseInt(process.env.API_PORT || '3000', 10),
  HOST: process.env.API_HOST || '0.0.0.0',
  NODE_ENV,

  // Supabase
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',

  // Database
  DATABASE_URL: process.env.DATABASE_URL || '',

  // CORS — comma-separated allowlist, parsed once
  WEB_ORIGIN: parseWebOrigins(process.env.WEB_ORIGIN, NODE_ENV),

  // Storage
  STORAGE_BUCKET: process.env.STORAGE_BUCKET || 'private-media',
  SWY_SUPABASE_SERVICE_ROLE_KEY:
    process.env.SWY_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  MEDIA_MAX_BYTES: parseInt(process.env.MEDIA_MAX_BYTES || '20971520', 10),
  MEDIA_MAX_PER_CONTRIBUTION: parseInt(process.env.MEDIA_MAX_PER_CONTRIBUTION || '20', 10),

  // Rate limiting
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),

  // JWT
  get JWT_ISSUER() {
    return `${this.SUPABASE_URL}/auth/v1`;
  },
  get JWKS_URI() {
    return `${this.SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
  },
} as const;

// Validate required env vars
const required = ['SUPABASE_URL', 'DATABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const key of required) {
  if (!env[key as keyof typeof env]) {
    throw new Error(`Environment variable ${key} is required`);
  }
}
