const AUTH_NEXT_KEY = 'swy.auth.next';

/** Invite landing only — relative path, no protocol or `//`. */
const AUTH_NEXT_PATH = /^\/invites\/[A-Za-z0-9_-]+$/;

export function isSafeAuthNext(path: string | null | undefined): path is string {
  return typeof path === 'string' && AUTH_NEXT_PATH.test(path);
}

export function rememberAuthNext(path: string): void {
  if (typeof sessionStorage === 'undefined') return;
  if (!isSafeAuthNext(path)) return;
  sessionStorage.setItem(AUTH_NEXT_KEY, path);
}

export function peekAuthNext(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  const value = sessionStorage.getItem(AUTH_NEXT_KEY);
  return isSafeAuthNext(value) ? value : null;
}

export function consumeAuthNext(): string | null {
  const value = peekAuthNext();
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(AUTH_NEXT_KEY);
  }
  return value;
}

export function authNextFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return isSafeAuthNext(params.get('next')) ? params.get('next') : null;
}

export function loginPathForInvite(inviteId: string): string {
  const next = `/invites/${inviteId}`;
  if (!isSafeAuthNext(next)) return '/login';
  return `/login?next=${encodeURIComponent(next)}`;
}

export function postAuthPath(fallback = '/home'): string {
  return consumeAuthNext() ?? fallback;
}
