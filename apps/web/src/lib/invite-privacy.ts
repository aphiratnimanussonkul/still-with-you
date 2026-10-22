import { useEffect } from 'react';

const INVITE_PATH = /^\/invites\/[^/]+\/?$/;
const INVITE_URL = /\/invites\/[^/?#]+/g;

export function isInvitePath(pathname: string): boolean {
  return INVITE_PATH.test(pathname);
}

/** Strip invite tokens from URLs before they reach analytics or logs. */
export function redactInviteUrls(value: string): string {
  return value.replace(INVITE_URL, '/invites/[redacted]');
}

function upsertReferrerMeta(content: string | null): () => void {
  const existing = document.querySelector('meta[name="referrer"]');
  const previous = existing?.getAttribute('content') ?? null;
  if (content === null) {
    existing?.remove();
  } else {
    const meta = existing ?? document.createElement('meta');
    meta.setAttribute('name', 'referrer');
    meta.setAttribute('content', content);
    if (!existing) document.head.appendChild(meta);
  }
  return () => {
    const current = document.querySelector('meta[name="referrer"]');
    if (previous === null) {
      current?.remove();
      return;
    }
    const meta = current ?? document.createElement('meta');
    meta.setAttribute('name', 'referrer');
    meta.setAttribute('content', previous);
    if (!current) document.head.appendChild(meta);
  };
}

/** While the SPA is on /invites/:token, do not send the token as a Referer. */
export function useInviteReferrerPolicy(pathname: string): void {
  const enabled = isInvitePath(pathname);
  useEffect(() => {
    if (!enabled) return undefined;
    return upsertReferrerMeta('no-referrer');
  }, [enabled]);
}
