import { ContributionPhotos } from '@/components/ContributionPhotos';
import { nameInitial } from '@/lib/initials';
import { cn } from '@/lib/utils';
import type { ContributionPhoto } from '@/components/ContributionPhotos';

export function StoryCard({
  name,
  date,
  body,
  media,
}: {
  name: string;
  date: string;
  body: string | null;
  media?: ContributionPhoto[] | null;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-card bg-secondary text-body-lg font-semibold text-secondary-foreground">
          {nameInitial(name)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-body font-medium">{name}</p>
          <p className="truncate text-caption text-muted-foreground">{date}</p>
        </div>
      </div>
      {body ? <p className={cn('text-body', 'whitespace-pre-wrap break-words')}>{body}</p> : null}
      <ContributionPhotos media={media} ownerName={name} variant="story" />
    </article>
  );
}
