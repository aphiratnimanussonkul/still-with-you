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

/** Absolute redirectTo sent to Supabase. Must match the Pages allowlist (`/**` or this path). */
export function oauthRedirectTo(origin: string = window.location.origin): string {
  return `${origin.replace(/\/$/, '')}${AUTH_CALLBACK_PATH}`;
}
