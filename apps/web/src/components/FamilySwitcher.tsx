import { copy, interpolate } from '@/copy';
import { Label } from '@/components/ui/label';
import type { FamilyResponse } from '@still-with-you/contracts';
import { cn } from '@/lib/utils';

type FamilySwitcherProps = {
  families: FamilyResponse[];
  selectedId: string | null;
  onSelect: (familyId: string) => void;
  variant?: 'default' | 'header';
};

export function FamilySwitcher({
  families,
  selectedId,
  onSelect,
  variant = 'default',
}: FamilySwitcherProps) {
  if (families.length === 0) return null;
  const selected = families.find((family) => family.id === selectedId) ?? families[0];
  const header = variant === 'header';

  return (
    <div className={cn('flex min-w-0', header ? 'flex-1' : 'flex-col gap-2')}>
      <Label htmlFor="family-switcher" className={header ? 'sr-only' : undefined}>
        {copy['family.switcher']}
      </Label>
      <select
        id="family-switcher"
        className={cn(
          'min-w-0 bg-transparent text-foreground',
          header
            ? 'h-9 w-full truncate text-h3 font-semibold appearance-none pr-6'
            : 'flex h-11 w-full rounded-lg border border-input bg-background px-3 text-body'
        )}
        value={selected.id}
        aria-label={interpolate(copy['a11y.family_switcher'], { ชื่อครอบครัว: selected.name })}
        onChange={(event) => onSelect(event.target.value)}
      >
        {families.map((family) => (
          <option key={family.id} value={family.id}>
            {family.name}
          </option>
        ))}
      </select>
    </div>
  );
}
