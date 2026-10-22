import { describe, expect, it } from 'vitest';
import { copy } from '@/copy';

describe('copy v0.3', () => {
  it('has no remaining TODO placeholders', () => {
    const leftovers = Object.entries(copy)
      .filter(([, value]) => value.startsWith('TODO:'))
      .map(([key]) => key);
    expect(leftovers).toEqual([]);
  });

  it('uses ถอดบทบาทผู้ดูแล for remove-admin and LAST_ADMIN action ตั้งคนอื่นเป็นผู้ดูแล', () => {
    expect(copy['members.action.remove_admin']).toBe('ถอดบทบาทผู้ดูแล');
    expect(copy['member.menu.remove_admin']).toBe('ถอดบทบาทผู้ดูแล');
    expect(copy['LAST_ADMIN.action']).toBe('ตั้งคนอื่นเป็นผู้ดูแล');
  });
});
