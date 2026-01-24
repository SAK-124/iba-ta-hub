import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function TAExport() {
  const [isExporting, setIsExporting] = useState(false);

  const exportAttendance = async (format: 'csv' | 'xlsx') => {
    setIsExporting(true);
    try {
      const [sessionsRes, rosterRes, attendanceRes] = await Promise.all([
        supabase.from('sessions').select('*').order('session_number'),
        supabase.from('students_roster').select('*').order('class_no').order('student_name'),
        supabase.from('attendance').select('*')
      ]);

      if (!sessionsRes.data || !rosterRes.data) throw new Error('Failed to fetch data');

      const sessions = sessionsRes.data;
      const roster = rosterRes.data;
      const attendance = attendanceRes.data || [];

      // Build headers
      const headers = ['Class No', 'Student Name', 'ERP'];
      sessions.forEach(s => headers.push(`S${String(s.session_number).padStart(2, '0')}`));
      headers.push('Total Absences');

      // Build rows
      const rows = roster.map(student => {
        const row = [student.class_no, student.student_name, student.erp];
        let absences = 0;
        sessions.forEach(session => {
          const record = attendance.find(a => a.erp === student.erp && a.session_id === session.id);
          const status = record?.status || '-';
          row.push(status === 'present' ? 'P' : status === 'absent' ? 'A' : status === 'excused' ? 'E' : '-');
          if (status === 'absent') absences++;
        });
        row.push(absences.toString());
        return row;
      });

      // Generate CSV
      const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_export.${format}`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('Export downloaded!');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Download className="w-5 h-5" />Export Attendance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">Download attendance data with columns: Class No, Name, ERP, session columns (S01, S02...), and Total Absences.</p>
        <div className="flex gap-4">
          <Button onClick={() => exportAttendance('csv')} disabled={isExporting}>
            {isExporting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Download className="w-4 h-4 mr-2" />Download CSV
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
