import type { CopyKey } from '@/copy';

export const NAV_IDS = ['home', 'memories', 'family', 'me'] as const;

export type NavId = (typeof NAV_IDS)[number];

export type NavItem = {
  id: NavId;
  to: string;
  labelKey: Extract<CopyKey, 'nav.home' | 'nav.memories' | 'nav.family' | 'nav.me'>;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'home', to: '/home', labelKey: 'nav.home' },
  { id: 'memories', to: '/memories', labelKey: 'nav.memories' },
  { id: 'family', to: '/family', labelKey: 'nav.family' },
  { id: 'me', to: '/me', labelKey: 'nav.me' },
] as const;

export type AppBarState = {
  titleKey: CopyKey;
  backTo: string | null;
};

export function isNavItemActive(id: NavId, pathname: string): boolean {
  if (id === 'home') return pathname === '/home';
  if (id === 'memories') return pathname === '/memories' || pathname.startsWith('/memories/');
  if (id === 'family') return pathname === '/family' || pathname.startsWith('/family/');
  return (
    pathname === '/me' ||
    pathname.startsWith('/me/') ||
    pathname === '/trash' ||
    pathname.startsWith('/trash/') ||
    pathname === '/settings' ||
    pathname.startsWith('/settings/')
  );
}

export function appBarForPath(pathname: string): AppBarState {
  if (pathname === '/home') return { titleKey: 'nav.home', backTo: null };
  if (pathname === '/memories') return { titleKey: 'memory.list.title', backTo: null };
  if (/^\/memories\/[^/]+/.test(pathname)) return { titleKey: 'memory.list.title', backTo: '/memories' };
  if (pathname === '/family') return { titleKey: 'nav.family', backTo: null };
  if (pathname === '/family/invite') return { titleKey: 'invite.title', backTo: '/family' };
  if (pathname === '/family/people/new') return { titleKey: 'person.add.title', backTo: '/family' };
  if (pathname === '/me') return { titleKey: 'nav.me', backTo: null };
  if (pathname === '/me/trash' || pathname === '/trash' || pathname.startsWith('/trash/')) {
    return { titleKey: 'trash.title', backTo: '/me' };
  }
  if (pathname === '/settings' || pathname.startsWith('/settings/')) {
    return { titleKey: 'nav.settings', backTo: '/me' };
  }
  return { titleKey: 'login.title', backTo: null };
}
