import { Illustration } from '@/components/Illustration';
import { copy } from '@/copy';

export function TrashPage() {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <Illustration name="trash-empty" />
      <p className="text-h3 font-semibold">{copy['trash.empty.title']}</p>
      <p className="text-body text-muted-foreground">{copy['trash.empty.body']}</p>
    </div>
  );
}
