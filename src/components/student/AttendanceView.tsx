import { useOptionalERP } from '@/lib/erp-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useStudentAttendanceQuery, type StudentAttendanceRecord } from '@/features/attendance';
import { getAbsenceCountClass, getAbsenceCountMessage } from '@/lib/absence-display';
import AttendanceDemoPreview from './AttendanceDemoPreview';

interface AttendanceViewProps {
    previewErp?: string | null;
    isPreview?: boolean;
}

export default function AttendanceView({ previewErp = null, isPreview = false }: AttendanceViewProps = {}) {
    const erpContext = useOptionalERP();
    const viewedErp = previewErp ?? erpContext?.erp ?? null;
    const { data: summary, isLoading } = useStudentAttendanceQuery(viewedErp);
    const attendance = summary.records;
    const totalAbsences = summary.total_absences;
    const totalNamingPenalties = summary.total_naming_penalties;

    const formatMinutes = (minutes: number | null | undefined) => minutes == null ? 'Unavailable' : `${minutes} min`;
    const formatSessionDate = (value: string) => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? 'Date unavailable' : format(date, 'PPP');
    };
    const getReason = (record: StudentAttendanceRecord) => {
        if (record.explanation_code === 'excused') return 'Excused';
        if (record.explanation_code === 'manual_or_legacy') return 'Recorded manually.';
        if (record.naming_penalty) return 'Present · Name format incorrect';
        if (record.explanation_code === 'no_zoom_match') return 'Absent · No matching Zoom record';
        if (record.explanation_code === 'below_cutoff') {
            return record.shortfall_minutes == null
                ? 'Absent · Below 80% cutoff'
                : `Absent · ${formatMinutes(record.shortfall_minutes)} below cutoff`;
        }
        if (record.explanation_code === 'ta_override') return 'Absent · TA override';
        return `${record.status.charAt(0).toUpperCase()}${record.status.slice(1)} · Cutoff met`;
    };

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
            {import.meta.env.DEV && !isPreview ? <AttendanceDemoPreview /> : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg">Total Absences</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-4xl font-bold ${getAbsenceCountClass(totalAbsences)}`}>
                            {totalAbsences}
                        </div>
                        {getAbsenceCountMessage(totalAbsences) && <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">{getAbsenceCountMessage(totalAbsences)}</p>}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg">Name Penalties</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-bold text-destructive">-{totalNamingPenalties}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Session History</CardTitle>
                    <CardDescription>Your attendance record by session. Expand a session to view your own Zoom evidence.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    {attendance.length === 0 ? <div className="py-8 text-center text-muted-foreground">No attendance records found.</div> : attendance.map((record: StudentAttendanceRecord) => (
                        <details key={record.session_id ?? record.session_number} className="group rounded-lg border bg-card">
                            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
                                <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                                    <span className="font-medium">Session {record.session_number}</span>
                                    <span>{formatSessionDate(record.session_date)}</span>
                                    <span>{record.day_of_week}</span>
                                    <Badge className={`w-fit ${getStatusColor(record.status)}`}>{record.status.toUpperCase()}</Badge>
                                </div>
                                <span className="flex items-center gap-1 text-right text-xs text-muted-foreground"><span>{record.naming_penalty ? 'Name penalty (-1)' : 'No name penalty'} · View details</span><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" /></span>
                            </summary>
                            <div className="border-t px-4 pb-3 pt-2 text-sm">
                                {record.details_available ? (
                                    <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                                        <div><span className="text-muted-foreground">Official window</span><p>{record.session_start_time || 'Unavailable'}–{record.session_end_time || 'Unavailable'}</p></div>
                                        <div><span className="text-muted-foreground">Official duration</span><p>{formatMinutes(record.official_minutes)}</p></div>
                                        <div><span className="text-muted-foreground">Effective duration</span><p>{formatMinutes(record.effective_minutes)} · Break {formatMinutes(record.namaz_break_minutes)}</p></div>
                                        <div><span className="text-muted-foreground">Attended</span><p>{formatMinutes(record.attended_minutes)}</p></div>
                                        <div><span className="text-muted-foreground">Required (80%)</span><p>{formatMinutes(record.required_minutes)}</p></div>
                                        <div><span className="text-muted-foreground">Shortfall</span><p>{formatMinutes(record.shortfall_minutes)}</p></div>
                                        <div className="sm:col-span-2 lg:col-span-3"><span className="text-muted-foreground">Reason</span><p>{getReason(record)}</p></div>
                                        <div><span className="text-muted-foreground">Actual Zoom name</span><p className="break-words">{record.zoom_names || 'No matching Zoom name'}</p></div>
                                        <div><span className="text-muted-foreground">Name format</span><p>{record.name_format || 'Unavailable'}</p></div>
                                        <div><span className="text-muted-foreground">Match method</span><p>{record.match_method || 'Unavailable'}</p></div>
                                    </div>
                                ) : <p className="text-muted-foreground">{getReason(record)}</p>}
                            </div>
                        </details>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}
