import { useState } from 'react';
import { EnvelopeSimpleIcon } from '@phosphor-icons/react/EnvelopeSimple';
import { SignOutIcon } from '@phosphor-icons/react/SignOut';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogoutDialog } from '@/components/LogoutDialog';
import { QueryLoading } from '@/components/QueryLoading';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Icon } from '@/components/ui/icon';
import { Label } from '@/components/ui/label';
import { copy, interpolate, truncateName } from '@/copy';
import { useMe } from '@/hooks/use-me';
import { api } from '@/lib/api-client';
import { messageForError } from '@/lib/api-errors';
import { queryKeys } from '@/lib/query-client';

export function SettingsPage() {
  const me = useMe();
  const queryClient = useQueryClient();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (marketing_consent: boolean) => api.updateConsent({ marketing_consent }),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
    onError: (cause) => setError(messageForError(cause)),
  });

  if (me.isPending) return <QueryLoading />;
  if (me.isError) {
    return <p className="text-body text-destructive">{messageForError(me.error)}</p>;
  }
  if (!me.data) return null;

  const consentOn = me.data.marketing_consent;
  const email = me.data.email ?? '';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-h3 font-semibold">{copy['settings.account.title']}</h2>
        {me.data.display_name ? (
          <p className="truncate text-body text-muted-foreground">{truncateName(me.data.display_name)}</p>
        ) : null}
        {email ? (
          <p className="flex items-center gap-2 truncate text-body text-muted-foreground">
            <Icon as={EnvelopeSimpleIcon} size={20} />
            <span className="truncate">{email}</span>
          </p>
        ) : null}
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex min-h-11 items-start gap-3">
            <Checkbox
              id="settings-consent"
              checked={consentOn}
              disabled={mutation.isPending}
              onCheckedChange={(value) => mutation.mutate(value === true)}
            />
            <div className="flex flex-col gap-1">
              <Label htmlFor="settings-consent" className="text-body font-normal leading-relaxed">
                {copy['settings.consent.toggle']}
              </Label>
              <p className="text-caption text-muted-foreground">
                {interpolate(consentOn ? copy['settings.consent.on'] : copy['settings.consent.off'], {
                  อีเมล: email,
                })}
              </p>
            </div>
          </div>
          {error ? <p className="mt-3 text-caption text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <Button type="button" variant="ghost" className="self-start" onClick={() => setConfirmLogout(true)}>
        <Icon as={SignOutIcon} size={20} />
        {copy['logout.action']}
      </Button>

      {confirmLogout ? <LogoutDialog onClose={() => setConfirmLogout(false)} /> : null}
    </div>
  );
}
