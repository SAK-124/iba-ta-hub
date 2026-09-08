import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ta/ui/button';
import { Textarea } from '@/components/ta/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ta/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ta/ui/card';
import { Input } from '@/components/ta/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ta/ui/table';
import { Badge } from '@/components/ta/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ta/ui/alert-dialog';
import { toast } from 'sonner';
import {
  emitAttendanceDataUpdated,
  subscribeAttendanceDataUpdated,
  subscribeRosterDataUpdated,
} from '@/lib/data-sync-events';
import { Loader2, Save } from 'lucide-react';
import { sendNtfyNotification } from '@/lib/ntfy';
import { useAuth } from '@/lib/auth';
import { useStaleRefreshOnFocus } from '@/hooks/use-stale-refresh-on-focus';
import { useRefreshController } from '@/hooks/use-refresh-controller';
import { STUDENT_SERIAL_CLASS, STUDENT_SERIAL_HEADER } from '@/lib/student-table';
import { removeRealtimeChannel, subscribeToRealtimeTables } from '@/lib/realtime-table-subscriptions';
import { readScopedSessionStorage, writeScopedSessionStorage } from '@/lib/scoped-session-storage';
import type { ZoomSessionReport } from '@/lib/zoom-session-report';
import { buildZoomAttendanceDraft, type AttendanceDraftRow, zoomReportMatchesSession } from '@/lib/zoom-attendance-draft';
import type {
  AgentCommandEnvelope,
  AttendanceAgentCommand,
  HelpContextSnapshot,
} from '@/lib/ta-help-actions';
import {
  deleteAttendanceBySession,
  insertAttendance,
  listAttendanceBySession,
  listRoster,
  listSessions,
  updateAttendancePenalty,
  updateAttendanceStatus,
  updateSessionZoomReport,
  upsertAttendance,
  type AttendanceInsert,
  type AttendanceRowWithRoster as AttendanceRow,
  type AttendanceStatus,
  type RosterRow,
  type SessionRow,
} from '@/features/attendance';
import { syncPublicAttendance } from '@/features/public-attendance';

type AttendanceFilterToken = 'present' | 'absent' | 'penalized';

const AUTO_SYNC_DELAY_MS = 1200;
const TA_STORAGE_SCOPE = 'ta';
const ATTENDANCE_MARKING_STORAGE_KEY = 'module-attendance-marking';

interface AttendanceMarkingProps {
  latestFinalZoomReport?: ZoomSessionReport | null;
  onContextChange?: (context: string | null) => void;
  onHelpContextChange?: (snapshot: Partial<HelpContextSnapshot>) => void;
  agentCommand?: AgentCommandEnvelope<AttendanceAgentCommand> | null;
  onAgentCommandHandled?: () => void;
}

interface PersistedAttendanceMarkingState {
  selectedSessionId: string;
  absentErps: string;
  searchQuery: string;
  activeFilters: AttendanceFilterToken[];
}

export default function AttendanceMarking({
  latestFinalZoomReport = null,
  onContextChange,
  onHelpContextChange,
  agentCommand = null,
  onAgentCommandHandled,
}: AttendanceMarkingProps) {
  const { user } = useAuth();
  const userEmail = user?.email ?? null;
  const persistedState = readScopedSessionStorage<PersistedAttendanceMarkingState>(
    TA_STORAGE_SCOPE,
    userEmail,
    ATTENDANCE_MARKING_STORAGE_KEY,
    {
      selectedSessionId: '',
      absentErps: '',
      searchQuery: '',
      activeFilters: [],
    },
  );
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState(persistedState.selectedSessionId);
  const [absentErps, setAbsentErps] = useState(persistedState.absentErps);

  const [attendanceData, setAttendanceData] = useState<AttendanceRow[]>([]);
  const [draftAttendance, setDraftAttendance] = useState<AttendanceDraftRow[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showOverwriteAlert, setShowOverwriteAlert] = useState(false);

  const [searchQuery, setSearchQuery] = useState(persistedState.searchQuery);
  const [activeFilters, setActiveFilters] = useState<Set<AttendanceFilterToken>>(
    () => new Set(persistedState.activeFilters),
  );

  useEffect(() => {
    if (latestFinalZoomReport?.session_id) {
      setSelectedSessionId(latestFinalZoomReport.session_id);
    }
  }, [latestFinalZoomReport?.session_id]);

  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markRefreshedRef = useRef<() => void>(() => {});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const absentErpsTextareaRef = useRef<HTMLTextAreaElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const syncButtonRef = useRef<HTMLButtonElement>(null);
  const lastHandledAgentCommandTokenRef = useRef<number | null>(null);

  const { requestRefresh, isUpdating } = useRefreshController(async (mode) => {
    await fetchSessions();
    const latestRoster = await fetchRoster();
    if (selectedSessionId) await fetchAttendance(selectedSessionId, latestRoster, mode === 'initial' ? 'initial' : 'silent');
  }, Boolean(selectedSessionId));

  useEffect(() => {
    void fetchSessions();
    void fetchRoster();

    return () => {
      if (autoSyncTimerRef.current) {
        clearTimeout(autoSyncTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (selectedSessionId) {
      void (async () => {
        const latestRoster = roster.length > 0 ? roster : await fetchRoster();
        await fetchAttendance(selectedSessionId, latestRoster, 'initial');
      })();
      return;
    }

    setAttendanceData([]);
    setDraftAttendance([]);
  }, [selectedSessionId]);

  useEffect(() => {
    if (
      !latestFinalZoomReport ||
      !selectedSessionId ||
      !zoomReportMatchesSession(latestFinalZoomReport, selectedSessionId) ||
      attendanceData.length > 0 ||
      roster.length === 0
    ) {
      if (attendanceData.length > 0 || !latestFinalZoomReport) setDraftAttendance([]);
      return;
    }

    setDraftAttendance(
      buildZoomAttendanceDraft(
        latestFinalZoomReport,
        roster.map((student) => ({ erp: student.erp, student_name: student.student_name, class_no: student.class_no })),
        selectedSessionId,
      ),
    );
  }, [attendanceData.length, latestFinalZoomReport, roster, selectedSessionId]);

  useEffect(() => {
    const stageLabel = !selectedSessionId
      ? 'Live Attendance · selecting session'
      : isSaving
        ? 'Live Attendance · saving attendance'
        : absentErps.trim()
          ? 'Live Attendance · reviewing absent ERP list'
          : `Live Attendance · reviewing session ${selectedSessionId}`;

    onContextChange?.(stageLabel);
  }, [absentErps, isSaving, onContextChange, selectedSessionId]);

  useEffect(() => {
    onHelpContextChange?.({
      openSurface: showOverwriteAlert ? 'overwrite attendance confirmation' : 'attendance table',
      screenDescription: 'Select a session, paste absent ERPs, and review the attendance table before syncing.',
      visibleControls: ['Select Session', 'Absent ERPs', 'Submit Attendance', 'Sync to Sheet', 'Search Name or ERP'],
      searchQuery,
      filters: {
        present: String(activeFilters.has('present')),
        absent: String(activeFilters.has('absent')),
        penalized: String(activeFilters.has('penalized')),
      },
      actionTargets: (attendanceData.length > 0 ? attendanceData : draftAttendance).slice(0, 150).map((record) => ({
        kind: 'student' as const,
        id: record.id,
        label: record.student_name,
        aliases: [record.erp, record.class_no],
        meta: {
          erp: record.erp,
          class_no: record.class_no,
          status: record.status,
          naming_penalty: record.naming_penalty,
        },
      })),
    });
  }, [activeFilters, attendanceData, draftAttendance, onHelpContextChange, searchQuery, showOverwriteAlert]);

  useEffect(() => {
    const unsubscribe = subscribeRosterDataUpdated(() => {
      void requestRefresh('background');
    });

    return unsubscribe;
  }, [requestRefresh]);

  useEffect(() => {
    const unsubscribeAttendance = subscribeAttendanceDataUpdated(() => {
      if (!selectedSessionId) {
        return;
      }

      void requestRefresh('background');
    });

    return unsubscribeAttendance;
  }, [requestRefresh, selectedSessionId]);

  useEffect(() => {
    writeScopedSessionStorage(TA_STORAGE_SCOPE, userEmail, ATTENDANCE_MARKING_STORAGE_KEY, {
      selectedSessionId,
      absentErps,
      searchQuery,
      activeFilters: Array.from(activeFilters),
    });
  }, [absentErps, activeFilters, searchQuery, selectedSessionId, userEmail]);

  useEffect(() => {
    if (!agentCommand) {
      return;
    }

    if (lastHandledAgentCommandTokenRef.current === agentCommand.token) {
      return;
    }

    lastHandledAgentCommandTokenRef.current = agentCommand.token;

    switch (agentCommand.command.kind) {
      case 'select-session': {
        const session = sessions.find((item) => item.session_number === agentCommand.command.sessionNumber);
        if (session) {
          setSelectedSessionId(session.id);
        }
        break;
      }
      case 'prefill-absent-erps':
        setAbsentErps(agentCommand.command.erpText ?? '');
        window.setTimeout(() => absentErpsTextareaRef.current?.focus(), 0);
        break;
      case 'search':
      case 'focus-student':
        setSearchQuery(agentCommand.command.query ?? '');
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
        break;
      case 'filter':
        setActiveFilters(new Set(agentCommand.command.filters ?? []));
        break;
      case 'prepare-submit':
        window.setTimeout(() => submitButtonRef.current?.focus(), 0);
        break;
      case 'prepare-sync':
        window.setTimeout(() => syncButtonRef.current?.focus(), 0);
        break;
    }

    onAgentCommandHandled?.();
  }, [agentCommand, onAgentCommandHandled, sessions]);

  const fetchSessions = async () => {
    try {
      const data = await listSessions();
      setSessions((data || []) as SessionRow[]);
      markRefreshedRef.current();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to load sessions: ${message}`);
      return;
    }
  };

  const fetchRoster = async (): Promise<RosterRow[]> => {
    try {
      const nextRoster = await listRoster();
      setRoster(nextRoster);
      markRefreshedRef.current();
      return nextRoster;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to load roster: ${message}`);
      return [];
    }
  };

  const loadSessionAttendanceRows = async (sessionId: string) => {
    try {
      const rows = await listAttendanceBySession(sessionId);
      return { rows, error: null };
    } catch (error: unknown) {
      return { rows: [] as AttendanceRow[], error };
    }
  };

  const backfillMissingRosterRowsForSession = async (
    sessionId: string,
    rows: AttendanceRow[],
    rosterRows: RosterRow[]
  ) => {
    // Preserve "marked sessions only" behavior: skip empty sessions.
    if (rows.length === 0 || rosterRows.length === 0) {
      return false;
    }

    const existingErps = new Set(rows.map((row) => row.erp));
    const missingStudents = rosterRows.filter((student) => !existingErps.has(student.erp));

    if (missingStudents.length === 0) {
      return false;
    }

    const payload: AttendanceInsert[] = missingStudents.map((student) => ({
      session_id: sessionId,
      erp: student.erp,
      status: 'absent',
      naming_penalty: false,
    }));

    try {
      await upsertAttendance(payload);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to backfill missing students: ${message}`);
      return false;
    }

    return true;
  };

  const fetchAttendance = async (
    sessionId: string,
    rosterOverride?: RosterRow[],
    mode: 'initial' | 'silent' = 'initial',
  ) => {
    const shouldShowLoader = mode === 'initial' && attendanceData.length === 0;
    if (shouldShowLoader) {
      setIsLoading(true);
    }
    try {
      const rosterRows =
        rosterOverride && rosterOverride.length > 0
          ? rosterOverride
          : roster.length > 0
            ? roster
            : await fetchRoster();

      const initialResult = await loadSessionAttendanceRows(sessionId);
      if (initialResult.error) {
        toast.error(`Failed to load attendance: ${initialResult.error.message}`);
        if (shouldShowLoader) {
          setAttendanceData([]);
        }
        return;
      }

      let nextRows = initialResult.rows;
      const didBackfill = await backfillMissingRosterRowsForSession(sessionId, nextRows, rosterRows);

      if (didBackfill) {
        emitAttendanceDataUpdated('attendance_marking_auto_backfill');
        scheduleCanonicalSync('attendance_marking_auto_backfill');

        const refreshedResult = await loadSessionAttendanceRows(sessionId);
        if (refreshedResult.error) {
          toast.error(`Failed to refresh attendance: ${refreshedResult.error.message}`);
        } else {
          nextRows = refreshedResult.rows;
        }
      }

      setAttendanceData(nextRows);
      markRefreshedRef.current();
    } finally {
      if (shouldShowLoader) {
        setIsLoading(false);
      }
    }
  };

  const scheduleCanonicalSync = (source: string) => {
    if (autoSyncTimerRef.current) {
      clearTimeout(autoSyncTimerRef.current);
    }

    autoSyncTimerRef.current = setTimeout(async () => {
      try {
        const { ok } = await syncPublicAttendance({ source });

        if (!ok) {
          toast.error('Auto-sync to Google Sheet failed. Use Sync to Sheet to retry.');
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown sync error';
        toast.error(`Auto-sync failed: ${message}`);
      }
    }, AUTO_SYNC_DELAY_MS);
  };

  const handleManualSync = async () => {
    setIsSyncing(true);

    try {
      const { ok } = await syncPublicAttendance({ source: 'attendance_marking_manual' });

      if (!ok) {
        toast.error('Failed to sync to Google Sheet');
        return;
      }

      toast.success('Public attendance snapshot synced to Google Sheet');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown sync error';
      toast.error(`Failed to sync: ${message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleMarkSubmit = async (forceOverwrite = false) => {
    if (!selectedSessionId) {
      return;
    }

    if (attendanceData.length > 0 && !forceOverwrite) {
      setShowOverwriteAlert(true);
      return;
    }

    setIsSaving(true);

    try {
      const absentList = absentErps
        .toLowerCase()
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter(Boolean);
      const absentSet = new Set(absentList);

      const reportBelongsToSession = Boolean(
        latestFinalZoomReport &&
          zoomReportMatchesSession(latestFinalZoomReport, selectedSessionId),
      );
      const reportRowsByErp = new Map(
        reportBelongsToSession
          ? latestFinalZoomReport!.attendance_rows.map((row) => [String(row.ERP ?? row.erp ?? '').trim(), row])
          : [],
      );
      const draftRowsByErp = new Map(draftAttendance.map((row) => [row.erp, row]));

      const newRecords: AttendanceInsert[] = roster.map((student) => {
        const reportRow = reportRowsByErp.get(student.erp);
        const draftRow = reportBelongsToSession ? draftRowsByErp.get(student.erp) : undefined;
        const reportStatus = String(draftRow?.status ?? reportRow?.Status ?? reportRow?.status ?? '').toLowerCase();
        const status: AttendanceStatus = reportStatus === 'excused' || reportStatus === 'present' || reportStatus === 'absent'
          ? reportStatus
          : absentSet.has(student.erp.toLowerCase()) ? 'absent' : 'present';
        const penaltyValue = draftRow?.naming_penalty ?? reportRow?.['Name Penalty'] ?? reportRow?.['Naming Penalty'] ?? reportRow?.naming_penalty;
        const namingPenalty = status === 'present' && (
          penaltyValue === -1 || penaltyValue === true || String(penaltyValue ?? '').trim() === '-1'
        );

        return {
          session_id: selectedSessionId,
          erp: student.erp,
          status,
          naming_penalty: namingPenalty,
        };
      });

      if (forceOverwrite || attendanceData.length > 0) {
        await deleteAttendanceBySession(selectedSessionId);
      }

      await insertAttendance(newRecords);

      let zoomReportSaved = false;
      if (latestFinalZoomReport && reportBelongsToSession) {
        try {
          const savedRowsByErp = new Map(newRecords.map((record) => [record.erp, record]));
          const reportForStorage: ZoomSessionReport = {
            ...latestFinalZoomReport,
            attendance_rows: latestFinalZoomReport.attendance_rows.map((row) => {
              const savedRow = savedRowsByErp.get(String(row.ERP ?? row.erp ?? '').trim());
              return savedRow
                ? { ...row, Status: savedRow.status, 'Name Penalty': savedRow.naming_penalty ? -1 : 0 }
                : row;
            }),
          };
          await updateSessionZoomReport(selectedSessionId, reportForStorage, new Date().toISOString());
          zoomReportSaved = true;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          toast.warning('Attendance saved, but failed to store the Zoom report.', {
            description: message,
          });
        }
      } else {
        toast.warning('Attendance saved, but no final Zoom report was loaded to store for this session.');
      }

      const submitMode: 'initial' | 'overwrite' =
        forceOverwrite || attendanceData.length > 0 ? 'overwrite' : 'initial';
      const absentCountSubmitted = newRecords.filter((record) => record.status === 'absent').length;
      const presentCountSubmitted = newRecords.length - absentCountSubmitted;
      const selectedSession = sessions.find((session) => session.id === selectedSessionId);
      const sessionLabel = selectedSession
        ? `#${selectedSession.session_number} (${format(new Date(selectedSession.session_date), 'PPP')})`
        : selectedSessionId;

      const notificationMessage = [
        'Event: Attendance Posted',
        `Session: ${sessionLabel}`,
        `Mode: ${submitMode}`,
        `Present: ${presentCountSubmitted}`,
        `Absent: ${absentCountSubmitted}`,
        `Timestamp: ${new Date().toISOString()}`,
      ].join('\n');

      void sendNtfyNotification({
        title: 'Attendance Posted',
        message: notificationMessage,
        tags: ['attendance', 'ta'],
        priority: 3,
      }).then((ok) => {
        if (!ok) {
          console.warn('[ntfy] Failed to send attendance notification');
        }
      });

      toast.success(zoomReportSaved ? 'Attendance marked and Zoom report saved' : 'Attendance marked successfully');
      emitAttendanceDataUpdated('attendance_marking_submit');
      scheduleCanonicalSync('attendance_marking_submit');

      setAbsentErps('');
      setShowOverwriteAlert(false);
      await fetchAttendance(selectedSessionId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to mark attendance: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatus = async (record: AttendanceRow) => {
    const statuses: AttendanceStatus[] = ['present', 'absent', 'excused'];
    const currentIndex = statuses.indexOf(record.status);
    const nextStatus = statuses[(currentIndex + 1) % statuses.length];

    if (record.id.startsWith('zoom-draft-')) {
      setDraftAttendance((prev) => prev.map((row) => (row.id === record.id ? { ...row, status: nextStatus } : row)));
      return;
    }

    setAttendanceData((prev) => prev.map((row) => (row.id === record.id ? { ...row, status: nextStatus } : row)));

    try {
      await updateAttendanceStatus(record.id, nextStatus);
    } catch {
      toast.error('Failed to update status');
      setAttendanceData((prev) => prev.map((row) => (row.id === record.id ? { ...row, status: record.status } : row)));
      return;
    }

    emitAttendanceDataUpdated('attendance_marking_status_toggle');
    scheduleCanonicalSync('attendance_marking_status_toggle');
  };

  const toggleNamingPenalty = async (record: AttendanceRow, checked: boolean) => {
    if (record.id.startsWith('zoom-draft-')) {
      setDraftAttendance((prev) => prev.map((row) => (row.id === record.id ? { ...row, naming_penalty: checked } : row)));
      return;
    }
    setAttendanceData((prev) => prev.map((row) => (row.id === record.id ? { ...row, naming_penalty: checked } : row)));

    try {
      await updateAttendancePenalty(record.id, checked);
    } catch {
      toast.error('Failed to update name penalty');
      setAttendanceData((prev) => prev.map((row) => (row.id === record.id ? { ...row, naming_penalty: !checked } : row)));
      return;
    }

    emitAttendanceDataUpdated('attendance_marking_penalty_toggle');
    scheduleCanonicalSync('attendance_marking_penalty_toggle');
  };

  const toggleActiveFilter = (token: AttendanceFilterToken) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(token)) {
        next.delete(token);
      } else {
        next.add(token);
      }
      return next;
    });
  };

  const displayedAttendance = attendanceData.length > 0 ? attendanceData : draftAttendance;
  const filteredAttendance = displayedAttendance.filter((record) => {
    if (activeFilters.has('present') && record.status !== 'present') {
      return false;
    }

    if (activeFilters.has('absent') && record.status !== 'absent') {
      return false;
    }

    if (activeFilters.has('penalized') && !record.naming_penalty) {
      return false;
    }

    if (!searchQuery) {
      return true;
    }

    const query = searchQuery.toLowerCase();
    return record.erp.toLowerCase().includes(query) || record.student_name?.toLowerCase().includes(query);
  });

  const presentCount = displayedAttendance.filter((record) => record.status === 'present').length;
  const absentCount = displayedAttendance.filter((record) => record.status === 'absent').length;
  const excusedCount = displayedAttendance.filter((record) => record.status === 'excused').length;
  const penalizedCount = displayedAttendance.filter((record) => record.naming_penalty).length;
  const { markRefreshed } = useStaleRefreshOnFocus(
    () => requestRefresh('background'),
    { staleAfterMs: 60_000 },
  );

  useEffect(() => {
    markRefreshedRef.current = markRefreshed;
  }, [markRefreshed]);

  useEffect(() => {
    const channel = subscribeToRealtimeTables(
      `ta-attendance-marking-${Date.now()}`,
      [
        { table: 'attendance' },
        { table: 'students_roster' },
        { table: 'sessions' },
      ],
      () => {
        void requestRefresh('background');
      },
    );

    return () => {
      void removeRealtimeChannel(channel);
    };
    }, [requestRefresh]);

  return (
    <div className="ta-module-shell grid gap-6 md:grid-cols-3">
      <Card className="h-fit md:col-span-1 ta-module-card">
        <CardHeader>
          <CardTitle>Mark Attendance</CardTitle>
          <CardDescription>Select a session and paste absent ERPs</CardDescription>
          <div className="h-5 text-right" aria-live="polite"><span className={`inline-block w-24 text-xs text-muted-foreground transition-opacity ${isUpdating ? 'opacity-100' : 'opacity-0'}`}>Updating…</span></div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
            <SelectTrigger>
              <SelectValue placeholder="Select Session" />
            </SelectTrigger>
            <SelectContent>
              {sessions.map((session) => (
                <SelectItem key={session.id} value={session.id}>
                  #{session.session_number} - {format(new Date(session.session_date), 'MMM d')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="space-y-2">
            <span className="text-sm font-medium text-debossed-body">Absent ERPs</span>
            <Textarea
              ref={absentErpsTextareaRef}
              placeholder="Paste ERPs here (space or newline separated)..."
              className="min-h-[200px] font-mono"
              value={absentErps}
              onChange={(event) => setAbsentErps(event.target.value)}
            />
          </div>

          <Button ref={submitButtonRef} className="w-full" onClick={() => handleMarkSubmit(false)} disabled={!selectedSessionId || isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Submit Attendance
          </Button>

          <AlertDialog open={showOverwriteAlert} onOpenChange={setShowOverwriteAlert}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Overwrite existing attendance?</AlertDialogTitle>
                <AlertDialogDescription>
                  Attendance has already been marked for this session. Proceeding will overwrite all statuses based on
                  the current roster and your input.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleMarkSubmit(true)}>Overwrite</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <Card className="md:col-span-2 ta-module-card">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <CardTitle>Attendance List</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                {draftAttendance.length > 0
                  ? 'Review the proposed Zoom results. Click status or name penalty to edit before saving.'
                  : 'Changes to status and penalties save automatically'}
              </CardDescription>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              <Button ref={syncButtonRef} variant="outline" size="sm" onClick={handleManualSync} disabled={isSyncing || isSaving}>
                {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Sync to Sheet
              </Button>
              <Input
                ref={searchInputRef}
                placeholder="Search Name or ERP"
                className="min-w-0 flex-1 sm:w-[150px] sm:flex-none"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {selectedSessionId && displayedAttendance.length > 0 && (
            <div className="mb-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="ta-status-chip status-present status-present-table-text">
                  {presentCount} Present
                </Badge>
                <Badge variant="outline" className="ta-status-chip status-absent status-absent-table-text">
                  {absentCount} Absent
                </Badge>
                <Badge variant="outline" className="ta-status-chip status-excused status-excused-table-text">
                  {excusedCount} Excused
                </Badge>
                <Badge variant="outline" className="ta-status-chip status-all status-all-table-text">
                  {penalizedCount} Penalized
                </Badge>
                <Badge variant="outline" className="ta-status-chip status-all text-debossed-sm">
                  {displayedAttendance.length} / {roster.length} Total
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={activeFilters.size === 0 ? 'default' : 'outline'}
                  onClick={() => setActiveFilters(new Set())}
                  className={`ta-status-filter group ${activeFilters.size === 0 ? 'active' : ''}`}
                >
                  <span className="status-led status-all-led" />
                  <span className="status-all-text text-debossed-sm">All ({displayedAttendance.length})</span>
                </Button>
                <Button
                  size="sm"
                  variant={activeFilters.has('present') ? 'default' : 'outline'}
                  onClick={() => toggleActiveFilter('present')}
                  className={`ta-status-filter group ${activeFilters.has('present') ? 'active' : ''}`}
                >
                  <span className="status-led status-present-led" />
                  <span className="status-present-text text-debossed-sm">Present ({presentCount})</span>
                </Button>
                <Button
                  size="sm"
                  variant={activeFilters.has('absent') ? 'default' : 'outline'}
                  onClick={() => toggleActiveFilter('absent')}
                  className={`ta-status-filter group ${activeFilters.has('absent') ? 'active' : ''}`}
                >
                  <span className="status-led status-absent-led" />
                  <span className="status-absent-text text-debossed-sm">Absent ({absentCount})</span>
                </Button>
                <Button
                  size="sm"
                  variant={activeFilters.has('penalized') ? 'default' : 'outline'}
                  onClick={() => toggleActiveFilter('penalized')}
                  className={`ta-status-filter group ${activeFilters.has('penalized') ? 'active' : ''}`}
                >
                  <span className="status-led status-all-led" />
                  <span className="status-all-text text-debossed-sm">Penalized ({penalizedCount})</span>
                </Button>
              </div>
            </div>
          )}
          {!selectedSessionId ? (
            <div className="py-8 text-center text-muted-foreground">Select a session to view attendance.</div>
          ) : isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="animate-spin" />
            </div>
          ) : displayedAttendance.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No attendance marked for this session yet.</div>
          ) : (
              <Table scrollClassName="overflow-x-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead className={STUDENT_SERIAL_CLASS}>{STUDENT_SERIAL_HEADER}</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>ERP</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Name Penalty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAttendance.map((record, index) => (
                    <TableRow key={record.id}>
                      <TableCell className={STUDENT_SERIAL_CLASS}>{index + 1}</TableCell>
                      <TableCell>{record.class_no}</TableCell>
                      <TableCell>{record.student_name}</TableCell>
                      <TableCell>{record.erp}</TableCell>
                      <TableCell>
                        <Badge
                          className={`ta-status-chip cursor-pointer select-none ${
                            record.status === 'present'
                              ? 'status-present status-present-table-text'
                              : record.status === 'absent'
                                ? 'status-absent status-absent-table-text'
                                : 'status-excused status-excused-table-text'
                          }`}
                          onClick={() => toggleStatus(record)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              toggleStatus(record);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          aria-label={`Change attendance status for ${record.student_name}`}
                        >
                          {record.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => toggleNamingPenalty(record, !record.naming_penalty)}
                          aria-pressed={record.naming_penalty}
                          aria-label={`${record.naming_penalty ? 'Remove' : 'Apply'} name penalty for ${record.student_name}`}
                          className="flex items-center justify-end gap-4 pr-2 cursor-pointer active:scale-95 transition-transform w-full"
                        >
                          <div className="w-[18px] h-[18px] rounded-full neo-in relative flex items-center justify-center border border-[#141517]">
                            <div
                              className={`w-[8px] h-[8px] rounded-full transition-all duration-300 ${
                                record.naming_penalty ? 'bg-[var(--color-all)] shadow-[0_0_8px_var(--color-all)]' : 'bg-transparent'
                              }`}
                            />
                          </div>
                          <span
                            className={`text-debossed-body font-black min-w-[20px] text-right transition-all duration-300 ${
                              record.naming_penalty ? 'status-all-table-text' : ''
                            }`}
                          >
                            {record.naming_penalty ? '-1' : '0'}
                          </span>
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
