import { ErrorCode } from '@still-with-you/contracts';
import { copy, interpolate } from '@/copy';
import { ApiClientError } from '@/lib/api-errors';
import type { FamilyPerson, FamilyRelationship, RelationshipKind } from '@/lib/family-graph';

export type RelationshipUiType = 'parent' | 'spouse' | 'child';

export type LinkRelationshipErrorKind =
  | 'invalid'
  | 'exists'
  | 'too_many_parents'
  | 'person_gone'
  | 'forbidden'
  | 'inline';

export function relationshipWriteBody(
  selfId: string,
  relatedId: string,
  uiType: RelationshipUiType
): { person_id: string; related_person_id: string; type: 'parent' | 'spouse' } {
  if (uiType === 'child') {
    return { person_id: relatedId, related_person_id: selfId, type: 'parent' };
  }
  return { person_id: selfId, related_person_id: relatedId, type: uiType };
}

/**
 * POST /v1/families/{id}/relationships body when linking an existing person.
 * `subjectId` is the person the admin tapped + on; `selectedId` is the pick.
 * parent: selected is the parent of subject. child: selected is the child of subject.
 */
export function existingLinkWriteBody(
  subjectId: string,
  selectedId: string,
  uiType: RelationshipUiType
): { person_id: string; related_person_id: string; type: 'parent' | 'spouse' } {
  if (uiType === 'parent') {
    return { person_id: selectedId, related_person_id: subjectId, type: 'parent' };
  }
  if (uiType === 'child') {
    return { person_id: subjectId, related_person_id: selectedId, type: 'parent' };
  }
  return { person_id: subjectId, related_person_id: selectedId, type: 'spouse' };
}

export function relationshipUiType(
  row: { person_id: string; related_person_id: string; type: 'parent' | 'spouse' },
  selfId: string
): RelationshipUiType {
  if (row.type === 'spouse') return 'spouse';
  if (row.person_id === selfId) return 'parent';
  return 'child';
}

export function addPersonKindParam(uiType: RelationshipUiType): RelationshipKind {
  if (uiType === 'parent') return 'parent_of';
  if (uiType === 'child') return 'child_of';
  return 'spouse_of';
}

export function addPersonHref(uiType: RelationshipUiType, personId: string, name?: string): string {
  const params = new URLSearchParams({
    kind: addPersonKindParam(uiType),
    person: personId,
  });
  const trimmed = name?.trim();
  if (trimmed) params.set('name', trimmed);
  return `/family/people/new?${params.toString()}`;
}

export function relatedPersonIds(
  subjectId: string,
  relationships: Array<{ person_id: string; related_person_id: string }>
): Set<string> {
  const ids = new Set<string>();
  for (const edge of relationships) {
    if (edge.person_id === subjectId) ids.add(edge.related_person_id);
    if (edge.related_person_id === subjectId) ids.add(edge.person_id);
  }
  return ids;
}

export function pickablePeople(
  people: FamilyPerson[],
  relationships: FamilyRelationship[],
  subjectId: string
): FamilyPerson[] {
  const related = relatedPersonIds(subjectId, relationships);
  return people.filter((person) => person.id !== subjectId && !related.has(person.id));
}

export function matchesPersonSearch(
  person: Pick<FamilyPerson, 'display_name' | 'name' | 'relation_label'>,
  query: string
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const fields = [person.display_name, person.name, person.relation_label ?? ''];
  return fields.some((field) => field.toLowerCase().includes(needle));
}

export function filterPickablePeople(
  people: FamilyPerson[],
  relationships: FamilyRelationship[],
  subjectId: string,
  query: string
): FamilyPerson[] {
  return pickablePeople(people, relationships, subjectId).filter((person) =>
    matchesPersonSearch(person, query)
  );
}

export function parentCountOf(
  subjectId: string,
  relationships: Array<{ person_id: string; related_person_id: string; type: string }>
): number {
  return relationships.filter(
    (edge) => edge.type === 'parent' && edge.related_person_id === subjectId
  ).length;
}

export function hasTwoParents(
  subjectId: string,
  relationships: Array<{ person_id: string; related_person_id: string; type: string }>
): boolean {
  return parentCountOf(subjectId, relationships) >= 2;
}

export function linkRelationshipErrorKind(error: unknown): LinkRelationshipErrorKind {
  if (error instanceof ApiClientError) {
    if (error.code === ErrorCode.INVALID_RELATIONSHIP) return 'invalid';
    if (error.code === ErrorCode.RELATIONSHIP_EXISTS) return 'exists';
    if (error.code === 'TOO_MANY_PARENTS') return 'too_many_parents';
    if (error.code === ErrorCode.INVALID_INPUT) return 'person_gone';
    if (
      error.status === 403 ||
      error.code === ErrorCode.FORBIDDEN ||
      error.code === ErrorCode.ADMIN_REQUIRED
    ) {
      return 'forbidden';
    }
  }
  return 'inline';
}

export function linkRelationshipCanRetry(kind: LinkRelationshipErrorKind): boolean {
  return kind === 'inline';
}

export function linkRelationshipErrorMessage(
  kind: LinkRelationshipErrorKind,
  vars?: { ชื่อ?: string }
): string {
  switch (kind) {
    case 'invalid':
      return copy['error.INVALID_RELATIONSHIP'];
    case 'exists':
      return copy['error.RELATIONSHIP_EXISTS'];
    case 'too_many_parents':
      return copy['relation.link.error.too_many_parents'];
    case 'person_gone':
      return interpolate(copy['relation.link.error.person_gone'], { ชื่อ: vars?.ชื่อ ?? '' });
    case 'forbidden':
      return copy['person.edit.forbidden'];
    default:
      return copy['relation.link.error.inline'];
  }
}

export function linkRelationshipError(
  error: unknown,
  vars?: { ชื่อ?: string }
): { kind: LinkRelationshipErrorKind; retry: boolean; message: string } {
  const kind = linkRelationshipErrorKind(error);
  return {
    kind,
    retry: linkRelationshipCanRetry(kind),
    message: linkRelationshipErrorMessage(kind, vars),
  };
}
