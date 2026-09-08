import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ProtectedRoute, PublicRoute, RouteLoading } from './App';

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: useAuthMock,
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

describe('route bootstrap loading', () => {
  beforeEach(() => {
    useAuthMock.mockReset();
  });

  it('uses a neutral fallback while the public auth route resolves', () => {
    useAuthMock.mockReturnValue({ user: null, isLoading: true, isTA: false });

    render(
      <MemoryRouter initialEntries={['/auth']}>
        <Routes>
          <Route path="/auth" element={<PublicRoute><div>Auth page</div></PublicRoute>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('status', { name: 'Loading portal' })).toBeInTheDocument();
    expect(screen.queryByText('Authenticating Access')).not.toBeInTheDocument();
    expect(screen.queryByText('Auth page')).not.toBeInTheDocument();
  });

  it('uses the same neutral fallback while a protected route resolves', () => {
    useAuthMock.mockReturnValue({ user: null, isLoading: true, isTA: false });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<ProtectedRoute><div>Dashboard page</div></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('status', { name: 'Loading portal' })).toBeInTheDocument();
    expect(screen.queryByText('Authenticating Access')).not.toBeInTheDocument();
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument();
  });

  it('keeps resolved redirect and protected rendering behavior unchanged', () => {
    useAuthMock.mockReturnValue({ user: null, isLoading: false, isTA: false });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<ProtectedRoute><div>Dashboard page</div></ProtectedRoute>} />
          <Route path="/auth" element={<div>Auth page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Auth page')).toBeInTheDocument();

    useAuthMock.mockReturnValue({ user: { email: 'student@khi.iba.edu.pk' }, isLoading: false, isTA: false });
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<ProtectedRoute><div>Dashboard page</div></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Dashboard page')).toBeInTheDocument();
  });

  it('can render the neutral fallback directly without authentication copy', () => {
    render(<RouteLoading />);

    expect(screen.getByRole('status', { name: 'Loading portal' })).toBeInTheDocument();
    expect(screen.queryByText(/authenticating access/i)).not.toBeInTheDocument();
  });
});
