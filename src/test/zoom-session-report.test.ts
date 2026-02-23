import { describe, expect, it } from 'vitest';
import { normalizeZoomSessionReport } from '@/lib/zoom-session-report';

describe('normalizeZoomSessionReport', () => {
  it('accepts valid report shape', () => {
    const input = {
      schema_version: 1,
      attendance_rows: [{ ERP: '12345' }],
      issues_rows: [],
      absent_rows: [{ ERP: '54321' }],
      penalties_rows: [],
      matches_rows: [{ ERP: '12345', Name: 'Student A' }],
      raw_rows: [{ Name: 'Raw User' }],
      total_class_minutes: 90,
      effective_threshold_minutes: 72,
      rows: 35,
      generated_at: '2026-02-23T00:00:00.000Z',
      source_zoom_file_name: 'zoom.csv',
    };

    const result = normalizeZoomSessionReport(input);

    expect(result).not.toBeNull();
    expect(result?.schema_version).toBe(1);
    expect(result?.attendance_rows).toHaveLength(1);
    expect(result?.total_class_minutes).toBe(90);
    expect(result?.effective_threshold_minutes).toBe(72);
    expect(result?.rows).toBe(35);
    expect(result?.source_zoom_file_name).toBe('zoom.csv');
  });

  it('coerces missing arrays to empty arrays', () => {
    const result = normalizeZoomSessionReport({
      generated_at: '2026-02-23T00:00:00.000Z',
      rows: '5',
    });

    expect(result).not.toBeNull();
    expect(result?.attendance_rows).toEqual([]);
    expect(result?.issues_rows).toEqual([]);
    expect(result?.absent_rows).toEqual([]);
    expect(result?.penalties_rows).toEqual([]);
    expect(result?.matches_rows).toEqual([]);
    expect(result?.raw_rows).toEqual([]);
    expect(result?.rows).toBe(5);
  });

  it('returns null for invalid non-object input', () => {
    expect(normalizeZoomSessionReport(null)).toBeNull();
    expect(normalizeZoomSessionReport([])).toBeNull();
    expect(normalizeZoomSessionReport('bad-input')).toBeNull();
  });
});
