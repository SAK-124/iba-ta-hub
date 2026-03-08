import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ta/ui/button';
import { Input } from '@/components/ta/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ta/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ta/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ta/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ta/ui/popover';
import { Calendar } from '@/components/ta/ui/calendar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ta/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ta/ui/alert-dialog';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, CalendarIcon, Clock, Pencil, Eye, EyeOff } from 'lucide-react';
import { format, getDay, parse } from 'date-fns';
import { normalizeZoomSessionReport, type ZoomReportLoadRequest } from '@/lib/zoom-session-report';
import type {
    AgentCommandEnvelope,
    HelpContextSnapshot,
    SessionAgentCommand,
} from '@/lib/ta-help-actions';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useStaleRefreshOnFocus } from '@/hooks/use-stale-refresh-on-focus';
import { removeRealtimeChannel, subscribeToRealtimeTables } from '@/lib/realtime-table-subscriptions';
import { readScopedSessionStorage, writeScopedSessionStorage } from '@/lib/scoped-session-storage';
import {
    createSession,
    deleteSession,
    listSessions,
    updateSession,
    type SessionRow,
} from '@/features/sessions';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type Session = SessionRow;
const TA_STORAGE_SCOPE = 'ta';
const SESSION_MANAGEMENT_STORAGE_KEY = 'module-sessions';

interface SessionManagementProps {
    onOpenZoomReport?: (request: ZoomReportLoadRequest) => void;
    onContextChange?: (context: string | null) => void;
    onHelpContextChange?: (snapshot: Partial<HelpContextSnapshot>) => void;
    agentPrefill?: {
        token: number;
        selectedDate: string | null;
        focusField: 'session-number' | null;
    } | null;
    onAgentPrefillHandled?: () => void;
    agentCommand?: AgentCommandEnvelope<SessionAgentCommand> | null;
    onAgentCommandHandled?: () => void;
}

interface PersistedSessionManagementState {
    sessionNum: string;
    selectedDate: string | null;
    day: string;
    customDay: string;
    useCustomDay: boolean;
    startTime: string;
    endTime: string;
    editingSession: Session | null;
    editSessionNum: string;
    editDate: string | null;
    editDay: string;
    editStartTime: string;
    editEndTime: string;
    sessionPendingDelete: Session | null;
}

export default function SessionManagement({
    onOpenZoomReport,
    onContextChange,
    onHelpContextChange,
    agentPrefill = null,
    onAgentPrefillHandled,
    agentCommand = null,
    onAgentCommandHandled,
}: SessionManagementProps = {}) {
    const { user } = useAuth();
    const userEmail = user?.email ?? null;
    const persistedState = readScopedSessionStorage<PersistedSessionManagementState>(
        TA_STORAGE_SCOPE,
        userEmail,
        SESSION_MANAGEMENT_STORAGE_KEY,
        {
            sessionNum: '',
            selectedDate: null,
            day: '',
            customDay: '',
            useCustomDay: false,
            startTime: '',
            endTime: '',
            editingSession: null,
            editSessionNum: '',
            editDate: null,
            editDay: '',
            editStartTime: '',
            editEndTime: '',
            sessionPendingDelete: null,
        },
    );
    const [sessions, setSessions] = useState<Session[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const markRefreshedRef = useRef<() => void>(() => {});
    const hasLoadedOnceRef = useRef(false);

    // New session form
    const [sessionNum, setSessionNum] = useState(persistedState.sessionNum);
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(
        persistedState.selectedDate ? new Date(persistedState.selectedDate) : undefined,
    );
    const [day, setDay] = useState<string>(persistedState.day);
    const [customDay, setCustomDay] = useState(persistedState.customDay);
    const [useCustomDay, setUseCustomDay] = useState(persistedState.useCustomDay);
    const [startTime, setStartTime] = useState(persistedState.startTime);
    const [endTime, setEndTime] = useState(persistedState.endTime);
    const [isCreating, setIsCreating] = useState(false);
    const sessionNumInputRef = useRef<HTMLInputElement>(null);
    const startTimeInputRef = useRef<HTMLInputElement>(null);
    const endTimeInputRef = useRef<HTMLInputElement>(null);

    // Edit dialog state
    const [editingSession, setEditingSession] = useState<Session | null>(persistedState.editingSession);
    const [editSessionNum, setEditSessionNum] = useState(persistedState.editSessionNum);
    const [editDate, setEditDate] = useState<Date | undefined>(
        persistedState.editDate ? new Date(persistedState.editDate) : undefined,
    );
    const [editDay, setEditDay] = useState(persistedState.editDay);
    const [editStartTime, setEditStartTime] = useState(persistedState.editStartTime);
    const [editEndTime, setEditEndTime] = useState(persistedState.editEndTime);
    const [isSaving, setIsSaving] = useState(false);
    const [sessionPendingDelete, setSessionPendingDelete] = useState<Session | null>(persistedState.sessionPendingDelete);
    const lastHandledAgentCommandTokenRef = useRef<number | null>(null);

    // Auto-detect day of week when date changes (for new session)
    useEffect(() => {
        if (selectedDate) {
            const dayIndex = getDay(selectedDate);
            setDay(DAYS_OF_WEEK[dayIndex]);
            setUseCustomDay(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        const stageLabel = editingSession
            ? `Session Management · editing session ${editingSession.session_number}`
            : sessionPendingDelete
                ? `Session Management · deleting session ${sessionPendingDelete.session_number}`
                : selectedDate
                    ? 'Session Management · creating a session'
                    : 'Session Management · overview';

        onContextChange?.(stageLabel);
    }, [editingSession, onContextChange, selectedDate, sessionPendingDelete]);

    useEffect(() => {
        onHelpContextChange?.({
            openSurface: editingSession
                ? 'edit session dialog'
                : sessionPendingDelete
                    ? 'delete session confirmation'
                    : 'create session form',
            screenDescription: editingSession
                ? 'Edit a saved session without losing its attendance data.'
                : 'Create a new class session or manage existing saved sessions.',
            visibleControls: ['Session Number', 'Date', 'Day of Week', 'Start Time', 'End Time', editingSession ? 'Save' : 'Create Session'],
            actionTargets: sessions
                .slice(0, 100)
                .map((session) => ({
                    kind: 'session' as const,
                    id: session.id,
                    label: `Session ${session.session_number}`,
                    aliases: [`#${session.session_number}`, format(new Date(session.session_date), 'PPP')],
                    meta: {
                        session_number: session.session_number,
                        session_date: session.session_date,
                        day_of_week: session.day_of_week,
                    },
                })),
        });
    }, [editingSession, onHelpContextChange, sessionPendingDelete, sessions]);

    useEffect(() => {
        if (!agentPrefill) {
            return;
        }

        if (agentPrefill.selectedDate) {
            setSelectedDate(new Date(`${agentPrefill.selectedDate}T00:00:00`));
        }

        if (agentPrefill.focusField === 'session-number') {
            window.setTimeout(() => {
                sessionNumInputRef.current?.focus();
                sessionNumInputRef.current?.select();
            }, 0);
        }

        onAgentPrefillHandled?.();
    }, [agentPrefill, onAgentPrefillHandled]);

    useEffect(() => {
        if (!agentCommand) {
            return;
        }

        if (lastHandledAgentCommandTokenRef.current === agentCommand.token) {
            return;
        }

        if (agentCommand.command.kind !== 'prepare-create-session') {
            lastHandledAgentCommandTokenRef.current = agentCommand.token;
            onAgentCommandHandled?.();
            return;
        }

        if (!hasLoadedOnceRef.current && isLoading) {
            return;
        }

        lastHandledAgentCommandTokenRef.current = agentCommand.token;

        const nextSessionNumber =
            sessions.length > 0
                ? Math.max(...sessions.map((session) => session.session_number)) + 1
                : 1;

        setSelectedDate(new Date(`${agentCommand.command.selectedDate}T00:00:00`));
        setSessionNum(String(nextSessionNumber));

        window.setTimeout(() => {
            const focusTarget =
                agentCommand.command.focusField === 'end-time'
                    ? endTimeInputRef.current
                    : agentCommand.command.focusField === 'start-time'
                        ? startTimeInputRef.current
                        : sessionNumInputRef.current;
            focusTarget?.focus();
            if (focusTarget instanceof HTMLInputElement) {
                focusTarget.select();
            }
        }, 0);

        onAgentCommandHandled?.();
    }, [agentCommand, isLoading, onAgentCommandHandled, sessions]);

    // Auto-detect day of week when edit date changes
    useEffect(() => {
        if (editDate) {
            const dayIndex = getDay(editDate);
            setEditDay(DAYS_OF_WEEK[dayIndex]);
        }
    }, [editDate]);

    useEffect(() => {
        writeScopedSessionStorage(TA_STORAGE_SCOPE, userEmail, SESSION_MANAGEMENT_STORAGE_KEY, {
            sessionNum,
            selectedDate: selectedDate ? selectedDate.toISOString() : null,
            day,
            customDay,
            useCustomDay,
            startTime,
            endTime,
            editingSession,
            editSessionNum,
            editDate: editDate ? editDate.toISOString() : null,
            editDay,
            editStartTime,
            editEndTime,
            sessionPendingDelete,
        });
    }, [
        customDay,
        day,
        editDate,
        editDay,
        editEndTime,
        editSessionNum,
        editStartTime,
        editingSession,
        endTime,
        selectedDate,
        sessionNum,
        sessionPendingDelete,
        startTime,
        useCustomDay,
        userEmail,
    ]);

    const fetchSessions = useCallback(async (mode: 'initial' | 'silent' = 'initial') => {
        const shouldShowLoader = mode === 'initial' && !hasLoadedOnceRef.current;
        if (shouldShowLoader) {
            setIsLoading(true);
        }
        try {
            const data = await listSessions();
            setSessions(data as Session[]);
            hasLoadedOnceRef.current = true;
            markRefreshedRef.current();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            toast.error('Failed to load sessions: ' + message);
        } finally {
            if (shouldShowLoader) {
                setIsLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        void fetchSessions('initial');
    }, [fetchSessions]);

    const handleCreate = async () => {
        if (!sessionNum || !selectedDate) return;

        const finalDay = useCustomDay && customDay ? customDay : day;
        if (!finalDay) {
            toast.error('Please select or enter a day');
            return;
        }

        setIsCreating(true);
        try {
            const insertData = {
                session_number: parseInt(sessionNum),
                session_date: format(selectedDate, 'yyyy-MM-dd'),
                day_of_week: finalDay,
                start_time: startTime || undefined,
                end_time: endTime || undefined,
            };
            await createSession(insertData);

            toast.success('Session created');
            resetForm();
            await fetchSessions('silent');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            toast.error('Failed to create session: ' + message);
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
        try {
            await deleteSession(id);
            toast.success('Session deleted');
            await fetchSessions('silent');
        } catch {
            toast.error('Failed to delete');
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
            const updateData = {
                session_number: parseInt(editSessionNum),
                session_date: format(editDate, 'yyyy-MM-dd'),
                day_of_week: editDay,
                start_time: editStartTime || null,
                end_time: editEndTime || null,
            };
            await updateSession(editingSession.id, updateData);

            toast.success('Session updated (attendance data preserved)');
            setEditingSession(null);
            await fetchSessions('silent');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            toast.error('Failed to update: ' + message);
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

    const { markRefreshed } = useStaleRefreshOnFocus(
        () => fetchSessions('silent'),
        { staleAfterMs: 60_000 },
    );

    useEffect(() => {
        markRefreshedRef.current = markRefreshed;
    }, [markRefreshed]);

    useEffect(() => {
        const channel = subscribeToRealtimeTables(
            `ta-sessions-${userEmail ?? 'anonymous'}`,
            [{ table: 'sessions' }],
            () => {
                void fetchSessions('silent');
            },
        );

        return () => {
            void removeRealtimeChannel(channel);
        };
    }, [fetchSessions, userEmail]);

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
                            ref={sessionNumInputRef}
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
                                                    <Button variant="ghost" size="icon" onClick={() => setSessionPendingDelete(s)}>
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

            <AlertDialog open={Boolean(sessionPendingDelete)} onOpenChange={(open) => !open && setSessionPendingDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Session?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will delete the session entry. Attendance rows stay in the database and may become orphaned.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (!sessionPendingDelete) return;
                                void handleDelete(sessionPendingDelete.id);
                                setSessionPendingDelete(null);
                            }}
                        >
                            Delete Session
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
