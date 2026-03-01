import { createTextareaComponent, type TextareaProps } from '@/components/ui-core/textarea';

const Textarea = createTextareaComponent({
  baseClass:
    'ta-ui-textarea flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
});

export type { TextareaProps };
export { Textarea };
