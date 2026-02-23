import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ta/ui/button';
import { Textarea } from '@/components/ta/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ta/ui/card';
import { Input } from '@/components/ta/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ta/ui/table';
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
} from '@/components/ta/ui/alert-dialog';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ta/ui/dialog';
import { Label } from '@/components/ta/ui/label';
import { toast } from 'sonner';
import { Badge } from '@/components/ta/ui/badge';
import { Loader2, Upload, Pencil, Trash2, Plus, Search } from 'lucide-react';
import { normalizeName } from '@/lib/utils';
import { emitRosterDataUpdated } from '@/lib/data-sync-events';

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
                const rawName = parts.slice(1, parts.length - 1).join(' ');
                const student_name = normalizeName(rawName);

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
            await fetchRoster();
            emitRosterDataUpdated('roster_management_replace');

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
                        student_name: normalizeName(formData.student_name),
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
                        student_name: normalizeName(formData.student_name),
                        erp: formData.erp,
                        class_no: formData.class_no
                    }]);

                if (error) throw error;
                toast.success('Student added');
            }

            setIsDialogOpen(false);
            await fetchRoster();
            emitRosterDataUpdated(currentStudent ? 'roster_management_edit' : 'roster_management_add');

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
            await fetchRoster();
            emitRosterDataUpdated('roster_management_delete');
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
        <div className="ta-module-shell  space-y-8 animate-fade-in">
            <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
                <div className="space-y-1">
                    <h1 className="ta-section-title text-3xl font-extrabold uppercase">
                        Roster Management
                    </h1>
                    <p className="ta-section-subtitle">Import and manage the student master list.</p>
                </div>

                <div className="flex items-center gap-3">
                    <Badge variant="outline" className="hidden sm:flex h-9 px-4 rounded-lg font-bold">
                        {count} Students Enrolled
                    </Badge>
                    <Button onClick={openAddDialog} className="h-11 px-6 rounded-xl font-bold uppercase">
                        <Plus className="mr-2 h-4 w-4" /> Add Student
                    </Button>
                </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-12">
                <div className="lg:col-span-4 space-y-6">
                    <div className="neo-out ta-module-card p-6 rounded-2xl border shadow-none">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl neo-in flex items-center justify-center text-debossed-sm">
                                <Upload className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold">Import Roster</h3>
                                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Past Roster Details</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <Textarea
                                placeholder="Example: 2481 Muhammad Saboor 26611"
                                className="min-h-[400px] rounded-xl font-mono text-xs resize-none"
                                value={rosterText}
                                onChange={(e) => setRosterText(e.target.value)}
                            />

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="outline" className="w-full h-12 rounded-xl font-bold uppercase" disabled={!rosterText.trim() || isUploading}>
                                        {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                                        Replace Entire Roster
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="border-[#141517]">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="text-2xl font-bold">Wipe and Replace?</AlertDialogTitle>
                                        <AlertDialogDescription className="text-muted-foreground">
                                            This action will <span className="status-absent-text font-bold">PERMANENTLY DELETE</span> the current roster.
                                            Attendance logs will remain but may reference non-existent ERPs if they aren't in the new list.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel className="rounded-xl">Abort</AlertDialogCancel>
                                        <AlertDialogAction onClick={parseAndUpload} className="rounded-xl neo-btn neo-out text-debossed-sm">
                                            <span className="status-absent-text">Confirm Replacement</span>
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-8 space-y-6">
                    <div className="neo-out ta-module-card rounded-2xl border shadow-none">
                        <div className="p-6 border-b border-[#141517] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div className="relative w-full sm:w-80 group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-debossed-sm transition-colors" />
                                <Input
                                    placeholder="Search by ERP, Name or Class..."
                                    className="pl-9 h-11"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>

                            <Table containerClassName="min-h-[500px]" scrollClassName="overflow-x-auto">
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground py-4 px-6">Class</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground py-4 px-6">Student Identity</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground py-4 px-6">ERP ID</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground py-4 px-6 text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredStudents.map((s) => (
                                        <TableRow key={s.id} className="transition-colors group">
                                            <TableCell className="py-4 px-6">
                                                <Badge variant="outline" className="font-mono text-[10px]">
                                                    CL-{s.class_no}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-4 px-6">
                                                <span className="font-bold text-sm">{s.student_name}</span>
                                            </TableCell>
                                            <TableCell className="py-4 px-6">
                                                <span className="text-xs font-mono text-muted-foreground">{s.erp}</span>
                                            </TableCell>
                                            <TableCell className="py-4 px-6 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={() => openEditDialog(s)}>
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={() => handleDeleteStudent(s.id)}>
                                                        <Trash2 className="h-4 w-4 status-absent-text" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {filteredStudents.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center py-20">
                                                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                                    <Search className="h-10 w-10 opacity-20" />
                                                    <p className="text-sm font-medium">No students matched your search criteria.</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                    </div>
                </div>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="neo-out ta-module-card sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-bold uppercase tracking-tight">{currentStudent ? 'Edit Student Profile' : 'Add New Entry'}</DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            {currentStudent ? 'Modify student identifying information.' : 'Introduce a new student to the master roster.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-6">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-debossed-sm">Full Name</Label>
                            <Input
                                className="h-11 rounded-xl"
                                value={formData.student_name}
                                onChange={e => setFormData({ ...formData, student_name: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-debossed-sm">ERP ID</Label>
                                <Input
                                    className="h-11 rounded-xl font-mono"
                                    value={formData.erp}
                                    onChange={e => setFormData({ ...formData, erp: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-debossed-sm">Class Code</Label>
                                <Input
                                    className="h-11 rounded-xl font-mono"
                                    value={formData.class_no}
                                    onChange={e => setFormData({ ...formData, class_no: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleSaveStudent} disabled={isSaving} className="w-full h-12 rounded-xl font-bold uppercase">
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {currentStudent ? 'Confirm Updates' : 'Add to Roster'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
