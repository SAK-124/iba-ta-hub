import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ta/ui/card';
import { Button } from '@/components/ta/ui/button';
import { Input } from '@/components/ta/ui/input';
import { Label } from '@/components/ta/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ta/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ta/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ta/ui/dialog';
import { Calendar, Edit2, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface Session {
  id: string;
  session_number: number;
  session_date: string;
  day_of_week: string;
  start_time: string | null;
  end_time: string | null;
}

export default function TASessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [sessionNumber, setSessionNumber] = useState('');
  const [sessionDate, setSessionDate] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState<string>('Sunday');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .order('session_number', { ascending: true });

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error('Error fetching sessions:', error);
      toast.error('Failed to fetch sessions');
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingSession(null);
    const nextNumber = sessions.length > 0 ? Math.max(...sessions.map(s => s.session_number)) + 1 : 1;
    setSessionNumber(nextNumber.toString());
    setSessionDate('');
    setDayOfWeek('Sunday');
    setStartTime('');
    setEndTime('');
    setIsDialogOpen(true);
  };

  const openEditDialog = (session: Session) => {
    setEditingSession(session);
    setSessionNumber(session.session_number.toString());
    setSessionDate(session.session_date);
    setDayOfWeek(session.day_of_week);
    setStartTime(session.start_time || '');
    setEndTime(session.end_time || '');
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!sessionNumber || !sessionDate || !dayOfWeek) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSaving(true);
    try {
      const sessionData = {
        session_number: parseInt(sessionNumber),
        session_date: sessionDate,
        day_of_week: dayOfWeek,
        start_time: startTime || null,
        end_time: endTime || null
      };

      if (editingSession) {
        const { error } = await supabase
          .from('sessions')
          .update(sessionData)
          .eq('id', editingSession.id);

        if (error) throw error;
        toast.success('Session updated successfully');
      } else {
        const { error } = await supabase
          .from('sessions')
          .insert([sessionData]);

        if (error) throw error;
        toast.success('Session created successfully');
      }

      setIsDialogOpen(false);
      fetchSessions();
    } catch (error: unknown) {
      console.error('Error saving session:', error);
      if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.includes('sessions_session_number_key')) {
        toast.error('Session number already exists');
      } else {
        toast.error('Failed to save session');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (session: Session) => {
    if (!confirm(`Delete Session ${session.session_number}? This will also delete all attendance records for this session.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', session.id);

      if (error) throw error;
      toast.success('Session deleted');
      fetchSessions();
    } catch (error) {
      console.error('Error deleting session:', error);
      toast.error('Failed to delete session');
    }
  };

  return (
    <div className="ta-module-shell">
      <Card className="ta-module-card">
        <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          <CardTitle>Sessions</CardTitle>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={fetchSessions} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreateDialog}>
                <Plus className="w-4 h-4 mr-2" />
                Add Session
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingSession ? 'Edit Session' : 'Create Session'}</DialogTitle>
                <DialogDescription>
                  {editingSession ? 'Update session details' : 'Add a new class session'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Session Number</Label>
                    <Input
                      type="number"
                      value={sessionNumber}
                      onChange={(e) => setSessionNumber(e.target.value)}
                      min="1"
                    />
                  </div>
                  <div>
                    <Label>Day</Label>
                    <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS_OF_WEEK.map((day) => (
                          <SelectItem key={day} value={day}>{day}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Start Time (Optional)</Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    placeholder="HH:MM"
                  />
                </div>
                <div>
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>End Time (Optional)</Label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    placeholder="HH:MM"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Used for penalty time window calculations. Defaults to 23:59 if not set.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingSession ? 'Update' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        </CardHeader>
        <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No sessions created yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Start Time</TableHead>
                  <TableHead>End Time</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map(session => (
                  <TableRow key={session.id}>
                    <TableCell className="font-medium">S{String(session.session_number).padStart(2, '0')}</TableCell>
                    <TableCell>{format(new Date(session.session_date), 'MMM d, yyyy')}</TableCell>
                    <TableCell>{session.day_of_week}</TableCell>
                    <TableCell>{session.start_time || '-'}</TableCell>
                    <TableCell>{session.end_time || '-'}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(session)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(session)}>
                          <Trash2 className="w-4 h-4 status-absent-text" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        </CardContent>
      </Card>
    </div>
  );
}
