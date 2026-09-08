import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import PublicAttendanceBoard from './PublicAttendanceBoard';
import type { PublicAttendanceBoardData } from '@/lib/public-attendance-sync';

const { fetchPublicAttendanceBoardMock } = vi.hoisted(() => ({ fetchPublicAttendanceBoardMock: vi.fn() }));
vi.mock('@/lib/public-attendance-sync', () => ({ fetchPublicAttendanceBoard: fetchPublicAttendanceBoardMock }));
vi.mock('@/lib/data-sync-events', () => ({
  subscribeAttendanceDataUpdated: vi.fn(() => () => {}),
  subscribeRosterDataUpdated: vi.fn(() => () => {}),
}));

const board: PublicAttendanceBoardData = {
  sessions: [],
  students: [{ class_no: 'A', student_name: 'Student A', erp: '12345', total_penalties: 0, total_absences: 0, session_status: {}, penalty_entries: [] }],
};

describe('PublicAttendanceBoard refresh behavior', () => {
  beforeEach(() => {
    fetchPublicAttendanceBoardMock.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('keeps existing rows mounted while the 15-second timer refresh is pending', async () => {
    fetchPublicAttendanceBoardMock.mockResolvedValueOnce(board);
    render(<PublicAttendanceBoard />);
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => expect(screen.getByText('Student A')).toBeInTheDocument());
    vi.useFakeTimers();

    let resolveRefresh!: (value: PublicAttendanceBoardData) => void;
    fetchPublicAttendanceBoardMock.mockReturnValueOnce(new Promise((resolve) => { resolveRefresh = resolve; }));
    act(() => { vi.advanceTimersByTime(15_000); });
    expect(screen.getByText('Student A')).toBeInTheDocument();
    resolveRefresh(board);
    await act(async () => { await Promise.resolve(); });
  });

  it('keeps existing rows visible when a background refresh fails', async () => {
    fetchPublicAttendanceBoardMock.mockResolvedValueOnce(board);
    render(<PublicAttendanceBoard />);
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => expect(screen.getByText('Student A')).toBeInTheDocument());
    vi.useFakeTimers();
    fetchPublicAttendanceBoardMock.mockRejectedValueOnce(new Error('offline'));
    act(() => { vi.advanceTimersByTime(15_000); });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('Student A')).toBeInTheDocument();
  });
});
