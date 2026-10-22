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
  backLabelKey: Extract<CopyKey, 'nav.family'> | null;
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
    return { titleKey: 'families.title', backTo: null, backLabelKey: null };
  }
  if (/^\/families\/[^/]+/.test(pathname)) {
    return { titleKey: 'memory.list.title', backTo: '/families', backLabelKey: 'nav.family' };
  }
  if (pathname === '/memories') {
    return { titleKey: 'memory.list.title', backTo: null, backLabelKey: null };
  }
  if (pathname === '/trash' || pathname.startsWith('/trash/')) {
    return { titleKey: 'trash.title', backTo: null, backLabelKey: null };
  }
  if (pathname === '/settings' || pathname.startsWith('/settings/')) {
    return { titleKey: 'nav.settings', backTo: null, backLabelKey: null };
  }
  return { titleKey: 'login.title', backTo: null, backLabelKey: null };
}
