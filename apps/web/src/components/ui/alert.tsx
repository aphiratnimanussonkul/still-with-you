import { WarningCircleIcon } from '@phosphor-icons/react/WarningCircle';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

type AlertProps = {
  children: string;
  className?: string;
};

/** In-page error/info strip. Figma Alert · destructive, role=alert. */
export function Alert({ children, className }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex w-full items-start gap-3 rounded-lg bg-destructive-subtle px-4 py-3 text-caption text-destructive-subtle-foreground',
        className
      )}
    >
      <Icon as={WarningCircleIcon} size={20} className="mt-0.5 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
