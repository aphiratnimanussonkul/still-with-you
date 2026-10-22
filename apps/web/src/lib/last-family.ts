const LAST_FAMILY_KEY = 'swy.lastFamilyId';

export function rememberFamilyId(familyId: string): void {
  if (!familyId || typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(LAST_FAMILY_KEY, familyId);
}

export function readLastFamilyId(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(LAST_FAMILY_KEY);
}

export function pickFamilyId(familyIds: string[]): string | null {
  if (familyIds.length === 0) return null;
  const remembered = readLastFamilyId();
  if (remembered && familyIds.includes(remembered)) return remembered;
  return familyIds[0] ?? null;
}
