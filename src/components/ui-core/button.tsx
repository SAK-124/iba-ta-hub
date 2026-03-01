import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

interface ButtonFactoryConfig {
  baseClass: string;
  variantClasses: Record<string, string>;
  sizeClasses: Record<string, string>;
  defaultVariant: string;
  defaultSize: string;
  includeDataAttrs?: boolean;
}

export const createButtonPrimitives = ({
  baseClass,
  variantClasses,
  sizeClasses,
  defaultVariant,
  defaultSize,
  includeDataAttrs = false,
}: ButtonFactoryConfig) => {
  const buttonVariants = cva(baseClass, {
    variants: {
      variant: variantClasses,
      size: sizeClasses,
    },
    defaultVariants: {
      variant: defaultVariant,
      size: defaultSize,
    },
  });

  type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean;
    };

  const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
      const Comp = asChild ? Slot : 'button';
      const resolvedVariant = variant ?? defaultVariant;
      const resolvedSize = size ?? defaultSize;

      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          {...(includeDataAttrs ? { 'data-variant': resolvedVariant, 'data-size': resolvedSize } : {})}
          ref={ref}
          {...props}
        />
      );
    },
  );

  Button.displayName = 'Button';

  return {
    Button,
    buttonVariants,
  };
};
