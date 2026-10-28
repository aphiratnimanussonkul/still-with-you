import { ArrowClockwiseIcon } from '@phosphor-icons/react/ArrowClockwise';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { copy } from '@/copy';

export function AppUpdateBanner({ onReload }: { onReload: () => void }) {
  return (
    <div className="flex w-full flex-col items-start gap-5">
      <Alert>{copy['app.update.body']}</Alert>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 min-h-9 w-fit gap-1 px-3 [&_svg]:size-4"
        onClick={onReload}
      >
        <Icon as={ArrowClockwiseIcon} size={16} />
        {copy['app.update.action']}
      </Button>
    </div>
  );
}
