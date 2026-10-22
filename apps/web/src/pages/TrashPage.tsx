import { TrashIcon } from '@phosphor-icons/react/Trash';
import { Illustration } from '@/components/Illustration';
import { Icon } from '@/components/ui/icon';
import { copy } from '@/copy';

export function TrashPage() {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <Icon as={TrashIcon} size={48} weight="duotone" className="text-primary" />
      <Illustration name="trash-empty" />
      <p className="text-h3 font-semibold">{copy['trash.empty.title']}</p>
      <p className="text-body text-muted-foreground">{copy['trash.empty.body']}</p>
    </div>
  );
}
