import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { QueryLoading } from '@/components/QueryLoading';
import { Button } from '@/components/ui/button';
import { copy, interpolate, interpolateHeading } from '@/copy';
import { useAuth } from '@/hooks/use-auth';
import { ApiClientError, messageForError } from '@/lib/api-errors';
import { familyGraph } from '@/lib/family-graph';

export function PersonInvitePage() {
  const { inviteId = '' } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const invite = useQuery({
    queryKey: ['people-invites', inviteId],
    queryFn: () => familyGraph.getPersonInvite(inviteId),
    enabled: Boolean(inviteId),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => familyGraph.acceptPersonInvite(inviteId),
    onSuccess: (result) => {
      navigate('/family', {
        replace: true,
        state: { familyName: result.family_name },
      });
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
    const message =
      invite.error instanceof ApiClientError && invite.error.code === 'INVITE_INVALID'
        ? copy['error.INVITE_INVALID']
        : messageForError(invite.error);
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6">
        <p className="text-body text-destructive">{message}</p>
      </main>
    );
  }

  if (!invite.data) return null;
  const name = invite.data.person_display_name ?? '';

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <h1 className="text-h2 font-semibold break-words">
        {interpolateHeading(copy['invite.landing.title'], {
          ชื่อผู้ชวน: invite.data.inviter_display_name ?? '',
          ชื่อครอบครัว: invite.data.family_name ?? '',
        })}
      </h1>
      <p className="text-body text-muted-foreground">{copy['invite.landing.body']}</p>
      {accept.isError ? (
        <p className="text-body text-destructive">
          {accept.error instanceof ApiClientError && accept.error.code === 'PERSON_ALREADY_LINKED'
            ? interpolate(copy['error.PERSON_ALREADY_LINKED'], { name })
            : accept.error instanceof ApiClientError && accept.error.code === 'INVITE_INVALID'
              ? copy['error.INVITE_INVALID']
              : messageForError(accept.error, { name })}
        </p>
      ) : null}
      {session ? (
        <Button type="button" onClick={() => accept.mutate()} disabled={accept.isPending}>
          {copy['invite.landing.accept']}
        </Button>
      ) : (
        <Button asChild>
          <Link to="/login">{copy['login.google']}</Link>
        </Button>
      )}
    </main>
  );
}
