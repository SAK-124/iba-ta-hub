import { createCardPrimitives } from '@/components/ui-core/card';

const { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } = createCardPrimitives({
  cardClass: 'ta-ui-card neo-out rounded-[32px] border text-card-foreground',
  headerClass: 'ta-ui-card-header flex flex-col gap-2 p-4 sm:p-6',
  titleClass: 'ta-ui-card-title text-lg font-semibold leading-none tracking-tight',
  descriptionClass: 'ta-ui-card-description text-sm text-muted-foreground',
  contentClass: 'ta-ui-card-content p-4 pt-0 sm:p-6 sm:pt-0',
  footerClass: 'ta-ui-card-footer flex flex-wrap items-center gap-2 p-4 pt-0 sm:p-6 sm:pt-0',
});

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
