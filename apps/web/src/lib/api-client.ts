import {
  accountResponseSchema,
  contributionResponseSchema,
  createContributionSchema,
  createEventSchema,
  createFamilySchema,
  eventListResponseSchema,
  eventResponseSchema,
  familyListResponseSchema,
  familyResponseSchema,
  updateConsentSchema,
  updateContributionSchema,
  type AccountResponse,
  type CreateContribution,
  type CreateEvent,
  type CreateFamily,
  type ContributionResponse,
  type EventListResponse,
  type EventResponse,
  type FamilyListResponse,
  type FamilyResponse,
  type UpdateConsent,
  type UpdateContribution,
} from '@still-with-you/contracts';
import type { z } from 'zod';
import { ApiClientError, NetworkError } from '@/lib/api-errors';
import { env } from '@/lib/env';
import { getAccessToken } from '@/lib/supabase';

type RequestOptions = {
  method?: string;
  body?: unknown;
  idempotent?: boolean;
};

export async function request<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  options: RequestOptions = {}
): Promise<z.output<S>> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.idempotent) {
    headers['Idempotency-Key'] = crypto.randomUUID();
  }

  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new NetworkError();
  }

  if (response.status === 204) {
    return undefined as z.output<S>;
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorBody = isApiErrorPayload(payload) ? payload.error : undefined;
    throw new ApiClientError(
      errorBody?.code ?? 'INTERNAL_ERROR',
      errorBody?.message ?? response.statusText,
      response.status,
      errorBody?.field,
      errorBody?.details
    );
  }

  return schema.parse(payload);
}

function isApiErrorPayload(
  value: unknown
): value is { error: { code: string; message: string; field?: string; details?: Record<string, unknown> } } {
  if (!value || typeof value !== 'object' || !('error' in value)) return false;
  const error = (value as { error: unknown }).error;
  return Boolean(error && typeof error === 'object' && 'code' in error && 'message' in error);
}

export const api = {
  getMe(): Promise<AccountResponse> {
    return request('/v1/me', accountResponseSchema);
  },

  updateConsent(body: UpdateConsent): Promise<AccountResponse> {
    return request('/v1/me/consent', accountResponseSchema, {
      method: 'PATCH',
      body: updateConsentSchema.parse(body),
    });
  },

  listFamilies(): Promise<FamilyListResponse> {
    return request('/v1/families', familyListResponseSchema);
  },

  getFamily(familyId: string): Promise<FamilyResponse> {
    return request(`/v1/families/${familyId}`, familyResponseSchema);
  },

  createFamily(body: CreateFamily): Promise<FamilyResponse> {
    return request('/v1/families', familyResponseSchema, {
      method: 'POST',
      body: createFamilySchema.parse(body),
      idempotent: true,
    });
  },

  listEvents(familyId: string): Promise<EventListResponse> {
    return request(`/v1/families/${familyId}/events`, eventListResponseSchema);
  },

  getEvent(eventId: string): Promise<EventResponse> {
    return request(`/v1/events/${eventId}`, eventResponseSchema);
  },

  createEvent(familyId: string, body: CreateEvent): Promise<EventResponse> {
    return request(`/v1/families/${familyId}/events`, eventResponseSchema, {
      method: 'POST',
      body: createEventSchema.parse(body),
      idempotent: true,
    });
  },

  createContribution(eventId: string, body: CreateContribution): Promise<ContributionResponse> {
    return request(`/v1/events/${eventId}/contributions`, contributionResponseSchema, {
      method: 'POST',
      body: createContributionSchema.parse(body),
      idempotent: true,
    });
  },

  updateContribution(contributionId: string, body: UpdateContribution): Promise<ContributionResponse> {
    return request(`/v1/contributions/${contributionId}`, contributionResponseSchema, {
      method: 'PATCH',
      body: updateContributionSchema.parse(body),
    });
  },
};
