import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';

type AppSettings = {
    id: string;
    roster_verification_enabled: boolean;
    tickets_enabled: boolean;
};

export default function ListsSettings() {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [taEmails, setTaEmails] = useState<any[]>([]);
    const [newTaEmail, setNewTaEmail] = useState('');

    const [submissions, setSubmissions] = useState<any[]>([]);
    const [newSubLabel, setNewSubLabel] = useState('');

    useEffect(() => {
        fetchSettings();
        fetchTaList();
        fetchSubmissions();
    }, []);

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
        const { data } = await supabase.from('ta_allowlist').select('*').eq('active', true);
        if (data) setTaEmails(data);
    };

    const fetchSubmissions = async () => {
        const { data } = await supabase.from('submissions_list').select('*').eq('active', true).order('sort_order');
        if (data) setSubmissions(data);
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
            fetchTaList();
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
            fetchTaList();
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
            fetchSubmissions();
        }
    };

    const removeSubmission = async (id: string) => {
        const { error } = await supabase.from('submissions_list').update({ active: false }).eq('id', id);
        if (error) {
            toast.error('Failed to remove');
        } else {
            toast.success('Removed');
            fetchSubmissions();
        }
    };

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
