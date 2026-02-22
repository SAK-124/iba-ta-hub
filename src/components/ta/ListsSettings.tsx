import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Trash2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/auth';

type AppSettings = {
    id: string;
    roster_verification_enabled: boolean;
    tickets_enabled: boolean;
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
            setSettings({
                ...data,
                tickets_enabled: data.tickets_enabled ?? true
            });
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

    if (!settings) return <Loader2 className="animate-spin" />;

    return (
        <div className="grid gap-6 md:grid-cols-2">
            <Card>
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

            <Card>
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

            <Card>
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
                            <div key={ta.id} className="flex items-center justify-between p-2 border rounded text-sm">
                                <span>{ta.email}</span>
                                <Button variant="ghost" size="sm" onClick={() => removeTa(ta.id, ta.email)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card>
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
                            <div key={sub.id} className="flex items-center justify-between p-2 border rounded text-sm">
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
