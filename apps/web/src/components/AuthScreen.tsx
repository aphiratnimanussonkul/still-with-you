import type { ReactNode } from 'react';
import { QueryLoading } from '@/components/QueryLoading';
import { cn } from '@/lib/utils';

type AuthScreenProps = {
  illustration?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  loading?: boolean;
  className?: string;
};

/**
 * Shared Login / Welcome / Invite chrome: 390-wide column, 24px gutters,
 * 64px top inset, illustration + copy, then a spacer that pins actions
 * to the bottom of the viewport (Figma Screens v1 · Login).
 */
export function AuthScreen({
  illustration,
  title,
  children,
  actions,
  loading = false,
  className,
}: AuthScreenProps) {
  return (
    <main
      className={cn(
        'mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-10 pt-16',
        className
      )}
    >
      {loading ? (
        <div className="flex flex-1 flex-col justify-center">
          <QueryLoading />
        </div>
      ) : (
        <>
          <div className="flex w-full flex-col items-center gap-4">
            {illustration}
            {title}
            {children}
          </div>
          <div className="min-h-0 flex-1" />
          {actions ? (
            <div className="flex w-full flex-col items-center gap-3">{actions}</div>
          ) : null}
        </>
      )}
    </main>
  );
}
