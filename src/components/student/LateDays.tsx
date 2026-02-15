import { useEffect, useMemo, useState } from 'react';
import { addHours, format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { useERP } from '@/lib/erp-context';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type LateDayAssignment = Tables<'late_day_assignments'>;
type LateDayClaim = Tables<'late_day_claims'>;

interface ClaimLateDaysResult {
  claim?: LateDayClaim;
  remaining_late_days?: number;
  total_used?: number;
}

interface LateDaysProps {
  onRemainingChange?: (remaining: number) => void;
}

const TOTAL_LATE_DAYS = 3;

const isBeforeOrEqual = (left: Date, right: Date) => left.getTime() <= right.getTime();

export default function LateDays({ onRemainingChange }: LateDaysProps) {
  const { user } = useAuth();
  const { erp } = useERP();

  const [assignments, setAssignments] = useState<LateDayAssignment[]>([]);
  const [claims, setClaims] = useState<LateDayClaim[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState('1');

  const assignmentTitleById = useMemo(
    () =>
      assignments.reduce<Record<string, string>>((acc, assignment) => {
        acc[assignment.id] = assignment.title;
        return acc;
      }, {}),
    [assignments]
  );

  const totalUsed = useMemo(() => claims.reduce((sum, claim) => sum + claim.days_used, 0), [claims]);
  const remaining = Math.max(TOTAL_LATE_DAYS - totalUsed, 0);

  useEffect(() => {
    onRemainingChange?.(remaining);
  }, [remaining, onRemainingChange]);

  const latestDeadlineByAssignment = useMemo(() => {
    const map = new Map<string, Date>();

    for (const claim of claims) {
      const candidate = new Date(claim.due_at_after_claim);
      const existing = map.get(claim.assignment_id);
      if (!existing || candidate.getTime() > existing.getTime()) {
        map.set(claim.assignment_id, candidate);
      }
    }

    return map;
  }, [claims]);

  const getCurrentDeadline = (assignment: LateDayAssignment) =>
    latestDeadlineByAssignment.get(assignment.id) ?? new Date(assignment.due_at);

  const claimableAssignments = useMemo(() => {
    if (remaining <= 0) return [];

    const now = new Date();
    return assignments.filter((assignment) => assignment.active && isBeforeOrEqual(now, getCurrentDeadline(assignment)));
  }, [assignments, latestDeadlineByAssignment, remaining]);

  const selectedAssignment = selectedAssignmentId
    ? assignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null
    : null;
  const selectedCurrentDeadline = selectedAssignment ? getCurrentDeadline(selectedAssignment) : null;
  const selectedDaysCount = Number(selectedDays) || 1;
  const previewDueAt = selectedCurrentDeadline ? addHours(selectedCurrentDeadline, selectedDaysCount * 24) : null;

  const fetchLateDays = async () => {
    if (!user?.email || !erp) {
      setAssignments([]);
      setClaims([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const [assignmentResponse, claimsResponse] = await Promise.all([
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
      toast.error(`Failed to load late-day assignments: ${assignmentResponse.error.message}`);
      setAssignments([]);
    } else {
      setAssignments(assignmentResponse.data ?? []);
    }

    if (claimsResponse.error) {
      toast.error(`Failed to load late-day claims: ${claimsResponse.error.message}`);
      setClaims([]);
    } else {
      setClaims(claimsResponse.data ?? []);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    void fetchLateDays();
  }, [user?.email, erp]);

  const resetClaimFlow = () => {
    setSelectedAssignmentId(null);
    setSelectedDays('1');
  };

  const openClaimDialog = () => {
    resetClaimFlow();
    setIsDialogOpen(true);
  };

  const closeClaimDialog = () => {
    setIsDialogOpen(false);
    resetClaimFlow();
  };

  const handleClaim = async () => {
    if (!selectedAssignmentId) return;

    const days = Number(selectedDays);
    if (!Number.isInteger(days) || days < 1 || days > remaining) {
      toast.error('Please select a valid number of late days.');
      return;
    }

    setIsClaiming(true);

    const { data, error } = await supabase.rpc('claim_late_days', {
      p_assignment_id: selectedAssignmentId,
      p_days: days,
    });

    if (error) {
      toast.error(error.message);
      setIsClaiming(false);
      return;
    }

    const payload = (data ?? null) as ClaimLateDaysResult | null;

    if (payload?.claim) {
      setClaims((prev) => [payload.claim as LateDayClaim, ...prev]);
    } else {
      await fetchLateDays();
    }

    if (typeof payload?.remaining_late_days === 'number') {
      onRemainingChange?.(payload.remaining_late_days);
    }

    toast.success('Late days claimed successfully.');
    setIsClaiming(false);
    closeClaimDialog();
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
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Late Days</CardTitle>
              <CardDescription>Use up to 3 late days total. Claimed late days cannot be revoked by students.</CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="px-3 py-1 text-sm font-semibold">
                {remaining} / {TOTAL_LATE_DAYS} remaining
              </Badge>
              <Button onClick={openClaimDialog} disabled={remaining <= 0 || claimableAssignments.length === 0}>
                Avail Late Days
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {remaining <= 0
            ? 'You have used all available late days.'
            : claimableAssignments.length === 0
              ? 'No assignments are currently eligible for late-day claims.'
              : `${claimableAssignments.length} assignment(s) currently available for claiming late days.`}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Claim History</CardTitle>
          <CardDescription>Each claim is timestamped and records the new due date after claiming.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assignment</TableHead>
                  <TableHead>Days Used</TableHead>
                  <TableHead>Claimed At</TableHead>
                  <TableHead>Previous Due</TableHead>
                  <TableHead>New Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No late-day claims yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  claims.map((claim) => (
                    <TableRow key={claim.id}>
                      <TableCell className="font-medium">{assignmentTitleById[claim.assignment_id] ?? 'Unknown Assignment'}</TableCell>
                      <TableCell>{claim.days_used}</TableCell>
                      <TableCell>{format(new Date(claim.claimed_at), 'PPP p')}</TableCell>
                      <TableCell>{format(new Date(claim.due_at_before_claim), 'PPP p')}</TableCell>
                      <TableCell>{format(new Date(claim.due_at_after_claim), 'PPP p')}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => (open ? setIsDialogOpen(true) : closeClaimDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Avail Late Days</DialogTitle>
            <DialogDescription>
              Step 1: choose an assignment. Step 2: choose how many late days to apply.
            </DialogDescription>
          </DialogHeader>

          {remaining <= 0 ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              You have 0 remaining late days.
            </div>
          ) : !selectedAssignment ? (
            <div className="space-y-2">
              {claimableAssignments.length === 0 ? (
                <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                  No assignments are currently eligible for claims.
                </div>
              ) : (
                claimableAssignments.map((assignment) => (
                  <Button
                    key={assignment.id}
                    type="button"
                    variant="outline"
                    className="h-auto w-full justify-between py-3 text-left"
                    onClick={() => {
                      setSelectedAssignmentId(assignment.id);
                      setSelectedDays('1');
                    }}
                  >
                    <span className="font-medium">{assignment.title}</span>
                    <span className="text-xs text-muted-foreground">
                      Current due: {format(getCurrentDeadline(assignment), 'PPP p')}
                    </span>
                  </Button>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border p-3">
                <div className="text-sm font-semibold">{selectedAssignment.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Current due: {selectedCurrentDeadline ? format(selectedCurrentDeadline, 'PPP p') : '-'}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Late days to claim</div>
                <Select value={selectedDays} onValueChange={setSelectedDays}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select days" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: remaining }, (_, index) => index + 1).map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div>Claim timestamp: {format(new Date(), 'PPP p')}</div>
                <div className="mt-1">
                  New due date if claimed: {previewDueAt ? format(previewDueAt, 'PPP p') : '-'}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {selectedAssignment && (
              <Button type="button" variant="outline" onClick={() => setSelectedAssignmentId(null)} disabled={isClaiming}>
                Back
              </Button>
            )}
            <Button
              type="button"
              onClick={handleClaim}
              disabled={isClaiming || !selectedAssignment || remaining <= 0 || claimableAssignments.length === 0}
            >
              {isClaiming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
