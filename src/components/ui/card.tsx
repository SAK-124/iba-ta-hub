import { createCardPrimitives } from '@/components/ui-core/card';

const { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } = createCardPrimitives({
  cardClass: 'rounded-lg border bg-card text-card-foreground shadow-sm',
  headerClass: 'flex flex-col space-y-1.5 p-6',
  titleClass: 'text-2xl font-semibold leading-none tracking-tight',
  descriptionClass: 'text-sm text-muted-foreground',
  contentClass: 'p-6 pt-0',
  footerClass: 'flex items-center p-6 pt-0',
});

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
