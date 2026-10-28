import { describe, expect, it } from 'vitest';
import { ErrorCode, eventEditConflictErrorSchema, updateEventSchema } from '@still-with-you/contracts';
import { mockEvents } from '@/mocks/data';
import { mockPatchEvent } from '@/mocks/event-patch';

describe('mock PATCH /v1/events/{id}', () => {
  it('increments version when the loaded version matches', () => {
    const event = { ...mockEvents[0] };
    const result = mockPatchEvent(event, { title: 'หัวข้อใหม่', version: event.version });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.title).toBe('หัวข้อใหม่');
    expect(result.event.version).toBe(event.version + 1);
    expect(event.version).toBe(1);
  });

  it('rejects a body that omits version at the schema', () => {
    const parsed = updateEventSchema.safeParse({ title: 'ไม่ส่งเวอร์ชัน' });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.errors[0]?.path).toEqual(['version']);
  });

  it('returns 409 EVENT_EDIT_CONFLICT with details.current_version and no editor name', () => {
    const event = { ...mockEvents[0], version: 2, title: 'แก้รอบแรก' };
    const result = mockPatchEvent(event, { title: 'ไม่ควรชนะ', version: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    const body = eventEditConflictErrorSchema.parse(result.body);
    expect(body.error.code).toBe(ErrorCode.EVENT_EDIT_CONFLICT);
    expect(body.error.details).toEqual({ current_version: 2 });
    expect(body.error.details).not.toHaveProperty('editor');
    expect(body.error.details).not.toHaveProperty('editor_display_name');
    expect(JSON.stringify(body)).not.toMatch(/editor/i);
    expect(event.title).toBe('แก้รอบแรก');
    expect(event.version).toBe(2);
  });
});
