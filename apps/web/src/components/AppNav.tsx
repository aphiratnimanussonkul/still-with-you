import { BookOpenTextIcon } from '@phosphor-icons/react/BookOpenText';
import { GearSixIcon } from '@phosphor-icons/react/GearSix';
import { TrashIcon } from '@phosphor-icons/react/Trash';
import { UsersThreeIcon } from '@phosphor-icons/react/UsersThree';
import { Link, useLocation } from 'react-router-dom';
import { Icon, type PhIcon } from '@/components/ui/icon';
import { copy } from '@/copy';
import { NAV_ITEMS, isNavItemActive, type NavId } from '@/lib/nav';
import { cn } from '@/lib/utils';

const NAV_ICONS: Record<NavId, PhIcon> = {
  family: UsersThreeIcon,
  memories: BookOpenTextIcon,
  trash: TrashIcon,
  settings: GearSixIcon,
};

type AppNavProps = {
  variant: 'bottom' | 'side';
};

export function AppNav({ variant }: AppNavProps) {
  const { pathname } = useLocation();
  const bottom = variant === 'bottom';

  return (
    <nav data-nav={variant} className={bottom ? 'h-16' : 'flex flex-1 flex-col gap-1 p-3'}>
      <ul className={bottom ? 'grid h-full grid-cols-4' : 'flex flex-col gap-1'}>
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(item.id, pathname);
          const label = copy[item.labelKey];

          return (
            <li key={item.id} className={bottom ? 'min-w-0' : undefined}>
              <Link
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 min-w-11 text-current outline-offset-[-2px]',
                  bottom
                    ? 'h-full flex-col items-center justify-center gap-1 px-1'
                    : 'items-center gap-3 rounded-lg px-3 text-label font-medium',
                  !bottom && (active ? 'bg-secondary text-primary' : 'text-muted-foreground hover:bg-accent')
                )}
              >
                <span
                  className={cn(
                    'flex h-8 min-w-12 items-center justify-center rounded-full px-3',
                    active && 'bg-secondary text-primary',
                    !active && 'text-muted-foreground'
                  )}
                >
                  <Icon as={NAV_ICONS[item.id]} size={24} weight={active ? 'fill' : 'regular'} />
                </span>
                <span
                  className={cn(
                    'min-w-0 truncate',
                    bottom ? 'text-[12px]/4 font-medium' : 'text-label font-medium',
                    active ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
