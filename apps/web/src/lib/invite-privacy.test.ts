import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  analyticsPath,
  isInvitePath,
  redactInviteLogArg,
  redactInviteUrls,
} from '@/lib/invite-privacy';

describe('invite privacy', () => {
  it('sends Referrer-Policy no-referrer for /invites/* on Cloudflare Pages', () => {
    const headers = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../public/_headers'),
      'utf8'
    );
    expect(headers).toMatch(/\/invites\/\*\s+Referrer-Policy:\s*no-referrer/);
  });

  it('detects invite landing paths', () => {
    expect(isInvitePath('/invites/dddddddd-dddd-4ddd-8ddd-dddddddddddd')).toBe(true);
    expect(isInvitePath('/invites/secret-token/')).toBe(true);
    expect(isInvitePath('/login')).toBe(false);
    expect(isInvitePath('/invites')).toBe(false);
    expect(isInvitePath('/family/people/new')).toBe(false);
  });

  it('strips invite tokens from URLs before logs', () => {
    expect(
      redactInviteUrls('https://app.example/invites/secret-token?x=1 and /invites/other#h')
    ).toBe('https://app.example/invites/[redacted]?x=1 and /invites/[redacted]#h');
    expect(redactInviteUrls('/login')).toBe('/login');
    expect(redactInviteUrls('/v1/invites/secret-token/accept')).toBe(
      '/v1/invites/[redacted]/accept'
    );
    expect(analyticsPath('/invites/secret-token')).toBe('/invites/[redacted]');
    expect(analyticsPath('/home')).toBe('/home');
  });

  it('redacts invite tokens in log arguments', () => {
    expect(redactInviteLogArg('open /invites/secret-token')).toBe('open /invites/[redacted]');
    const error = redactInviteLogArg(new Error('GET /v1/invites/secret-token')) as Error;
    expect(error.message).toBe('GET /v1/invites/[redacted]');
    expect(redactInviteLogArg({ path: '/invites/secret-token', ok: true })).toEqual({
      path: '/invites/[redacted]',
      ok: true,
    });
    expect(redactInviteLogArg(new URL('https://app.example/invites/secret-token'))).toBe(
      'https://app.example/invites/[redacted]'
    );
  });

  it('installs log redaction at app bootstrap', () => {
    const main = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../main.tsx'),
      'utf8'
    );
    expect(main).toMatch(/installInviteLogRedaction\(\)/);
  });
});
