import { describe, expect, it } from 'vitest';
import { appBarForPath, isNavItemActive } from '@/lib/nav';

describe('isNavItemActive', () => {
  it('marks family only on the exact families list', () => {
    expect(isNavItemActive('family', '/families')).toBe(true);
    expect(isNavItemActive('family', '/families/22222222-2222-4222-8222-222222222222')).toBe(false);
    expect(isNavItemActive('family', '/memories')).toBe(false);
  });

  it('marks memories on the index and a family detail route', () => {
    expect(isNavItemActive('memories', '/memories')).toBe(true);
    expect(isNavItemActive('memories', '/families/abc')).toBe(true);
    expect(isNavItemActive('memories', '/families')).toBe(false);
    expect(isNavItemActive('memories', '/trash')).toBe(false);
  });

  it('marks trash and settings on their own paths', () => {
    expect(isNavItemActive('trash', '/trash')).toBe(true);
    expect(isNavItemActive('settings', '/settings')).toBe(true);
    expect(isNavItemActive('trash', '/settings')).toBe(false);
  });
});

describe('appBarForPath', () => {
  it('uses the families title with no back on the list', () => {
    expect(appBarForPath('/families')).toEqual({
      titleKey: 'families.title',
      backTo: null,
      backLabelKey: null,
    });
  });

  it('uses the memories title and a family back link on detail', () => {
    expect(appBarForPath('/families/abc')).toEqual({
      titleKey: 'memory.list.title',
      backTo: '/families',
      backLabelKey: 'nav.family',
    });
  });

  it('titles trash and settings from existing copy keys', () => {
    expect(appBarForPath('/trash').titleKey).toBe('trash.title');
    expect(appBarForPath('/settings').titleKey).toBe('nav.settings');
  });
});
