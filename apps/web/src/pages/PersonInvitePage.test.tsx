import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copy, interpolate } from '@/copy';
import { ApiClientError } from '@/lib/api-errors';
import { mockAccount, mockFamilies, mockPeople } from '@/mocks/data';

const authState = { session: { access_token: 'tok' } as { access_token: string } | null };

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => authState,
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

import { familyGraph } from '@/lib/family-graph';
import { PersonInvitePage } from '@/pages/PersonInvitePage';

const inviteId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const invite = {
  id: inviteId,
  person_id: mockPeople[0].id,
  family_id: mockFamilies[0].id,
  family_name: mockFamilies[0].name,
  inviter_display_name: mockAccount.display_name,
  person_display_name: mockPeople[0].display_name,
  url: `http://localhost:5173/invites/${inviteId}`,
  status: 'pending' as const,
  expires_at: '2026-10-29T00:00:00.000Z',
  created_at: '2026-10-22T00:00:00.000Z',
};

function renderInvite() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/invites/${inviteId}`]}>
        <Routes>
          <Route path="/invites/:inviteId" element={<PersonInvitePage />} />
          <Route path="/family" element={<p>family-page</p>} />
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
    vi.mocked(familyGraph.getPersonInvite).mockResolvedValue(invite);
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
    expect(await screen.findByRole('link', { name: copy['login.google'] })).toHaveAttribute('href', '/login');
  });

  it('accepts a valid invite', async () => {
    vi.mocked(familyGraph.acceptPersonInvite).mockResolvedValue({ ...invite, status: 'accepted' });
    renderInvite();
    fireEvent.click(await screen.findByRole('button', { name: copy['invite.landing.accept'] }));
    await waitFor(() => expect(familyGraph.acceptPersonInvite).toHaveBeenCalledWith(inviteId));
    expect(await screen.findByText('family-page')).toBeTruthy();
  });
});
