import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Groups from './Groups';

const {
  useAuthMock,
  useStudentGroupsStateMock,
  studentCreateGroupMock,
  studentJoinGroupMock,
  studentAddGroupMemberMock,
  studentRemoveGroupMemberMock,
  studentLeaveGroupMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useStudentGroupsStateMock: vi.fn(),
  studentCreateGroupMock: vi.fn(),
  studentJoinGroupMock: vi.fn(),
  studentAddGroupMemberMock: vi.fn(),
  studentRemoveGroupMemberMock: vi.fn(),
  studentLeaveGroupMock: vi.fn(),
}));

const { subscribeToRealtimeTablesMock, removeRealtimeChannelMock } = vi.hoisted(() => ({
  subscribeToRealtimeTablesMock: vi.fn(),
  removeRealtimeChannelMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: useAuthMock,
}));

vi.mock('@/features/groups', () => ({
  orderGroupMembers: (group: { created_by_erp?: string | null; members: Array<{ erp: string }> }) => [...group.members].sort((a, b) => Number(a.erp !== group.created_by_erp) - Number(b.erp !== group.created_by_erp)),
  isGroupPoc: (group: { created_by_erp?: string | null }, erp: string) => Boolean(group.created_by_erp && group.created_by_erp === erp),
  useStudentGroupsState: useStudentGroupsStateMock,
  studentCreateGroup: studentCreateGroupMock,
  studentJoinGroup: studentJoinGroupMock,
  studentAddGroupMember: studentAddGroupMemberMock,
  studentRemoveGroupMember: studentRemoveGroupMemberMock,
  studentLeaveGroup: studentLeaveGroupMock,
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

describe('Groups', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({
      user: { email: 'test.00000@khi.iba.edu.pk' },
    });
    useStudentGroupsStateMock.mockReturnValue({
      data: {
        student_email: 'test.00000@khi.iba.edu.pk',
        student_erp: '00000',
        current_group_id: 'group-1',
        groups: [
          {
            id: 'group-1',
            group_number: 1,
            created_by_erp: '00000',
            created_by_email: 'test.00000@khi.iba.edu.pk',
            created_by_role: 'student',
            student_edit_locked_at: '2026-03-25T12:00:00.000Z',
            created_at: '2026-03-22T12:00:00.000Z',
            updated_at: '2026-03-22T12:00:00.000Z',
            is_locked: false,
            member_count: 2,
            members: [
              { erp: '12345', student_name: 'Ahsan', class_no: 'A' },
              { erp: '00000', student_name: 'Test Student', class_no: 'A' },
            ],
          },
        ],
        roster: [
          { erp: '00000', student_name: 'Test Student', class_no: 'A', group_number: 1 },
          { erp: '12345', student_name: 'Ahsan', class_no: 'A', group_number: 1 },
          { erp: '54321', student_name: 'Sara', class_no: 'B', group_number: null },
        ],
        my_join_request: null,
        incoming_join_requests: [
          {
            id: 'request-1',
            group_id: 'group-1',
            group_number: 1,
            student_erp: '54321',
            student_name: 'Sara',
            class_no: 'B',
            status: 'pending',
            created_at: '2026-03-22T12:00:00.000Z',
            responded_at: null,
            responded_by_email: null,
          },
        ],
      },
      setData: vi.fn(),
      isLoading: false,
      refetch: vi.fn(),
    });
    subscribeToRealtimeTablesMock.mockReturnValue({ id: 'channel-1' });
    removeRealtimeChannelMock.mockResolvedValue(undefined);
  });

  it('renders creator controls for an unlocked current group', async () => {
    render(<Groups />);

    expect((await screen.findAllByText('Group 1')).length).toBeGreaterThan(0);
    expect(screen.getByText('Join Requests')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /leave group/i })).toBeInTheDocument();
    expect(screen.getByText('Sara')).toBeInTheDocument();
    const firstMemberRow = within(screen.getAllByRole('table')[0]).getAllByRole('row')[1];
    expect(within(firstMemberRow).getByText('00000')).toBeInTheDocument();
    expect(within(firstMemberRow).getByText('POC')).toBeInTheDocument();
  });
});
