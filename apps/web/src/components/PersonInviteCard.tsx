import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Illustration } from '@/components/Illustration';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { copy, interpolate } from '@/copy';
import { familyGraph } from '@/lib/family-graph';
import { messageForError } from '@/lib/api-errors';

type PersonInviteCardProps = {
  personId: string;
  name: string;
};

export function PersonInviteCard({ personId, name }: PersonInviteCardProps) {
  const [email, setEmail] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [sent, setSent] = useState(false);
  const invite = useMutation({
    mutationFn: () => familyGraph.createPersonInvite(personId, email.trim()),
    onSuccess: () => {
      setSent(true);
      setEmail('');
    },
  });

  if (dismissed) return null;

  return (
    <Card>
      <CardHeader className="items-center text-center">
        <Illustration name="invitation" className="size-32" />
        <CardTitle>{interpolate(copy['person.invite.after.title'], { ชื่อ: name })}</CardTitle>
        <CardDescription>{interpolate(copy['person.invite.after.body'], { ชื่อ: name })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {sent ? null : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="person-invite-email">{copy['invite.email_label']}</Label>
            <Input
              id="person-invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        )}
        {invite.isError ? (
          <p className="text-caption text-destructive">{messageForError(invite.error)}</p>
        ) : null}
        {sent ? null : (
          <Button
            type="button"
            className="w-full"
            disabled={invite.isPending || !email.trim()}
            onClick={() => invite.mutate()}
          >
            {copy['person.invite.after.action']}
          </Button>
        )}
        <Button type="button" variant="link" className="w-full" onClick={() => setDismissed(true)}>
          {copy['person.invite.after.later']}
        </Button>
      </CardContent>
    </Card>
  );
}
