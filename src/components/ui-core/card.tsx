import * as React from 'react';
import { cn } from '@/lib/utils';

interface CardFactoryConfig {
  cardClass: string;
  headerClass: string;
  titleClass: string;
  descriptionClass: string;
  contentClass: string;
  footerClass: string;
}

export const createCardPrimitives = ({
  cardClass,
  headerClass,
  titleClass,
  descriptionClass,
  contentClass,
  footerClass,
}: CardFactoryConfig) => {
  const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn(cardClass, className)} {...props} />
  ));
  Card.displayName = 'Card';

  const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn(headerClass, className)} {...props} />
  ));
  CardHeader.displayName = 'CardHeader';

  const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn(titleClass, className)} {...props} />
  ));
  CardTitle.displayName = 'CardTitle';

  const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => (
    <p ref={ref} className={cn(descriptionClass, className)} {...props} />
  ));
  CardDescription.displayName = 'CardDescription';

  const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn(contentClass, className)} {...props} />
  ));
  CardContent.displayName = 'CardContent';

  const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn(footerClass, className)} {...props} />
  ));
  CardFooter.displayName = 'CardFooter';

  return {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter,
  };
};
