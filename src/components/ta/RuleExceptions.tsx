import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Trash2, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function RuleExceptions() {
    const [exceptions, setExceptions] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterDay, setFilterDay] = useState('all');

    // New exception form
    const [newErp, setNewErp] = useState('');
    const [newType, setNewType] = useState('camera_excused');
    const [newDay, setNewDay] = useState('both');
    const [newNotes, setNewNotes] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [openDialog, setOpenDialog] = useState(false);

    useEffect(() => {
        fetchExceptions();
    }, []);

    const fetchExceptions = async () => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('rule_exceptions')
            .select('*')
            .order('created_at', { ascending: false });

        if (!error && data) {
            setExceptions(data);
        }
        setIsLoading(false);
    };

    const handleAddException = async () => {
        if (!newErp) return;
        setIsAdding(true);

        try {
            // Fetch student name first
            const { data: student } = await supabase.from('students_roster').select('student_name, class_no').eq('erp', newErp).single();

            const payload = {
                erp: newErp,
                student_name: student?.student_name || 'Unknown',
                class_no: student?.class_no,
                issue_type: newType,
                assigned_day: newDay,
                notes: newNotes
            };

            const { error } = await supabase.from('rule_exceptions').insert(payload);
            if (error) throw error;

            toast.success('Exception added');
            setOpenDialog(false);
            setNewErp('');
            setNewNotes('');
            fetchExceptions();

        } catch (error: any) {
            toast.error('Failed: ' + error.message);
        } finally {
            setIsAdding(false);
        }
    };

    const deleteException = async (id: string) => {
        const { error } = await supabase.from('rule_exceptions').delete().eq('id', id);
        if (error) {
            toast.error('Failed to delete');
        } else {
            toast.success('Removed exception');
            setExceptions(prev => prev.filter(e => e.id !== id));
        }
    };

    const filteredExceptions = exceptions.filter(e => {
        if (filterDay !== 'all' && e.assigned_day !== filterDay && e.assigned_day !== 'both') return false;
        return true;
    });

    return (
        <Card>
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
                                        <Input value={newErp} onChange={e => setNewErp(e.target.value)} placeholder="e.g. 26611" />
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
                    <div className="rounded-md border overflow-x-auto">
                        <Table>
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
                                        <TableCell className="max-w-[200px] truncate" title={ex.notes}>{ex.notes}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => deleteException(ex.id)}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
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
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
