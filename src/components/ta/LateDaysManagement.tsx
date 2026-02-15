import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

type LateDayAssignment = Tables<'late_day_assignments'>;
type LateDayClaim = Tables<'late_day_claims'>;
type LateDayAdjustment = Tables<'late_day_adjustments'>;
type RosterStudent = Pick<Tables<'students_roster'>, 'id' | 'erp' | 'student_name' | 'class_no'>;

interface GrantRpcResult {
  remaining_late_days?: number;
}

interface ClaimGroup {
  key: string;
  assignment_id: string;
  student_email: string;
  student_erp: string;
  total_days_used: number;
  latest_claimed_at: string;
  current_due_at: string;
  events: LateDayClaim[];
}

const toLocalDateTimeInput = (isoValue: string | null) => {
  if (!isoValue) return '';
  const date = new Date(isoValue);
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
};

const toIsoFromLocalDateTime = (localValue: string) => new Date(localValue).toISOString();

const formatDeadline = (deadline: string | null) =>
  deadline ? format(new Date(deadline), 'PPP p') : 'Not set yet';

export default function LateDaysManagement() {
  const [assignments, setAssignments] = useState<LateDayAssignment[]>([]);
  const [claims, setClaims] = useState<LateDayClaim[]>([]);
  const [adjustments, setAdjustments] = useState<LateDayAdjustment[]>([]);
  const [rosterStudents, setRosterStudents] = useState<RosterStudent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingAssignment, setIsCreatingAssignment] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingClaimId, setDeletingClaimId] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newDueAt, setNewDueAt] = useState('');
  const [rosterSearchQuery, setRosterSearchQuery] = useState('');

  const [editingAssignment, setEditingAssignment] = useState<LateDayAssignment | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDueAt, setEditDueAt] = useState('');

  const [grantTarget, setGrantTarget] = useState<RosterStudent | null>(null);
  const [grantDays, setGrantDays] = useState('1');
  const [grantReason, setGrantReason] = useState('');
  const [isGranting, setIsGranting] = useState(false);
  const [selectedClaimGroupKey, setSelectedClaimGroupKey] = useState<string | null>(null);

  const assignmentById = useMemo(
    () =>
      assignments.reduce<Record<string, LateDayAssignment>>((acc, assignment) => {
        acc[assignment.id] = assignment;
        return acc;
      }, {}),
    [assignments]
  );

  const claimGroups = useMemo(() => {
    const groups: Record<string, ClaimGroup> = {};

    for (const claim of claims) {
      const key = `${claim.student_email}::${claim.student_erp}::${claim.assignment_id}`;
      const existing = groups[key];

      if (!existing) {
        groups[key] = {
          key,
          assignment_id: claim.assignment_id,
          student_email: claim.student_email,
          student_erp: claim.student_erp,
          total_days_used: claim.days_used,
          latest_claimed_at: claim.claimed_at,
          current_due_at: claim.due_at_after_claim,
          events: [claim],
        };
        continue;
      }

      existing.total_days_used += claim.days_used;
      if (new Date(claim.claimed_at).getTime() > new Date(existing.latest_claimed_at).getTime()) {
        existing.latest_claimed_at = claim.claimed_at;
      }
      if (new Date(claim.due_at_after_claim).getTime() > new Date(existing.current_due_at).getTime()) {
        existing.current_due_at = claim.due_at_after_claim;
      }
      existing.events.push(claim);
    }

    return Object.values(groups)
      .map((group) => ({
        ...group,
        events: group.events.sort(
          (a, b) => new Date(b.claimed_at).getTime() - new Date(a.claimed_at).getTime()
        ),
      }))
      .sort(
        (a, b) => new Date(b.latest_claimed_at).getTime() - new Date(a.latest_claimed_at).getTime()
      );
  }, [claims]);

  const selectedClaimGroup = useMemo(
    () => claimGroups.find((group) => group.key === selectedClaimGroupKey) ?? null,
    [claimGroups, selectedClaimGroupKey]
  );

  const usedByErp = useMemo(() => {
    const map: Record<string, number> = {};
    for (const claim of claims) {
      map[claim.student_erp] = (map[claim.student_erp] ?? 0) + claim.days_used;
    }
    return map;
  }, [claims]);

  const grantedByErp = useMemo(() => {
    const map: Record<string, number> = {};
    for (const adjustment of adjustments) {
      map[adjustment.student_erp] = (map[adjustment.student_erp] ?? 0) + adjustment.days_delta;
    }
    return map;
  }, [adjustments]);

  const rosterWithBalances = useMemo(
    () =>
      rosterStudents.map((student) => {
        const used = usedByErp[student.erp] ?? 0;
        const granted = grantedByErp[student.erp] ?? 0;
        const totalAllowance = 3 + granted;
        const remaining = Math.max(totalAllowance - used, 0);
        return {
          ...student,
          used,
          granted,
          remaining,
        };
      }),
    [rosterStudents, usedByErp, grantedByErp]
  );

  const filteredRosterWithBalances = useMemo(() => {
    const query = rosterSearchQuery.trim().toLowerCase();
    if (!query) return rosterWithBalances;

    return rosterWithBalances.filter((student) => {
      const haystack = `${student.class_no} ${student.student_name} ${student.erp}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [rosterWithBalances, rosterSearchQuery]);

  const fetchLateDaysData = async () => {
    setIsLoading(true);

    const [assignmentResponse, claimResponse, rosterResponse, adjustmentsResponse] = await Promise.all([
      supabase
        .from('late_day_assignments')
        .select('*')
        .order('active', { ascending: false })
        .order('due_at', { ascending: true, nullsFirst: false }),
      supabase
        .from('late_day_claims')
        .select('*')
        .order('claimed_at', { ascending: false }),
      supabase
        .from('students_roster')
        .select('id, erp, student_name, class_no')
        .order('class_no', { ascending: true })
        .order('student_name', { ascending: true }),
      supabase
        .from('late_day_adjustments')
        .select('*')
        .order('created_at', { ascending: false }),
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

    if (rosterResponse.error) {
      toast.error(`Failed to load roster: ${rosterResponse.error.message}`);
      setRosterStudents([]);
    } else {
      setRosterStudents((rosterResponse.data ?? []) as RosterStudent[]);
    }

    if (adjustmentsResponse.error) {
      toast.error(`Failed to load grants: ${adjustmentsResponse.error.message}`);
      setAdjustments([]);
    } else {
      setAdjustments(adjustmentsResponse.data ?? []);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    void fetchLateDaysData();
  }, []);

  useEffect(() => {
    if (selectedClaimGroupKey && !selectedClaimGroup) {
      setSelectedClaimGroupKey(null);
    }
  }, [selectedClaimGroupKey, selectedClaimGroup]);

  const handleCreateAssignment = async () => {
    if (!newTitle.trim()) {
      toast.error('Please provide assignment title.');
      return;
    }

    setIsCreatingAssignment(true);
    const { error } = await supabase.from('late_day_assignments').insert({
      title: newTitle.trim(),
      due_at: newDueAt ? toIsoFromLocalDateTime(newDueAt) : null,
      active: true,
    });

    if (error) {
      if (error.message.includes('null value in column "due_at"')) {
        toast.error('Database schema is outdated. Run: ALTER TABLE public.late_day_assignments ALTER COLUMN due_at DROP NOT NULL;');
      } else {
        toast.error(`Failed to create assignment: ${error.message}`);
      }
      setIsCreatingAssignment(false);
      return;
    }

    toast.success(newDueAt ? 'Assignment added.' : 'Assignment added without deadline.');
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
    if (!editTitle.trim()) {
      toast.error('Please provide assignment title.');
      return;
    }

    setIsSavingEdit(true);
    const { error } = await supabase
      .from('late_day_assignments')
      .update({
        title: editTitle.trim(),
        due_at: editDueAt ? toIsoFromLocalDateTime(editDueAt) : null,
      })
      .eq('id', editingAssignment.id);

    if (error) {
      if (error.message.includes('null value in column "due_at"')) {
        toast.error('Database schema is outdated. Run: ALTER TABLE public.late_day_assignments ALTER COLUMN due_at DROP NOT NULL;');
      } else {
        toast.error(`Failed to update assignment: ${error.message}`);
      }
      setIsSavingEdit(false);
      return;
    }

    toast.success(editDueAt ? 'Assignment updated.' : 'Assignment updated. Deadline cleared.');
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

  const openClaimBreakdown = (claimGroupKey: string) => {
    setSelectedClaimGroupKey(claimGroupKey);
  };

  const openGrantDialog = (student: RosterStudent) => {
    setGrantTarget(student);
    setGrantDays('1');
    setGrantReason('');
  };

  const closeGrantDialog = () => {
    setGrantTarget(null);
    setGrantDays('1');
    setGrantReason('');
  };

  const handleGrantLateDays = async () => {
    if (!grantTarget) return;
    const days = Number(grantDays);
    if (!Number.isInteger(days) || days < 1) {
      toast.error('Days must be a whole number greater than 0.');
      return;
    }

    setIsGranting(true);
    const { data, error } = await supabase.rpc('ta_add_late_day', {
      p_student_erp: grantTarget.erp,
      p_days: days,
      p_reason: grantReason.trim() ? grantReason.trim() : null,
    });

    if (error) {
      toast.error(`Failed to add late day: ${error.message}`);
      setIsGranting(false);
      return;
    }

    const payload = (data ?? null) as GrantRpcResult | null;
    toast.success(
      typeof payload?.remaining_late_days === 'number'
        ? `Late days added. New remaining: ${payload.remaining_late_days}`
        : 'Late days added.'
    );
    setIsGranting(false);
    closeGrantDialog();
    await fetchLateDaysData();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Late Day Assignments</CardTitle>
            <CardDescription>
              Add assignments now and set deadlines later. Students can only claim once a deadline exists.
            </CardDescription>
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
            <p className="text-xs text-muted-foreground">Leave deadline blank to create as draft; set it later from Edit.</p>

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
                        <TableCell>{formatDeadline(assignment.due_at)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant={assignment.active ? 'default' : 'secondary'}>
                              {assignment.active ? 'Active' : 'Archived'}
                            </Badge>
                            {!assignment.due_at && assignment.active && (
                              <Badge variant="outline" className="border-amber-400 text-amber-600">
                                Deadline Required
                              </Badge>
                            )}
                          </div>
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
            <CardDescription>
              Grouped by student and assignment. Click a row to view day-by-day claim history.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[360px] overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>ERP</TableHead>
                    <TableHead>Assignment</TableHead>
                    <TableHead>Total Days</TableHead>
                    <TableHead>Latest Claim</TableHead>
                    <TableHead>Current Due</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claimGroups.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        No late-day claims found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    claimGroups.map((group) => (
                      <TableRow
                        key={group.key}
                        className="cursor-pointer"
                        onClick={() => openClaimBreakdown(group.key)}
                      >
                        <TableCell className="font-medium">{group.student_email}</TableCell>
                        <TableCell>{group.student_erp}</TableCell>
                        <TableCell>{assignmentById[group.assignment_id]?.title ?? 'Unknown Assignment'}</TableCell>
                        <TableCell>{group.total_days_used}</TableCell>
                        <TableCell>{format(new Date(group.latest_claimed_at), 'PPP p')}</TableCell>
                        <TableCell>{format(new Date(group.current_due_at), 'PPP p')}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              openClaimBreakdown(group.key);
                            }}
                          >
                            View
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
      </div>

      <div className="space-y-6 xl:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle>Student Roster Balances</CardTitle>
            <CardDescription>
              Search any student and grant extra late days whenever needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by class, name, or ERP"
                className="pl-9"
                value={rosterSearchQuery}
                onChange={(event) => setRosterSearchQuery(event.target.value)}
              />
            </div>

            <div className="max-h-[620px] overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead className="text-right">Used</TableHead>
                    <TableHead className="text-right">Granted</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRosterWithBalances.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No students match your search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRosterWithBalances.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{student.student_name}</span>
                            <span className="text-xs text-muted-foreground">
                              {student.class_no} · {student.erp}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{student.used}</TableCell>
                        <TableCell className="text-right">{student.granted}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className="font-semibold">{student.remaining}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" onClick={() => openGrantDialog(student)}>
                            Add
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
      </div>

      <Dialog open={Boolean(selectedClaimGroupKey)} onOpenChange={(open) => (!open ? setSelectedClaimGroupKey(null) : undefined)}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Claim Breakdown</DialogTitle>
            <DialogDescription>
              {selectedClaimGroup
                ? `${selectedClaimGroup.student_email} (${selectedClaimGroup.student_erp}) · ${
                    assignmentById[selectedClaimGroup.assignment_id]?.title ?? 'Unknown Assignment'
                  }`
                : 'This claim group is no longer available.'}
            </DialogDescription>
          </DialogHeader>

          {!selectedClaimGroup ? (
            <p className="text-sm text-muted-foreground">No claim events to show.</p>
          ) : (
            <div className="max-h-[420px] overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Days</TableHead>
                    <TableHead>Claimed At</TableHead>
                    <TableHead>Due Before</TableHead>
                    <TableHead>Due After</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedClaimGroup.events.map((claimEvent) => (
                    <TableRow key={claimEvent.id}>
                      <TableCell>{claimEvent.days_used}</TableCell>
                      <TableCell>{format(new Date(claimEvent.claimed_at), 'PPP p')}</TableCell>
                      <TableCell>{format(new Date(claimEvent.due_at_before_claim), 'PPP p')}</TableCell>
                      <TableCell>{format(new Date(claimEvent.due_at_after_claim), 'PPP p')}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClaim(claimEvent.id)}
                          disabled={deletingClaimId === claimEvent.id}
                        >
                          {deletingClaimId === claimEvent.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedClaimGroupKey(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingAssignment)} onOpenChange={(open) => (!open ? closeEditDialog() : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Assignment</DialogTitle>
            <DialogDescription>
              Update assignment title and optionally set or clear the deadline.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              placeholder="Assignment title"
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
            />
            <div className="flex items-center gap-2">
              <Input
                type="datetime-local"
                value={editDueAt}
                onChange={(event) => setEditDueAt(event.target.value)}
              />
              <Button type="button" variant="outline" onClick={() => setEditDueAt('')} disabled={!editDueAt}>
                <X className="mr-1 h-4 w-4" />
                Clear
              </Button>
            </div>
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

      <Dialog open={Boolean(grantTarget)} onOpenChange={(open) => (!open ? closeGrantDialog() : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Late Day</DialogTitle>
            <DialogDescription>
              Grant extra late days to {grantTarget?.student_name} ({grantTarget?.erp}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Days to add</label>
              <Input
                type="number"
                min={1}
                step={1}
                value={grantDays}
                onChange={(event) => setGrantDays(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Reason (optional)</label>
              <Textarea
                placeholder="e.g., approved exception by TA team"
                value={grantReason}
                onChange={(event) => setGrantReason(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeGrantDialog} disabled={isGranting}>
              Cancel
            </Button>
            <Button onClick={handleGrantLateDays} disabled={isGranting}>
              {isGranting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Grant Late Day
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
