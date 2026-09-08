import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Auth from './Auth';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ signIn: vi.fn(), signUp: vi.fn(), loginAsTestUser: vi.fn() }),
}));
vi.mock('@/lib/access-checks', () => ({
  AccessCheckError: class AccessCheckError extends Error {},
  checkRosterCached: vi.fn(),
  checkTaAllowlistCached: vi.fn(),
}));
vi.mock('@/components/mode-toggle', () => ({ ModeToggle: () => <button type="button">Theme</button> }));
vi.mock('@/components/CompanionBotLogo', () => ({ default: () => <div aria-hidden="true" /> }));

describe('Auth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('provides an accessible link back to the public dashboard', () => {
    render(<MemoryRouter initialEntries={['/auth']}><Auth /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute('href', '/');
  });
});
