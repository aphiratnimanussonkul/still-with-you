import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy';
import { peekAuthNext } from '@/lib/auth-redirect';

const signInWithGoogle = vi.fn();

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    session: null,
    loading: false,
    signInWithGoogle,
    signOut: vi.fn(),
  }),
}));

vi.mock('@/components/Illustration', () => ({
  Illustration: () => <div data-testid="illustration" />,
}));

import { LoginPage } from '@/pages/LoginPage';

function renderLogin(entry: string | { pathname: string; state?: object }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <LoginPage />
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    signInWithGoogle.mockReset();
    signInWithGoogle.mockResolvedValue(undefined);
  });

  it('renders the default login chrome', () => {
    renderLogin('/login');
    expect(screen.getByRole('heading', { name: copy['login.title'] })).toBeTruthy();
    expect(screen.getByText(copy['login.tagline'])).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['login.google'] })).toBeTruthy();
    expect(screen.getByText(copy['login.privacy_note'])).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a spinner and loading copy while Google sign-in is pending', async () => {
    let resolveSignIn: () => void = () => undefined;
    signInWithGoogle.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSignIn = resolve;
      })
    );
    renderLogin('/login');
    fireEvent.click(screen.getByRole('button', { name: copy['login.google'] }));
    const busy = await screen.findByRole('button', { name: copy['login.loading'] });
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(busy).toHaveProperty('disabled', true);
    resolveSignIn();
    await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledTimes(1));
  });

  it('shows cancelled copy in a destructive alert', () => {
    renderLogin({ pathname: '/login', state: { loginError: 'cancelled' } });
    expect(screen.getByRole('alert').textContent).toBe(copy['login.error.cancelled']);
  });

  it('shows failed copy in a destructive alert', () => {
    renderLogin({ pathname: '/login', state: { loginError: 'failed' } });
    expect(screen.getByRole('alert').textContent).toBe(copy['login.error.failed']);
  });

  it('shows session-expired copy in an info alert', () => {
    renderLogin({ pathname: '/login', state: { sessionExpired: true } });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(copy['session.expired']);
    expect(alert.className).toContain('bg-info');
  });

  it('remembers a safe invite next path from the query string', () => {
    renderLogin('/login?next=%2Finvites%2Ftok');
    expect(peekAuthNext()).toBe('/invites/tok');
  });
});
