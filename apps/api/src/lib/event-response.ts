import { EVENT_DELETE_COOLING_DAYS } from '@still-with-you/contracts';

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

export function toEventResponse(event: EventRow) {
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
  };
}
