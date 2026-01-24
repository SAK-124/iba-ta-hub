import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';
import { format } from 'date-fns';

export default function AttendanceMarking() {
    const [sessions, setSessions] = useState<any[]>([]);
    const [selectedSessionId, setSelectedSessionId] = useState('');
    const [absentErps, setAbsentErps] = useState('');

    const [attendanceData, setAttendanceData] = useState<any[]>([]);
    const [roster, setRoster] = useState<any[]>([]);

    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showOverwriteAlert, setShowOverwriteAlert] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchSessions();
        fetchRoster();
    }, []);

    useEffect(() => {
        if (selectedSessionId) {
            fetchAttendance(selectedSessionId);
        } else {
            setAttendanceData([]);
        }
    }, [selectedSessionId]);

    const fetchSessions = async () => {
        const { data } = await supabase.from('sessions').select('*').order('session_number', { ascending: false });
        if (data) setSessions(data);
    };

    const fetchRoster = async () => {
        const { data } = await supabase.from('students_roster').select('*');
        if (data) setRoster(data);
    };

    const fetchAttendance = async (sessionId: string) => {
        setIsLoading(true);
        const { data } = await supabase.from('attendance').select('*, students_roster(student_name, class_no)').eq('session_id', sessionId);

        if (data && data.length > 0) {
            // Map joined data to flat structure for easier display
            const flatData = data.map(d => ({
                ...d,
                student_name: d.students_roster?.student_name,
                class_no: d.students_roster?.class_no
            }));
            setAttendanceData(flatData);
        } else {
            setAttendanceData([]);
        }
        setIsLoading(false);
    };

    const handleMarkSubmit = async (forceOverwrite = false) => {
        if (!selectedSessionId) return;

        if (attendanceData.length > 0 && !forceOverwrite) {
            setShowOverwriteAlert(true);
            return;
        }

        setIsSaving(true);
        try {
            // 1. Parse absent ERPs
            const absentList = absentErps.toLowerCase().split(/[\s,]+/).filter(Boolean);
            const absentSet = new Set(absentList);

            // 2. Prepare all records
            const newRecords = roster.map(student => ({
                session_id: selectedSessionId,
                erp: student.erp,
                status: absentSet.has(student.erp.toLowerCase()) ? 'absent' : 'present'
            }));

            // 3. Delete existing for this session (if overwrite)
            if (forceOverwrite || attendanceData.length > 0) {
                await supabase.from('attendance').delete().eq('session_id', selectedSessionId);
            }

            // 4. Insert new
            const { error } = await supabase.from('attendance').insert(newRecords);
            if (error) throw error;

            toast.success('Attendance marked successfully');
            setAbsentErps('');
            setShowOverwriteAlert(false);
            fetchAttendance(selectedSessionId);

        } catch (error: any) {
            toast.error('Failed to mark attendance: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const toggleStatus = async (record: any) => {
        const statuses = ['present', 'absent', 'excused'];
        const currentIndex = statuses.indexOf(record.status);
        const nextStatus = statuses[(currentIndex + 1) % statuses.length];

        // Optimistic update
        setAttendanceData(prev => prev.map(r => r.id === record.id ? { ...r, status: nextStatus } : r));

        const { error } = await supabase.from('attendance').update({ status: nextStatus }).eq('id', record.id);
        if (error) {
            toast.error('Failed to update status');
            // Revert
            setAttendanceData(prev => prev.map(r => r.id === record.id ? { ...r, status: record.status } : r));
        }
    };

    const filteredAttendance = attendanceData.filter(r => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            r.erp.toLowerCase().includes(q) ||
            (r.student_name && r.student_name.toLowerCase().includes(q))
        );
    });

    return (
        <div className="grid gap-6 md:grid-cols-3">
            <Card className="md:col-span-1 h-fit">
                <CardHeader>
                    <CardTitle>Mark Attendance</CardTitle>
                    <CardDescription>Select a session and paste absent ERPs</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
                        <SelectTrigger><SelectValue placeholder="Select Session" /></SelectTrigger>
                        <SelectContent>
                            {sessions.map(s => (
                                <SelectItem key={s.id} value={s.id}>
                                    #{s.session_number} - {format(new Date(s.session_date), 'MMM d')}
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
                            onChange={e => setAbsentErps(e.target.value)}
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
                                    Attendance has already been marked for this session. Proceeding will overwrite all statuses based on the current roster and your input.
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
                    <div className="flex justify-between items-center">
                        <CardTitle>Attendance List</CardTitle>
                        <Input
                            placeholder="Search Name or ERP"
                            className="w-[200px]"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    {!selectedSessionId ? (
                        <div className="text-center text-muted-foreground py-8">Select a session to view attendance.</div>
                    ) : isLoading ? (
                        <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
                    ) : attendanceData.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">No attendance marked for this session yet.</div>
                    ) : (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Class</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>ERP</TableHead>
                                        <TableHead>Status</TableHead>
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
                                                    className={`cursor-pointer select-none ${record.status === 'present' ? 'bg-green-500 hover:bg-green-600' :
                                                            record.status === 'absent' ? 'bg-red-500 hover:bg-red-600' :
                                                                'bg-yellow-500 hover:bg-yellow-600'
                                                        }`}
                                                    onClick={() => toggleStatus(record)}
                                                >
                                                    {record.status.toUpperCase()}
                                                </Badge>
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
