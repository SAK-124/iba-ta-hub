export const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const isString = (value: unknown): value is string => typeof value === 'string';

export const toNumberOr = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const toStringOrEmpty = (value: unknown): string =>
  value == null ? '' : String(value);
