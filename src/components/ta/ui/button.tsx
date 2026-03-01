import type { ComponentProps } from 'react';
import { createButtonPrimitives } from '@/components/ui-core/button';

const { Button, buttonVariants } = createButtonPrimitives({
  baseClass:
    'ta-ui-button neo-btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[transform,box-shadow,color,background-color] duration-300 ease-out focus-visible:outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  variantClasses: {
    default: 'ta-ui-button--default neo-out',
    destructive: 'ta-ui-button--destructive neo-out',
    outline: 'ta-ui-button--outline neo-out',
    secondary: 'ta-ui-button--secondary neo-out',
    ghost: 'ta-ui-button--ghost',
    link: 'ta-ui-button--link underline-offset-4 hover:underline',
  },
  sizeClasses: {
    default: 'h-10 px-4 py-2',
    sm: 'h-9 rounded-md px-3',
    lg: 'h-11 rounded-md px-8',
    icon: 'h-10 w-10',
  },
  defaultVariant: 'default',
  defaultSize: 'default',
  includeDataAttrs: true,
});

type ButtonProps = ComponentProps<typeof Button>;

export type { ButtonProps };
export { Button, buttonVariants };
