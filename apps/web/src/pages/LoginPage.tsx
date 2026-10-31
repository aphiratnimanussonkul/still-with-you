import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AuthScreen } from '@/components/AuthScreen';
import { BusyIcon } from '@/components/BusyIcon';
import { GoogleLogo } from '@/components/GoogleLogo';
import { Illustration } from '@/components/Illustration';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { copy } from '@/copy';
import { useAuth } from '@/hooks/use-auth';
import { messageForError } from '@/lib/api-errors';
import { authNextFromSearch, rememberAuthNext } from '@/lib/auth-redirect';

type LoginLocationState = {
  loginError?: 'cancelled' | 'failed';
  sessionExpired?: boolean;
  next?: string;
};

function messageFromState(state: LoginLocationState | null): {
  text: string;
  variant: 'destructive' | 'info';
} | null {
  if (!state) return null;
  if (state.sessionExpired) return { text: copy['session.expired'], variant: 'info' };
  if (state.loginError === 'cancelled') {
    return { text: copy['login.error.cancelled'], variant: 'destructive' };
  }
  if (state.loginError === 'failed') {
    return { text: copy['login.error.failed'], variant: 'destructive' };
  }
  return null;
}

export function LoginPage() {
  const { signInWithGoogle } = useAuth();
  const location = useLocation();
  const state = (location.state as LoginLocationState | null) ?? null;
  const fromState = messageFromState(state);
  const [error, setError] = useState<string | null>(() => fromState?.text ?? null);
  const [errorVariant, setErrorVariant] = useState<'destructive' | 'info'>(
    () => fromState?.variant ?? 'destructive'
  );
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const fromQuery = authNextFromSearch(location.search);
    if (fromQuery) rememberAuthNext(fromQuery);
    else if (state?.next) rememberAuthNext(state.next);
  }, [location.search, state?.next]);

  async function handleLogin() {
    setPending(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (cause) {
      setError(messageForError(cause));
      setErrorVariant('destructive');
      setPending(false);
    }
  }

  return (
    <AuthScreen
      illustration={
        <Illustration
          name="login-family-tree"
          float={false}
          className="h-[345px] w-[280px] max-w-full"
        />
      }
      title={<h1 className="text-center text-display font-bold text-primary">{copy['login.title']}</h1>}
      actions={
        <>
          {error ? <Alert variant={errorVariant}>{error}</Alert> : null}
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={pending}
            aria-busy={pending}
            onClick={() => void handleLogin()}
          >
            {pending ? <BusyIcon /> : <GoogleLogo size={16} />}
            {pending ? copy['login.loading'] : copy['login.google']}
          </Button>
          <p className="text-center text-caption text-muted-foreground">{copy['login.privacy_note']}</p>
        </>
      }
    >
      <p className="text-center text-body text-muted-foreground">{copy['login.tagline']}</p>
    </AuthScreen>
  );
}
