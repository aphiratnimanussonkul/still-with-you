import {
  ErrorCode,
  eventEditConflictDetailsSchema,
  type EventResponse,
  type UpdateEvent,
} from '@still-with-you/contracts';
import { toast } from 'sonner';
import { copy } from '@/copy';
import { api } from '@/lib/api-client';
import { ApiClientError } from '@/lib/api-errors';

export class EventEditConflictError extends Error {
  readonly code = ErrorCode.EVENT_EDIT_CONFLICT;

  constructor(
    public readonly latest: EventResponse,
    public readonly currentVersion: number
  ) {
    super(copy['error.EVENT_EDIT_CONFLICT']);
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

function notifyEventEditConflict(onReload?: () => void): void {
  toast(copy['error.EVENT_EDIT_CONFLICT'], {
    action: {
      label: copy['conflict.reload'],
      onClick: () => {
        onReload?.();
      },
    },
  });
}

/**
 * PATCH a memory using the loaded event's `version`. On 409 EVENT_EDIT_CONFLICT,
 * refetch GET /v1/events/{id} and notify with existing copy.
 */
export async function saveEventEdit(
  loaded: Pick<EventResponse, 'id' | 'version'>,
  patch: Omit<UpdateEvent, 'version'>,
  options?: { onReload?: (latest: EventResponse) => void | Promise<void> }
): Promise<EventResponse> {
  try {
    return await api.updateEvent(loaded.id, { ...patch, version: loaded.version });
  } catch (error) {
    if (!isEventEditConflict(error)) throw error;
    const latest = await api.getEvent(loaded.id);
    const currentVersion = currentVersionFromConflict(error) ?? latest.version;
    notifyEventEditConflict(() => {
      void options?.onReload?.(latest);
    });
    throw new EventEditConflictError(latest, currentVersion);
  }
}
