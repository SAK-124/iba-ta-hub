import { useEffect, useState } from 'react';
import { useERP } from '@/lib/erp-context';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export default function AttendanceView() {
    const { erp } = useERP();
    const [attendance, setAttendance] = useState<any[]>([]);
    const [totalAbsences, setTotalAbsences] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchAttendance = async () => {
            if (!erp) return;
            setIsLoading(true);
            const { data, error } = await supabase.rpc('get_student_attendance', { student_erp: erp });

            if (!error && data) {
                const result = data as { records: any[], total_absences: number };
                setAttendance(result.records);
                setTotalAbsences(result.total_absences);
            }
            setIsLoading(false);
        };

        fetchAttendance();
    }, [erp]);

    if (isLoading) {
        return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
    }

    const getStatusColor = (status: string) => {
        switch (status.toLowerCase()) {
            case 'present': return 'bg-green-500 hover:bg-green-600 border-transparent text-white';
            case 'absent': return 'bg-red-500 hover:bg-red-600 border-transparent text-white';
            case 'excused': return 'bg-yellow-500 hover:bg-yellow-600 border-transparent text-white';
            default: return 'secondary';
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Attendance Summary</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <div className="text-4xl font-bold">{totalAbsences}</div>
                        <div className="text-sm text-muted-foreground">Total Absences</div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Session History</CardTitle>
                    <CardDescription>Your attendance record by session</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Session #</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Day</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {attendance.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                                        No attendance records found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                attendance.map((record) => (
                                    <TableRow key={record.session_number}>
                                        <TableCell className="font-medium">{record.session_number}</TableCell>
                                        <TableCell>{format(new Date(record.session_date), 'PPP')}</TableCell>
                                        <TableCell>{record.day_of_week}</TableCell>
                                        <TableCell>
                                            <Badge className={getStatusColor(record.status)}>
                                                {record.status.toUpperCase()}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
