import { CircleNotchIcon } from '@phosphor-icons/react/CircleNotch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Icon } from '@/components/ui/icon';
import { copy, interpolateHeading } from '@/copy';

export function MemoryPauseOthersDialog({
  open,
  onOpenChange,
  ownerName,
  confirming = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerName: string;
  confirming?: boolean;
  onConfirm: () => void;
}) {
  const vars = { owner_display_name: ownerName };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {interpolateHeading(copy['memory.pause.others.title'], vars)}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {interpolateHeading(copy['memory.pause.others.body'], vars)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col">
          <AlertDialogAction
            type="button"
            variant="destructive"
            className="w-full"
            disabled={confirming}
            aria-busy={confirming}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {confirming ? (
              <Icon as={CircleNotchIcon} size={16} className="animate-spin motion-reduce:animate-none" />
            ) : null}
            {copy['memory.pause.others.confirm']}
          </AlertDialogAction>
          <AlertDialogCancel type="button" className="w-full" disabled={confirming}>
            {copy['memory.pause.others.cancel']}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
