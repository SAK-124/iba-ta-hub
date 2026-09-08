import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AttendanceView from './AttendanceView';

const { useOptionalERPMock, useStudentAttendanceQueryMock } = vi.hoisted(() => ({ useOptionalERPMock: vi.fn(), useStudentAttendanceQueryMock: vi.fn() }));
vi.mock('@/lib/erp-context', () => ({ useOptionalERP: useOptionalERPMock }));
vi.mock('@/features/attendance', () => ({ useStudentAttendanceQuery: useStudentAttendanceQueryMock }));

describe('AttendanceView transparency', () => {
  beforeEach(() => {
    useOptionalERPMock.mockReturnValue({ erp: '12345' });
  });

  it('expands Zoom evidence and safely renders an invalid legacy date', () => {
    useStudentAttendanceQueryMock.mockReturnValue({
      isLoading: false,
      data: {
        total_absences: 5,
        total_naming_penalties: 1,
        records: [{
          session_id: 'session-1', session_number: 1, session_date: 'not-a-date', day_of_week: 'Thursday', status: 'present', naming_penalty: true,
          details_available: true, session_start_time: '08:30', session_end_time: '09:45', official_minutes: 75, effective_minutes: 60,
          namaz_break_minutes: 15, attended_minutes: 50, required_minutes: 48, shortfall_minutes: 0, zoom_names: '12345_student', name_format: 'Invalid', match_method: 'ERP', explanation_code: 'present',
        }],
      },
    });
    render(<AttendanceView />);
    expect(screen.getByText('Date unavailable')).toBeInTheDocument();
    expect(screen.getByText('5')).toHaveClass('text-pink-600');
    fireEvent.click(screen.getByText(/View details/));
    expect(screen.getByText('50 min')).toBeInTheDocument();
    expect(screen.getByText('Present · Name format incorrect')).toBeInTheDocument();
    expect(screen.getByText('12345_student')).toBeInTheDocument();
  });

  it('shows the legacy fallback and amber allowance state at six absences', () => {
    useStudentAttendanceQueryMock.mockReturnValue({ isLoading: false, data: { total_absences: 6, total_naming_penalties: 0, records: [{ session_number: 2, session_date: '2026-09-04', day_of_week: 'Friday', status: 'absent', naming_penalty: false, details_available: false, explanation_code: 'manual_or_legacy' }] } });
    render(<AttendanceView />);
    expect(screen.getByText('6')).toHaveClass('text-orange-600');
    fireEvent.click(screen.getByText(/View details/));
    expect(screen.getByText('Recorded manually.')).toBeInTheDocument();
  });
});
