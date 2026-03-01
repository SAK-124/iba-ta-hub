import * as React from 'react';
import { cn } from '@/lib/utils';

interface InputFactoryConfig {
  baseClass: string;
  searchClass?: string;
}

export const createInputComponent = ({ baseClass, searchClass }: InputFactoryConfig) => {
  const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, type, ...props }, ref) => {
    const isSearchByPlaceholder = typeof props.placeholder === 'string' && props.placeholder.toLowerCase().includes('search');
    const marker = props['data-search-input'];
    const isSearchByMarker = marker !== undefined && marker !== false && marker !== 'false';
    const isSearchInput = isSearchByPlaceholder || isSearchByMarker;

    return (
      <input
        type={type}
        className={cn(baseClass, isSearchInput && searchClass, className)}
        ref={ref}
        {...props}
      />
    );
  });

  Input.displayName = 'Input';

  return Input;
};
