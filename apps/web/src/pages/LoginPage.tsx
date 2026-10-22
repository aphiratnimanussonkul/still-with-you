import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Illustration } from '@/components/Illustration';
import { Button } from '@/components/ui/button';
import { copy } from '@/copy';
import { useAuth } from '@/hooks/use-auth';
import { messageForError } from '@/lib/api-errors';

type LoginLocationState = {
  loginError?: 'cancelled' | 'failed';
  sessionExpired?: boolean;
};

function messageFromState(state: LoginLocationState | null): string | null {
  if (!state) return null;
  if (state.sessionExpired) return copy['session.expired'];
  if (state.loginError === 'cancelled') return copy['login.error.cancelled'];
  if (state.loginError === 'failed') return copy['login.error.failed'];
  return null;
}

export function LoginPage() {
  const { signInWithGoogle } = useAuth();
  const location = useLocation();
  const [error, setError] = useState<string | null>(() =>
    messageFromState((location.state as LoginLocationState | null) ?? null)
  );
  const [pending, setPending] = useState(false);

  async function handleLogin() {
    setPending(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (cause) {
      setError(messageForError(cause));
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <Illustration name="welcome" />
      <h1 className="text-h1 font-semibold">{copy['login.title']}</h1>
      <p className="text-body text-muted-foreground">{copy['login.tagline']}</p>
      <Button type="button" size="lg" disabled={pending} onClick={() => void handleLogin()}>
        {pending ? copy['login.loading'] : copy['auth.login.google']}
      </Button>
      <p className="text-caption text-muted-foreground">{copy['login.privacy_note']}</p>
      {error ? <p className="text-caption text-destructive">{error}</p> : null}
    </main>
  );
}
