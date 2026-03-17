import { toValidDate } from '@/lib/date-format';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const getCurrentLateDayDeadline = (
  assignmentDueAt: Date | string | null | undefined,
  latestClaimDeadline: Date | string | null | undefined,
): Date | null => {
  const candidates = [toValidDate(assignmentDueAt), toValidDate(latestClaimDeadline)].filter(
    (value): value is Date => value !== null,
  );

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((latest, candidate) =>
    candidate.getTime() > latest.getTime() ? candidate : latest,
  );
};

export const getMinimumLateDaysRequired = (
  currentDeadline: Date | string | null | undefined,
  now: Date = new Date(),
): number | null => {
  const deadline = toValidDate(currentDeadline);
  if (!deadline) {
    return null;
  }

  const millisecondsLate = now.getTime() - deadline.getTime();
  if (millisecondsLate <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(millisecondsLate / DAY_IN_MS));
};

export const getAllowedLateDayClaimOptions = (
  currentDeadline: Date | string | null | undefined,
  remainingLateDays: number,
  now: Date = new Date(),
): number[] => {
  const minimumLateDaysRequired = getMinimumLateDaysRequired(currentDeadline, now);
  if (minimumLateDaysRequired === null || remainingLateDays < minimumLateDaysRequired) {
    return [];
  }

  return Array.from(
    { length: remainingLateDays - minimumLateDaysRequired + 1 },
    (_, index) => minimumLateDaysRequired + index,
  );
};
