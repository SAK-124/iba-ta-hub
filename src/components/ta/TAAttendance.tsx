import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ta/ui/card';
import { Button } from '@/components/ta/ui/button';
import { Input } from '@/components/ta/ui/input';
import { Label } from '@/components/ta/ui/label';
import { Textarea } from '@/components/ta/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ta/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ta/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ta/ui/dialog';
import { Badge } from '@/components/ta/ui/badge';
import { AlertCircle, Loader2, Plus, Save, Search, UserCheck, UserX, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ta/ui/tooltip';

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
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'absent' | 'excused'>('all');

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
          students_roster (
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
        students_roster: { student_name: string; class_no: string } | null;
      }) => ({
        id: record.id,
        erp: record.erp,
        status: record.status,
        student_name: record.students_roster?.student_name || `Unknown (${record.erp})`,
        class_no: record.students_roster?.class_no || '-'
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

  const [isUploading, setIsUploading] = useState(false);

  const handleZoomUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value to allow re-uploading the same file
    e.target.value = '';

    const loadingToast = toast.loading('Uploading and processing Zoom log...');
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      // Default threshold 0.8 (80%)
      formData.append('threshold', '0.8');

      // Use env var or fallback to a placeholder that the user must update
      const apiUrl = import.meta.env.VITE_ZOOM_API_URL;

      if (!apiUrl) {
        toast.dismiss(loadingToast);
        toast.error('API URL not configured', {
          description: 'Please set VITE_ZOOM_API_URL in your .env file.'
        });
        return;
      }

      const response = await fetch(`${apiUrl}/api/process`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to process file');
      }

      const data = await response.json();

      // Extract absent ERPs from the response
      // Expecting data.absent_rows to be a list of dicts with 'ERP' key
      const newAbsentErps: string[] = [];
      let presentCount = 0;

      if (data.absent_rows && Array.isArray(data.absent_rows)) {
        data.absent_rows.forEach((row: any) => {
          if (row.ERP) newAbsentErps.push(row.ERP.toString());
        });
      }

      if (data.attendance_rows && Array.isArray(data.attendance_rows)) {
        presentCount = data.attendance_rows.filter((r: any) => r['Attendance (>=80%)'] === 'Present' || r['Attendance (>=80%)']?.includes('Present')).length;
      }

      setAbsentErps(newAbsentErps.join(', '));

      toast.dismiss(loadingToast);
      toast.success('Zoom Log Processed', {
        description: `Found ${presentCount} present, ${newAbsentErps.length} absent.`
      });

    } catch (error: any) {
      console.error('Upload error:', error);
      toast.dismiss(loadingToast);
      toast.error('Processing Failed', {
        description: error.message
      });
    } finally {
      setIsUploading(false);
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
    <div className="ta-module-shell space-y-8 animate-fade-in">
      <div className="space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-debossed uppercase">
          Attendance Management
        </h1>
        <p className="text-muted-foreground">Track sessions and manage daily logs.</p>
      </div>

      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="neo-out p-6 rounded-[32px] border border-[#111214] space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neo-in flex items-center justify-center text-debossed-sm">
                <UserCheck className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold">Mark Attendance</h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Session</Label>
                <Select value={selectedSession} onValueChange={handleSessionChange}>
                  <SelectTrigger className="rounded-xl h-11">
                    <SelectValue placeholder="Chose session to mark..." />
                  </SelectTrigger>
                  <SelectContent className="neo-out">
                    {sessions.map(s => (
                      <SelectItem key={s.id} value={s.id} className="cursor-pointer">
                        Session {s.session_number} • {format(new Date(s.session_date), 'MMM d')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedSession && (
                <div className="space-y-4 animate-fade-in relative">
                  {/* Overlay loading state */}
                  {isUploading && (
                    <div className="absolute inset-0 bg-[rgba(24,26,28,0.78)] z-10 flex flex-col items-center justify-center rounded-xl animate-in fade-in">
                      <Loader2 className="w-8 h-8 animate-spin text-debossed-sm mb-2" />
                      <p className="text-xs font-bold text-debossed-sm animate-pulse">Processing Zoom Log...</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Absent ERPs</Label>
                      <div className="relative">
                        <input
                          type="file"
                          accept=".csv"
                          className="hidden"
                          id="zoom-upload"
                          onChange={handleZoomUpload}
                          disabled={isUploading || isSaving}
                        />
                        <Label
                          htmlFor="zoom-upload"
                          className={`text-[10px] font-bold uppercase tracking-wider text-debossed-sm cursor-pointer flex items-center gap-1 transition-colors ${isUploading ? 'pointer-events-none opacity-50' : ''}`}
                        >
                          <Upload className="w-3 h-3" /> Auto-Fill from Zoom
                        </Label>
                      </div>
                    </div>
                    <Textarea
                      value={absentErps}
                      onChange={(e) => setAbsentErps(e.target.value)}
                      placeholder="Paste ERPs here (space or comma separated)..."
                      rows={4}
                      className="rounded-xl font-mono text-sm"
                      disabled={isUploading}
                    />
                    <p className="text-[11px] text-muted-foreground italic">
                      All others will be marked as "Present" automatically.
                    </p>
                  </div>

                  <Button onClick={handleSaveAttendance} disabled={isSaving || isUploading} className="w-full h-11 rounded-xl neo-btn neo-out text-debossed-sm transition-all duration-300">
                    {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
                    Save Bulk Attendance
                  </Button>
                </div>
              )}
            </div>
          </div>

          {selectedSession && (
            <div className="neo-out p-6 rounded-[32px] border border-[#111214] space-y-4 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl neo-in flex items-center justify-center text-debossed-sm">
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
                      className="pl-9 rounded-xl h-11 font-mono"
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchStudent()}
                    />
                  </div>
                  <Button onClick={handleSearchStudent} variant="outline" className="h-11 px-6 rounded-xl">Search</Button>
                </div>

                {searchResult && (
                  <div className="p-4 neo-in rounded-xl border border-[#141517] space-y-4 animate-slide-in">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-lg">{searchResult.student_name}</p>
                        <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                          {searchResult.erp} • CL-{searchResult.class_no}
                        </p>
                      </div>
                      <span
                        className={`ta-status-chip shrink-0 ${
                          searchResult.status === 'present'
                            ? 'status-present-table-text'
                            : searchResult.status === 'absent'
                              ? 'status-absent-table-text'
                              : searchResult.status === 'excused'
                                ? 'status-excused-table-text'
                                : 'text-debossed-sm'
                        }`}
                      >
                        {searchResult.status === 'not_marked' ? 'Unmarked' : searchResult.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStudentStatus(searchResult.erp, 'present')}
                        className={`rounded-lg text-[10px] font-bold uppercase tracking-tighter ${
                          searchResult.status === 'present' ? 'active neo-in' : 'neo-out'
                        }`}
                      >
                        <span className="status-present-text text-debossed-sm">Present</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStudentStatus(searchResult.erp, 'absent')}
                        className={`rounded-lg text-[10px] font-bold uppercase tracking-tighter ${
                          searchResult.status === 'absent' ? 'active neo-in' : 'neo-out'
                        }`}
                      >
                        <span className="status-absent-text text-debossed-sm">Absent</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStudentStatus(searchResult.erp, 'excused')}
                        className={`rounded-lg text-[10px] font-bold uppercase tracking-tighter ${
                          searchResult.status === 'excused' ? 'active neo-in' : 'neo-out'
                        }`}
                      >
                        <span className="status-excused-text text-debossed-sm">Excused</span>
                      </Button>
                    </div>
                  </div>
                )}

                {existingAttendance.length > 0 && (
                  <div className="pt-2 border-t border-[#141517]">
                    <Button
                      variant="ghost"
                      className="w-full text-xs font-bold uppercase tracking-wider rounded-lg h-10 transition-all active:scale-95"
                      onClick={markAllUnmarkedAsPresent}
                      disabled={isSaving}
                    >
                      <span className="status-present-text text-debossed-sm">Mark All Unmarked as Present</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {selectedSession && existingAttendance.length > 0 && (
          <div className="neo-out p-6 rounded-[32px] border border-[#111214] space-y-4 animate-fade-in mb-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl neo-in flex items-center justify-center status-present-text">
                  <UserCheck className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold">Session Attendance • {selectedSessionData?.session_number}</h2>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="ta-status-chip status-present status-present-table-text rounded-lg">
                  {existingAttendance.filter(a => a.status === 'present').length} Present
                </Badge>
                <Badge variant="outline" className="ta-status-chip status-absent status-absent-table-text rounded-lg">
                  {existingAttendance.filter(a => a.status === 'absent').length} Absent
                </Badge>
                <Badge variant="outline" className="ta-status-chip status-excused status-excused-table-text rounded-lg">
                  {existingAttendance.filter(a => a.status === 'excused').length} Excused
                </Badge>
                <Badge variant="outline" className="ta-status-chip status-all rounded-lg">
                  {existingAttendance.length} / {roster.length} Total
                </Badge>
              </div>
            </div>

            {/* Filter Buttons */}
            <div className="flex gap-2 mb-4">
              <Button
                size="sm"
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('all')}
                className={`ta-status-filter group rounded-lg text-xs ${statusFilter === 'all' ? 'active' : ''}`}
              >
                <span className="status-led status-all-led" />
                <span className="status-all-text text-debossed-sm">All ({existingAttendance.length})</span>
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'present' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('present')}
                className={`ta-status-filter group rounded-lg text-xs ${statusFilter === 'present' ? 'active' : ''}`}
              >
                <span className="status-led status-present-led" />
                <span className="status-present-text text-debossed-sm">
                  Present ({existingAttendance.filter(a => a.status === 'present').length})
                </span>
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'absent' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('absent')}
                className={`ta-status-filter group rounded-lg text-xs ${statusFilter === 'absent' ? 'active' : ''}`}
              >
                <span className="status-led status-absent-led" />
                <span className="status-absent-text text-debossed-sm">
                  Absent ({existingAttendance.filter(a => a.status === 'absent').length})
                </span>
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'excused' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('excused')}
                className={`ta-status-filter group rounded-lg text-xs ${statusFilter === 'excused' ? 'active' : ''}`}
              >
                <span className="status-led status-excused-led" />
                <span className="status-excused-text text-debossed-sm">
                  Excused ({existingAttendance.filter(a => a.status === 'excused').length})
                </span>
              </Button>
            </div>

            <div className="overflow-hidden rounded-xl border border-[#141517]">
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
                      {existingAttendance
                        .filter(record => statusFilter === 'all' || record.status === statusFilter)
                        .map(record => (
                          <TableRow key={record.id}>
                            <TableCell className="font-mono">{record.erp}</TableCell>
                            <TableCell>{record.student_name}</TableCell>
                            <TableCell>{record.class_no}</TableCell>
                            <TableCell>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span
                                      className={`ta-status-chip cursor-pointer hover:opacity-90 transition-opacity ${
                                        record.status === 'present'
                                          ? 'status-present status-present-table-text'
                                          : record.status === 'absent'
                                            ? 'status-absent status-absent-table-text'
                                            : 'status-excused status-excused-table-text'
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
                <AlertCircle className="w-5 h-5 status-excused-table-text" />
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
