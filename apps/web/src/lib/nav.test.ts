import { describe, expect, it } from 'vitest';
import { appBarForPath, isNavItemActive } from '@/lib/nav';

describe('isNavItemActive', () => {
  it('marks the four IA tabs on their own trees', () => {
    expect(isNavItemActive('home', '/home')).toBe(true);
    expect(isNavItemActive('home', '/memories')).toBe(false);
    expect(isNavItemActive('memories', '/memories')).toBe(true);
    expect(isNavItemActive('memories', '/memories/abc')).toBe(true);
    expect(isNavItemActive('memories', '/family')).toBe(false);
    expect(isNavItemActive('family', '/family')).toBe(true);
    expect(isNavItemActive('family', '/family/invite')).toBe(true);
    expect(isNavItemActive('family', '/families')).toBe(false);
    expect(isNavItemActive('me', '/me')).toBe(true);
    expect(isNavItemActive('me', '/me/trash')).toBe(true);
    expect(isNavItemActive('me', '/settings')).toBe(true);
  });
});

describe('appBarForPath', () => {
  it('uses tab titles with no back on the four roots', () => {
    expect(appBarForPath('/home')).toEqual({ titleKey: 'nav.home', backTo: null });
    expect(appBarForPath('/memories')).toEqual({ titleKey: 'memory.list.title', backTo: null });
    expect(appBarForPath('/family')).toEqual({ titleKey: 'nav.family', backTo: null });
    expect(appBarForPath('/me')).toEqual({ titleKey: 'nav.me', backTo: null });
  });

  it('uses a back link on memory detail and trash', () => {
    expect(appBarForPath('/memories/abc')).toEqual({
      titleKey: 'memory.list.title',
      backTo: '/memories',
    });
    expect(appBarForPath('/me/trash')).toEqual({ titleKey: 'trash.title', backTo: '/me' });
  });
});
