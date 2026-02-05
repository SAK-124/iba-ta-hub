import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, Search } from 'lucide-react';

interface SessionRecord {
  id: string;
  session_number: number;
  session_date: string;
  day_of_week: string;
}

interface StudentAttendanceRecord {
  class_no: string;
  student_name: string;
  erp: string;
  total_penalties: number;
  total_absences: number;
  session_status: Record<string, string>;
}

interface PublicAttendanceResponse {
  sessions: SessionRecord[];
  students: StudentAttendanceRecord[];
}

export default function PublicAttendanceBoard() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [students, setStudents] = useState<StudentAttendanceRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBoardData();
  }, []);

  const fetchBoardData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('get_public_attendance_board' as never);

      if (rpcError) {
        throw rpcError;
      }

      const response = (data ?? {}) as PublicAttendanceResponse;
      const nextSessions = Array.isArray(response.sessions) ? response.sessions : [];
      const nextStudents = Array.isArray(response.students) ? response.students : [];

      setSessions(nextSessions);
      setStudents(nextStudents);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load attendance board.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

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

  const getAbsenceColor = (count: number) => {
    if (count <= 4) return 'text-green-600';
    if (count === 5) return 'text-yellow-600';
    return 'text-red-600';
  };

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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Attendance Board</CardTitle>
            <CardDescription>Session-wise attendance and total penalties for all students</CardDescription>
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
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <Button onClick={fetchBoardData} variant="outline" size="sm">
              Retry
            </Button>
          </div>
        ) : students.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            No attendance records are available yet.
          </div>
        ) : (
          <div className="rounded-md border max-h-[70vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-20 w-[90px] bg-background">Class</TableHead>
                  <TableHead className="sticky left-[90px] z-20 w-[220px] bg-background">Name</TableHead>
                  <TableHead className="sticky left-[310px] z-20 w-[110px] bg-background">ERP</TableHead>
                  <TableHead className="w-[110px] text-center">Penalties</TableHead>
                  <TableHead className="w-[100px] text-center">Absences</TableHead>
                  {sessions.map((session) => (
                    <TableHead key={session.id} className="w-[70px] text-center">
                      S{session.session_number}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredStudents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5 + sessions.length} className="py-10 text-center text-muted-foreground">
                      No students match your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStudents.map((student) => (
                    <TableRow key={student.erp}>
                      <TableCell className="sticky left-0 z-10 bg-background font-medium">{student.class_no}</TableCell>
                      <TableCell className="sticky left-[90px] z-10 bg-background">{student.student_name}</TableCell>
                      <TableCell className="sticky left-[310px] z-10 bg-background font-mono text-xs">{student.erp}</TableCell>
                      <TableCell className="text-center font-semibold text-destructive">
                        {student.total_penalties}
                      </TableCell>
                      <TableCell className={`text-center font-semibold ${getAbsenceColor(student.total_absences)}`}>
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
