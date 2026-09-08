export interface ZoomRosterStudent {
  erp: string;
  student_name: string;
  class_no: string;
}

export interface ZoomParticipantRecord {
  name: string;
  email?: string;
  joinTime: string;
  leaveTime: string;
  durationMinutes?: number;
  raw?: Record<string, unknown>;
}

export interface ZoomSessionTiming {
  sessionDate?: string;
  startTime?: string | null;
  endTime?: string | null;
  manualDurationMinutes?: number | null;
  namazBreakMinutes?: number | null;
  threshold?: number;
}

export interface ZoomProcessorOptions extends ZoomSessionTiming {
  sourceFileName?: string;
  /** Explicit ERP assignments made by the TA for unresolved Zoom display names. */
  participantAssignments?: Record<string, string>;
}

export interface ZoomProcessorResult {
  attendance_rows: Record<string, unknown>[];
  issues_rows: Record<string, unknown>[];
  absent_rows: Record<string, unknown>[];
  penalties_rows: Record<string, unknown>[];
  matches_rows: Record<string, unknown>[];
  raw_rows: Record<string, unknown>[];
  total_class_minutes: number;
  effective_class_minutes: number;
  effective_threshold_minutes: number;
  rows: number;
  matched_participant_count: number;
  unmatched_participant_count: number;
  session_date?: string;
  session_start_time?: string;
  session_end_time?: string;
}

export interface ZoomDisplayIdentity {
  erp: string;
  studentName: string;
  isValid: boolean;
}

export interface ZoomRosterSuggestion extends ZoomRosterStudent {
  score: number;
}

export interface ZoomTimingSummary {
  officialMinutes: number;
  breakMinutes: number;
  effectiveMinutes: number;
  requiredMinutes: number;
}

const ERP_NAME_PATTERN = /^(\d{5})_(.+)$/;
const ERP_PREFIX_PATTERN = /^(\d{5})(?:_|\s|$)/;

const text = (value: unknown) => (value == null ? '' : String(value).trim());

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const normalizeName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();

const round = (value: number) => Math.round(value * 100) / 100;

const parseNumber = (value: unknown, fallback = 0) => {
  const raw = text(value);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseCsvRows = (csv: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    const next = csv[index + 1];

    if (character === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(cell);
      cell = '';
      if (row.some((item) => item.trim() !== '')) rows.push(row);
      row = [];
    } else {
      cell += character;
    }
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell);
    if (row.some((item) => item.trim() !== '')) rows.push(row);
  }

  return rows;
};

const findColumn = (headers: string[], candidates: string[]) => {
  const normalized = headers.map(normalizeHeader);
  const candidateSet = new Set(candidates.map(normalizeHeader));
  return normalized.findIndex((header) => candidateSet.has(header));
};

const findColumnContaining = (headers: string[], candidate: string) => {
  const normalizedCandidate = normalizeHeader(candidate);
  return headers.findIndex((header) => normalizeHeader(header).includes(normalizedCandidate));
};

const rowToRecord = (headers: string[], values: string[]) =>
  headers.reduce<Record<string, unknown>>((record, header, index) => {
    record[header.trim()] = values[index] ?? '';
    return record;
  }, {});

/** Parse Zoom's report, which has meeting metadata before the participant header. */
export const parseZoomCsv = (csv: string): ZoomParticipantRecord[] => {
  const rows = parseCsvRows(csv);
  const headerIndex = rows.findIndex((row) => {
    const hasName = findColumn(row, ['Name (original name)', 'Name', 'Participant']) >= 0;
    const hasJoin = findColumnContaining(row, 'Join time') >= 0;
    const hasLeave = findColumnContaining(row, 'Leave time') >= 0;
    return hasName && hasJoin && hasLeave;
  });

  if (headerIndex < 0) {
    throw new Error('This CSV does not contain Zoom participant columns (name, join time, and leave time).');
  }

  const headers = rows[headerIndex];
  const nameColumn = findColumn(headers, ['Name (original name)', 'Name', 'Participant']);
  const emailColumn = findColumn(headers, ['Email', 'User Email']);
  const joinColumn = findColumnContaining(headers, 'Join time');
  const leaveColumn = findColumnContaining(headers, 'Leave time');
  const durationColumn = findColumnContaining(headers, 'Duration');

  return rows.slice(headerIndex + 1).flatMap((values) => {
    const raw = rowToRecord(headers, values);
    const name = text(values[nameColumn]);
    const joinTime = text(values[joinColumn]);
    const leaveTime = text(values[leaveColumn]);
    if (!name || !joinTime || !leaveTime) return [];

    return [{
      name,
      email: emailColumn >= 0 ? text(values[emailColumn]) : undefined,
      joinTime,
      leaveTime,
      durationMinutes: durationColumn >= 0
        ? Number.isFinite(Number(text(values[durationColumn]))) ? Number(text(values[durationColumn])) : undefined
        : undefined,
      raw,
    }];
  });
};

const parseDateTime = (value: string, defaultDate?: string): number | null => {
  const input = text(value);
  if (!input) return null;

  const usMatch = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (usMatch) {
    const [, month, day, year, hourText, minuteText, secondText, meridiem] = usMatch;
    let hour = Number(hourText);
    if (meridiem?.toUpperCase() === 'PM' && hour < 12) hour += 12;
    if (meridiem?.toUpperCase() === 'AM' && hour === 12) hour = 0;
    return new Date(Number(year), Number(month) - 1, Number(day), hour, Number(minuteText), Number(secondText || 0)).getTime();
  }

  const isoMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (isoMatch) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).getTime();
  }

  const timeMatch = input.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (timeMatch && defaultDate) {
    return parseDateTime(`${defaultDate} ${input}`, defaultDate);
  }

  const parsed = Date.parse(input);
  return Number.isFinite(parsed) ? parsed : null;
};

const getBounds = (options: ZoomSessionTiming) => {
  const date = text(options.sessionDate);
  const start = options.startTime ? parseDateTime(`${date} ${options.startTime}`, date) : null;
  const configuredDuration = options.manualDurationMinutes != null ? Number(options.manualDurationMinutes) : NaN;
  const endFromSession = options.endTime ? parseDateTime(`${date} ${options.endTime}`, date) : null;
  const end = Number.isFinite(configuredDuration) && configuredDuration > 0 && start != null
    ? start + configuredDuration * 60_000
    : endFromSession;
  const duration = Number.isFinite(configuredDuration) && configuredDuration >= 0
    ? configuredDuration
    : start != null && end != null
      ? Math.max((end - start) / 60_000, 0)
      : NaN;

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Select a session with start/end times or enter a valid class duration in minutes.');
  }

  return { start, end, duration };
};

const intervalDuration = (participant: ZoomParticipantRecord, bounds: { start: number | null; end: number | null }) => {
  const join = parseDateTime(participant.joinTime);
  const leave = parseDateTime(participant.leaveTime);
  if (join == null || leave == null || leave <= join) return 0;

  const clippedStart = bounds.start == null ? join : Math.max(join, bounds.start);
  const clippedEnd = bounds.end == null ? leave : Math.min(leave, bounds.end);
  return clippedEnd > clippedStart ? clippedEnd - clippedStart : 0;
};

const mergedDuration = (participants: ZoomParticipantRecord[], bounds: { start: number | null; end: number | null }) => {
  const intervals = participants
    .map((participant) => {
      const join = parseDateTime(participant.joinTime);
      const leave = parseDateTime(participant.leaveTime);
      if (join == null || leave == null || leave <= join) return null;
      const start = bounds.start == null ? join : Math.max(join, bounds.start);
      const end = bounds.end == null ? leave : Math.min(leave, bounds.end);
      return end > start ? { start, end } : null;
    })
    .filter((interval): interval is { start: number; end: number } => interval != null)
    .sort((a, b) => a.start - b.start);

  let total = 0;
  let current: { start: number; end: number } | null = null;
  intervals.forEach((interval) => {
    if (!current) {
      current = interval;
    } else if (interval.start <= current.end) {
      current.end = Math.max(current.end, interval.end);
    } else {
      total += current.end - current.start;
      current = interval;
    }
  });
  if (current) total += current.end - current.start;
  return total / 60_000;
};

const extractIdentity = (name: string) => {
  const trimmed = name.trim();
  const validMatch = trimmed.match(ERP_NAME_PATTERN);
  const prefixMatch = trimmed.match(ERP_PREFIX_PATTERN);
  return {
    erp: validMatch?.[1] ?? prefixMatch?.[1] ?? '',
    isValid: Boolean(validMatch?.[2]?.trim()),
  };
};

/** Parse a Zoom display name without treating uncertain names as resolved. */
export const parseZoomDisplayIdentity = (name: string): ZoomDisplayIdentity => {
  const trimmed = text(name);
  const validMatch = trimmed.match(ERP_NAME_PATTERN);
  const prefixMatch = trimmed.match(ERP_PREFIX_PATTERN);
  return {
    erp: validMatch?.[1] ?? prefixMatch?.[1] ?? '',
    studentName: validMatch?.[2]?.trim() ?? '',
    isValid: Boolean(validMatch?.[2]?.trim()),
  };
};

const normalizedName = (value: string) => normalizeName(value);

/** Return deterministic, searchable roster suggestions for a Zoom issue. */
export const getZoomResolutionSuggestions = (
  issueName: string,
  erpCandidate: string,
  roster: ZoomRosterStudent[],
  query = '',
): ZoomRosterSuggestion[] => {
  const parsed = parseZoomDisplayIdentity(issueName);
  const candidateERP = text(erpCandidate) || parsed.erp;
  const issueNameKey = normalizedName(parsed.studentName || issueName);
  const queryKey = normalizedName(query);
  return roster
    .map((student) => {
      const erp = text(student.erp);
      const nameKey = normalizedName(student.student_name);
      const exactErp = Boolean(candidateERP && erp === candidateERP);
      const exactName = Boolean(issueNameKey && nameKey === issueNameKey);
      const namePrefix = Boolean(issueNameKey && nameKey.startsWith(issueNameKey));
      const nameContains = Boolean(issueNameKey && (nameKey.includes(issueNameKey) || issueNameKey.includes(nameKey)));
      const queryMatches = !queryKey || erp === candidateERP || normalizedName(`${erp} ${student.student_name}`).includes(queryKey);
      const score = exactErp ? 100000 : exactName ? 90000 : namePrefix ? 80000 : nameContains ? 70000 : 0;
      return { ...student, score: score + (queryMatches ? 1000 : 0) };
    })
    .filter((student) => !queryKey || student.erp === candidateERP || normalizedName(`${student.erp} ${student.student_name}`).includes(queryKey))
    .sort((a, b) => b.score - a.score || a.student_name.localeCompare(b.student_name) || a.erp.localeCompare(b.erp));
};

export interface ZoomQuickAddInput {
  erp: string;
  studentName: string;
  classNo: string;
}

export const validateZoomQuickAdd = (input: ZoomQuickAddInput, roster: ZoomRosterStudent[]) => {
  const erp = text(input.erp);
  const studentName = text(input.studentName);
  const classNo = text(input.classNo);
  if (!/^\d{5}$/.test(erp)) return { valid: false, error: 'ERP must be exactly five digits.' };
  if (!studentName) return { valid: false, error: 'Enter the student name.' };
  if (!classNo) return { valid: false, error: 'Select a class.' };
  if (roster.some((student) => text(student.erp) === erp)) return { valid: false, error: 'That ERP is already in the roster.' };
  return { valid: true as const, error: '' };
};

export const getZoomTimingSummary = (options: ZoomSessionTiming): ZoomTimingSummary => {
  const bounds = getBounds({ ...options, manualDurationMinutes: null });
  const breakMinutes = Math.max(parseNumber(options.namazBreakMinutes, 0), 0);
  const effectiveMinutes = Math.max(bounds.duration - breakMinutes, 0);
  return {
    officialMinutes: round(bounds.duration),
    breakMinutes: round(breakMinutes),
    effectiveMinutes: round(effectiveMinutes),
    requiredMinutes: round(effectiveMinutes * Math.min(Math.max(parseNumber(options.threshold, 0.8), 0), 1)),
  };
};

const participantKey = (participant: ZoomParticipantRecord) => `${participant.name.trim()}|${text(participant.email)}`;

export const isValidZoomDisplayName = (name: string, erp?: string) => {
  const identity = extractIdentity(name);
  return identity.isValid && (!erp || identity.erp === text(erp));
};

export const processZoomAttendance = (
  participants: ZoomParticipantRecord[],
  roster: ZoomRosterStudent[],
  options: ZoomProcessorOptions,
): ZoomProcessorResult => {
  if (roster.length === 0) throw new Error('The roster is empty. Load the saved student roster first.');
  const bounds = getBounds(options);
  const namazBreak = Math.max(parseNumber(options.namazBreakMinutes, 0), 0);
  const effectiveClassMinutes = Math.max(bounds.duration - namazBreak, 0);
  const threshold = Math.min(Math.max(parseNumber(options.threshold, 0.8), 0), 1);
  const requiredMinutes = round(effectiveClassMinutes * threshold);
  const rosterByErp = new Map(roster.map((student) => [text(student.erp), student]));
  const rosterByName = new Map<string, ZoomRosterStudent[]>();
  roster.forEach((student) => {
    const key = normalizeName(student.student_name);
    const existing = rosterByName.get(key) ?? [];
    existing.push(student);
    rosterByName.set(key, existing);
  });

  const grouped = new Map<string, { student: ZoomRosterStudent; participants: ZoomParticipantRecord[]; method: string }>();
  const unresolved = new Map<string, { participant: ZoomParticipantRecord; participants: ZoomParticipantRecord[]; reason: string }>();

  participants.forEach((participant) => {
    const identity = extractIdentity(participant.name);
    const assignment = options.participantAssignments?.[participantKey(participant)];
    const assignedStudent = assignment ? rosterByErp.get(text(assignment)) : undefined;
    const byErp = identity.erp ? rosterByErp.get(identity.erp) : undefined;
    const exactNameMatches = identity.erp ? [] : rosterByName.get(normalizeName(participant.name)) ?? [];
    const student = assignedStudent ?? byErp ?? (exactNameMatches.length === 1 ? exactNameMatches[0] : undefined);

    if (!student) {
      const key = participantKey(participant);
      const existing = unresolved.get(key);
      const reason = exactNameMatches.length > 1 ? 'Ambiguous roster name' : identity.erp ? 'ERP not found in roster' : 'Could not identify student';
      if (existing) existing.participants.push(participant);
      else unresolved.set(key, { participant, participants: [participant], reason });
      return;
    }

    const key = student.erp;
    const group = grouped.get(key) ?? {
      student,
      participants: [],
      method: assignedStudent ? 'Manual' : byErp ? 'ERP' : 'Name',
    };
    group.participants.push(participant);
    grouped.set(key, group);
  });

  const issues: Record<string, unknown>[] = Array.from(unresolved.entries()).map(([key, item]) => ({
    Key: key,
    Name: item.participant.name,
    Email: item.participant.email || '',
    ERP: extractIdentity(item.participant.name).erp || 'N/A',
    'Attended Minutes': round(mergedDuration(item.participants, bounds)),
    Reason: item.reason,
    'Needs Review': true,
  }));

  const attendanceRows: Record<string, unknown>[] = roster.map((student) => {
    const group = grouped.get(student.erp);
    const studentParticipants = group?.participants ?? [];
    const attendedMinutes = round(mergedDuration(studentParticipants, bounds));
    const validName = studentParticipants.some((participant) => isValidZoomDisplayName(participant.name, student.erp));
    const present = attendedMinutes >= requiredMinutes;
    const status = present ? 'present' : 'absent';
    const namingPenalty = present && !validName;
    const zoomNames = Array.from(new Set(studentParticipants.map((participant) => participant.name))).join(' | ');

    return {
      ERP: student.erp,
      Name: student.student_name,
      'Class No': student.class_no,
      'Zoom Name': zoomNames,
      'Attended Minutes': attendedMinutes,
      'Required Minutes': requiredMinutes,
      'Attendance %': effectiveClassMinutes > 0 ? round(Math.min(100, (attendedMinutes / effectiveClassMinutes) * 100)) : 0,
      Status: status,
      'Name Penalty': namingPenalty ? -1 : 0,
      'Name Format': validName ? 'Valid' : studentParticipants.length === 0 ? 'No Zoom record' : 'Needs ERP_name',
      'Match Method': group?.method ?? 'No match',
    };
  });

  const absentRows = attendanceRows.filter((row) => row.Status === 'absent');
  const penaltiesRows = attendanceRows.filter((row) => row['Name Penalty'] === -1);
  const matchesRows = attendanceRows.filter((row) => row['Match Method'] !== 'No match');

  return {
    attendance_rows: attendanceRows,
    issues_rows: issues,
    absent_rows: absentRows,
    penalties_rows: penaltiesRows,
    matches_rows: matchesRows,
    raw_rows: participants.map((participant) => participant.raw ?? {
      'Name (original name)': participant.name,
      'Join time': participant.joinTime,
      'Leave time': participant.leaveTime,
      'Duration (minutes)': participant.durationMinutes ?? '',
    }),
    total_class_minutes: round(bounds.duration),
    effective_class_minutes: round(effectiveClassMinutes),
    effective_threshold_minutes: requiredMinutes,
    rows: participants.length,
    matched_participant_count: grouped.size,
    unmatched_participant_count: issues.length,
    session_date: options.sessionDate,
    session_start_time: options.startTime ?? undefined,
    session_end_time: options.endTime ?? undefined,
  };
};

export const processZoomCsv = (csv: string, roster: ZoomRosterStudent[], options: ZoomProcessorOptions) =>
  processZoomAttendance(parseZoomCsv(csv), roster, options);
