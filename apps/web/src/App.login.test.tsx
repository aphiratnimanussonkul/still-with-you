import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { copy } from '@/copy';

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    session: null,
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-online', () => ({
  useOnline: () => true,
}));

vi.mock('@/components/Illustration', () => ({
  Illustration: () => <div data-testid="illustration" />,
}));

vi.mock('@/pages/PersonInvitePage', () => ({
  PersonInvitePage: () => <h1>invite-landing</h1>,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

describe('login route', () => {
  it('renders the login screen at /login', () => {
    renderAt('/login');
    expect(screen.getByRole('heading', { name: copy['login.title'] })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['login.google'] })).toBeTruthy();
  });

  it('sends an unknown path to /login when signed out', () => {
    renderAt('/does-not-exist');
    expect(screen.getByRole('heading', { name: 'Still With You' })).toBeTruthy();
  });

  it('keeps person invite landing reachable while signed out', () => {
    renderAt('/invites/dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    expect(screen.getByRole('heading', { name: 'invite-landing' })).toBeTruthy();
  });
});
