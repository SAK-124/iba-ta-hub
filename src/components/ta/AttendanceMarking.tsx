import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { syncPublicAttendanceSnapshot } from '@/lib/public-attendance-sync';
import { subscribeRosterDataUpdated } from '@/lib/data-sync-events';
import { Loader2, Save } from 'lucide-react';

type AttendanceStatus = 'present' | 'absent' | 'excused';
type AttendanceFilterToken = 'present' | 'absent' | 'penalized';

interface SessionRow {
  id: string;
  session_number: number;
  session_date: string;
}

interface RosterRow {
  id: string;
  class_no: string;
  student_name: string;
  erp: string;
}

interface AttendanceRow {
  id: string;
  session_id: string;
  erp: string;
  status: AttendanceStatus;
  naming_penalty: boolean;
  student_name?: string;
  class_no?: string;
  students_roster?: {
    student_name?: string;
    class_no?: string;
  } | null;
}

const AUTO_SYNC_DELAY_MS = 1200;

export default function AttendanceMarking() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [absentErps, setAbsentErps] = useState('');

  const [attendanceData, setAttendanceData] = useState<AttendanceRow[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showOverwriteAlert, setShowOverwriteAlert] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<AttendanceFilterToken>>(new Set());

  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      void fetchAttendance(selectedSessionId);
      return;
    }

    setAttendanceData([]);
  }, [selectedSessionId]);

  useEffect(() => {
    const unsubscribe = subscribeRosterDataUpdated(() => {
      void fetchRoster();

      if (selectedSessionId) {
        void fetchAttendance(selectedSessionId);
      }
    });

    return unsubscribe;
  }, [selectedSessionId]);

  const fetchSessions = async () => {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .order('session_number', { ascending: false });

    if (error) {
      toast.error(`Failed to load sessions: ${error.message}`);
      return;
    }

    setSessions((data || []) as SessionRow[]);
  };

  const fetchRoster = async () => {
    const { data, error } = await supabase.from('students_roster').select('*');

    if (error) {
      toast.error(`Failed to load roster: ${error.message}`);
      return;
    }

    setRoster((data || []) as RosterRow[]);
  };

  const fetchAttendance = async (sessionId: string) => {
    setIsLoading(true);

    const { data, error } = await supabase
      .from('attendance')
      .select('*, students_roster(student_name, class_no)')
      .eq('session_id', sessionId);

    if (error) {
      toast.error(`Failed to load attendance: ${error.message}`);
      setAttendanceData([]);
      setIsLoading(false);
      return;
    }

    const flatData = ((data || []) as AttendanceRow[]).map((row) => ({
      ...row,
      student_name: row.students_roster?.student_name,
      class_no: row.students_roster?.class_no,
    }));

    setAttendanceData(flatData);
    setIsLoading(false);
  };

  const scheduleCanonicalSync = (source: string) => {
    if (autoSyncTimerRef.current) {
      clearTimeout(autoSyncTimerRef.current);
    }

    autoSyncTimerRef.current = setTimeout(async () => {
      try {
        const { ok } = await syncPublicAttendanceSnapshot({ source });

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
      const { ok } = await syncPublicAttendanceSnapshot({ source: 'attendance_marking_manual' });

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

      const newRecords = roster.map((student) => ({
        session_id: selectedSessionId,
        erp: student.erp,
        status: absentSet.has(student.erp.toLowerCase()) ? 'absent' : 'present',
        naming_penalty: false,
      }));

      if (forceOverwrite || attendanceData.length > 0) {
        const { error: deleteError } = await supabase.from('attendance').delete().eq('session_id', selectedSessionId);
        if (deleteError) throw deleteError;
      }

      const { error: insertError } = await supabase.from('attendance').insert(newRecords);
      if (insertError) throw insertError;

      toast.success('Attendance marked successfully');
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

    setAttendanceData((prev) => prev.map((row) => (row.id === record.id ? { ...row, status: nextStatus } : row)));

    const { error } = await supabase.from('attendance').update({ status: nextStatus }).eq('id', record.id);

    if (error) {
      toast.error('Failed to update status');
      setAttendanceData((prev) => prev.map((row) => (row.id === record.id ? { ...row, status: record.status } : row)));
      return;
    }

    scheduleCanonicalSync('attendance_marking_status_toggle');
  };

  const toggleNamingPenalty = async (record: AttendanceRow, checked: boolean) => {
    setAttendanceData((prev) => prev.map((row) => (row.id === record.id ? { ...row, naming_penalty: checked } : row)));

    const { error } = await supabase
      .from('attendance')
      .update({ naming_penalty: checked } as never)
      .eq('id', record.id);

    if (error) {
      toast.error('Failed to update naming penalty');
      setAttendanceData((prev) => prev.map((row) => (row.id === record.id ? { ...row, naming_penalty: !checked } : row)));
      return;
    }

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

  const filteredAttendance = attendanceData.filter((record) => {
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

  const presentCount = attendanceData.filter((record) => record.status === 'present').length;
  const absentCount = attendanceData.filter((record) => record.status === 'absent').length;
  const excusedCount = attendanceData.filter((record) => record.status === 'excused').length;
  const penalizedCount = attendanceData.filter((record) => record.naming_penalty).length;

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <Card className="h-fit md:col-span-1">
        <CardHeader>
          <CardTitle>Mark Attendance</CardTitle>
          <CardDescription>Select a session and paste absent ERPs</CardDescription>
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
            <span className="text-sm font-medium">Absent ERPs</span>
            <Textarea
              placeholder="Paste ERPs here (space or newline separated)..."
              className="min-h-[200px] font-mono"
              value={absentErps}
              onChange={(event) => setAbsentErps(event.target.value)}
            />
          </div>

          <Button className="w-full" onClick={() => handleMarkSubmit(false)} disabled={!selectedSessionId || isSaving}>
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

      <Card className="md:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between space-x-2">
            <div>
              <CardTitle>Attendance List</CardTitle>
              <CardDescription className="mt-1 text-xs text-muted-foreground">
                Changes to status and penalties save automatically
              </CardDescription>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" onClick={handleManualSync} disabled={isSyncing || isSaving}>
                {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Sync to Sheet
              </Button>
              <Input
                placeholder="Search Name or ERP"
                className="w-[150px]"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {selectedSessionId && attendanceData.length > 0 && (
            <div className="mb-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-green-500/20 bg-green-500/10 text-green-500">
                  {presentCount} Present
                </Badge>
                <Badge variant="outline" className="border-red-500/20 bg-red-500/10 text-red-500">
                  {absentCount} Absent
                </Badge>
                <Badge variant="outline" className="border-yellow-500/20 bg-yellow-500/10 text-yellow-500">
                  {excusedCount} Excused
                </Badge>
                <Badge variant="outline" className="border-blue-500/20 bg-blue-500/10 text-blue-500">
                  {penalizedCount} Penalized
                </Badge>
                <Badge variant="outline" className="bg-muted text-muted-foreground">
                  {attendanceData.length} / {roster.length} Total
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={activeFilters.size === 0 ? 'default' : 'outline'}
                  onClick={() => setActiveFilters(new Set())}
                >
                  All ({attendanceData.length})
                </Button>
                <Button
                  size="sm"
                  variant={activeFilters.has('present') ? 'default' : 'outline'}
                  onClick={() => toggleActiveFilter('present')}
                >
                  Present ({presentCount})
                </Button>
                <Button
                  size="sm"
                  variant={activeFilters.has('absent') ? 'default' : 'outline'}
                  onClick={() => toggleActiveFilter('absent')}
                >
                  Absent ({absentCount})
                </Button>
                <Button
                  size="sm"
                  variant={activeFilters.has('penalized') ? 'default' : 'outline'}
                  onClick={() => toggleActiveFilter('penalized')}
                >
                  Penalized ({penalizedCount})
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
          ) : attendanceData.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No attendance marked for this session yet.</div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>ERP</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Naming Penalty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAttendance.slice(0, 100).map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>{record.class_no}</TableCell>
                      <TableCell>{record.student_name}</TableCell>
                      <TableCell>{record.erp}</TableCell>
                      <TableCell>
                        <Badge
                          className={`cursor-pointer select-none ${
                            record.status === 'present'
                              ? 'bg-green-500 hover:bg-green-600'
                              : record.status === 'absent'
                                ? 'bg-red-500 hover:bg-red-600'
                                : 'bg-yellow-500 hover:bg-yellow-600'
                          }`}
                          onClick={() => toggleStatus(record)}
                        >
                          {record.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`np-${record.id}`}
                            checked={record.naming_penalty}
                            onCheckedChange={(checked) => toggleNamingPenalty(record, checked as boolean)}
                          />
                          <label
                            htmlFor={`np-${record.id}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            -1
                          </label>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
