import { useState } from 'react';
import { Illustration } from '@/components/Illustration';
import { Button } from '@/components/ui/button';
import { copy } from '@/copy';
import { useAuth } from '@/hooks/use-auth';
import { messageForError } from '@/lib/api-errors';

export function LoginPage() {
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
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
      <h1 className="text-h1 font-medium">Still With You</h1>
      <Button type="button" size="lg" disabled={pending} onClick={() => void handleLogin()}>
        {copy['auth.login.google']}
      </Button>
      {error ? <p className="text-caption text-destructive">{error}</p> : null}
    </main>
  );
}
