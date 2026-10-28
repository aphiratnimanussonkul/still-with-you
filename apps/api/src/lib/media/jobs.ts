import { and, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { MEDIA_ORPHAN_TTL_HOURS, type MediaVariantKind } from '@still-with-you/contracts';
import { processStoredMedia } from '@still-with-you/image-variants';
import { db, media, mediaVariants, outbox } from '../db/index.js';
import { getMediaStorage } from './storage.js';
import { listVariantStorageKeys } from './variants.js';

export const OUTBOX_MEDIA_PROCESS = 'media_process';

export type ProcessMediaJobResult = 'processed' | 'skipped' | 'failed';

export async function enqueueMediaProcess(mediaId: string) {
  await db.insert(outbox).values({
    type: OUTBOX_MEDIA_PROCESS,
    payload: { media_id: mediaId },
  });
}

export async function processMediaJob(mediaId: string): Promise<ProcessMediaJobResult> {
  const [row] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
  if (!row || row.deletedAt || (row.status !== 'uploaded' && row.status !== 'ready')) {
    return 'skipped';
  }

  const existing = await db
    .select({ kind: mediaVariants.kind })
    .from(mediaVariants)
    .where(eq(mediaVariants.mediaId, mediaId));

  const storage = getMediaStorage();
  const result = await processStoredMedia({
    familyId: row.familyId,
    mediaId: row.id,
    storageKey: row.storageKey,
    existingPlaceholder: row.placeholderWebp,
    existingKinds: existing.map((item) => item.kind as MediaVariantKind),
    download: async () => {
      const object = await storage.download(row.storageKey);
      return object?.body ?? null;
    },
    upload: (key, body, contentType) => storage.upload(key, body, contentType),
  });

  if (result.status === 'skipped') {
    return 'skipped';
  }
  if (result.status === 'failed') {
    await db.update(media).set({ status: 'failed' }).where(eq(media.id, mediaId));
    return 'failed';
  }

  if (result.inserted.length > 0) {
    await db
      .insert(mediaVariants)
      .values(
        result.inserted.map((item) => ({
          mediaId,
          kind: item.kind,
          storageKey: item.storageKey,
          contentType: item.contentType,
          width: item.width,
          height: item.height,
          sizeBytes: item.sizeBytes,
        }))
      )
      .onConflictDoNothing();
  }

  await db
    .update(media)
    .set({
      status: 'ready',
      thumbKey: result.thumbKey,
      placeholderWebp: result.placeholderDataUrl,
      width: result.original.width,
      height: result.original.height,
    })
    .where(eq(media.id, mediaId));

  return 'processed';
}

export async function processPendingMediaJobs(): Promise<number> {
  const jobs = await db
    .select()
    .from(outbox)
    .where(and(eq(outbox.type, OUTBOX_MEDIA_PROCESS), isNull(outbox.sentAt)));

  for (const job of jobs) {
    const payload = job.payload as { media_id?: string };
    if (payload.media_id) {
      await processMediaJob(payload.media_id);
    }
    await db.update(outbox).set({ sentAt: new Date() }).where(eq(outbox.id, job.id));
  }
  return jobs.length;
}

/**
 * Idempotent backfill. Safe to re-run: rows that already have a placeholder and
 * all four variants are skipped without re-uploading.
 */
export async function backfillMediaVariants(opts?: { limit?: number }): Promise<{
  processed: number;
  skipped: number;
  failed: number;
}> {
  const limit = opts?.limit ?? 50;
  const rows = await db
    .select({ id: media.id })
    .from(media)
    .where(
      and(
        isNull(media.deletedAt),
        inArray(media.status, ['uploaded', 'ready']),
        sql`(
          ${media.placeholderWebp} is null
          or (
            select count(*) from media_variants v where v.media_id = ${media.id}
          ) < 4
        )`
      )
    )
    .limit(limit);

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await processMediaJob(row.id);
    if (result === 'processed') processed += 1;
    else if (result === 'skipped') skipped += 1;
    else failed += 1;
  }
  return { processed, skipped, failed };
}

export async function cleanupOrphanMedia(olderThanHours = MEDIA_ORPHAN_TTL_HOURS): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(media)
    .where(
      and(
        isNull(media.deletedAt),
        isNull(media.storyId),
        isNull(media.personId),
        inArray(media.status, ['pending', 'uploaded']),
        lte(media.createdAt, cutoff)
      )
    );

  if (rows.length === 0) return 0;

  const ids = rows.map((row) => row.id);
  const variantKeys = await listVariantStorageKeys(ids);
  const storage = getMediaStorage();
  await storage.remove([
    ...rows.flatMap((row) => [row.storageKey, row.thumbKey].filter((k): k is string => Boolean(k))),
    ...variantKeys,
  ]);
  await db.delete(media).where(inArray(media.id, ids));
  return rows.length;
}
