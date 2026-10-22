import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '@/App';

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
    expect(screen.getByRole('heading', { name: 'Still With You' })).toBeTruthy();
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('sends an unknown path to /login when signed out', () => {
    renderAt('/does-not-exist');
    expect(screen.getByRole('heading', { name: 'Still With You' })).toBeTruthy();
  });
});
