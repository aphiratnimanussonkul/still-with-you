import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { Illustration } from '@/components/Illustration';
import { QueryLoading } from '@/components/QueryLoading';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { copy, interpolate, interpolateHeading, pageHeadingClassName } from '@/copy';
import { isFirstUse, useMe } from '@/hooks/use-me';
import { api } from '@/lib/api-client';
import { messageForError } from '@/lib/api-errors';
import { queryKeys } from '@/lib/query-client';

export function ConsentPage() {
  const me = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.updateConsent({ marketing_consent: checked }),
    onSuccess: async (account) => {
      queryClient.setQueryData(queryKeys.me, account);
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      navigate('/home', { replace: true });
    },
    onError: (cause) => setError(messageForError(cause)),
  });

  if (me.isPending) return <QueryLoading />;
  if (me.isError) return <p className="p-6 text-destructive">{messageForError(me.error)}</p>;
  if (!me.data) return <Navigate to="/login" replace />;
  if (!isFirstUse(me.data)) return <Navigate to="/home" replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    setError(null);
    try {
      await mutation.mutateAsync();
    } catch {
      // onError already mapped the copy
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">
      <Illustration name="onboarding-door" />
      <h1 className={`text-h1 font-semibold ${pageHeadingClassName}`}>
        {interpolateHeading(copy['welcome.title'], { ชื่อ: me.data.display_name || me.data.email || '' })}
      </h1>
      <p className="text-body text-muted-foreground">{copy['welcome.body']}</p>
      <form className="flex flex-col gap-6" onSubmit={(event) => void handleSubmit(event)}>
        <div className="flex min-h-11 items-start gap-3">
          <Checkbox
            id="marketing-consent"
            checked={checked}
            onCheckedChange={(value) => setChecked(value === true)}
          />
          <Label htmlFor="marketing-consent" className="text-body font-normal leading-relaxed">
            {copy['consent.checkbox']}
          </Label>
        </div>
        <p className="text-caption text-muted-foreground">
          {interpolate(copy['consent.helper'], { อีเมล: me.data.email ?? '' })}
        </p>
        {error ? <p className="text-caption text-destructive">{error}</p> : null}
        <Button type="submit" disabled={mutation.isPending}>
          {copy['consent.continue']}
        </Button>
      </form>
    </main>
  );
}
