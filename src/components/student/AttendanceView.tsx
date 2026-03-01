import { useERP } from '@/lib/erp-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useStudentAttendanceQuery, type StudentAttendanceRecord } from '@/features/attendance';

export default function AttendanceView() {
    const { erp } = useERP();
    const { data: summary, isLoading } = useStudentAttendanceQuery(erp);
    const attendance = summary.records;
    const totalAbsences = summary.total_absences;
    const totalNamingPenalties = summary.total_naming_penalties;

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
            <div className="grid grid-cols-2 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg">Total Absences</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-4xl font-bold ${totalAbsences <= 4 ? 'text-foreground' :
                                totalAbsences === 5 ? 'text-yellow-500' :
                                    'text-red-500'
                            }`}>
                            {totalAbsences}
                        </div>
                        {totalAbsences >= 5 && (
                            <p className={`text-sm mt-1 ${totalAbsences === 5 ? 'text-yellow-500' : 'text-red-500'}`}>
                                {totalAbsences === 5 ? '⚠️ Warning threshold reached' : '🚨 Critical - contact TA'}
                            </p>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg">Naming Penalties</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-bold text-destructive">-{totalNamingPenalties}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Session History</CardTitle>
                    <CardDescription>Your attendance record by session</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Session #</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Day</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Naming Penalty</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {attendance.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                            No attendance records found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    attendance.map((record: StudentAttendanceRecord) => (
                                        <TableRow key={record.session_number}>
                                            <TableCell className="font-medium">{record.session_number}</TableCell>
                                            <TableCell>{format(new Date(record.session_date), 'PPP')}</TableCell>
                                            <TableCell>{record.day_of_week}</TableCell>
                                            <TableCell>
                                                <Badge className={getStatusColor(record.status)}>
                                                    {record.status.toUpperCase()}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {record.naming_penalty && (
                                                    <Badge variant="destructive" className="ml-auto">
                                                        Naming penalty (-1)
                                                    </Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
