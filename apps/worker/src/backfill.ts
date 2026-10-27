/**
 * Idempotent media-variant backfill. Safe to re-run: existing variants are skipped.
 * Usage: pnpm --filter @still-with-you/worker backfill-media
 * Does not print secrets. Do not apply migrations from this script.
 */

import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { backfillMediaVariants } from './process-media.js';

const sql = postgres(process.env.DATABASE_URL || '');
const bucket = process.env.STORAGE_BUCKET || 'private-media';
const serviceKey =
  process.env.SWY_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabase =
  supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

const limit = Number.parseInt(process.env.MEDIA_BACKFILL_LIMIT || '50', 10);

async function main() {
  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let remaining = true;
  while (remaining) {
    const batch = await backfillMediaVariants(sql, supabase, bucket, limit);
    totalProcessed += batch.processed;
    totalSkipped += batch.skipped;
    totalFailed += batch.failed;
    remaining = batch.remaining;
    if (batch.processed + batch.failed + batch.skipped === 0) break;
  }
  console.log(
    `media variant backfill done processed=${totalProcessed} skipped=${totalSkipped} failed=${totalFailed}`
  );
  await sql.end({ timeout: 5 });
}

main().catch(async (error) => {
  console.error('media variant backfill failed', error);
  await sql.end({ timeout: 5 });
  process.exitCode = 1;
});
