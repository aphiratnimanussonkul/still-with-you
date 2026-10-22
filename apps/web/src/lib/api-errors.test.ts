import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@still-with-you/contracts';
import { copy, interpolate } from '@/copy';
import { ApiClientError, NetworkError, messageForError } from '@/lib/api-errors';
import { formatThaiDate } from '@/lib/dates';

function apiError(
  code: string,
  details?: Record<string, unknown>,
  field?: string
): ApiClientError {
  return new ApiClientError(code, 'server message must not leak', 400, field, details);
}

describe('messageForError', () => {
  it('maps FORBIDDEN by code, not by details', () => {
    const withDetails = apiError(ErrorCode.FORBIDDEN, {
      owner_display_name: 'ต้องไม่ถูกใช้',
    });
    expect(messageForError(withDetails)).toBe(
      interpolate(copy['error.FORBIDDEN'], {
        ชื่อคนเริ่ม: copy['glossary.event_creator_fallback'],
      })
    );
  });

  it('maps NOT_FOUND by code', () => {
    expect(messageForError(apiError(ErrorCode.NOT_FOUND))).toBe(copy['error.NOT_FOUND']);
  });

  it('maps NOT_YET_DELETABLE with a date', () => {
    const deletableAt = '2026-10-17T00:00:00.000Z';
    expect(
      messageForError(apiError(ErrorCode.NOT_YET_DELETABLE, { deletable_at: deletableAt }))
    ).toBe(
      interpolate(copy['error.NOT_YET_DELETABLE.has_date'], {
        วันที่: formatThaiDate(deletableAt),
      })
    );
  });

  it('maps NOT_YET_DELETABLE when deletable_at is null', () => {
    expect(
      messageForError(apiError(ErrorCode.NOT_YET_DELETABLE, { deletable_at: null }))
    ).toBe(copy['error.NOT_YET_DELETABLE.null']);
  });

  it('maps CONFIRM_TEXT_MISMATCH, LAST_ADMIN, and STORY_REQUIRED by code', () => {
    expect(messageForError(apiError(ErrorCode.CONFIRM_TEXT_MISMATCH))).toBe(
      copy['error.CONFIRM_TEXT_MISMATCH']
    );
    expect(messageForError(apiError(ErrorCode.LAST_ADMIN, { name: 'ต้องไม่ถูกใช้' }))).toBe(
      copy['error.LAST_ADMIN']
    );
    expect(messageForError(apiError(ErrorCode.STORY_REQUIRED))).toBe(copy['error.STORY_REQUIRED']);
  });

  it('maps INVALID_INPUT generically without leaking field names', () => {
    expect(messageForError(apiError(ErrorCode.INVALID_INPUT))).toBe(copy['error.INVALID_INPUT']);
    expect(messageForError(apiError(ErrorCode.INVALID_INPUT, { field: 'person_ids' }))).toBe(
      copy['error.INVALID_INPUT']
    );
    expect(messageForError(apiError(ErrorCode.INVALID_INPUT, undefined, 'title'))).toBe(
      copy['error.INVALID_INPUT']
    );
  });

  it('maps network failures to the offline body', () => {
    expect(messageForError(new NetworkError())).toBe(copy['error.network']);
    expect(messageForError(new TypeError('Failed to fetch'))).toBe(copy['error.network']);
  });

  it('maps unknown errors to the generic fallback', () => {
    expect(messageForError(new Error('boom'))).toBe(copy['error.unknown']);
    expect(messageForError(apiError('UNKNOWN_CODE'))).toBe(copy['error.unknown']);
  });

  it('interpolates FILE_TOO_LARGE from details.max_bytes or the 10MB default', () => {
    expect(
      messageForError(apiError(ErrorCode.FILE_TOO_LARGE, { max_bytes: 10 * 1024 * 1024 }))
    ).toBe(interpolate(copy['error.FILE_TOO_LARGE'], { max_mb: '10' }));
    expect(messageForError(apiError(ErrorCode.FILE_TOO_LARGE))).toBe(
      interpolate(copy['error.FILE_TOO_LARGE'], { max_mb: '10' })
    );
  });

  it('interpolates TOO_MANY_PHOTOS from details.max_per_story', () => {
    expect(
      messageForError(apiError(ErrorCode.TOO_MANY_PHOTOS, { max_per_story: 20 }))
    ).toBe(interpolate(copy['error.TOO_MANY_PHOTOS'], { max: '20' }));
  });

  it('maps upload-state codes without inventing copy', () => {
    expect(messageForError(apiError(ErrorCode.UNSUPPORTED_TYPE))).toBe(
      copy['error.UNSUPPORTED_TYPE']
    );
    expect(messageForError(apiError(ErrorCode.UPLOAD_MISMATCH))).toBe(
      copy['error.UPLOAD_MISMATCH']
    );
    expect(messageForError(apiError(ErrorCode.MEDIA_NOT_READY))).toBe(copy['error.MEDIA_NOT_READY']);
  });

  it('maps INTERNAL_ERROR and 5xx to the 5xx copy', () => {
    expect(messageForError(apiError(ErrorCode.INTERNAL_ERROR))).toBe(copy['error.INTERNAL_ERROR']);
    expect(
      messageForError(new ApiClientError('SOMETHING_ELSE', 'nope', 502))
    ).toBe(copy['error.INTERNAL_ERROR']);
  });
});
