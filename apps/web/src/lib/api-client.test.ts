import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ErrorCode, eventEditConflictDetailsSchema } from '@still-with-you/contracts';
import { copy } from '@/copy';
import { ApiClientError, messageForError } from '@/lib/api-errors';
import { mockEvents } from '@/mocks/data';

vi.mock('@/lib/supabase', () => ({
  getAccessToken: vi.fn().mockResolvedValue('tok'),
}));

import { api, request } from '@/lib/api-client';

describe('request 4xx envelope', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () =>
          JSON.stringify({
            message: 'Route GET:/v1/events/333/contributions not found',
            error: 'Not Found',
            statusCode: 404,
          }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps Fastify 404 without error.code to error.generic, never the 5xx copy', async () => {
    await expect(request('/v1/events/333/contributions', z.object({}))).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 404,
      code: 'GENERIC',
    });

    try {
      await request('/v1/events/333/contributions', z.object({}));
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      expect(messageForError(error)).toBe(copy['error.generic']);
      expect(messageForError(error)).not.toBe(copy['error.INTERNAL_ERROR']);
    }
  });
});

describe('api.updateEvent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('PATCH /v1/events/{id} always sends version from the loaded event', async () => {
    const updated = { ...mockEvents[0], title: 'หัวข้อใหม่', version: 2 };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(updated),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      api.updateEvent(mockEvents[0].id, { title: 'หัวข้อใหม่', version: mockEvents[0].version })
    ).resolves.toMatchObject({ title: 'หัวข้อใหม่', version: 2 });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(`/v1/events/${mockEvents[0].id}`),
      expect.objectContaining({ method: 'PATCH' })
    );
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body);
    expect(body).toEqual({ title: 'หัวข้อใหม่', version: 1 });
  });

  it('forwards 409 EVENT_EDIT_CONFLICT details.current_version', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        statusText: 'Conflict',
        text: async () =>
          JSON.stringify({
            error: {
              code: ErrorCode.EVENT_EDIT_CONFLICT,
              message: 'Event was modified by another edit',
              details: { current_version: 2 },
            },
          }),
      })
    );

    await expect(
      api.updateEvent(mockEvents[0].id, { title: 'ไม่ควรชนะ', version: 1 })
    ).rejects.toMatchObject({
      name: 'ApiClientError',
      code: ErrorCode.EVENT_EDIT_CONFLICT,
      status: 409,
      details: { current_version: 2 },
    });

    try {
      await api.updateEvent(mockEvents[0].id, { title: 'ไม่ควรชนะ', version: 1 });
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      expect(eventEditConflictDetailsSchema.parse((error as ApiClientError).details)).toEqual({
        current_version: 2,
      });
      expect(messageForError(error)).toBe(copy['error.EVENT_EDIT_CONFLICT']);
    }
  });
});
