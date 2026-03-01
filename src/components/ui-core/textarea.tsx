import * as React from 'react';
import { cn } from '@/lib/utils';

interface TextareaFactoryConfig {
  baseClass: string;
}

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const createTextareaComponent = ({ baseClass }: TextareaFactoryConfig) => {
  const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
    <textarea
      className={cn(baseClass, className)}
      ref={ref}
      {...props}
    />
  ));

  Textarea.displayName = 'Textarea';

  return Textarea;
};
