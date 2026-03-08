import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ta/ui/card';
import { Button } from '@/components/ta/ui/button';
import { Input } from '@/components/ta/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ta/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ta/ui/table';
import { Badge } from '@/components/ta/ui/badge';
import { toast } from 'sonner';
import { Loader2, Search, Trash2, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ta/ui/dialog';
import { Label } from '@/components/ta/ui/label';
import { Textarea } from '@/components/ta/ui/textarea';
import { subscribeRosterDataUpdated } from '@/lib/data-sync-events';
import { useAuth } from '@/lib/auth';
import { useStaleRefreshOnFocus } from '@/hooks/use-stale-refresh-on-focus';
import { removeRealtimeChannel, subscribeToRealtimeTables } from '@/lib/realtime-table-subscriptions';
import { readScopedSessionStorage, writeScopedSessionStorage } from '@/lib/scoped-session-storage';
import type {
    AgentCommandEnvelope,
    HelpContextSnapshot,
    RuleExceptionsAgentCommand,
} from '@/lib/ta-help-actions';
import {
    createRuleException,
    deleteRuleException,
    listRuleExceptions,
    type RuleExceptionRow,
} from '@/features/attendance';
import { listRoster, type RosterRow } from '@/features/roster';

type RosterStudentRow = Pick<RosterRow, 'id' | 'erp' | 'student_name' | 'class_no'>;

type CameraWarningsMap = Record<string, number>;

const CAMERA_WARNING_DURATION_MS = 5 * 60 * 1000;
let cameraWarningsCache: CameraWarningsMap = {};
const TA_STORAGE_SCOPE = 'ta';
const RULE_EXCEPTIONS_STORAGE_KEY = 'module-rule-exceptions';

const formatCountdown = (remainingMs: number) => {
    const totalSeconds = Math.max(Math.ceil(remainingMs / 1000), 0);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatWarnedAt = (timestampMs: number) =>
    new Date(timestampMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

interface PersistedRuleExceptionsState {
    filterDay: string;
    trackerSearchQuery: string;
    cameraWarnings: CameraWarningsMap;
    newErp: string;
    newType: string;
    newDay: string;
    newNotes: string;
    openDialog: boolean;
}

interface RuleExceptionsProps {
    onContextChange?: (context: string | null) => void;
    onHelpContextChange?: (snapshot: Partial<HelpContextSnapshot>) => void;
    agentCommand?: AgentCommandEnvelope<RuleExceptionsAgentCommand> | null;
    onAgentCommandHandled?: () => void;
}

const normalizeTrackerValue = (value: string) => value.trim().toLowerCase();

const findMatchingRosterStudent = (students: RosterStudentRow[], query: string) => {
    const normalizedQuery = normalizeTrackerValue(query);
    if (!normalizedQuery) {
        return null;
    }

    const matches = students.filter((student) =>
        [student.student_name, student.erp, student.class_no]
            .map((value) => normalizeTrackerValue(value))
            .some((value) => value.includes(normalizedQuery) || normalizedQuery.includes(value))
    );

    return matches.length === 1 ? matches[0] : null;
};

export default function RuleExceptions({
    onContextChange,
    onHelpContextChange,
    agentCommand = null,
    onAgentCommandHandled,
}: RuleExceptionsProps = {}) {
    const { user } = useAuth();
    const userEmail = user?.email ?? null;
    const persistedState = readScopedSessionStorage<PersistedRuleExceptionsState>(
        TA_STORAGE_SCOPE,
        userEmail,
        RULE_EXCEPTIONS_STORAGE_KEY,
        {
            filterDay: 'all',
            trackerSearchQuery: '',
            cameraWarnings: cameraWarningsCache,
            newErp: '',
            newType: 'camera_excused',
            newDay: 'both',
            newNotes: '',
            openDialog: false,
        },
    );
    const [exceptions, setExceptions] = useState<RuleExceptionRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRosterLoading, setIsRosterLoading] = useState(true);
    const [filterDay, setFilterDay] = useState(persistedState.filterDay);
    const [rosterStudents, setRosterStudents] = useState<RosterStudentRow[]>([]);
    const [trackerSearchQuery, setTrackerSearchQuery] = useState(persistedState.trackerSearchQuery);
    const [cameraWarnings, setCameraWarnings] = useState<CameraWarningsMap>(() => persistedState.cameraWarnings);
    const [clockMs, setClockMs] = useState(() => Date.now());
    const markRefreshedRef = useRef<() => void>(() => {});
    const hasLoadedExceptionsRef = useRef(false);
    const hasLoadedRosterRef = useRef(false);
    const trackerSearchInputRef = useRef<HTMLInputElement>(null);
    const addExceptionErpInputRef = useRef<HTMLInputElement>(null);
    const lastHandledAgentCommandTokenRef = useRef<number | null>(null);

    // New exception form
    const [newErp, setNewErp] = useState(persistedState.newErp);
    const [newType, setNewType] = useState(persistedState.newType);
    const [newDay, setNewDay] = useState(persistedState.newDay);
    const [newNotes, setNewNotes] = useState(persistedState.newNotes);
    const [isAdding, setIsAdding] = useState(false);
    const [openDialog, setOpenDialog] = useState(persistedState.openDialog);

    useEffect(() => {
        cameraWarningsCache = cameraWarnings;
    }, [cameraWarnings]);

    useEffect(() => {
        const stageLabel = openDialog
            ? 'Rule Exceptions · add exception dialog'
            : trackerSearchQuery.trim()
                ? 'Rule Exceptions · tracker search'
                : 'Rule Exceptions · overview';

        onContextChange?.(stageLabel);
    }, [onContextChange, openDialog, trackerSearchQuery]);

    useEffect(() => {
        onHelpContextChange?.({
            openSurface: openDialog ? 'add exception dialog' : 'camera tracker',
            screenDescription: 'Manage saved exceptions and the live camera tracker for warned students.',
            visibleControls: ['Add Exception', 'Search roster by name, ERP, or class', 'Warned', 'Clear'],
            searchQuery: trackerSearchQuery,
            filters: { day: filterDay },
            actionTargets: rosterStudents.slice(0, 150).map((student) => ({
                kind: 'student' as const,
                id: student.id,
                label: student.student_name,
                aliases: [student.erp, student.class_no],
                meta: {
                    erp: student.erp,
                    class_no: student.class_no,
                    warned: Boolean(cameraWarnings[student.erp]),
                },
            })),
        });
    }, [cameraWarnings, filterDay, onHelpContextChange, openDialog, rosterStudents, trackerSearchQuery]);

    useEffect(() => {
        writeScopedSessionStorage(TA_STORAGE_SCOPE, userEmail, RULE_EXCEPTIONS_STORAGE_KEY, {
            filterDay,
            trackerSearchQuery,
            cameraWarnings,
            newErp,
            newType,
            newDay,
            newNotes,
            openDialog,
        });
    }, [cameraWarnings, filterDay, newDay, newErp, newNotes, newType, openDialog, trackerSearchQuery, userEmail]);

    useEffect(() => {
        if (!agentCommand) {
            return;
        }

        if (lastHandledAgentCommandTokenRef.current === agentCommand.token) {
            return;
        }

        lastHandledAgentCommandTokenRef.current = agentCommand.token;

        switch (agentCommand.command.kind) {
            case 'search-tracker':
                setTrackerSearchQuery(agentCommand.command.query ?? '');
                window.setTimeout(() => trackerSearchInputRef.current?.focus(), 0);
                break;
            case 'mark-warned': {
                const query = agentCommand.command.query ?? '';
                setTrackerSearchQuery(query);
                const student = findMatchingRosterStudent(rosterStudents, query);
                if (student) {
                    markStudentWarned(student.erp);
                } else {
                    window.setTimeout(() => trackerSearchInputRef.current?.focus(), 0);
                }
                break;
            }
            case 'clear-warning': {
                const query = agentCommand.command.query ?? '';
                setTrackerSearchQuery(query);
                const student = findMatchingRosterStudent(rosterStudents, query);
                if (student) {
                    clearStudentWarning(student.erp);
                } else {
                    window.setTimeout(() => trackerSearchInputRef.current?.focus(), 0);
                }
                break;
            }
            case 'open-add-exception': {
                const query = agentCommand.command.query ?? '';
                const student = findMatchingRosterStudent(rosterStudents, query);
                setOpenDialog(true);
                setNewErp(student?.erp ?? query);
                setNewType(agentCommand.command.issueType ?? 'camera_excused');
                setNewDay(agentCommand.command.day ?? 'both');
                setNewNotes(agentCommand.command.notes ?? '');
                window.setTimeout(() => addExceptionErpInputRef.current?.focus(), 0);
                break;
            }
            case 'prepare-delete-exception':
                setFilterDay('all');
                break;
        }

        onAgentCommandHandled?.();
    }, [agentCommand, onAgentCommandHandled, rosterStudents]);

    useEffect(() => {
        if (Object.keys(cameraWarnings).length === 0) {
            return;
        }

        const timer = window.setInterval(() => {
            setClockMs(Date.now());
        }, 1000);

        return () => window.clearInterval(timer);
    }, [cameraWarnings]);

    const fetchExceptions = useCallback(async (mode: 'initial' | 'silent' = 'initial') => {
        const shouldShowLoader = mode === 'initial' && !hasLoadedExceptionsRef.current;
        if (shouldShowLoader) {
            setIsLoading(true);
        }
        try {
            const data = await listRuleExceptions();
            setExceptions(data as unknown as RuleExceptionRow[]);
            hasLoadedExceptionsRef.current = true;
            markRefreshedRef.current();
        } catch {
            toast.error('Failed to load exceptions');
        } finally {
            if (shouldShowLoader) {
                setIsLoading(false);
            }
        }
    }, []);

    const fetchRosterStudents = useCallback(async (mode: 'initial' | 'silent' = 'initial') => {
        const shouldShowLoader = mode === 'initial' && !hasLoadedRosterRef.current;
        if (shouldShowLoader) {
            setIsRosterLoading(true);
        }
        try {
            const rosterData = await listRoster();
            const data = rosterData.rows
                .map((row) => ({ id: row.id, erp: row.erp, student_name: row.student_name, class_no: row.class_no }))
                .sort((a, b) => a.class_no.localeCompare(b.class_no) || a.student_name.localeCompare(b.student_name));
            setRosterStudents(data as RosterStudentRow[]);
            hasLoadedRosterRef.current = true;
            markRefreshedRef.current();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            toast.error(`Failed to load roster: ${message}`);
            setRosterStudents([]);
        } finally {
            if (shouldShowLoader) {
                setIsRosterLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        void fetchExceptions('initial');
        void fetchRosterStudents('initial');
    }, [fetchExceptions, fetchRosterStudents]);

    useEffect(() => {
        const unsubscribe = subscribeRosterDataUpdated(() => {
            void fetchRosterStudents('silent');
        });

        return unsubscribe;
    }, [fetchRosterStudents]);

    const handleAddException = async () => {
        if (!newErp) return;
        setIsAdding(true);

        try {
            const student = rosterStudents.find((item) => item.erp === newErp);

            const payload = {
                erp: newErp,
                student_name: student?.student_name || 'Unknown',
                class_no: student?.class_no,
                issue_type: newType,
                assigned_day: newDay,
                notes: newNotes
            };

            await createRuleException(payload);

            toast.success('Exception added');
            setOpenDialog(false);
            setNewErp('');
            setNewNotes('');
            void fetchExceptions('silent');

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            toast.error('Failed: ' + message);
        } finally {
            setIsAdding(false);
        }
    };

    const deleteException = async (id: string) => {
        try {
            await deleteRuleException(id);
            toast.success('Removed exception');
            setExceptions(prev => prev.filter(e => e.id !== id));
        } catch {
            toast.error('Failed to delete');
        }
    };

    const markStudentWarned = (erp: string) => {
        const now = Date.now();
        setClockMs(now);
        setCameraWarnings(prev => ({
            ...prev,
            [erp]: now,
        }));
    };

    const clearStudentWarning = (erp: string) => {
        setCameraWarnings(prev => {
            if (!prev[erp]) {
                return prev;
            }

            const next = { ...prev };
            delete next[erp];
            return next;
        });
    };

    const filteredExceptions = exceptions.filter(e => {
        if (filterDay !== 'all' && e.assigned_day !== filterDay && e.assigned_day !== 'both') return false;
        return true;
    });

    const normalizedTrackerQuery = trackerSearchQuery.trim().toLowerCase();

    const filteredTrackerStudents = useMemo(() => {
        const sorted = [...rosterStudents];
        sorted.sort((a, b) => {
            const aWarned = Boolean(cameraWarnings[a.erp]);
            const bWarned = Boolean(cameraWarnings[b.erp]);
            if (aWarned !== bWarned) {
                return aWarned ? -1 : 1;
            }

            const classCompare = a.class_no.localeCompare(b.class_no);
            if (classCompare !== 0) {
                return classCompare;
            }

            return a.student_name.localeCompare(b.student_name);
        });

        if (!normalizedTrackerQuery) {
            return sorted;
        }

        return sorted.filter((student) => {
            const haystack = `${student.class_no} ${student.student_name} ${student.erp}`.toLowerCase();
            return haystack.includes(normalizedTrackerQuery);
        });
    }, [rosterStudents, cameraWarnings, normalizedTrackerQuery]);

    const warnedCount = Object.keys(cameraWarnings).length;
    const expiredCount = Object.values(cameraWarnings).filter((warnedAtMs) => clockMs - warnedAtMs >= CAMERA_WARNING_DURATION_MS).length;
    const { markRefreshed } = useStaleRefreshOnFocus(
        async () => {
            await Promise.all([fetchExceptions('silent'), fetchRosterStudents('silent')]);
        },
        { staleAfterMs: 60_000 },
    );

    useEffect(() => {
        markRefreshedRef.current = markRefreshed;
    }, [markRefreshed]);

    useEffect(() => {
        const channel = subscribeToRealtimeTables(
            `ta-rule-exceptions-${userEmail ?? 'anonymous'}`,
            [
                { table: 'rule_exceptions' },
                { table: 'students_roster' },
            ],
            () => {
                void fetchExceptions('silent');
                void fetchRosterStudents('silent');
            },
        );

        return () => {
            void removeRealtimeChannel(channel);
        };
    }, [fetchExceptions, fetchRosterStudents, userEmail]);

    return (
        <div className="ta-module-shell space-y-6">
            <Card className="ta-module-card">
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>Rule Exceptions</CardTitle>
                            <CardDescription>Manage special cases like camera exemptions.</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Select value={filterDay} onValueChange={setFilterDay}>
                                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Filter Day" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Days</SelectItem>
                                    <SelectItem value="friday">Friday</SelectItem>
                                    <SelectItem value="saturday">Saturday</SelectItem>
                                </SelectContent>
                            </Select>

                            <Dialog open={openDialog} onOpenChange={setOpenDialog}>
                                <DialogTrigger asChild>
                                    <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add Exception</Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Add New Exception</DialogTitle>
                                        <DialogDescription>Add a student to the exceptions list.</DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label>ERP</Label>
                                            <Input ref={addExceptionErpInputRef} value={newErp} onChange={e => setNewErp(e.target.value)} placeholder="e.g. 26611" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Type</Label>
                                            <Select value={newType} onValueChange={setNewType}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="camera_excused">Camera Excused</SelectItem>
                                                    <SelectItem value="connectivity">Connectivity Issue</SelectItem>
                                                    <SelectItem value="other">Other</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Assigned Day</Label>
                                            <Select value={newDay} onValueChange={setNewDay}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="friday">Friday</SelectItem>
                                                    <SelectItem value="saturday">Saturday</SelectItem>
                                                    <SelectItem value="both">Both</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Notes</Label>
                                            <Textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Optional details..." />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button onClick={handleAddException} disabled={!newErp || isAdding}>
                                            {isAdding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
                    ) : (
                            <Table scrollClassName="overflow-x-auto">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Student</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Day</TableHead>
                                        <TableHead>Notes</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredExceptions.map((ex) => (
                                        <TableRow key={ex.id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{ex.student_name}</span>
                                                    <span className="text-xs text-muted-foreground">{ex.erp}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{ex.issue_type}</Badge>
                                            </TableCell>
                                            <TableCell className="capitalize">{ex.assigned_day}</TableCell>
                                            <TableCell className="max-w-[200px] truncate" title={ex.notes || ''}>{ex.notes}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => deleteException(ex.id)}>
                                                    <Trash2 className="h-4 w-4 status-absent-text" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {filteredExceptions.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                                No exceptions found.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                    )}
                </CardContent>
            </Card>

            <Card className="ta-module-card">
                <CardHeader>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <CardTitle>Camera Closed Tracker</CardTitle>
                            <CardDescription>
                                Search roster students and mark <span className="font-medium">Warned</span> to start a live 5-minute countdown.
                            </CardDescription>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Badge variant="outline" className="text-debossed-sm">
                                {rosterStudents.length} Roster Students
                            </Badge>
                            <Badge variant="outline" className={warnedCount > 0 ? 'status-all-table-text' : 'text-debossed-sm'}>
                                {warnedCount} Warned
                            </Badge>
                            <Badge variant="outline" className={expiredCount > 0 ? 'status-absent-table-text' : 'text-debossed-sm'}>
                                {expiredCount} Countdown Complete
                            </Badge>
                        </div>
                    </div>
                    <div className="relative mt-3 w-full md:max-w-sm">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            ref={trackerSearchInputRef}
                            placeholder="Search roster by name, ERP, or class"
                            value={trackerSearchQuery}
                            onChange={(event) => setTrackerSearchQuery(event.target.value)}
                            className="pl-9"
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    {isRosterLoading ? (
                        <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
                    ) : (
                            <Table scrollClassName="overflow-x-auto">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Class</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>ERP</TableHead>
                                        <TableHead>Warned At</TableHead>
                                        <TableHead>Countdown</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredTrackerStudents.map((student) => {
                                        const warnedAtMs = cameraWarnings[student.erp];
                                        const isWarned = typeof warnedAtMs === 'number';
                                        const elapsedMs = isWarned ? Math.max(clockMs - warnedAtMs, 0) : 0;
                                        const remainingMs = isWarned ? Math.max(CAMERA_WARNING_DURATION_MS - elapsedMs, 0) : CAMERA_WARNING_DURATION_MS;
                                        const isCountdownComplete = isWarned && remainingMs === 0;

                                        return (
                                            <TableRow key={student.id}>
                                                <TableCell>{student.class_no}</TableCell>
                                                <TableCell>{student.student_name}</TableCell>
                                                <TableCell>{student.erp}</TableCell>
                                                <TableCell>
                                                    {isWarned ? (
                                                        <span className="font-mono text-xs">{formatWarnedAt(warnedAtMs)}</span>
                                                    ) : (
                                                        <span className="text-muted-foreground">-</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {isWarned ? (
                                                        <Badge
                                                            variant={isCountdownComplete ? 'destructive' : 'secondary'}
                                                            className="font-mono"
                                                        >
                                                            {formatCountdown(remainingMs)}
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-muted-foreground">Not warned</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant={isWarned ? 'default' : 'outline'}
                                                            onClick={() => markStudentWarned(student.erp)}
                                                        >
                                                            Warned
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            disabled={!isWarned}
                                                            onClick={() => clearStudentWarning(student.erp)}
                                                        >
                                                            Clear
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {filteredTrackerStudents.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                                No roster students match this search.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
