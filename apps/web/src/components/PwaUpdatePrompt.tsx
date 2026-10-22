import { useEffect, useRef, useState } from 'react';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/ArrowClockwise';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { copy } from '@/copy';
import { env } from '@/lib/env';

export function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const update = useRef<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    if (env.useMsw) return;
    let cancelled = false;
    void import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (cancelled) return;
        update.current = registerSW({
          immediate: true,
          onNeedRefresh() {
            setNeedRefresh(true);
          },
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 border-b border-border bg-info px-4 py-3 text-body text-info-foreground"
    >
      <p>{copy['pwa.update.body']}</p>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          void update.current?.(true);
        }}
      >
        <Icon as={ArrowClockwiseIcon} size={20} />
        {copy['pwa.update.action']}
      </Button>
    </div>
  );
}
