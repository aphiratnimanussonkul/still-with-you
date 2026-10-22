import { copy, interpolate } from '@/copy';
import { Label } from '@/components/ui/label';
import type { FamilyResponse } from '@still-with-you/contracts';

type FamilySwitcherProps = {
  families: FamilyResponse[];
  selectedId: string | null;
  onSelect: (familyId: string) => void;
};

export function FamilySwitcher({ families, selectedId, onSelect }: FamilySwitcherProps) {
  if (families.length === 0) return null;
  const selected = families.find((family) => family.id === selectedId) ?? families[0];

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="family-switcher">{copy['family.switcher']}</Label>
      <select
        id="family-switcher"
        className="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-body"
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
