import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Download } from 'lucide-react';

export default function ExportData() {
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async (format: 'csv' | 'xlsx') => {
        setIsExporting(true);
        try {
            // 1. Fetch data
            const { data: roster } = await supabase.from('students_roster').select('*').order('erp');
            const { data: attendance } = await supabase.from('attendance').select('*, sessions(session_number)');
            const { data: sessions } = await supabase.from('sessions').select('*').order('session_number');

            if (!roster || !attendance || !sessions) {
                throw new Error('Failed to fetch data');
            }

            // 2. Process data
            // Rows: students
            // Cols: Class, Name, ERP, S1, S2, ..., Total Absences

            const sessionMap = new Map(); // session_id -> session_number
            sessions.forEach(s => sessionMap.set(s.id, s.session_number));

            const attendanceMap = new Map(); // erp -> { session_num -> status }
            const absenceCount = new Map(); // erp -> count
            const penaltyCount = new Map(); // erp -> count (naming penalties)

            attendance.forEach((rec: any) => {
                const sNum = rec.sessions?.session_number;
                if (sNum) {
                    if (!attendanceMap.has(rec.erp)) attendanceMap.set(rec.erp, {});
                    attendanceMap.get(rec.erp)[sNum] = rec.status;

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

        } catch (error: any) {
            console.error(error);
            alert('Export failed');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Export Attendance</CardTitle>
                <CardDescription>Download full attendance report</CardDescription>
            </CardHeader>
            <CardContent className="space-x-4">
                <Button onClick={() => handleExport('csv')} disabled={isExporting}>
                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Download CSV
                </Button>
            </CardContent>
        </Card>
    );
}
