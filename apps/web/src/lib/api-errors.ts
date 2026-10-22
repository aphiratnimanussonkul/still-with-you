import { ErrorCode } from '@still-with-you/contracts';
import { copy, interpolate } from '@/copy';
import { formatThaiDate } from '@/lib/dates';

export class NetworkError extends Error {
  constructor() {
    super(copy['error.network']);
    this.name = 'NetworkError';
  }
}

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly field?: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

const CODE_COPY: Partial<Record<string, string>> = {
  [ErrorCode.STORY_REQUIRED]: copy['error.STORY_REQUIRED'],
  [ErrorCode.CONFIRM_TEXT_MISMATCH]: copy['error.CONFIRM_TEXT_MISMATCH'],
  [ErrorCode.MIXED_ORIGIN_EVENTS]: copy['error.MIXED_ORIGIN_EVENTS'],
  [ErrorCode.FILE_TYPE_NOT_ALLOWED]: copy['error.FILE_TYPE_NOT_ALLOWED'],
  [ErrorCode.FILE_TOO_LARGE]: copy['error.FILE_TOO_LARGE'],
  [ErrorCode.TOO_MANY_PHOTOS]: copy['error.TOO_MANY_PHOTOS'],
  [ErrorCode.UNAUTHENTICATED]: copy['error.UNAUTHENTICATED'],
  [ErrorCode.NOT_FOUND]: copy['error.NOT_FOUND'],
  [ErrorCode.EVENT_NOT_ACTIVE]: copy['error.EVENT_NOT_ACTIVE'],
  [ErrorCode.EVENT_NOT_ARCHIVED]: copy['error.EVENT_NOT_ARCHIVED'],
  [ErrorCode.SOURCE_NOT_DELETED]: copy['error.SOURCE_NOT_DELETED'],
  [ErrorCode.VERSION_CONFLICT]: copy['error.VERSION_CONFLICT'],
  [ErrorCode.RATE_LIMITED]: copy['error.RATE_LIMITED'],
};

/**
 * Map an API / network error to copy v0.2 by error `code` only.
 * The only details inspection allowed is NOT_YET_DELETABLE.deletable_at
 * (date vs null) and INVALID_INPUT.field for the generic validation suffix.
 */
export function messageForError(error: unknown): string {
  if (error instanceof NetworkError) {
    return copy['error.network'];
  }

  if (isBrowserNetworkFailure(error)) {
    return copy['error.network'];
  }

  if (error instanceof ApiClientError) {
    if (error.code === ErrorCode.NOT_YET_DELETABLE) {
      const deletableAt = error.details?.deletable_at;
      if (typeof deletableAt === 'string' && deletableAt.length > 0) {
        return interpolate(copy['error.NOT_YET_DELETABLE.has_date'], {
          วันที่: formatThaiDate(deletableAt),
        });
      }
      return copy['error.NOT_YET_DELETABLE.null'];
    }

    if (error.code === ErrorCode.FORBIDDEN) {
      return interpolate(copy['error.FORBIDDEN'], {
        ชื่อคนเริ่ม: copy['glossary.event_creator_fallback'],
      });
    }

    if (error.code === ErrorCode.LAST_ADMIN) {
      return copy['error.LAST_ADMIN'];
    }

    if (error.code === ErrorCode.INVALID_INPUT) {
      const field =
        error.field ?? (typeof error.details?.field === 'string' ? error.details.field : undefined);
      return field ? `${copy['error.INVALID_INPUT']} (${field})` : copy['error.INVALID_INPUT'];
    }

    if (error.code === ErrorCode.SOURCE_ARCHIVED) {
      return interpolate(copy['error.SOURCE_ARCHIVED'], {
        ชื่อความทรงจำ: copy['glossary.event'],
        ชื่อคนเริ่ม: copy['glossary.event_creator_fallback'],
      });
    }

    const mapped = CODE_COPY[error.code];
    if (mapped) return mapped;
  }

  return copy['error.generic'];
}

function isBrowserNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'TypeError' &&
    /fetch|network|Failed to fetch|Load failed|NetworkError/i.test(error.message)
  );
}
