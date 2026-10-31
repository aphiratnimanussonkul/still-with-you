import { DotsThreeIcon } from '@phosphor-icons/react/DotsThree';
import { cn } from '@/lib/utils';

/** Shared ⋯ control for the detail top app bar (person, memory, profile). */
export const detailMoreButtonClassName = cn(
  'relative inline-flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm',
  'hover:bg-muted active:bg-muted',
  'after:absolute after:left-1/2 after:top-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[""]'
);

export function DetailMoreButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={detailMoreButtonClassName}>
      <DotsThreeIcon size={22} weight="bold" className="text-foreground" aria-hidden="true" />
    </button>
  );
}
