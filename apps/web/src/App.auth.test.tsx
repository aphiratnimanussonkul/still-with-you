import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { copy } from '@/copy';
import { AUTH_CALLBACK_PATH } from '@/lib/auth-callback';

const authState = {
  session: null as { access_token: string } | null,
  loading: false,
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
};

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/use-online', () => ({
  useOnline: () => true,
}));

vi.mock('@/hooks/use-me', () => ({
  useMe: () => ({
    isPending: false,
    isError: false,
    data: { marketing_consent_at: '2026-01-01T00:00:00.000Z' },
  }),
  isFirstUse: () => false,
}));

vi.mock('@/components/Illustration', () => ({
  Illustration: () => <div data-testid="illustration" />,
}));

vi.mock('@/pages/FamiliesPage', () => ({
  FamiliesPage: () => <h1>ครอบครัว</h1>,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

describe('auth gate and OAuth callback', () => {
  beforeEach(() => {
    authState.session = null;
    authState.loading = false;
  });

  it('keeps the callback URL and shows loading while getSession runs', () => {
    authState.loading = true;
    renderAt(`/?code=pkce-code`);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Still With You' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'ครอบครัว' })).toBeNull();
  });

  it('keeps /login?code= on a loading gate instead of the sign-in button', () => {
    authState.loading = true;
    renderAt(`/login?code=pkce-code`);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('sends a finished PKCE callback to families once a session exists', () => {
    authState.session = { access_token: 'tok' };
    renderAt(`${AUTH_CALLBACK_PATH}?code=pkce-code`);
    expect(screen.getByRole('heading', { name: 'ครอบครัว' })).toBeTruthy();
  });

  it('sends a finished implicit callback hash to families once a session exists', () => {
    authState.session = { access_token: 'tok' };
    renderAt(`${AUTH_CALLBACK_PATH}#access_token=ya29&token_type=bearer`);
    expect(screen.getByRole('heading', { name: 'ครอบครัว' })).toBeTruthy();
  });

  it('returns to login when the callback finishes with no session', () => {
    renderAt(AUTH_CALLBACK_PATH);
    expect(screen.getByRole('heading', { name: 'Still With You' })).toBeTruthy();
  });

  it('treats a finished callback on / with no session as signed out', () => {
    renderAt('/?code=already-exchanged-or-failed');
    expect(screen.getByRole('heading', { name: 'Still With You' })).toBeTruthy();
  });

  it('does not send a signed-out user to login while auth is still loading', () => {
    authState.loading = true;
    renderAt('/families');
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Still With You' })).toBeNull();
  });

  it('shows cancelled copy when the callback returns access_denied', () => {
    renderAt(`${AUTH_CALLBACK_PATH}?error=access_denied`);
    expect(screen.getByText(copy['login.error.cancelled'])).toBeTruthy();
  });

  it('shows failed copy when the callback returns a provider error', () => {
    renderAt(`${AUTH_CALLBACK_PATH}?error=server_error`);
    expect(screen.getByText(copy['login.error.failed'])).toBeTruthy();
  });

  it('shows the 404 page for an unknown path when signed in', () => {
    authState.session = { access_token: 'tok' };
    renderAt('/no-such-page');
    expect(screen.getByRole('heading', { name: copy['page.not_found.title'] })).toBeTruthy();
    expect(screen.getByText(copy['page.not_found.body'])).toBeTruthy();
  });

  it('renders the trash empty state at /trash when signed in', () => {
    authState.session = { access_token: 'tok' };
    renderAt('/trash');
    expect(screen.getByRole('heading', { name: copy['trash.title'] })).toBeTruthy();
    expect(screen.getByText(copy['trash.empty.title'])).toBeTruthy();
    expect(screen.getAllByRole('link', { name: copy['nav.trash'] }).length).toBeGreaterThan(0);
  });
});
