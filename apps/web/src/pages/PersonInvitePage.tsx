import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AuthScreen } from '@/components/AuthScreen';
import { BusyIcon } from '@/components/BusyIcon';
import { Illustration } from '@/components/Illustration';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { copy, interpolate, interpolateHeading, pageHeadingClassName, resolvedCopy } from '@/copy';
import { useAuth } from '@/hooks/use-auth';
import { ApiClientError, messageForError } from '@/lib/api-errors';
import { loginPathForInvite, rememberAuthNext } from '@/lib/auth-redirect';
import { formatThaiDate } from '@/lib/dates';
import { familyGraph } from '@/lib/family-graph';
import { rememberFamilyId } from '@/lib/last-family';

function inviteLandingError(error: unknown, vars?: Record<string, string>): string {
  if (error instanceof ApiClientError && (error.code === 'RATE_LIMITED' || error.status === 429)) {
    return copy['error.RATE_LIMITED.invite'];
  }
  if (error instanceof ApiClientError && error.code === 'INVITE_INVALID') {
    return copy['error.INVITE_INVALID'];
  }
  if (error instanceof ApiClientError && error.code === 'PERSON_ALREADY_LINKED') {
    return interpolate(copy['error.PERSON_ALREADY_LINKED'], { name: vars?.name ?? '' });
  }
  return messageForError(error, vars);
}

function backHomeTo(signedIn: boolean): string {
  return signedIn ? '/home' : '/login';
}

export function PersonInvitePage() {
  const { inviteId = '' } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [acceptedFamilyName, setAcceptedFamilyName] = useState<string | null>(null);

  const invite = useQuery({
    queryKey: ['invites', inviteId],
    queryFn: () => familyGraph.getPersonInvite(inviteId),
    enabled: Boolean(inviteId),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => familyGraph.acceptPersonInvite(inviteId),
    onSuccess: (result) => {
      rememberFamilyId(result.family_id);
      setAcceptedFamilyName(invite.data?.family_name ?? '');
    },
  });

  if (acceptedFamilyName !== null) {
    return (
      <AuthScreen
        illustration={<Illustration name="family-home" float={false} className="size-[200px]" />}
        title={
          <h1 className={`text-center text-h2 font-semibold ${pageHeadingClassName}`}>
            {interpolateHeading(copy['invite.accepted.title'], { ชื่อครอบครัว: acceptedFamilyName })}
          </h1>
        }
        actions={
          <Button type="button" size="lg" className="w-full" asChild>
            <Link to="/memories">{copy['invite.accepted.next']}</Link>
          </Button>
        }
      />
    );
  }

  if (invite.isPending) {
    return <AuthScreen loading />;
  }

  if (invite.isError) {
    const rateLimited =
      invite.error instanceof ApiClientError &&
      (invite.error.code === 'RATE_LIMITED' || invite.error.status === 429);
    const title = rateLimited
      ? copy['error.RATE_LIMITED.invite']
      : resolvedCopy('invite.invalid.title', copy['error.INVITE_INVALID']);
    return (
      <AuthScreen
        illustration={<Illustration name="error-offline" float={false} className="size-[200px]" />}
        title={<h1 className={`text-center text-h2 font-semibold ${pageHeadingClassName}`}>{title}</h1>}
        actions={
          <Button type="button" variant="outline" size="lg" className="w-full" asChild>
            <Link to={backHomeTo(Boolean(session))}>{copy['common.back_home']}</Link>
          </Button>
        }
      />
    );
  }

  if (!invite.data) return null;
  const name = invite.data.person_display_name;
  const loginTo = loginPathForInvite(inviteId);

  return (
    <AuthScreen
      illustration={<Illustration name="invitation" float={false} className="size-[200px]" />}
      title={
        <h1 className={`text-center text-h2 font-semibold ${pageHeadingClassName}`}>
          {interpolateHeading(copy['invite.landing.title'], {
            inviter_display_name: invite.data.inviter_display_name,
            family_name: invite.data.family_name,
          })}
        </h1>
      }
      actions={
        session ? (
          <>
            {accept.isError ? (
              <Alert>{inviteLandingError(accept.error, { name: name ?? '' })}</Alert>
            ) : null}
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={() => accept.mutate()}
              disabled={accept.isPending}
              aria-busy={accept.isPending}
            >
              {accept.isPending ? <BusyIcon /> : null}
              {copy['invite.landing.accept']}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              disabled={accept.isPending}
              onClick={() => navigate('/home')}
            >
              {copy['invite.landing.decline']}
            </Button>
          </>
        ) : (
          <>
            <Button type="button" size="lg" className="w-full" asChild>
              <Link
                to={loginTo}
                referrerPolicy="no-referrer"
                onClick={() => rememberAuthNext(`/invites/${inviteId}`)}
              >
                {copy['invite.landing.login']}
              </Link>
            </Button>
            <p className="text-center text-caption text-muted-foreground">{copy['login.privacy_note']}</p>
          </>
        )
      }
    >
      {name ? (
        <p className="text-center text-body text-muted-foreground">
          {interpolate(copy['invite.landing.body'], { person_display_name: name })}
        </p>
      ) : (
        <p className="text-center text-body text-muted-foreground">{copy['invite.family.body']}</p>
      )}
      <p className="text-center text-caption text-muted-foreground">
        {interpolate(copy['invite.landing.expires'], { date: formatThaiDate(invite.data.expires_at) })}
      </p>
      <Card className="w-full">
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-left">
          <div className="min-w-0">
            <p className="text-label font-medium">{invite.data.family_name}</p>
            {copy['invite.landing.members'].startsWith('TODO:') ? null : (
              <p className="text-caption text-muted-foreground">{copy['invite.landing.members']}</p>
            )}
          </div>
        </div>
      </Card>
    </AuthScreen>
  );
}
