import { render, screen } from '@testing-library/react';
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
    expect(screen.getByText('Late Day Claims')).toBeInTheDocument();
    expect(screen.getByText('Student Roster Balances')).toBeInTheDocument();
    expect(screen.getByText('Student One')).toBeInTheDocument();
  });
});
