export type ZoomReportRow = Record<string, unknown>;

export interface ZoomSessionReport {
  schema_version: 1;
  attendance_rows: ZoomReportRow[];
  issues_rows: ZoomReportRow[];
  absent_rows: ZoomReportRow[];
  penalties_rows: ZoomReportRow[];
  matches_rows: ZoomReportRow[];
  raw_rows: ZoomReportRow[];
  total_class_minutes?: number;
  effective_threshold_minutes?: number;
  rows?: number;
  generated_at: string;
  source_zoom_file_name?: string;
}

export interface ZoomReportLoadRequest {
  sessionId: string;
  sessionNumber: number;
  sessionDate: string;
  report: ZoomSessionReport;
}

const asObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const toRecordArray = (value: unknown): ZoomReportRow[] => {
  if (!Array.isArray(value)) return [];

  return value.map((row) => {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      return row as ZoomReportRow;
    }

    return { value: row };
  });
};

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return undefined;
};

export const normalizeZoomSessionReport = (input: unknown): ZoomSessionReport | null => {
  const objectInput = asObject(input);
  if (!objectInput) return null;

  const generatedAtRaw = objectInput.generated_at;
  const generatedAt =
    typeof generatedAtRaw === 'string' && generatedAtRaw.trim() !== ''
      ? generatedAtRaw
      : new Date().toISOString();

  const sourceFileRaw = objectInput.source_zoom_file_name;
  const sourceZoomFileName =
    typeof sourceFileRaw === 'string' && sourceFileRaw.trim() !== ''
      ? sourceFileRaw.trim()
      : undefined;

  const normalized: ZoomSessionReport = {
    schema_version: 1,
    attendance_rows: toRecordArray(objectInput.attendance_rows),
    issues_rows: toRecordArray(objectInput.issues_rows),
    absent_rows: toRecordArray(objectInput.absent_rows),
    penalties_rows: toRecordArray(objectInput.penalties_rows),
    matches_rows: toRecordArray(objectInput.matches_rows),
    raw_rows: toRecordArray(objectInput.raw_rows),
    generated_at: generatedAt,
  };

  const totalClassMinutes = toFiniteNumber(objectInput.total_class_minutes);
  if (totalClassMinutes !== undefined) {
    normalized.total_class_minutes = totalClassMinutes;
  }

  const effectiveThresholdMinutes = toFiniteNumber(objectInput.effective_threshold_minutes);
  if (effectiveThresholdMinutes !== undefined) {
    normalized.effective_threshold_minutes = effectiveThresholdMinutes;
  }

  const rows = toFiniteNumber(objectInput.rows);
  if (rows !== undefined) {
    normalized.rows = rows;
  }

  if (sourceZoomFileName) {
    normalized.source_zoom_file_name = sourceZoomFileName;
  }

  return normalized;
};
