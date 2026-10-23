const STORAGE_KEY = 'swy.family.tab';

export type FamilyViewTab = 'tree' | 'list';

export function readFamilyTab(): FamilyViewTab {
  try {
    const value = sessionStorage.getItem(STORAGE_KEY);
    return value === 'list' ? 'list' : 'tree';
  } catch {
    return 'tree';
  }
}

export function writeFamilyTab(tab: FamilyViewTab) {
  try {
    sessionStorage.setItem(STORAGE_KEY, tab);
  } catch {
    /* ignore quota / private mode */
  }
}
