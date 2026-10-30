import { describe, expect, it } from 'vitest';
import type { FamilyPerson, FamilyRelationship } from '@/lib/family-graph';
import { isOnlySelf, layoutFamilyTree, peopleByGeneration } from '@/lib/family-tree';
import { mockAccount, mockFamilies, mockPeople, mockRelationships } from '@/mocks/data';

function productionPerson(
  id: string,
  name: string,
  extras: Partial<FamilyPerson> = {}
): FamilyPerson {
  return {
    id,
    family_id: mockFamilies[0].id,
    display_name: name,
    name,
    relation_label: null,
    account_id: null,
    is_living: true,
    birth_date: null,
    birth_date_precision: 'day',
    death_date: null,
    death_date_precision: null,
    age: null,
    avatar_url: null,
    avatar_url_expires_at: null,
    avatar_placeholder: null,
    full_url: null,
    full_url_expires_at: null,
    memory_count: 0,
    ...extras,
  };
}

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
  });

  it('lists people by generation and treats a lone self as only-self', () => {
    const listed = peopleByGeneration(mockPeople, mockRelationships);
    expect(listed[0]?.generation).toBe(0);
    expect(listed.at(-1)?.person.display_name).toBe('Atta');
    expect(isOnlySelf([mockPeople[2]], mockAccount.id)).toBe(true);
    expect(isOnlySelf(mockPeople, mockAccount.id)).toBe(false);
  });

  it('lays out people with no relationships as standalone nodes', () => {
    const people = [
      productionPerson('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'สมศรี'),
      productionPerson('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'สมชาย'),
    ];
    const layout = layoutFamilyTree(people, [], mockAccount.id);
    expect(layout.failed).toBe(false);
    expect(layout.nodes).toHaveLength(2);
    expect(layout.nodes.map((node) => node.person.display_name).sort()).toEqual(['สมชาย', 'สมศรี']);
    expect(layout.nodes[0]?.y).toBe(layout.nodes[1]?.y);
  });

  it('skips a dangling edge to an unknown person id', () => {
    const people = [
      productionPerson('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'สมศรี'),
      productionPerson('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'สมชาย'),
    ];
    const dangling: FamilyRelationship = {
      id: '15151515-1515-4151-8151-151515151515',
      family_id: mockFamilies[0].id,
      person_id: people[0].id,
      related_person_id: '00000000-0000-4000-8000-000000000099',
      type: 'parent',
      created_by_account_id: mockAccount.id,
      created_at: '2026-10-06T00:00:00.000Z',
    };
    const layout = layoutFamilyTree(people, [dangling], mockAccount.id);
    expect(layout.failed).toBe(false);
    expect(layout.nodes).toHaveLength(2);
  });

  it('places people with no relationships as nodes below the connected tree', () => {
    const extra = productionPerson('99999999-9999-4999-8999-999999999999', 'โอ๊ต');
    const layout = layoutFamilyTree([...mockPeople, extra], mockRelationships, mockAccount.id);
    expect(layout.failed).toBe(false);
    expect(layout.nodes).toHaveLength(mockPeople.length + 1);
    const oat = layout.nodes.find((node) => node.person.display_name === 'โอ๊ต');
    const me = layout.nodes.find((node) => node.isMe);
    expect(oat && me).toBeTruthy();
    expect(oat?.y).toBeGreaterThan(me!.y);
  });

  it('marks failed when layout throws', () => {
    const exploding = {
      ...productionPerson('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'สมศรี'),
      get display_name(): string {
        throw new Error('forced layout throw');
      },
    };
    const layout = layoutFamilyTree(
      [exploding, productionPerson('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'สมชาย')],
      []
    );
    expect(layout.failed).toBe(true);
    expect(layout.nodes).toEqual([]);
  });
});
