import { useState } from 'react';
import { CircleNotchIcon } from '@phosphor-icons/react/CircleNotch';
import { useLocation } from 'react-router-dom';
import { GoogleLogo } from '@/components/GoogleLogo';
import { Illustration } from '@/components/Illustration';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center gap-6 px-6 pb-10 pt-16">
      <div className="flex w-full flex-col items-center gap-4 text-center">
        <Illustration name="login-family-tree" float={false} className="h-[345px] w-[280px] max-w-full" />
        <h1 className="text-display font-bold text-primary">{copy['login.title']}</h1>
        <p className="text-body text-muted-foreground">{copy['login.tagline']}</p>
      </div>
      <div className="min-h-0 flex-1" />
      <div className="flex w-full flex-col items-center gap-3">
        {error ? <Alert>{error}</Alert> : null}
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={pending}
          aria-busy={pending}
          onClick={() => void handleLogin()}
        >
          {pending ? (
            <Icon as={CircleNotchIcon} size={16} className="animate-spin motion-reduce:animate-none" />
          ) : (
            <GoogleLogo size={16} />
          )}
          {pending ? copy['login.loading'] : copy['login.google']}
        </Button>
        <p className="text-caption text-muted-foreground">{copy['login.privacy_note']}</p>
      </div>
    </main>
  );
}
