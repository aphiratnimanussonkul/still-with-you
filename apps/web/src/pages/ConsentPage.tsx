import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { AuthScreen } from '@/components/AuthScreen';
import { BusyIcon } from '@/components/BusyIcon';
import { Illustration } from '@/components/Illustration';
import { Alert } from '@/components/ui/alert';
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

  if (me.isPending) return <AuthScreen loading />;
  if (me.isError) {
    return (
      <AuthScreen
        actions={
          <Alert>{messageForError(me.error)}</Alert>
        }
      />
    );
  }
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
    <AuthScreen
      illustration={<Illustration name="onboarding-door" float={false} className="size-[200px]" />}
      title={
        <h1 className={`text-center text-h1 font-semibold ${pageHeadingClassName}`}>
          {interpolateHeading(copy['welcome.title'], { ชื่อ: me.data.display_name || me.data.email || '' })}
        </h1>
      }
      actions={
        <>
          {error ? <Alert>{error}</Alert> : null}
          <Button
            type="submit"
            form="consent-form"
            size="lg"
            className="w-full"
            disabled={mutation.isPending}
            aria-busy={mutation.isPending}
          >
            {mutation.isPending ? <BusyIcon /> : null}
            {copy['consent.continue']}
          </Button>
        </>
      }
    >
      <p className="text-center text-body text-muted-foreground">{copy['welcome.body']}</p>
      <form id="consent-form" className="flex w-full flex-col gap-4 text-left" onSubmit={(event) => void handleSubmit(event)}>
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
      </form>
    </AuthScreen>
  );
}
