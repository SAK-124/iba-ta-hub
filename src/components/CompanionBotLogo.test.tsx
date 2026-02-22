import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CompanionBotLogo from '@/components/CompanionBotLogo';

describe('CompanionBotLogo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('enters sleeping state after idle timeout', () => {
    render(<CompanionBotLogo />);

    const botButton = screen.getByRole('button', { name: /aamd companion bot/i });
    vi.advanceTimersByTime(4000);

    expect(botButton).toHaveClass('sleeping');
  });

  it('activates typing state on keypress and clears after timeout', () => {
    render(<CompanionBotLogo />);

    const botButton = screen.getByRole('button', { name: /aamd companion bot/i });

    fireEvent.keyDown(document, { key: 'a' });
    expect(botButton).toHaveClass('typing');

    vi.advanceTimersByTime(800);
    expect(botButton).not.toHaveClass('typing');
  });

  it('enters happy state on click', () => {
    render(<CompanionBotLogo />);

    const botButton = screen.getByRole('button', { name: /aamd companion bot/i });

    fireEvent.click(botButton);

    expect(botButton).toHaveClass('happy');
  });
});
