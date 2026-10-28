import { WarningCircleIcon } from '@phosphor-icons/react/WarningCircle';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

type AlertProps = {
  children: string;
  className?: string;
  variant?: 'destructive' | 'warning';
};

/** In-page error/info strip. Figma Alert · destructive / warning, role=alert. */
export function Alert({ children, className, variant = 'destructive' }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex w-full items-start gap-3 rounded-lg px-4 py-3 text-caption',
        variant === 'warning'
          ? 'bg-warning text-warning-foreground'
          : 'bg-destructive-subtle text-destructive-subtle-foreground',
        className
      )}
    >
      <Icon as={WarningCircleIcon} size={20} className="mt-0.5 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
