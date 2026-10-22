import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Illustration } from '@/components/Illustration';
import { QueryLoading } from '@/components/QueryLoading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { copy } from '@/copy';
import { api } from '@/lib/api-client';
import { messageForError } from '@/lib/api-errors';
import { formatThaiDate } from '@/lib/dates';
import { queryKeys } from '@/lib/query-client';

export function FamiliesPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const families = useQuery({
    queryKey: queryKeys.families,
    queryFn: () => api.listFamilies(),
  });

  const create = useMutation({
    mutationFn: () => api.createFamily({ name }),
    onSuccess: async () => {
      setName('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.families });
    },
  });

  if (families.isPending) return <QueryLoading />;
  if (families.isError) {
    return <p className="text-body text-destructive">{messageForError(families.error)}</p>;
  }

  const items = families.data?.families ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1 font-medium">{copy['families.title']}</h1>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Illustration name="family-home" />
          <p className="text-h3">{copy['families.empty.title']}</p>
          <p className="text-body text-muted-foreground">{copy['families.empty.body']}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((family) => (
            <li key={family.id}>
              <Link to={`/families/${family.id}`}>
                <Card>
                  <CardHeader>
                    <CardTitle>{family.name}</CardTitle>
                    <CardDescription>{formatThaiDate(family.created_at)}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{copy['families.create.action']}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) create.mutate();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="family-name">{copy['families.create.label']}</Label>
              <Input
                id="family-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={copy['families.create.placeholder']}
              />
            </div>
            {create.isError ? (
              <p className="text-caption text-destructive">{messageForError(create.error)}</p>
            ) : null}
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              {copy['families.create.action']}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
