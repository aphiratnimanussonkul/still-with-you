/**
 * Isolated notifications client. Built against GET /v1/me/notifications
 * and POST /v1/notifications/{id}/read from packages/contracts.
 */
import {
  notificationListResponseSchema,
  notificationResponseSchema,
  type NotificationListResponse,
  type NotificationResponse,
} from '@still-with-you/contracts';
import { copy, interpolate } from '@/copy';
import { request } from '@/lib/api-client';

export type { NotificationListResponse, NotificationResponse };

export const notificationsApi = {
  list(cursor?: string): Promise<NotificationListResponse> {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return request(`/v1/me/notifications${query}`, notificationListResponseSchema);
  },

  markRead(id: string): Promise<NotificationResponse> {
    return request(`/v1/notifications/${id}/read`, notificationResponseSchema, {
      method: 'POST',
    });
  },
};

export function notificationBody(item: NotificationResponse): string {
  if (item.type === 'contribution_added' && 'event_title' in item.payload) {
    if (item.payload.event_title == null) {
      return interpolate(copy['notification.contribution_added.hidden'], {
        actor_display_name: item.payload.actor_display_name,
      });
    }
    return interpolate(copy['notification.contribution_added'], {
      actor_display_name: item.payload.actor_display_name,
      event_title: item.payload.event_title,
    });
  }
  if (item.type === 'invite_accepted' && 'family_name' in item.payload) {
    return interpolate(copy['notification.invite_accepted'], {
      actor_display_name: item.payload.actor_display_name,
      family_name: item.payload.family_name,
    });
  }
  return '';
}

export function notificationHref(item: NotificationResponse): string {
  if (item.type === 'contribution_added' && 'event_id' in item.payload) {
    return `/memories/${item.payload.event_id}`;
  }
  return '/family';
}

export function notificationFamilyId(item: NotificationResponse): string {
  return item.payload.family_id;
}
