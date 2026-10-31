import { describe, expect, it } from 'vitest';
import { mockPeople } from '@/mocks/data';
import {
  isLinkedPerson,
  personEditDraftFrom,
  personEditIsDirty,
  personEditPatch,
} from '@/lib/person-edit';

describe('personEditPatch', () => {
  it('sends only changed fields and never version', () => {
    const person = mockPeople[0];
    const draft = personEditDraftFrom(person);
    expect(personEditIsDirty(person, draft)).toBe(false);
    expect(personEditPatch(person, draft)).toEqual({});

    const renamed = { ...draft, displayName: 'สมศรี นิมานัส' };
    expect(personEditPatch(person, renamed)).toEqual({ display_name: 'สมศรี นิมานัส' });
    expect(personEditPatch(person, renamed)).not.toHaveProperty('version');
  });

  it('sends avatar_media_id null when the photo is removed', () => {
    const person = mockPeople[1];
    expect(personEditPatch(person, { ...personEditDraftFrom(person), photoRemoved: true })).toEqual({
      avatar_media_id: null,
    });
  });

  it('sends a new avatar_media_id when a photo is added', () => {
    const person = mockPeople[1];
    expect(
      personEditPatch(person, {
        ...personEditDraftFrom(person),
        photoId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      })
    ).toEqual({ avatar_media_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  });

  it('treats linked members as not deletable', () => {
    expect(isLinkedPerson(mockPeople[0])).toBe(false);
    expect(isLinkedPerson(mockPeople[2])).toBe(true);
    expect(isLinkedPerson({ ...mockPeople[0], invite_status: 'linked' })).toBe(true);
  });
});
