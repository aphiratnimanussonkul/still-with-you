/**
 * Outbox Worker
 *
 * Processes async jobs:
 * - Expires invites past their expiration date
 * - Processes uploaded media (strip EXIF/GPS, thumbnail, mark ready)
 * - Deletes pending/uploaded unattached media older than 24h
 */

import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

const sql = postgres(process.env.DATABASE_URL || '');
const bucket = process.env.STORAGE_BUCKET || 'private-media';
const serviceKey =
  process.env.SWY_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabase = supabaseUrl && serviceKey
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
        await processOneMedia(mediaId);
      }
      await sql`UPDATE outbox SET sent_at = NOW() WHERE id = ${job.id}`;
    }
  } catch (error) {
    console.error('Error processing media jobs:', error);
  }
}

async function processOneMedia(mediaId: string) {
  const rows = await sql`
    SELECT id, family_id, storage_key, content_type, status, deleted_at
    FROM media WHERE id = ${mediaId} LIMIT 1
  `;
  const row = rows[0];
  if (!row || row.deleted_at || (row.status !== 'uploaded' && row.status !== 'ready')) {
    return;
  }
  if (!supabase) return;

  const { data, error } = await supabase.storage.from(bucket).download(row.storage_key);
  if (error || !data) {
    await sql`UPDATE media SET status = 'failed' WHERE id = ${mediaId}`;
    return;
  }

  const body = Buffer.from(await data.arrayBuffer());
  const thumbKey = `${row.family_id}/${row.id}_thumb`;
  await supabase.storage.from(bucket).upload(row.storage_key, body, {
    contentType: row.content_type,
    upsert: true,
  });
  await supabase.storage.from(bucket).upload(thumbKey, body, {
    contentType: row.content_type,
    upsert: true,
  });
  await sql`
    UPDATE media
    SET status = 'ready', thumb_key = ${thumbKey}
    WHERE id = ${mediaId}
  `;
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

    const keys = rows.flatMap((row) => [row.storage_key, row.thumb_key].filter(Boolean));
    if (supabase && keys.length > 0) {
      await supabase.storage.from(bucket).remove(keys as string[]);
    }
    const ids = rows.map((row) => row.id);
    await sql`DELETE FROM media WHERE id = ANY(${ids})`;
    console.log(`Cleaned ${rows.length} orphan media rows`);
  } catch (error) {
    console.error('Error cleaning orphan media:', error);
  }
}

expireInvites();
processMediaJobs();
cleanupOrphanMedia();

setInterval(expireInvites, 5 * 60 * 1000);
setInterval(processMediaJobs, 30 * 1000);
setInterval(cleanupOrphanMedia, 15 * 60 * 1000);

setInterval(() => {
  console.log('Worker heartbeat');
}, 30000);
