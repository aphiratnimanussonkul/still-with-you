import { CircleNotchIcon } from '@phosphor-icons/react/CircleNotch';
import { Icon } from '@/components/ui/icon';

/** Spinner for pending primary actions (login, consent, invite accept). */
export function BusyIcon() {
  return <Icon as={CircleNotchIcon} size={16} className="animate-spin motion-reduce:animate-none" />;
}
