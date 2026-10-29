import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { EVENT_DELETE_COOLING_DAYS } from '@still-with-you/contracts';
import { db, accounts, contributions, media } from './db/index.js';
import { loadVariantKeys, signCoverImage, type SignedImageSet } from './media/variants.js';

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

const EMPTY_COVER: SignedImageSet = {
  url: null,
  url_expires_at: null,
  placeholder: null,
  full_url: null,
  full_url_expires_at: null,
};

export function toEventResponse(
  event: EventRow,
  cover: SignedImageSet | null = null,
  creatorDisplayName: string | null = null
) {
  const schedule = archiveSchedule(event.archivedAt);
  const image = cover ?? EMPTY_COVER;
  return {
    id: event.id,
    family_id: event.familyId,
    creator_account_id: event.creatorAccountId,
    creator_display_name: creatorDisplayName,
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
    cover_url: image.url,
    cover_url_expires_at: image.url_expires_at,
    cover_placeholder: image.placeholder,
    full_url: image.full_url,
    full_url_expires_at: image.full_url_expires_at,
  };
}

export type EventCoverKind = 'card' | 'detail';

/** First completed photo of the earliest published story, signed on every response. */
export async function loadEventCovers(
  eventIds: string[],
  kind: EventCoverKind = 'detail'
): Promise<Map<string, SignedImageSet>> {
  const unique = [...new Set(eventIds)];
  const covers = new Map<string, SignedImageSet>();
  if (unique.length === 0) return covers;

  const rows = await db
    .select({
      eventId: contributions.eventId,
      mediaId: media.id,
      storageKey: media.storageKey,
      placeholderWebp: media.placeholderWebp,
      status: media.status,
      deletedAt: media.deletedAt,
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

  const firstByEvent = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!row.eventId || firstByEvent.has(row.eventId)) continue;
    firstByEvent.set(row.eventId, row);
  }

  const variants = await loadVariantKeys([...firstByEvent.values()].map((row) => row.mediaId));
  for (const [eventId, row] of firstByEvent) {
    covers.set(
      eventId,
      await signCoverImage(
        {
          storageKey: row.storageKey,
          placeholderWebp: row.placeholderWebp,
          status: row.status,
          deletedAt: row.deletedAt,
        },
        variants.get(row.mediaId),
        kind
      )
    );
  }
  return covers;
}

/** @deprecated use loadEventCovers */
export async function loadEventCoverUrls(
  eventIds: string[],
  kind: EventCoverKind = 'detail'
): Promise<Map<string, string>> {
  const covers = await loadEventCovers(eventIds, kind);
  const urls = new Map<string, string>();
  for (const [id, image] of covers) {
    if (image.url) urls.set(id, image.url);
  }
  return urls;
}

async function loadCreatorDisplayNames(eventRows: EventRow[]): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>();
  const accountIds = [
    ...new Set(eventRows.map((event) => event.creatorAccountId).filter((id): id is string => Boolean(id))),
  ];
  if (accountIds.length === 0) {
    for (const event of eventRows) names.set(event.id, null);
    return names;
  }

  const rows = await db
    .select({ id: accounts.id, displayName: accounts.displayName })
    .from(accounts)
    .where(inArray(accounts.id, accountIds));
  const byAccount = new Map(rows.map((row) => [row.id, row.displayName]));
  for (const event of eventRows) {
    names.set(event.id, event.creatorAccountId ? (byAccount.get(event.creatorAccountId) ?? null) : null);
  }
  return names;
}

export async function presentEvents(
  eventRows: EventRow[],
  kind: EventCoverKind = 'detail',
  creatorDisplayNames?: ReadonlyMap<string, string | null>
) {
  const covers = await loadEventCovers(
    eventRows.map((event) => event.id),
    kind
  );
  const names = creatorDisplayNames ?? (await loadCreatorDisplayNames(eventRows));
  return eventRows.map((event) =>
    toEventResponse(event, covers.get(event.id) ?? null, names.get(event.id) ?? null)
  );
}

/** List presenters: pass rows already joined to `accounts.display_name`. */
export async function presentEventRows(
  rows: { event: EventRow; creatorDisplayName: string | null }[],
  kind: EventCoverKind = 'detail'
) {
  return presentEvents(
    rows.map((row) => row.event),
    kind,
    new Map(rows.map((row) => [row.event.id, row.creatorDisplayName]))
  );
}

export async function presentEvent(event: EventRow) {
  const [presented] = await presentEvents([event], 'detail');
  return presented;
}
