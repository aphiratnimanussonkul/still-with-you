export const AUTH_CALLBACK_PATH = '/auth/callback';

const CALLBACK_KEYS = ['code', 'access_token', 'error', 'error_description', 'error_code'] as const;

function paramsFromSearch(search: string): URLSearchParams {
  const value = search.startsWith('?') ? search.slice(1) : search;
  return new URLSearchParams(value);
}

function paramsFromHash(hash: string): URLSearchParams {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  return new URLSearchParams(value);
}

/** True when the URL still has a PKCE `?code=` or implicit `#access_token` (or an OAuth error). */
export function hasAuthCallbackParams(url: { search: string; hash: string }): boolean {
  const search = paramsFromSearch(url.search);
  const hash = paramsFromHash(url.hash);
  return CALLBACK_KEYS.some((key) => Boolean(search.get(key) || hash.get(key)));
}

export type OauthCallbackError = 'cancelled' | 'failed';

/** Map Supabase/Google `error` query/hash params to login copy. */
export function oauthCallbackError(url: { search: string; hash: string }): OauthCallbackError | null {
  const search = paramsFromSearch(url.search);
  const hash = paramsFromHash(url.hash);
  const error = search.get('error') || hash.get('error') || '';
  const description = search.get('error_description') || hash.get('error_description') || '';
  if (!error && !description) return null;
  if (
    error === 'access_denied' ||
    error === 'user_cancelled' ||
    error === 'login_cancelled' ||
    /cancel/i.test(error) ||
    /cancel/i.test(description)
  ) {
    return 'cancelled';
  }
  return 'failed';
}

/** Absolute redirectTo sent to Supabase. Must match the Pages allowlist (`/**` or this path). */
export function oauthRedirectTo(origin: string = window.location.origin): string {
  return `${origin.replace(/\/$/, '')}${AUTH_CALLBACK_PATH}`;
}
