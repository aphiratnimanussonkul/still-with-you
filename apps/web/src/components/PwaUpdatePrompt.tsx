import { useEffect, useState } from 'react';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/ArrowClockwise';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { copy } from '@/copy';
import { env } from '@/lib/env';
import { PWA_UPDATE_CHECK_MS, reloadForAppUpdate, setPwaUpdateHandler } from '@/lib/form-draft';

export function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);

  useEffect(() => {
    if (env.useMsw) return;
    let cancelled = false;
    let intervalId: number | undefined;
    const onVisible = (registration: ServiceWorkerRegistration) => {
      if (document.visibilityState === 'visible') void registration.update();
    };
    let visibilityHandler: (() => void) | undefined;

    void import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (cancelled) return;
        setPwaUpdateHandler(
          registerSW({
            immediate: true,
            onNeedRefresh() {
              setNeedRefresh(true);
            },
            onRegisteredSW(_url, registration) {
              if (!registration || cancelled) return;
              intervalId = window.setInterval(() => {
                void registration.update();
              }, PWA_UPDATE_CHECK_MS);
              visibilityHandler = () => onVisible(registration);
              document.addEventListener('visibilitychange', visibilityHandler);
            },
          })
        );
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      setPwaUpdateHandler(null);
      if (intervalId !== undefined) window.clearInterval(intervalId);
      if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
    };
  }, []);

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 border-b border-border bg-info px-4 py-3 text-body text-info-foreground"
    >
      <p>{copy['app.update.body']}</p>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          reloadForAppUpdate();
        }}
      >
        <Icon as={ArrowClockwiseIcon} size={20} />
        {copy['app.update.action']}
      </Button>
    </div>
  );
}
