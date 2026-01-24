import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';

export default function RosterManagement() {
    const [rosterText, setRosterText] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [students, setStudents] = useState<any[]>([]);
    const [count, setCount] = useState(0);

    useEffect(() => {
        fetchRoster();
    }, []);

    const fetchRoster = async () => {
        const { count, data } = await supabase.from('students_roster').select('*', { count: 'exact' }).limit(10);
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
            const { error: deleteError } = await supabase.from('students_roster').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
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
                    <CardTitle>Current Roster</CardTitle>
                    <CardDescription>Total Students: {count}</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Class</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>ERP</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {students.map((s) => (
                                <TableRow key={s.id}>
                                    <TableCell>{s.class_no}</TableCell>
                                    <TableCell>{s.student_name}</TableCell>
                                    <TableCell>{s.erp}</TableCell>
                                </TableRow>
                            ))}
                            {students.length < count && (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                                        ...and {count - students.length} more
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
