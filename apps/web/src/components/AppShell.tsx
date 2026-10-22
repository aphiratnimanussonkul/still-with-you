import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AppNav } from '@/components/AppNav';
import { ChevronLeft } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { copy } from '@/copy';
import { useMe } from '@/hooks/use-me';
import { appBarForPath } from '@/lib/nav';

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const me = useMe();
  const bar = appBarForPath(pathname);
  const title = copy[bar.titleKey];

  return (
    <div className="min-h-dvh bg-background lg:flex">
      <aside
        data-nav-region="side"
        className="hidden lg:flex lg:w-56 lg:shrink-0 lg:flex-col lg:border-r lg:border-border lg:bg-card"
      >
        <div className="flex h-14 items-center px-4">
          <Link to="/families" className="text-h3 font-semibold text-foreground">
            {copy['login.title']}
          </Link>
        </div>
        <AppNav variant="side" />
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-card pt-[env(safe-area-inset-top,0px)]">
          <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-4 lg:max-w-none">
            {bar.backTo && bar.backLabelKey ? (
              <Button variant="ghost" size="icon" className="[&_svg]:size-6" asChild>
                <Link to={bar.backTo} aria-label={copy[bar.backLabelKey]}>
                  <ChevronLeft aria-hidden="true" strokeWidth={1.75} />
                </Link>
              </Button>
            ) : null}
            <h1 className={bar.backTo ? 'text-h3 font-semibold' : 'text-h2 font-semibold'}>{title}</h1>
            {me.data?.display_name ? (
              <span className="ml-auto hidden max-w-40 truncate text-caption text-muted-foreground lg:inline">
                {me.data.display_name}
              </span>
            ) : null}
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 pb-[calc(var(--bottom-nav-height)+var(--safe-bottom)+1.5rem)] lg:max-w-[680px] lg:pb-8">
          {children}
        </main>

        <div
          data-nav-region="bottom"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
        >
          <AppNav variant="bottom" />
        </div>
      </div>
    </div>
  );
}
