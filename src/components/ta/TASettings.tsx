import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Plus, RefreshCw, Settings, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';

export default function TASettings() {
  const [rosterVerification, setRosterVerification] = useState(true);
  const [taEmails, setTaEmails] = useState<{ id: string; email: string; active: boolean; initial_password?: string }[]>([]);
  const [submissions, setSubmissions] = useState<{ id: string; label: string; active: boolean; sort_order: number | null }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newTaEmail, setNewTaEmail] = useState('');
  const [newTaPassword, setNewTaPassword] = useState('');
  const [newSubmission, setNewSubmission] = useState('');
  const [isTaDialogOpen, setIsTaDialogOpen] = useState(false);
  const [isSubDialogOpen, setIsSubDialogOpen] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const [settingsRes, taRes, subRes] = await Promise.all([
        supabase.from('app_settings').select('*').eq('id', '00000000-0000-0000-0000-000000000001').single(),
        supabase.from('ta_allowlist').select('*').order('email'),
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

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings className="w-5 h-5" />App Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Roster Verification</p>
              <p className="text-sm text-muted-foreground">Require students to have valid ERP in roster</p>
            </div>
            <Switch checked={rosterVerification} onCheckedChange={toggleRosterVerification} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" />TA Allowlist</CardTitle>
          <Dialog open={isTaDialogOpen} onOpenChange={setIsTaDialogOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-2" />Add TA</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add TA Email</DialogTitle></DialogHeader>
              <div className="py-4 space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={newTaEmail} onChange={(e) => setNewTaEmail(e.target.value)} placeholder="ta@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Initial Password (Optional)</Label>
                  <Input
                    value={newTaPassword}
                    onChange={(e) => setNewTaPassword(e.target.value)}
                    placeholder="Set initial password for lazy signup"
                    type="text"
                  />
                  <p className="text-xs text-muted-foreground">
                    This password allows the TA to sign up automatically on their first login.
                  </p>
                </div>
              </div>
              <DialogFooter><Button onClick={addTaEmail}>Add</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              {taEmails.map(ta => (
                <TableRow key={ta.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{ta.email}</span>
                      {ta.initial_password && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          Key: {ta.initial_password}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => removeTaEmail(ta.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Submissions List</CardTitle>
          <Dialog open={isSubDialogOpen} onOpenChange={setIsSubDialogOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-2" />Add</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Submission</DialogTitle></DialogHeader>
              <div className="py-4">
                <Label>Label</Label>
                <Input value={newSubmission} onChange={(e) => setNewSubmission(e.target.value)} placeholder="Assignment 1" />
              </div>
              <DialogFooter><Button onClick={addSubmission}>Add</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              {submissions.map(s => (
                <TableRow key={s.id}>
                  <TableCell>{s.label}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => removeSubmission(s.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
