/**
 * Outbox Worker
 *
 * Processes async jobs:
 * - Expires invites past their expiration date
 * - Processes uploaded media (sharp variants + placeholder, mark ready)
 * - Deletes pending/uploaded unattached media older than 24h
 * - Optional interval backfill for media that missed variant generation
 */

import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { backfillMediaVariants, processOneMedia } from './process-media.js';

const sql = postgres(process.env.DATABASE_URL || '');
const bucket = process.env.STORAGE_BUCKET || 'private-media';
const serviceKey =
  process.env.SWY_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabase =
  supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

console.log('Worker started');

async function expireInvites() {
  try {
    const result = await sql`
      UPDATE invites
      SET status = 'expired'
      WHERE status = 'pending'
        AND expires_at < NOW()
    `;

    if (result.count > 0) {
      console.log(`Expired ${result.count} invites`);
    }
  } catch (error) {
    console.error('Error expiring invites:', error);
  }
}

async function processMediaJobs() {
  try {
    const jobs = await sql`
      SELECT id, payload
      FROM outbox
      WHERE type = 'media_process' AND sent_at IS NULL
      ORDER BY id
      LIMIT 20
    `;

    for (const job of jobs) {
      const mediaId = (job.payload as { media_id?: string }).media_id;
      if (mediaId) {
        await processOneMedia(sql, supabase, bucket, mediaId);
      }
      await sql`UPDATE outbox SET sent_at = NOW() WHERE id = ${job.id}`;
    }
  } catch (error) {
    console.error('Error processing media jobs:', error);
  }
}

async function backfillMissingVariants() {
  try {
    const result = await backfillMediaVariants(sql, supabase, bucket, 20);
    if (result.processed > 0) {
      console.log(
        `Backfilled media variants processed=${result.processed} skipped=${result.skipped} failed=${result.failed}`
      );
    }
  } catch (error) {
    console.error('Error backfilling media variants:', error);
  }
}

async function cleanupOrphanMedia() {
  try {
    const rows = await sql`
      SELECT id, storage_key, thumb_key
      FROM media
      WHERE deleted_at IS NULL
        AND story_id IS NULL
        AND status IN ('pending', 'uploaded')
        AND created_at <= NOW() - INTERVAL '24 hours'
    `;
    if (rows.length === 0) return;

    const ids = rows.map((row) => row.id);
    const variantRows =
      ids.length > 0
        ? await sql`SELECT storage_key FROM media_variants WHERE media_id = ANY(${ids})`
        : [];
    const keys = [
      ...rows.flatMap((row) => [row.storage_key, row.thumb_key]),
      ...variantRows.map((row) => row.storage_key),
    ].filter(Boolean);
    if (supabase && keys.length > 0) {
      await supabase.storage.from(bucket).remove(keys as string[]);
    }
    await sql`DELETE FROM media WHERE id = ANY(${ids})`;
    console.log(`Cleaned ${rows.length} orphan media rows`);
  } catch (error) {
    console.error('Error cleaning orphan media:', error);
  }
}

expireInvites();
processMediaJobs();
cleanupOrphanMedia();
backfillMissingVariants();

setInterval(expireInvites, 5 * 60 * 1000);
setInterval(processMediaJobs, 30 * 1000);
setInterval(cleanupOrphanMedia, 15 * 60 * 1000);
setInterval(backfillMissingVariants, 5 * 60 * 1000);

setInterval(() => {
  console.log('Worker heartbeat');
}, 30000);
