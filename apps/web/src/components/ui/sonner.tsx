import { Toaster as Sonner } from 'sonner';
import { useMinWidth } from '@/hooks/use-min-width';

const MOBILE_TOAST_OFFSET = 'calc(var(--bottom-nav-height) + var(--safe-bottom) + 1rem)';

function Toaster() {
  const desktop = useMinWidth('(min-width: 1024px)');

  return (
    <Sonner
      theme="light"
      className="toaster group"
      position={desktop ? 'bottom-right' : 'bottom-center'}
      offset={desktop ? 24 : MOBILE_TOAST_OFFSET}
      toastOptions={{
        classNames: {
          toast: 'bg-card text-card-foreground border-border shadow-e2',
        },
      }}
    />
  );
}

export { Toaster };
