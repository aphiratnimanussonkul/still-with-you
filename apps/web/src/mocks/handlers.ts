import {
  accountResponseSchema,
  createEventSchema,
  createFamilySchema,
  eventListResponseSchema,
  eventResponseSchema,
  familyListResponseSchema,
  familyResponseSchema,
  updateConsentSchema,
} from '@still-with-you/contracts';
import { http, HttpResponse, passthrough } from 'msw';
import { env } from '@/lib/env';
import { mockAccount, mockEvents, mockFamilies } from '@/mocks/data';

const api = env.apiUrl.replace(/\/$/, '');
const supabase = env.supabaseUrl.replace(/\/$/, '');

let account = { ...mockAccount };
const families = [...mockFamilies];
const events = [...mockEvents];

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
      consent_answered_at: account.consent_answered_at ?? now,
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
];
