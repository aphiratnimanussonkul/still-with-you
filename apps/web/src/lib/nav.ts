import type { CopyKey } from '@/copy';

export const NAV_IDS = ['family', 'memories', 'trash', 'settings'] as const;

export type NavId = (typeof NAV_IDS)[number];

export type NavItem = {
  id: NavId;
  to: string;
  labelKey: Extract<CopyKey, 'nav.family' | 'nav.memories' | 'nav.trash' | 'nav.settings'>;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'family', to: '/families', labelKey: 'nav.family' },
  { id: 'memories', to: '/memories', labelKey: 'nav.memories' },
  { id: 'trash', to: '/trash', labelKey: 'nav.trash' },
  { id: 'settings', to: '/settings', labelKey: 'nav.settings' },
] as const;

export type AppBarState = {
  titleKey: CopyKey;
  backTo: string | null;
};

export function isNavItemActive(id: NavId, pathname: string): boolean {
  if (id === 'family') return pathname === '/families';
  if (id === 'memories') {
    return pathname === '/memories' || /^\/families\/[^/]+/.test(pathname);
  }
  if (id === 'trash') return pathname === '/trash' || pathname.startsWith('/trash/');
  return pathname === '/settings' || pathname.startsWith('/settings/');
}

export function appBarForPath(pathname: string): AppBarState {
  if (pathname === '/families') {
    return { titleKey: 'family.list.title', backTo: null };
  }
  if (/^\/families\/[^/]+/.test(pathname)) {
    return { titleKey: 'memory.list.title', backTo: '/families' };
  }
  if (pathname === '/memories') {
    return { titleKey: 'memory.list.title', backTo: null };
  }
  if (pathname === '/trash' || pathname.startsWith('/trash/')) {
    return { titleKey: 'trash.title', backTo: null };
  }
  if (pathname === '/settings' || pathname.startsWith('/settings/')) {
    return { titleKey: 'nav.settings', backTo: null };
  }
  return { titleKey: 'login.title', backTo: null };
}
