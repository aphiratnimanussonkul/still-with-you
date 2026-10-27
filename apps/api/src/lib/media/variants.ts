import { inArray } from 'drizzle-orm';
import {
  MEDIA_AVATAR_COVER_TTL_SECONDS,
  MEDIA_READ_TTL_SECONDS,
  type MediaVariantKind,
} from '@still-with-you/contracts';
import { db, media, mediaVariants } from '../db/index.js';
import { getMediaStorage } from './storage.js';

export type VariantKeyMap = Map<MediaVariantKind, string>;

type CompletedMedia = {
  storageKey: string;
  placeholderWebp: string | null;
  status: string;
  deletedAt: Date | null;
};

export type SignedImageSet = {
  url: string | null;
  url_expires_at: string | null;
  placeholder: string | null;
  full_url: string | null;
  full_url_expires_at: string | null;
};

const EMPTY_IMAGE: SignedImageSet = {
  url: null,
  url_expires_at: null,
  placeholder: null,
  full_url: null,
  full_url_expires_at: null,
};

export async function loadVariantKeys(mediaIds: string[]): Promise<Map<string, VariantKeyMap>> {
  const unique = [...new Set(mediaIds.filter(Boolean))];
  const map = new Map<string, VariantKeyMap>();
  if (unique.length === 0) return map;

  const rows = await db
    .select({
      mediaId: mediaVariants.mediaId,
      kind: mediaVariants.kind,
      storageKey: mediaVariants.storageKey,
    })
    .from(mediaVariants)
    .where(inArray(mediaVariants.mediaId, unique));

  for (const row of rows) {
    const byKind = map.get(row.mediaId) ?? new Map();
    byKind.set(row.kind, row.storageKey);
    map.set(row.mediaId, byKind);
  }
  return map;
}

export async function listVariantStorageKeys(mediaIds: string[]): Promise<string[]> {
  if (mediaIds.length === 0) return [];
  const rows = await db
    .select({ storageKey: mediaVariants.storageKey })
    .from(mediaVariants)
    .where(inArray(mediaVariants.mediaId, mediaIds));
  return rows.map((row) => row.storageKey);
}

export async function signCompletedImage(
  row: CompletedMedia | null | undefined,
  variants: VariantKeyMap | undefined,
  opts: { displayKind: MediaVariantKind; urlTtl: number; fullTtl: number }
): Promise<SignedImageSet> {
  if (!row || row.deletedAt) return EMPTY_IMAGE;
  if (row.status !== 'uploaded' && row.status !== 'ready') return EMPTY_IMAGE;

  const storage = getMediaStorage();
  const displayKey = variants?.get(opts.displayKind) ?? row.storageKey;
  const fullKey = variants?.get('full') ?? row.storageKey;
  const displayReady = Boolean(variants?.get(opts.displayKind));

  const [display, full] = await Promise.all([
    storage.createSignedReadUrl(displayKey, opts.urlTtl),
    storage.createSignedReadUrl(fullKey, opts.fullTtl),
  ]);

  return {
    url: display.signedUrl,
    url_expires_at: display.expiresAt.toISOString(),
    placeholder: displayReady ? row.placeholderWebp : null,
    full_url: full.signedUrl,
    full_url_expires_at: full.expiresAt.toISOString(),
  };
}

export async function signAvatarImage(
  row: (typeof media.$inferSelect) | null | undefined,
  variants?: VariantKeyMap
): Promise<SignedImageSet> {
  if (!row || row.purpose !== 'avatar') return EMPTY_IMAGE;
  return signCompletedImage(row, variants, {
    displayKind: 'avatar',
    urlTtl: MEDIA_AVATAR_COVER_TTL_SECONDS,
    fullTtl: MEDIA_AVATAR_COVER_TTL_SECONDS,
  });
}

export async function signCoverImage(
  row: CompletedMedia | null | undefined,
  variants: VariantKeyMap | undefined,
  kind: 'card' | 'detail'
): Promise<SignedImageSet> {
  return signCompletedImage(row, variants, {
    displayKind: kind === 'card' ? 'cover_card' : 'cover_detail',
    urlTtl: MEDIA_AVATAR_COVER_TTL_SECONDS,
    fullTtl: MEDIA_AVATAR_COVER_TTL_SECONDS,
  });
}

export async function signStoryImage(
  row: CompletedMedia,
  variants: VariantKeyMap | undefined
): Promise<{
  url: string;
  thumb_url: string;
  full_url: string;
  expires_at: string;
  url_expires_at: string;
  thumb_url_expires_at: string;
  full_url_expires_at: string;
}> {
  const storage = getMediaStorage();
  const thumbKey = variants?.get('cover_card') ?? row.storageKey;
  const fullKey = variants?.get('full') ?? row.storageKey;
  const [original, thumb, full] = await Promise.all([
    storage.createSignedReadUrl(row.storageKey, MEDIA_READ_TTL_SECONDS),
    storage.createSignedReadUrl(thumbKey, MEDIA_READ_TTL_SECONDS),
    storage.createSignedReadUrl(fullKey, MEDIA_READ_TTL_SECONDS),
  ]);
  const urlExpiresAt = original.expiresAt.toISOString();
  return {
    url: original.signedUrl,
    thumb_url: thumb.signedUrl,
    full_url: full.signedUrl,
    expires_at: urlExpiresAt,
    url_expires_at: urlExpiresAt,
    thumb_url_expires_at: thumb.expiresAt.toISOString(),
    full_url_expires_at: full.expiresAt.toISOString(),
  };
}
