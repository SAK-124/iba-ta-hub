import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  fetchPublicAttendanceBoard,
  syncPublicAttendanceSnapshot,
  type PublicAttendanceSession,
  type PublicAttendanceStudent,
} from '@/lib/public-attendance-sync';
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
      const board = await fetchPublicAttendanceBoard();
      setSessions(board.sessions);
      setStudents(board.students);
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
    <Card className="h-full">
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
          <div className="max-h-[600px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 w-[100px] bg-background">Class</TableHead>
                  <TableHead className="sticky left-[100px] z-10 w-[200px] bg-background">Name</TableHead>
                  <TableHead className="w-[100px]">ERP</TableHead>
                  <TableHead className="w-[80px] text-center font-bold text-destructive">Penalties</TableHead>
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
                    if (count <= 4) return 'text-green-500';
                    if (count === 5) return 'text-yellow-500';
                    return 'text-red-500';
                  };

                  const getAbsenceBg = (count: number) => {
                    if (count <= 4) return '';
                    if (count === 5) return 'bg-yellow-500/10';
                    return 'bg-red-500/10';
                  };

                  return (
                    <TableRow key={student.erp}>
                      <TableCell className="sticky left-0 bg-background font-medium">{student.class_no}</TableCell>
                      <TableCell className="sticky left-[100px] bg-background">{student.student_name}</TableCell>
                      <TableCell>{student.erp}</TableCell>
                      <TableCell className="text-center font-bold">{student.total_penalties}</TableCell>
                      <TableCell
                        className={`text-center font-bold ${getAbsenceColor(student.total_absences)} ${getAbsenceBg(student.total_absences)}`}
                      >
                        {student.total_absences}
                      </TableCell>
                      {sessions.map((session) => {
                        const status = student.session_status?.[session.id];
                        let symbol = '-';
                        let color = '';

                        if (status === 'present') {
                          symbol = 'P';
                          color = 'text-green-600 font-bold';
                        } else if (status === 'absent') {
                          symbol = 'A';
                          color = 'text-red-600 font-bold';
                        } else if (status === 'excused') {
                          symbol = 'E';
                          color = 'text-yellow-600 font-bold';
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
