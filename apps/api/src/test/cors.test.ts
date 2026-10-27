import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer } from './helpers.js';
import { parseTrueFalseFlag, parseWebOrigins } from '../lib/env.js';

const CUSTOM_ORIGIN = 'https://stillwithyou.nimanussonkul.work';
const PAGES_ORIGIN = 'https://still-with-you-5b1.pages.dev';
const UNLISTED_ORIGIN = 'https://unlisted.example';

describe('parseWebOrigins', () => {
  it('splits, trims, and drops empty entries', () => {
    expect(parseWebOrigins(` ${CUSTOM_ORIGIN} , ${PAGES_ORIGIN}, `, 'production')).toEqual([
      CUSTOM_ORIGIN,
      PAGES_ORIGIN,
    ]);
  });

  it('defaults to localhost when empty outside production', () => {
    expect(parseWebOrigins(undefined, 'test')).toEqual(['http://localhost:5173']);
    expect(parseWebOrigins('  ,  ', 'development')).toEqual(['http://localhost:5173']);
  });

  it('fails fast when the list is empty in production', () => {
    expect(() => parseWebOrigins(undefined, 'production')).toThrow('WEB_ORIGIN must be set in production');
    expect(() => parseWebOrigins('', 'production')).toThrow('WEB_ORIGIN must be set in production');
    expect(() => parseWebOrigins(' , ', 'production')).toThrow('WEB_ORIGIN must be set in production');
  });

  it('rejects "*" entries', () => {
    expect(() => parseWebOrigins('*', 'development')).toThrow('WEB_ORIGIN must not include "*"');
    expect(() => parseWebOrigins(`${CUSTOM_ORIGIN},*`, 'production')).toThrow(
      'WEB_ORIGIN must not include "*"'
    );
  });
});

describe('parseTrueFalseFlag', () => {
  it('defaults when unset or blank', () => {
    expect(parseTrueFalseFlag(undefined, 'MEDIA_IMAGE_TRANSFORMS', false)).toBe(false);
    expect(parseTrueFalseFlag('  ', 'MEDIA_IMAGE_TRANSFORMS', false)).toBe(false);
    expect(parseTrueFalseFlag('', 'MEDIA_IMAGE_TRANSFORMS', true)).toBe(true);
  });

  it('accepts true and false, any case', () => {
    expect(parseTrueFalseFlag('true', 'MEDIA_IMAGE_TRANSFORMS')).toBe(true);
    expect(parseTrueFalseFlag('TRUE', 'MEDIA_IMAGE_TRANSFORMS')).toBe(true);
    expect(parseTrueFalseFlag('false', 'MEDIA_IMAGE_TRANSFORMS')).toBe(false);
    expect(parseTrueFalseFlag(' False ', 'MEDIA_IMAGE_TRANSFORMS')).toBe(false);
  });

  it('rejects other values', () => {
    expect(() => parseTrueFalseFlag('yes', 'MEDIA_IMAGE_TRANSFORMS')).toThrow(
      'MEDIA_IMAGE_TRANSFORMS must be true or false'
    );
    expect(() => parseTrueFalseFlag('1', 'MEDIA_IMAGE_TRANSFORMS')).toThrow(
      'MEDIA_IMAGE_TRANSFORMS must be true or false'
    );
  });
});

describe('CORS WEB_ORIGIN allowlist', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;

  beforeEach(async () => {
    server = await createTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  async function requestFrom(origin: string) {
    return server.inject({
      method: 'GET',
      url: '/health',
      headers: { origin },
    });
  }

  it('echoes Access-Control-Allow-Origin for each allowed origin and omits it for unlisted origins', async () => {
    const custom = await requestFrom(CUSTOM_ORIGIN);
    expect(custom.statusCode).toBe(200);
    expect(custom.headers['access-control-allow-origin']).toBe(CUSTOM_ORIGIN);

    const pages = await requestFrom(PAGES_ORIGIN);
    expect(pages.statusCode).toBe(200);
    expect(pages.headers['access-control-allow-origin']).toBe(PAGES_ORIGIN);

    const unlisted = await requestFrom(UNLISTED_ORIGIN);
    expect(unlisted.statusCode).toBe(200);
    expect(unlisted.headers['access-control-allow-origin']).toBeUndefined();
  });
});
