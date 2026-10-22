import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { QueryLoading } from '@/components/QueryLoading';
import { Button } from '@/components/ui/button';
import { copy, interpolate, interpolateHeading } from '@/copy';
import { useAuth } from '@/hooks/use-auth';
import { ApiClientError, messageForError } from '@/lib/api-errors';
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

export function PersonInvitePage() {
  const { inviteId = '' } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const invite = useQuery({
    queryKey: ['invites', inviteId],
    queryFn: () => familyGraph.getPersonInvite(inviteId),
    enabled: Boolean(inviteId),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => familyGraph.acceptPersonInvite(inviteId),
    onSuccess: (result) => {
      toast.success(
        interpolate(copy['invite.accepted.toast'], {
          family_name: invite.data?.family_name ?? '',
        })
      );
      rememberFamilyId(result.family_id);
      navigate(`/family/people/${result.person_id}`, { replace: true });
    },
  });

  if (invite.isPending) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6">
        <QueryLoading />
      </main>
    );
  }

  if (invite.isError) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6">
        <p className="text-body text-destructive">{inviteLandingError(invite.error)}</p>
      </main>
    );
  }

  if (!invite.data) return null;
  const name = invite.data.person_display_name;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <h1 className="text-h2 font-semibold break-words">
        {interpolateHeading(copy['invite.landing.title'], {
          inviter_display_name: invite.data.inviter_display_name,
          family_name: invite.data.family_name,
        })}
      </h1>
      {name ? (
        <p className="text-body text-muted-foreground">
          {interpolate(copy['invite.landing.body'], { person_display_name: name })}
        </p>
      ) : (
        <p className="text-body text-muted-foreground">{copy['invite.family.body']}</p>
      )}
      <p className="text-caption text-muted-foreground">
        {interpolate(copy['invite.landing.expires'], { date: formatThaiDate(invite.data.expires_at) })}
      </p>
      {accept.isError ? (
        <p className="text-body text-destructive">{inviteLandingError(accept.error, { name: name ?? '' })}</p>
      ) : null}
      {session ? (
        <Button type="button" onClick={() => accept.mutate()} disabled={accept.isPending}>
          {copy['invite.landing.accept']}
        </Button>
      ) : (
        <Button asChild>
          <Link to="/login" referrerPolicy="no-referrer">
            {copy['invite.landing.login']}
          </Link>
        </Button>
      )}
    </main>
  );
}
