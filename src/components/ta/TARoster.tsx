import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ta/ui/card';
import { Button } from '@/components/ta/ui/button';
import { Textarea } from '@/components/ta/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ta/ui/table';
import { AlertCircle, Loader2, RefreshCw, Trash2, Upload, Users } from 'lucide-react';
import { toast } from 'sonner';

interface Student {
  id: string;
  class_no: string;
  student_name: string;
  erp: string;
}

export default function TARoster() {
  const [roster, setRoster] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [rosterInput, setRosterInput] = useState('');
  const [parsedPreview, setParsedPreview] = useState<{ class_no: string; student_name: string; erp: string }[]>([]);

  useEffect(() => {
    fetchRoster();
  }, []);

  const fetchRoster = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('students_roster')
        .select('*')
        .order('class_no')
        .order('student_name');

      if (error) throw error;
      setRoster(data || []);
    } catch (error) {
      console.error('Error fetching roster:', error);
      toast.error('Failed to fetch roster');
    } finally {
      setIsLoading(false);
    }
  };

  const parseRosterInput = (input: string) => {
    const lines = input.split('\n').filter(line => line.trim());
    const parsed = lines.map(line => {
      const tokens = line.trim().split(/\s+/);
      if (tokens.length < 3) return null;
      
      const class_no = tokens[0];
      const erp = tokens[tokens.length - 1];
      const student_name = tokens.slice(1, -1).join(' ');
      
      return { class_no, student_name, erp };
    }).filter(Boolean) as { class_no: string; student_name: string; erp: string }[];
    
    setParsedPreview(parsed);
    return parsed;
  };

  const handleInputChange = (value: string) => {
    setRosterInput(value);
    parseRosterInput(value);
  };

  const handleReplaceRoster = async () => {
    if (parsedPreview.length === 0) {
      toast.error('No valid roster data to import');
      return;
    }

    setIsSaving(true);
    try {
      // Delete all existing attendance first (due to foreign key)
      await supabase.from('attendance').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      // Delete existing roster
      await supabase.from('students_roster').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      // Insert new roster
      const { error } = await supabase
        .from('students_roster')
        .insert(parsedPreview);

      if (error) throw error;

      toast.success(`Roster replaced with ${parsedPreview.length} students`);
      setRosterInput('');
      setParsedPreview([]);
      fetchRoster();
    } catch (error) {
      console.error('Error replacing roster:', error);
      toast.error('Failed to replace roster');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="ta-module-shell space-y-6">
      <Card className="ta-module-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Import Roster
          </CardTitle>
          <CardDescription>
            Paste roster in format: class_no student_name... erp (one per line)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={rosterInput}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="S01 John Doe Smith 12345
S01 Jane Mary Johnson 12346
S02 Robert James Brown 12347"
            rows={8}
            className="font-mono text-sm"
          />

          {parsedPreview.length > 0 && (
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <p className="text-sm font-medium">Preview: {parsedPreview.length} students parsed</p>
              <div className="max-h-40 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Class</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>ERP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedPreview.slice(0, 10).map((s, i) => (
                      <TableRow key={i}>
                        <TableCell>{s.class_no}</TableCell>
                        <TableCell>{s.student_name}</TableCell>
                        <TableCell className="font-mono">{s.erp}</TableCell>
                      </TableRow>
                    ))}
                    {parsedPreview.length > 10 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          ... and {parsedPreview.length - 10} more
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button onClick={handleReplaceRoster} disabled={isSaving || parsedPreview.length === 0}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Trash2 className="w-4 h-4 mr-2" />
              Replace Roster
            </Button>
            <p className="text-sm text-muted-foreground">
              Warning: This will delete all existing roster and attendance data.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="ta-module-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            <CardTitle>Current Roster ({roster.length} students)</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchRoster} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : roster.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No students in roster yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>ERP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster.map(student => (
                    <TableRow key={student.id}>
                      <TableCell>{student.class_no}</TableCell>
                      <TableCell>{student.student_name}</TableCell>
                      <TableCell className="font-mono">{student.erp}</TableCell>
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
