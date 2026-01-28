import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, CalendarIcon } from 'lucide-react';
import { format, getDay } from 'date-fns';
import { cn } from '@/lib/utils';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function SessionManagement() {
    const [sessions, setSessions] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // New session form
    const [sessionNum, setSessionNum] = useState('');
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
    const [day, setDay] = useState<string>('');
    const [customDay, setCustomDay] = useState('');
    const [useCustomDay, setUseCustomDay] = useState(false);
    const [endTime, setEndTime] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        fetchSessions();
    }, []);

    // Auto-detect day of week when date changes
    useEffect(() => {
        if (selectedDate) {
            const dayIndex = getDay(selectedDate);
            const detectedDay = DAYS_OF_WEEK[dayIndex];
            setDay(detectedDay);
            setUseCustomDay(false);
        }
    }, [selectedDate]);

    const fetchSessions = async () => {
        setIsLoading(true);
        const { data } = await supabase.from('sessions').select('*').order('session_number', { ascending: false });
        if (data) setSessions(data);
        setIsLoading(false);
    };

    const handleCreate = async () => {
        if (!sessionNum || !selectedDate) return;

        const finalDay = useCustomDay && customDay ? customDay : day;
        if (!finalDay) {
            toast.error('Please select or enter a day');
            return;
        }

        setIsCreating(true);
        try {
            const { error } = await supabase.from('sessions').insert({
                session_number: parseInt(sessionNum),
                session_date: format(selectedDate, 'yyyy-MM-dd'),
                day_of_week: finalDay,
                end_time: endTime || null
            });

            if (error) throw error;

            toast.success('Session created');
            setSessionNum('');
            setSelectedDate(undefined);
            setDay('');
            setCustomDay('');
            setUseCustomDay(false);
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
                    {/* Session Number */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-muted-foreground">Session Number</label>
                        <Input
                            placeholder="e.g. 1"
                            type="number"
                            value={sessionNum}
                            onChange={e => setSessionNum(e.target.value)}
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

                    {/* Day of Week - Auto-detected or Custom */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-muted-foreground">Day of Week</label>
                            {selectedDate && day && (
                                <span className="text-xs text-muted-foreground">
                                    Auto-detected: <span className="font-medium text-primary">{day}</span>
                                </span>
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
                                <SelectItem value="Friday">Friday</SelectItem>
                                <SelectItem value="Saturday">Saturday</SelectItem>
                                <SelectItem value="Sunday">Sunday</SelectItem>
                                <SelectItem value="Monday">Monday</SelectItem>
                                <SelectItem value="Tuesday">Tuesday</SelectItem>
                                <SelectItem value="Wednesday">Wednesday</SelectItem>
                                <SelectItem value="Thursday">Thursday</SelectItem>
                                <SelectItem value="custom">Custom...</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Custom Day Input */}
                        {useCustomDay && (
                            <Input
                                placeholder="Enter custom day (e.g. Holiday Makeup)"
                                value={customDay}
                                onChange={e => setCustomDay(e.target.value)}
                                className="mt-2"
                            />
                        )}
                    </div>

                    {/* End Time */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-muted-foreground">End Time (Optional)</label>
                        <Input
                            type="time"
                            value={endTime}
                            onChange={e => setEndTime(e.target.value)}
                        />
                    </div>

                    <Button className="w-full" onClick={handleCreate} disabled={isCreating || !sessionNum || !selectedDate}>
                        {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                        Create Session
                    </Button>
                </CardContent>
            </Card>

            <Card className="md:col-span-2">
                <CardHeader>
                    <CardTitle>Sessions List</CardTitle>
                    <CardDescription>All class sessions</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>
                    ) : sessions.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">No sessions created yet</div>
                    ) : (
                        <div className="rounded-md border overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-16">#</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Day</TableHead>
                                        <TableHead>End Time</TableHead>
                                        <TableHead className="text-right w-20">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sessions.map((s) => (
                                        <TableRow key={s.id}>
                                            <TableCell className="font-bold text-primary">{s.session_number}</TableCell>
                                            <TableCell>{format(new Date(s.session_date), 'PPP')}</TableCell>
                                            <TableCell>{s.day_of_week}</TableCell>
                                            <TableCell>{s.end_time || '-'}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)} className="hover:bg-destructive/10">
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
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
