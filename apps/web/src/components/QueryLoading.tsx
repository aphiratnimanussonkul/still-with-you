import { useEffect, useState } from 'react';
import { Illustration } from '@/components/Illustration';
import { Skeleton } from '@/components/ui/skeleton';
import { copy } from '@/copy';

const ILLUSTRATION_DELAY_MS = 1000;

export function QueryLoading() {
  const [showIllustration, setShowIllustration] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowIllustration(true), ILLUSTRATION_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!showIllustration) {
    return (
      <div className="flex flex-col gap-3" role="status">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-10" role="status">
      <Illustration name="loading" />
      <p className="text-caption text-muted-foreground">{copy['loading']}</p>
    </div>
  );
}
