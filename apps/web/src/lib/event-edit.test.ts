import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ErrorCode,
  eventEditConflictDetailsSchema,
  eventEditConflictErrorSchema,
} from '@still-with-you/contracts';
import { copy } from '@/copy';
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
  currentVersionFromConflict,
  isEventEditConflict,
  saveEventEdit,
} from '@/lib/event-edit';

const loaded = mockEvents[0];
const latest = { ...mockEvents[0], title: 'แก้จากที่อื่น', version: 2 };

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

  it('uses existing Eddy conflict copy, not a TODO key', () => {
    expect(copy['error.EVENT_EDIT_CONFLICT']).toBe(
      'มีการแก้ไขความทรงจำนี้จากที่อื่นก่อนหน้า โหลดเวอร์ชันล่าสุดก่อน แล้วค่อยแก้อีกครั้ง'
    );
    expect(copy['conflict.reload']).toBe('โหลดเวอร์ชันล่าสุด');
    expect(copy['error.EVENT_EDIT_CONFLICT'].startsWith('TODO:')).toBe(false);
    expect(copy['conflict.reload'].startsWith('TODO:')).toBe(false);
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

  it('refetches the latest event and notifies on 409 EVENT_EDIT_CONFLICT', async () => {
    const conflict = new ApiClientError(
      ErrorCode.EVENT_EDIT_CONFLICT,
      'Event was modified by another edit',
      409,
      undefined,
      { current_version: 2 }
    );
    vi.mocked(api.updateEvent).mockRejectedValue(conflict);
    vi.mocked(api.getEvent).mockResolvedValue(latest);
    const onReload = vi.fn();

    const error = await saveEventEdit(loaded, { title: 'ไม่ควรชนะ' }, { onReload }).catch(
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(EventEditConflictError);
    const conflictError = error as EventEditConflictError;
    expect(conflictError.latest).toEqual(latest);
    expect(conflictError.currentVersion).toBe(2);
    expect(conflictError.message).toBe(copy['error.EVENT_EDIT_CONFLICT']);
    expect(api.getEvent).toHaveBeenCalledWith(loaded.id);
    expect(toast).toHaveBeenCalledWith(
      copy['error.EVENT_EDIT_CONFLICT'],
      expect.objectContaining({
        action: expect.objectContaining({ label: copy['conflict.reload'] }),
      })
    );

    const action = vi.mocked(toast).mock.calls[0]?.[1] as { action?: { onClick?: () => void } };
    action.action?.onClick?.();
    expect(onReload).toHaveBeenCalledWith(latest);
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
