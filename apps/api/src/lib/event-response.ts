import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { EVENT_DELETE_COOLING_DAYS, MEDIA_READ_TTL_SECONDS } from '@still-with-you/contracts';
import { db, contributions, media } from './db/index.js';
import { getMediaStorage } from './media/storage.js';

export const EVENT_DELETE_COOLING_MS = EVENT_DELETE_COOLING_DAYS * 24 * 60 * 60 * 1000;

export function archiveSchedule(archivedAt: Date | null): {
  archived_at: string | null;
  deletable_at: string | null;
} {
  if (!archivedAt) {
    return { archived_at: null, deletable_at: null };
  }
  return {
    archived_at: archivedAt.toISOString(),
    deletable_at: new Date(archivedAt.getTime() + EVENT_DELETE_COOLING_MS).toISOString(),
  };
}

export function isPastDeleteCooling(archivedAt: Date | null, now = new Date()): boolean {
  if (!archivedAt) {
    return false;
  }
  return archivedAt.getTime() + EVENT_DELETE_COOLING_MS <= now.getTime();
}

type EventRow = {
  id: string;
  familyId: string;
  creatorAccountId: string | null;
  title: string | null;
  description: string | null;
  occurredFrom: string | null;
  occurredTo: string | null;
  datePrecision: string | null;
  location: string | null;
  status: 'active' | 'archived' | 'deleted';
  archivedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
};

export function toEventResponse(event: EventRow, coverUrl: string | null = null) {
  const schedule = archiveSchedule(event.archivedAt);
  return {
    id: event.id,
    family_id: event.familyId,
    creator_account_id: event.creatorAccountId,
    title: event.title,
    description: event.description,
    occurred_from: event.occurredFrom,
    occurred_to: event.occurredTo,
    date_precision: event.datePrecision,
    location: event.location,
    status: event.status,
    archived_at: schedule.archived_at,
    deletable_at: schedule.deletable_at,
    deleted_at: event.deletedAt ? event.deletedAt.toISOString() : null,
    created_at: event.createdAt.toISOString(),
    updated_at: event.updatedAt.toISOString(),
    version: event.version,
    paused: event.status === 'archived',
    cover_url: coverUrl,
  };
}

/** First completed photo of the earliest published story, signed on every response. */
export async function loadEventCoverUrls(eventIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(eventIds)];
  const covers = new Map<string, string>();
  if (unique.length === 0) return covers;

  const rows = await db
    .select({
      eventId: contributions.eventId,
      storageKey: media.storageKey,
    })
    .from(contributions)
    .innerJoin(
      media,
      and(
        eq(media.storyId, contributions.id),
        eq(media.purpose, 'story'),
        isNull(media.deletedAt),
        or(eq(media.status, 'uploaded'), eq(media.status, 'ready'))
      )
    )
    .where(and(eq(contributions.status, 'published'), inArray(contributions.eventId, unique)))
    .orderBy(asc(contributions.createdAt), asc(media.createdAt));

  const storage = getMediaStorage();
  for (const row of rows) {
    if (!row.eventId || covers.has(row.eventId)) continue;
    const signed = await storage.createSignedReadUrl(row.storageKey, MEDIA_READ_TTL_SECONDS);
    covers.set(row.eventId, signed.signedUrl);
  }
  return covers;
}

export async function presentEvents(eventRows: EventRow[]) {
  const covers = await loadEventCoverUrls(eventRows.map((event) => event.id));
  return eventRows.map((event) => toEventResponse(event, covers.get(event.id) ?? null));
}

export async function presentEvent(event: EventRow) {
  const [presented] = await presentEvents([event]);
  return presented;
}
