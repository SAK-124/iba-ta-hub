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
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';

interface ConsolidatedViewProps {
  isActive: boolean;
}

type FetchMode = 'initial' | 'silent';

export default function ConsolidatedView({ isActive }: ConsolidatedViewProps) {
  const [sessions, setSessions] = useState<PublicAttendanceSession[]>([]);
  const [students, setStudents] = useState<PublicAttendanceStudent[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const hasLoadedOnceRef = useRef(false);
  const isFetchInFlightRef = useRef(false);

  const fetchData = useCallback(async (mode: FetchMode) => {
    if (isFetchInFlightRef.current) {
      return;
    }

    const shouldShowInitialLoader = mode === 'initial' && !hasLoadedOnceRef.current;
    isFetchInFlightRef.current = true;

    if (shouldShowInitialLoader) {
      setIsInitialLoading(true);
    } else {
      setIsRefreshing(true);
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load consolidated attendance.';
      toast.error(message);
    } finally {
      if (shouldShowInitialLoader) {
        setIsInitialLoading(false);
      }
      setIsRefreshing(false);
      isFetchInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    void fetchData(hasLoadedOnceRef.current ? 'silent' : 'initial');
  }, [isActive, fetchData]);

  useEffect(() => {
    const unsubscribeRoster = subscribeRosterDataUpdated(() => {
      if (!isActive) return;
      void fetchData(hasLoadedOnceRef.current ? 'silent' : 'initial');
    });
    const unsubscribeAttendance = subscribeAttendanceDataUpdated(() => {
      if (!isActive) return;
      void fetchData(hasLoadedOnceRef.current ? 'silent' : 'initial');
    });

    return () => {
      unsubscribeRoster();
      unsubscribeAttendance();
    };
  }, [isActive, fetchData]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchData('silent');
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isActive, fetchData]);

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
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Consolidated View</CardTitle>
            <CardDescription>Full attendance sheet with penalties</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isRefreshing && !isInitialLoading && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Refreshing...
              </span>
            )}
            <Input
              placeholder="Search..."
              className="w-[220px]"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <Button
              onClick={handleSyncPublicAttendanceToSheet}
              disabled={isInitialLoading || isSyncing || students.length === 0}
              variant="outline"
            >
              {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Sync Sheet
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
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 w-[100px]">Class</TableHead>
                  <TableHead className="sticky left-[100px] z-10 w-[200px]">Name</TableHead>
                  <TableHead className="w-[100px]">ERP</TableHead>
                  <TableHead className="w-[80px] text-center font-bold status-absent-table-text">Penalties</TableHead>
                  <TableHead className="w-[80px] text-center font-bold">Absences</TableHead>
                  {sessions.map((session) => (
                    <TableHead key={session.id} className="w-[60px] text-center">
                      S{session.session_number}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.map((student) => {
                  const getAbsenceColor = (count: number) => {
                    if (count === 0) return '';
                    if (count <= 2) return 'status-present-table-text';
                    if (count <= 4) return 'status-excused-table-text';
                    if (count === 5) return 'status-absent-table-text';
                    return 'status-purple-table-text';
                  };
                  const hasPenalties = student.total_penalties > 0;
                  const penaltyEntries = student.penalty_entries ?? [];
                  const penaltySessionLabels = penaltyEntries.map((entry) => `S${entry.session_number}`);
                  const penaltyTooltipText =
                    penaltySessionLabels.length > 0 ? `Penalty sessions: ${penaltySessionLabels.join(', ')}` : 'Session info unavailable';

                  return (
                    <TableRow key={student.erp}>
                      <TableCell className="sticky left-0 font-medium">{student.class_no}</TableCell>
                      <TableCell className="sticky left-[100px]">{student.student_name}</TableCell>
                      <TableCell>{student.erp}</TableCell>
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
                      <TableCell className={`text-center font-bold ${getAbsenceColor(student.total_absences)}`}>
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
    </div>
  );
}
