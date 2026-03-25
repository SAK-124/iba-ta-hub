import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LateDaysManagement from './LateDaysManagement';

const {
  useAuthMock,
  listLateDaysAdminDataMock,
  createLateDayAssignmentMock,
  updateLateDayAssignmentMock,
  archiveLateDayAssignmentMock,
  deleteLateDayClaimMock,
  taAddLateDayMock,
  taClaimLateDayMock,
  listRosterMock,
  subscribeToRealtimeTablesMock,
  removeRealtimeChannelMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  listLateDaysAdminDataMock: vi.fn(),
  createLateDayAssignmentMock: vi.fn(),
  updateLateDayAssignmentMock: vi.fn(),
  archiveLateDayAssignmentMock: vi.fn(),
  deleteLateDayClaimMock: vi.fn(),
  taAddLateDayMock: vi.fn(),
  taClaimLateDayMock: vi.fn(),
  listRosterMock: vi.fn(),
  subscribeToRealtimeTablesMock: vi.fn(),
  removeRealtimeChannelMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: useAuthMock,
}));

vi.mock('@/features/late-days', async () => {
  const actual = await vi.importActual<typeof import('@/features/late-days')>('@/features/late-days');
  return {
    ...actual,
    archiveLateDayAssignment: archiveLateDayAssignmentMock,
    createLateDayAssignment: createLateDayAssignmentMock,
    deleteLateDayClaim: deleteLateDayClaimMock,
    listLateDaysAdminData: listLateDaysAdminDataMock,
    taAddLateDay: taAddLateDayMock,
    taClaimLateDays: taClaimLateDayMock,
    updateLateDayAssignment: updateLateDayAssignmentMock,
  };
});

vi.mock('@/features/roster', () => ({
  listRoster: listRosterMock,
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

describe('LateDaysManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();

    useAuthMock.mockReturnValue({
      user: { email: 'ta@example.com' },
    });
    listLateDaysAdminDataMock.mockResolvedValue({
      assignments: [],
      batches: [],
      claims: [],
      adjustments: [],
    });
    listRosterMock.mockResolvedValue({
      rows: [
        {
          id: 'student-1',
          class_no: '100001',
          erp: 'ERP001',
          student_name: 'Student One',
        },
      ],
      count: 1,
    });
    subscribeToRealtimeTablesMock.mockReturnValue({ id: 'channel-1' });
    removeRealtimeChannelMock.mockResolvedValue(undefined);
  });

  it('renders after the initial load transition without crashing the TA hub', async () => {
    render(<LateDaysManagement />);

    expect(await screen.findByText('Late Day Assignments')).toBeInTheDocument();
    expect(screen.getByText('Original Individual Claims')).toBeInTheDocument();
    expect(screen.getByText('Student Roster Balances')).toBeInTheDocument();
    expect(screen.getByText('Student One')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Claim' })).toBeInTheDocument();
  });

  it('lets TAs open overdue assignments in the claim dialog even when the student flow would block them', async () => {
    listLateDaysAdminDataMock.mockResolvedValue({
      assignments: [
        {
          id: 'assignment-1',
          title: 'Assignment 1',
          due_at: '2026-03-01T10:00:00.000Z',
          active: true,
        },
      ],
      batches: [],
      claims: [],
      adjustments: [],
    });

    render(<LateDaysManagement />);

    expect(await screen.findByText('Student One')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Claim' }));

    expect(await screen.findByText('Claim Late Days For Student')).toBeInTheDocument();
    expect(screen.getByText(/Select an assignment to preview the resulting due date/i)).toBeInTheDocument();
    expect(screen.queryByText(/No assignments are currently claimable/i)).not.toBeInTheDocument();
  });
});
