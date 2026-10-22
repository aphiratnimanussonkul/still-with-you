import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LogOut } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { copy } from '@/copy';
import { useAuth } from '@/hooks/use-auth';
import { useMe } from '@/hooks/use-me';

export function AppShell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const me = useMe();

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/families" className="text-h3 font-medium text-foreground">
            Still With You
          </Link>
          <div className="flex items-center gap-2">
            {me.data ? (
              <span className="max-w-32 truncate text-caption text-muted-foreground">
                {me.data.display_name}
              </span>
            ) : null}
            <Button type="button" variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut data-icon="inline-start" />
              {copy['auth.logout']}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">{children}</main>
    </div>
  );
}
