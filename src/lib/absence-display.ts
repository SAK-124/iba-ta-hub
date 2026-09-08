/** Shared visual treatment for numerical absence totals (not session status). */
export const getAbsenceCountClass = (count: number, neutralClass = 'text-foreground'): string =>
  count >= 6
    ? 'text-orange-600 dark:text-orange-400'
    : count >= 1
      ? 'text-pink-600 dark:text-pink-400'
      : neutralClass;

export const getAbsenceCountMessage = (count: number): string =>
  count >= 6 ? 'Absence allowance exceeded' : '';
