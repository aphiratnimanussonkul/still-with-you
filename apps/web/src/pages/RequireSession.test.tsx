import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AccountResponse } from '@still-with-you/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy';
import { RequireSession } from '@/pages/RequireSession';

const meState: { data: AccountResponse | undefined } = {
  data: undefined,
};

const declinedAnswered: AccountResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'atta@example.com',
  display_name: 'Atta',
  marketing_consent: false,
  marketing_consent_at: null,
  consent_answered_at: '2026-01-01T00:00:00.000Z',
  created_at: '2026-10-01T00:00:00.000Z',
};

const unanswered: AccountResponse = {
  ...declinedAnswered,
  consent_answered_at: null,
};

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    session: { access_token: 'tok' },
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-me', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-me')>();
  return {
    ...actual,
    useMe: () => ({
      isPending: false,
      isError: false,
      data: meState.data,
    }),
  };
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RequireSession />}>
          <Route path="/consent" element={<h1>consent-page</h1>} />
          <Route path="/families" element={<h1>ครอบครัว</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('RequireSession consent gate', () => {
  beforeEach(() => {
    meState.data = declinedAnswered;
  });

  it('does not redirect to /consent when consent_answered_at is set and marketing_consent is false', () => {
    renderAt('/families');
    expect(screen.getByRole('heading', { name: 'ครอบครัว' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'consent-page' })).toBeNull();
    expect(screen.queryByRole('heading', { name: copy['welcome.title'] })).toBeNull();
  });

  it('redirects unanswered accounts to /consent', () => {
    meState.data = unanswered;
    renderAt('/families');
    expect(screen.getByRole('heading', { name: 'consent-page' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'ครอบครัว' })).toBeNull();
  });
});
