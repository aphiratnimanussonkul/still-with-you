import crypto from 'crypto';
import { env } from './env.js';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function mintInviteToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: hashInviteToken(token) };
}

export function inviteExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_MS);
}

/** Public invite link. Uses the first WEB_ORIGIN; plaintext token is never stored. */
export function publicInviteUrl(token: string): string {
  const origin = (env.WEB_ORIGIN[0] ?? 'http://localhost:5173').replace(/\/$/, '');
  return `${origin}/invites/${token}`;
}

export function tokenFromInviteUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && parts[parts.length - 2] === 'invites') {
      return decodeURIComponent(parts[parts.length - 1] ?? '');
    }
    return null;
  } catch {
    return null;
  }
}
