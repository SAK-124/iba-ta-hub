import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ta/ui/card';
import { Button } from '@/components/ta/ui/button';
import { Input } from '@/components/ta/ui/input';
import { Label } from '@/components/ta/ui/label';
import { Switch } from '@/components/ta/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ta/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ta/ui/dialog';
import { AlertCircle, AlertTriangle, Loader2, Plus, RefreshCw, Settings, Trash2, Users, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ta/ui/badge';

export default function TASettings() {
  const [rosterVerification, setRosterVerification] = useState(true);
  const [taEmails, setTaEmails] = useState<{ id: string; email: string; active: boolean; created_at: string }[]>([]);
  const [submissions, setSubmissions] = useState<{ id: string; label: string; active: boolean; sort_order: number | null }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newTaEmail, setNewTaEmail] = useState('');
  const [newTaPassword, setNewTaPassword] = useState('');
  const [newSubmission, setNewSubmission] = useState('');
  const [isTaDialogOpen, setIsTaDialogOpen] = useState(false);
  const [isSubDialogOpen, setIsSubDialogOpen] = useState(false);

  // Danger Zone State
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const [settingsRes, taRes, subRes] = await Promise.all([
        supabase.from('app_settings').select('*').eq('id', '00000000-0000-0000-0000-000000000001').single(),
        supabase.from('ta_allowlist').select('id, email, active, created_at').order('email'),
        supabase.from('submissions_list').select('*').order('sort_order')
      ]);

      if (settingsRes.data) setRosterVerification(settingsRes.data.roster_verification_enabled);
      if (taRes.data) setTaEmails(taRes.data);
      if (subRes.data) setSubmissions(subRes.data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRosterVerification = async () => {
    const newValue = !rosterVerification;
    const { error } = await supabase
      .from('app_settings')
      .update({ roster_verification_enabled: newValue })
      .eq('id', '00000000-0000-0000-0000-000000000001');

    if (error) {
      toast.error('Failed to update setting');
      return;
    }
    setRosterVerification(newValue);
    toast.success(`Roster verification ${newValue ? 'enabled' : 'disabled'}`);
  };

  const addTaEmail = async () => {
    if (!newTaEmail) return;
    const { error } = await supabase.from('ta_allowlist').insert([{ email: newTaEmail, initial_password: newTaPassword || null }]);
    if (error) {
      toast.error('Failed to add TA email');
      return;
    }
    toast.success('TA email added');
    setNewTaEmail('');
    setNewTaPassword('');
    setIsTaDialogOpen(false);
    fetchSettings();
  };

  const removeTaEmail = async (id: string) => {
    const { error } = await supabase.from('ta_allowlist').delete().eq('id', id);
    if (error) {
      toast.error('Failed to remove TA');
      return;
    }
    toast.success('TA removed');
    fetchSettings();
  };

  const addSubmission = async () => {
    if (!newSubmission) return;
    const maxOrder = submissions.length > 0 ? Math.max(...submissions.map(s => s.sort_order || 0)) : 0;
    const { error } = await supabase.from('submissions_list').insert([{ label: newSubmission, sort_order: maxOrder + 1 }]);
    if (error) {
      toast.error('Failed to add submission');
      return;
    }
    toast.success('Submission added');
    setNewSubmission('');
    setIsSubDialogOpen(false);
    fetchSettings();
  };

  const removeSubmission = async (id: string) => {
    const { error } = await supabase.from('submissions_list').delete().eq('id', id);
    if (error) {
      toast.error('Failed to remove submission');
      return;
    }
    toast.success('Submission removed');
    fetchSettings();
  };

  const deleteAllAttendance = async () => {
    if (deleteConfirmation !== 'DELETE ALL ATTENDANCE') {
      toast.error('Invalid confirmation phrase');
      return;
    }

    setIsDeletingAll(true);
    try {
      const { error } = await supabase.from('attendance').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      toast.success('All attendance records wiped successfully');
      setDeleteConfirmation('');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Wipe failed: ' + message);
    } finally {
      setIsDeletingAll(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs">Loading Security Policies</p>
      </div>
    );
  }

  return (
    <div className="ta-module-shell space-y-10 animate-fade-in pb-10">
      <div className="space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground uppercase">
          App Configuration
        </h1>
        <p className="text-muted-foreground font-medium">Global settings and administrative controls.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-8">
          <div className="ta-sand-card p-6 rounded-2xl border border-primary/10 shadow-xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold">General Settings</h3>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Access & Validation</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/10">
                <div className="space-y-0.5">
                  <p className="font-bold text-sm">Roster Verification</p>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">Only enrolled students can log sessions</p>
                </div>
                <Switch checked={rosterVerification} onCheckedChange={toggleRosterVerification} />
              </div>
            </div>
          </div>

          <div className="ta-sand-card rounded-2xl border border-primary/10 shadow-xl overflow-hidden">
            <div className="p-6 border-b border-primary/10 flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">TA Allowlist</h3>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Authorized Administrative Portals</p>
                </div>
              </div>

              <Dialog open={isTaDialogOpen} onOpenChange={setIsTaDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="rounded-lg bg-primary text-primary-foreground font-bold text-xs uppercase transition-all shadow-md active:scale-95">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add
                  </Button>
                </DialogTrigger>
                <DialogContent className="ta-sand-card border-primary/20 sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-bold uppercase tracking-tight">Authorize TA</DialogTitle>
                  </DialogHeader>
                  <div className="py-6 space-y-5">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-primary">Email Address</Label>
                      <Input
                        value={newTaEmail}
                        onChange={(e) => setNewTaEmail(e.target.value)}
                        placeholder="ta@iba.edu.pk"
                        className="h-11 bg-background/50 border-primary/20 rounded-xl focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-primary">Signup Key (Optional)</Label>
                      <Input
                        value={newTaPassword}
                        onChange={(e) => setNewTaPassword(e.target.value)}
                        placeholder="Secure Password for First Login"
                        className="h-11 bg-background/50 border-primary/20 rounded-xl font-mono focus:ring-2 focus:ring-primary/20"
                      />
                      <p className="text-[9px] text-muted-foreground italic px-1">
                        If provided, the TA can use this to register their own account.
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={addTaEmail} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold uppercase shadow-lg shadow-primary/20">Grant Access</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="max-h-[300px] overflow-auto">
              <Table>
                <TableBody>
                  {taEmails.map(ta => (
                    <TableRow key={ta.id} className="border-primary/5 hover:bg-primary/5 transition-colors group">
                      <TableCell className="py-4 px-6">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold group-hover:text-primary transition-colors">{ta.email}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 px-6 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 opacity-50 transition-all" onClick={() => removeTaEmail(ta.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="ta-sand-card rounded-2xl border border-primary/10 shadow-xl overflow-hidden">
            <div className="p-6 border-b border-primary/10 flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Submissions</h3>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Active Components</p>
                </div>
              </div>

              <Dialog open={isSubDialogOpen} onOpenChange={setIsSubDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="rounded-lg bg-primary text-primary-foreground font-bold text-xs uppercase shadow-md transition-all active:scale-95">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add
                  </Button>
                </DialogTrigger>
                <DialogContent className="ta-sand-card border-primary/20 sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-bold uppercase tracking-tight">Add Submission Type</DialogTitle>
                  </DialogHeader>
                  <div className="py-6 space-y-2">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-primary">Display Label</Label>
                    <Input
                      value={newSubmission}
                      onChange={(e) => setNewSubmission(e.target.value)}
                      placeholder="e.g., Final Exam, assignment_01"
                      className="h-11 bg-background/50 border-primary/20 rounded-xl focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <DialogFooter>
                    <Button onClick={addSubmission} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold uppercase shadow-lg shadow-primary/20">Register Type</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="max-h-[300px] overflow-auto">
              <Table>
                <TableBody>
                  {submissions.map(s => (
                    <TableRow key={s.id} className="border-primary/5 hover:bg-primary/5 transition-colors group">
                      <TableCell className="py-4 px-6">
                        <span className="text-sm font-bold group-hover:text-primary transition-colors">{s.label}</span>
                      </TableCell>
                      <TableCell className="py-4 px-6 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 opacity-50 transition-all" onClick={() => removeSubmission(s.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="ta-sand-card p-6 rounded-2xl border border-destructive/20 shadow-xl bg-destructive/5 relative overflow-hidden group">
            <div className="absolute -right-12 -top-12 w-32 h-32 bg-destructive/10 rounded-full blur-3xl group-hover:bg-destructive/20 transition-all duration-500" />

            <div className="flex items-center gap-3 mb-6 relative">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-destructive">Danger Zone</h3>
                <p className="text-[10px] text-destructive/70 font-bold uppercase tracking-wider">Irreversible Operations</p>
              </div>
            </div>

            <div className="space-y-4 relative">
              <div className="p-4 rounded-xl border border-destructive/10 bg-black/40">
                <p className="text-xs font-bold text-destructive/80 mb-3 uppercase tracking-tight">Wipe All Attendance Data</p>
                <p className="text-[10px] text-muted-foreground mb-4 leading-relaxed">
                  This will PERMANENTLY delete every single record in modern database. All history, logs, and marks will be lost forever.
                </p>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[9px] font-bold uppercase tracking-widest opacity-60">Type phrase to confirm:</Label>
                    <code className="block p-2 bg-destructive/10 text-destructive text-[10px] rounded font-mono font-bold mb-2">DELETE ALL ATTENDANCE</code>
                    <Input
                      value={deleteConfirmation}
                      onChange={(e) => setDeleteConfirmation(e.target.value)}
                      placeholder="Confirm Phrase..."
                      className="h-10 bg-background/50 border-destructive/20 rounded-lg font-mono text-xs focus:ring-destructive/30"
                    />
                  </div>

                  <Button
                    variant="destructive"
                    className="w-full h-11 rounded-xl font-bold uppercase shadow-lg shadow-destructive/20 active:scale-95 transition-all text-xs"
                    disabled={deleteConfirmation !== 'DELETE ALL ATTENDANCE' || isDeletingAll}
                    onClick={deleteAllAttendance}
                  >
                    {isDeletingAll ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                    Initiate Global Wipe
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
