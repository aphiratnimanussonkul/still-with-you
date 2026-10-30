import type { FamilyPerson, FamilyRelationship } from '@/lib/family-graph';
import { isPersonLiving, personDisplayName } from '@/lib/family-graph';

export const TREE_NODE_WIDTH = 88;
export const TREE_NODE_HEIGHT = 132;
export const TREE_GAP_X = 28;
export const TREE_GAP_Y = 64;
export const TREE_COUPLE_GAP = 20;

export type TreeNodeLayout = {
  id: string;
  person: FamilyPerson;
  x: number;
  y: number;
  generation: number;
  isMe: boolean;
};

export type TreeCoupleLayout = {
  a: string;
  b: string;
  y: number;
  x1: number;
  x2: number;
};

export type TreeChildBracket = {
  parentXs: number[];
  childXs: number[];
  y: number;
};

export type FamilyTreeLayout = {
  nodes: TreeNodeLayout[];
  couples: TreeCoupleLayout[];
  brackets: TreeChildBracket[];
  failed: boolean;
  width: number;
  height: number;
};

type EdgeMaps = {
  spouseOf: Map<string, string>;
  childrenOf: Map<string, string[]>;
  parentsOf: Map<string, string[]>;
};

function emptyLayout(failed = false): FamilyTreeLayout {
  return {
    nodes: [],
    couples: [],
    brackets: [],
    failed,
    width: 0,
    height: 0,
  };
}

function pushMap(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key) ?? [];
  if (!list.includes(value)) list.push(value);
  map.set(key, list);
}

export function findMyPerson(people: FamilyPerson[], accountId: string | undefined): FamilyPerson | undefined {
  if (!accountId) return undefined;
  return people.find((person) => person.account_id === accountId);
}

export function isOnlySelf(people: FamilyPerson[], accountId: string | undefined): boolean {
  if (people.length === 0) return true;
  if (people.length > 1) return false;
  const only = people[0];
  return !accountId || only.account_id === accountId;
}

function buildEdges(relationships: FamilyRelationship[], knownIds: Set<string>): EdgeMaps {
  const spouseOf = new Map<string, string>();
  const childrenOf = new Map<string, string[]>();
  const parentsOf = new Map<string, string[]>();

  for (const edge of relationships) {
    if (!knownIds.has(edge.person_id) || !knownIds.has(edge.related_person_id)) continue;
    if (edge.type === 'spouse') {
      spouseOf.set(edge.person_id, edge.related_person_id);
      spouseOf.set(edge.related_person_id, edge.person_id);
      continue;
    }
    if (edge.type === 'parent') {
      pushMap(childrenOf, edge.person_id, edge.related_person_id);
      pushMap(parentsOf, edge.related_person_id, edge.person_id);
    }
  }

  return { spouseOf, childrenOf, parentsOf };
}

function connectedIds(people: FamilyPerson[], maps: EdgeMaps): Set<string> {
  const linked = new Set<string>();
  for (const [id, partner] of maps.spouseOf) {
    linked.add(id);
    linked.add(partner);
  }
  for (const [id, children] of maps.childrenOf) {
    linked.add(id);
    for (const child of children) linked.add(child);
  }
  for (const person of people) {
    if (maps.parentsOf.has(person.id)) linked.add(person.id);
  }
  return linked;
}

function hasParentCycle(ids: string[], parentsOf: Map<string, string[]>): boolean {
  const visiting = new Set<string>();
  const seen = new Set<string>();

  const walk = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (seen.has(id)) return false;
    visiting.add(id);
    for (const parent of parentsOf.get(id) ?? []) {
      if (walk(parent)) return true;
    }
    visiting.delete(id);
    seen.add(id);
    return false;
  };

  return ids.some((id) => walk(id));
}

function assignGenerations(ids: string[], maps: EdgeMaps): Map<string, number> | null {
  const gen = new Map<string, number>();
  const pending = new Set(ids);

  let guard = 0;
  while (pending.size > 0 && guard < ids.length + 2) {
    guard += 1;
    let progressed = false;
    for (const id of [...pending]) {
      const parents = (maps.parentsOf.get(id) ?? []).filter((parent) => pending.has(parent) || gen.has(parent));
      if (parents.some((parent) => pending.has(parent))) continue;
      const parentGens = parents.map((parent) => gen.get(parent)).filter((value): value is number => value != null);
      gen.set(id, parentGens.length ? Math.max(...parentGens) + 1 : 0);
      pending.delete(id);
      progressed = true;
    }
    if (!progressed) return null;
  }

  for (const id of ids) {
    const partner = maps.spouseOf.get(id);
    if (!partner || !gen.has(partner)) continue;
    const aligned = Math.min(gen.get(id) ?? 0, gen.get(partner) ?? 0);
    gen.set(id, aligned);
    gen.set(partner, aligned);
  }

  return gen;
}

function unitKey(id: string, spouseOf: Map<string, string>): string {
  const partner = spouseOf.get(id);
  if (!partner) return id;
  return [id, partner].sort().join(':');
}

function comparePersonNames(byId: Map<string, FamilyPerson>, a: string, b: string): number {
  const personA = byId.get(a);
  const personB = byId.get(b);
  if (!personA || !personB) return 0;
  return personDisplayName(personA).localeCompare(personDisplayName(personB), 'th');
}

function computeFamilyTreeLayout(
  people: FamilyPerson[],
  relationships: FamilyRelationship[],
  accountId?: string
): FamilyTreeLayout {
  const byId = new Map(people.map((person) => [person.id, person]));
  const knownIds = new Set(byId.keys());
  const maps = buildEdges(relationships, knownIds);
  const linked = connectedIds(people, maps);
  const connected = people.filter((person) => linked.has(person.id));
  const unconnected = people
    .filter((person) => !linked.has(person.id))
    .sort((a, b) => personDisplayName(a).localeCompare(personDisplayName(b), 'th'));

  const unitsByGen = new Map<number, string[][]>();

  if (connected.length > 0) {
    const connectedIdsList = connected.map((person) => person.id);
    if (hasParentCycle(connectedIdsList, maps.parentsOf)) {
      return emptyLayout(true);
    }

    const assigned = assignGenerations(connectedIdsList, maps);
    if (!assigned) {
      return emptyLayout(true);
    }

    const seenUnit = new Set<string>();
    const sorted = [...connected].sort((a, b) => {
      const genDiff = (assigned.get(a.id) ?? 0) - (assigned.get(b.id) ?? 0);
      if (genDiff !== 0) return genDiff;
      return personDisplayName(a).localeCompare(personDisplayName(b), 'th');
    });

    for (const person of sorted) {
      const key = unitKey(person.id, maps.spouseOf);
      if (seenUnit.has(key)) continue;
      seenUnit.add(key);
      const partnerId = maps.spouseOf.get(person.id);
      const partner = partnerId ? byId.get(partnerId) : undefined;
      const members = partner ? [person.id, partner.id] : [person.id];
      members.sort((a, b) => comparePersonNames(byId, a, b));
      const generation = Math.min(...members.map((id) => assigned.get(id) ?? 0));
      const list = unitsByGen.get(generation) ?? [];
      list.push(members);
      unitsByGen.set(generation, list);
    }
  }

  if (unconnected.length > 0) {
    const generation = unitsByGen.size > 0 ? Math.max(...unitsByGen.keys()) + 1 : 0;
    unitsByGen.set(
      generation,
      unconnected.map((person) => [person.id])
    );
  }

  const nodes: TreeNodeLayout[] = [];
  const couples: TreeCoupleLayout[] = [];
  let maxRight = 0;
  const gens = [...unitsByGen.keys()].sort((a, b) => a - b);

  for (const generation of gens) {
    const units = unitsByGen.get(generation) ?? [];
    const y = generation * (TREE_NODE_HEIGHT + TREE_GAP_Y);
    let x = 0;
    for (const members of units) {
      const width =
        members.length === 2
          ? TREE_NODE_WIDTH * 2 + TREE_COUPLE_GAP
          : TREE_NODE_WIDTH;
      const start = x;
      for (const [index, id] of members.entries()) {
        const person = byId.get(id);
        if (!person) continue;
        const nodeX = start + index * (TREE_NODE_WIDTH + TREE_COUPLE_GAP);
        nodes.push({
          id,
          person,
          x: nodeX,
          y,
          generation,
          isMe: Boolean(accountId && person.account_id === accountId),
        });
      }
      if (members.length === 2) {
        couples.push({
          a: members[0],
          b: members[1],
          y: y + 36,
          x1: start + TREE_NODE_WIDTH,
          x2: start + TREE_NODE_WIDTH + TREE_COUPLE_GAP,
        });
      }
      x += width + TREE_GAP_X;
    }
    maxRight = Math.max(maxRight, x - TREE_GAP_X);
  }

  const brackets: TreeChildBracket[] = [];
  for (const generation of gens) {
    const units = unitsByGen.get(generation) ?? [];
    for (const members of units) {
      const childIds = [...new Set(members.flatMap((id) => maps.childrenOf.get(id) ?? []))];
      if (childIds.length === 0) continue;
      const parentNodes = nodes.filter((node) => members.includes(node.id));
      const childNodes = nodes.filter((node) => childIds.includes(node.id));
      if (parentNodes.length === 0 || childNodes.length === 0) continue;
      brackets.push({
        parentXs: parentNodes.map((node) => node.x + TREE_NODE_WIDTH / 2),
        childXs: childNodes.map((node) => node.x + TREE_NODE_WIDTH / 2),
        y: parentNodes[0].y + TREE_NODE_HEIGHT,
      });
    }
  }

  const maxGen = gens.length ? Math.max(...gens) : 0;
  return {
    nodes,
    couples,
    brackets,
    failed: false,
    width: Math.max(maxRight, TREE_NODE_WIDTH),
    height: (maxGen + 1) * (TREE_NODE_HEIGHT + TREE_GAP_Y),
  };
}

export function layoutFamilyTree(
  people: FamilyPerson[],
  relationships: FamilyRelationship[],
  accountId?: string
): FamilyTreeLayout {
  if (people.length === 0) return emptyLayout();
  try {
    const layout = computeFamilyTreeLayout(people, relationships, accountId);
    if (layout.nodes.length === 0) return emptyLayout(true);
    return layout;
  } catch {
    return emptyLayout(true);
  }
}

export function peopleByGeneration(
  people: FamilyPerson[],
  relationships: FamilyRelationship[]
): { generation: number | null; person: FamilyPerson }[] {
  const knownIds = new Set(people.map((person) => person.id));
  const maps = buildEdges(relationships, knownIds);
  const linked = connectedIds(people, maps);
  const connected = people.filter((person) => linked.has(person.id));
  const generations = assignGenerations(
    connected.map((person) => person.id),
    maps
  );
  return [...people]
    .map((person) => ({
      person,
      generation: generations?.get(person.id) ?? null,
    }))
    .sort((a, b) => {
      if (a.generation == null && b.generation == null) {
        return personDisplayName(a.person).localeCompare(personDisplayName(b.person), 'th');
      }
      if (a.generation == null) return 1;
      if (b.generation == null) return -1;
      if (a.generation !== b.generation) return a.generation - b.generation;
      return personDisplayName(a.person).localeCompare(personDisplayName(b.person), 'th');
    });
}

export function livingLabelVisible(person: FamilyPerson): boolean {
  return !isPersonLiving(person) && person.age != null;
}
