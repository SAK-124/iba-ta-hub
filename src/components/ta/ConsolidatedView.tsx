import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

export default function ConsolidatedView() {
    const [data, setData] = useState<any[]>([]);
    const [sessions, setSessions] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
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

            const roster = rosterRes.data || [];
            const fetchedSessions = sessionsRes.data || [];
            const attendance = attendanceRes.data || [];

            setSessions(fetchedSessions);

            // Process data
            const processed = roster.map(student => {
                const studentAttendance = attendance.filter((a: any) => a.erp === student.erp);

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

    return (
        <Card className="h-full">
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Consolidated View</CardTitle>
                        <CardDescription>Full attendance sheet with penalties</CardDescription>
                    </div>
                    <Input
                        placeholder="Search..."
                        className="w-[200px]"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
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
                                    // Color code absences: 0 = green, 1-2 = default, 3-4 = yellow, 5+ = red
                                    const getAbsenceColor = (count: number) => {
                                        if (count === 0) return 'text-green-500';
                                        if (count <= 2) return 'text-muted-foreground';
                                        if (count <= 4) return 'text-yellow-500';
                                        return 'text-red-500';
                                    };

                                    const getAbsenceBg = (count: number) => {
                                        if (count === 0) return '';
                                        if (count <= 2) return '';
                                        if (count <= 4) return 'bg-yellow-500/10';
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
