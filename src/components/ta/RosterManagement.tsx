import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, Pencil, Trash2, Plus } from 'lucide-react';

export default function RosterManagement() {
    const [rosterText, setRosterText] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [students, setStudents] = useState<any[]>([]);
    const [count, setCount] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');

    // Editing State
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [currentStudent, setCurrentStudent] = useState<any>(null); // null = adding, object = editing
    const [formData, setFormData] = useState({ student_name: '', erp: '', class_no: '' });

    useEffect(() => {
        fetchRoster();
    }, []);

    const fetchRoster = async () => {
        // Fetch more for search (limit 1000)
        const { count, data } = await supabase.from('students_roster').select('*', { count: 'exact' }).limit(1000);
        setCount(count || 0);
        setStudents(data || []);
    };

    const parseAndUpload = async () => {
        setIsUploading(true);
        try {
            const lines = rosterText.trim().split('\n');
            const parsedStudents = [];
            const errors = [];

            for (const line of lines) {
                if (!line.trim()) continue;
                const parts = line.trim().split(/\s+/);
                if (parts.length < 3) {
                    errors.push(`Invalid format: ${line}`);
                    continue;
                }

                const class_no = parts[0];
                const erp = parts[parts.length - 1];
                const student_name = parts.slice(1, parts.length - 1).join(' ');

                parsedStudents.push({ class_no, student_name, erp });
            }

            if (parsedStudents.length === 0) {
                throw new Error('No valid students found to upload.');
            }

            // Delete existing roster
            const { error: deleteError } = await supabase.from('students_roster').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            if (deleteError) throw deleteError;

            // Insert new
            const { error: insertError } = await supabase.from('students_roster').insert(parsedStudents);
            if (insertError) throw insertError;

            toast.success(`Successfully uploaded ${parsedStudents.length} students.`);
            if (errors.length > 0) {
                toast.warning(`Skipped ${errors.length} invalid lines.`);
                console.warn('Skipped lines:', errors);
            }

            setRosterText('');
            fetchRoster();

        } catch (error: any) {
            toast.error('Failed to upload roster: ' + error.message);
        } finally {
            setIsUploading(false);
        }
    };

    const handleSaveStudent = async () => {
        if (!formData.erp || !formData.student_name || !formData.class_no) {
            toast.error('All fields are required');
            return;
        }

        setIsSaving(true);
        try {
            if (currentStudent) {
                // Update
                const { error } = await supabase
                    .from('students_roster')
                    .update({
                        student_name: formData.student_name,
                        erp: formData.erp,
                        class_no: formData.class_no
                    })
                    .eq('id', currentStudent.id);

                if (error) throw error;
                toast.success('Student updated');
            } else {
                // Insert
                const { error } = await supabase
                    .from('students_roster')
                    .insert([{
                        student_name: formData.student_name,
                        erp: formData.erp,
                        class_no: formData.class_no
                    }]);

                if (error) throw error;
                toast.success('Student added');
            }

            setIsDialogOpen(false);
            fetchRoster();

        } catch (error: any) {
            toast.error('Failed to save: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteStudent = async (id: string) => {
        if (!confirm('Are you sure you want to delete this student?')) return;

        try {
            const { error } = await supabase.from('students_roster').delete().eq('id', id);
            if (error) throw error;
            toast.success('Student deleted');
            setStudents(prev => prev.filter(s => s.id !== id));
        } catch (error: any) {
            toast.error('Failed to delete: ' + error.message);
        }
    };

    const openAddDialog = () => {
        setCurrentStudent(null);
        setFormData({ student_name: '', erp: '', class_no: '' });
        setIsDialogOpen(true);
    };

    const openEditDialog = (student: any) => {
        setCurrentStudent(student);
        setFormData({
            student_name: student.student_name,
            erp: student.erp,
            class_no: student.class_no
        });
        setIsDialogOpen(true);
    };

    const filteredStudents = students.filter(s =>
        s.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.erp.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.class_no.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="grid gap-6 md:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>Import Roster</CardTitle>
                    <CardDescription>
                        Paste roster below. Format: ClassNo Name... ERP<br />
                        Example: <code className="bg-muted px-1">2481 Muhammad Saboor 26611</code>
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Textarea
                        placeholder="Paste your roster data here..."
                        className="min-h-[300px] font-mono text-sm"
                        value={rosterText}
                        onChange={(e) => setRosterText(e.target.value)}
                    />

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button className="w-full" disabled={!rosterText.trim() || isUploading}>
                                {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                                Replace Roster
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will DELETE the entire existing roster and replace it with the new data.
                                    Existing attendance records will refer to ERPs, so if ERPs change, attendance data might become orphaned or invalid.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={parseAndUpload}>Continue</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <CardTitle>Current Roster</CardTitle>
                            <Badge variant="secondary" className="text-sm">
                                {count} Students
                            </Badge>
                        </div>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Search..."
                                className="w-[120px]"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <Button size="icon" variant="outline" onClick={openAddDialog}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border max-h-[500px] overflow-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Class</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>ERP</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredStudents.map((s) => (
                                    <TableRow key={s.id}>
                                        <TableCell>{s.class_no}</TableCell>
                                        <TableCell>{s.student_name}</TableCell>
                                        <TableCell>{s.erp}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(s)}>
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteStudent(s.id)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredStudents.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                                            No students found
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{currentStudent ? 'Edit Student' : 'Add Student'}</DialogTitle>
                        <DialogDescription>
                            {currentStudent ? 'Update student details.' : 'Add a new student to the roster manually.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">Name</Label>
                            <Input
                                className="col-span-3"
                                value={formData.student_name}
                                onChange={e => setFormData({ ...formData, student_name: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">ERP</Label>
                            <Input
                                className="col-span-3"
                                value={formData.erp}
                                onChange={e => setFormData({ ...formData, erp: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">Class No</Label>
                            <Input
                                className="col-span-3"
                                value={formData.class_no}
                                onChange={e => setFormData({ ...formData, class_no: e.target.value })}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleSaveStudent} disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
