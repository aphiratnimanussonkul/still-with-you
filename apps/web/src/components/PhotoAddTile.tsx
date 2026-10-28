import { PlusIcon } from '@phosphor-icons/react/Plus';
import { Icon } from '@/components/ui/icon';
import { copy } from '@/copy';
import { cn } from '@/lib/utils';

/** Figma Photo add tile 151:119 — 72×72 dashed + plus. Hidden by the caller at 20/20. */
export function PhotoAddTile({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex size-[72px] flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-input bg-background text-muted-foreground',
        className
      )}
    >
      <Icon as={PlusIcon} size={16} />
      <span className="text-caption">{copy['a11y.add_photo']}</span>
    </span>
  );
}
