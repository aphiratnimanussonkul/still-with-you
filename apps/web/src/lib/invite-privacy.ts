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

/** Path to send to analytics / pageview beacons. Never includes the invite token. */
export function analyticsPath(pathname: string): string {
  return redactInviteUrls(pathname);
}

export function redactInviteLogArg(value: unknown, seen?: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactInviteUrls(value);
  if (value instanceof URL) return redactInviteUrls(value.href);
  if (value instanceof Error) {
    const copy = new Error(redactInviteUrls(value.message));
    copy.name = value.name;
    copy.stack = value.stack ? redactInviteUrls(value.stack) : value.stack;
    return copy;
  }
  if (!value || typeof value !== 'object') return value;
  const seenSet = seen ?? new WeakSet<object>();
  if (seenSet.has(value)) return '[Circular]';
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) return value;
  seenSet.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactInviteLogArg(item, seenSet));
  }
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    next[key] = redactInviteLogArg(item, seenSet);
  }
  return next;
}

let logRedactionInstalled = false;

/** Replace console methods so invite tokens never reach logs. No analytics SDK is installed. */
export function installInviteLogRedaction(): void {
  if (logRedactionInstalled) return;
  logRedactionInstalled = true;
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
  for (const method of methods) {
    const original = console[method].bind(console);
    console[method] = ((...args: unknown[]) => {
      original(...args.map((arg) => redactInviteLogArg(arg)));
    }) as (typeof console)[typeof method];
  }
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
