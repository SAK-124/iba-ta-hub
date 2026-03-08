import { useState, useEffect, useRef } from 'react';
import { Switch } from '@/components/ta/ui/switch';
import { Label } from '@/components/ta/ui/label';
import { Input } from '@/components/ta/ui/input';
import { Textarea } from '@/components/ta/ui/textarea';
import { Button } from '@/components/ta/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ta/ui/card';
import { toast } from 'sonner';
import { Loader2, Trash2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { emitRosterDataUpdated } from '@/lib/data-sync-events';
import { useStaleRefreshOnFocus } from '@/hooks/use-stale-refresh-on-focus';
import { removeRealtimeChannel, subscribeToRealtimeTables } from '@/lib/realtime-table-subscriptions';
import { readScopedSessionStorage, writeScopedSessionStorage } from '@/lib/scoped-session-storage';
import { TEST_STUDENT_ERP } from '@/lib/test-student-settings';
import type {
    AgentCommandEnvelope,
    HelpContextSnapshot,
    SettingsAgentCommand,
} from '@/lib/ta-help-actions';
import {
    addSubmission as createSubmission,
    addTaAllowlistEmail,
    deactivateSubmission,
    deactivateTaAllowlistEmail,
    getAppSettings,
    getMyTaPassword,
    listSubmissions,
    listTaAllowlist,
    setMyTaPassword,
    updateAppSettings,
    type AppSettingsRow,
    type SubmissionRow,
    type TaAllowlistRow,
} from '@/features/settings';

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const DEFAULT_TEST_STUDENT_OVERRIDES = {
    class_no: 'TEST',
    student_name: 'Test Student',
    total_absences: 0,
    total_penalties: 0,
    session_status: {},
    penalty_entries: [],
};

const TA_STORAGE_SCOPE = 'ta';
const SETTINGS_STORAGE_KEY = 'module-settings';

interface TestStudentDraftState {
    testStudentClassNo: string;
    testStudentName: string;
    testStudentAbsences: string;
    testStudentPenalties: string;
    testStudentSessionStatusJson: string;
    testStudentPenaltyEntriesJson: string;
}

const DEFAULT_TEST_STUDENT_DRAFT_STATE: TestStudentDraftState = {
    testStudentClassNo: DEFAULT_TEST_STUDENT_OVERRIDES.class_no,
    testStudentName: DEFAULT_TEST_STUDENT_OVERRIDES.student_name,
    testStudentAbsences: String(DEFAULT_TEST_STUDENT_OVERRIDES.total_absences),
    testStudentPenalties: String(DEFAULT_TEST_STUDENT_OVERRIDES.total_penalties),
    testStudentSessionStatusJson: '{}',
    testStudentPenaltyEntriesJson: '[]',
};

const buildTestStudentDraftState = (rawOverrides: Record<string, unknown>): TestStudentDraftState => {
    const mergedOverrides = {
        ...DEFAULT_TEST_STUDENT_OVERRIDES,
        ...rawOverrides,
    };

    return {
        testStudentClassNo: String(mergedOverrides.class_no ?? DEFAULT_TEST_STUDENT_OVERRIDES.class_no),
        testStudentName: String(mergedOverrides.student_name ?? DEFAULT_TEST_STUDENT_OVERRIDES.student_name),
        testStudentAbsences: String(Number(mergedOverrides.total_absences ?? DEFAULT_TEST_STUDENT_OVERRIDES.total_absences)),
        testStudentPenalties: String(Number(mergedOverrides.total_penalties ?? DEFAULT_TEST_STUDENT_OVERRIDES.total_penalties)),
        testStudentSessionStatusJson: JSON.stringify(mergedOverrides.session_status ?? {}, null, 2),
        testStudentPenaltyEntriesJson: JSON.stringify(mergedOverrides.penalty_entries ?? [], null, 2),
    };
};

const areTestStudentDraftStatesEqual = (
    left: TestStudentDraftState,
    right: TestStudentDraftState,
) =>
    left.testStudentClassNo === right.testStudentClassNo &&
    left.testStudentName === right.testStudentName &&
    left.testStudentAbsences === right.testStudentAbsences &&
    left.testStudentPenalties === right.testStudentPenalties &&
    left.testStudentSessionStatusJson === right.testStudentSessionStatusJson &&
    left.testStudentPenaltyEntriesJson === right.testStudentPenaltyEntriesJson;

const isDefaultTestStudentDraftState = (draftState: TestStudentDraftState) =>
    areTestStudentDraftStatesEqual(draftState, DEFAULT_TEST_STUDENT_DRAFT_STATE);

interface PersistedSettingsState {
    newTaEmail: string;
    newSubLabel: string;
    testStudentClassNo: string;
    testStudentName: string;
    testStudentAbsences: string;
    testStudentPenalties: string;
    testStudentSessionStatusJson: string;
    testStudentPenaltyEntriesJson: string;
}

interface ListsSettingsProps {
    onContextChange?: (context: string | null) => void;
    onHelpContextChange?: (snapshot: Partial<HelpContextSnapshot>) => void;
    agentCommand?: AgentCommandEnvelope<SettingsAgentCommand> | null;
    onAgentCommandHandled?: () => void;
}

export default function ListsSettings({
    onContextChange,
    onHelpContextChange,
    agentCommand = null,
    onAgentCommandHandled,
}: ListsSettingsProps = {}) {
    const { user } = useAuth();
    const userEmail = user?.email ?? null;
    const persistedState = readScopedSessionStorage<PersistedSettingsState>(
        TA_STORAGE_SCOPE,
        userEmail,
        SETTINGS_STORAGE_KEY,
        {
            newTaEmail: '',
            newSubLabel: '',
            ...DEFAULT_TEST_STUDENT_DRAFT_STATE,
        },
    );
    const [settings, setSettings] = useState<AppSettingsRow | null>(null);
    const [taEmails, setTaEmails] = useState<TaAllowlistRow[]>([]);
    const [newTaEmail, setNewTaEmail] = useState(persistedState.newTaEmail);

    const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
    const [newSubLabel, setNewSubLabel] = useState(persistedState.newSubLabel);
    const [isPasswordLoading, setIsPasswordLoading] = useState(false);
    const [currentPassword, setCurrentPassword] = useState<string | null>(null);
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [testStudentClassNo, setTestStudentClassNo] = useState(persistedState.testStudentClassNo);
    const [testStudentName, setTestStudentName] = useState(persistedState.testStudentName);
    const [testStudentAbsences, setTestStudentAbsences] = useState(persistedState.testStudentAbsences);
    const [testStudentPenalties, setTestStudentPenalties] = useState(persistedState.testStudentPenalties);
    const [testStudentSessionStatusJson, setTestStudentSessionStatusJson] = useState(persistedState.testStudentSessionStatusJson);
    const [testStudentPenaltyEntriesJson, setTestStudentPenaltyEntriesJson] = useState(persistedState.testStudentPenaltyEntriesJson);
    const [isSavingTestStudent, setIsSavingTestStudent] = useState(false);
    const markRefreshedRef = useRef<() => void>(() => {});
    const lastLoadedTestStudentDraftRef = useRef<TestStudentDraftState | null>(null);
    const taEmailInputRef = useRef<HTMLInputElement>(null);
    const submissionInputRef = useRef<HTMLInputElement>(null);
    const newPasswordInputRef = useRef<HTMLInputElement>(null);
    const testStudentNameInputRef = useRef<HTMLInputElement>(null);
    const lastHandledAgentCommandTokenRef = useRef<number | null>(null);

    useEffect(() => {
        fetchSettings();
        void fetchTaList();
        void fetchSubmissions();
    }, []);

    useEffect(() => {
        onContextChange?.(
            newTaEmail || newSubLabel || newPassword || confirmPassword
                ? 'Lists & Settings · editing inputs'
                : 'Lists & Settings · overview',
        );
    }, [confirmPassword, newPassword, newSubLabel, newTaEmail, onContextChange]);

    useEffect(() => {
        onHelpContextChange?.({
            openSurface: 'settings dashboard',
            screenDescription: 'Manage portal settings, TA allowlist, submission labels, password, and test student overrides.',
            visibleControls: [
                'Roster Verification',
                'Student Complaints / Tickets',
                'Save Test Student Overrides',
                'Update Password',
                'Add',
            ],
            actionTargets: [
                { kind: 'setting-section', label: 'Global Settings', aliases: ['roster verification', 'student complaints', 'tickets'] },
                { kind: 'setting-section', label: 'Test Student', aliases: ['test student', '00000'] },
                { kind: 'setting-section', label: 'My Account Password', aliases: ['password', 'my password'] },
                { kind: 'setting-section', label: 'TA Management', aliases: ['ta', 'teaching assistant', 'ta allowlist'] },
                { kind: 'setting-section', label: 'Submission List', aliases: ['submission', 'assignment label'] },
                ...taEmails.slice(0, 100).map((ta) => ({
                    kind: 'ta' as const,
                    id: ta.id,
                    label: ta.email,
                })),
                ...submissions.slice(0, 100).map((submission) => ({
                    kind: 'submission' as const,
                    id: submission.id,
                    label: submission.label,
                })),
            ],
        });
    }, [onHelpContextChange, submissions, taEmails]);

    useEffect(() => {
        writeScopedSessionStorage(TA_STORAGE_SCOPE, userEmail, SETTINGS_STORAGE_KEY, {
            newTaEmail,
            newSubLabel,
            testStudentClassNo,
            testStudentName,
            testStudentAbsences,
            testStudentPenalties,
            testStudentSessionStatusJson,
            testStudentPenaltyEntriesJson,
        });
    }, [
        newSubLabel,
        newTaEmail,
        testStudentAbsences,
        testStudentClassNo,
        testStudentName,
        testStudentPenaltyEntriesJson,
        testStudentPenalties,
        testStudentSessionStatusJson,
        userEmail,
    ]);

    useEffect(() => {
        if (!agentCommand) {
            return;
        }

        if (lastHandledAgentCommandTokenRef.current === agentCommand.token) {
            return;
        }

        lastHandledAgentCommandTokenRef.current = agentCommand.token;

        switch (agentCommand.command.kind) {
            case 'focus-section':
                if (agentCommand.command.section === 'ta-management') {
                    window.setTimeout(() => taEmailInputRef.current?.focus(), 0);
                } else if (agentCommand.command.section === 'submission-list') {
                    window.setTimeout(() => submissionInputRef.current?.focus(), 0);
                } else if (agentCommand.command.section === 'password') {
                    window.setTimeout(() => newPasswordInputRef.current?.focus(), 0);
                } else if (agentCommand.command.section === 'test-student') {
                    window.setTimeout(() => testStudentNameInputRef.current?.focus(), 0);
                }
                break;
            case 'prefill-add-ta':
                setNewTaEmail(agentCommand.command.email ?? '');
                window.setTimeout(() => taEmailInputRef.current?.focus(), 0);
                break;
            case 'prefill-submission':
                setNewSubLabel(agentCommand.command.submissionLabel ?? '');
                window.setTimeout(() => submissionInputRef.current?.focus(), 0);
                break;
            case 'prefill-password':
                setNewPassword(agentCommand.command.newPassword ?? '');
                setConfirmPassword(agentCommand.command.confirmPassword ?? agentCommand.command.newPassword ?? '');
                window.setTimeout(() => newPasswordInputRef.current?.focus(), 0);
                break;
            case 'prefill-test-student':
                if (agentCommand.command.testStudent?.class_no !== undefined) {
                    setTestStudentClassNo(agentCommand.command.testStudent.class_no);
                }
                if (agentCommand.command.testStudent?.student_name !== undefined) {
                    setTestStudentName(agentCommand.command.testStudent.student_name);
                }
                if (agentCommand.command.testStudent?.total_absences !== undefined) {
                    setTestStudentAbsences(agentCommand.command.testStudent.total_absences);
                }
                if (agentCommand.command.testStudent?.total_penalties !== undefined) {
                    setTestStudentPenalties(agentCommand.command.testStudent.total_penalties);
                }
                window.setTimeout(() => testStudentNameInputRef.current?.focus(), 0);
                break;
        }

        onAgentCommandHandled?.();
    }, [agentCommand, onAgentCommandHandled]);

    useEffect(() => {
        if (!user?.email) {
            setCurrentPassword(null);
            return;
        }

        const loadMyPassword = async () => {
            setIsPasswordLoading(true);
            try {
                const data = await getMyTaPassword();
                setCurrentPassword(data ?? null);
            } catch {
                toast.error('Failed to load your password');
            } finally {
                setIsPasswordLoading(false);
            }
        };

        void loadMyPassword();
    }, [user?.email]);

    const fetchSettings = async () => {
        const data = await getAppSettings();
        if (data) {
            const rawOverrides = isObjectRecord(data.test_student_overrides) ? data.test_student_overrides : {};
            const nextTestStudentDraft = buildTestStudentDraftState(rawOverrides);
            const currentTestStudentDraft: TestStudentDraftState = {
                testStudentClassNo,
                testStudentName,
                testStudentAbsences,
                testStudentPenalties,
                testStudentSessionStatusJson,
                testStudentPenaltyEntriesJson,
            };
            const shouldHydrateDraft =
                lastLoadedTestStudentDraftRef.current === null
                    ? isDefaultTestStudentDraftState(currentTestStudentDraft)
                    : areTestStudentDraftStatesEqual(
                          currentTestStudentDraft,
                          lastLoadedTestStudentDraftRef.current,
                      );

            setSettings({
                ...data,
                tickets_enabled: data.tickets_enabled ?? true,
                show_test_student_in_ta: data.show_test_student_in_ta ?? false,
                test_student_overrides: rawOverrides,
            });

            if (shouldHydrateDraft) {
                setTestStudentClassNo(nextTestStudentDraft.testStudentClassNo);
                setTestStudentName(nextTestStudentDraft.testStudentName);
                setTestStudentAbsences(nextTestStudentDraft.testStudentAbsences);
                setTestStudentPenalties(nextTestStudentDraft.testStudentPenalties);
                setTestStudentSessionStatusJson(nextTestStudentDraft.testStudentSessionStatusJson);
                setTestStudentPenaltyEntriesJson(nextTestStudentDraft.testStudentPenaltyEntriesJson);
            }

            lastLoadedTestStudentDraftRef.current = nextTestStudentDraft;
            markRefreshedRef.current();
        }
    };

    const fetchTaList = async () => {
        try {
            const data = await listTaAllowlist(true);
            setTaEmails((data || []) as TaAllowlistRow[]);
            markRefreshedRef.current();
        } catch {
            toast.error('Failed to load TA list');
        }
    };

    const fetchSubmissions = async () => {
        try {
            const data = await listSubmissions(true);
            setSubmissions((data || []) as SubmissionRow[]);
            markRefreshedRef.current();
        } catch {
            toast.error('Failed to load submission list');
        }
    };

    const toggleRosterVerification = async (checked: boolean) => {
        if (!settings) return;
        try {
            await updateAppSettings(settings.id, { roster_verification_enabled: checked });
            setSettings({ ...settings, roster_verification_enabled: checked });
            toast.success('Roster verification ' + (checked ? 'enabled' : 'disabled'));
        } catch {
            toast.error('Failed to update settings');
        }
    };

    const { markRefreshed } = useStaleRefreshOnFocus(
        async () => {
            await Promise.all([fetchSettings(), fetchTaList(), fetchSubmissions()]);
        },
        { staleAfterMs: 60_000 },
    );

    useEffect(() => {
        markRefreshedRef.current = markRefreshed;
    }, [markRefreshed]);

    useEffect(() => {
        const channel = subscribeToRealtimeTables(
            `ta-settings-${Date.now()}`,
            [
                { table: 'app_settings' },
                { table: 'submissions_list' },
                { table: 'ta_allowlist' },
            ],
            () => {
                void fetchSettings();
                void fetchTaList();
                void fetchSubmissions();
            },
        );

        return () => {
            void removeRealtimeChannel(channel);
        };
    }, []);

    const toggleStudentTickets = async (checked: boolean) => {
        if (!settings) return;
        try {
            await updateAppSettings(settings.id, { tickets_enabled: checked });
            setSettings({ ...settings, tickets_enabled: checked });
            toast.success('Student ticketing ' + (checked ? 'enabled' : 'disabled'));
        } catch {
            toast.error('Failed to update settings');
        }
    };

    const toggleShowTestStudentInTa = async (checked: boolean) => {
        if (!settings) return;

        try {
            await updateAppSettings(settings.id, { show_test_student_in_ta: checked });
        } catch {
            toast.error('Failed to update test student visibility');
            return;
        }

        setSettings({ ...settings, show_test_student_in_ta: checked });
        emitRosterDataUpdated('lists_settings_test_student_visibility');
        toast.success(`Test student visibility in TA modules ${checked ? 'enabled' : 'disabled'}`);
    };

    const saveTestStudentOverrides = async () => {
        if (!settings) return;

        const normalizedAbsences = Math.max(0, Number(testStudentAbsences) || 0);
        const normalizedPenalties = Math.max(0, Number(testStudentPenalties) || 0);
        const normalizedClassNo = testStudentClassNo.trim() || DEFAULT_TEST_STUDENT_OVERRIDES.class_no;
        const normalizedStudentName = testStudentName.trim() || DEFAULT_TEST_STUDENT_OVERRIDES.student_name;

        let parsedSessionStatus: Record<string, string> = {};
        let parsedPenaltyEntries: unknown[] = [];

        try {
            const sessionStatusInput = testStudentSessionStatusJson.trim() || '{}';
            const parsed = JSON.parse(sessionStatusInput) as unknown;
            if (!isObjectRecord(parsed)) {
                toast.error('Session status JSON must be an object');
                return;
            }

            parsedSessionStatus = Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
                if (typeof value === 'string') {
                    acc[String(key)] = value;
                }
                return acc;
            }, {});
        } catch {
            toast.error('Session status JSON is invalid');
            return;
        }

        try {
            const penaltyEntriesInput = testStudentPenaltyEntriesJson.trim() || '[]';
            const parsed = JSON.parse(penaltyEntriesInput) as unknown;
            if (!Array.isArray(parsed)) {
                toast.error('Penalty entries JSON must be an array');
                return;
            }
            parsedPenaltyEntries = parsed;
        } catch {
            toast.error('Penalty entries JSON is invalid');
            return;
        }

        const overridesPayload: Record<string, unknown> = {
            erp: TEST_STUDENT_ERP,
            class_no: normalizedClassNo,
            student_name: normalizedStudentName,
            total_absences: normalizedAbsences,
            total_penalties: normalizedPenalties,
            session_status: parsedSessionStatus,
            penalty_entries: parsedPenaltyEntries,
        };

        setIsSavingTestStudent(true);
        try {
            await updateAppSettings(settings.id, { test_student_overrides: overridesPayload });
            const savedDraftState = buildTestStudentDraftState(overridesPayload);

            setSettings({
                ...settings,
                test_student_overrides: overridesPayload,
            });
            lastLoadedTestStudentDraftRef.current = savedDraftState;
            setTestStudentClassNo(savedDraftState.testStudentClassNo);
            setTestStudentName(savedDraftState.testStudentName);
            setTestStudentAbsences(savedDraftState.testStudentAbsences);
            setTestStudentPenalties(savedDraftState.testStudentPenalties);
            setTestStudentSessionStatusJson(savedDraftState.testStudentSessionStatusJson);
            setTestStudentPenaltyEntriesJson(savedDraftState.testStudentPenaltyEntriesJson);
            emitRosterDataUpdated('lists_settings_test_student_overrides');
            toast.success('Test student overrides saved');
        } finally {
            setIsSavingTestStudent(false);
        }
    };

    const addTa = async () => {
        if (!newTaEmail) return;
        try {
            await addTaAllowlistEmail({ email: newTaEmail, active: true });
            toast.success('TA added');
            setNewTaEmail('');
            void fetchTaList();
        } catch {
            toast.error('Failed to add TA');
        }
    };

    const removeTa = async (id: string, email: string) => {
        if (email === 'saboor12124@gmail.com') {
            toast.error('Cannot remove master admin');
            return;
        }
        try {
            await deactivateTaAllowlistEmail(id);
            toast.success('TA removed');
            void fetchTaList();
        } catch {
            toast.error('Failed to remove TA');
        }
    };

    const addSubmission = async () => {
        if (!newSubLabel) return;
        try {
            await createSubmission({ label: newSubLabel, active: true, sort_order: submissions.length + 1 });
            toast.success('Submission added');
            setNewSubLabel('');
            void fetchSubmissions();
        } catch {
            toast.error('Failed to add submission');
        }
    };

    const removeSubmission = async (id: string) => {
        try {
            await deactivateSubmission(id);
            toast.success('Removed');
            void fetchSubmissions();
        } catch {
            toast.error('Failed to remove');
        }
    };

    const updateMyPassword = async () => {
        if (!user?.email) {
            toast.error('Could not determine your account email');
            return;
        }

        if (!newPassword) {
            toast.error('Please enter a new password');
            return;
        }

        if (newPassword.length < 6) {
            toast.error('New password must be at least 6 characters');
            return;
        }

        if (newPassword !== confirmPassword) {
            toast.error('Password confirmation does not match');
            return;
        }

        setIsUpdatingPassword(true);
        try {
            await setMyTaPassword(newPassword);

            setCurrentPassword(newPassword);
            setShowCurrentPassword(false);
            setNewPassword('');
            setConfirmPassword('');
            toast.success('Password updated successfully');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Please retry from settings.';
            toast.error(`Failed to update password: ${message}`);
        } finally {
            setIsUpdatingPassword(false);
        }
    };

    const hasVisiblePassword = Boolean(currentPassword);
    const currentPasswordDisplay = isPasswordLoading ? 'Loading...' : currentPassword ?? 'Not set';
    const currentPasswordInputType = hasVisiblePassword ? (showCurrentPassword ? 'text' : 'password') : 'text';

    if (!settings) return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />;

    return (
        <div className="ta-module-shell grid gap-6 md:grid-cols-2">
            <Card className="ta-module-card">
                <CardHeader>
                    <CardTitle>Global Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between space-x-2">
                        <Label htmlFor="roster-verification" className="flex flex-col space-y-1">
                            <span>Roster Verification</span>
                            <span className="font-normal text-xs text-muted-foreground">
                                If checked, students must be in the roster to access the portal.
                            </span>
                        </Label>
                        <Switch
                            id="roster-verification"
                            checked={settings.roster_verification_enabled}
                            onCheckedChange={toggleRosterVerification}
                        />
                    </div>

                    <div className="flex items-center justify-between space-x-2">
                        <Label htmlFor="student-tickets" className="flex flex-col space-y-1">
                            <span>Student Complaints / Tickets</span>
                            <span className="font-normal text-xs text-muted-foreground">
                                Controls whether students can submit and view ticket complaints in the portal.
                            </span>
                        </Label>
                        <Switch
                            id="student-tickets"
                            checked={settings.tickets_enabled}
                            onCheckedChange={toggleStudentTickets}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card className="ta-module-card">
                <CardHeader>
                    <CardTitle>Test Student (00000)</CardTitle>
                    <CardDescription>
                        Configure manual overrides for the test student in TA modules. Public board will always hide ERP 00000.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between space-x-2">
                        <Label htmlFor="show-test-student-ta" className="flex flex-col space-y-1">
                            <span>Show in TA Roster & Consolidated View</span>
                            <span className="font-normal text-xs text-muted-foreground">
                                Controls visibility only in TA modules.
                            </span>
                        </Label>
                        <Switch
                            id="show-test-student-ta"
                            checked={settings.show_test_student_in_ta}
                            onCheckedChange={toggleShowTestStudentInTa}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="test-student-class">Class No</Label>
                            <Input
                                id="test-student-class"
                                value={testStudentClassNo}
                                onChange={(event) => setTestStudentClassNo(event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="test-student-erp">ERP</Label>
                            <Input id="test-student-erp" value={TEST_STUDENT_ERP} readOnly />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="test-student-name">Student Name</Label>
                        <Input
                            id="test-student-name"
                            ref={testStudentNameInputRef}
                            value={testStudentName}
                            onChange={(event) => setTestStudentName(event.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="test-student-absences">Total Absences</Label>
                            <Input
                                id="test-student-absences"
                                type="number"
                                min={0}
                                value={testStudentAbsences}
                                onChange={(event) => setTestStudentAbsences(event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="test-student-penalties">Total Penalties</Label>
                            <Input
                                id="test-student-penalties"
                                type="number"
                                min={0}
                                value={testStudentPenalties}
                                onChange={(event) => setTestStudentPenalties(event.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="test-student-session-status">Session Status JSON</Label>
                        <Textarea
                            id="test-student-session-status"
                            value={testStudentSessionStatusJson}
                            onChange={(event) => setTestStudentSessionStatusJson(event.target.value)}
                            className="min-h-[110px] font-mono text-xs"
                            placeholder='{"session-id":"present"}'
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="test-student-penalty-entries">Penalty Entries JSON</Label>
                        <Textarea
                            id="test-student-penalty-entries"
                            value={testStudentPenaltyEntriesJson}
                            onChange={(event) => setTestStudentPenaltyEntriesJson(event.target.value)}
                            className="min-h-[110px] font-mono text-xs"
                            placeholder='[{"session_id":"...","session_number":1}]'
                        />
                    </div>

                    <Button onClick={saveTestStudentOverrides} disabled={isSavingTestStudent}>
                        {isSavingTestStudent && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Test Student Overrides
                    </Button>
                </CardContent>
            </Card>

            <Card className="ta-module-card">
                <CardHeader>
                    <CardTitle>My Account Password</CardTitle>
                    <CardDescription>Only you can view and update your own TA password.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="my-ta-email">Your TA Email</Label>
                        <Input id="my-ta-email" value={user?.email ?? ''} readOnly />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="current-ta-password">Current Password</Label>
                        <div className="flex gap-2">
                            <Input
                                id="current-ta-password"
                                type={currentPasswordInputType}
                                value={currentPasswordDisplay}
                                readOnly
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => setShowCurrentPassword((prev) => !prev)}
                                disabled={!hasVisiblePassword || isPasswordLoading}
                                aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
                            >
                                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                        </div>
                        {!isPasswordLoading && !hasVisiblePassword && (
                            <p className="text-xs text-muted-foreground">No password is stored yet. Set one below.</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="new-ta-password">New Password</Label>
                        <Input
                            id="new-ta-password"
                            type="password"
                            ref={newPasswordInputRef}
                            value={newPassword}
                            minLength={6}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="At least 6 characters"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirm-ta-password">Confirm New Password</Label>
                        <Input
                            id="confirm-ta-password"
                            type="password"
                            value={confirmPassword}
                            minLength={6}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Re-enter new password"
                        />
                    </div>

                    <Button
                        onClick={updateMyPassword}
                        disabled={isUpdatingPassword || !newPassword || !confirmPassword}
                    >
                        {isUpdatingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Update Password
                    </Button>
                </CardContent>
            </Card>

            <Card className="ta-module-card">
                <CardHeader>
                    <CardTitle>TA Management</CardTitle>
                    <CardDescription>Add or remove Teaching Assistants</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Input
                            placeholder="TA Email"
                            ref={taEmailInputRef}
                            value={newTaEmail}
                            onChange={e => setNewTaEmail(e.target.value)}
                        />
                        <Button onClick={addTa}>Add</Button>
                    </div>
                    <div className="space-y-2">
                        {taEmails.map(ta => (
                            <div key={ta.id} className="neo-in flex items-center justify-between p-2 rounded-xl text-sm">
                                <span>{ta.email}</span>
                                <Button variant="ghost" size="sm" onClick={() => removeTa(ta.id, ta.email)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card className="ta-module-card">
                <CardHeader>
                    <CardTitle>Submission List</CardTitle>
                    <CardDescription>Manage options for "Grading Query"</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Input
                            placeholder="e.g. Assignment 1"
                            ref={submissionInputRef}
                            value={newSubLabel}
                            onChange={e => setNewSubLabel(e.target.value)}
                        />
                        <Button onClick={addSubmission}>Add</Button>
                    </div>
                    <div className="space-y-2">
                        {submissions.map(sub => (
                            <div key={sub.id} className="neo-in flex items-center justify-between p-2 rounded-xl text-sm">
                                <span>{sub.label}</span>
                                <Button variant="ghost" size="sm" onClick={() => removeSubmission(sub.id)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
