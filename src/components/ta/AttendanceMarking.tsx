import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
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
import { syncPublicAttendanceSnapshot } from '@/lib/public-attendance-sync';
import { emitAttendanceDataUpdated, subscribeRosterDataUpdated } from '@/lib/data-sync-events';
import { Loader2, Save } from 'lucide-react';
import { sendNtfyNotification } from '@/lib/ntfy';
import type { ZoomSessionReport } from '@/lib/zoom-session-report';

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

interface AttendanceRowWithRoster extends AttendanceRow {
  students_roster?: {
    student_name?: string;
    class_no?: string;
  } | null;
}

const AUTO_SYNC_DELAY_MS = 1200;

interface AttendanceMarkingProps {
  latestFinalZoomReport?: ZoomSessionReport | null;
}

export default function AttendanceMarking({ latestFinalZoomReport = null }: AttendanceMarkingProps) {
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
      void (async () => {
        const latestRoster = roster.length > 0 ? roster : await fetchRoster();
        await fetchAttendance(selectedSessionId, latestRoster);
      })();
      return;
    }

    setAttendanceData([]);
  }, [selectedSessionId]);

  useEffect(() => {
    const unsubscribe = subscribeRosterDataUpdated(() => {
      void (async () => {
        const latestRoster = await fetchRoster();

        if (selectedSessionId) {
          await fetchAttendance(selectedSessionId, latestRoster);
        }
      })();
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

  const fetchRoster = async (): Promise<RosterRow[]> => {
    const { data, error } = await supabase.from('students_roster').select('*');

    if (error) {
      toast.error(`Failed to load roster: ${error.message}`);
      return [];
    }

    const nextRoster = (data || []) as RosterRow[];
    setRoster(nextRoster);
    return nextRoster;
  };

  const loadSessionAttendanceRows = async (sessionId: string) => {
    const { data, error } = await supabase
      .from('attendance')
      .select('*, students_roster(student_name, class_no)')
      .eq('session_id', sessionId);

    if (error) {
      return { rows: [] as AttendanceRow[], error };
    }

    const rows = ((data || []) as AttendanceRowWithRoster[]).map((row) => ({
      ...row,
      student_name: row.students_roster?.student_name,
      class_no: row.students_roster?.class_no,
    }));

    return { rows, error: null };
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

    const payload = missingStudents.map((student) => ({
      session_id: sessionId,
      erp: student.erp,
      status: 'absent',
      naming_penalty: false,
    }));

    const { error } = await supabase
      .from('attendance')
      .upsert(payload as never, { onConflict: 'session_id,erp', ignoreDuplicates: true });

    if (error) {
      toast.error(`Failed to backfill missing students: ${error.message}`);
      return false;
    }

    return true;
  };

  const fetchAttendance = async (sessionId: string, rosterOverride?: RosterRow[]) => {
    setIsLoading(true);
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
        setAttendanceData([]);
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
    } finally {
      setIsLoading(false);
    }
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

      let zoomReportSaved = false;
      if (latestFinalZoomReport) {
        const { error: reportSaveError } = await supabase
          .from('sessions')
          .update({
            zoom_report: latestFinalZoomReport,
            zoom_report_saved_at: new Date().toISOString(),
          })
          .eq('id', selectedSessionId);

        if (reportSaveError) {
          toast.warning('Attendance saved, but failed to store the Zoom report.', {
            description: reportSaveError.message,
          });
        } else {
          zoomReportSaved = true;
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

    setAttendanceData((prev) => prev.map((row) => (row.id === record.id ? { ...row, status: nextStatus } : row)));

    const { error } = await supabase.from('attendance').update({ status: nextStatus }).eq('id', record.id);

    if (error) {
      toast.error('Failed to update status');
      setAttendanceData((prev) => prev.map((row) => (row.id === record.id ? { ...row, status: record.status } : row)));
      return;
    }

    emitAttendanceDataUpdated('attendance_marking_status_toggle');
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
    <div className="ta-module-shell grid gap-6 md:grid-cols-3">
      <Card className="h-fit md:col-span-1 ta-module-card">
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
            <span className="text-sm font-medium text-debossed-body">Absent ERPs</span>
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

      <Card className="md:col-span-2 ta-module-card">
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
                  {attendanceData.length} / {roster.length} Total
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
                  <span className="status-all-text text-debossed-sm">All ({attendanceData.length})</span>
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
          ) : attendanceData.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No attendance marked for this session yet.</div>
          ) : (
              <Table scrollClassName="overflow-x-auto">
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
                          className={`ta-status-chip cursor-pointer select-none ${
                            record.status === 'present'
                              ? 'status-present status-present-table-text'
                              : record.status === 'absent'
                                ? 'status-absent status-absent-table-text'
                                : 'status-excused status-excused-table-text'
                          }`}
                          onClick={() => toggleStatus(record)}
                        >
                          {record.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => toggleNamingPenalty(record, !record.naming_penalty)}
                          aria-pressed={record.naming_penalty}
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
