import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { AUTH_CALLBACK_PATH } from '@/lib/auth-callback';

const getSession = vi.fn();
const onAuthStateChange = vi.fn();
const signInWithOAuth = vi.fn();
const signOut = vi.fn();
const unsubscribe = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
      onAuthStateChange: (...args: unknown[]) => onAuthStateChange(...args),
      signInWithOAuth: (...args: unknown[]) => signInWithOAuth(...args),
      signOut: (...args: unknown[]) => signOut(...args),
    },
  },
}));

function Probe() {
  const { session, loading, signInWithGoogle } = useAuth();
  return (
    <div>
      <p data-testid="loading">{loading ? 'yes' : 'no'}</p>
      <p data-testid="session">{session ? 'in' : 'out'}</p>
      <button type="button" onClick={() => void signInWithGoogle()}>
        google
      </button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    getSession.mockReset();
    onAuthStateChange.mockReset();
    signInWithOAuth.mockReset();
    signOut.mockReset();
    unsubscribe.mockReset();
    onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
  });

  it('stays loading until getSession resolves, even if INITIAL_SESSION is null', async () => {
    let resolveSession: (value: { data: { session: null } }) => void = () => undefined;
    getSession.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      })
    );
    onAuthStateChange.mockImplementation((cb: (event: string, session: null) => void) => {
      cb('INITIAL_SESSION', null);
      return { data: { subscription: { unsubscribe } } };
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    expect(screen.getByTestId('loading').textContent).toBe('yes');
    expect(screen.getByTestId('session').textContent).toBe('out');

    resolveSession({ data: { session: null } });
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('no');
    });
  });

  it('restores a session returned by getSession after the callback exchange', async () => {
    const session = { access_token: 'tok', user: { id: 'u1' } };
    getSession.mockResolvedValue({ data: { session } });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('no');
      expect(screen.getByTestId('session').textContent).toBe('in');
    });
  });

  it('sends Google OAuth to the dedicated callback path', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    signInWithOAuth.mockResolvedValue({ error: null });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('no');
    });

    fireEvent.click(screen.getByRole('button', { name: 'google' }));
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${AUTH_CALLBACK_PATH}`,
      },
    });
  });
});
