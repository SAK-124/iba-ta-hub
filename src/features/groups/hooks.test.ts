import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getStudentGroupsState, listGroupAdminState } from './api';
import { useGroupAdminState, useStudentGroupsState } from './hooks';

vi.mock('./api', () => ({
  getStudentGroupsState: vi.fn(),
  listGroupAdminState: vi.fn(),
}));

const studentState = { student_email: 'student@example.com', student_erp: '12345', current_group_id: null, groups: [], roster: [], my_join_request: null, incoming_join_requests: [] };
const adminState = { viewer_email: 'ta@example.com', groups: [], roster: [], join_requests: [] };

describe('group state refresh behavior', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps student group content mounted during a pending background refresh and on failure', async () => {
    vi.mocked(getStudentGroupsState).mockResolvedValueOnce(studentState);
    const { result } = renderHook(() => useStudentGroupsState(true));
    await waitFor(() => expect(result.current.data.student_erp).toBe('12345'));

    let resolveRefresh!: (value: typeof studentState) => void;
    vi.mocked(getStudentGroupsState).mockReturnValueOnce(new Promise((resolve) => { resolveRefresh = resolve; }));
    let refreshPromise!: Promise<void>;
    act(() => { refreshPromise = result.current.refetch(); });
    expect(result.current.data.student_erp).toBe('12345');
    resolveRefresh(studentState);
    await act(async () => { await refreshPromise; });

    vi.mocked(getStudentGroupsState).mockRejectedValueOnce(new Error('offline'));
    await act(async () => { await result.current.refetch(); });
    expect(result.current.data.student_erp).toBe('12345');
    expect(result.current.error?.code).toBe('student_groups_state_fetch_failed');
  });

  it('keeps TA group content mounted when a background refresh fails', async () => {
    vi.mocked(listGroupAdminState).mockResolvedValueOnce(adminState);
    const { result } = renderHook(() => useGroupAdminState(true));
    await waitFor(() => expect(result.current.data.viewer_email).toBe('ta@example.com'));
    vi.mocked(listGroupAdminState).mockRejectedValueOnce(new Error('offline'));
    await act(async () => { await result.current.refetch(); });
    expect(result.current.data.viewer_email).toBe('ta@example.com');
    expect(result.current.error?.code).toBe('group_admin_state_fetch_failed');
  });

  it('ignores a late initial response after the hook unmounts', async () => {
    let resolveRequest!: (value: typeof adminState) => void;
    vi.mocked(listGroupAdminState).mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve; }));
    const { unmount } = renderHook(() => useGroupAdminState(true));

    unmount();
    await act(async () => {
      resolveRequest(adminState);
      await Promise.resolve();
    });

    expect(listGroupAdminState).toHaveBeenCalledOnce();
  });
});
