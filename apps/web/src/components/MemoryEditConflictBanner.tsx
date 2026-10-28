import { ArrowClockwiseIcon } from '@phosphor-icons/react/ArrowClockwise';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { copy } from '@/copy';
import {
  changedFieldsMessage,
  type MemoryConflictField,
} from '@/lib/event-edit';

export function MemoryEditConflictBanner({
  changedFields,
  onOpenLatest,
  opening = false,
}: {
  changedFields: readonly MemoryConflictField[];
  onOpenLatest: () => void;
  opening?: boolean;
}) {
  const changed = changedFieldsMessage(changedFields);

  return (
    <div className="flex w-full flex-col items-start gap-5">
      <Alert variant="warning">{copy['memory.edit.conflict.body']}</Alert>
      {changed ? <p className="text-caption text-muted-foreground">{changed}</p> : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 min-h-9 w-fit gap-1 px-3 [&_svg]:size-4"
        onClick={onOpenLatest}
        disabled={opening}
        aria-busy={opening}
      >
        <Icon as={ArrowClockwiseIcon} size={16} />
        {copy['memory.edit.conflict.action']}
      </Button>
    </div>
  );
}
