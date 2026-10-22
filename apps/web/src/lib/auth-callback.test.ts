import { describe, expect, it } from 'vitest';
import { AUTH_CALLBACK_PATH, hasAuthCallbackParams, oauthRedirectTo } from '@/lib/auth-callback';

describe('hasAuthCallbackParams', () => {
  it('detects a PKCE code in the query string', () => {
    expect(hasAuthCallbackParams({ search: '?code=abc&state=1', hash: '' })).toBe(true);
  });

  it('detects implicit tokens in the hash', () => {
    expect(
      hasAuthCallbackParams({ search: '', hash: '#access_token=ya29&refresh_token=r&token_type=bearer' })
    ).toBe(true);
  });

  it('detects OAuth errors in query or hash', () => {
    expect(hasAuthCallbackParams({ search: '?error=access_denied', hash: '' })).toBe(true);
    expect(hasAuthCallbackParams({ search: '', hash: '#error_description=denied' })).toBe(true);
  });

  it('is false for a normal login or home URL', () => {
    expect(hasAuthCallbackParams({ search: '', hash: '' })).toBe(false);
    expect(hasAuthCallbackParams({ search: '?from=banner', hash: '' })).toBe(false);
  });
});

describe('oauthRedirectTo', () => {
  it('points at the dedicated callback path on the current origin', () => {
    expect(oauthRedirectTo('https://still-with-you-5b1.pages.dev')).toBe(
      `https://still-with-you-5b1.pages.dev${AUTH_CALLBACK_PATH}`
    );
    expect(oauthRedirectTo('https://still-with-you-5b1.pages.dev/')).toBe(
      `https://still-with-you-5b1.pages.dev${AUTH_CALLBACK_PATH}`
    );
  });
});
