import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LateDays from './LateDays';

const { useAuthMock, useERPMock, listStudentLateDaysDataMock, claimLateDaysMock, sendNtfyNotificationMock } =
  vi.hoisted(() => ({
    useAuthMock: vi.fn(),
    useERPMock: vi.fn(),
    listStudentLateDaysDataMock: vi.fn(),
    claimLateDaysMock: vi.fn(),
    sendNtfyNotificationMock: vi.fn(),
  }));

vi.mock('@/lib/auth', () => ({
  useAuth: useAuthMock,
}));

vi.mock('@/lib/erp-context', () => ({
  useERP: useERPMock,
}));

vi.mock('@/features/late-days', () => ({
  claimLateDays: claimLateDaysMock,
  listStudentLateDaysData: listStudentLateDaysDataMock,
}));

vi.mock('@/lib/ntfy', () => ({
  sendNtfyNotification: sendNtfyNotificationMock,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('LateDays', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({
      user: { email: 'test.00000@khi.iba.edu.pk' },
    });
    useERPMock.mockReturnValue({
      erp: '00000',
    });
    claimLateDaysMock.mockResolvedValue({ success: true });
    sendNtfyNotificationMock.mockResolvedValue(true);
  });

  it('renders fallback values instead of crashing on invalid late-day timestamps', async () => {
    listStudentLateDaysDataMock.mockResolvedValue({
      assignments: [
        {
          id: 'assignment-1',
          active: true,
          created_at: '2026-03-01T00:00:00.000Z',
          due_at: 'not-a-date',
          title: 'Assignment 1',
          updated_at: '2026-03-01T00:00:00.000Z',
        },
      ],
      claims: [
        {
          id: 'claim-1',
          assignment_id: 'assignment-1',
          claimed_at: 'still-not-a-date',
          created_at: '2026-03-02T00:00:00.000Z',
          days_used: 1,
          due_at_after_claim: 'bad-after-date',
          due_at_before_claim: 'bad-before-date',
          student_email: 'test.00000@khi.iba.edu.pk',
          student_erp: '00000',
        },
      ],
      adjustments: [],
    });

    render(<LateDays />);

    expect(await screen.findByText('Assignment Status')).toBeInTheDocument();
    expect(screen.getAllByText('Assignment 1')).toHaveLength(2);
    expect(screen.getByText('Not set by TA')).toBeInTheDocument();
    expect(screen.getByText('1 claim(s)')).toBeInTheDocument();
    expect(screen.getAllByText('-')).toHaveLength(4);
  });
});
