export type TAHelpModuleId =
  | 'zoom'
  | 'attendance'
  | 'sessions'
  | 'consolidated'
  | 'exceptions'
  | 'roster'
  | 'late-days'
  | 'export'
  | 'issues'
  | 'settings';

export type TAHelpAttendanceTab = 'zoom' | 'attendance';
export type AttendanceFilterToken = 'present' | 'absent' | 'penalized';
export type HelpActionTargetKind =
  | 'student'
  | 'session'
  | 'ticket'
  | 'assignment'
  | 'submission'
  | 'ta'
  | 'setting-section';

export interface HelpActionTarget {
  kind: HelpActionTargetKind;
  id?: string;
  label: string;
  aliases?: string[];
  meta?: Record<string, string | number | boolean | null | undefined>;
}

export interface HelpContextSnapshot {
  moduleId: TAHelpModuleId | 'dashboard';
  moduleTitle: string;
  moduleStage: string | null;
  screenDescription?: string | null;
  openSurface?: string | null;
  visibleControls: string[];
  searchQuery?: string | null;
  filters?: Record<string, string>;
  selected?: {
    kind: string;
    id?: string;
    label: string;
  } | null;
  actionTargets?: HelpActionTarget[];
}

export interface ScreenContextSummary {
  title: string;
  description: string;
  visibleControls: string[];
  primaryAction?: string;
  nextSteps?: string[];
}

export interface ZoomAgentCommand {
  kind: 'focus-upload' | 'set-parameters' | 'switch-tab';
  focusControl?: 'select-csv' | 'select-roster' | 'analyze' | 'calculate';
  manualDuration?: string;
  namazBreak?: string;
  tab?: 'attendance' | 'absent' | 'penalties' | 'matches' | 'issues' | 'unidentified' | 'raw';
}

export interface AttendanceAgentCommand {
  kind: 'select-session' | 'prefill-absent-erps' | 'search' | 'filter' | 'prepare-submit' | 'prepare-sync' | 'focus-student';
  query?: string;
  sessionNumber?: number;
  erpText?: string;
  filters?: AttendanceFilterToken[];
}

export interface SessionAgentCommand {
  kind: 'prepare-create-session';
  selectedDate: string;
  sessionNumberStrategy: 'next';
  focusField: 'session-number' | 'start-time' | 'end-time';
}

export interface RosterAgentCommand {
  kind: 'open-add-student' | 'search' | 'open-edit-student' | 'prepare-delete-student' | 'prepare-bulk-roster';
  query?: string;
  student?: {
    student_name?: string;
    erp?: string;
    class_no?: string;
  };
  rosterText?: string;
  focusField?: 'student_name' | 'erp' | 'class_no' | 'roster_text';
}

export interface ConsolidatedAgentCommand {
  kind: 'search' | 'clear-search' | 'focus-sync';
  query?: string;
}

export interface RuleExceptionsAgentCommand {
  kind: 'search-tracker' | 'mark-warned' | 'clear-warning' | 'open-add-exception' | 'prepare-delete-exception';
  query?: string;
  issueType?: 'camera_excused' | 'connectivity' | 'other';
  day?: 'friday' | 'saturday' | 'both';
  notes?: string;
}

export interface IssueQueueAgentCommand {
  kind: 'filter' | 'open-ticket' | 'prepare-resolve-ticket' | 'prepare-escalate-ticket' | 'prepare-delete-ticket' | 'prefill-response';
  query?: string;
  status?: 'all' | 'pending' | 'resolved';
  group?: 'all' | 'class_issue' | 'grading_query' | 'penalty_query' | 'absence_query';
  response?: string;
}

export interface LateDaysAgentCommand {
  kind:
    | 'search-student'
    | 'open-grant-dialog'
    | 'prepare-create-assignment'
    | 'open-claim-details'
    | 'prepare-archive-assignment'
    | 'prepare-delete-claim';
  query?: string;
  days?: string;
  reason?: string;
  title?: string;
  dueAt?: string;
}

export interface ExportAgentCommand {
  kind: 'download-csv';
}

export interface SettingsAgentCommand {
  kind: 'focus-section' | 'prefill-add-ta' | 'prefill-submission' | 'prefill-password' | 'prefill-test-student';
  section?: 'global' | 'test-student' | 'password' | 'ta-management' | 'submission-list';
  email?: string;
  submissionLabel?: string;
  newPassword?: string;
  confirmPassword?: string;
  testStudent?: {
    class_no?: string;
    student_name?: string;
    total_absences?: string;
    total_penalties?: string;
  };
}

export type HelpAssistantAction =
  | { type: 'open-module'; module: TAHelpModuleId }
  | { type: 'switch-attendance-tab'; tab: TAHelpAttendanceTab }
  | { type: 'zoom-command'; command: ZoomAgentCommand }
  | { type: 'attendance-command'; command: AttendanceAgentCommand }
  | { type: 'session-command'; command: SessionAgentCommand }
  | { type: 'roster-command'; command: RosterAgentCommand }
  | { type: 'consolidated-command'; command: ConsolidatedAgentCommand }
  | { type: 'rule-exceptions-command'; command: RuleExceptionsAgentCommand }
  | { type: 'issue-queue-command'; command: IssueQueueAgentCommand }
  | { type: 'late-days-command'; command: LateDaysAgentCommand }
  | { type: 'export-command'; command: ExportAgentCommand }
  | { type: 'settings-command'; command: SettingsAgentCommand };

export type WorkflowIntentId =
  | 'zoom-attendance'
  | 'attendance-penalties'
  | 'roster-add-student'
  | 'mark-warned';

export interface ResolvedConversationIntent {
  kind: 'module' | 'workflow';
  moduleId: TAHelpModuleId;
  moduleTitle: string;
  workflowId?: WorkflowIntentId;
  entityQuery?: string | null;
  nextAction?: HelpAssistantAction | null;
}

export interface HelpAssistantPlan {
  action: HelpAssistantAction | null;
  response: string;
  rememberedIntent?: ResolvedConversationIntent | null;
}

export interface AgentCommandEnvelope<T> {
  token: number;
  command: T;
}

const MODULE_NAME_BY_ID: Record<TAHelpModuleId, string> = {
  zoom: 'Zoom Processor',
  attendance: 'Live Attendance',
  sessions: 'Session Management',
  consolidated: 'Consolidated View',
  exceptions: 'Rule Exceptions',
  roster: 'Roster Management',
  'late-days': 'Late Days',
  export: 'Export Data',
  issues: 'Issue Queue',
  settings: 'Lists & Settings',
};

const MODULE_ALIASES: Array<{ module: TAHelpModuleId; aliases: string[] }> = [
  { module: 'zoom', aliases: ['zoom processor', 'zoom checker', 'zoom'] },
  { module: 'attendance', aliases: ['live attendance', 'attendance', 'mark attendance'] },
  { module: 'sessions', aliases: ['session management', 'session', 'sessions'] },
  { module: 'consolidated', aliases: ['consolidated view', 'consolidated', 'attendance table'] },
  { module: 'exceptions', aliases: ['rule exceptions', 'rule exception', 'exceptions', 'camera tracker', 'warned tracker'] },
  { module: 'roster', aliases: ['roster management', 'roster', 'student list'] },
  { module: 'late-days', aliases: ['late days', 'late day', 'claims'] },
  { module: 'export', aliases: ['export data', 'export', 'download attendance'] },
  { module: 'issues', aliases: ['issue queue', 'issue tracker', 'issues', 'tickets', 'ticket'] },
  { module: 'settings', aliases: ['lists & settings', 'lists and settings', 'settings', 'ta management', 'submission list'] },
];

const DIRECT_ACTION_PREFIX =
  /^(please\s+)?(can you\s+)?(go to|open|take me to|navigate to|switch to|show me|bring up|prepare|set up|setup|create|make|fill|add|mark|grant|search|find|download)\b/i;
const VAGUE_CONTEXTUAL_QUESTION =
  /\b((?:what's|whats|what is)\s+this|what do i click now|what do i press first|what next|what should i click|where do i go from here|what do i do here|what do i click here first|what do i click to start|what now)\b/i;
const WORKFLOW_INTENT_PREFIX =
  /^(?:please\s+)?(?:can you\s+)?(?:i\s+wanna\s+do|i\s+want\s+to\s+do|help\s+me\s+do|i\s+need\s+to\s+do|let'?s\s+do|walk\s+me\s+through)\b/i;
const FOLLOW_UP_ACTION_PATTERN =
  /^(?:please\s+)?(?:can you\s+)?(?:take me there|go there|open that|take me to it|continue|do that)(?:\s+please)?[.!?]*$/i;

const normalize = (value: string) => value.trim().toLowerCase();

const stripModulePrefix = (value?: string | null, moduleTitle?: string | null) => {
  if (!value) return '';
  if (!moduleTitle) return value;
  const prefix = `${moduleTitle} · `;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
};

const includesAny = (value: string, candidates: string[]) => candidates.some((candidate) => value.includes(candidate));

const extractEmail = (question: string) => question.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
const extractInteger = (question: string, pattern: RegExp) => {
  const match = question.match(pattern);
  return match ? Number.parseInt(match[1], 10) : null;
};

const extractDaysValue = (question: string) => {
  const match = question.match(/(\d+)\s+late\s+days?/i) ?? question.match(/grant\s+(\d+)/i);
  return match?.[1] ?? null;
};

const extractQuotedText = (question: string) => question.match(/["']([^"']+)["']/)?.[1] ?? null;

const extractNamedEntity = (question: string) => {
  const quoted = extractQuotedText(question);
  if (quoted) return quoted.trim();

  const namedMatch =
    question.match(/\b(?:named|name is|called)\s+([a-z][a-z\s.-]{1,60})$/i) ??
    question.match(/\b(?:named|name is|called)\s+([a-z][a-z\s.-]{1,60})(?:\s+(?:with|for|to)\b|$)/i);
  if (namedMatch?.[1]) {
    return namedMatch[1].trim();
  }

  const targetMatch =
    question.match(/\b(?:warn|mark|grant|add|edit|delete|remove|find|open)\s+([a-z][a-z\s.-]{1,60})(?:\s+(?:as|for|to|in|on)\b|$)/i) ??
    question.match(/\bstudent\s+([a-z][a-z\s.-]{1,60})(?:\s+(?:with|for|to|in|on)\b|$)/i);
  if (targetMatch?.[1]) {
    return targetMatch[1].trim();
  }

  return null;
};

const sanitizeNamedEntity = (value: string | null) => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (['someone', 'somebody', 'student', 'a student', 'them', 'that student'].includes(normalized)) {
    return null;
  }

  return value.trim();
};

const extractErp = (question: string) => question.match(/\b(\d{4,6})\b/)?.[1] ?? null;
const extractClassNo = (question: string) => question.match(/\bclass(?:\s*(?:no|code))?\s+([a-z0-9-]{1,20})\b/i)?.[1] ?? null;

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const matchesTarget = (target: HelpActionTarget, query: string) => {
  const normalizedQuery = slugify(query);
  if (!normalizedQuery) return false;

  const haystacks = [
    target.label,
    ...(target.aliases ?? []),
    ...Object.values(target.meta ?? {}).map((value) => String(value ?? '')),
  ].map(slugify);

  return haystacks.some((haystack) => haystack.includes(normalizedQuery) || normalizedQuery.includes(haystack));
};

const resolveTarget = (
  targets: HelpActionTarget[] | undefined,
  kind: HelpActionTargetKind,
  query: string | null,
) => {
  if (!query || !targets?.length) return null;
  const candidates = targets.filter((target) => target.kind === kind && matchesTarget(target, query));
  if (candidates.length !== 1) return null;
  return candidates[0];
};

const getModuleName = (module: TAHelpModuleId) => MODULE_NAME_BY_ID[module];

const buildPreparedResponse = (parts: {
  done: string[];
  missing?: string[];
  finalButton?: string | null;
  finalStepText?: string | null;
  note?: string | null;
}) =>
  [
    '1. Prepared for you',
    ...parts.done,
    '2. Still needed',
    ...(parts.missing && parts.missing.length > 0 ? parts.missing : ['Nothing else is required before the final review.']),
    '3. Final step',
    parts.finalStepText ??
      (parts.finalButton
        ? `Review the prepared values, then click \`${parts.finalButton}\` yourself when you are ready.`
        : 'No final save click is required for this prep step.'),
    ...(parts.note ? ['4. Notes', parts.note] : []),
  ].join('\n');

const buildCurrentScreenPrimaryAction = (snapshot: HelpContextSnapshot) => {
  const summary = getScreenContextSummary(snapshot);
  return summary.primaryAction ?? snapshot.visibleControls[0] ?? 'the first visible control';
};

const buildZoomUploadContext = (): ScreenContextSummary => ({
  title: 'Zoom Processor',
  description: 'This screen is for loading the Zoom file, checking roster usage, and preparing the analysis pass.',
  visibleControls: ['SELECT CSV', 'Use Saved', 'CUSTOM DURATION (MINS)', 'NAMAZ BREAK (MINS)', 'Analyze Matrix', 'Calculate Attendance'],
  primaryAction: 'SELECT CSV',
  nextSteps: ['Click `SELECT CSV` first.', 'Keep `Use Saved` enabled unless you intentionally need a separate roster file.', 'Run `Analyze Matrix` before final attendance.'],
});

const buildZoomReviewContext = (stageSuffix: string): ScreenContextSummary => {
  const activeTab = stageSuffix.match(/review step · (.*)$/i)?.[1] ?? 'matches tab';
  return {
    title: 'Zoom Processor',
    description: `This is the Zoom review screen. You are currently on the ${activeTab}.`,
    visibleControls: ['Matches', 'Issues', 'Unidentified', 'Raw Zoom Log', 'Calculate Attendance'],
    primaryAction: activeTab.toLowerCase().includes('matches') ? 'Matches' : 'Calculate Attendance',
    nextSteps: [`Finish reviewing the ${activeTab}.`, 'Check `Issues` and `Unidentified` before finalizing.', 'Use `Calculate Attendance` only after the review looks correct.'],
  };
};

const buildZoomResultsContext = (stageSuffix: string): ScreenContextSummary => {
  const activeTab = stageSuffix.match(/results step · (.*)$/i)?.[1] ?? 'attendance tab';
  return {
    title: 'Zoom Processor',
    description: `This is the finalized Zoom results screen. You are currently on the ${activeTab}.`,
    visibleControls: ['Attendance', 'Absent', 'Penalties', 'Matches', 'Issues', 'Unidentified', 'Raw Zoom Log', 'Copy Absent ERPs'],
    primaryAction: activeTab.toLowerCase().includes('absent') ? 'Copy Absent ERPs' : 'Absent',
    nextSteps: ['Open `Absent` to verify the ERP list.', 'Use `Copy Absent ERPs` before switching to `Live Attendance`.', 'Review `Penalties` if naming penalties need manual follow-up.'],
  };
};

const buildLiveAttendanceContext = (stageSuffix: string): ScreenContextSummary => {
  if (stageSuffix.includes('reviewing absent erp list')) {
    return {
      title: 'Live Attendance',
      description: 'This screen is ready for a pasted absent ERP list before attendance submission.',
      visibleControls: ['Select Session', 'Absent ERPs', 'Submit Attendance'],
      primaryAction: 'Submit Attendance',
      nextSteps: ['Confirm the selected session is correct.', 'Check the pasted absent ERP list.', 'Submit only after the list looks right.'],
    };
  }

  if (stageSuffix.includes('saving attendance')) {
    return {
      title: 'Live Attendance',
      description: 'Attendance is currently being saved for the selected session.',
      visibleControls: ['Submit Attendance', 'Overwrite'],
      nextSteps: ['Wait for the save to finish.', 'Use `Overwrite` only if you intentionally want to replace the existing session attendance.'],
    };
  }

  if (stageSuffix.includes('reviewing session')) {
    return {
      title: 'Live Attendance',
      description: 'This screen shows the attendance table for the selected session.',
      visibleControls: ['Sync to Sheet', 'Search Name or ERP', 'All', 'Present', 'Absent', 'Penalized'],
      primaryAction: 'Search Name or ERP',
      nextSteps: ['Search for the student you need to review.', 'Use the status badge or penalty toggle directly in the table.', 'Sync only after the table is correct.'],
    };
  }

  return {
    title: 'Live Attendance',
    description: 'This screen is the attendance entry form for a session.',
    visibleControls: ['Select Session', 'Absent ERPs', 'Submit Attendance'],
    primaryAction: 'Select Session',
    nextSteps: ['Select a session first.', 'Paste the absent ERP list.', 'Submit only after confirming the session.'],
  };
};

const buildSessionManagementContext = (stageSuffix: string): ScreenContextSummary => {
  if (stageSuffix.includes('creating')) {
    return {
      title: 'Session Management',
      description: 'This is the Add Session form for creating a new session.',
      visibleControls: ['Session Number', 'Date', 'Day of Week', 'Start Time', 'End Time', 'Create Session'],
      primaryAction: 'Session Number',
      nextSteps: ['Fill `Session Number` first if it is empty.', 'Pick the `Date`, then review `Day of Week` and time fields.', 'Click `Create Session` only after verification.'],
    };
  }

  if (stageSuffix.includes('editing')) {
    return {
      title: 'Session Management',
      description: 'This is the edit dialog for an existing session.',
      visibleControls: ['Session Number', 'Date', 'Day of Week', 'Start Time', 'End Time', 'Save'],
      primaryAction: 'Session Number',
      nextSteps: ['Adjust the fields that need correction.', 'Use `Save` only after confirming the updated details.'],
    };
  }

  return {
    title: 'Session Management',
    description: 'This module manages session creation and the saved session list.',
    visibleControls: ['Session Number', 'Date', 'Day of Week', 'Start Time', 'End Time', 'Create Session', 'Sessions List'],
    primaryAction: 'Session Number',
    nextSteps: ['Use the left form for a new session.', 'Use the right table if you need to edit or load an existing session.'],
  };
};

const buildConsolidatedContext = (stageSuffix: string): ScreenContextSummary => {
  if (stageSuffix.includes('syncing')) {
    return {
      title: 'Consolidated View',
      description: 'This is the full attendance board, and a manual sheet sync is in progress.',
      visibleControls: ['Search...', 'Sync Sheet'],
      nextSteps: ['Wait for the sync to finish.', 'If the table still looks wrong afterward, fix the source data first and then sync again.'],
    };
  }

  if (stageSuffix.includes('search active')) {
    return {
      title: 'Consolidated View',
      description: 'This is the full attendance table with an active search filter.',
      visibleControls: ['Search...', 'Sync Sheet'],
      primaryAction: 'Search...',
      nextSteps: ['Keep using `Search...` to narrow the list.', 'Use `Sync Sheet` only when the attendance data is already correct.'],
    };
  }

  return {
    title: 'Consolidated View',
    description: 'This is the full attendance table across sessions, including penalties and absences.',
    visibleControls: ['Search...', 'Sync Sheet'],
    primaryAction: 'Search...',
    nextSteps: ['Use `Search...` to find a student or class.', 'Use `Sync Sheet` only when the table is already correct and you want to push it downstream.'],
  };
};

const buildGenericModuleContext = (snapshot: HelpContextSnapshot): ScreenContextSummary => ({
  title: snapshot.moduleTitle,
  description:
    snapshot.screenDescription ||
    `This screen is ${snapshot.moduleTitle}. Ask about the current workflow step if you need the next control or action.`,
  visibleControls: snapshot.visibleControls,
  primaryAction: snapshot.visibleControls[0],
});

export const getScreenContextSummary = (
  snapshotOrModuleTitle?: HelpContextSnapshot | string | null,
  moduleStage?: string | null,
): ScreenContextSummary | null => {
  if (!snapshotOrModuleTitle) return null;

  const snapshot =
    typeof snapshotOrModuleTitle === 'string'
      ? ({
          moduleId: 'dashboard',
          moduleTitle: snapshotOrModuleTitle,
          moduleStage: moduleStage ?? null,
          visibleControls: [],
        } satisfies HelpContextSnapshot)
      : snapshotOrModuleTitle;

  const stageSuffix = normalize(stripModulePrefix(snapshot.moduleStage, snapshot.moduleTitle));

  switch (snapshot.moduleTitle) {
    case 'Zoom Processor':
      if (stageSuffix.includes('results step')) return buildZoomResultsContext(stageSuffix);
      if (stageSuffix.includes('review step')) return buildZoomReviewContext(stageSuffix);
      return buildZoomUploadContext();
    case 'Live Attendance':
      return buildLiveAttendanceContext(stageSuffix);
    case 'Session Management':
      return buildSessionManagementContext(stageSuffix);
    case 'Consolidated View':
      return buildConsolidatedContext(stageSuffix);
    default:
      return buildGenericModuleContext(snapshot);
  }
};

export const isContextualPortalQuestion = (
  question: string,
  snapshotOrModuleTitle?: HelpContextSnapshot | string | null,
  moduleStage?: string | null,
) => {
  const moduleTitle =
    typeof snapshotOrModuleTitle === 'string'
      ? snapshotOrModuleTitle
      : snapshotOrModuleTitle?.moduleTitle;
  const resolvedStage =
    typeof snapshotOrModuleTitle === 'string'
      ? moduleStage
      : snapshotOrModuleTitle?.moduleStage;
  return Boolean((moduleTitle || resolvedStage) && VAGUE_CONTEXTUAL_QUESTION.test(question));
};

export const buildCurrentScreenAnswer = (
  question: string,
  snapshotOrModuleTitle?: HelpContextSnapshot | string | null,
  moduleStage?: string | null,
) => {
  if (!isContextualPortalQuestion(question, snapshotOrModuleTitle, moduleStage)) {
    return null;
  }

  const snapshot =
    typeof snapshotOrModuleTitle === 'string'
      ? ({
          moduleId: 'dashboard',
          moduleTitle: snapshotOrModuleTitle,
          moduleStage: moduleStage ?? null,
          visibleControls: [],
        } satisfies HelpContextSnapshot)
      : snapshotOrModuleTitle;
  if (!snapshot) return null;

  const screen = getScreenContextSummary(snapshot);
  if (!screen) return null;

  if (/\b(?:what's|whats|what is)\s+this\b/i.test(question)) {
    return [
      '1. Where you are',
      `You are on ${screen.title}${snapshot.moduleStage ? ` at ${snapshot.moduleStage}.` : '.'}`,
      '2. What this screen is for',
      screen.description,
      '3. What controls matter here',
      screen.visibleControls.length > 0 ? `Use ${screen.visibleControls.map((control) => `\`${control}\``).join(', ')}.` : 'Use the controls shown on this module.',
      '4. What to do next',
      ...(screen.nextSteps ?? ['Ask about the exact task you want to complete on this screen.']),
    ].join('\n');
  }

  if (/\bwhat do i press first\b/i.test(question) || /\bwhat do i click (?:now|here first|to start)\b/i.test(question)) {
    return [
      '1. Where to go',
      `Stay on ${screen.title}${snapshot.moduleStage ? ` at ${snapshot.moduleStage}.` : '.'}`,
      '2. What to do',
      `Click \`${buildCurrentScreenPrimaryAction(snapshot)}\` first.`,
      ...(screen.nextSteps ?? []),
      '3. What to check before saving',
      'Make sure the selected session, file, student row, or ticket is correct before any create, save, delete, overwrite, submit, or sync action.',
      '4. What to do next',
      'Ask for the next control after you finish the first step and I will continue from the current screen.',
    ].join('\n');
  }

  if (/\bwhat next\b|\bwhere do i go from here\b|\bwhat now\b|\bwhat should i click\b|\bwhat do i do here\b/i.test(question)) {
    return [
      '1. Where to go',
      `You are already on ${screen.title}${snapshot.moduleStage ? ` at ${snapshot.moduleStage}.` : '.'}`,
      '2. What to do',
      ...(screen.nextSteps ?? ['Use the current controls on this screen based on the task you are performing.']),
      '3. What to check before saving',
      'Verify the current target before any action that changes saved data.',
      '4. What to do next',
      'If you want a control-by-control answer, ask exactly what you are trying to finish on this screen.',
    ].join('\n');
  }

  return null;
};

const findExplicitModule = (question: string) => {
  const normalized = normalize(question);
  const match = MODULE_ALIASES.find((candidate) => candidate.aliases.some((alias) => normalized.includes(alias)));
  return match?.module ?? null;
};

const getActionModuleId = (action: HelpAssistantAction): TAHelpModuleId => {
  switch (action.type) {
    case 'open-module':
      return action.module;
    case 'switch-attendance-tab':
      return action.tab;
    case 'zoom-command':
      return 'zoom';
    case 'attendance-command':
      return 'attendance';
    case 'session-command':
      return 'sessions';
    case 'roster-command':
      return 'roster';
    case 'consolidated-command':
      return 'consolidated';
    case 'rule-exceptions-command':
      return 'exceptions';
    case 'issue-queue-command':
      return 'issues';
    case 'late-days-command':
      return 'late-days';
    case 'export-command':
      return 'export';
    case 'settings-command':
      return 'settings';
  }
};

const buildRememberedIntent = (
  action: HelpAssistantAction,
  overrides?: Partial<ResolvedConversationIntent>,
): ResolvedConversationIntent => {
  const moduleId = overrides?.moduleId ?? getActionModuleId(action);
  return {
    kind: overrides?.kind ?? 'module',
    moduleId,
    moduleTitle: overrides?.moduleTitle ?? getModuleName(moduleId),
    workflowId: overrides?.workflowId,
    entityQuery: overrides?.entityQuery ?? null,
    nextAction: overrides?.nextAction ?? action,
  };
};

const withRememberedIntent = (
  plan: HelpAssistantPlan | null,
  rememberedIntent?: ResolvedConversationIntent | null,
): HelpAssistantPlan | null => {
  if (!plan) {
    return null;
  }

  if (rememberedIntent !== undefined) {
    return {
      ...plan,
      rememberedIntent,
    };
  }

  if (!plan.action || plan.rememberedIntent) {
    return plan;
  }

  return {
    ...plan,
    rememberedIntent: buildRememberedIntent(plan.action),
  };
};

const buildWorkflowIntentPlan = (params: {
  workflowId: WorkflowIntentId;
  action: HelpAssistantAction;
  done: string[];
  missing?: string[];
  finalButton?: string | null;
  finalStepText?: string | null;
  entityQuery?: string | null;
}) =>
  withRememberedIntent(
    {
      action: params.action,
      response: buildPreparedResponse({
        done: params.done,
        missing: params.missing,
        finalButton: params.finalButton,
        finalStepText: params.finalStepText,
      }),
    },
    buildRememberedIntent(params.action, {
      kind: 'workflow',
      workflowId: params.workflowId,
      entityQuery: params.entityQuery ?? null,
    }),
  );

const buildFollowUpClarification = (snapshot?: HelpContextSnapshot | null) => {
  const defaults = ['Zoom Processor', 'Live Attendance', 'Session Management'];
  const currentModule =
    snapshot?.moduleTitle && defaults.includes(snapshot.moduleTitle)
      ? [snapshot.moduleTitle]
      : [];
  const options = [...new Set([...currentModule, ...defaults])];
  return `I need the target first. Do you want \`${options[0]}\`, \`${options[1]}\`, or \`${options[2]}\`?`;
};

const buildFollowUpResponse = (rememberedIntent: ResolvedConversationIntent, action: HelpAssistantAction) => {
  switch (rememberedIntent.workflowId) {
    case 'zoom-attendance':
      return buildPreparedResponse({
        done: ['Switched to `Zoom Processor`.'],
        missing: ['Make sure the session already exists before processing the Zoom CSV.'],
        finalStepText: 'Click `SELECT CSV` first. After processing the Zoom CSV, continue in `Live Attendance`.',
      });
    case 'attendance-penalties':
      return buildPreparedResponse({
        done: ['Switched to `Live Attendance`.'],
        missing: ['Select the session first if it is not already loaded.'],
        finalStepText: 'Use `Search Name or ERP` to find the student row, then update the naming penalty there.',
      });
    case 'roster-add-student':
      return buildPreparedResponse({
        done: ['Opened `Roster Management` and continued the `Add Student` flow.'],
        finalButton: 'Add to Roster',
      });
    case 'mark-warned':
      return buildPreparedResponse({
        done: ['Opened `Rule Exceptions` and continued the warned-tracker flow.'],
        missing: rememberedIntent.entityQuery ? ['Confirm the matched student row before applying the warning.'] : ['I still need the student ERP or name.'],
        finalStepText: rememberedIntent.entityQuery
          ? 'Use the filtered tracker result and apply `Warned` if the row is correct.'
          : 'Tell me the student ERP or name so I can continue the warned flow.',
      });
    default:
      return buildActionResultMessage(action);
  }
};

const buildModuleOpenPlan = (module: TAHelpModuleId, note?: string): HelpAssistantPlan => ({
  action: module === 'zoom' || module === 'attendance'
    ? { type: 'switch-attendance-tab', tab: module }
    : { type: 'open-module', module },
  response: buildPreparedResponse({
    done: [`Opened \`${getModuleName(module)}\`.`],
    finalButton: null,
    note: note ?? null,
  }),
});

const buildSearchOrMissingResponse = (module: TAHelpModuleId, prompt: string) =>
  buildPreparedResponse({
    done: [`Opened \`${getModuleName(module)}\`.`],
    missing: [prompt],
    finalButton: null,
  });

const parseModuleNavigationPlan = (question: string): HelpAssistantPlan | null => {
  if (!DIRECT_ACTION_PREFIX.test(question)) return null;
  const explicitModule = findExplicitModule(question);
  if (!explicitModule) return null;
  if (explicitModule === 'zoom' || explicitModule === 'attendance') {
    return {
      action: { type: 'switch-attendance-tab', tab: explicitModule },
      response: buildPreparedResponse({
        done: [`Switched to \`${getModuleName(explicitModule)}\`.`],
        finalButton: null,
      }),
    };
  }
  return buildModuleOpenPlan(explicitModule);
};

const parseFollowUpPlan = (
  question: string,
  snapshot?: HelpContextSnapshot | null,
  rememberedIntent?: ResolvedConversationIntent | null,
): HelpAssistantPlan | null => {
  if (!FOLLOW_UP_ACTION_PATTERN.test(question)) {
    return null;
  }

  if (!rememberedIntent?.nextAction) {
    return {
      action: null,
      response: buildFollowUpClarification(snapshot),
      rememberedIntent: null,
    };
  }

  return {
    action: rememberedIntent.nextAction,
    response: buildFollowUpResponse(rememberedIntent, rememberedIntent.nextAction),
    rememberedIntent,
  };
};

const parseWorkflowIntentPlan = (
  question: string,
  snapshot?: HelpContextSnapshot | null,
): HelpAssistantPlan | null => {
  const normalized = normalize(question);
  if (!WORKFLOW_INTENT_PREFIX.test(question)) {
    return null;
  }

  if (
    (/zoom/.test(normalized) && /attendance/.test(normalized)) ||
    /mark attendance from zoom|process zoom attendance/.test(normalized)
  ) {
    return buildWorkflowIntentPlan({
      workflowId: 'zoom-attendance',
      action: { type: 'switch-attendance-tab', tab: 'zoom' },
      done: ['Switched to `Zoom Processor`.'],
      missing: ['Make sure the session already exists before processing the Zoom CSV.'],
      finalStepText: 'Click `SELECT CSV` first. After processing the Zoom CSV, continue in `Live Attendance`.',
    });
  }

  if (/fix penalties|fix penalty|naming penalties|naming penalty/.test(normalized)) {
    return buildWorkflowIntentPlan({
      workflowId: 'attendance-penalties',
      action: { type: 'switch-attendance-tab', tab: 'attendance' },
      done: ['Switched to `Live Attendance`.'],
      missing: ['Select the session first if it is not already loaded.'],
      finalStepText: 'Use `Search Name or ERP` to find the student row, then update the naming penalty there.',
    });
  }

  if (/add\s+(?:a\s+)?student|new student|student to roster/.test(normalized)) {
    const rosterPlan = parseRosterPlan(question, snapshot);
    return withRememberedIntent(
      rosterPlan,
      rosterPlan?.action
        ? buildRememberedIntent(rosterPlan.action, {
            kind: 'workflow',
            workflowId: 'roster-add-student',
            entityQuery: extractErp(question) ?? sanitizeNamedEntity(extractNamedEntity(question)),
          })
        : null,
    );
  }

  if (/\bmark\b.*\bwarned\b|\bwarn(?:ed)?\b/.test(normalized)) {
    const warningPlan = parseWarningPlan(question);
    return withRememberedIntent(
      warningPlan,
      warningPlan?.action
        ? buildRememberedIntent(warningPlan.action, {
            kind: 'workflow',
            workflowId: 'mark-warned',
            entityQuery: extractErp(question) ?? sanitizeNamedEntity(extractNamedEntity(question)),
          })
        : null,
    );
  }

  return null;
};

const parseSessionPlan = (question: string): HelpAssistantPlan | null => {
  const normalized = normalize(question);
  if (!/\bsession\b/.test(normalized) || !includesAny(normalized, ['create', 'make', 'prepare', 'set up', 'setup', 'new'])) {
    return null;
  }

  if (!/\btoday\b/.test(normalized)) {
    return {
      action: {
        type: 'session-command',
        command: {
          kind: 'prepare-create-session',
          selectedDate: new Date().toISOString().slice(0, 10),
          sessionNumberStrategy: 'next',
          focusField: 'start-time',
        },
      },
      response: buildPreparedResponse({
        done: [
          'Opened `Session Management`.',
          'Prepared the create-session form with the next available session number.',
        ],
        missing: ['Tell me the session date if you do not want today.'],
        finalButton: 'Create Session',
      }),
    };
  }

  return {
    action: {
      type: 'session-command',
      command: {
        kind: 'prepare-create-session',
        selectedDate: new Date().toISOString().slice(0, 10),
        sessionNumberStrategy: 'next',
        focusField: 'start-time',
      },
    },
    response: buildPreparedResponse({
      done: [
        'Opened `Session Management`.',
        'Filled today’s date.',
        'Prepared the next available session number automatically.',
        'Focused the next missing time field so you can continue.',
      ],
      finalButton: 'Create Session',
    }),
  };
};

const parseRosterPlan = (question: string, snapshot?: HelpContextSnapshot | null): HelpAssistantPlan | null => {
  const normalized = normalize(question);

  if (/add\s+(?:a\s+)?student|new student|where i can add a student|add .* to roster|student to roster/.test(normalized)) {
    const studentName = sanitizeNamedEntity(extractNamedEntity(question));
    const erp = extractErp(question);
    const classNo = extractClassNo(question);
    const missing: string[] = [];
    if (!studentName) missing.push('I still need the student name.');
    if (!erp) missing.push('I still need the ERP.');
    if (!classNo) missing.push('I still need the class code.');

    return {
      action: {
        type: 'roster-command',
        command: {
          kind: 'open-add-student',
          student: {
            student_name: studentName ?? undefined,
            erp: erp ?? undefined,
            class_no: classNo ?? undefined,
          },
          focusField: !studentName ? 'student_name' : !erp ? 'erp' : !classNo ? 'class_no' : 'student_name',
        },
      },
      response: buildPreparedResponse({
        done: ['Opened `Roster Management`.', 'Opened the `Add Student` dialog.', ...(studentName ? [`Filled the student name with \`${studentName}\`.`] : []), ...(erp ? [`Filled the ERP with \`${erp}\`.`] : []), ...(classNo ? [`Filled the class code with \`${classNo}\`.`] : [])],
        missing,
        finalButton: 'Add to Roster',
      }),
    };
  }

  if (/edit student|update student/.test(normalized)) {
    const query = extractErp(question) ?? sanitizeNamedEntity(extractNamedEntity(question));
    if (!query) {
      return {
        action: { type: 'roster-command', command: { kind: 'search', query: '' } },
        response: buildSearchOrMissingResponse('roster', 'Tell me the student ERP or name so I can prepare the edit dialog.'),
      };
    }

    return {
      action: { type: 'roster-command', command: { kind: 'open-edit-student', query } },
      response: buildPreparedResponse({
        done: ['Opened `Roster Management`.', `Searched the roster for \`${query}\`.`, 'If there is a unique match, the edit dialog will open automatically.'],
        missing: ['If multiple students match, refine the request with the ERP or class code.'],
        finalButton: 'Confirm Updates',
      }),
    };
  }

  if (/delete student|remove student/.test(normalized)) {
    const query = extractErp(question) ?? sanitizeNamedEntity(extractNamedEntity(question));
    if (!query) {
      return {
        action: { type: 'roster-command', command: { kind: 'search', query: '' } },
        response: buildSearchOrMissingResponse('roster', 'Tell me the student ERP or name so I can prepare the delete confirmation.'),
      };
    }

    return {
      action: { type: 'roster-command', command: { kind: 'prepare-delete-student', query } },
      response: buildPreparedResponse({
        done: ['Opened `Roster Management`.', `Searched the roster for \`${query}\`.`, 'If there is a unique match, the delete confirmation will open automatically.'],
        missing: ['If multiple students match, refine the request with the ERP.'],
        finalButton: 'Delete',
      }),
    };
  }

  if (/search roster|find student|show .*student/.test(normalized) && !snapshot?.moduleTitle.includes('Issue')) {
    const query = extractErp(question) ?? sanitizeNamedEntity(extractNamedEntity(question)) ?? extractQuotedText(question);
    if (!query) return null;
    return {
      action: { type: 'roster-command', command: { kind: 'search', query } },
      response: buildPreparedResponse({
        done: ['Opened `Roster Management`.', `Filled the roster search with \`${query}\`.`],
        finalButton: null,
      }),
    };
  }

  return null;
};

const parseWarningPlan = (question: string): HelpAssistantPlan | null => {
  const normalized = normalize(question);
  if (!/\bwarn|warning\b/.test(normalized)) return null;

  const query = extractErp(question) ?? sanitizeNamedEntity(extractNamedEntity(question));
  if (!query) {
    return {
      action: { type: 'rule-exceptions-command', command: { kind: 'search-tracker', query: '' } },
      response: buildSearchOrMissingResponse('exceptions', 'Tell me the student ERP or name so I can search the camera tracker.'),
    };
  }

  if (/clear\b/.test(normalized) || /\bunwarn\b/.test(normalized)) {
    return {
      action: { type: 'rule-exceptions-command', command: { kind: 'clear-warning', query } },
      response: buildPreparedResponse({
        done: ['Opened `Rule Exceptions`.', `Filled the camera tracker search with \`${query}\`.`, 'If there is a unique tracker match, the warning will be cleared automatically.'],
        missing: ['If multiple students match, refine the request with the ERP.'],
        finalButton: null,
      }),
    };
  }

  return {
    action: { type: 'rule-exceptions-command', command: { kind: 'mark-warned', query } },
    response: buildPreparedResponse({
      done: ['Opened `Rule Exceptions`.', `Filled the camera tracker search with \`${query}\`.`, 'If there is a unique tracker match, `Warned` will be applied automatically.'],
      missing: ['If multiple students match, refine the request with the ERP.'],
      finalButton: null,
    }),
  };
};

const parseIssuePlan = (question: string): HelpAssistantPlan | null => {
  const normalized = normalize(question);
  if (!/\bticket|issue|issues\b/.test(normalized) && !/grading query|penalty issue|absence issue|class issue/.test(normalized)) {
    return null;
  }

  if (/grading/.test(normalized)) {
    return {
      action: { type: 'issue-queue-command', command: { kind: 'filter', group: 'grading_query', status: 'all' } },
      response: buildPreparedResponse({
        done: ['Opened `Issue Queue`.', 'Prepared the ticket filters for grading queries.'],
        finalButton: null,
      }),
    };
  }

  if (/penalt/.test(normalized)) {
    return {
      action: { type: 'issue-queue-command', command: { kind: 'filter', group: 'penalty_query', status: 'all' } },
      response: buildPreparedResponse({
        done: ['Opened `Issue Queue`.', 'Prepared the ticket filters for penalty queries.'],
        finalButton: null,
      }),
    };
  }

  if (/absence/.test(normalized)) {
    return {
      action: { type: 'issue-queue-command', command: { kind: 'filter', group: 'absence_query', status: 'all' } },
      response: buildPreparedResponse({
        done: ['Opened `Issue Queue`.', 'Prepared the ticket filters for absence queries.'],
        finalButton: null,
      }),
    };
  }

  if (/resolve ticket|reopen ticket|escalate/.test(normalized)) {
    const query = extractErp(question) ?? sanitizeNamedEntity(extractNamedEntity(question));
    if (!query) {
      return {
        action: { type: 'issue-queue-command', command: { kind: 'filter', status: 'pending', group: 'all' } },
        response: buildSearchOrMissingResponse('issues', 'Tell me the student ERP or name so I can prepare the correct ticket.'),
      };
    }

    if (/escalate/.test(normalized)) {
      return {
        action: { type: 'issue-queue-command', command: { kind: 'prepare-escalate-ticket', query } },
        response: buildPreparedResponse({
          done: ['Opened `Issue Queue`.', `Searched for the ticket using \`${query}\`.`, 'If there is a unique match, the ticket sheet will open and the escalation control will be ready.'],
          missing: ['If multiple tickets match, refine the request with the ERP or category.'],
          finalButton: 'Escalate to Exception',
        }),
      };
    }

    return {
      action: { type: 'issue-queue-command', command: { kind: 'prepare-resolve-ticket', query } },
      response: buildPreparedResponse({
        done: ['Opened `Issue Queue`.', `Searched for the ticket using \`${query}\`.`, 'If there is a unique match, the ticket sheet will open and the status action will be ready.'],
        missing: ['If multiple tickets match, refine the request with the ERP or category.'],
        finalButton: 'Resolve Ticket',
      }),
    };
  }

  return {
    action: { type: 'open-module', module: 'issues' },
    response: buildPreparedResponse({
      done: ['Opened `Issue Queue`.'],
      finalButton: null,
    }),
  };
};

const parseLateDaysPlan = (question: string): HelpAssistantPlan | null => {
  const normalized = normalize(question);
  if (!/\blate day|late days|claim\b/.test(normalized)) return null;

  if (/grant|add/.test(normalized)) {
    const query = extractErp(question) ?? sanitizeNamedEntity(extractNamedEntity(question));
    const days = extractDaysValue(question) ?? '1';
    if (!query) {
      return {
        action: { type: 'late-days-command', command: { kind: 'search-student', query: '' } },
        response: buildSearchOrMissingResponse('late-days', 'Tell me the student ERP or name so I can prepare the late-day grant dialog.'),
      };
    }

    return {
      action: { type: 'late-days-command', command: { kind: 'open-grant-dialog', query, days, reason: null ?? undefined } },
      response: buildPreparedResponse({
        done: ['Opened `Late Days`.', `Searched the roster balances for \`${query}\`.`, `Prepared the grant dialog with \`${days}\` late day${days === '1' ? '' : 's'}.`],
        missing: ['Add a reason if you want it recorded before the final grant click.'],
        finalButton: 'Grant Late Day',
      }),
    };
  }

  return {
    action: { type: 'open-module', module: 'late-days' },
    response: buildPreparedResponse({
      done: ['Opened `Late Days`.'],
      finalButton: null,
    }),
  };
};

const parseSettingsPlan = (question: string): HelpAssistantPlan | null => {
  const normalized = normalize(question);

  if (/add (?:a )?(?:ta|teaching assistant)/.test(normalized)) {
    const email = extractEmail(question);
    return {
      action: { type: 'settings-command', command: { kind: 'prefill-add-ta', email: email ?? undefined } },
      response: buildPreparedResponse({
        done: ['Opened `Lists & Settings`.', 'Focused the `TA Management` section.', ...(email ? [`Filled the TA email with \`${email}\`.`] : [])],
        missing: email ? [] : ['I still need the TA email address.'],
        finalButton: 'Add',
      }),
    };
  }

  if (/add submission|add assignment|new submission/.test(normalized)) {
    const label = extractQuotedText(question) ?? question.match(/\b(?:called|named)\s+([a-z0-9][a-z0-9\s-]{1,60})$/i)?.[1] ?? null;
    return {
      action: { type: 'settings-command', command: { kind: 'prefill-submission', submissionLabel: label ?? undefined } },
      response: buildPreparedResponse({
        done: ['Opened `Lists & Settings`.', 'Focused the `Submission List` section.', ...(label ? [`Filled the submission label with \`${label.trim()}\`.`] : [])],
        missing: label ? [] : ['I still need the submission label.'],
        finalButton: 'Add',
      }),
    };
  }

  return null;
};

const parseConsolidatedPlan = (question: string): HelpAssistantPlan | null => {
  const normalized = normalize(question);
  if (!/consolidated|attendance table|sync sheet|search attendance/.test(normalized)) return null;

  const query = extractErp(question) ?? sanitizeNamedEntity(extractNamedEntity(question)) ?? extractQuotedText(question);
  if (/search|find|show/.test(normalized) && query) {
    return {
      action: { type: 'consolidated-command', command: { kind: 'search', query } },
      response: buildPreparedResponse({
        done: ['Opened `Consolidated View`.', `Filled the table search with \`${query}\`.`],
        finalButton: null,
      }),
    };
  }

  if (/sync/.test(normalized)) {
    return {
      action: { type: 'consolidated-command', command: { kind: 'focus-sync' } },
      response: buildPreparedResponse({
        done: ['Opened `Consolidated View`.', 'Moved you to the `Sync Sheet` control.'],
        finalButton: 'Sync Sheet',
      }),
    };
  }

  return {
    action: { type: 'open-module', module: 'consolidated' },
    response: buildPreparedResponse({
      done: ['Opened `Consolidated View`.'],
      finalButton: null,
    }),
  };
};

const parseExportPlan = (question: string): HelpAssistantPlan | null => {
  const normalized = normalize(question);
  if (!/download csv|export csv|export attendance|download attendance/.test(normalized)) return null;
  return {
    action: { type: 'export-command', command: { kind: 'download-csv' } },
    response: buildPreparedResponse({
      done: ['Opened `Export Data`.', 'Triggered the CSV export directly.'],
      finalButton: null,
    }),
  };
};

const parseZoomPlan = (question: string): HelpAssistantPlan | null => {
  const normalized = normalize(question);
  if (/select csv|upload csv|choose csv|process zoom|start zoom|open zoom/.test(normalized)) {
    return {
      action: { type: 'zoom-command', command: { kind: 'focus-upload', focusControl: 'select-csv' } },
      response: buildPreparedResponse({
        done: ['Switched to `Zoom Processor`.', 'Focused the CSV upload control.'],
        missing: ['Choose the Zoom CSV file yourself in the browser file picker.'],
        finalButton: null,
      }),
    };
  }

  if (/calculate attendance|analyze matrix/.test(normalized)) {
    return {
      action: {
        type: 'zoom-command',
        command: {
          kind: 'focus-upload',
          focusControl: /analyze matrix/.test(normalized) ? 'analyze' : 'calculate',
        },
      },
      response: buildPreparedResponse({
        done: ['Switched to `Zoom Processor`.', `Focused the \`${/analyze matrix/.test(normalized) ? 'Analyze Matrix' : 'Calculate Attendance'}\` control.`],
        finalButton: null,
      }),
    };
  }

  return null;
};

const parseAttendancePlan = (question: string): HelpAssistantPlan | null => {
  const normalized = normalize(question);

  if (/fix penalties|naming penalty|penalties/.test(normalized) && /place|where|fix|review|mark/.test(normalized)) {
    return {
      action: { type: 'switch-attendance-tab', tab: 'attendance' },
      response: buildPreparedResponse({
        done: ['Switched to `Live Attendance`.'],
        missing: ['Select the session first if it is not already selected, then search for the student row you want to update.'],
        finalButton: null,
      }),
    };
  }

  if (/sync to sheet/.test(normalized)) {
    return {
      action: { type: 'attendance-command', command: { kind: 'prepare-sync' } },
      response: buildPreparedResponse({
        done: ['Switched to `Live Attendance`.', 'Prepared the `Sync to Sheet` control.'],
        finalButton: 'Sync to Sheet',
      }),
    };
  }

  if (/submit attendance|mark attendance/.test(normalized)) {
    const sessionNumber = extractInteger(question, /session\s+#?(\d+)/i);
    return {
      action: {
        type: 'attendance-command',
        command: {
          kind: sessionNumber ? 'select-session' : 'prepare-submit',
          sessionNumber: sessionNumber ?? undefined,
        },
      },
      response: buildPreparedResponse({
        done: ['Switched to `Live Attendance`.', ...(sessionNumber ? [`Prepared the session selector for session \`${sessionNumber}\`.`] : [])],
        missing: sessionNumber ? ['Paste the absent ERP list if that field is still empty.'] : ['Tell me the session number if you want me to preselect it.'],
        finalButton: 'Submit Attendance',
      }),
    };
  }

  return null;
};

const parseDirectSemanticPlan = (question: string, snapshot?: HelpContextSnapshot | null): HelpAssistantPlan | null => {
  return withRememberedIntent(
    parseWarningPlan(question) ??
    parseSessionPlan(question) ??
    parseRosterPlan(question, snapshot) ??
    parseIssuePlan(question) ??
    parseLateDaysPlan(question) ??
    parseSettingsPlan(question) ??
    parseConsolidatedPlan(question) ??
    parseExportPlan(question) ??
    parseZoomPlan(question) ??
    parseAttendancePlan(question) ??
    parseModuleNavigationPlan(question),
  );
};

export const planHelpAssistantAction = (
  question: string,
  snapshot?: HelpContextSnapshot | null,
  rememberedIntent?: ResolvedConversationIntent | null,
): HelpAssistantPlan | null => {
  if (/^(how|what|where|why|when)\b/i.test(normalize(question)) && !DIRECT_ACTION_PREFIX.test(question)) {
    return null;
  }

  return withRememberedIntent(
    parseFollowUpPlan(question, snapshot, rememberedIntent) ??
      parseWorkflowIntentPlan(question, snapshot) ??
      parseDirectSemanticPlan(question, snapshot),
  );
};

export const buildActionResultMessage = (action: HelpAssistantAction) => {
  switch (action.type) {
    case 'open-module':
      return buildPreparedResponse({
        done: [`Opened \`${getModuleName(action.module)}\`.`],
        finalButton: null,
      });
    case 'switch-attendance-tab':
      return buildPreparedResponse({
        done: [`Switched to \`${action.tab === 'zoom' ? 'Zoom Processor' : 'Live Attendance'}\`.`],
        finalButton: null,
      });
    case 'zoom-command':
      return buildPreparedResponse({
        done: ['Switched to `Zoom Processor`.'],
        finalButton: action.command.focusControl === 'calculate' ? 'Calculate Attendance' : null,
      });
    case 'attendance-command':
      return buildPreparedResponse({
        done: ['Switched to `Live Attendance`.'],
        finalButton: action.command.kind === 'prepare-submit' ? 'Submit Attendance' : action.command.kind === 'prepare-sync' ? 'Sync to Sheet' : null,
      });
    case 'session-command':
      return buildPreparedResponse({
        done: ['Opened `Session Management`.'],
        finalButton: 'Create Session',
      });
    case 'roster-command':
      return buildPreparedResponse({
        done: ['Opened `Roster Management`.'],
        finalButton:
          action.command.kind === 'open-add-student'
            ? 'Add to Roster'
            : action.command.kind === 'open-edit-student'
              ? 'Confirm Updates'
              : action.command.kind === 'prepare-delete-student'
                ? 'Delete'
                : action.command.kind === 'prepare-bulk-roster'
                  ? 'Confirm Replacement'
                  : null,
      });
    case 'consolidated-command':
      return buildPreparedResponse({
        done: ['Opened `Consolidated View`.'],
        finalButton: action.command.kind === 'focus-sync' ? 'Sync Sheet' : null,
      });
    case 'rule-exceptions-command':
      return buildPreparedResponse({
        done: ['Opened `Rule Exceptions`.'],
        finalButton: action.command.kind === 'open-add-exception' ? 'Save' : action.command.kind === 'prepare-delete-exception' ? 'Delete' : null,
      });
    case 'issue-queue-command':
      return buildPreparedResponse({
        done: ['Opened `Issue Queue`.'],
        finalButton:
          action.command.kind === 'prepare-resolve-ticket'
            ? 'Resolve Ticket'
            : action.command.kind === 'prepare-escalate-ticket'
              ? 'Escalate to Exception'
              : action.command.kind === 'prepare-delete-ticket'
                ? 'Delete'
                : null,
      });
    case 'late-days-command':
      return buildPreparedResponse({
        done: ['Opened `Late Days`.'],
        finalButton:
          action.command.kind === 'open-grant-dialog'
            ? 'Grant Late Day'
            : action.command.kind === 'prepare-create-assignment'
              ? 'Create Assignment'
              : action.command.kind === 'prepare-archive-assignment'
                ? 'Archive'
                : action.command.kind === 'prepare-delete-claim'
                  ? 'Delete Claim'
                  : null,
      });
    case 'export-command':
      return buildPreparedResponse({
        done: ['Opened `Export Data` and triggered the CSV export.'],
        finalButton: null,
      });
    case 'settings-command':
      return buildPreparedResponse({
        done: ['Opened `Lists & Settings`.'],
        finalButton:
          action.command.kind === 'prefill-add-ta'
            ? 'Add'
            : action.command.kind === 'prefill-submission'
              ? 'Add'
              : action.command.kind === 'prefill-password'
                ? 'Update Password'
                : action.command.kind === 'prefill-test-student'
                  ? 'Save Test Student Overrides'
                  : null,
      });
  }
};
