import { useState } from 'react';
import { Button } from '@/components/ta/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ta/ui/card';
import { Loader2, Download } from 'lucide-react';
import { listRoster } from '@/features/roster';
import { listAttendanceWithSessionNumbers } from '@/features/attendance';
import { listSessions } from '@/features/sessions';
import type { AttendanceWithSessionNumber, SessionRow } from '@/features/attendance';
import type { RosterRow } from '@/features/roster';

export default function ExportData() {
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async (format: 'csv' | 'xlsx') => {
        setIsExporting(true);
        try {
            // 1. Fetch data
            const [{ rows: rosterRows }, attendanceRows, rawSessions] = await Promise.all([
                listRoster(),
                listAttendanceWithSessionNumbers(),
                listSessions(),
            ]);
            const roster: RosterRow[] = [...rosterRows].sort((a, b) => a.erp.localeCompare(b.erp));
            const sessions: SessionRow[] = [...rawSessions].sort((a, b) => a.session_number - b.session_number);
            const attendance: AttendanceWithSessionNumber[] = attendanceRows;

            // 2. Process data
            // Rows: students
            // Cols: Class, Name, ERP, S1, S2, ..., Total Absences

            const sessionMap = new Map(); // session_id -> session_number
            sessions.forEach(s => sessionMap.set(s.id, s.session_number));

            const attendanceMap = new Map(); // erp -> { session_num -> status }
            const absenceCount = new Map(); // erp -> count
            const penaltyCount = new Map(); // erp -> count (naming penalties)

            attendance.forEach((rec) => {
                const sNum = rec.sessions?.session_number;
                if (sNum) {
                    if (!attendanceMap.has(rec.erp)) attendanceMap.set(rec.erp, {});
                    (attendanceMap.get(rec.erp) as Record<number, string>)[sNum] = rec.status;

                    if (rec.status === 'absent') {
                        absenceCount.set(rec.erp, (absenceCount.get(rec.erp) || 0) + 1);
                    }
                    if (rec.naming_penalty) {
                        penaltyCount.set(rec.erp, (penaltyCount.get(rec.erp) || 0) + 1);
                    }
                }
            });

            const header = ['Class No', 'Student Name', 'ERP', 'Naming Penalties', ...sessions.map(s => `S${s.session_number}`), 'Total Absences'];

            const csvRows = [header.join(',')];

            roster.forEach(student => {
                const totalPenalties = penaltyCount.get(student.erp) || 0;

                const row = [
                    student.class_no,
                    `"${student.student_name}"`, // Quote name to handle spaces/commas
                    student.erp,
                    totalPenalties > 0 ? `-${totalPenalties}` : '-'
                ];

                sessions.forEach(s => {
                    const status = attendanceMap.get(student.erp)?.[s.session_number];
                    let val = '';
                    if (status === 'present') val = 'P';
                    else if (status === 'absent') val = 'A';
                    else if (status === 'excused') val = 'E'; // Treat as present in totals, but E in sheet
                    else val = '-';
                    row.push(val);
                });

                row.push(absenceCount.get(student.erp) || 0);
                csvRows.push(row.join(','));
            });

            const csvContent = csvRows.join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `attendance_export_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error: unknown) {
            console.error(error);
            alert('Export failed');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="ta-module-shell">
            <Card className="ta-module-card">
                <CardHeader>
                    <CardTitle>Export Attendance</CardTitle>
                    <CardDescription>Download full attendance report</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={() => handleExport('csv')} disabled={isExporting} className="w-full sm:w-auto">
                        {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Download CSV
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
