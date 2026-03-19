import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GroupsManagement from './GroupsManagement';

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
}));

const {
  useGroupAdminStateMock,
  taSetStudentGroupMock,
  taAdjustAllGroupLateDaysMock,
  taClearGroupRosterMock,
  taCreateGroupMock,
  taEnableGroupEditingAllMock,
  taEnableGroupEditingSelectedMock,
  taSetGroupEditDeadlineAllMock,
  taSetGroupEditDeadlineSelectedMock,
} = vi.hoisted(() => ({
  useGroupAdminStateMock: vi.fn(),
  taSetStudentGroupMock: vi.fn(),
  taAdjustAllGroupLateDaysMock: vi.fn(),
  taClearGroupRosterMock: vi.fn(),
  taCreateGroupMock: vi.fn(),
  taEnableGroupEditingAllMock: vi.fn(),
  taEnableGroupEditingSelectedMock: vi.fn(),
  taSetGroupEditDeadlineAllMock: vi.fn(),
  taSetGroupEditDeadlineSelectedMock: vi.fn(),
}));

const { listLateDaysAdminDataMock } = vi.hoisted(() => ({
  listLateDaysAdminDataMock: vi.fn(),
}));

const { subscribeToRealtimeTablesMock, removeRealtimeChannelMock } = vi.hoisted(() => ({
  subscribeToRealtimeTablesMock: vi.fn(),
  removeRealtimeChannelMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: useAuthMock,
}));

vi.mock('@/features/groups', () => ({
  useGroupAdminState: useGroupAdminStateMock,
  taSetStudentGroup: taSetStudentGroupMock,
  taAdjustAllGroupLateDays: taAdjustAllGroupLateDaysMock,
  taClearGroupRoster: taClearGroupRosterMock,
  taCreateGroup: taCreateGroupMock,
  taEnableGroupEditingAll: taEnableGroupEditingAllMock,
  taEnableGroupEditingSelected: taEnableGroupEditingSelectedMock,
  taSetGroupEditDeadlineAll: taSetGroupEditDeadlineAllMock,
  taSetGroupEditDeadlineSelected: taSetGroupEditDeadlineSelectedMock,
}));

vi.mock('@/features/late-days', () => ({
  listLateDaysAdminData: listLateDaysAdminDataMock,
}));

vi.mock('@/lib/realtime-table-subscriptions', () => ({
  subscribeToRealtimeTables: subscribeToRealtimeTablesMock,
  removeRealtimeChannel: removeRealtimeChannelMock,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('GroupsManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({
      user: { email: 'ta@example.com' },
    });
    useGroupAdminStateMock.mockReturnValue({
      data: {
        viewer_email: 'ta@example.com',
        groups: [
          {
            id: 'group-1',
            group_number: 1,
            display_name: 'Alpha',
            created_by_erp: '00000',
            created_by_email: 'student@example.com',
            created_by_role: 'student',
            student_edit_locked_at: '2026-03-25T12:00:00.000Z',
            created_at: '2026-03-22T12:00:00.000Z',
            updated_at: '2026-03-22T12:00:00.000Z',
            is_locked: false,
            member_count: 2,
            members: [
              { erp: '00000', student_name: 'Test Student', class_no: 'A' },
              { erp: '12345', student_name: 'Ahsan', class_no: 'A' },
            ],
          },
        ],
        roster: [
          { erp: '00000', student_name: 'Test Student', class_no: 'A', group_number: 1 },
          { erp: '12345', student_name: 'Ahsan', class_no: 'A', group_number: 1 },
          { erp: '54321', student_name: 'Sara', class_no: 'B', group_number: null },
        ],
      },
      setData: vi.fn(),
      isLoading: false,
      refetch: vi.fn(),
    });
    listLateDaysAdminDataMock.mockResolvedValue({
      assignments: [],
      batches: [],
      claims: [
        {
          id: 'claim-1',
          assignment_id: 'assignment-1',
          student_email: '00000@example.com',
          student_erp: '00000',
          days_used: 1,
          due_at_after_claim: '2026-03-22T12:00:00.000Z',
          claimed_at: '2026-03-22T12:00:00.000Z',
          claim_role: 'self',
          claimed_by_erp: '00000',
          claimed_by_email: '00000@example.com',
          claim_batch_id: null,
          group_id: null,
        },
      ],
      adjustments: [],
    });
    taAdjustAllGroupLateDaysMock.mockResolvedValue({
      success: true,
      group_number: 1,
      member_count: 2,
      group_used_days: 1,
      group_remaining_days: 2,
      adjusted_members: 1,
    });
    taClearGroupRosterMock.mockResolvedValue({
      success: true,
      removed_members: 2,
      removed_groups: 1,
      removed_batches: 1,
      removed_sync_adjustments: 1,
    });
    taEnableGroupEditingAllMock.mockResolvedValue({ success: true, state: { viewer_email: 'ta@example.com', groups: [], roster: [] } });
    taEnableGroupEditingSelectedMock.mockResolvedValue({ success: true, state: { viewer_email: 'ta@example.com', groups: [], roster: [] } });
    taCreateGroupMock.mockResolvedValue({ success: true, state: { viewer_email: 'ta@example.com', groups: [], roster: [] } });
    taSetGroupEditDeadlineAllMock.mockResolvedValue({ success: true, updated_groups: 1, deadline: '2026-03-30T12:00:00.000Z' });
    taSetGroupEditDeadlineSelectedMock.mockResolvedValue({ success: true, updated_groups: 1, deadline: '2026-03-30T12:00:00.000Z' });
    subscribeToRealtimeTablesMock.mockReturnValue({ id: 'channel-1' });
    removeRealtimeChannelMock.mockResolvedValue(undefined);
  });

  it('renders group controls, filters, and explicit assignment inputs', async () => {
    render(<GroupsManagement />);

    expect(await screen.findByText('Groups Overview')).toBeInTheDocument();
    expect(screen.getByText('Individual Assignment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Total Groups/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create group/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enable editing for everyone/i })).toBeInTheDocument();
    expect(screen.getByText('Group 1 · Alpha')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /assign/i }).length).toBeGreaterThan(0);
  });
});
