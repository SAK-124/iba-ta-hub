import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TAZoomProcess from './TAZoomProcess';

const { useAuthMock, listRosterReferenceMock, listSessionsMock, createRosterStudentMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  listRosterReferenceMock: vi.fn(),
  listSessionsMock: vi.fn(),
  createRosterStudentMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ useAuth: useAuthMock }));
vi.mock('@/features/zoom', () => ({ listRosterReference: listRosterReferenceMock }));
vi.mock('@/features/sessions', () => ({ listSessions: listSessionsMock }));
vi.mock('@/features/roster', () => ({ createRosterStudent: createRosterStudentMock }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));

const baseReport = (issue: Record<string, unknown>) => ({
  schema_version: 1 as const,
  generated_at: '2026-09-03T00:00:00.000Z',
  session_id: 'session-1',
  session_number: 1,
  session_date: '2026-09-03',
  total_class_minutes: 75,
  effective_class_minutes: 60,
  effective_threshold_minutes: 48,
  attendance_rows: [],
  issues_rows: [issue],
  absent_rows: [],
  penalties_rows: [],
  matches_rows: [],
  raw_rows: [],
});

describe('TAZoomProcess review affordances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    useAuthMock.mockReturnValue({ user: { email: 'ta@example.com' } });
    listRosterReferenceMock.mockResolvedValue([{ erp: '12345', student_name: 'Roster Student', class_no: '101809' }]);
    listSessionsMock.mockResolvedValue([{ id: 'session-1', session_number: 1, session_date: '2026-09-03', day_of_week: 'Thursday', start_time: '08:30', end_time: '09:45' }]);
  });

  it('keeps the cutoff benchmark beside review tabs and exposes adjacent issue actions', async () => {
    render(<TAZoomProcess reportLoadRequest={{ sessionId: 'session-1', sessionNumber: 1, sessionDate: '2026-09-03', report: baseReport({ Key: '99999|', Name: '99999_New Student', ERP: '99999', 'Attended Minutes': 20, Reason: 'ERP not found in roster' }) }} />);
    await waitFor(() => expect(screen.getByLabelText('Attendance timing benchmark')).toBeInTheDocument());
    const issuesTab = screen.getByRole('tab', { name: 'Issues' });
    fireEvent.mouseDown(issuesTab);
    fireEvent.click(issuesTab);
    await waitFor(() => expect(screen.getByPlaceholderText('Search issues by name or ERP')).toBeInTheDocument());
    expect(screen.getAllByLabelText('Ignore 99999_New Student')).toHaveLength(2);
    expect(screen.getAllByText('Add 99999 to roster')).toHaveLength(2);
    expect(screen.getAllByText('Below cutoff')).toHaveLength(2);
  });

  it('does not expose quick-add for an unreliable identity', async () => {
    render(<TAZoomProcess reportLoadRequest={{ sessionId: 'session-1', sessionNumber: 1, sessionDate: '2026-09-03', report: baseReport({ Key: 'guest|', Name: 'Guest Student', ERP: 'N/A', 'Attended Minutes': 20, Reason: 'Could not identify student' }) }} />);
    await waitFor(() => expect(screen.getByLabelText('Attendance timing benchmark')).toBeInTheDocument());
    const issuesTab = screen.getByRole('tab', { name: 'Issues' });
    fireEvent.mouseDown(issuesTab);
    fireEvent.click(issuesTab);
    expect(screen.queryByText(/Add .* to roster/)).not.toBeInTheDocument();
  });
});
