import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-body font-medium transition-colors duration-[120ms] ease-standard disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-pressed',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive',
        outline: 'border border-input bg-card text-foreground hover:bg-accent active:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent active:bg-accent',
        ghost: 'hover:bg-accent hover:text-accent-foreground active:bg-accent',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 min-h-11 px-4',
        sm: 'min-h-11 h-9 px-4',
        lg: 'h-[52px] min-h-[52px] px-6',
        icon: 'size-11 min-h-11 min-w-11 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean;
    }
>(function Button({ className, variant, size, asChild = false, ...props }, ref) {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
});

export { Button, buttonVariants };
