import { Illustration } from '@/components/Illustration';
import { Button } from '@/components/ui/button';
import { copy } from '@/copy';

export function OfflineScreen({ onRetry }: { onRetry?: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <Illustration name="error-offline" />
      <h1 className="text-h2 font-medium">{copy['offline.title']}</h1>
      <p className="text-body text-muted-foreground">{copy['offline.body']}</p>
      <Button type="button" onClick={onRetry ?? (() => window.location.reload())}>
        {copy['offline.action']}
      </Button>
    </main>
  );
}
