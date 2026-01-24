import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

export default function SessionManagement() {
    const [sessions, setSessions] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // New session form
    const [sessionNum, setSessionNum] = useState('');
    const [date, setDate] = useState('');
    const [day, setDay] = useState<'Friday' | 'Saturday'>('Friday');
    const [endTime, setEndTime] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        fetchSessions();
    }, []);

    const fetchSessions = async () => {
        setIsLoading(true);
        const { data } = await supabase.from('sessions').select('*').order('session_number', { ascending: false });
        if (data) setSessions(data);
        setIsLoading(false);
    };

    const handleCreate = async () => {
        if (!sessionNum || !date || !day) return;
        setIsCreating(true);
        try {
            const { error } = await supabase.from('sessions').insert({
                session_number: parseInt(sessionNum),
                session_date: date,
                day_of_week: day,
                end_time: endTime || null
            });

            if (error) throw error;

            toast.success('Session created');
            setSessionNum('');
            setDate('');
            setEndTime('');
            fetchSessions();
        } catch (error: any) {
            toast.error('Failed to create session: ' + error.message);
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure? This will delete all attendance for this session.')) return;
        const { error } = await supabase.from('sessions').delete().eq('id', id);
        if (error) {
            toast.error('Failed to delete');
        } else {
            toast.success('Session deleted');
            fetchSessions();
        }
    };

    return (
        <div className="grid gap-6 md:grid-cols-3">
            <Card className="md:col-span-1 h-fit">
                <CardHeader>
                    <CardTitle>Add Session</CardTitle>
                    <CardDescription>Create a new class session</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Input
                        placeholder="Session Number (e.g. 1)"
                        type="number"
                        value={sessionNum}
                        onChange={e => setSessionNum(e.target.value)}
                    />
                    <Input
                        type="date"
                        value={date}
                        onChange={e => setDate(e.target.value)}
                    />
                    <Select value={day} onValueChange={(v: any) => setDay(v)}>
                        <SelectTrigger><SelectValue placeholder="Day" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Friday">Friday</SelectItem>
                            <SelectItem value="Saturday">Saturday</SelectItem>
                        </SelectContent>
                    </Select>
                    <Input
                        type="time"
                        placeholder="End Time (Optional)"
                        value={endTime}
                        onChange={e => setEndTime(e.target.value)}
                    />
                    <Button className="w-full" onClick={handleCreate} disabled={isCreating}>
                        {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                        Create Session
                    </Button>
                </CardContent>
            </Card>

            <Card className="md:col-span-2">
                <CardHeader>
                    <CardTitle>Sessions List</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>#</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Day</TableHead>
                                    <TableHead>End Time</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sessions.map((s) => (
                                    <TableRow key={s.id}>
                                        <TableCell className="font-medium">{s.session_number}</TableCell>
                                        <TableCell>{format(new Date(s.session_date), 'PPP')}</TableCell>
                                        <TableCell>{s.day_of_week}</TableCell>
                                        <TableCell>{s.end_time || '-'}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
