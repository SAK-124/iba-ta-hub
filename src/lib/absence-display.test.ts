import { describe, expect, it } from 'vitest';
import { getAbsenceCountClass, getAbsenceCountMessage } from './absence-display';

describe('absence count display', () => {
  it('keeps 0 through 5 neutral and only flags six or more', () => {
    expect(getAbsenceCountClass(0)).toBe('text-foreground');
    expect(getAbsenceCountClass(1)).toContain('pink');
    expect(getAbsenceCountClass(5)).toContain('pink');
    expect(getAbsenceCountClass(6)).toContain('orange');
    expect(getAbsenceCountMessage(5)).toBe('');
    expect(getAbsenceCountMessage(6)).toBe('Absence allowance exceeded');
  });
});
