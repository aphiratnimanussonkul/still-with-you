import { afterEach, describe, expect, it } from 'vitest';
import {
  authNextFromSearch,
  consumeAuthNext,
  isSafeAuthNext,
  loginPathForInvite,
  peekAuthNext,
  postAuthPath,
  rememberAuthNext,
} from '@/lib/auth-redirect';

describe('auth redirect next path', () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it('accepts invite landings and rejects open redirects', () => {
    expect(isSafeAuthNext('/invites/dddddddd-dddd-4ddd-8ddd-dddddddddddd')).toBe(true);
    expect(isSafeAuthNext(`/invites/${'ab'.repeat(32)}`)).toBe(true);
    expect(isSafeAuthNext('/home')).toBe(false);
    expect(isSafeAuthNext('https://evil.example/invites/x')).toBe(false);
    expect(isSafeAuthNext('//evil.example/invites/x')).toBe(false);
    expect(isSafeAuthNext('/invites/../login')).toBe(false);
    expect(isSafeAuthNext('/invites/x?x=1')).toBe(false);
  });

  it('round-trips a remembered invite path and consumes it once', () => {
    rememberAuthNext('/invites/tok');
    expect(peekAuthNext()).toBe('/invites/tok');
    expect(consumeAuthNext()).toBe('/invites/tok');
    expect(peekAuthNext()).toBeNull();
    expect(postAuthPath()).toBe('/home');
  });

  it('ignores unsafe values written to sessionStorage', () => {
    sessionStorage.setItem('swy.auth.next', 'https://evil.example');
    expect(peekAuthNext()).toBeNull();
    expect(consumeAuthNext()).toBeNull();
  });

  it('reads a safe next query and builds the login href', () => {
    expect(authNextFromSearch('?next=%2Finvites%2Fabc')).toBe('/invites/abc');
    expect(authNextFromSearch('?next=/home')).toBeNull();
    expect(loginPathForInvite('abc')).toBe('/login?next=%2Finvites%2Fabc');
  });
});
