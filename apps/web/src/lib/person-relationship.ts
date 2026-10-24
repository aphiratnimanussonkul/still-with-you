export type RelationshipUiType = 'parent' | 'spouse' | 'child';

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

export function relationshipUiType(
  row: { person_id: string; related_person_id: string; type: 'parent' | 'spouse' },
  selfId: string
): RelationshipUiType {
  if (row.type === 'spouse') return 'spouse';
  if (row.person_id === selfId) return 'parent';
  return 'child';
}
