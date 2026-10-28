import {
  accountResponseSchema,
  contributionListResponseSchema,
  contributionResponseSchema,
  createContributionSchema,
  createEventSchema,
  createFamilySchema,
  createMediaUploadSchema,
  createPersonResponseSchema,
  createPersonSchema,
  createRelationshipSchema,
  relationshipResponseSchema,
  eventListResponseSchema,
  eventResponseSchema,
  familyListResponseSchema,
  familyResponseSchema,
  focusListResponseSchema,
  homeResponseSchema,
  mediaItemSchema,
  personFactsResponseSchema,
  personListResponseSchema,
  personResponseSchema,
  mediaUploadSessionSchema,
  notificationIdParamSchema,
  notificationListResponseSchema,
  notificationResponseSchema,
  type NotificationResponse,
  updateConsentSchema,
  updateContributionSchema,
  updateEventSchema,
  updatePersonSchema,
  eventEditConflictErrorSchema,
  ErrorCode,
  EVENT_DELETE_COOLING_DAYS,
  errorMessages,
} from '@still-with-you/contracts';
import { http, HttpResponse, passthrough } from 'msw';
import type { z } from 'zod';
import { env } from '@/lib/env';
import { MEDIA_DEFAULTS } from '@/lib/media-config';
import {
  mockAccount,
  mockContributions,
  mockEvents,
  mockFamilies,
  mockFocusIds,
  mockMembers,
  mockNotifications,
  mockPeople,
  mockRelationships,
  mockTrash,
} from '@/mocks/data';
import {
  createFactSchema,
  familyFocusRequestSchema,
  skipFactSchema,
  updateFactSchema,
} from '@/lib/home-api';
import {
  acceptPersonInviteResponseSchema,
  familyInviteSchema,
  familyInvitesSchema,
  familyMembersSchema,
  personInvitePreviewSchema,
  personInviteSchema,
} from '@/lib/family-graph';
import { deathDatePrecisionOrNull } from '@/lib/person-years';
import { mockPatchEvent } from '@/mocks/event-patch';
import { HOME_QUESTION_TEMPLATES, fillQuestionText, homeQuestionId } from '@/mocks/home-questions';

const api = env.apiUrl.replace(/\/$/, '');
const supabase = env.supabaseUrl.replace(/\/$/, '');

function jsonContract<S extends z.ZodTypeAny>(schema: S, data: unknown, init?: ResponseInit) {
  return HttpResponse.json(schema.parse(data), init);
}

function focusListPayload(familyId: string) {
  const ids = focusByFamily[familyId] ?? [];
  return {
    items: ids.flatMap((id, position) => {
      const person = people.find((row) => row.id === id);
      if (!person) return [];
      return [
        {
          person: { id: person.id, display_name: person.name, name: person.name },
          photo_url: person.avatar_url ?? null,
          photo_url_expires_at: person.avatar_url_expires_at ?? null,
          avatar_url: person.avatar_url ?? null,
          avatar_url_expires_at: person.avatar_url_expires_at ?? null,
          avatar_placeholder: person.avatar_placeholder ?? null,
          full_url: person.full_url ?? null,
          full_url_expires_at: person.full_url_expires_at ?? null,
          memory_count: events.filter(
            (event) => event.family_id === familyId && event.status === 'active'
          ).length,
          position,
        },
      ];
    }),
  };
}

let account = { ...mockAccount };
const families = [...mockFamilies];
const events = [...mockEvents];
const people = [...mockPeople];
const relationships = [...mockRelationships];
const members = [...mockMembers];
const trash = [...mockTrash];
const invites: { id: string; family_id: string; email: string; status: 'pending'; expires_at: string; created_at: string }[] =
  [];
const personInvites: Array<{
  id: string;
  family_id: string;
  person_id: string;
  email: string;
  token: string;
  status: 'pending' | 'accepted' | 'revoked';
  url: string;
  expires_at: string;
  created_at: string;
}> = [];
const focusByFamily: Record<string, string[]> = { ...mockFocusIds };
const skippedQuestions = new Set<string>();
const answeredQuestions = new Set<string>();
const factsByPerson: Record<
  string,
  {
    id: string;
    question_id: string;
    question_text?: string;
    answer_text: string;
    author: { account_id: string; display_name: string };
    created_at: string;
  }[]
> = {};
const notifications: NotificationResponse[] = mockNotifications.map((item) => ({
  ...item,
  payload: { ...item.payload },
}));
const contributions: Array<{
  id: string;
  family_id: string;
  owner_account_id: string;
  owner_display_name: string;
  event_id: string;
  origin_event_id: string;
  origin_event_title_snapshot: string | null;
  story: string;
  media_ids: string[];
  created_at: string;
  updated_at: string;
  version: number;
}> = mockContributions.map((item) => ({
  id: item.id,
  family_id: mockEvents.find((event) => event.id === item.event_id)?.family_id ?? mockFamilies[0].id,
  owner_account_id: item.owner_account_id,
  owner_display_name: item.owner_display_name ?? account.display_name,
  event_id: item.event_id,
  origin_event_id: item.event_id,
  origin_event_title_snapshot: mockEvents.find((event) => event.id === item.event_id)?.title ?? null,
  story: item.story ?? '',
  media_ids: item.media?.map((photo) => photo.id) ?? [],
  created_at: item.created_at,
  updated_at: item.created_at,
  version: 1,
}));
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
  return {
    ...contributionResponseSchema.parse({
      id: item.id,
      family_id: item.family_id,
      owner_account_id: item.owner_account_id,
      author_id: item.owner_account_id,
      is_mine: item.owner_account_id === account.id,
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
      media: item.media_ids.map((id) => {
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        return {
          id,
          status: 'ready' as const,
          url: `${api}/v1/mock-uploads/${id}`,
          url_expires_at: expiresAt,
          thumb_url: null,
          thumb_url_expires_at: null,
          full_url: `${api}/v1/mock-uploads/${id}`,
          full_url_expires_at: expiresAt,
          width: null,
          height: null,
          expires_at: expiresAt,
        };
      }),
    }),
    owner_display_name: item.owner_display_name,
  };
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

  http.get(`${api}/v1/me/notifications`, ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitRaw = url.searchParams.get('limit');
    const limit = limitRaw ? Number(limitRaw) : 20;
    const pageSize = Number.isFinite(limit) ? Math.min(100, Math.max(1, limit)) : 20;

    const memberFamilyIds = new Set(
      members.filter((row) => row.account_id === account.id).map((row) => row.family_id)
    );
    const visible = notifications
      .filter((item) => memberFamilyIds.has(item.payload.family_id))
      .slice()
      .sort((a, b) => {
        if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
        return a.id < b.id ? 1 : -1;
      });

    let start = 0;
    if (cursor) {
      const index = visible.findIndex((item) => item.id === cursor);
      start = index === -1 ? visible.length : index + 1;
    }
    const page = visible.slice(start, start + pageSize);
    const last = page[page.length - 1];
    return jsonContract(notificationListResponseSchema, {
      notifications: page,
      next_cursor: start + page.length < visible.length && last ? last.id : null,
      unread_count: visible.filter((item) => item.read_at === null).length,
    });
  }),

  http.post(`${api}/v1/notifications/:id/read`, ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const parsed = notificationIdParamSchema.safeParse({ id: params.id });
    if (!parsed.success) {
      return HttpResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Notification not found' } },
        { status: 404 }
      );
    }
    const item = notifications.find((row) => row.id === parsed.data.id);
    if (!item) {
      return HttpResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Notification not found' } },
        { status: 404 }
      );
    }
    if (!item.read_at) {
      item.read_at = new Date().toISOString();
    }
    return jsonContract(notificationResponseSchema, item);
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
        url_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        thumb_url: null,
        thumb_url_expires_at: null,
        full_url: `${api}/v1/mock-uploads/${params.id}`,
        full_url_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        width: 1024,
        height: 768,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
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
      creator_display_name: account.display_name,
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
      paused: false,
      cover_url: null,
      cover_url_expires_at: null,
      cover_placeholder: null,
      full_url: null,
      full_url_expires_at: null,
    });
    events.push(created);
    contributions.push({
      id: crypto.randomUUID(),
      family_id: created.family_id,
      owner_account_id: account.id,
      owner_display_name: account.display_name,
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

  http.patch(`${api}/v1/events/:id`, async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const event = events.find((item) => item.id === params.id);
    if (!event) {
      return HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Event not found' } }, { status: 404 });
    }
    if (event.status !== 'active') {
      return HttpResponse.json(
        { error: { code: ErrorCode.EVENT_NOT_ACTIVE, message: 'Event must be active to edit' } },
        { status: 409 }
      );
    }
    const parsed = updateEventSchema.safeParse(await request.json());
    if (!parsed.success) {
      const field = parsed.error.errors[0]?.path.join('.') || undefined;
      if (field === 'version') {
        return HttpResponse.json(
          {
            error: {
              code: ErrorCode.VALIDATION_ERROR,
              message: errorMessages[ErrorCode.VALIDATION_ERROR],
              field: 'version',
            },
          },
          { status: 400 }
        );
      }
      return HttpResponse.json({ error: { code: 'INVALID_INPUT', message: 'invalid event' } }, { status: 400 });
    }
    const result = mockPatchEvent(event, parsed.data);
    if (!result.ok) {
      return jsonContract(eventEditConflictErrorSchema, result.body, { status: result.status });
    }
    Object.assign(event, result.event);
    return jsonContract(eventResponseSchema, event);
  }),

  http.post(`${api}/v1/events/:id/archive`, ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const event = events.find((item) => item.id === params.id);
    if (!event) {
      return HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Event not found' } }, { status: 404 });
    }
    const archivedAt = new Date();
    Object.assign(event, {
      status: 'archived',
      paused: true,
      archived_at: archivedAt.toISOString(),
      deletable_at: new Date(
        archivedAt.getTime() + EVENT_DELETE_COOLING_DAYS * 24 * 60 * 60 * 1000
      ).toISOString(),
      updated_at: archivedAt.toISOString(),
    });
    return jsonContract(eventResponseSchema, event);
  }),

  http.get(`${api}/v1/families/:fid/home`, ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const fid = String(params.fid);
    const focused = (focusByFamily[fid] ?? [])
      .map((id) => people.find((person) => person.id === id))
      .filter((person): person is (typeof people)[number] => Boolean(person));
    const first = focused[0];
    const questionIndex = HOME_QUESTION_TEMPLATES.findIndex((_, index) => {
      const id = `q-${index + 1}`;
      return !skippedQuestions.has(id) && !answeredQuestions.has(id);
    });
    return jsonContract(homeResponseSchema, {
      focus: focused.map((person, position) => ({
        person: { id: person.id, display_name: person.display_name, name: person.display_name },
        photo_url: person.avatar_url ?? null,
        photo_url_expires_at: person.avatar_url_expires_at ?? null,
        avatar_url: person.avatar_url ?? null,
        avatar_url_expires_at: person.avatar_url_expires_at ?? null,
        avatar_placeholder: person.avatar_placeholder ?? null,
        full_url: person.full_url ?? null,
        full_url_expires_at: person.full_url_expires_at ?? null,
        memory_count: person.memory_count ?? 0,
        position,
      })),
      quick_question:
        first && questionIndex >= 0
          ? {
              question_id: homeQuestionId(questionIndex),
              key: `q-${questionIndex + 1}`,
              person: { id: first.id, display_name: first.display_name, name: first.display_name },
              text: fillQuestionText(HOME_QUESTION_TEMPLATES[questionIndex], first.display_name),
            }
          : null,
      recent_memories: events
        .filter((event) => event.family_id === fid && event.status === 'active')
        .slice(0, 5),
    });
  }),

  http.get(`${api}/v1/families/:fid/focus`, ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    return jsonContract(focusListResponseSchema, focusListPayload(String(params.fid)));
  }),

  http.put(`${api}/v1/families/:fid/focus`, async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const body = await request.json();
    const parsed = familyFocusRequestSchema.safeParse(body);
    if (!parsed.success) {
      return HttpResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'Invalid person_ids', field: 'person_ids' } },
        { status: 400 }
      );
    }
    focusByFamily[String(params.fid)] = parsed.data.person_ids;
    return jsonContract(focusListResponseSchema, focusListPayload(String(params.fid)));
  }),

  http.get(`${api}/v1/families/:fid/members`, ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    return jsonContract(familyMembersSchema, {
      members: members.filter((member) => member.family_id === params.fid),
    });
  }),

  http.get(`${api}/v1/families/:fid/invites`, ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    return jsonContract(familyInvitesSchema, {
      invites: invites
        .filter((invite) => invite.family_id === params.fid)
        .map(({ id, email, expires_at, created_at }) => ({
          id,
          email,
          role: 'member' as const,
          invited_by: account.id,
          expires_at,
          created_at,
        })),
    });
  }),

  http.post(`${api}/v1/families/:fid/invites`, async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const body = (await request.json()) as { email?: string };
    if (!body.email) {
      return HttpResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'email required', field: 'email' } },
        { status: 400 }
      );
    }
    const created = {
      id: crypto.randomUUID(),
      family_id: String(params.fid),
      email: body.email,
      status: 'pending' as const,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    };
    invites.push(created);
    return jsonContract(
      familyInviteSchema,
      {
        id: created.id,
        email: created.email,
        url: `https://app.example.com/invite/${created.id}`,
        expires_at: created.expires_at,
      },
      { status: 201 }
    );
  }),

  http.get(`${api}/v1/families/:fid/people`, ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    return jsonContract(personListResponseSchema, {
      people: people.filter((person) => person.family_id === params.fid),
      relationships: relationships.filter((edge) => edge.family_id === params.fid),
    });
  }),

  // POST /v1/families/{id}/people is family steward only (others 403 FORBIDDEN).
  http.post(`${api}/v1/families/:fid/people`, async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const caller = members.find((row) => row.family_id === params.fid && row.account_id === account.id);
    if (caller?.role !== 'admin') {
      return HttpResponse.json({ error: { code: 'FORBIDDEN', message: 'admin required' } }, { status: 403 });
    }
    const parsed = createPersonSchema.safeParse(await request.json());
    if (!parsed.success) {
      return HttpResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'invalid person', field: 'display_name' } },
        { status: 400 }
      );
    }
    const body = parsed.data;
    const name = (body.display_name ?? body.name)?.trim();
    if (!name) {
      return HttpResponse.json(
        { error: { code: 'NAME_REQUIRED', message: 'name required', field: 'name' } },
        { status: 400 }
      );
    }
    const isLiving = body.is_living !== false;
    const deathDate = isLiving ? null : body.death_date ?? null;
    const birthDate = body.birth_date ?? null;
    if (deathDate) {
      const today = new Date().toISOString().slice(0, 10);
      if ((birthDate && deathDate < birthDate) || deathDate > today) {
        return HttpResponse.json(
          { error: { code: ErrorCode.INVALID_DEATH_DATE, message: 'invalid death date', field: 'death_date' } },
          { status: 400 }
        );
      }
    }
    const created = {
      id: crypto.randomUUID(),
      family_id: String(params.fid),
      display_name: name,
      name,
      relation_label: body.relation_label?.trim() || null,
      account_id: null,
      is_living: isLiving,
      birth_date: birthDate,
      death_date: deathDate,
      death_date_precision: deathDatePrecisionOrNull(deathDate, body.death_date_precision),
      avatar_media_id: body.avatar_media_id ?? null,
      avatar_url: null,
      avatar_url_expires_at: null,
      avatar_placeholder: null,
      full_url: null,
      full_url_expires_at: null,
      memory_count: 0,
      age:
        !isLiving && birthDate && deathDate
          ? Math.max(0, Number(deathDate.slice(0, 4)) - Number(birthDate.slice(0, 4)))
          : null,
    };
    people.push(created);

    let createdEdge = null;
    if (body.relationship) {
      const target = people.find(
        (person) => person.id === body.relationship!.person_id && person.family_id === params.fid
      );
      if (!target || target.id === created.id) {
        return HttpResponse.json(
          {
            error: {
              code: ErrorCode.INVALID_RELATIONSHIP,
              message: 'invalid relationship',
              field: 'relationship.person_id',
            },
          },
          { status: 400 }
        );
      }
      const kind = body.relationship.kind;
      const pair =
        kind === 'parent_of'
          ? { type: 'parent' as const, person_id: created.id, related_person_id: target.id }
          : kind === 'child_of'
            ? { type: 'parent' as const, person_id: target.id, related_person_id: created.id }
            : {
                type: 'spouse' as const,
                person_id: created.id < target.id ? created.id : target.id,
                related_person_id: created.id < target.id ? target.id : created.id,
              };
      const exists = relationships.some(
        (edge) =>
          edge.family_id === params.fid &&
          edge.type === pair.type &&
          edge.person_id === pair.person_id &&
          edge.related_person_id === pair.related_person_id
      );
      if (exists) {
        return HttpResponse.json(
          { error: { code: ErrorCode.RELATIONSHIP_EXISTS, message: 'relationship exists' } },
          { status: 409 }
        );
      }
      createdEdge = {
        id: crypto.randomUUID(),
        family_id: String(params.fid),
        person_id: pair.person_id,
        related_person_id: pair.related_person_id,
        type: pair.type,
        created_by_account_id: account.id,
        created_at: new Date().toISOString(),
      };
      relationships.push(createdEdge);
    }

    return jsonContract(createPersonResponseSchema, { person: created, relationship: createdEdge }, { status: 201 });
  }),

  http.get(`${api}/v1/people/:id`, ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const person = people.find((row) => row.id === params.id);
    if (!person) {
      return HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Person not found' } }, { status: 404 });
    }
    return jsonContract(personResponseSchema, person);
  }),

  // PATCH /v1/people/{id} is family steward only on the API (others 403).
  http.patch(`${api}/v1/people/:id`, async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const person = people.find((row) => row.id === params.id);
    if (!person) {
      return HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Person not found' } }, { status: 404 });
    }
    const parsed = updatePersonSchema.safeParse(await request.json());
    if (!parsed.success) {
      return HttpResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'invalid person' } },
        { status: 400 }
      );
    }
    const body = parsed.data;
    const nextLiving = body.is_living ?? person.is_living !== false;
    const clearingDeath = body.death_date === null;
    const nextDeath = nextLiving || clearingDeath ? null : (body.death_date ?? person.death_date ?? null);
    if (nextLiving && nextDeath) {
      return HttpResponse.json(
        { error: { code: ErrorCode.INVALID_DEATH_DATE, message: 'invalid death date', field: 'death_date' } },
        { status: 400 }
      );
    }
    person.is_living = nextLiving;
    person.death_date = nextDeath;
    person.death_date_precision = deathDatePrecisionOrNull(nextDeath, body.death_date_precision);
    if (body.display_name?.trim()) {
      person.display_name = body.display_name.trim();
      person.name = body.display_name.trim();
    }
    if (body.relation_label !== undefined) {
      person.relation_label = body.relation_label;
    }
    if (body.gender !== undefined) person.gender = body.gender;
    if (body.family_name !== undefined) person.family_name = body.family_name;
    if (body.birth_date !== undefined) person.birth_date = body.birth_date;
    if (body.birth_date_precision !== undefined) person.birth_date_precision = body.birth_date_precision;
    if (body.bio !== undefined) person.bio = body.bio;
    if (body.avatar_media_id !== undefined) person.avatar_media_id = body.avatar_media_id;
    return jsonContract(personResponseSchema, person);
  }),

  http.delete(`${api}/v1/people/:id`, ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const index = people.findIndex((row) => row.id === params.id);
    if (index < 0) {
      return HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Person not found' } }, { status: 404 });
    }
    const person = people[index]!;
    const caller = members.find((row) => row.family_id === person.family_id && row.account_id === account.id);
    if (caller?.role !== 'admin') {
      return HttpResponse.json({ error: { code: 'FORBIDDEN', message: 'admin required' } }, { status: 403 });
    }
    if (person.account_id) {
      return HttpResponse.json(
        { error: { code: ErrorCode.PERSON_LINKED, message: 'Person is linked' } },
        { status: 409 }
      );
    }
    people.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${api}/v1/people/:id/invites`, async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const person = people.find((row) => row.id === params.id);
    if (!person) {
      return HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Person not found' } }, { status: 404 });
    }
    const caller = members.find((row) => row.family_id === person.family_id && row.account_id === account.id);
    if (caller?.role !== 'admin') {
      return HttpResponse.json({ error: { code: 'FORBIDDEN', message: 'admin required' } }, { status: 403 });
    }
    if (person.is_living === false || person.account_id) {
      return HttpResponse.json({ error: { code: 'FORBIDDEN', message: 'living unlinked only' } }, { status: 403 });
    }
    const body = (await request.json()) as { email?: string };
    if (!body.email?.trim()) {
      return HttpResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'email required', field: 'email' } },
        { status: 400 }
      );
    }
    const token = crypto.randomUUID();
    const created = {
      id: crypto.randomUUID(),
      family_id: person.family_id,
      person_id: person.id,
      email: body.email.trim(),
      token,
      status: 'pending' as const,
      url: `https://app.example.com/invites/${token}`,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    };
    personInvites.push(created);
    return jsonContract(personInviteSchema, created, { status: 201 });
  }),

  http.get(`${api}/v1/invites/:token`, ({ params }) => {
    const invite = personInvites.find((row) => row.token === params.token);
    const expired = invite ? new Date(invite.expires_at).getTime() < Date.now() : false;
    if (!invite || invite.status !== 'pending' || expired) {
      return HttpResponse.json(
        { error: { code: 'INVITE_INVALID', message: 'Invite invalid' } },
        { status: 410 }
      );
    }
    const invited = people.find((row) => row.id === invite.person_id);
    const family = families.find((row) => row.id === invite.family_id);
    return jsonContract(personInvitePreviewSchema, {
      family_name: family?.name ?? '',
      inviter_display_name: account.display_name,
      person_display_name: invited?.display_name ?? null,
      expires_at: invite.expires_at,
    });
  }),

  http.post(`${api}/v1/invites/:token/accept`, ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const invite = personInvites.find((row) => row.token === params.token);
    const expired = invite ? new Date(invite.expires_at).getTime() < Date.now() : false;
    if (!invite || invite.status !== 'pending' || expired) {
      return HttpResponse.json(
        { error: { code: 'INVITE_INVALID', message: 'Invite invalid' } },
        { status: 410 }
      );
    }
    const invited = people.find((row) => row.id === invite.person_id);
    if (!invited) {
      return HttpResponse.json(
        { error: { code: 'INVITE_INVALID', message: 'Invite invalid' } },
        { status: 410 }
      );
    }
    if (invited.account_id) {
      return HttpResponse.json(
        { error: { code: 'PERSON_ALREADY_LINKED', message: 'Person already linked' } },
        { status: 409 }
      );
    }
    invited.account_id = account.id;
    invite.status = 'accepted';
    if (!members.some((row) => row.family_id === invited.family_id && row.account_id === account.id)) {
      members.push({
        account_id: account.id,
        family_id: invited.family_id,
        role: 'member',
        display_name: account.display_name,
        joined_at: new Date().toISOString(),
      });
    }
    return jsonContract(acceptPersonInviteResponseSchema, {
      family_id: invited.family_id,
      person_id: invited.id,
    });
  }),

  // POST /v1/families/{id}/relationships is family steward only on the API (others 403).
  http.post(`${api}/v1/families/:fid/relationships`, async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const parsed = createRelationshipSchema.safeParse(await request.json());
    if (!parsed.success) {
      return HttpResponse.json(
        { error: { code: ErrorCode.INVALID_RELATIONSHIP, message: 'invalid relationship' } },
        { status: 400 }
      );
    }
    let personId = parsed.data.person_id;
    let relatedPersonId = parsed.data.related_person_id;
    if (parsed.data.type === 'spouse' && relatedPersonId < personId) {
      personId = parsed.data.related_person_id;
      relatedPersonId = parsed.data.person_id;
    }
    const created = {
      id: crypto.randomUUID(),
      family_id: String(params.fid),
      person_id: personId,
      related_person_id: relatedPersonId,
      type: parsed.data.type,
      created_by_account_id: account.id,
      created_at: new Date().toISOString(),
    };
    relationships.push(created);
    return jsonContract(relationshipResponseSchema, created, { status: 201 });
  }),

  http.delete(`${api}/v1/relationships/:id`, ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const index = relationships.findIndex((row) => row.id === params.id);
    if (index === -1) {
      return HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Relationship not found' } }, { status: 404 });
    }
    relationships.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${api}/v1/events/:id/contributions`, ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    return jsonContract(contributionListResponseSchema, {
      contributions: contributions
        .filter((item) => item.event_id === params.id)
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
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
      owner_display_name: account.display_name,
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
    return jsonContract(contributionResponseSchema, toContributionResponse(created), { status: 201 });
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
    return jsonContract(contributionResponseSchema, toContributionResponse(item));
  }),

  http.post(`${api}/v1/people/:id/facts`, async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const parsed = createFactSchema.safeParse(await request.json());
    if (!parsed.success) {
      return HttpResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'answer required' } },
        { status: 400 }
      );
    }
    answeredQuestions.add(parsed.data.question_id);
    const personId = String(params.id);
    const fact = {
      id: crypto.randomUUID(),
      question_id: parsed.data.question_id,
      answer_text: parsed.data.answer_text,
      author: { account_id: account.id, display_name: account.display_name },
      created_at: new Date().toISOString(),
    };
    factsByPerson[personId] = [...(factsByPerson[personId] ?? []), fact];
    return HttpResponse.json(fact);
  }),

  http.post(`${api}/v1/people/:id/facts/skip`, async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const parsed = skipFactSchema.safeParse(await request.json());
    if (!parsed.success) {
      return HttpResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'question_id required' } },
        { status: 400 }
      );
    }
    skippedQuestions.add(parsed.data.question_id);
    return HttpResponse.json({ skipped: true });
  }),

  http.get(`${api}/v1/people/:id/facts`, ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const facts = factsByPerson[String(params.id)] ?? [];
    const groups = facts.map((fact) => ({
      question: {
        id: fact.question_id,
        key: fact.question_id,
        text: fact.question_text ?? '',
      },
      answers: [
        {
          id: fact.id,
          answer_text: fact.answer_text,
          author: fact.author,
          created_at: fact.created_at,
          updated_at: fact.created_at,
          can_edit: true,
          can_delete: true,
        },
      ],
    }));
    return jsonContract(personFactsResponseSchema, { groups });
  }),

  http.patch(`${api}/v1/facts/:id`, async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const parsed = updateFactSchema.safeParse(await request.json());
    if (!parsed.success) {
      return HttpResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'answer required' } },
        { status: 400 }
      );
    }
    for (const personId of Object.keys(factsByPerson)) {
      const fact = factsByPerson[personId].find((item) => item.id === params.id);
      if (fact) {
        fact.answer_text = parsed.data.answer_text;
        return HttpResponse.json({
          question_id: fact.question_id,
          answer_text: fact.answer_text,
        });
      }
    }
    return HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
  }),

  http.get(`${api}/v1/me/trash`, ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    return HttpResponse.json({ items: trash });
  }),
];
