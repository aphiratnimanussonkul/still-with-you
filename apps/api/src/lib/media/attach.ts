import { and, eq, inArray, isNull } from 'drizzle-orm';
import { AppError, ErrorCode } from '@still-with-you/contracts';
import { db, media } from '../db/index.js';
import { env } from '../env.js';
import { getMediaStorage } from './storage.js';

type DbClient = {
  select: typeof db.select;
  update: typeof db.update;
  delete: typeof db.delete;
};

/**
 * Attach media_ids to a story (contribution). Replaces the current set when replacing=true.
 * Detached rows are soft-deleted.
 */
export async function attachMediaToStory(
  client: DbClient,
  opts: {
    storyId: string;
    familyId: string;
    authorId: string;
    mediaIds: string[];
    replace: boolean;
  }
): Promise<void> {
  const unique = [...new Set(opts.mediaIds)];
  if (unique.length > env.MEDIA_MAX_PER_CONTRIBUTION) {
    throw new AppError(ErrorCode.TOO_MANY_PHOTOS, 'Too many photos attached', 422);
  }

  if (unique.length > 0) {
    const rows = await client
      .select()
      .from(media)
      .where(and(inArray(media.id, unique), isNull(media.deletedAt)));

    if (rows.length !== unique.length) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'One or more media_ids are unknown', 400, 'media_ids');
    }

    const byId = new Map(rows.map((row) => [row.id, row]));
    const notReady: string[] = [];

    for (const id of unique) {
      const row = byId.get(id)!;
      if (row.familyId !== opts.familyId || row.uploaderAccountId !== opts.authorId) {
        throw new AppError(
          ErrorCode.INVALID_INPUT,
          'Every media_id must belong to this family and the story author',
          400,
          'media_ids'
        );
      }
      if (row.storyId && row.storyId !== opts.storyId) {
        throw new AppError(
          ErrorCode.INVALID_INPUT,
          'Media is already attached to another story',
          400,
          'media_ids'
        );
      }
      if (row.status !== 'uploaded' && row.status !== 'ready') {
        notReady.push(id);
      }
    }

    if (notReady.length > 0) {
      throw new AppError(
        ErrorCode.MEDIA_NOT_READY,
        'One or more photos are not ready to attach',
        409,
        undefined,
        { media_ids: notReady }
      );
    }
  }

  const now = new Date();

  if (opts.replace) {
    const keep = unique.length > 0 ? unique : [];
    const attached = await client
      .select({ id: media.id })
      .from(media)
      .where(and(eq(media.storyId, opts.storyId), isNull(media.deletedAt)));

    const detach = attached.map((row) => row.id).filter((id) => !keep.includes(id));
    if (detach.length > 0) {
      await client
        .update(media)
        .set({ storyId: null, deletedAt: now })
        .where(inArray(media.id, detach));
    }
  }

  if (unique.length > 0) {
    await client
      .update(media)
      .set({ storyId: opts.storyId, deletedAt: null })
      .where(inArray(media.id, unique));
  }
}

export async function hardDeleteStoryMedia(client: DbClient, storyIds: string[]): Promise<void> {
  if (storyIds.length === 0) return;
  const rows = await client
    .select({ storageKey: media.storageKey, thumbKey: media.thumbKey })
    .from(media)
    .where(inArray(media.storyId, storyIds));

  const keys = rows.flatMap((row) => [row.storageKey, row.thumbKey].filter((k): k is string => Boolean(k)));
  if (keys.length > 0) {
    await getMediaStorage().remove(keys);
  }

  await client.delete(media).where(inArray(media.storyId, storyIds));
}

export async function hardDeleteMediaRows(
  client: DbClient,
  rows: { id: string; storageKey: string; thumbKey: string | null }[]
): Promise<void> {
  if (rows.length === 0) return;
  const keys = rows.flatMap((row) => [row.storageKey, row.thumbKey].filter((k): k is string => Boolean(k)));
  await getMediaStorage().remove(keys);
  await client.delete(media).where(
    inArray(
      media.id,
      rows.map((row) => row.id)
    )
  );
}
