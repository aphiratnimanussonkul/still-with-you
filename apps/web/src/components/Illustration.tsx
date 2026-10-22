import { illustrationSrc, type IllustrationName } from '@/components/illustrations';
import { cn } from '@/lib/utils';

export type { IllustrationName };

type IllustrationProps = {
  name: IllustrationName;
  className?: string;
  float?: boolean;
};

export function Illustration({ name, className, float = true }: IllustrationProps) {
  return (
    <img
      src={illustrationSrc[name]}
      alt=""
      aria-hidden="true"
      className={cn('mx-auto block size-48 object-contain', float && 'swy-float', className)}
    />
  );
}
