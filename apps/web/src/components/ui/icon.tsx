import { IconContext } from '@phosphor-icons/react/dist/lib/context';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { cn } from '@/lib/utils';

export type IconWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
export type IconSize = 16 | 20 | 24 | 32 | 48;

export type PhIcon = ComponentType<
  SVGProps<SVGSVGElement> & {
    size?: number | string;
    weight?: IconWeight;
    mirrored?: boolean;
  }
>;

export function IconProvider({ children }: { children: ReactNode }) {
  return (
    <IconContext.Provider value={{ weight: 'regular', size: 24, color: 'currentColor', mirrored: false }}>
      {children}
    </IconContext.Provider>
  );
}

type IconProps = {
  as: PhIcon;
  size?: IconSize;
  weight?: IconWeight;
  label?: string;
  className?: string;
};

export function Icon({ as: Glyph, size = 24, weight = 'regular', label, className }: IconProps) {
  return label ? (
    <Glyph size={size} weight={weight} className={cn(className)} role="img" aria-label={label} />
  ) : (
    <Glyph size={size} weight={weight} className={cn(className)} aria-hidden="true" focusable="false" />
  );
}
