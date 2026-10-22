import { useEffect, useState } from 'react';
import { ImageBrokenIcon } from '@phosphor-icons/react/ImageBroken';
import { XIcon } from '@phosphor-icons/react/X';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { copy, interpolate } from '@/copy';
import { cn } from '@/lib/utils';

export type ContributionPhoto = {
  id: string;
  url?: string | null;
  thumb_url?: string | null;
};

const PREVIEW_MAX = 6;

function srcOf(photo: ContributionPhoto): string | null {
  return photo.thumb_url || photo.url || null;
}

export function visibleContributionPhotos(media: ContributionPhoto[] | undefined | null): ContributionPhoto[] {
  return (media ?? []).filter((photo) => Boolean(srcOf(photo) || photo.id));
}

export function ContributionPhotos({
  media,
  ownerName,
}: {
  media?: ContributionPhoto[] | null;
  ownerName: string;
}) {
  const photos = visibleContributionPhotos(media);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (photos.length === 0) return null;

  const preview = photos.slice(0, PREVIEW_MAX);
  const overflow = photos.length > PREVIEW_MAX ? photos.length - PREVIEW_MAX : 0;
  const columns = photos.length === 1 ? 1 : photos.length === 2 ? 2 : 3;

  return (
    <div className="flex flex-col gap-2">
      <ul className={cn('grid gap-1', columns === 1 && 'grid-cols-1', columns === 2 && 'grid-cols-2', columns === 3 && 'grid-cols-3')}>
        {preview.map((photo, index) => {
          const isOverflowTile = overflow > 0 && index === preview.length - 1;
          return (
            <li key={photo.id}>
              <button
                type="button"
                className={cn(
                  'relative block w-full overflow-hidden rounded-md',
                  photos.length === 1 ? 'aspect-[4/3]' : 'aspect-square'
                )}
                aria-label={
                  isOverflowTile
                    ? interpolate(copy['contribution.photos.more'], { n: String(overflow) })
                    : undefined
                }
                onClick={() => setViewerIndex(index)}
              >
                <SafePhoto
                  src={srcOf(photo)}
                  alt={photoAlt(ownerName, index, photos.length)}
                  className="size-full"
                />
                {isOverflowTile ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-overlay text-h3 font-semibold text-primary-foreground">
                    +{overflow}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {viewerIndex !== null ? (
        <PhotoViewer
          photos={photos}
          ownerName={ownerName}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </div>
  );
}

function photoAlt(ownerName: string, index: number, total: number): string {
  return interpolate(copy['contribution.photo.alt'], {
    ชื่อผู้เล่า: ownerName,
    i: String(index + 1),
    n: String(total),
  });
}

function PhotoViewer({
  photos,
  ownerName,
  index,
  onIndexChange,
  onClose,
}: {
  photos: ContributionPhoto[];
  ownerName: string;
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const photo = photos[index];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight' && index < photos.length - 1) onIndexChange(index + 1);
      if (event.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, onClose, onIndexChange, photos.length]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col bg-overlay"
      onTouchStart={(event) => setTouchStart(event.changedTouches[0]?.clientX ?? null)}
      onTouchEnd={(event) => {
        if (touchStart === null) return;
        const delta = (event.changedTouches[0]?.clientX ?? touchStart) - touchStart;
        if (delta < -40 && index < photos.length - 1) onIndexChange(index + 1);
        if (delta > 40 && index > 0) onIndexChange(index - 1);
        setTouchStart(null);
      }}
    >
      <div className="flex items-center justify-between gap-3 p-3">
        <p className="text-caption text-primary-foreground">
          {interpolate(copy['contribution.photos.viewer.counter'], {
            i: String(index + 1),
            n: String(photos.length),
          })}
        </p>
        <Button type="button" variant="ghost" size="icon" aria-label={copy['a11y.close']} onClick={onClose}>
          <Icon as={XIcon} className="text-primary-foreground" />
        </Button>
      </div>
      <div className="flex flex-1 items-center justify-center p-3">
        {photo ? (
          <SafePhoto
            src={srcOf(photo)}
            alt={photoAlt(ownerName, index, photos.length)}
            className="max-h-full max-w-full"
          />
        ) : null}
      </div>
    </div>
  );
}

function SafePhoto({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>(src ? 'loading' : 'failed');

  useEffect(() => {
    setStatus(src ? 'loading' : 'failed');
  }, [src]);

  if (!src || status === 'failed') {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-1 bg-muted p-2 text-muted-foreground', className)}>
        <Icon as={ImageBrokenIcon} size={32} label={copy['photo.load_error']} />
        <p className="text-caption text-center">{copy['photo.load_error']}</p>
      </div>
    );
  }

  return (
    <span className={cn('relative block', className)}>
      {status === 'loading' ? <Skeleton className="absolute inset-0 size-full" /> : null}
      <img
        src={src}
        alt={alt}
        className={cn('size-full object-cover', status === 'loading' && 'opacity-0')}
        onLoad={() => setStatus('ready')}
        onError={() => setStatus('failed')}
      />
    </span>
  );
}
