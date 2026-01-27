import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Loader2, Plus, Save, Search, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Session {
  id: string;
  session_number: number;
  session_date: string;
  day_of_week: string;
  end_time: string | null;
}

interface Student {
  erp: string;
  student_name: string;
  class_no: string;
}

interface AttendanceRecord {
  id: string;
  erp: string;
  status: string;
  student_name?: string;
  class_no?: string;
}

export default function TAAttendance() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [absentErps, setAbsentErps] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [existingAttendance, setExistingAttendance] = useState<AttendanceRecord[]>([]);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [searchErp, setSearchErp] = useState('');
  const [searchResult, setSearchResult] = useState<AttendanceRecord | null>(null);
  const [roster, setRoster] = useState<Student[]>([]);

  useEffect(() => {
    fetchSessions();
    fetchRoster();
  }, []);

  const fetchSessions = async () => {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .order('session_number', { ascending: false });

    if (error) {
      console.error('Error fetching sessions:', error);
      return;
    }
    setSessions(data || []);
  };

  const fetchRoster = async () => {
    const { data, error } = await supabase
      .from('students_roster')
      .select('erp, student_name, class_no');

    if (error) {
      console.error('Error fetching roster:', error);
      return;
    }
    setRoster(data || []);
  };

  const fetchExistingAttendance = async (sessionId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          id,
          erp,
          status,
          students_roster!inner (
            student_name,
            class_no
          )
        `)
        .eq('session_id', sessionId);

      if (error) throw error;

      const formatted = (data || []).map((record: {
        id: string;
        erp: string;
        status: string;
        students_roster: { student_name: string; class_no: string };
      }) => ({
        id: record.id,
        erp: record.erp,
        status: record.status,
        student_name: record.students_roster.student_name,
        class_no: record.students_roster.class_no
      }));

      setExistingAttendance(formatted);
    } catch (error) {
      console.error('Error fetching attendance:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSessionChange = (sessionId: string) => {
    setSelectedSession(sessionId);
    if (sessionId) {
      fetchExistingAttendance(sessionId);
    } else {
      setExistingAttendance([]);
    }
  };

  const parseAbsentErps = (input: string): string[] => {
    return input
      .split(/[\s,]+/)
      .map(erp => erp.trim())
      .filter(erp => erp.length > 0);
  };

  const handleSaveAttendance = async () => {
    if (!selectedSession) return;

    const absentList = parseAbsentErps(absentErps);

    // Check if attendance already exists
    if (existingAttendance.length > 0) {
      setShowOverwriteDialog(true);
      return;
    }

    await writeAttendance(absentList);
  };

  const writeAttendance = async (absentList: string[]) => {
    setIsSaving(true);
    try {
      // Delete existing attendance for this session
      await supabase
        .from('attendance')
        .delete()
        .eq('session_id', selectedSession);

      // Create attendance records for all students
      const attendanceRecords = roster.map(student => ({
        session_id: selectedSession,
        erp: student.erp,
        status: absentList.includes(student.erp) ? 'absent' : 'present'
      }));

      const { error } = await supabase
        .from('attendance')
        .insert(attendanceRecords);

      if (error) throw error;

      toast.success('Attendance saved successfully!');
      setAbsentErps('');
      fetchExistingAttendance(selectedSession);
    } catch (error) {
      console.error('Error saving attendance:', error);
      toast.error('Failed to save attendance');
    } finally {
      setIsSaving(false);
      setShowOverwriteDialog(false);
    }
  };

  const handleSearchStudent = async () => {
    if (!searchErp || !selectedSession) return;

    const record = existingAttendance.find(a => a.erp === searchErp);
    if (record) {
      setSearchResult(record);
    } else {
      // Check if student exists in roster
      const student = roster.find(s => s.erp === searchErp);
      if (student) {
        setSearchResult({
          id: '',
          erp: student.erp,
          status: 'not_marked',
          student_name: student.student_name,
          class_no: student.class_no
        });
      } else {
        toast.error('Student not found in roster');
        setSearchResult(null);
      }
    }
  };
  const getNextStatus = (currentStatus: string) => {
    switch (currentStatus) {
      case 'present': return 'absent';
      case 'absent': return 'excused';
      case 'excused': return 'present';
      default: return 'present';
    }
  };

  const updateStudentStatus = async (erp: string, newStatus: string) => {
    if (!selectedSession) return;

    try {
      // Check if record exists
      const existing = existingAttendance.find(a => a.erp === erp);

      if (existing?.id) {
        // Update existing record
        const { error } = await supabase
          .from('attendance')
          .update({ status: newStatus })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from('attendance')
          .insert([{
            session_id: selectedSession,
            erp: erp,
            status: newStatus
          }]);

        if (error) throw error;
      }

      toast.success(`Student marked as ${newStatus}`);
      fetchExistingAttendance(selectedSession);
      setSearchResult(null);
      setSearchErp('');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const markAllUnmarkedAsPresent = async () => {
    if (!selectedSession) return;

    setIsSaving(true);
    try {
      // Find students in roster who are NOT in existingAttendance
      const markedErps = new Set(existingAttendance.map(a => a.erp));
      const unmarkedStudents = roster.filter(s => !markedErps.has(s.erp));

      if (unmarkedStudents.length === 0) {
        toast.info('All students are already marked.');
        return;
      }

      const recordsToInsert = unmarkedStudents.map(student => ({
        session_id: selectedSession,
        erp: student.erp,
        status: 'present'
      }));

      const { error } = await supabase
        .from('attendance')
        .insert(recordsToInsert);

      if (error) throw error;

      toast.success(`Marked ${unmarkedStudents.length} students as present.`);
      fetchExistingAttendance(selectedSession);
    } catch (error) {
      console.error('Error marking all as present:', error);
      toast.error('Failed to bulk update attendance');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedSessionData = sessions.find(s => s.id === selectedSession);

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground uppercase">
          Attendance Management
        </h1>
        <p className="text-muted-foreground">Track sessions and manage daily logs.</p>
      </div>

      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="glass-card p-6 rounded-2xl border border-primary/10 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                <UserCheck className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold">Mark Attendance</h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Session</Label>
                <Select value={selectedSession} onValueChange={handleSessionChange}>
                  <SelectTrigger className="bg-background/50 border-primary/20 rounded-xl h-11 transition-all duration-300 focus:ring-2 focus:ring-primary/20">
                    <SelectValue placeholder="Chose session to mark..." />
                  </SelectTrigger>
                  <SelectContent className="glass-card">
                    {sessions.map(s => (
                      <SelectItem key={s.id} value={s.id} className="cursor-pointer hover:bg-primary/10">
                        Session {s.session_number} • {format(new Date(s.session_date), 'MMM d')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedSession && (
                <div className="space-y-4 animate-fade-in">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Absent ERPs</Label>
                    <Textarea
                      value={absentErps}
                      onChange={(e) => setAbsentErps(e.target.value)}
                      placeholder="Paste ERPs here (space or comma separated)..."
                      rows={4}
                      className="bg-background/50 border-primary/20 rounded-xl font-mono text-sm focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-[11px] text-muted-foreground italic">
                      All others will be marked as "Present" automatically.
                    </p>
                  </div>

                  <Button onClick={handleSaveAttendance} disabled={isSaving} className="w-full h-11 rounded-xl shadow-lg shadow-primary/20 transition-all duration-300 hover:scale-[1.02]">
                    {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
                    Save Bulk Attendance
                  </Button>
                </div>
              )}
            </div>
          </div>

          {selectedSession && (
            <div className="glass-card p-6 rounded-2xl border border-primary/10 space-y-4 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center text-accent">
                  <Search className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold">Quick Update</h2>
              </div>

              <div className="space-y-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={searchErp}
                      onChange={(e) => setSearchErp(e.target.value)}
                      placeholder="Search ERP..."
                      className="pl-9 bg-background/50 border-primary/20 rounded-xl h-11 font-mono focus:ring-2 focus:ring-primary/20"
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchStudent()}
                    />
                  </div>
                  <Button onClick={handleSearchStudent} variant="outline" className="h-11 px-6 rounded-xl border-primary/20 hover:bg-primary/10">Search</Button>
                </div>

                {searchResult && (
                  <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 space-y-4 animate-slide-in">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-lg">{searchResult.student_name}</p>
                        <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                          {searchResult.erp} • CL-{searchResult.class_no}
                        </p>
                      </div>
                      <span className={`status-badge shrink-0 ${searchResult.status === 'present' ? 'status-present' :
                        searchResult.status === 'absent' ? 'status-absent' :
                          searchResult.status === 'excused' ? 'status-excused' :
                            'bg-muted text-muted-foreground border border-border/50'
                        }`}>
                        {searchResult.status === 'not_marked' ? 'Unmarked' : searchResult.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        size="sm"
                        variant={searchResult.status === 'present' ? 'default' : 'outline'}
                        onClick={() => updateStudentStatus(searchResult.erp, 'present')}
                        className="rounded-lg text-[10px] font-bold uppercase tracking-tighter"
                      >
                        Present
                      </Button>
                      <Button
                        size="sm"
                        variant={searchResult.status === 'absent' ? 'destructive' : 'outline'}
                        onClick={() => updateStudentStatus(searchResult.erp, 'absent')}
                        className="rounded-lg text-[10px] font-bold uppercase tracking-tighter"
                      >
                        Absent
                      </Button>
                      <Button
                        size="sm"
                        variant={searchResult.status === 'excused' ? 'secondary' : 'outline'}
                        onClick={() => updateStudentStatus(searchResult.erp, 'excused')}
                        className="rounded-lg text-[10px] font-bold uppercase tracking-tighter"
                      >
                        Excused
                      </Button>
                    </div>
                  </div>
                )}

                {existingAttendance.length > 0 && (
                  <div className="pt-2 border-t border-primary/10">
                    <Button
                      variant="ghost"
                      className="w-full text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/5 rounded-lg h-10 transition-all active:scale-95"
                      onClick={markAllUnmarkedAsPresent}
                      disabled={isSaving}
                    >
                      Mark All Unmarked as Present
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {selectedSession && existingAttendance.length > 0 && (
          <div className="glass-card p-6 rounded-2xl border border-primary/10 space-y-4 animate-fade-in mb-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-success/20 flex items-center justify-center text-success">
                  <UserCheck className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold">Session Attendance • {selectedSessionData?.session_number}</h2>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="rounded-lg bg-success/10 text-success border-success/20">
                  {existingAttendance.filter(a => a.status === 'present').length} Present
                </Badge>
                <Badge variant="outline" className="rounded-lg bg-destructive/10 text-destructive border-destructive/20">
                  {existingAttendance.filter(a => a.status === 'absent').length} Absent
                </Badge>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-primary/10">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="overflow-x-auto max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ERP</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Class</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {existingAttendance.map(record => (
                        <TableRow key={record.id}>
                          <TableCell className="font-mono">{record.erp}</TableCell>
                          <TableCell>{record.student_name}</TableCell>
                          <TableCell>{record.class_no}</TableCell>
                          <TableCell>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className={`status-badge cursor-pointer hover:opacity-80 transition-opacity ${record.status === 'present' ? 'status-present' :
                                      record.status === 'absent' ? 'status-absent' :
                                        'status-excused'
                                      }`}
                                    onClick={() => updateStudentStatus(record.erp, getNextStatus(record.status))}
                                  >
                                    {record.status}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Click to toggle status</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        )}

        <Dialog open={showOverwriteDialog} onOpenChange={setShowOverwriteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-warning" />
                Attendance Already Exists
              </DialogTitle>
              <DialogDescription>
                Attendance has already been written for this session. Do you want to overwrite it?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowOverwriteDialog(false)}>
                Cancel
              </Button>
              <Button onClick={() => writeAttendance(parseAbsentErps(absentErps))}>
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Yes, Overwrite
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
