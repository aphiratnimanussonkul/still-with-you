import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copy, interpolate, interpolateHeading } from '@/copy';
import { ApiClientError } from '@/lib/api-errors';
import { formatThaiDate } from '@/lib/dates';
import { mockAccount, mockFamilies, mockPeople } from '@/mocks/data';

const authState = { session: { access_token: 'tok' } as { access_token: string } | null };

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => authState,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn() },
}));

vi.mock('@/lib/family-graph', async () => {
  const actual = await vi.importActual<typeof import('@/lib/family-graph')>('@/lib/family-graph');
  return {
    ...actual,
    familyGraph: {
      getPersonInvite: vi.fn(),
      acceptPersonInvite: vi.fn(),
    },
  };
});

import { toast } from 'sonner';
import { familyGraph } from '@/lib/family-graph';
import { PersonInvitePage } from '@/pages/PersonInvitePage';

const inviteId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const invitePreview = {
  family_name: mockFamilies[0].name,
  inviter_display_name: mockAccount.display_name,
  person_display_name: mockPeople[0].display_name,
  expires_at: '2026-10-29T00:00:00.000Z',
};

function renderInvite() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/invites/${inviteId}`]}>
        <Routes>
          <Route path="/invites/:inviteId" element={<PersonInvitePage />} />
          <Route path="/family/people/:personId" element={<p>person-page</p>} />
          <Route path="/login" element={<p>login-page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PersonInvitePage', () => {
  beforeEach(() => {
    authState.session = { access_token: 'tok' };
    vi.mocked(familyGraph.getPersonInvite).mockReset();
    vi.mocked(familyGraph.acceptPersonInvite).mockReset();
    vi.mocked(familyGraph.getPersonInvite).mockResolvedValue(invitePreview);
    vi.mocked(toast.success).mockReset();
  });

  it('shows Eddy landing copy, expiry, and the signed-in accept button', async () => {
    renderInvite();
    expect(
      await screen.findByRole('heading', {
        name: interpolateHeading(copy['invite.landing.title'], {
          inviter_display_name: mockAccount.display_name,
          family_name: mockFamilies[0].name,
        }),
      })
    ).toBeTruthy();
    expect(
      screen.getByText(
        interpolate(copy['invite.landing.body'], {
          person_display_name: mockPeople[0].display_name,
        })
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        interpolate(copy['invite.landing.expires'], { date: formatThaiDate(invitePreview.expires_at) })
      )
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['invite.landing.accept'] })).toBeTruthy();
  });

  it('shows the family-invite body when person_display_name is null', async () => {
    vi.mocked(familyGraph.getPersonInvite).mockResolvedValue({
      ...invitePreview,
      person_display_name: null,
    });
    renderInvite();
    expect(
      await screen.findByRole('heading', {
        name: interpolateHeading(copy['invite.landing.title'], {
          inviter_display_name: mockAccount.display_name,
          family_name: mockFamilies[0].name,
        }),
      })
    ).toBeTruthy();
    expect(screen.getByText(copy['invite.family.body'])).toBeTruthy();
    expect(
      screen.getByText(
        interpolate(copy['invite.landing.expires'], { date: formatThaiDate(invitePreview.expires_at) })
      )
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['invite.landing.accept'] })).toBeTruthy();
    expect(screen.queryByText(/ในผังครอบครัวมีหน้าของ/)).toBeNull();
    expect(
      screen.queryByText(
        interpolate(copy['invite.landing.body'], { person_display_name: mockPeople[0].display_name })
      )
    ).toBeNull();
  });

  it('shows RATE_LIMITED invite copy on the landing', async () => {
    vi.mocked(familyGraph.getPersonInvite).mockRejectedValue(
      new ApiClientError('RATE_LIMITED', 'slow down', 429)
    );
    renderInvite();
    expect(await screen.findByText(copy['error.RATE_LIMITED.invite'])).toBeTruthy();
    expect(screen.queryByText(copy['error.RATE_LIMITED'])).toBeNull();
  });

  it('shows INVITE_INVALID when the invite is gone', async () => {
    vi.mocked(familyGraph.getPersonInvite).mockRejectedValue(
      new ApiClientError('INVITE_INVALID', 'gone', 410)
    );
    renderInvite();
    expect(await screen.findByText(copy['error.INVITE_INVALID'])).toBeTruthy();
  });

  it('shows PERSON_ALREADY_LINKED on accept', async () => {
    vi.mocked(familyGraph.acceptPersonInvite).mockRejectedValue(
      new ApiClientError('PERSON_ALREADY_LINKED', 'linked', 409)
    );
    renderInvite();
    fireEvent.click(await screen.findByRole('button', { name: copy['invite.landing.accept'] }));
    expect(
      await screen.findByText(
        interpolate(copy['error.PERSON_ALREADY_LINKED'], { name: mockPeople[0].display_name })
      )
    ).toBeTruthy();
  });

  it('shows INVITE_INVALID when accept fails with 410', async () => {
    vi.mocked(familyGraph.acceptPersonInvite).mockRejectedValue(
      new ApiClientError('INVITE_INVALID', 'gone', 410)
    );
    renderInvite();
    fireEvent.click(await screen.findByRole('button', { name: copy['invite.landing.accept'] }));
    expect(await screen.findByText(copy['error.INVITE_INVALID'])).toBeTruthy();
  });

  it('maps unknown self-link codes to generic copy', async () => {
    vi.mocked(familyGraph.acceptPersonInvite).mockRejectedValue(
      new ApiClientError('PERSON_SELF_LINK', 'tbd', 409)
    );
    renderInvite();
    fireEvent.click(await screen.findByRole('button', { name: copy['invite.landing.accept'] }));
    expect(await screen.findByText(copy['error.generic'])).toBeTruthy();
  });

  it('sends a signed-out visitor to login', async () => {
    authState.session = null;
    renderInvite();
    const login = await screen.findByRole('link', { name: copy['invite.landing.login'] });
    expect(login.getAttribute('href')).toBe('/login');
    expect(login.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('accepts a valid invite', async () => {
    vi.mocked(familyGraph.acceptPersonInvite).mockResolvedValue({
      family_id: mockFamilies[0].id,
      person_id: mockPeople[0].id,
    });
    renderInvite();
    fireEvent.click(await screen.findByRole('button', { name: copy['invite.landing.accept'] }));
    await waitFor(() => expect(familyGraph.acceptPersonInvite).toHaveBeenCalledWith(inviteId));
    expect(toast.success).toHaveBeenCalledWith(
      interpolate(copy['invite.accepted.toast'], { family_name: mockFamilies[0].name })
    );
    expect(await screen.findByText('person-page')).toBeTruthy();
  });
});
