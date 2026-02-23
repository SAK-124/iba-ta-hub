import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ta/ui/button';
import { Input } from '@/components/ta/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ta/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ta/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ta/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ta/ui/popover';
import { Calendar } from '@/components/ta/ui/calendar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ta/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, CalendarIcon, Clock, Pencil, Eye, EyeOff } from 'lucide-react';
import { format, getDay, parse } from 'date-fns';
import { normalizeZoomSessionReport, type ZoomReportLoadRequest } from '@/lib/zoom-session-report';
import { cn } from '@/lib/utils';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface Session {
    id: string;
    session_number: number;
    session_date: string;
    day_of_week: string;
    start_time?: string | null;
    end_time?: string | null;
    zoom_report?: unknown;
    zoom_report_saved_at?: string | null;
}

interface SessionManagementProps {
    onOpenZoomReport?: (request: ZoomReportLoadRequest) => void;
}

export default function SessionManagement({ onOpenZoomReport }: SessionManagementProps = {}) {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // New session form
    const [sessionNum, setSessionNum] = useState('');
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
    const [day, setDay] = useState<string>('');
    const [customDay, setCustomDay] = useState('');
    const [useCustomDay, setUseCustomDay] = useState(false);
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const startTimeInputRef = useRef<HTMLInputElement>(null);
    const endTimeInputRef = useRef<HTMLInputElement>(null);

    // Edit dialog state
    const [editingSession, setEditingSession] = useState<Session | null>(null);
    const [editSessionNum, setEditSessionNum] = useState('');
    const [editDate, setEditDate] = useState<Date | undefined>(undefined);
    const [editDay, setEditDay] = useState('');
    const [editStartTime, setEditStartTime] = useState('');
    const [editEndTime, setEditEndTime] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchSessions();
    }, []);

    // Auto-detect day of week when date changes (for new session)
    useEffect(() => {
        if (selectedDate) {
            const dayIndex = getDay(selectedDate);
            setDay(DAYS_OF_WEEK[dayIndex]);
            setUseCustomDay(false);
        }
    }, [selectedDate]);

    // Auto-detect day of week when edit date changes
    useEffect(() => {
        if (editDate) {
            const dayIndex = getDay(editDate);
            setEditDay(DAYS_OF_WEEK[dayIndex]);
        }
    }, [editDate]);

    const fetchSessions = async () => {
        setIsLoading(true);
        const { data } = await supabase.from('sessions').select('*').order('session_number', { ascending: false });
        if (data) setSessions(data as Session[]);
        setIsLoading(false);
    };

    const handleCreate = async () => {
        if (!sessionNum || !selectedDate) return;

        const finalDay = useCustomDay && customDay ? customDay : day;
        if (!finalDay) {
            toast.error('Please select or enter a day');
            return;
        }

        setIsCreating(true);
        try {
            const insertData: any = {
                session_number: parseInt(sessionNum),
                session_date: format(selectedDate, 'yyyy-MM-dd'),
                day_of_week: finalDay,
            };

            // Only add times if they have values
            if (startTime) insertData.start_time = startTime;
            if (endTime) insertData.end_time = endTime;

            const { error } = await supabase.from('sessions').insert(insertData);

            if (error) throw error;

            toast.success('Session created');
            resetForm();
            fetchSessions();
        } catch (error: any) {
            toast.error('Failed to create session: ' + error.message);
        } finally {
            setIsCreating(false);
        }
    };

    const resetForm = () => {
        setSessionNum('');
        setSelectedDate(undefined);
        setDay('');
        setCustomDay('');
        setUseCustomDay(false);
        setStartTime('');
        setEndTime('');
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure? This will delete the session. Attendance data will remain but become orphaned.')) return;
        const { error } = await supabase.from('sessions').delete().eq('id', id);
        if (error) {
            toast.error('Failed to delete');
        } else {
            toast.success('Session deleted');
            fetchSessions();
        }
    };

    const openEditDialog = (session: Session) => {
        setEditingSession(session);
        setEditSessionNum(session.session_number.toString());
        setEditDate(new Date(session.session_date));
        setEditDay(session.day_of_week);
        setEditStartTime(session.start_time || '');
        setEditEndTime(session.end_time || '');
    };

    const handleOpenSavedReport = (session: Session) => {
        if (!onOpenZoomReport) return;

        const report = normalizeZoomSessionReport(session.zoom_report);
        if (!report) {
            toast.error('No saved Zoom report found for this session.');
            return;
        }

        onOpenZoomReport({
            sessionId: session.id,
            sessionNumber: session.session_number,
            sessionDate: session.session_date,
            report,
        });
    };

    const handleSaveEdit = async () => {
        if (!editingSession || !editSessionNum || !editDate || !editDay) return;

        setIsSaving(true);
        try {
            const updateData: any = {
                session_number: parseInt(editSessionNum),
                session_date: format(editDate, 'yyyy-MM-dd'),
                day_of_week: editDay,
                start_time: editStartTime || null,
                end_time: editEndTime || null,
            };

            const { error } = await supabase
                .from('sessions')
                .update(updateData)
                .eq('id', editingSession.id);

            if (error) throw error;

            toast.success('Session updated (attendance data preserved)');
            setEditingSession(null);
            fetchSessions();
        } catch (error: any) {
            toast.error('Failed to update: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const formatTime = (time: string | null | undefined) => {
        if (!time) return '-';
        try {
            // Parse HH:mm format and display nicely
            const parsed = parse(time, 'HH:mm', new Date());
            return format(parsed, 'h:mm a');
        } catch {
            return time;
        }
    };

    const openTimePicker = (inputRef: { current: HTMLInputElement | null }) => {
        const input = inputRef.current;
        if (!input) return;
        const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
        if (typeof pickerInput.showPicker === 'function') {
            pickerInput.showPicker();
            return;
        }
        input.focus();
        input.click();
    };

    return (
        <div className="ta-module-shell grid gap-6 md:grid-cols-3">
            <Card className="md:col-span-1 h-fit ta-module-card">
                <CardHeader>
                    <CardTitle>Add Session</CardTitle>
                    <CardDescription>Create a new class session</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Session Number */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-muted-foreground">Session Number</label>
                        <Input
                            placeholder="e.g. 1"
                            type="number"
                            value={sessionNum}
                            onChange={e => setSessionNum(e.target.value)}
                        />
                    </div>

                    {/* Date Picker */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-muted-foreground">Date</label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !selectedDate && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {selectedDate ? format(selectedDate, 'PPP') : 'Pick a date'}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={selectedDate}
                                    onSelect={setSelectedDate}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Day of Week */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-muted-foreground">Day of Week</label>
                            {selectedDate && day && !useCustomDay && (
                                <span className="text-xs text-debossed-sm status-all-text">Auto: {day}</span>
                            )}
                        </div>
                        <Select
                            value={useCustomDay ? 'custom' : day}
                            onValueChange={(v) => {
                                if (v === 'custom') {
                                    setUseCustomDay(true);
                                } else {
                                    setUseCustomDay(false);
                                    setDay(v);
                                }
                            }}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select day" />
                            </SelectTrigger>
                            <SelectContent>
                                {DAYS_OF_WEEK.map(d => (
                                    <SelectItem key={d} value={d}>{d}</SelectItem>
                                ))}
                                <SelectItem value="custom">Custom...</SelectItem>
                            </SelectContent>
                        </Select>
                        {useCustomDay && (
                            <Input
                                placeholder="e.g. Holiday Makeup"
                                value={customDay}
                                onChange={e => setCustomDay(e.target.value)}
                                className="mt-2"
                            />
                        )}
                    </div>

                    {/* Time Inputs */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-muted-foreground">Start Time</label>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => openTimePicker(startTimeInputRef)}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-debossed-sm status-all-text transition-colors duration-300"
                                    aria-label="Open start time picker"
                                >
                                    <Clock className="h-4 w-4" />
                                </button>
                                <Input
                                    type="time"
                                    value={startTime}
                                    onChange={e => setStartTime(e.target.value)}
                                    className="pl-10"
                                    ref={startTimeInputRef}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-muted-foreground">End Time</label>
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => openTimePicker(endTimeInputRef)}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-debossed-sm status-all-text transition-colors duration-300"
                                    aria-label="Open end time picker"
                                >
                                    <Clock className="h-4 w-4" />
                                </button>
                                <Input
                                    type="time"
                                    value={endTime}
                                    onChange={e => setEndTime(e.target.value)}
                                    className="pl-10"
                                    ref={endTimeInputRef}
                                />
                            </div>
                        </div>
                    </div>

                    <Button className="w-full" onClick={handleCreate} disabled={isCreating || !sessionNum || !selectedDate}>
                        {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                        Create Session
                    </Button>
                </CardContent>
            </Card>

            <Card className="md:col-span-2 ta-module-card">
                <CardHeader>
                    <CardTitle>Sessions List</CardTitle>
                    <CardDescription>Click edit to modify session details (attendance data is preserved)</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>
                    ) : sessions.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">No sessions created yet</div>
                    ) : (
                            <Table scrollClassName="overflow-x-auto">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-16">#</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Day</TableHead>
                                        <TableHead>Time</TableHead>
                                        <TableHead className="text-right w-36">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sessions.map((s) => {
                                        const hasSavedReport = !!normalizeZoomSessionReport(s.zoom_report);

                                        return (
                                            <TableRow key={s.id}>
                                                <TableCell className="font-bold status-all-table-text">{s.session_number}</TableCell>
                                                <TableCell>{format(new Date(s.session_date), 'PPP')}</TableCell>
                                                <TableCell>{s.day_of_week}</TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {s.start_time || s.end_time ? (
                                                        <>
                                                            {formatTime(s.start_time)} - {formatTime(s.end_time)}
                                                        </>
                                                    ) : '-'}
                                                </TableCell>
                                                <TableCell className="text-right space-x-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => hasSavedReport && handleOpenSavedReport(s)}
                                                        disabled={!hasSavedReport}
                                                        title={hasSavedReport ? 'Open saved Zoom report' : 'No saved Zoom report'}
                                                    >
                                                        {hasSavedReport ? (
                                                            <Eye className="h-4 w-4 text-debossed-sm" />
                                                        ) : (
                                                            <EyeOff className="h-4 w-4 text-muted-foreground/60" />
                                                        )}
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(s)}>
                                                        <Pencil className="h-4 w-4 text-debossed-sm" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)}>
                                                        <Trash2 className="h-4 w-4 status-absent-text" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                    )}
                </CardContent>
            </Card>

            {/* Edit Dialog */}
            <Dialog open={!!editingSession} onOpenChange={(open) => !open && setEditingSession(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit Session</DialogTitle>
                        <DialogDescription>
                            Modify session details. Attendance data will not be affected.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Session Number</label>
                            <Input
                                type="number"
                                value={editSessionNum}
                                onChange={e => setEditSessionNum(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Date</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-start">
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {editDate ? format(editDate, 'PPP') : 'Pick a date'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={editDate}
                                        onSelect={setEditDate}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Day of Week</label>
                            <Select value={editDay} onValueChange={setEditDay}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {DAYS_OF_WEEK.map(d => (
                                        <SelectItem key={d} value={d}>{d}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">Start Time</label>
                                <Input
                                    type="time"
                                    value={editStartTime}
                                    onChange={e => setEditStartTime(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">End Time</label>
                                <Input
                                    type="time"
                                    value={editEndTime}
                                    onChange={e => setEditEndTime(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingSession(null)}>Cancel</Button>
                        <Button onClick={handleSaveEdit} disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
