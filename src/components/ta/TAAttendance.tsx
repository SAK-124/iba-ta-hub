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
import { AlertCircle, Loader2, Plus, Save, Search, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

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

  const selectedSessionData = sessions.find(s => s.id === selectedSession);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Mark Attendance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Select Session</Label>
              <Select value={selectedSession} onValueChange={handleSessionChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a session" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      Session {s.session_number} - {format(new Date(s.session_date), 'MMM d')} ({s.day_of_week})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedSession && (
            <>
              <div>
                <Label>Absent ERPs (space, comma, or newline separated)</Label>
                <Textarea
                  value={absentErps}
                  onChange={(e) => setAbsentErps(e.target.value)}
                  placeholder="Paste absent student ERPs here..."
                  rows={4}
                  className="font-mono"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  All students not listed will be marked as present.
                </p>
              </div>

              <Button onClick={handleSaveAttendance} disabled={isSaving}>
                {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Save className="w-4 h-4 mr-2" />
                Save Attendance
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {selectedSession && (
        <Card>
          <CardHeader>
            <CardTitle>Individual Student Update</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchErp}
                  onChange={(e) => setSearchErp(e.target.value)}
                  placeholder="Search by ERP..."
                  className="pl-9 font-mono"
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchStudent()}
                />
              </div>
              <Button onClick={handleSearchStudent}>Search</Button>
            </div>

            {searchResult && (
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{searchResult.student_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {searchResult.erp} • {searchResult.class_no}
                    </p>
                  </div>
                  <span className={`status-badge ${
                    searchResult.status === 'present' ? 'status-present' : 
                    searchResult.status === 'absent' ? 'status-absent' : 
                    searchResult.status === 'excused' ? 'status-excused' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {searchResult.status === 'not_marked' ? 'Not Marked' : searchResult.status}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant={searchResult.status === 'present' ? 'default' : 'outline'}
                    onClick={() => updateStudentStatus(searchResult.erp, 'present')}
                  >
                    <UserCheck className="w-4 h-4 mr-1" />
                    Present
                  </Button>
                  <Button 
                    size="sm" 
                    variant={searchResult.status === 'absent' ? 'destructive' : 'outline'}
                    onClick={() => updateStudentStatus(searchResult.erp, 'absent')}
                  >
                    <UserX className="w-4 h-4 mr-1" />
                    Absent
                  </Button>
                  <Button 
                    size="sm" 
                    variant={searchResult.status === 'excused' ? 'secondary' : 'outline'}
                    onClick={() => updateStudentStatus(searchResult.erp, 'excused')}
                  >
                    Excused
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedSession && existingAttendance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Current Attendance for Session {selectedSessionData?.session_number}</CardTitle>
          </CardHeader>
          <CardContent>
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
                          <span className={`status-badge ${
                            record.status === 'present' ? 'status-present' : 
                            record.status === 'absent' ? 'status-absent' : 
                            'status-excused'
                          }`}>
                            {record.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
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
  );
}
