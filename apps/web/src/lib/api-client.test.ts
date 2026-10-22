import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { copy } from '@/copy';
import { ApiClientError, messageForError } from '@/lib/api-errors';

vi.mock('@/lib/supabase', () => ({
  getAccessToken: vi.fn().mockResolvedValue('tok'),
}));

import { request } from '@/lib/api-client';

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
