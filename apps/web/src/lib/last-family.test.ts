import { afterEach, describe, expect, it } from 'vitest';
import { pickFamilyId, readLastFamilyId, rememberFamilyId } from '@/lib/last-family';

describe('last family', () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it('returns the remembered id when it is still in the list', () => {
    rememberFamilyId('fam-2');
    expect(readLastFamilyId()).toBe('fam-2');
    expect(pickFamilyId(['fam-1', 'fam-2'])).toBe('fam-2');
  });

  it('falls back to the first family when nothing is remembered', () => {
    expect(pickFamilyId(['fam-1', 'fam-2'])).toBe('fam-1');
  });

  it('falls back when the remembered family is gone', () => {
    rememberFamilyId('gone');
    expect(pickFamilyId(['fam-1'])).toBe('fam-1');
  });

  it('returns null for an empty list', () => {
    expect(pickFamilyId([])).toBeNull();
  });
});
