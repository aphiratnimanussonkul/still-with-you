import { ErrorCode } from '@still-with-you/contracts';
import { copy, interpolate } from '@/copy';
import { formatThaiDate } from '@/lib/dates';
import { MEDIA_DEFAULTS, maxMb } from '@/lib/media-config';

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

/** Map API `error.field` onto the add/edit person form control id. */
export function fieldForError(error: unknown): string | undefined {
  if (!(error instanceof ApiClientError) || !error.field) return undefined;
  if (error.field === 'relationship.person_id' || error.field === 'relationship') {
    return 'person-related';
  }
  return error.field;
}

const CODE_COPY: Partial<Record<string, string>> = {
  [ErrorCode.STORY_REQUIRED]: copy['error.STORY_REQUIRED'],
  [ErrorCode.CONFIRM_TEXT_MISMATCH]: copy['error.CONFIRM_TEXT_MISMATCH'],
  [ErrorCode.MIXED_ORIGIN_EVENTS]: copy['error.MIXED_ORIGIN_EVENTS'],
  [ErrorCode.FILE_TYPE_NOT_ALLOWED]: copy['error.FILE_TYPE_NOT_ALLOWED'],
  [ErrorCode.UNSUPPORTED_TYPE]: copy['error.UNSUPPORTED_TYPE'],
  [ErrorCode.UPLOAD_MISMATCH]: copy['error.UPLOAD_MISMATCH'],
  [ErrorCode.MEDIA_NOT_READY]: copy['error.MEDIA_NOT_READY'],
  [ErrorCode.UNAUTHENTICATED]: copy['error.UNAUTHENTICATED'],
  [ErrorCode.NOT_FOUND]: copy['error.NOT_FOUND'],
  [ErrorCode.EVENT_NOT_ACTIVE]: copy['error.EVENT_NOT_ACTIVE'],
  [ErrorCode.EVENT_NOT_ARCHIVED]: copy['error.EVENT_NOT_ARCHIVED'],
  [ErrorCode.SOURCE_NOT_DELETED]: copy['error.SOURCE_NOT_DELETED'],
  [ErrorCode.VERSION_CONFLICT]: copy['error.VERSION_CONFLICT'],
  [ErrorCode.RATE_LIMITED]: copy['error.RATE_LIMITED'],
};

/**
 * Map an API / network error to copy v0.4 by error `code` only.
 * Details inspection is limited to NOT_YET_DELETABLE.deletable_at and
 * FILE_TOO_LARGE / TOO_MANY_PHOTOS limit fields. Field names are never
 * appended to user-facing copy.
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

    if (error.code === ErrorCode.FILE_TOO_LARGE) {
      const bytes =
        typeof error.details?.max_bytes === 'number' ? error.details.max_bytes : MEDIA_DEFAULTS.maxBytes;
      return interpolate(copy['error.FILE_TOO_LARGE'], { max_mb: maxMb(bytes) });
    }

    if (error.code === ErrorCode.TOO_MANY_PHOTOS) {
      const max =
        typeof error.details?.max_per_story === 'number'
          ? error.details.max_per_story
          : typeof error.details?.max === 'number'
            ? error.details.max
            : MEDIA_DEFAULTS.maxPerStory;
      return interpolate(copy['error.TOO_MANY_PHOTOS'], { max: String(max) });
    }

    if (error.code === ErrorCode.INVALID_INPUT) {
      return copy['error.INVALID_INPUT'];
    }

    if (error.code === 'ANSWER_REQUIRED') {
      return copy['error.ANSWER_REQUIRED'];
    }

    if (error.code === ErrorCode.TOO_MANY_FOCUS) {
      return copy['error.TOO_MANY_FOCUS'];
    }

    if (error.code === ErrorCode.ALREADY_ANSWERED) {
      return copy['error.ALREADY_ANSWERED'];
    }

    if (error.code === ErrorCode.INVALID_DEATH_DATE) {
      return copy['error.INVALID_DEATH_DATE'];
    }

    if (error.code === ErrorCode.INVALID_RELATIONSHIP || error.code === ErrorCode.RELATIONSHIP_EXISTS) {
      return copy['error.INVALID_INPUT'];
    }

    if (error.code === ErrorCode.INTERNAL_ERROR || error.status >= 500) {
      return copy['error.INTERNAL_ERROR'];
    }

    if (!error.code || error.code === 'GENERIC') {
      return copy['error.generic'];
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

  return copy['error.generic'] ?? copy['error.unknown'];
}

export function codeForFailedResponse(status: number, code?: string): string {
  if (code) return code;
  if (status >= 500) return ErrorCode.INTERNAL_ERROR;
  return 'GENERIC';
}

function isBrowserNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'TypeError' &&
    /fetch|network|Failed to fetch|Load failed|NetworkError/i.test(error.message)
  );
}
