import { useState } from 'react';
import { ImagesIcon } from '@phosphor-icons/react/Images';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

type FadeCoverProps = {
  src: string | null;
  alt: string;
  size?: number;
  className?: string;
};

/** Cover thumb: grey tile when `src` is null; #F5F4ED blur-placeholder then fade in ~200ms. */
export function FadeCover({ src, alt, size = 128, className }: FadeCoverProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-lg',
        showImage ? 'bg-background' : 'bg-muted',
        className
      )}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        <img
          src={src!}
          alt={alt}
          width={size}
          height={size}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            'size-full object-cover transition-opacity duration-200 ease-standard motion-reduce:transition-none',
            loaded ? 'opacity-100' : 'opacity-0'
          )}
        />
      ) : (
        <span className="flex size-full items-center justify-center text-muted-foreground">
          <Icon as={ImagesIcon} size={24} />
        </span>
      )}
    </div>
  );
}
