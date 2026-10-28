import { Link } from 'react-router-dom';
import { Illustration } from '@/components/Illustration';
import { Button } from '@/components/ui/button';
import { copy } from '@/copy';

export function MemoryUnavailableState({
  kind,
  onRetry,
}: {
  kind: 'not_found' | 'error';
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <Illustration name="error-offline" float={false} className="size-[200px]" />
      {kind === 'not_found' ? (
        <>
          <h2 className="text-h3 font-semibold">{copy['memory.unavailable.title']}</h2>
          <p className="text-body text-muted-foreground">{copy['memory.unavailable.body']}</p>
        </>
      ) : (
        <p className="text-body">{copy['error.generic.body']}</p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild>
          <Link to="/home">
            {kind === 'not_found' ? copy['memory.unavailable.home'] : copy['common.back_home']}
          </Link>
        </Button>
        {kind === 'error' && onRetry ? (
          <Button type="button" variant="secondary" onClick={onRetry}>
            {copy['common.retry']}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
