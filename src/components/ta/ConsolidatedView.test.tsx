import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConsolidatedView from '@/components/ta/ConsolidatedView';
import type { PublicAttendanceBoardData } from '@/lib/public-attendance-sync';

const { fetchPublicAttendanceBoardMock, fetchPenaltyEntriesForErpsMock, syncPublicAttendanceSnapshotMock } = vi.hoisted(() => ({
  fetchPublicAttendanceBoardMock: vi.fn(),
  fetchPenaltyEntriesForErpsMock: vi.fn(),
  syncPublicAttendanceSnapshotMock: vi.fn(),
}));

const { fetchTaTestStudentSettingsMock, applyTaTestStudentToBoardMock } = vi.hoisted(() => ({
  fetchTaTestStudentSettingsMock: vi.fn(),
  applyTaTestStudentToBoardMock: vi.fn(),
}));

vi.mock('@/lib/public-attendance-sync', async () => {
  const actual = await vi.importActual<typeof import('@/lib/public-attendance-sync')>('@/lib/public-attendance-sync');
  return {
    ...actual,
    fetchPublicAttendanceBoard: fetchPublicAttendanceBoardMock,
    fetchPenaltyEntriesForErps: fetchPenaltyEntriesForErpsMock,
    syncPublicAttendanceSnapshot: syncPublicAttendanceSnapshotMock,
  };
});

vi.mock('@/lib/test-student-settings', async () => {
  const actual = await vi.importActual<typeof import('@/lib/test-student-settings')>('@/lib/test-student-settings');
  return {
    ...actual,
    fetchTaTestStudentSettings: fetchTaTestStudentSettingsMock,
    applyTaTestStudentToBoard: applyTaTestStudentToBoardMock,
  };
});

vi.mock('@/lib/data-sync-events', () => ({
  subscribeAttendanceDataUpdated: vi.fn(() => () => {}),
  subscribeRosterDataUpdated: vi.fn(() => () => {}),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

const buildBoard = (): PublicAttendanceBoardData => ({
  sessions: [
    { id: 'session-1', session_number: 1, session_date: '2026-02-01', day_of_week: 'Friday' },
    { id: 'session-2', session_number: 2, session_date: '2026-02-08', day_of_week: 'Saturday' },
  ],
  students: [
    {
      class_no: '100001',
      student_name: 'Zero Penalty Student',
      erp: 'ERP001',
      total_penalties: 0,
      total_absences: 1,
      session_status: { 'session-1': 'present', 'session-2': 'absent' },
      penalty_entries: [],
    },
    {
      class_no: '100002',
      student_name: 'Penalized Student',
      erp: 'ERP002',
      total_penalties: 2,
      total_absences: 0,
      session_status: { 'session-1': 'present', 'session-2': 'present' },
      penalty_entries: [
        { session_id: 'session-1', session_number: 1, session_date: '2026-02-01', day_of_week: 'Friday', details: null },
        { session_id: 'session-2', session_number: 2, session_date: '2026-02-08', day_of_week: 'Saturday', details: null },
      ],
    },
    {
      class_no: '100003',
      student_name: 'Missing Details Student',
      erp: 'ERP003',
      total_penalties: 1,
      total_absences: 0,
      session_status: { 'session-1': 'present', 'session-2': 'present' },
      penalty_entries: [],
    },
  ],
});

describe('ConsolidatedView', () => {
  beforeEach(() => {
    const board = buildBoard();
    fetchPublicAttendanceBoardMock.mockResolvedValue(board);
    fetchPenaltyEntriesForErpsMock.mockResolvedValue({});
    syncPublicAttendanceSnapshotMock.mockResolvedValue({ ok: true });
    fetchTaTestStudentSettingsMock.mockResolvedValue({ showInTa: true, overrides: {} });
    applyTaTestStudentToBoardMock.mockReturnValue(board);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps zero penalties grey and renders non-zero penalties red', async () => {
    render(<ConsolidatedView isActive />);

    const zeroStudentRow = (await screen.findByText('Zero Penalty Student')).closest('tr');
    expect(zeroStudentRow).not.toBeNull();
    const zeroPenaltyCell = within(zeroStudentRow as HTMLTableRowElement).getByText('0').closest('td');
    expect(zeroPenaltyCell).not.toHaveClass('status-absent-table-text');

    const penalizedRow = screen.getByText('Penalized Student').closest('tr');
    expect(penalizedRow).not.toBeNull();
    const penaltyTrigger = within(penalizedRow as HTMLTableRowElement).getByText('2');
    const penaltyCell = penaltyTrigger.closest('td');
    expect(penaltyCell).toHaveClass('status-absent-table-text');
  });

  it('shows session labels in tooltip for non-zero penalties', async () => {
    render(<ConsolidatedView isActive />);

    const penalizedRow = (await screen.findByText('Penalized Student')).closest('tr');
    expect(penalizedRow).not.toBeNull();
    const penaltyTrigger = within(penalizedRow as HTMLTableRowElement).getByText('2');

    expect(penaltyTrigger).toHaveAttribute('title', 'Penalty sessions: S1, S2');
  });

  it('shows fallback when penalties exist without session details', async () => {
    render(<ConsolidatedView isActive />);

    const missingDetailsRow = (await screen.findByText('Missing Details Student')).closest('tr');
    expect(missingDetailsRow).not.toBeNull();
    const penaltyTrigger = within(missingDetailsRow as HTMLTableRowElement).getByText('1');

    expect(penaltyTrigger).toHaveAttribute('title', 'Session info unavailable');
  });
});
