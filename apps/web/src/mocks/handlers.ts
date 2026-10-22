import {
  accountResponseSchema,
  contributionResponseSchema,
  createContributionSchema,
  createEventSchema,
  createFamilySchema,
  createMediaUploadSchema,
  eventListResponseSchema,
  eventResponseSchema,
  familyListResponseSchema,
  familyResponseSchema,
  mediaItemSchema,
  mediaUploadSessionSchema,
  updateConsentSchema,
  updateContributionSchema,
} from '@still-with-you/contracts';
import { http, HttpResponse, passthrough } from 'msw';
import { env } from '@/lib/env';
import { MEDIA_DEFAULTS } from '@/lib/media-config';
import { mockAccount, mockEvents, mockFamilies } from '@/mocks/data';

const api = env.apiUrl.replace(/\/$/, '');
const supabase = env.supabaseUrl.replace(/\/$/, '');

let account = { ...mockAccount };
const families = [...mockFamilies];
const events = [...mockEvents];
const contributions: Array<{
  id: string;
  family_id: string;
  owner_account_id: string;
  event_id: string;
  origin_event_id: string;
  origin_event_title_snapshot: string | null;
  story: string;
  media_ids: string[];
  created_at: string;
  updated_at: string;
  version: number;
}> = [];
const mediaUploads = new Map<string, { sizeBytes: number; uploaded: boolean; complete: boolean }>();

function mediaIdsError(mediaIds: string[]) {
  if (mediaIds.length > MEDIA_DEFAULTS.maxPerStory) {
    return HttpResponse.json(
      {
        error: {
          code: 'TOO_MANY_PHOTOS',
          message: 'Too many photos',
          details: { max_per_story: MEDIA_DEFAULTS.maxPerStory },
        },
      },
      { status: 422 }
    );
  }
  const notReady = mediaIds.filter((id) => !mediaUploads.get(id)?.complete);
  if (notReady.length > 0) {
    return HttpResponse.json(
      {
        error: { code: 'MEDIA_NOT_READY', message: 'Media not ready', details: { media_ids: notReady } },
      },
      { status: 409 }
    );
  }
  return null;
}

function toContributionResponse(item: (typeof contributions)[number]) {
  return contributionResponseSchema.parse({
    id: item.id,
    family_id: item.family_id,
    owner_account_id: item.owner_account_id,
    narrator_person_id: null,
    event_id: item.event_id,
    origin_event_id: item.origin_event_id,
    origin_event_title_snapshot: item.origin_event_title_snapshot,
    story: item.story,
    status: 'published',
    trashed_at: null,
    trash_reason: null,
    derived_from_contribution_id: null,
    version: item.version,
    created_at: item.created_at,
    updated_at: item.updated_at,
    media: item.media_ids.map((id) => ({
      id,
      status: 'ready' as const,
      url: `${api}/v1/mock-uploads/${id}`,
      thumb_url: null,
    })),
  });
}

function requireAuth(request: Request) {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return HttpResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } },
      { status: 401 }
    );
  }
  return null;
}

export const handlers = [
  // PKCE token exchange and auth API must hit the real project, never MSW.
  http.all(`${supabase}/*`, () => passthrough()),

  http.get(`${api}/v1/me`, ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    return HttpResponse.json(accountResponseSchema.parse(account));
  }),

  http.patch(`${api}/v1/me/consent`, async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const body = updateConsentSchema.parse(await request.json());
    const now = new Date().toISOString();
    account = {
      ...account,
      marketing_consent: body.marketing_consent,
      marketing_consent_at:
        account.marketing_consent !== body.marketing_consent ? now : account.marketing_consent_at,
      consent_answered_at: now,

    };
    return HttpResponse.json(accountResponseSchema.parse(account));
  }),

  http.get(`${api}/v1/families`, ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    return HttpResponse.json(familyListResponseSchema.parse({ families }));
  }),

  http.post(`${api}/v1/families`, async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const body = createFamilySchema.parse(await request.json());
    const created = familyResponseSchema.parse({
      id: crypto.randomUUID(),
      name: body.name,
      created_by: account.id,
      created_at: new Date().toISOString(),
    });
    families.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),

  http.get(`${api}/v1/families/:fid`, ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const family = families.find((item) => item.id === params.fid);
    if (!family) {
      return HttpResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Family not found' } },
        { status: 404 }
      );
    }
    return HttpResponse.json(familyResponseSchema.parse(family));
  }),

  http.post(`${api}/v1/families/:fid/media/uploads`, async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const body = createMediaUploadSchema.parse(await request.json());
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (!allowed.includes(body.content_type)) {
      return HttpResponse.json(
        { error: { code: 'UNSUPPORTED_TYPE', message: 'Unsupported type' } },
        { status: 415 }
      );
    }
    if (body.size_bytes > MEDIA_DEFAULTS.maxBytes) {
      return HttpResponse.json(
        {
          error: {
            code: 'FILE_TOO_LARGE',
            message: 'File too large',
            details: { max_bytes: MEDIA_DEFAULTS.maxBytes },
          },
        },
        { status: 413 }
      );
    }
    const mediaId = crypto.randomUUID();
    mediaUploads.set(mediaId, { sizeBytes: body.size_bytes, uploaded: false, complete: false });
    const session = mediaUploadSessionSchema.parse({
      media_id: mediaId,
      upload_url: `${api}/v1/mock-uploads/${mediaId}`,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      max_bytes: MEDIA_DEFAULTS.maxBytes,
      max_per_story: MEDIA_DEFAULTS.maxPerStory,
    });
    return HttpResponse.json(session, { status: 201 });
  }),

  http.put(`${api}/v1/mock-uploads/:id`, async ({ params }) => {
    const item = mediaUploads.get(String(params.id));
    if (!item) {
      return HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Upload not found' } }, { status: 404 });
    }
    item.uploaded = true;
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${api}/v1/media/:id/complete`, ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const item = mediaUploads.get(String(params.id));
    if (!item?.uploaded) {
      return HttpResponse.json(
        { error: { code: 'UPLOAD_MISMATCH', message: 'Upload mismatch' } },
        { status: 422 }
      );
    }
    item.complete = true;
    return HttpResponse.json(
      mediaItemSchema.parse({
        id: String(params.id),
        status: 'ready',
        url: `${api}/v1/mock-uploads/${params.id}`,
        thumb_url: null,
        width: 1024,
        height: 768,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
    );
  }),

  http.get(`${api}/v1/families/:fid/events`, ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const visible = events.filter((item) => item.family_id === params.fid);
    return HttpResponse.json(eventListResponseSchema.parse({ events: visible }));
  }),

  http.post(`${api}/v1/families/:fid/events`, async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const body = createEventSchema.parse(await request.json());
    const mediaIds = body.media_ids ?? [];
    const mediaError = mediaIdsError(mediaIds);
    if (mediaError) return mediaError;
    const created = eventResponseSchema.parse({
      id: crypto.randomUUID(),
      family_id: String(params.fid),
      creator_account_id: account.id,
      title: body.title,
      description: body.description ?? null,
      occurred_from: body.occurred_from ?? null,
      occurred_to: body.occurred_to ?? null,
      date_precision: body.date_precision ?? null,
      location: body.location ?? null,
      status: 'active',
      archived_at: null,
      deletable_at: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
    });
    events.push(created);
    contributions.push({
      id: crypto.randomUUID(),
      family_id: created.family_id,
      owner_account_id: account.id,
      event_id: created.id,
      origin_event_id: created.id,
      origin_event_title_snapshot: created.title,
      story: body.story,
      media_ids: mediaIds,
      created_at: created.created_at,
      updated_at: created.updated_at,
      version: 1,
    });
    return HttpResponse.json(created, { status: 201 });
  }),

  http.get(`${api}/v1/events/:id`, ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const event = events.find((item) => item.id === params.id);
    if (!event) {
      return HttpResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Event not found' } },
        { status: 404 }
      );
    }
    return HttpResponse.json(eventResponseSchema.parse(event));
  }),

  http.get(`${api}/v1/events/:id/contributions`, ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    return HttpResponse.json({
      contributions: contributions
        .filter((item) => item.event_id === params.id)
        .map(toContributionResponse),
    });
  }),

  http.post(`${api}/v1/events/:id/contributions`, async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const event = events.find((item) => item.id === params.id);
    if (!event) {
      return HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Event not found' } }, { status: 404 });
    }
    const body = createContributionSchema.parse(await request.json());
    const mediaIds = body.media_ids ?? [];
    const mediaError = mediaIdsError(mediaIds);
    if (mediaError) return mediaError;
    const now = new Date().toISOString();
    const created = {
      id: crypto.randomUUID(),
      family_id: event.family_id,
      owner_account_id: account.id,
      event_id: event.id,
      origin_event_id: event.id,
      origin_event_title_snapshot: event.title,
      story: body.story,
      media_ids: mediaIds,
      created_at: now,
      updated_at: now,
      version: 1,
    };
    contributions.push(created);
    return HttpResponse.json(toContributionResponse(created), { status: 201 });
  }),

  http.patch(`${api}/v1/contributions/:id`, async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const item = contributions.find((row) => row.id === params.id);
    if (!item) {
      return HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
    }
    const body = updateContributionSchema.parse(await request.json());
    if (body.media_ids) {
      const mediaError = mediaIdsError(body.media_ids);
      if (mediaError) return mediaError;
      item.media_ids = body.media_ids;
    }
    if (body.story) item.story = body.story;
    item.updated_at = new Date().toISOString();
    item.version += 1;
    return HttpResponse.json(toContributionResponse(item));
  }),
];
