import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LogOut } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { copy } from '@/copy';
import { useAuth } from '@/hooks/use-auth';
import { useMe } from '@/hooks/use-me';

export function AppShell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const me = useMe();
  const [confirmLogout, setConfirmLogout] = useState(false);

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-14 max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/families" className="text-h3 font-semibold text-foreground">
            {copy['login.title']}
          </Link>
          <div className="flex items-center gap-2">
            {me.data ? (
              <span className="max-w-32 truncate text-caption text-muted-foreground">
                {me.data.display_name}
              </span>
            ) : null}
            <Button type="button" variant="ghost" onClick={() => setConfirmLogout(true)}>
              <LogOut data-icon="inline-start" />
              {copy['auth.logout']}
            </Button>
          </div>
        </div>
        <nav
          aria-label={copy['nav.family']}
          className="mx-auto flex max-w-2xl gap-1 px-4 pb-2 text-label font-medium"
        >
          <NavLink
            to="/families"
            className={({ isActive }) =>
              `inline-flex min-h-11 items-center rounded-lg px-3 ${
                isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground'
              }`
            }
          >
            {copy['nav.family']}
          </NavLink>
          <span className="inline-flex min-h-11 items-center px-3 text-muted-foreground">
            {copy['nav.memories']}
          </span>
          <span className="inline-flex min-h-11 items-center px-3 text-muted-foreground">
            {copy['nav.trash']}
          </span>
          <span className="inline-flex min-h-11 items-center px-3 text-muted-foreground">
            {copy['nav.settings']}
          </span>
        </nav>
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">{children}</main>
      {confirmLogout ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
        >
          <div className="w-full max-w-sm rounded-xl bg-card p-6 shadow-e3">
            <h2 id="logout-title" className="text-h2 font-semibold">
              {copy['logout.confirm.title']}
            </h2>
            <p className="mt-3 text-body text-muted-foreground">{copy['logout.confirm.body']}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setConfirmLogout(false)}>
                {copy['admin.remove.cancel']}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setConfirmLogout(false);
                  void signOut();
                }}
              >
                {copy['logout.confirm.primary']}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
