import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  fetchPublicAttendanceBoard,
  type PublicAttendanceSession,
  type PublicAttendanceStudent,
} from '@/lib/public-attendance-sync';
import { TEST_STUDENT_ERP } from '@/lib/test-student-settings';
import { subscribeAttendanceDataUpdated, subscribeRosterDataUpdated } from '@/lib/data-sync-events';
import { AlertCircle, Loader2, Search } from 'lucide-react';
import { useRefreshController } from '@/hooks/use-refresh-controller';
import { useStaleRefreshOnFocus } from '@/hooks/use-stale-refresh-on-focus';
import { STUDENT_SERIAL_HEADER } from '@/lib/student-table';
import { getAbsenceCountClass } from '@/lib/absence-display';

export default function PublicAttendanceBoard() {
  const [sessions, setSessions] = useState<PublicAttendanceSession[]>([]);
  const [students, setStudents] = useState<PublicAttendanceStudent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);

  const fetchBoardData = useCallback(async (mode: 'initial' | 'background') => {
    const showInitialLoader = mode === 'initial' && !hasLoadedOnceRef.current;
    if (showInitialLoader) setIsInitialLoading(true);
    setError(null);

    try {
      const board = await fetchPublicAttendanceBoard();
      setSessions(board.sessions);
      setStudents(board.students.filter((student) => student.erp !== TEST_STUDENT_ERP));
      hasLoadedOnceRef.current = true;
      markRefreshedRef.current();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load attendance board.';
      setError(message);
    } finally {
      if (showInitialLoader) setIsInitialLoading(false);
    }
  }, []);

  const markRefreshedRef = useRef<() => void>(() => {});
  const { requestRefresh, isUpdating } = useRefreshController(fetchBoardData);
  const { markRefreshed } = useStaleRefreshOnFocus(
    () => requestRefresh('background'),
    { staleAfterMs: 60_000 },
  );

  useEffect(() => {
    markRefreshedRef.current = markRefreshed;
  }, [markRefreshed]);

  useEffect(() => {
    void requestRefresh('initial');

    const unsubscribeRoster = subscribeRosterDataUpdated(() => {
      void requestRefresh('background');
    });
    const unsubscribeAttendance = subscribeAttendanceDataUpdated(() => {
      void requestRefresh('background');
    });
    const intervalId = window.setInterval(() => {
      void requestRefresh('background');
    }, 15000);

    return () => {
      unsubscribeRoster();
      unsubscribeAttendance();
      window.clearInterval(intervalId);
    };
  }, [requestRefresh]);

  const filteredStudents = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return students;
    }

    return students.filter((student) => {
      const byName = student.student_name.toLowerCase().includes(normalizedQuery);
      const byErp = student.erp.toLowerCase().includes(normalizedQuery);
      const byClassNo = student.class_no.toLowerCase().includes(normalizedQuery);

      return byName || byErp || byClassNo;
    });
  }, [searchQuery, students]);

  const getSessionSymbol = (status: string | undefined) => {
    if (status === 'present') {
      return { symbol: 'P', className: 'text-green-600 font-semibold' };
    }

    if (status === 'absent') {
      return { symbol: 'A', className: 'text-red-600 font-semibold' };
    }

    if (status === 'excused') {
      return { symbol: 'E', className: 'text-yellow-600 font-semibold' };
    }

    return { symbol: '-', className: 'text-muted-foreground' };
  };

  const formatSessionHint = (session: PublicAttendanceSession) => {
    if (!session.session_date) return `Session ${session.session_number}`;

    const parsedDate = new Date(session.session_date);
    if (Number.isNaN(parsedDate.getTime())) return `Session ${session.session_number}`;

    return `${session.day_of_week || ''} ${parsedDate.toLocaleDateString()}`.trim();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <CardTitle>Attendance Board</CardTitle>
            <CardDescription>Session-wise attendance and total penalties for all students</CardDescription>
            <div className="h-5 w-24 text-xs text-muted-foreground" aria-live="polite">
              <span className={`transition-opacity ${isUpdating ? 'opacity-100' : 'opacity-0'}`}>Updating…</span>
            </div>
          </div>

          <div className="relative w-full md:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by name, ERP, class"
              className="pl-9"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Legend:</span>
          <span><span className="font-semibold text-green-600">P</span> Present</span>
          <span><span className="font-semibold text-red-600">A</span> Absent</span>
          <span><span className="font-semibold text-yellow-600">E</span> Excused</span>
          <span className="w-full">
            <span className="font-semibold text-destructive">Name Penalty:</span>{' '}
            Name penalties apply when your Zoom display name does not follow the required format.
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6">
        {isInitialLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error && students.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <Button onClick={() => void requestRefresh('initial')} variant="outline" size="sm">
              Retry
            </Button>
          </div>
        ) : students.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            No attendance records are available yet.
          </div>
        ) : (
          <div className="relative max-h-[70vh] overflow-y-auto rounded-md border">
            {error ? (
              <div className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
                <Button className="ml-auto h-7" onClick={() => void requestRefresh('background')} variant="ghost" size="sm">Retry</Button>
              </div>
            ) : null}
            <Table className="min-w-max table-fixed">
              <colgroup>
                <col className="w-[52px] sm:w-[60px]" />
                <col className="w-[72px] sm:w-[88px]" />
                <col className="w-[144px] sm:w-[216px]" />
                <col className="w-[88px] sm:w-[112px]" />
                <col className="w-[120px]" />
                <col className="w-[104px]" />
                {sessions.map((session) => <col key={session.id} className="w-[64px] sm:w-[72px]" />)}
              </colgroup>
              <TableHeader className="sticky top-0 z-30 bg-card [&_th]:bg-card">
                <TableRow>
                  <TableHead className="sticky left-0 z-40 w-[52px] bg-card sm:w-[60px]">{STUDENT_SERIAL_HEADER}</TableHead>
                  <TableHead className="sticky left-[52px] z-40 w-[72px] bg-card sm:left-[60px] sm:w-[88px]">Class</TableHead>
                  <TableHead className="sticky left-[124px] z-40 w-[144px] bg-card sm:left-[148px] sm:w-[216px]">Name</TableHead>
                  <TableHead className="sticky left-[268px] z-40 w-[88px] bg-card sm:left-[364px] sm:w-[112px]">ERP</TableHead>
                  <TableHead className="w-[120px] text-center">Name Penalty</TableHead>
                  <TableHead className="w-[104px] text-center">Absences</TableHead>
                  {sessions.map((session) => (
                    <TableHead
                      key={session.id}
                      className="w-[64px] text-center sm:w-[72px]"
                      title={formatSessionHint(session)}
                    >
                      S{session.session_number}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredStudents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6 + sessions.length} className="py-10 text-center text-muted-foreground">
                      No students match your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStudents.map((student, index) => (
                    <TableRow key={student.erp}>
                      <TableCell className="sticky left-0 z-10 w-[52px] bg-card text-center text-xs font-medium sm:w-[60px]">{index + 1}</TableCell>
                      <TableCell className="sticky left-[52px] z-10 w-[72px] bg-card text-xs font-medium sm:left-[60px] sm:w-[88px]">{student.class_no}</TableCell>
                      <TableCell className="sticky left-[124px] z-10 w-[144px] max-w-[144px] truncate bg-card sm:left-[148px] sm:w-[216px] sm:max-w-[216px]">{student.student_name}</TableCell>
                      <TableCell className="sticky left-[268px] z-10 w-[88px] bg-card font-mono text-xs sm:left-[364px] sm:w-[112px]">{student.erp}</TableCell>
                      <TableCell
                        className={`text-center font-semibold ${
                          student.total_penalties > 0 ? 'text-destructive' : 'text-muted-foreground'
                        }`}
                      >
                        {student.total_penalties}
                      </TableCell>
                      <TableCell className={`text-center font-semibold ${getAbsenceCountClass(student.total_absences)}`}>
                        {student.total_absences}
                      </TableCell>
                      {sessions.map((session) => {
                        const status = student.session_status?.[session.id];
                        const { symbol, className } = getSessionSymbol(status);

                        return (
                          <TableCell key={`${student.erp}-${session.id}`} className={`text-center ${className}`}>
                            {symbol}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
