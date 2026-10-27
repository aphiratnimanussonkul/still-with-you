import { and, eq, isNull } from 'drizzle-orm';
import { db, events, media } from '../db/index.js';
import { findActiveMember } from '../authz.js';
import { loadVariantKeys, signStoryImage } from './variants.js';

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
  full_url: string | null;
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
  // Archived origin: no signed URLs for anyone (including the event creator).
  // Non-owners never reach here: contribution GET 404s when the origin is archived.
  const hideUrls =
    !member ||
    story.status !== 'published' ||
    origin?.status === 'archived' ||
    origin?.status === 'deleted';

  const variants = hideUrls ? new Map() : await loadVariantKeys(rows.map((row) => row.id));
  const items: StoryMediaItem[] = [];

  for (const row of rows) {
    let url: string | null = null;
    let thumbUrl: string | null = null;
    let fullUrl: string | null = null;
    let expiresAt: string | null = null;

    const canSign = !hideUrls && (row.status === 'uploaded' || row.status === 'ready');
    if (canSign) {
      const signed = await signStoryImage(row, variants.get(row.id));
      url = signed.url;
      thumbUrl = signed.thumb_url;
      fullUrl = signed.full_url;
      expiresAt = signed.expires_at;
    }

    items.push({
      id: row.id,
      status: row.status,
      url,
      thumb_url: thumbUrl,
      full_url: fullUrl,
      width: row.width,
      height: row.height,
      expires_at: expiresAt,
    });
  }

  return items;
}
