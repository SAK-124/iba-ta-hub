import { createCardPrimitives } from '@/components/ui-core/card';

const { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } = createCardPrimitives({
  cardClass: 'ta-ui-card neo-out rounded-[32px] border text-card-foreground',
  headerClass: 'ta-ui-card-header flex flex-col space-y-1.5 p-6',
  titleClass: 'ta-ui-card-title text-lg font-semibold leading-none tracking-tight',
  descriptionClass: 'ta-ui-card-description text-sm text-muted-foreground',
  contentClass: 'ta-ui-card-content p-6 pt-0',
  footerClass: 'ta-ui-card-footer flex items-center p-6 pt-0',
});

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
