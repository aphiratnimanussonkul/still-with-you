import type { ReactNode } from 'react';
import { CaretLeftIcon } from '@phosphor-icons/react/CaretLeft';
import { Link, useLocation } from 'react-router-dom';
import { AppNav } from '@/components/AppNav';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { copy, truncateName } from '@/copy';
import { useMe } from '@/hooks/use-me';
import { appBarForPath } from '@/lib/nav';
import { cn } from '@/lib/utils';

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  const me = useMe();
  const bar = appBarForPath(pathname, search);
  const title = copy[bar.titleKey];
  const homeChrome = pathname === '/home';
  const memoryDetailChrome = pathname === '/memories/new' || /^\/memories\/[^/]+/.test(pathname);

  return (
    <div className="min-h-dvh bg-background lg:flex">
      <aside
        data-nav-region="side"
        className="hidden lg:flex lg:w-56 lg:shrink-0 lg:flex-col lg:border-r lg:border-border lg:bg-card"
      >
        <div className="flex h-14 items-center px-4">
          <Link to="/home" className="truncate text-h3 font-semibold text-foreground">
            {copy['login.title']}
          </Link>
        </div>
        <AppNav variant="side" />
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        {homeChrome ? null : (
          <header className="sticky top-0 z-40 border-b border-border bg-card pt-[env(safe-area-inset-top,0px)]">
            <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-4 lg:max-w-none">
              {bar.backTo ? (
                <Button variant="ghost" size="icon" asChild>
                  <Link to={bar.backTo} aria-label={copy['a11y.back']}>
                    <Icon as={CaretLeftIcon} size={24} />
                  </Link>
                </Button>
              ) : null}
              <h1 className={`min-w-0 truncate ${bar.backTo ? 'text-h3 font-semibold' : 'text-h2 font-semibold'}`}>
                {title}
              </h1>
              {me.data?.display_name ? (
                <span className="ml-auto hidden max-w-40 truncate text-caption text-muted-foreground lg:inline">
                  {truncateName(me.data.display_name)}
                </span>
              ) : null}
            </div>
          </header>
        )}

        <main
          className={cn(
            'mx-auto flex w-full min-h-0 flex-1 flex-col',
            homeChrome
              ? 'max-w-2xl pb-[calc(var(--bottom-nav-height)+var(--safe-bottom))] lg:max-w-[680px] lg:pb-8'
              : memoryDetailChrome
                ? 'max-w-2xl lg:max-w-[680px]'
                : 'max-w-2xl gap-6 px-4 py-6 pb-[calc(var(--bottom-nav-height)+var(--safe-bottom)+1.5rem)] lg:max-w-[680px] lg:pb-8'
          )}
        >
          {children}
        </main>

        {memoryDetailChrome ? null : (
          <div
            data-nav-region="bottom"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
          >
            <AppNav variant="bottom" />
          </div>
        )}
      </div>
    </div>
  );
}
