import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
import { MEDIA_ORPHAN_TTL_HOURS } from '@still-with-you/contracts';
import { db, media, outbox } from '../db/index.js';
import { detectImageType, readImageSize, stripJpegExif } from './magic.js';
import { getMediaStorage } from './storage.js';

export const OUTBOX_MEDIA_PROCESS = 'media_process';

export async function enqueueMediaProcess(mediaId: string) {
  await db.insert(outbox).values({
    type: OUTBOX_MEDIA_PROCESS,
    payload: { media_id: mediaId },
  });
}

export async function processMediaJob(mediaId: string): Promise<void> {
  const [row] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
  if (!row || row.deletedAt || (row.status !== 'uploaded' && row.status !== 'ready')) {
    return;
  }

  const storage = getMediaStorage();
  const object = await storage.download(row.storageKey);
  if (!object) {
    await db.update(media).set({ status: 'failed' }).where(eq(media.id, mediaId));
    return;
  }

  const type = detectImageType(object.body);
  const stripped = type === 'image/jpeg' ? stripJpegExif(object.body) : object.body;
  await storage.upload(row.storageKey, stripped, row.contentType);

  const thumbKey = `${row.familyId}/${row.id}_thumb`;
  await storage.upload(thumbKey, stripped, row.contentType);
  const size = type ? readImageSize(stripped, type) : null;

  await db
    .update(media)
    .set({
      status: 'ready',
      thumbKey,
      width: size?.width ?? row.width,
      height: size?.height ?? row.height,
    })
    .where(eq(media.id, mediaId));
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

  const storage = getMediaStorage();
  await storage.remove(
    rows.flatMap((row) => [row.storageKey, row.thumbKey].filter((k): k is string => Boolean(k)))
  );
  await db.delete(media).where(
    inArray(
      media.id,
      rows.map((row) => row.id)
    )
  );
  return rows.length;
}
