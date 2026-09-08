import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ta/ui/card';
import { Input } from '@/components/ta/ui/input';
import { Button } from '@/components/ta/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ta/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ta/ui/tooltip';
import {
  fetchPenaltyEntriesForErps,
  fetchPublicAttendanceBoard,
  syncPublicAttendanceSnapshot,
  type PublicAttendanceSession,
  type PublicAttendanceStudent,
} from '@/lib/public-attendance-sync';
import { applyTaTestStudentToBoard, fetchTaTestStudentSettings } from '@/lib/test-student-settings';
import { subscribeAttendanceDataUpdated, subscribeRosterDataUpdated } from '@/lib/data-sync-events';
import { removeRealtimeChannel, subscribeToRealtimeTables } from '@/lib/realtime-table-subscriptions';
import { useStaleRefreshOnFocus } from '@/hooks/use-stale-refresh-on-focus';
import { useRefreshController } from '@/hooks/use-refresh-controller';
import { STUDENT_SERIAL_HEADER } from '@/lib/student-table';
import { getAbsenceCountClass } from '@/lib/absence-display';
import { toast } from 'sonner';
import { Loader2, Search, Upload } from 'lucide-react';
import AttendanceView from '@/components/student/AttendanceView';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ta/ui/dialog';
import type {
  AgentCommandEnvelope,
  ConsolidatedAgentCommand,
  HelpContextSnapshot,
} from '@/lib/ta-help-actions';

interface ConsolidatedViewProps {
  isActive: boolean;
  onContextChange?: (context: string | null) => void;
  onHelpContextChange?: (snapshot: Partial<HelpContextSnapshot>) => void;
  agentCommand?: AgentCommandEnvelope<ConsolidatedAgentCommand> | null;
  onAgentCommandHandled?: () => void;
}

type FetchMode = 'initial' | 'background';

export default function ConsolidatedView({
  isActive,
  onContextChange,
  onHelpContextChange,
  agentCommand = null,
  onAgentCommandHandled,
}: ConsolidatedViewProps) {
  const [sessions, setSessions] = useState<PublicAttendanceSession[]>([]);
  const [students, setStudents] = useState<PublicAttendanceStudent[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewQuery, setPreviewQuery] = useState('');
  const [previewErp, setPreviewErp] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);
  const markRefreshedRef = useRef<() => void>(() => {});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const syncButtonRef = useRef<HTMLButtonElement>(null);
  const lastHandledAgentCommandTokenRef = useRef<number | null>(null);

  const fetchData = useCallback(async (mode: FetchMode) => {
    const shouldShowInitialLoader = mode === 'initial' && !hasLoadedOnceRef.current;

    if (shouldShowInitialLoader) {
      setIsInitialLoading(true);
    }

    try {
      const [board, testStudentSettings] = await Promise.all([
        fetchPublicAttendanceBoard(),
        fetchTaTestStudentSettings(),
      ]);
      const taBoard = applyTaTestStudentToBoard(board, testStudentSettings);
      let studentsWithPenaltyDetails = taBoard.students;

      const erpsNeedingPenaltyDetails = taBoard.students
        .filter((student) => student.total_penalties > 0 && (student.penalty_entries?.length ?? 0) === 0)
        .map((student) => student.erp);

      if (erpsNeedingPenaltyDetails.length > 0) {
        try {
          const fetchedPenaltyEntries = await fetchPenaltyEntriesForErps(erpsNeedingPenaltyDetails);
          studentsWithPenaltyDetails = taBoard.students.map((student) => {
            if ((student.penalty_entries?.length ?? 0) > 0 || student.total_penalties <= 0) {
              return student;
            }

            const entries = fetchedPenaltyEntries[student.erp] ?? [];
            if (entries.length === 0) {
              return student;
            }

            return {
              ...student,
              penalty_entries: entries,
            };
          });
        } catch (fallbackError) {
          console.warn('Penalty details fallback lookup failed', fallbackError);
        }
      }

      setSessions(taBoard.sessions);
      setStudents(studentsWithPenaltyDetails);
      hasLoadedOnceRef.current = true;
      markRefreshedRef.current();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load consolidated attendance.';
      toast.error(message);
    } finally {
      if (shouldShowInitialLoader) {
        setIsInitialLoading(false);
      }
    }
  }, []);

  const { requestRefresh, isUpdating } = useRefreshController(fetchData);

  const { markRefreshed } = useStaleRefreshOnFocus(
    () => requestRefresh('background'),
    { enabled: isActive, staleAfterMs: 60_000 },
  );

  useEffect(() => {
    markRefreshedRef.current = markRefreshed;
  }, [markRefreshed]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    void requestRefresh(hasLoadedOnceRef.current ? 'background' : 'initial');
  }, [isActive, requestRefresh]);

  useEffect(() => {
    const unsubscribeRoster = subscribeRosterDataUpdated(() => {
      if (!isActive) return;
      void requestRefresh('background');
    });
    const unsubscribeAttendance = subscribeAttendanceDataUpdated(() => {
      if (!isActive) return;
      void requestRefresh('background');
    });

    return () => {
      unsubscribeRoster();
      unsubscribeAttendance();
    };
  }, [isActive, requestRefresh]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const channel = subscribeToRealtimeTables(
      `ta-consolidated-${Date.now()}`,
      [
        { table: 'attendance' },
        { table: 'students_roster' },
        { table: 'sessions' },
        { table: 'app_settings' },
      ],
      () => {
        void requestRefresh('background');
      },
    );

    return () => {
      void removeRealtimeChannel(channel);
    };
  }, [isActive, requestRefresh]);

  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return students;
    }

    return students.filter((student) => {
      return (
        student.student_name.toLowerCase().includes(query) ||
        student.erp.toLowerCase().includes(query) ||
        student.class_no.toLowerCase().includes(query)
      );
    });
  }, [searchQuery, students]);

  const recommendedPreviewStudent = useMemo(
    () => students.find((student) => {
      const statuses = Object.values(student.session_status ?? {}).map((status) => status.toLowerCase());
      return statuses.includes('present') && statuses.includes('absent') && student.total_penalties > 0;
    }) ?? null,
    [students],
  );

  const previewStudents = useMemo(() => {
    const query = previewQuery.trim().toLowerCase();
    const matches = query
      ? students.filter((student) =>
          student.student_name.toLowerCase().includes(query)
          || student.erp.toLowerCase().includes(query)
          || student.class_no.toLowerCase().includes(query),
        )
      : students;

    return [...matches].sort((left, right) => {
      const leftRecommended = left.erp === recommendedPreviewStudent?.erp ? 0 : 1;
      const rightRecommended = right.erp === recommendedPreviewStudent?.erp ? 0 : 1;
      return leftRecommended - rightRecommended
        || left.student_name.localeCompare(right.student_name)
        || left.erp.localeCompare(right.erp);
    });
  }, [previewQuery, recommendedPreviewStudent?.erp, students]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const stageLabel = isSyncing
      ? 'Consolidated View · syncing sheet'
      : searchQuery.trim()
        ? 'Consolidated View · search active'
        : 'Consolidated View · table review';

    onContextChange?.(stageLabel);
  }, [isActive, isSyncing, onContextChange, searchQuery]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    onHelpContextChange?.({
      openSurface: 'consolidated table',
      screenDescription: 'Review the full attendance table and optionally sync the public sheet.',
      visibleControls: ['Search...', 'Sync Sheet'],
      searchQuery,
      actionTargets: students.slice(0, 150).map((student) => ({
        kind: 'student' as const,
        label: student.student_name,
        aliases: [student.erp, student.class_no],
        meta: {
          erp: student.erp,
          class_no: student.class_no,
          total_absences: student.total_absences,
          total_penalties: student.total_penalties,
        },
      })),
    });
  }, [isActive, onHelpContextChange, searchQuery, students]);

  useEffect(() => {
    if (!agentCommand || !isActive) {
      return;
    }

    if (lastHandledAgentCommandTokenRef.current === agentCommand.token) {
      return;
    }

    lastHandledAgentCommandTokenRef.current = agentCommand.token;

    switch (agentCommand.command.kind) {
      case 'search':
        setSearchQuery(agentCommand.command.query ?? '');
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
        break;
      case 'clear-search':
        setSearchQuery('');
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
        break;
      case 'focus-sync':
        window.setTimeout(() => syncButtonRef.current?.focus(), 0);
        break;
    }

    onAgentCommandHandled?.();
  }, [agentCommand, isActive, onAgentCommandHandled]);

  const handleSyncPublicAttendanceToSheet = async () => {
    setIsSyncing(true);

    try {
      toast.info('Syncing public attendance snapshot to Google Sheet...');
      const { ok } = await syncPublicAttendanceSnapshot({ source: 'ta_consolidated_manual' });

      if (!ok) {
        toast.error('Failed to sync to Google Sheet');
        return;
      }

      toast.success('Public attendance snapshot synced to Google Sheet');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to sync: ${message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="ta-module-shell">
      <Card className="h-full ta-module-card">
      <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
          <CardTitle>Consolidated View</CardTitle>
            <CardDescription>Full attendance sheet with penalties</CardDescription>
          </div>
          <span className={`w-24 text-right text-xs text-muted-foreground transition-opacity ${isUpdating ? 'opacity-100' : 'opacity-0'}`} aria-live="polite">Updating…</span>
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
            <Input
              ref={searchInputRef}
              placeholder="Search..."
              className="min-w-0 flex-1 md:w-[220px] md:flex-none"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <Button
              ref={syncButtonRef}
              onClick={handleSyncPublicAttendanceToSheet}
              disabled={isInitialLoading || isSyncing || students.length === 0}
              variant="outline"
            >
              {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Sync Sheet
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setPreviewErp(recommendedPreviewStudent?.erp ?? null);
                setPreviewQuery('');
                setIsPreviewOpen(true);
              }}
              disabled={students.length === 0}
            >
              Preview Student
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isInitialLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <TooltipProvider delayDuration={0}>
            <Table containerClassName="max-h-[600px]">
              <TableHeader className="sticky top-0 z-20">
                <TableRow>
                  <TableHead className="sticky left-0 z-30 w-[52px] min-w-[52px] max-w-[52px]">{STUDENT_SERIAL_HEADER}</TableHead>
                  <TableHead className="sticky left-[52px] z-30 w-[96px] min-w-[96px] max-w-[96px]">Class</TableHead>
                  <TableHead className="sticky left-[148px] z-30 w-[220px] min-w-[220px] max-w-[220px]">Name</TableHead>
                  <TableHead className="w-[112px] min-w-[112px] max-w-[112px]">ERP</TableHead>
                  <TableHead className="w-[112px] min-w-[112px] text-center font-bold status-absent-table-text">Name Penalty</TableHead>
                  <TableHead className="w-[96px] min-w-[96px] text-center font-bold">Absences</TableHead>
                  {sessions.map((session) => (
                    <TableHead key={session.id} className="w-[60px] text-center">
                      S{session.session_number}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.map((student, index) => {
                  const hasPenalties = student.total_penalties > 0;
                  const penaltyEntries = student.penalty_entries ?? [];
                  const penaltySessionLabels = penaltyEntries.map((entry) => `S${entry.session_number}`);
                  const penaltyTooltipText =
                    penaltySessionLabels.length > 0 ? `Penalty sessions: ${penaltySessionLabels.join(', ')}` : 'Session info unavailable';

                  return (
                    <TableRow key={student.erp}>
                      <TableCell className="sticky left-0 z-10 w-[52px] min-w-[52px] max-w-[52px] text-center font-medium">{index + 1}</TableCell>
                      <TableCell className="sticky left-[52px] z-10 w-[96px] min-w-[96px] max-w-[96px] font-medium">{student.class_no}</TableCell>
                      <TableCell className="sticky left-[148px] z-10 w-[220px] min-w-[220px] max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap">
                        <span className="block truncate">{student.student_name}</span>
                      </TableCell>
                      <TableCell className="w-[112px] min-w-[112px] max-w-[112px]">{student.erp}</TableCell>
                      <TableCell className={`text-center font-bold ${hasPenalties ? 'status-absent-table-text' : ''}`}>
                        {hasPenalties ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help" title={penaltyTooltipText}>
                                {student.total_penalties}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="text-debossed-body">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Penalty sessions</p>
                              {penaltyEntries.length > 0 ? (
                                <ul className="mt-1 space-y-0.5">
                                  {penaltyEntries.map((entry) => (
                                    <li key={`${student.erp}-${entry.session_id}`} className="text-sm font-bold text-debossed-body">
                                      S{entry.session_number}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-1 text-sm text-debossed-sm">Session info unavailable</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          student.total_penalties
                        )}
                      </TableCell>
                      <TableCell className={`text-center font-bold ${getAbsenceCountClass(student.total_absences)}`}>
                        {student.total_absences}
                      </TableCell>
                      {sessions.map((session) => {
                        const status = student.session_status?.[session.id];
                        let symbol = '-';
                        let color = '';

                        if (status === 'present') {
                          symbol = 'P';
                          color = 'status-present-table-text font-bold';
                        } else if (status === 'absent') {
                          symbol = 'A';
                          color = 'status-absent-table-text font-bold';
                        } else if (status === 'excused') {
                          symbol = 'E';
                          color = 'status-excused-table-text font-bold';
                        }

                        return (
                          <TableCell key={`${student.erp}-${session.id}`} className={`text-center ${color}`}>
                            {symbol}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TooltipProvider>
        )}
      </CardContent>
      </Card>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Student Attendance Preview</DialogTitle>
            <DialogDescription>
              Read-only TA preview using the selected student&apos;s own attendance evidence. No student login or credentials are used.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                aria-label="Search preview student"
                placeholder="Search by name, ERP, or class"
                className="pl-9"
                value={previewQuery}
                onChange={(event) => setPreviewQuery(event.target.value)}
              />
            </div>
            <div className="grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2">
              {previewStudents.slice(0, 20).map((student) => {
                const isRecommended = student.erp === recommendedPreviewStudent?.erp;
                return (
                  <button
                    key={student.erp}
                    type="button"
                    onClick={() => setPreviewErp(student.erp)}
                    className={`min-w-0 rounded-lg border p-3 text-left transition hover:border-primary ${previewErp === student.erp ? 'border-primary bg-primary/10' : ''}`}
                  >
                    <span className="block truncate text-sm font-medium">{student.student_name}</span>
                    <span className="block text-xs text-muted-foreground">ERP {student.erp} · Class {student.class_no}</span>
                    {isRecommended ? <span className="mt-1 block text-xs text-primary">Recommended: present, absent, and name penalty</span> : null}
                  </button>
                );
              })}
              {previewStudents.length === 0 ? <p className="text-sm text-muted-foreground">No students match this search.</p> : null}
            </div>
            {previewErp ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <p className="mb-3 text-xs text-muted-foreground">Previewing ERP {previewErp}. This view is read-only.</p>
                <AttendanceView previewErp={previewErp} isPreview />
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Select a student to preview attendance details.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
