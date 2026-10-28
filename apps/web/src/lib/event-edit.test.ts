import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ErrorCode,
  eventEditConflictDetailsSchema,
  eventEditConflictErrorSchema,
} from '@still-with-you/contracts';
import { copy, interpolate } from '@/copy';
import { ApiClientError } from '@/lib/api-errors';
import { mockEvents } from '@/mocks/data';

vi.mock('@/lib/api-client', () => ({
  api: {
    updateEvent: vi.fn(),
    getEvent: vi.fn(),
  },
}));

import { api } from '@/lib/api-client';
import {
  EventEditConflictError,
  baselineFromEvent,
  changedFieldsMessage,
  changedMemoryFields,
  currentVersionFromConflict,
  formatConflictFields,
  isEventEditConflict,
  openLatestForConflict,
  saveEventEdit,
} from '@/lib/event-edit';

const loaded = mockEvents[0];
const latest = {
  ...mockEvents[0],
  title: 'แก้จากที่อื่น',
  occurred_from: '2019-01-01',
  version: 2,
  cover_url: 'https://cdn.example.com/other.jpg',
  cover_placeholder: 'data:image/webp;base64,other',
};

describe('EVENT_EDIT_CONFLICT contract', () => {
  it('parses details.current_version and strips unknown keys', () => {
    expect(eventEditConflictDetailsSchema.parse({ current_version: 2 })).toEqual({ current_version: 2 });
    expect(eventEditConflictDetailsSchema.safeParse({}).success).toBe(false);
    expect(eventEditConflictDetailsSchema.parse({ current_version: 2, editor: 'Mint' })).toEqual({
      current_version: 2,
    });
    expect(
      eventEditConflictErrorSchema.parse({
        error: {
          code: ErrorCode.EVENT_EDIT_CONFLICT,
          message: 'Event was modified by another edit',
          details: { current_version: 2 },
        },
      }).error.details
    ).toEqual({ current_version: 2 });
  });
});

describe('changedMemoryFields', () => {
  it('joins field labels with Eddy/Figma และ rules', () => {
    expect(formatConflictFields(['title'])).toBe('ชื่อความทรงจำ');
    expect(formatConflictFields(['title', 'date'])).toBe('ชื่อความทรงจำและวันที่');
    expect(formatConflictFields(['title', 'date', 'cover'])).toBe('ชื่อความทรงจำ วันที่ และรูปปก');
    expect(formatConflictFields(['title', 'date', 'people', 'cover'])).toBe(
      'ชื่อความทรงจำ วันที่ คนในความทรงจำ และรูปปก'
    );
    expect(changedFieldsMessage(['title', 'date'])).toBe(
      interpolate(copy['memory.conflict.changed_fields'], { fields: 'ชื่อความทรงจำและวันที่' })
    );
    expect(changedFieldsMessage([])).toBeNull();
  });

  it('detects title and date, skips people when GET has no person_ids, ignores signed cover URL churn', () => {
    const before = baselineFromEvent(loaded, ['aaaa1111-1111-4111-8111-111111111111']);
    const afterTitleDate = baselineFromEvent({
      ...loaded,
      title: 'แก้จากที่อื่น',
      occurred_from: '2019-01-01',
    });
    expect(changedMemoryFields(before, afterTitleDate)).toEqual(['title', 'date']);

    const afterPeople = {
      ...baselineFromEvent(loaded),
      person_ids: ['bbbb2222-2222-4222-8222-222222222222'],
    };
    expect(
      changedMemoryFields(baselineFromEvent(loaded, ['aaaa1111-1111-4111-8111-111111111111']), afterPeople)
    ).toEqual(['people']);

    const withCover = {
      ...loaded,
      cover_url: 'https://cdn.example.com/cover.jpg',
      cover_placeholder: 'data:image/webp;base64,same',
    };
    const sameCoverNewUrl = baselineFromEvent({
      ...withCover,
      cover_url: 'https://cdn.example.com/rotated-signature.jpg',
    });
    expect(changedMemoryFields(baselineFromEvent(withCover), sameCoverNewUrl)).toEqual([]);

    const coverChanged = baselineFromEvent({
      ...loaded,
      cover_url: 'https://cdn.example.com/new-cover.jpg',
      cover_placeholder: 'data:image/webp;base64,new',
    });
    expect(changedMemoryFields(baselineFromEvent(loaded), coverChanged)).toEqual(['cover']);
  });
});

describe('saveEventEdit', () => {
  afterEach(() => {
    vi.mocked(api.updateEvent).mockReset();
    vi.mocked(api.getEvent).mockReset();
  });

  it('sends the loaded event version on PATCH', async () => {
    const saved = { ...loaded, title: 'หัวข้อใหม่', version: 2 };
    vi.mocked(api.updateEvent).mockResolvedValue(saved);

    await expect(saveEventEdit(loaded, { title: 'หัวข้อใหม่' })).resolves.toEqual(saved);
    expect(api.updateEvent).toHaveBeenCalledWith(loaded.id, { title: 'หัวข้อใหม่', version: 1 });
    expect(api.getEvent).not.toHaveBeenCalled();
  });

  it('does not fetch or overwrite a draft on 409', async () => {
    const conflict = new ApiClientError(
      ErrorCode.EVENT_EDIT_CONFLICT,
      'Event was modified by another edit',
      409,
      undefined,
      { current_version: 2 }
    );
    vi.mocked(api.updateEvent).mockRejectedValue(conflict);
    const draft = { title: 'ฉันพิมพ์ไว้แล้ว' };

    const error = await saveEventEdit(loaded, { title: draft.title }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(EventEditConflictError);
    expect((error as EventEditConflictError).currentVersion).toBe(2);
    expect(draft.title).toBe('ฉันพิมพ์ไว้แล้ว');
    expect(api.getEvent).not.toHaveBeenCalled();
  });

  it('openLatestForConflict returns a new version without changing the draft', async () => {
    vi.mocked(api.getEvent).mockResolvedValue(latest);
    const draft = { title: 'ฉันพิมพ์ไว้แล้ว' };
    const opened = await openLatestForConflict(loaded.id, baselineFromEvent(loaded));
    expect(opened.saveVersion).toBe(2);
    expect(opened.changedFields).toEqual(['title', 'date', 'cover']);
    expect(draft.title).toBe('ฉันพิมพ์ไว้แล้ว');

    const saved = { ...loaded, title: draft.title, version: 3 };
    vi.mocked(api.updateEvent).mockResolvedValue(saved);
    await expect(
      saveEventEdit({ id: loaded.id, version: opened.saveVersion }, { title: draft.title })
    ).resolves.toEqual(saved);
    expect(api.updateEvent).toHaveBeenCalledWith(loaded.id, { title: 'ฉันพิมพ์ไว้แล้ว', version: 2 });
  });

  it('rethrows other errors without refetching', async () => {
    const boom = new ApiClientError(ErrorCode.INTERNAL_ERROR, 'boom', 500);
    vi.mocked(api.updateEvent).mockRejectedValue(boom);
    await expect(saveEventEdit(loaded, { title: 'x' })).rejects.toBe(boom);
    expect(api.getEvent).not.toHaveBeenCalled();
  });
});

describe('currentVersionFromConflict', () => {
  it('reads details.current_version from EVENT_EDIT_CONFLICT only', () => {
    const conflict = new ApiClientError(ErrorCode.EVENT_EDIT_CONFLICT, 'stale', 409, undefined, {
      current_version: 3,
    });
    expect(isEventEditConflict(conflict)).toBe(true);
    expect(currentVersionFromConflict(conflict)).toBe(3);
    expect(
      currentVersionFromConflict(new ApiClientError(ErrorCode.NOT_FOUND, 'gone', 404, undefined, { current_version: 3 }))
    ).toBeUndefined();
    expect(currentVersionFromConflict(new Error('nope'))).toBeUndefined();
  });
});
