import { describe, expect, it } from 'vitest';
import { nameInitial } from '@/lib/initials';

describe('nameInitial', () => {
  it('takes the first letter when the name does not start with a leading vowel', () => {
    expect(nameInitial('ยายสมศรี')).toBe('ย');
    expect(nameInitial('Atta')).toBe('A');
    expect(nameInitial('  ปู่สมชาย')).toBe('ป');
  });

  it('skips leading เ แ โ ใ ไ', () => {
    expect(nameInitial('แดง')).toBe('ด');
    expect(nameInitial('แม่')).toBe('ม');
    expect(nameInitial('โอ')).toBe('อ');
    expect(nameInitial('ไก่')).toBe('ก');
    expect(nameInitial('ใจ')).toBe('จ');
  });

  it('returns an empty string for blank names', () => {
    expect(nameInitial('')).toBe('');
    expect(nameInitial('   ')).toBe('');
  });
});
