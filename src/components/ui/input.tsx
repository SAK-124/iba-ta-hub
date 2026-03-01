import { createInputComponent } from '@/components/ui-core/input';

const Input = createInputComponent({
  baseClass:
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
  searchClass: 'border-primary/70 ring-1 ring-primary/45 focus-visible:ring-primary',
});

export { Input };
