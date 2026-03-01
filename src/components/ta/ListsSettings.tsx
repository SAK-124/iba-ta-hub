import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { TEST_STUDENT_ERP } from '@/lib/test-student-settings';

type AppSettings = {
    id: string;
    roster_verification_enabled: boolean;
    tickets_enabled: boolean;
    show_test_student_in_ta: boolean;
    test_student_overrides: Record<string, unknown>;
};

type TaEmailRow = {
    id: string;
    email: string;
    active: boolean;
    created_at: string;
};

type SubmissionRow = {
    id: string;
    label: string;
    active: boolean;
    sort_order: number | null;
};

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

export default function ListsSettings() {
    const { user } = useAuth();
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [taEmails, setTaEmails] = useState<TaEmailRow[]>([]);
    const [newTaEmail, setNewTaEmail] = useState('');

    const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
    const [newSubLabel, setNewSubLabel] = useState('');
    const [isPasswordLoading, setIsPasswordLoading] = useState(false);
    const [currentPassword, setCurrentPassword] = useState<string | null>(null);
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [testStudentClassNo, setTestStudentClassNo] = useState(DEFAULT_TEST_STUDENT_OVERRIDES.class_no);
    const [testStudentName, setTestStudentName] = useState(DEFAULT_TEST_STUDENT_OVERRIDES.student_name);
    const [testStudentAbsences, setTestStudentAbsences] = useState(String(DEFAULT_TEST_STUDENT_OVERRIDES.total_absences));
    const [testStudentPenalties, setTestStudentPenalties] = useState(String(DEFAULT_TEST_STUDENT_OVERRIDES.total_penalties));
    const [testStudentSessionStatusJson, setTestStudentSessionStatusJson] = useState('{}');
    const [testStudentPenaltyEntriesJson, setTestStudentPenaltyEntriesJson] = useState('[]');
    const [isSavingTestStudent, setIsSavingTestStudent] = useState(false);

    useEffect(() => {
        fetchSettings();
        void fetchTaList();
        void fetchSubmissions();
    }, []);

    useEffect(() => {
        if (!user?.email) {
            setCurrentPassword(null);
            return;
        }

        const loadMyPassword = async () => {
            setIsPasswordLoading(true);
            try {
                const { data, error } = await supabase.rpc('get_my_ta_password');

                if (error) {
                    toast.error('Failed to load your password');
                    return;
                }

                setCurrentPassword(data ?? null);
            } finally {
                setIsPasswordLoading(false);
            }
        };

        void loadMyPassword();
    }, [user?.email]);

    const fetchSettings = async () => {
        const { data } = await supabase.from('app_settings').select('*').single();
        if (data) {
            const rawOverrides = isObjectRecord(data.test_student_overrides) ? data.test_student_overrides : {};
            const mergedOverrides = {
                ...DEFAULT_TEST_STUDENT_OVERRIDES,
                ...rawOverrides,
            };

            setSettings({
                ...data,
                tickets_enabled: data.tickets_enabled ?? true,
                show_test_student_in_ta: data.show_test_student_in_ta ?? false,
                test_student_overrides: rawOverrides,
            });

            setTestStudentClassNo(String(mergedOverrides.class_no ?? DEFAULT_TEST_STUDENT_OVERRIDES.class_no));
            setTestStudentName(String(mergedOverrides.student_name ?? DEFAULT_TEST_STUDENT_OVERRIDES.student_name));
            setTestStudentAbsences(String(Number(mergedOverrides.total_absences ?? DEFAULT_TEST_STUDENT_OVERRIDES.total_absences)));
            setTestStudentPenalties(String(Number(mergedOverrides.total_penalties ?? DEFAULT_TEST_STUDENT_OVERRIDES.total_penalties)));
            setTestStudentSessionStatusJson(JSON.stringify(mergedOverrides.session_status ?? {}, null, 2));
            setTestStudentPenaltyEntriesJson(JSON.stringify(mergedOverrides.penalty_entries ?? [], null, 2));
        }
    };

    const fetchTaList = async () => {
        const { data, error } = await supabase
            .from('ta_allowlist')
            .select('id, email, active, created_at')
            .eq('active', true)
            .order('email');

        if (error) {
            toast.error('Failed to load TA list');
            return;
        }

        setTaEmails((data || []) as TaEmailRow[]);
    };

    const fetchSubmissions = async () => {
        const { data, error } = await supabase
            .from('submissions_list')
            .select('*')
            .eq('active', true)
            .order('sort_order');

        if (error) {
            toast.error('Failed to load submission list');
            return;
        }

        setSubmissions((data || []) as SubmissionRow[]);
    };

    const toggleRosterVerification = async (checked: boolean) => {
        if (!settings) return;
        const { error } = await supabase.from('app_settings').update({ roster_verification_enabled: checked }).eq('id', settings.id);
        if (error) {
            toast.error('Failed to update settings');
        } else {
            setSettings({ ...settings, roster_verification_enabled: checked });
            toast.success('Roster verification ' + (checked ? 'enabled' : 'disabled'));
        }
    };

    const toggleStudentTickets = async (checked: boolean) => {
        if (!settings) return;
        const { error } = await supabase.from('app_settings').update({ tickets_enabled: checked }).eq('id', settings.id);
        if (error) {
            toast.error('Failed to update settings');
        } else {
            setSettings({ ...settings, tickets_enabled: checked });
            toast.success('Student ticketing ' + (checked ? 'enabled' : 'disabled'));
        }
    };

    const toggleShowTestStudentInTa = async (checked: boolean) => {
        if (!settings) return;

        const { error } = await supabase
            .from('app_settings')
            .update({ show_test_student_in_ta: checked })
            .eq('id', settings.id);

        if (error) {
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
            const { error } = await supabase
                .from('app_settings')
                .update({ test_student_overrides: overridesPayload })
                .eq('id', settings.id);

            if (error) {
                toast.error('Failed to save test student overrides');
                return;
            }

            setSettings({
                ...settings,
                test_student_overrides: overridesPayload,
            });
            emitRosterDataUpdated('lists_settings_test_student_overrides');
            toast.success('Test student overrides saved');
        } finally {
            setIsSavingTestStudent(false);
        }
    };

    const addTa = async () => {
        if (!newTaEmail) return;
        const { error } = await supabase.from('ta_allowlist').insert({ email: newTaEmail, active: true });
        if (error) {
            toast.error('Failed to add TA');
        } else {
            toast.success('TA added');
            setNewTaEmail('');
            void fetchTaList();
        }
    };

    const removeTa = async (id: string, email: string) => {
        if (email === 'saboor12124@gmail.com') {
            toast.error('Cannot remove master admin');
            return;
        }
        const { error } = await supabase.from('ta_allowlist').update({ active: false }).eq('id', id);
        if (error) {
            toast.error('Failed to remove TA');
        } else {
            toast.success('TA removed');
            void fetchTaList();
        }
    };

    const addSubmission = async () => {
        if (!newSubLabel) return;
        const { error } = await supabase.from('submissions_list').insert({ label: newSubLabel, active: true, sort_order: submissions.length + 1 });
        if (error) {
            toast.error('Failed to add submission');
        } else {
            toast.success('Submission added');
            setNewSubLabel('');
            void fetchSubmissions();
        }
    };

    const removeSubmission = async (id: string) => {
        const { error } = await supabase.from('submissions_list').update({ active: false }).eq('id', id);
        if (error) {
            toast.error('Failed to remove');
        } else {
            toast.success('Removed');
            void fetchSubmissions();
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
            const { error: authError } = await supabase.auth.updateUser({ password: newPassword });
            if (authError) {
                toast.error(`Failed to update login password: ${authError.message}`);
                return;
            }

            const { error: syncError } = await supabase.rpc('set_my_ta_password', { new_password: newPassword });
            if (syncError) {
                toast.warning(
                    'Login password updated, but failed to sync visible password. Please retry from settings.'
                );
                return;
            }

            setCurrentPassword(newPassword);
            setShowCurrentPassword(false);
            setNewPassword('');
            setConfirmPassword('');
            toast.success('Password updated successfully');
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
