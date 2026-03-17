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

const { subscribeToRealtimeTablesMock, removeRealtimeChannelMock } = vi.hoisted(() => ({
  subscribeToRealtimeTablesMock: vi.fn(),
  removeRealtimeChannelMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: useAuthMock,
}));

vi.mock('@/lib/erp-context', () => ({
  useERP: useERPMock,
}));

vi.mock('@/features/late-days', async () => {
  const actual = await vi.importActual<typeof import('@/features/late-days')>('@/features/late-days');
  return {
    ...actual,
    claimLateDays: claimLateDaysMock,
    listStudentLateDaysData: listStudentLateDaysDataMock,
  };
});

vi.mock('@/lib/ntfy', () => ({
  sendNtfyNotification: sendNtfyNotificationMock,
}));

vi.mock('@/lib/realtime-table-subscriptions', () => ({
  subscribeToRealtimeTables: subscribeToRealtimeTablesMock,
  removeRealtimeChannel: removeRealtimeChannelMock,
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
    vi.useRealTimers();

    useAuthMock.mockReturnValue({
      user: { email: 'test.00000@khi.iba.edu.pk' },
    });
    useERPMock.mockReturnValue({
      erp: '00000',
    });
    claimLateDaysMock.mockResolvedValue({ success: true });
    sendNtfyNotificationMock.mockResolvedValue(true);
    subscribeToRealtimeTablesMock.mockReturnValue({ id: 'channel-1' });
    removeRealtimeChannelMock.mockResolvedValue(undefined);
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

  it('allows overdue claims when the remaining balance still covers the lateness', async () => {
    const now = new Date();

    listStudentLateDaysDataMock.mockResolvedValue({
      assignments: [
        {
          id: 'assignment-1',
          active: true,
          created_at: '2026-03-01T00:00:00.000Z',
          due_at: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(),
          title: 'Catch-up Assignment',
          updated_at: '2026-03-01T00:00:00.000Z',
        },
      ],
      claims: [],
      adjustments: [],
    });

    render(<LateDays />);

    expect(await screen.findByText('Catch-up Assignment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Claim' })).toBeEnabled();
    expect(screen.getByText('Can Claim')).toBeInTheDocument();
  });

  it('closes overdue claims when the remaining balance can no longer catch up to now', async () => {
    const now = new Date();

    listStudentLateDaysDataMock.mockResolvedValue({
      assignments: [
        {
          id: 'assignment-1',
          active: true,
          created_at: '2026-03-01T00:00:00.000Z',
          due_at: new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString(),
          title: 'Expired Assignment',
          updated_at: '2026-03-01T00:00:00.000Z',
        },
      ],
      claims: [
        {
          id: 'claim-1',
          assignment_id: 'another-assignment',
          claimed_at: '2026-03-18T00:00:00.000Z',
          created_at: '2026-03-18T00:00:00.000Z',
          days_used: 1,
          due_at_after_claim: '2026-03-19T00:00:00.000Z',
          due_at_before_claim: '2026-03-18T00:00:00.000Z',
          student_email: 'test.00000@khi.iba.edu.pk',
          student_erp: '00000',
        },
      ],
      adjustments: [],
    });

    render(<LateDays />);

    expect(await screen.findByText('Expired Assignment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Claim' })).toBeDisabled();
    expect(screen.getByText('Window Closed')).toBeInTheDocument();
  });

  it('uses a TA-updated deadline when deciding whether an already-claimed assignment is still claimable', async () => {
    const now = new Date();

    listStudentLateDaysDataMock.mockResolvedValue({
      assignments: [
        {
          id: 'assignment-1',
          active: true,
          created_at: '2026-03-01T00:00:00.000Z',
          due_at: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
          title: 'TA Extended Assignment',
          updated_at: now.toISOString(),
        },
      ],
      claims: [
        {
          id: 'claim-1',
          assignment_id: 'assignment-1',
          claimed_at: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
          created_at: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
          days_used: 2,
          due_at_after_claim: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
          due_at_before_claim: new Date(now.getTime() - 96 * 60 * 60 * 1000).toISOString(),
          student_email: 'test.00000@khi.iba.edu.pk',
          student_erp: '00000',
        },
      ],
      adjustments: [],
    });

    render(<LateDays />);

    expect(await screen.findByText('Assignment Status')).toBeInTheDocument();
    expect(screen.getAllByText('TA Extended Assignment')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Claim' })).toBeEnabled();
    expect(screen.getByText('Can Claim')).toBeInTheDocument();
  });
});
