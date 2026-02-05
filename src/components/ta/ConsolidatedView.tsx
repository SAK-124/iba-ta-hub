import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { saveToGoogleSheet } from '@/lib/google-sheets';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';

interface Session {
    id: string;
    session_number: number;
}

interface RosterStudent {
    id: string;
    class_no: string;
    student_name: string;
    erp: string;
}

interface AttendanceRecord {
    erp: string;
    session_id: string;
    status: string;
    naming_penalty?: boolean;
}

interface ConsolidatedStudent extends RosterStudent {
    namingPenaltyCount: number;
    absenceCount: number;
    sessionStatus: Record<string, string>;
}

export default function ConsolidatedView() {
    const [data, setData] = useState<ConsolidatedStudent[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            // Fetch everything in parallel
            const [rosterRes, sessionsRes, attendanceRes] = await Promise.all([
                supabase.from('students_roster').select('*').order('class_no').order('student_name'),
                supabase.from('sessions').select('*').order('session_number'),
                supabase.from('attendance').select('*')
            ]);

            const roster: RosterStudent[] = (rosterRes.data || []) as RosterStudent[];
            const fetchedSessions: Session[] = (sessionsRes.data || []) as Session[];
            const attendance: AttendanceRecord[] = (attendanceRes.data || []) as AttendanceRecord[];

            setSessions(fetchedSessions);

            // Process data
            const processed = roster.map((student) => {
                const studentAttendance = attendance.filter((a) => a.erp === student.erp);

                // Calculate naming penalties count
                const namingPenaltyCount = studentAttendance.filter(a => a.naming_penalty).length;

                // Calculate total absences (not counting excused)
                const absenceCount = studentAttendance.filter(a => a.status === 'absent').length;

                // Create session map
                const sessionStatus: Record<string, string> = {};
                studentAttendance.forEach(a => {
                    sessionStatus[a.session_id] = a.status;
                });

                return {
                    ...student,
                    namingPenaltyCount,
                    absenceCount,
                    sessionStatus
                };
            });

            setData(processed);
        } catch (error) {
            console.error('Error fetching consolidated data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredData = data.filter(s =>
        s.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.erp.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.class_no.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSyncPublicAttendanceToSheet = async () => {
        setIsSyncing(true);
        try {
            const headers = [
                'Class',
                'Name',
                'ERP',
                'Penalties',
                'Absences',
                ...sessions.map((s) => `S${s.session_number}`)
            ];

            const rows = data.map((student) => [
                student.class_no,
                student.student_name,
                student.erp,
                student.namingPenaltyCount,
                student.absenceCount,
                ...sessions.map((s) => {
                    const status = student.sessionStatus[s.id];
                    if (status === 'present') return 'P';
                    if (status === 'absent') return 'A';
                    if (status === 'excused') return 'E';
                    return '-';
                })
            ]);

            const payload = {
                type: 'public_attendance_snapshot',
                generated_at: new Date().toISOString(),
                headers,
                rows,
                metadata: {
                    students: data.length,
                    sessions: sessions.length
                }
            };

            toast.info('Syncing public attendance snapshot to Google Sheet...');
            const success = await saveToGoogleSheet(payload);

            if (!success) {
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
                <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
                    <div>
                        <CardTitle>Consolidated View</CardTitle>
                        <CardDescription>Full attendance sheet with penalties</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Input
                            placeholder="Search..."
                            className="w-[220px]"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <Button
                            onClick={handleSyncPublicAttendanceToSheet}
                            disabled={isLoading || isSyncing || data.length === 0}
                            variant="outline"
                        >
                            {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                            Sync Sheet
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
                ) : (
                    <div className="rounded-md border max-h-[600px] overflow-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="sticky left-0 bg-background z-10 w-[100px]">Class</TableHead>
                                    <TableHead className="sticky left-[100px] bg-background z-10 w-[200px]">Name</TableHead>
                                    <TableHead className="w-[100px]">ERP</TableHead>
                                    <TableHead className="w-[80px] text-center font-bold text-destructive">Penalties</TableHead>
                                    <TableHead className="w-[80px] text-center font-bold">Absences</TableHead>
                                    {sessions.map(s => (
                                        <TableHead key={s.id} className="text-center w-[60px]">S{s.session_number}</TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredData.map((student) => {
                                    // Color code absences: 0-4 = green, 5 = yellow warning, 6+ = red danger
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
                                        <TableRow key={student.id}>
                                            <TableCell className="sticky left-0 bg-background font-medium">{student.class_no}</TableCell>
                                            <TableCell className="sticky left-[100px] bg-background">{student.student_name}</TableCell>
                                            <TableCell>{student.erp}</TableCell>
                                            <TableCell className="text-center font-bold">
                                                {student.namingPenaltyCount > 0 ? `-${student.namingPenaltyCount}` : '-'}
                                            </TableCell>
                                            <TableCell className={`text-center font-bold ${getAbsenceColor(student.absenceCount)} ${getAbsenceBg(student.absenceCount)}`}>
                                                {student.absenceCount}
                                            </TableCell>
                                            {sessions.map(s => {
                                                const status = student.sessionStatus[s.id];
                                                let symbol = '-';
                                                let color = '';

                                                if (status === 'present') { symbol = 'P'; color = 'text-green-600 font-bold'; }
                                                else if (status === 'absent') { symbol = 'A'; color = 'text-red-600 font-bold'; }
                                                else if (status === 'excused') { symbol = 'E'; color = 'text-yellow-600 font-bold'; }

                                                return (
                                                    <TableCell key={s.id} className={`text-center ${color}`}>
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
