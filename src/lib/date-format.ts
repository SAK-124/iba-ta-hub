import { format } from 'date-fns';

export const toValidDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDate = (
  value: Date | string | null | undefined,
  pattern: string,
  fallback = '-',
): string => {
  const date = toValidDate(value);
  return date ? format(date, pattern) : fallback;
};
