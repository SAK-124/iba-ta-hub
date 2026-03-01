import { createInputComponent } from '@/components/ui-core/input';

const Input = createInputComponent({
  baseClass:
    'ta-ui-input flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  searchClass: 'ta-ui-search-input',
});

export { Input };
