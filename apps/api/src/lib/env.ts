/**
 * Environment variable configuration
 */

export const env = {
  // Server
  PORT: parseInt(process.env.API_PORT || '3000', 10),
  HOST: process.env.API_HOST || '0.0.0.0',
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Supabase
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',

  // Database
  DATABASE_URL: process.env.DATABASE_URL || '',

  // CORS
  WEB_ORIGIN: process.env.WEB_ORIGIN || 'http://localhost:5173',

  // Storage
  STORAGE_BUCKET: process.env.STORAGE_BUCKET || 'private-media',

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
