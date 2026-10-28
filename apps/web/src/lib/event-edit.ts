import {
  ErrorCode,
  eventEditConflictDetailsSchema,
  type EventResponse,
  type UpdateEvent,
} from '@still-with-you/contracts';
import { toast } from 'sonner';
import { copy, interpolate } from '@/copy';
import { api } from '@/lib/api-client';
import { ApiClientError } from '@/lib/api-errors';

export class EventEditConflictError extends Error {
  readonly code = ErrorCode.EVENT_EDIT_CONFLICT;

  constructor(public readonly currentVersion?: number) {
    super(copy['memory.edit.conflict.body']);
    this.name = 'EventEditConflictError';
  }
}

export function isEventEditConflict(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError && error.code === ErrorCode.EVENT_EDIT_CONFLICT;
}

export function currentVersionFromConflict(error: unknown): number | undefined {
  if (!isEventEditConflict(error)) return undefined;
  const parsed = eventEditConflictDetailsSchema.safeParse(error.details);
  return parsed.success ? parsed.data.current_version : undefined;
}

export type MemoryConflictField = 'title' | 'date' | 'people' | 'cover';

/** Server snapshot used only to detect which fields someone else changed. Never written into the form. */
export type MemoryEditBaseline = {
  title: string | null;
  occurred_from: string | null;
  occurred_to: string | null;
  date_precision: string | null;
  person_ids?: readonly string[];
  cover_placeholder: string | null;
  has_cover: boolean;
};

const CONFLICT_FIELD_ORDER: readonly MemoryConflictField[] = ['title', 'date', 'people', 'cover'];

export function conflictFieldLabel(field: MemoryConflictField): string {
  if (field === 'title') return copy['memory.title_label'];
  if (field === 'date') return copy['memory.conflict.field.date'];
  if (field === 'people') return copy['memory.conflict.field.people'];
  return copy['memory.conflict.field.cover'];
}

export function formatConflictFields(fields: readonly MemoryConflictField[]): string {
  return fields.map(conflictFieldLabel).join(' ');
}

export function changedFieldsMessage(fields: readonly MemoryConflictField[]): string | null {
  if (fields.length === 0) return null;
  return interpolate(copy['memory.conflict.changed_fields'], { fields: formatConflictFields(fields) });
}

export function baselineFromEvent(
  event: Pick<
    EventResponse,
    'title' | 'occurred_from' | 'occurred_to' | 'date_precision' | 'cover_url' | 'cover_placeholder'
  >,
  personIds?: readonly string[]
): MemoryEditBaseline {
  return {
    title: event.title,
    occurred_from: event.occurred_from,
    occurred_to: event.occurred_to,
    date_precision: event.date_precision,
    ...(personIds ? { person_ids: personIds } : {}),
    cover_placeholder: event.cover_placeholder,
    has_cover: Boolean(event.cover_url),
  };
}

function dateKey(baseline: MemoryEditBaseline): string {
  return `${baseline.occurred_from ?? ''}|${baseline.occurred_to ?? ''}|${baseline.date_precision ?? ''}`;
}

function peopleKey(ids: readonly string[] | undefined): string | undefined {
  if (!ids) return undefined;
  return [...ids].sort().join(',');
}

function coverKey(baseline: MemoryEditBaseline): string {
  return `${baseline.has_cover ? '1' : '0'}:${baseline.cover_placeholder ?? ''}`;
}

export function changedMemoryFields(
  before: MemoryEditBaseline,
  after: MemoryEditBaseline
): MemoryConflictField[] {
  const changed: MemoryConflictField[] = [];
  if ((before.title ?? '') !== (after.title ?? '')) changed.push('title');
  if (dateKey(before) !== dateKey(after)) changed.push('date');
  const beforePeople = peopleKey(before.person_ids);
  const afterPeople = peopleKey(after.person_ids);
  if (beforePeople !== undefined && afterPeople !== undefined && beforePeople !== afterPeople) {
    changed.push('people');
  }
  if (coverKey(before) !== coverKey(after)) changed.push('cover');
  return CONFLICT_FIELD_ORDER.filter((field) => changed.includes(field));
}

function notifyMemoryEditConflict(onOpenLatest?: () => void | Promise<void>): void {
  toast(copy['memory.edit.conflict.body'], {
    action: {
      label: copy['memory.edit.conflict.action'],
      onClick: () => onOpenLatest?.(),
    },
  });
}

/**
 * PATCH a memory using the loaded event's `version`.
 * On 409 EVENT_EDIT_CONFLICT: do not refetch, do not touch form values, notify with
 * memory.edit.conflict.* — the caller keeps the draft and opens latest only on tap.
 */
export async function saveEventEdit(
  loaded: Pick<EventResponse, 'id' | 'version'>,
  patch: Omit<UpdateEvent, 'version'>,
  options?: { onOpenLatest?: () => void | Promise<void> }
): Promise<EventResponse> {
  try {
    return await api.updateEvent(loaded.id, { ...patch, version: loaded.version });
  } catch (error) {
    if (!isEventEditConflict(error)) throw error;
    notifyMemoryEditConflict(options?.onOpenLatest);
    throw new EventEditConflictError(currentVersionFromConflict(error));
  }
}

/**
 * Fetch the latest event after the user taps "เปิดฉบับล่าสุด".
 * Returns only the new save version and which fields someone else changed.
 * Does not return event fields — callers must keep the unsaved draft as-is.
 */
export async function openLatestForConflict(
  eventId: string,
  baseline: MemoryEditBaseline
): Promise<{ saveVersion: number; changedFields: MemoryConflictField[] }> {
  const latest = await api.getEvent(eventId);
  const changedFields = changedMemoryFields(baseline, baselineFromEvent(latest));
  const message = changedFieldsMessage(changedFields);
  if (message) toast(message);
  return { saveVersion: latest.version, changedFields };
}
