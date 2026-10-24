import { describe, expect, it } from 'vitest';
import { notificationListResponseSchema, notificationResponseSchema } from '@still-with-you/contracts';
import { copy, interpolate } from '@/copy';
import { mockEvents, mockFamilies, mockNotifications } from '@/mocks/data';
import { notificationBody, notificationFamilyId, notificationHref } from '@/lib/notifications-api';

describe('notifications contract', () => {
  it('parses GET /v1/me/notifications as { notifications, next_cursor, unread_count }', () => {
    const payload = notificationListResponseSchema.parse({
      notifications: mockNotifications,
      next_cursor: null,
      unread_count: 2,
    });
    expect(payload.notifications).toHaveLength(3);
    expect(payload.notifications[0]?.type).toBe('contribution_added');
    expect(payload.notifications[1]?.type).toBe('invite_accepted');
    expect(payload.next_cursor).toBeNull();
    expect(
      notificationListResponseSchema.safeParse({
        notifications: mockNotifications,
        unread_count: 2,
      }).success
    ).toBe(false);
  });

  it('parses POST /v1/notifications/{id}/read as the same item shape', () => {
    const read = notificationResponseSchema.parse({
      ...mockNotifications[0],
      read_at: '2026-10-22T08:01:00.000Z',
    });
    expect(read.read_at).toBe('2026-10-22T08:01:00.000Z');
    expect(notificationResponseSchema.safeParse({ ...mockNotifications[0], id: 'not-a-uuid' }).success).toBe(
      false
    );
  });

  it('formats Eddy bodies and routes contribution to the memory, invite to family', () => {
    expect(notificationBody(mockNotifications[0])).toBe(
      interpolate(copy['notification.contribution_added'], {
        actor_display_name: 'Mint',
        event_title: 'ทริปทะเลกับคุณยาย',
      })
    );
    expect(notificationBody(mockNotifications[0])).toBe('Mint เล่าเรื่องใน ทริปทะเลกับคุณยาย');
    expect(notificationHref(mockNotifications[0])).toBe(`/memories/${mockEvents[0].id}`);
    expect(notificationFamilyId(mockNotifications[0])).toBe(mockFamilies[0].id);

    expect(notificationBody(mockNotifications[1])).toBe(
      interpolate(copy['notification.invite_accepted'], {
        actor_display_name: 'Mae',
        family_name: mockFamilies[0].name,
      })
    );
    expect(notificationBody(mockNotifications[1])).toBe('Mae รับคำเชิญและเข้าร่วม บ้านเรา แล้ว');
    expect(notificationHref(mockNotifications[1])).toBe('/family');
  });
});
