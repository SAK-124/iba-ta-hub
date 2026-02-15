import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type LateDayAssignment = Tables<'late_day_assignments'>;
type LateDayClaim = Tables<'late_day_claims'>;

const toLocalDateTimeInput = (isoValue: string) => {
  const date = new Date(isoValue);
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
};

const toIsoFromLocalDateTime = (localValue: string) => new Date(localValue).toISOString();

export default function LateDaysManagement() {
  const [assignments, setAssignments] = useState<LateDayAssignment[]>([]);
  const [claims, setClaims] = useState<LateDayClaim[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingAssignment, setIsCreatingAssignment] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingClaimId, setDeletingClaimId] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newDueAt, setNewDueAt] = useState('');

  const [editingAssignment, setEditingAssignment] = useState<LateDayAssignment | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDueAt, setEditDueAt] = useState('');

  const assignmentById = useMemo(
    () =>
      assignments.reduce<Record<string, LateDayAssignment>>((acc, assignment) => {
        acc[assignment.id] = assignment;
        return acc;
      }, {}),
    [assignments]
  );

  const fetchLateDaysData = async () => {
    setIsLoading(true);

    const [assignmentResponse, claimResponse] = await Promise.all([
      supabase
        .from('late_day_assignments')
        .select('*')
        .order('active', { ascending: false })
        .order('due_at', { ascending: true }),
      supabase
        .from('late_day_claims')
        .select('*')
        .order('claimed_at', { ascending: false }),
    ]);

    if (assignmentResponse.error) {
      toast.error(`Failed to load assignments: ${assignmentResponse.error.message}`);
      setAssignments([]);
    } else {
      setAssignments(assignmentResponse.data ?? []);
    }

    if (claimResponse.error) {
      toast.error(`Failed to load claims: ${claimResponse.error.message}`);
      setClaims([]);
    } else {
      setClaims(claimResponse.data ?? []);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    void fetchLateDaysData();
  }, []);

  const handleCreateAssignment = async () => {
    if (!newTitle.trim() || !newDueAt) {
      toast.error('Please provide assignment title and deadline.');
      return;
    }

    setIsCreatingAssignment(true);
    const { error } = await supabase.from('late_day_assignments').insert({
      title: newTitle.trim(),
      due_at: toIsoFromLocalDateTime(newDueAt),
      active: true,
    });

    if (error) {
      toast.error(`Failed to create assignment: ${error.message}`);
      setIsCreatingAssignment(false);
      return;
    }

    toast.success('Assignment added.');
    setNewTitle('');
    setNewDueAt('');
    setIsCreatingAssignment(false);
    await fetchLateDaysData();
  };

  const openEditDialog = (assignment: LateDayAssignment) => {
    setEditingAssignment(assignment);
    setEditTitle(assignment.title);
    setEditDueAt(toLocalDateTimeInput(assignment.due_at));
  };

  const closeEditDialog = () => {
    setEditingAssignment(null);
    setEditTitle('');
    setEditDueAt('');
  };

  const handleSaveEdit = async () => {
    if (!editingAssignment) return;
    if (!editTitle.trim() || !editDueAt) {
      toast.error('Please provide assignment title and deadline.');
      return;
    }

    setIsSavingEdit(true);
    const { error } = await supabase
      .from('late_day_assignments')
      .update({
        title: editTitle.trim(),
        due_at: toIsoFromLocalDateTime(editDueAt),
      })
      .eq('id', editingAssignment.id);

    if (error) {
      toast.error(`Failed to update assignment: ${error.message}`);
      setIsSavingEdit(false);
      return;
    }

    toast.success('Assignment updated.');
    setIsSavingEdit(false);
    closeEditDialog();
    await fetchLateDaysData();
  };

  const handleArchiveAssignment = async (assignment: LateDayAssignment) => {
    if (!assignment.active) return;
    if (!confirm('Archive this assignment? It will be hidden from students but claim history is preserved.')) return;

    const { error } = await supabase
      .from('late_day_assignments')
      .update({ active: false })
      .eq('id', assignment.id);

    if (error) {
      toast.error(`Failed to archive assignment: ${error.message}`);
      return;
    }

    toast.success('Assignment archived.');
    await fetchLateDaysData();
  };

  const handleDeleteClaim = async (claimId: string) => {
    if (!confirm('Delete this claim row? This will return those late days to the student balance.')) return;

    setDeletingClaimId(claimId);
    const { error } = await supabase
      .from('late_day_claims')
      .delete()
      .eq('id', claimId);

    if (error) {
      toast.error(`Failed to delete claim: ${error.message}`);
      setDeletingClaimId(null);
      return;
    }

    toast.success('Claim deleted.');
    setClaims((prev) => prev.filter((claim) => claim.id !== claimId));
    setDeletingClaimId(null);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Late Day Assignments</CardTitle>
          <CardDescription>Create and manage assignments that support late-day claims.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
            <Input
              placeholder="Assignment title"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
            />
            <Input
              type="datetime-local"
              value={newDueAt}
              onChange={(event) => setNewDueAt(event.target.value)}
            />
            <Button onClick={handleCreateAssignment} disabled={isCreatingAssignment}>
              {isCreatingAssignment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add
            </Button>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assignment</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No late-day assignments yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  assignments.map((assignment) => (
                    <TableRow key={assignment.id}>
                      <TableCell className="font-medium">{assignment.title}</TableCell>
                      <TableCell>{format(new Date(assignment.due_at), 'PPP p')}</TableCell>
                      <TableCell>
                        <Badge variant={assignment.active ? 'default' : 'secondary'}>
                          {assignment.active ? 'Active' : 'Archived'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(assignment)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleArchiveAssignment(assignment)}
                            disabled={!assignment.active}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Late Day Claims</CardTitle>
          <CardDescription>All student late-day claims with claim time and updated deadlines.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>ERP</TableHead>
                  <TableHead>Assignment</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Claimed At</TableHead>
                  <TableHead>New Due</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No late-day claims found.
                    </TableCell>
                  </TableRow>
                ) : (
                  claims.map((claim) => (
                    <TableRow key={claim.id}>
                      <TableCell className="font-medium">{claim.student_email}</TableCell>
                      <TableCell>{claim.student_erp}</TableCell>
                      <TableCell>{assignmentById[claim.assignment_id]?.title ?? 'Unknown Assignment'}</TableCell>
                      <TableCell>{claim.days_used}</TableCell>
                      <TableCell>{format(new Date(claim.claimed_at), 'PPP p')}</TableCell>
                      <TableCell>{format(new Date(claim.due_at_after_claim), 'PPP p')}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClaim(claim.id)}
                          disabled={deletingClaimId === claim.id}
                        >
                          {deletingClaimId === claim.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(editingAssignment)} onOpenChange={(open) => (!open ? closeEditDialog() : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Assignment</DialogTitle>
            <DialogDescription>Update assignment title and deadline.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              placeholder="Assignment title"
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
            />
            <Input
              type="datetime-local"
              value={editDueAt}
              onChange={(event) => setEditDueAt(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeEditDialog} disabled={isSavingEdit}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSavingEdit}>
              {isSavingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
