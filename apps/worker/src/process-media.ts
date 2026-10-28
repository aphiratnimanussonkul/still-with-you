import postgres from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';
import { processStoredMedia, type ProcessStoredMediaResult } from '@still-with-you/image-variants';
import type { MediaVariantKind } from '@still-with-you/contracts';

type Sql = ReturnType<typeof postgres>;

export async function processOneMedia(
  sql: Sql,
  supabase: SupabaseClient | null,
  bucket: string,
  mediaId: string
): Promise<ProcessStoredMediaResult | { status: 'skipped' }> {
  const rows = await sql`
    SELECT id, family_id, storage_key, content_type, status, deleted_at, placeholder_webp
    FROM media WHERE id = ${mediaId} LIMIT 1
  `;
  const row = rows[0];
  if (!row || row.deleted_at || (row.status !== 'uploaded' && row.status !== 'ready')) {
    return { status: 'skipped' };
  }
  if (!supabase) return { status: 'skipped' };

  const existing = await sql`
    SELECT kind FROM media_variants WHERE media_id = ${mediaId}
  `;

  const result = await processStoredMedia({
    familyId: row.family_id,
    mediaId: row.id,
    storageKey: row.storage_key,
    existingPlaceholder: row.placeholder_webp,
    existingKinds: existing.map((item) => item.kind as MediaVariantKind),
    download: async () => {
      const { data, error } = await supabase.storage.from(bucket).download(row.storage_key);
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    },
    upload: async (key, body, contentType) => {
      const { error } = await supabase.storage.from(bucket).upload(key, body, {
        contentType,
        upsert: true,
      });
      if (error) throw new Error(error.message);
    },
  });

  if (result.status === 'skipped') return result;
  if (result.status === 'failed') {
    await sql`UPDATE media SET status = 'failed' WHERE id = ${mediaId}`;
    return result;
  }

  for (const item of result.inserted) {
    await sql`
      INSERT INTO media_variants (media_id, kind, storage_key, content_type, width, height, size_bytes)
      VALUES (
        ${mediaId},
        ${item.kind},
        ${item.storageKey},
        ${item.contentType},
        ${item.width},
        ${item.height},
        ${item.sizeBytes}
      )
      ON CONFLICT (media_id, kind) DO NOTHING
    `;
  }

  await sql`
    UPDATE media
    SET
      status = 'ready',
      thumb_key = ${result.thumbKey},
      placeholder_webp = ${result.placeholderDataUrl},
      width = ${result.original.width},
      height = ${result.original.height}
    WHERE id = ${mediaId}
  `;

  return result;
}

export async function backfillMediaVariants(
  sql: Sql,
  supabase: SupabaseClient | null,
  bucket: string,
  limit = 50
): Promise<{ processed: number; skipped: number; failed: number; remaining: boolean }> {
  const rows = await sql`
    SELECT id
    FROM media
    WHERE deleted_at IS NULL
      AND status IN ('uploaded', 'ready')
      AND (
        placeholder_webp IS NULL
        OR (SELECT count(*) FROM media_variants v WHERE v.media_id = media.id) < 4
      )
    ORDER BY created_at
    LIMIT ${limit}
  `;

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await processOneMedia(sql, supabase, bucket, row.id);
    if (result.status === 'processed') processed += 1;
    else if (result.status === 'failed') failed += 1;
    else skipped += 1;
  }
  return { processed, skipped, failed, remaining: rows.length === limit };
}
