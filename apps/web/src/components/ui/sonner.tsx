import { Toaster as Sonner } from 'sonner';

function Toaster() {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: 'bg-card text-card-foreground border-border shadow-e2',
        },
      }}
    />
  );
}

export { Toaster };
