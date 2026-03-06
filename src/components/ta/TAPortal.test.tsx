import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import TAPortal from './TAPortal';

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: useAuthMock,
}));

vi.mock('./TAZoomProcess', () => ({
  default: () => <div>Zoom Process Mock</div>,
}));

vi.mock('./AttendanceMarking', () => ({
  default: () => <div>Attendance Marking Mock</div>,
}));

vi.mock('./SessionManagement', () => ({
  default: () => <div>Session Management Mock</div>,
}));

vi.mock('./ConsolidatedView', () => ({
  default: () => <div>Consolidated View Mock</div>,
}));

vi.mock('./RuleExceptions', () => ({
  default: () => <div>Rule Exceptions Mock</div>,
}));

vi.mock('./RosterManagement', () => ({
  default: () => <div>Roster Management Mock</div>,
}));

vi.mock('./LateDaysManagement', () => ({
  default: () => <div>Late Days Management Mock</div>,
}));

vi.mock('./ExportData', () => ({
  default: () => <div>Export Data Mock</div>,
}));

vi.mock('./IssueManagement', () => ({
  default: () => <div>Issue Management Mock</div>,
}));

vi.mock('./ListsSettings', () => ({
  default: () => <div>Lists Settings Mock</div>,
}));

describe('TAPortal persistence', () => {
  beforeEach(() => {
    window.sessionStorage.clear();

    useAuthMock.mockReturnValue({
      user: { email: 'ayeshamaqsood5100@gmail.com' },
      signOut: vi.fn(),
    });
  });

  it('restores the persisted TA module', async () => {
    window.sessionStorage.setItem(
      'aamd-workspace:ta:ayeshamaqsood5100@gmail.com:active-module',
      JSON.stringify('issues'),
    );

    render(
      <MemoryRouter>
        <TAPortal />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Issue Management Mock')).toBeInTheDocument();
    expect(screen.queryByText('Zoom Processor')).not.toBeInTheDocument();
  });

  it('restores the attendance workspace tab', async () => {
    window.sessionStorage.setItem(
      'aamd-workspace:ta:ayeshamaqsood5100@gmail.com:active-module',
      JSON.stringify('attendance'),
    );
    window.sessionStorage.setItem(
      'aamd-workspace:ta:ayeshamaqsood5100@gmail.com:attendance-workspace-tab',
      JSON.stringify('attendance'),
    );

    render(
      <MemoryRouter>
        <TAPortal />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Attendance Marking Mock')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'LIVE ATTENDANCE' })).toHaveAttribute('aria-selected', 'true');
  });
});
