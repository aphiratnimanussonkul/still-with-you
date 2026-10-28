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

vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn() });
  return { toast };
});

import { toast } from 'sonner';
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
  it('parses details.current_version and rejects an editor name', () => {
    expect(eventEditConflictDetailsSchema.parse({ current_version: 2 })).toEqual({ current_version: 2 });
    expect(eventEditConflictDetailsSchema.safeParse({}).success).toBe(false);
    expect(eventEditConflictDetailsSchema.safeParse({ current_version: 2, editor: 'Mint' }).success).toBe(
      false
    );
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

  it('uses Eddy memory.edit.conflict copy, not a TODO key', () => {
    expect(copy['memory.edit.conflict.body']).toBe(
      'มีคนแก้ความทรงจำนี้ไปเมื่อกี้ ที่คุณแก้ไว้ยังอยู่ครบ ลองเปิดฉบับล่าสุดดูก่อน แล้วจึงแก้ต่อ'
    );
    expect(copy['memory.edit.conflict.action']).toBe('เปิดฉบับล่าสุด');
    expect(copy['memory.conflict.changed_fields']).toBe(
      'มีคนแก้{fields}ไปแล้ว ที่คุณแก้ไว้ด้านล่างยังอยู่ครบ'
    );
    expect(copy['memory.title_label']).toBe('ชื่อความทรงจำ');
    expect(copy['memory.conflict.field.date']).toBe('วันที่');
    expect(copy['memory.conflict.field.people']).toBe('คนในความทรงจำ');
    expect(copy['memory.conflict.field.cover']).toBe('รูปปก');
    expect(copy['memory.edit.conflict.body'].startsWith('TODO:')).toBe(false);
    expect(copy['memory.edit.conflict.action'].startsWith('TODO:')).toBe(false);
    expect(copy['memory.conflict.changed_fields'].startsWith('TODO:')).toBe(false);
  });
});

describe('changedMemoryFields', () => {
  it('lists title / date / people / cover with existing field labels', () => {
    expect(formatConflictFields(['title', 'date', 'people', 'cover'])).toBe(
      'ชื่อความทรงจำ วันที่ คนในความทรงจำ รูปปก'
    );
    expect(changedFieldsMessage(['title'])).toBe(
      interpolate(copy['memory.conflict.changed_fields'], { fields: 'ชื่อความทรงจำ' })
    );
    expect(changedFieldsMessage(['title', 'date'])).toBe(
      'มีคนแก้ชื่อความทรงจำ วันที่ไปแล้ว ที่คุณแก้ไว้ด้านล่างยังอยู่ครบ'
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
    vi.mocked(toast).mockReset();
  });

  it('sends the loaded event version on PATCH', async () => {
    const saved = { ...loaded, title: 'หัวข้อใหม่', version: 2 };
    vi.mocked(api.updateEvent).mockResolvedValue(saved);

    await expect(saveEventEdit(loaded, { title: 'หัวข้อใหม่' })).resolves.toEqual(saved);
    expect(api.updateEvent).toHaveBeenCalledWith(loaded.id, { title: 'หัวข้อใหม่', version: 1 });
    expect(api.getEvent).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('keeps unsaved form values on 409 and does not auto-fetch', async () => {
    const conflict = new ApiClientError(
      ErrorCode.EVENT_EDIT_CONFLICT,
      'Event was modified by another edit',
      409,
      undefined,
      { current_version: 2 }
    );
    vi.mocked(api.updateEvent).mockRejectedValue(conflict);
    const draft = { title: 'ฉันพิมพ์ไว้แล้ว' };
    const onOpenLatest = vi.fn();

    const error = await saveEventEdit(loaded, { title: draft.title }, { onOpenLatest }).catch(
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(EventEditConflictError);
    expect((error as EventEditConflictError).currentVersion).toBe(2);
    expect((error as EventEditConflictError).message).toBe(copy['memory.edit.conflict.body']);
    expect(draft.title).toBe('ฉันพิมพ์ไว้แล้ว');
    expect(api.getEvent).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      copy['memory.edit.conflict.body'],
      expect.objectContaining({
        action: expect.objectContaining({ label: copy['memory.edit.conflict.action'] }),
      })
    );
    expect(toast).not.toHaveBeenCalledWith(copy['error.EVENT_EDIT_CONFLICT'], expect.anything());
  });

  it('fetches latest on เปิดฉบับล่าสุด, keeps the draft, then next save sends the new version', async () => {
    const conflict = new ApiClientError(
      ErrorCode.EVENT_EDIT_CONFLICT,
      'Event was modified by another edit',
      409,
      undefined,
      { current_version: 2 }
    );
    vi.mocked(api.updateEvent).mockRejectedValueOnce(conflict);
    vi.mocked(api.getEvent).mockResolvedValue(latest);

    const draft = { title: 'ฉันพิมพ์ไว้แล้ว' };
    let saveVersion = loaded.version;
    const baseline = baselineFromEvent(loaded);

    const error = await saveEventEdit(
      { id: loaded.id, version: saveVersion },
      { title: draft.title },
      {
        onOpenLatest: async () => {
          const opened = await openLatestForConflict(loaded.id, baseline);
          saveVersion = opened.saveVersion;
        },
      }
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(EventEditConflictError);

    const action = vi.mocked(toast).mock.calls[0]?.[1] as { action?: { onClick?: () => void } };
    await action.action?.onClick?.();

    expect(api.getEvent).toHaveBeenCalledWith(loaded.id);
    expect(draft.title).toBe('ฉันพิมพ์ไว้แล้ว');
    expect(saveVersion).toBe(2);
    expect(toast).toHaveBeenCalledWith(
      'มีคนแก้ชื่อความทรงจำ วันที่ รูปปกไปแล้ว ที่คุณแก้ไว้ด้านล่างยังอยู่ครบ'
    );

    const saved = { ...loaded, title: draft.title, version: 3 };
    vi.mocked(api.updateEvent).mockResolvedValueOnce(saved);
    await expect(
      saveEventEdit({ id: loaded.id, version: saveVersion }, { title: draft.title })
    ).resolves.toEqual(saved);
    expect(api.updateEvent).toHaveBeenLastCalledWith(loaded.id, { title: 'ฉันพิมพ์ไว้แล้ว', version: 2 });
  });

  it('rethrows other errors without refetching', async () => {
    const boom = new ApiClientError(ErrorCode.INTERNAL_ERROR, 'boom', 500);
    vi.mocked(api.updateEvent).mockRejectedValue(boom);
    await expect(saveEventEdit(loaded, { title: 'x' })).rejects.toBe(boom);
    expect(api.getEvent).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
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
