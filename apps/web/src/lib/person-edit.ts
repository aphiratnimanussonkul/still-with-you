import type { UpdatePerson } from '@still-with-you/contracts';
import { isPersonLiving, personDisplayName, type FamilyPerson } from '@/lib/family-graph';
import { livingDeathWriteFields } from '@/lib/person-years';

export type PersonEditDraft = {
  displayName: string;
  nickname: string;
  living: boolean;
  bio: string;
  photoId: string | null;
  photoRemoved: boolean;
};

export function personEditDraftFrom(person: FamilyPerson): PersonEditDraft {
  return {
    displayName: personDisplayName(person),
    nickname: person.relation_label ?? '',
    living: isPersonLiving(person),
    bio: person.bio ?? '',
    photoId: null,
    photoRemoved: false,
  };
}

/** PATCH /v1/people/{id} — only changed fields, never `version`. */
export function personEditPatch(person: FamilyPerson, draft: PersonEditDraft): UpdatePerson {
  const patch: UpdatePerson = {};
  const displayName = draft.displayName.trim();
  if (displayName !== personDisplayName(person)) {
    patch.display_name = displayName;
  }
  const nickname = draft.nickname.trim();
  if (nickname !== (person.relation_label ?? '').trim()) {
    patch.relation_label = nickname.length > 0 ? nickname : null;
  }
  if (draft.living !== isPersonLiving(person)) {
    Object.assign(
      patch,
      livingDeathWriteFields({ living: draft.living, yearOnly: false, dayValue: '', yearBe: '' })
    );
  }
  const bio = draft.bio.trim();
  if (bio !== (person.bio ?? '').trim()) {
    patch.bio = bio.length > 0 ? bio : null;
  }
  if (draft.photoRemoved) {
    patch.avatar_media_id = null;
  } else if (draft.photoId) {
    patch.avatar_media_id = draft.photoId;
  }
  return patch;
}

export function personEditIsDirty(person: FamilyPerson, draft: PersonEditDraft): boolean {
  return Object.keys(personEditPatch(person, draft)).length > 0;
}

export function isLinkedPerson(person: Pick<FamilyPerson, 'account_id' | 'invite_status'>): boolean {
  return Boolean(person.account_id) || person.invite_status === 'linked';
}
