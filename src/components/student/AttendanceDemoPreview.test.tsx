import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AttendanceDemoPreview from './AttendanceDemoPreview';

describe('AttendanceDemoPreview', () => {
  it('shows isolated present, absent, and name-penalty examples', () => {
    render(<AttendanceDemoPreview />);

    expect(screen.getByText('Sample student preview')).toBeInTheDocument();
    expect(screen.getByText('Present')).toBeInTheDocument();
    expect(screen.getByText('Absent')).toBeInTheDocument();
    expect(screen.getByText('Name penalty')).toBeInTheDocument();
    expect(screen.getByText('12345_Demo Student')).toBeInTheDocument();
    expect(screen.getByText('18 min')).toBeInTheDocument();
    expect(screen.getByText('18 min below the required 80% cutoff.')).toBeInTheDocument();
    expect(screen.getByText('Present · Name format incorrect.')).toBeInTheDocument();
  });
});
