import { and, eq, isNull } from 'drizzle-orm';
import { MEDIA_READ_TTL_SECONDS } from '@still-with-you/contracts';
import { db, events, media } from '../db/index.js';
import { findActiveMember } from '../authz.js';
import { getMediaStorage } from './storage.js';

type Story = {
  id: string;
  familyId: string;
  originEventId: string;
  status: string;
};

export type StoryMediaItem = {
  id: string;
  status: 'pending' | 'uploaded' | 'ready' | 'failed';
  url: string | null;
  thumb_url: string | null;
  width: number | null;
  height: number | null;
  expires_at: string | null;
};

export async function presentStoryMedia(story: Story, accountId: string): Promise<StoryMediaItem[]> {
  const rows = await db
    .select()
    .from(media)
    .where(and(eq(media.storyId, story.id), isNull(media.deletedAt)));

  if (rows.length === 0) return [];

  const member = await findActiveMember(story.familyId, accountId);
  const [origin] = await db.select().from(events).where(eq(events.id, story.originEventId)).limit(1);
  const hideUrls =
    !member ||
    story.status !== 'published' ||
    origin?.status === 'archived' ||
    origin?.status === 'deleted';

  const storage = getMediaStorage();
  const items: StoryMediaItem[] = [];

  for (const row of rows) {
    let url: string | null = null;
    let thumbUrl: string | null = null;
    let expiresAt: string | null = null;

    const canSign = !hideUrls && (row.status === 'uploaded' || row.status === 'ready');
    if (canSign) {
      const signed = await storage.createSignedReadUrl(row.storageKey, MEDIA_READ_TTL_SECONDS);
      url = signed.signedUrl;
      expiresAt = signed.expiresAt.toISOString();
      if (row.status === 'ready' && row.thumbKey) {
        const thumb = await storage.createSignedReadUrl(row.thumbKey, MEDIA_READ_TTL_SECONDS);
        thumbUrl = thumb.signedUrl;
      }
    }

    items.push({
      id: row.id,
      status: row.status,
      url,
      thumb_url: thumbUrl,
      width: row.width,
      height: row.height,
      expires_at: expiresAt,
    });
  }

  return items;
}
