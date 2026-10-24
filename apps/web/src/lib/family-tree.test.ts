import { describe, expect, it } from 'vitest';
import { mockAccount, mockPeople, mockRelationships } from '@/mocks/data';
import { isOnlySelf, layoutFamilyTree, peopleByGeneration } from '@/lib/family-tree';

describe('family tree layout', () => {
  it('places spouses side by side and children below', () => {
    const layout = layoutFamilyTree(mockPeople, mockRelationships, mockAccount.id);
    expect(layout.failed).toBe(false);
    const grandma = layout.nodes.find((node) => node.person.display_name === 'ยายสมศรี');
    const grandpa = layout.nodes.find((node) => node.person.display_name === 'ปู่สมชาย');
    const me = layout.nodes.find((node) => node.isMe);
    expect(grandma && grandpa && me).toBeTruthy();
    expect(grandma?.y).toBe(grandpa?.y);
    expect(me?.y).toBeGreaterThan(grandma!.y);
    expect(layout.couples).toHaveLength(1);
    expect(layout.unrelated).toEqual([]);
  });

  it('lists people by generation and treats a lone self as only-self', () => {
    const listed = peopleByGeneration(mockPeople, mockRelationships);
    expect(listed[0]?.generation).toBe(0);
    expect(listed.at(-1)?.person.display_name).toBe('Atta');
    expect(isOnlySelf([mockPeople[2]], mockAccount.id)).toBe(true);
    expect(isOnlySelf(mockPeople, mockAccount.id)).toBe(false);
  });
});
