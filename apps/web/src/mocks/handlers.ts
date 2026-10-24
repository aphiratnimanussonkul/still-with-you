import {
  accountResponseSchema,
  contributionResponseSchema,
  createContributionSchema,
  createEventSchema,
  createFamilySchema,
  createMediaUploadSchema,
  createPersonResponseSchema,
  createPersonSchema,
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
  updateConsentSchema,
  updateContributionSchema,
  updatePersonSchema,
  ErrorCode,
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
  familyInviteSchema,
  familyInvitesSchema,
  familyMembersSchema,
  personInviteSchema,
} from '@/lib/family-graph';
import { deathDatePrecisionOrNull } from '@/lib/person-years';
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
          person: { id: person.id, display_name: person.name },
          photo_url: null,
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
  media_ids: [],
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
        width: null,
        height: null,
        expires_at: null,
      })),
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
        person: { id: person.id, display_name: person.display_name },
        photo_url: null,
        memory_count: events.filter((event) => event.family_id === fid && event.status === 'active').length,
        position,
      })),
      quick_question:
        first && questionIndex >= 0
          ? {
              question_id: homeQuestionId(questionIndex),
              key: `q-${questionIndex + 1}`,
              person: { id: first.id, display_name: first.display_name },
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

  http.post(`${api}/v1/families/:fid/people`, async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
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
    return jsonContract(personResponseSchema, person);
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
    const created = {
      id: crypto.randomUUID(),
      family_id: person.family_id,
      person_id: person.id,
      email: body.email.trim(),
      status: 'pending' as const,
      url: `https://app.example.com/invite/${crypto.randomUUID()}`,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    };
    return jsonContract(personInviteSchema, created, { status: 201 });
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
