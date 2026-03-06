import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudentPortal from './StudentPortal';

const { useERPMock, useAuthMock, useAppSettingsQueryMock, useLateDaysSummaryMock } = vi.hoisted(() => ({
  useERPMock: vi.fn(),
  useAuthMock: vi.fn(),
  useAppSettingsQueryMock: vi.fn(),
  useLateDaysSummaryMock: vi.fn(),
}));

vi.mock('@/lib/erp-context', () => ({
  useERP: useERPMock,
}));

vi.mock('@/lib/auth', () => ({
  useAuth: useAuthMock,
}));

vi.mock('@/features/settings', () => ({
  useAppSettingsQuery: useAppSettingsQueryMock,
}));

vi.mock('@/features/late-days', () => ({
  useLateDaysSummary: useLateDaysSummaryMock,
}));

vi.mock('./SubmitIssue', () => ({
  default: () => <div>Submit Issue Mock</div>,
}));

vi.mock('./MyIssues', () => ({
  default: () => <div>My Issues Mock</div>,
}));

vi.mock('./AttendanceView', () => ({
  default: () => <div>Attendance View Mock</div>,
}));

vi.mock('./LateDays', () => ({
  default: () => <div>Late Days Mock</div>,
}));

describe('StudentPortal persistence', () => {
  beforeEach(() => {
    window.sessionStorage.clear();

    useERPMock.mockReturnValue({
      erp: '00000',
      isVerified: true,
      studentName: 'Test Student',
      isLoading: false,
    });
    useAuthMock.mockReturnValue({
      user: { email: 'test.00000@khi.iba.edu.pk' },
    });
    useAppSettingsQueryMock.mockReturnValue({
      data: { tickets_enabled: true },
      isLoading: false,
    });
    useLateDaysSummaryMock.mockReturnValue({
      data: { remaining: 3, totalAllowance: 3 },
      isLoading: false,
    });
  });

  it('restores the persisted active tab', async () => {
    window.sessionStorage.setItem(
      'aamd-workspace:student:test.00000@khi.iba.edu.pk:active-tab',
      JSON.stringify('late-days'),
    );

    render(<StudentPortal />);

    expect(await screen.findByText('Late Days Mock')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Late Days' })).toHaveAttribute('data-state', 'active');
  });
});
