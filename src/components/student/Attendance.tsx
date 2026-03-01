import { useState, useEffect, useCallback } from 'react';
import { useERP } from '@/lib/erp-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { listAttendanceHistoryByErp, type AttendanceHistoryRecord } from '@/features/attendance';

interface AttendanceProps {
  canAccess: boolean | null;
  isBlocked: boolean | null | undefined;
}

export default function Attendance({ canAccess, isBlocked }: AttendanceProps) {
  const { erp } = useERP();
  const [records, setRecords] = useState<AttendanceHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalAbsences, setTotalAbsences] = useState(0);

  const fetchAttendance = useCallback(async () => {
    if (!erp) return;
    setIsLoading(true);
    try {
      const formattedRecords = await listAttendanceHistoryByErp(erp);

      setRecords(formattedRecords);
      setTotalAbsences(formattedRecords.filter((r) => r.status === 'absent').length);
    } catch (error) {
      console.error('Error fetching attendance:', error);
    } finally {
      setIsLoading(false);
    }
  }, [erp]);

  useEffect(() => {
    if (canAccess && erp) {
      void fetchAttendance();
    }
  }, [canAccess, erp, fetchAttendance]);

  if (!erp) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Please enter your ERP above to view your attendance.</p>
        </CardContent>
      </Card>
    );
  }

  if (isBlocked) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive font-medium">Your ERP wasn't found in the roster.</p>
          <p className="text-muted-foreground mt-2">Please contact the TAs via email.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-primary text-primary-foreground">
        <CardContent className="py-6">
          <div className="text-center">
            <p className="text-sm opacity-80">Total Absences</p>
            <p className="text-4xl font-bold">{totalAbsences}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attendance Records</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No attendance records found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
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
                  {records.map(record => (
                    <TableRow key={record.session_id}>
                      <TableCell className="font-medium">S{String(record.session_number).padStart(2, '0')}</TableCell>
                      <TableCell>{format(new Date(record.session_date), 'MMM d, yyyy')}</TableCell>
                      <TableCell>{record.day_of_week}</TableCell>
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
    </div>
  );
}
