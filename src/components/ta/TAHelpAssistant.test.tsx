import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TAHelpAssistant from './TAHelpAssistant';
import { isTaPortalHelpQuestion } from '@/lib/ta-help-assistant';

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: useAuthMock,
}));

vi.mock('@/lib/ta-help-assistant', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ta-help-assistant')>('@/lib/ta-help-assistant');
  return {
    ...actual,
    isHelpAssistantConfigured: () => false,
  };
});

describe('TAHelpAssistant', () => {
  const liveAttendanceSnapshot = {
    moduleId: 'attendance',
    moduleTitle: 'Live Attendance',
    moduleStage: 'Live Attendance · selecting session',
    visibleControls: ['Select Session', 'Absent ERPs', 'Submit Attendance'],
  } as const;

  beforeEach(() => {
    window.sessionStorage.clear();

    useAuthMock.mockReturnValue({
      user: { email: 'ta@example.com' },
    });
  });

  it('renders the compact shell without shortcut sections', async () => {
    render(<TAHelpAssistant snapshot={liveAttendanceSnapshot} />);

    fireEvent.click(screen.getByRole('button', { name: /chat with aux/i }));

    expect(screen.getAllByText('Auxilium').length).toBeGreaterThan(0);
    expect(screen.queryByText('Quick Workflows')).not.toBeInTheDocument();
    expect(screen.queryByText(/How do I process a Zoom CSV and move it into attendance marking\?/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Focused on .* only\./i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Actions stop before the final saved click\./i)).not.toBeInTheDocument();
  });

  it('does not restore chat state after a remount', async () => {
    const { unmount } = render(<TAHelpAssistant snapshot={liveAttendanceSnapshot} />);

    fireEvent.click(screen.getByRole('button', { name: /chat with aux/i }));

    const textarea = await screen.findByPlaceholderText(/Start typing or ask for help/i);
    fireEvent.change(textarea, { target: { value: 'How do I mark attendance after Zoom processing?' } });

    fireEvent.submit(textarea.closest('form')!);

    expect(await screen.findByText('Live answers are disabled until VITE_OPENROUTER_API_KEY is configured. Auxilium is designed to answer from the TA operations manual once the key is available.')).toBeInTheDocument();

    unmount();

    render(<TAHelpAssistant snapshot={liveAttendanceSnapshot} />);

    fireEvent.click(screen.getByRole('button', { name: /chat with aux/i }));

    await waitFor(() => {
      expect(screen.queryByText('How do I mark attendance after Zoom processing?')).not.toBeInTheDocument();
    });
  });

  it('clears the thread and draft from the header control', async () => {
    render(<TAHelpAssistant snapshot={liveAttendanceSnapshot} />);

    fireEvent.click(screen.getByRole('button', { name: /chat with aux/i }));

    const textarea = await screen.findByPlaceholderText(/Start typing or ask for help/i);
    fireEvent.change(textarea, { target: { value: 'How do I mark attendance after Zoom processing?' } });
    fireEvent.submit(textarea.closest('form')!);

    expect(await screen.findByText('Live answers are disabled until VITE_OPENROUTER_API_KEY is configured. Auxilium is designed to answer from the TA operations manual once the key is available.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /clear chat/i }));

    expect(screen.queryByText('temporary draft')).not.toBeInTheDocument();
    expect((screen.getByPlaceholderText(/Start typing or ask for help/i) as HTMLTextAreaElement).value).toBe('');
    expect(screen.getByText(/The help assistant UI is ready, but live answers need VITE_OPENROUTER_API_KEY\./i)).toBeInTheDocument();
  });

  it('submits on enter and keeps shift-enter for newline', async () => {
    render(<TAHelpAssistant snapshot={liveAttendanceSnapshot} />);

    fireEvent.click(screen.getByRole('button', { name: /chat with aux/i }));

    const textarea = await screen.findByPlaceholderText(/Start typing or ask for help/i);

    fireEvent.change(textarea, { target: { value: 'How do I mark attendance after Zoom processing?' } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

    expect(await screen.findByText('Live answers are disabled until VITE_OPENROUTER_API_KEY is configured. Auxilium is designed to answer from the TA operations manual once the key is available.')).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: 'Line one' } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: true });

    expect((textarea as HTMLTextAreaElement).value).toBe('Line one');
  });

  it('classifies off-topic questions as outside the TA portal', async () => {
    render(<TAHelpAssistant snapshot={{ moduleId: 'consolidated', moduleTitle: 'Consolidated View', moduleStage: 'Consolidated View · table review', visibleControls: ['Search...', 'Sync Sheet'] }} />);

    fireEvent.click(screen.getByRole('button', { name: /chat with aux/i }));

    const textarea = await screen.findByPlaceholderText(/Start typing or ask for help/i);
    fireEvent.change(textarea, { target: { value: 'is 4.9 gpa good' } });
    expect(isTaPortalHelpQuestion('is 4.9 gpa good', { moduleId: 'consolidated', moduleTitle: 'Consolidated View', moduleStage: 'Consolidated View · table review', visibleControls: ['Search...', 'Sync Sheet'] })).toBe(false);
  });

  it('treats vague contextual questions as valid when module context is known', () => {
    expect(isTaPortalHelpQuestion('whats this', { moduleId: 'consolidated', moduleTitle: 'Consolidated View', moduleStage: 'Consolidated View · table review', visibleControls: ['Search...', 'Sync Sheet'] })).toBe(true);
    expect(isTaPortalHelpQuestion('what do i click now', { moduleId: 'zoom', moduleTitle: 'Zoom Processor', moduleStage: 'Zoom Processor · upload step', visibleControls: ['SELECT CSV', 'Analyze Matrix'] })).toBe(true);
  });

  it('runs safe direct actions before the model path', async () => {
    const onRunAction = vi.fn();

    render(<TAHelpAssistant snapshot={{ moduleId: 'dashboard', moduleTitle: 'TA Dashboard', moduleStage: null, visibleControls: [] }} onRunAction={onRunAction} />);

    fireEvent.click(screen.getByRole('button', { name: /chat with aux/i }));

    const textarea = await screen.findByPlaceholderText(/Start typing or ask for help/i);
    fireEvent.change(textarea, { target: { value: 'create a new session for today' } });
    fireEvent.submit(textarea.closest('form')!);

    expect(onRunAction).toHaveBeenCalledWith({
      type: 'session-command',
      command: {
        kind: 'prepare-create-session',
        selectedDate: new Date().toISOString().slice(0, 10),
        sessionNumberStrategy: 'next',
        focusField: 'start-time',
      },
    });
    expect(await screen.findByText(/Prepared the next available session number automatically/i)).toBeInTheDocument();
    expect(screen.getByText(/Session Management/)).toBeInTheDocument();
  });

  it('reuses the remembered workflow target for take-me-there follow-ups', async () => {
    const onRunAction = vi.fn();

    render(<TAHelpAssistant snapshot={{ moduleId: 'dashboard', moduleTitle: 'TA Dashboard', moduleStage: null, visibleControls: [] }} onRunAction={onRunAction} />);

    fireEvent.click(screen.getByRole('button', { name: /chat with aux/i }));

    const textarea = await screen.findByPlaceholderText(/Start typing or ask for help/i);

    fireEvent.change(textarea, { target: { value: 'i wanna do zoom attendance' } });
    fireEvent.submit(textarea.closest('form')!);

    expect(onRunAction).toHaveBeenNthCalledWith(1, {
      type: 'switch-attendance-tab',
      tab: 'zoom',
    });
    expect(await screen.findByText(/Switched to/i)).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: 'take me there' } });
    fireEvent.submit(textarea.closest('form')!);

    await waitFor(() => {
      expect(onRunAction).toHaveBeenNthCalledWith(2, {
        type: 'switch-attendance-tab',
        tab: 'zoom',
      });
    });
    expect(screen.getAllByText(/SELECT CSV/i).length).toBeGreaterThan(0);
  });

  it('hides model labels and shows the renamed portal-only shell', async () => {
    render(<TAHelpAssistant snapshot={{ moduleId: 'dashboard', moduleTitle: 'TA Dashboard', moduleStage: null, visibleControls: [] }} />);

    const launcher = screen.getByRole('button', { name: /chat with aux/i });
    expect(launcher.querySelector('.status-purple-table-text')).toBeTruthy();
    expect(launcher.querySelector('.status-purple-breathe')).toBeTruthy();
    expect(launcher.querySelector('[style*="text-shadow"]')).toBeFalsy();

    fireEvent.click(launcher);

    expect(screen.getAllByText('Auxilium').length).toBeGreaterThan(0);
    expect(screen.queryByText(/liquid\/lfm/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^live$/i)).not.toBeInTheDocument();
  });
});
