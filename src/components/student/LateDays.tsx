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
type LateDayAdjustment = Tables<'late_day_adjustments'>;

interface ClaimLateDaysResult {
  claim?: LateDayClaim;
  remaining_late_days?: number;
  total_allowance?: number;
}

interface LateDaysSummary {
  remaining: number;
  totalAllowance: number;
  grantedDays: number;
  usedDays: number;
}

interface LateDaysProps {
  onSummaryChange?: (summary: LateDaysSummary) => void;
}

type AvailabilityState = 'claimable' | 'awaiting_deadline' | 'closed' | 'no_balance' | 'archived';

interface AssignmentSummary {
  assignment: LateDayAssignment;
  currentDeadline: Date | null;
  availability: AvailabilityState;
  canClaim: boolean;
  claimedDays: number;
  claimCount: number;
  latestClaimAt: Date | null;
}

const BASE_LATE_DAYS = 3;

const isBeforeOrEqual = (left: Date, right: Date) => left.getTime() <= right.getTime();

const availabilityConfig: Record<AvailabilityState, { label: string; className: string }> = {
  claimable: { label: 'Can Claim', className: 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent' },
  awaiting_deadline: { label: 'Awaiting Deadline', className: 'bg-amber-500 hover:bg-amber-600 text-white border-transparent' },
  closed: { label: 'Window Closed', className: 'bg-slate-500 hover:bg-slate-600 text-white border-transparent' },
  no_balance: { label: 'No Late Days Left', className: 'bg-rose-500 hover:bg-rose-600 text-white border-transparent' },
  archived: { label: 'Archived', className: 'bg-muted text-muted-foreground border-border' },
};

export default function LateDays({ onSummaryChange }: LateDaysProps) {
  const { user } = useAuth();
  const { erp } = useERP();

  const [assignments, setAssignments] = useState<LateDayAssignment[]>([]);
  const [claims, setClaims] = useState<LateDayClaim[]>([]);
  const [adjustments, setAdjustments] = useState<LateDayAdjustment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('');
  const [selectedDays, setSelectedDays] = useState('1');

  const assignmentTitleById = useMemo(
    () =>
      assignments.reduce<Record<string, string>>((acc, assignment) => {
        acc[assignment.id] = assignment.title;
        return acc;
      }, {}),
    [assignments]
  );

  const grantedDays = useMemo(() => adjustments.reduce((sum, adjustment) => sum + adjustment.days_delta, 0), [adjustments]);
  const usedDays = useMemo(() => claims.reduce((sum, claim) => sum + claim.days_used, 0), [claims]);
  const totalAllowance = BASE_LATE_DAYS + grantedDays;
  const remaining = Math.max(totalAllowance - usedDays, 0);

  useEffect(() => {
    onSummaryChange?.({ remaining, totalAllowance, grantedDays, usedDays });
  }, [remaining, totalAllowance, grantedDays, usedDays, onSummaryChange]);

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

  const claimStatsByAssignment = useMemo(() => {
    const map = new Map<string, { claimedDays: number; claimCount: number; latestClaimAt: Date | null }>();
    for (const claim of claims) {
      const existing = map.get(claim.assignment_id) ?? { claimedDays: 0, claimCount: 0, latestClaimAt: null };
      const claimedAt = new Date(claim.claimed_at);
      map.set(claim.assignment_id, {
        claimedDays: existing.claimedDays + claim.days_used,
        claimCount: existing.claimCount + 1,
        latestClaimAt:
          !existing.latestClaimAt || claimedAt.getTime() > existing.latestClaimAt.getTime()
            ? claimedAt
            : existing.latestClaimAt,
      });
    }
    return map;
  }, [claims]);

  const assignmentSummaries = useMemo(() => {
    const now = new Date();

    return assignments.map<AssignmentSummary>((assignment) => {
      const latestClaimDeadline = latestDeadlineByAssignment.get(assignment.id) ?? null;
      const currentDeadline = latestClaimDeadline ?? (assignment.due_at ? new Date(assignment.due_at) : null);
      const claimStats = claimStatsByAssignment.get(assignment.id) ?? {
        claimedDays: 0,
        claimCount: 0,
        latestClaimAt: null,
      };

      let availability: AvailabilityState;
      if (!assignment.active) {
        availability = 'archived';
      } else if (!currentDeadline) {
        availability = 'awaiting_deadline';
      } else if (!isBeforeOrEqual(now, currentDeadline)) {
        availability = 'closed';
      } else if (remaining <= 0) {
        availability = 'no_balance';
      } else {
        availability = 'claimable';
      }

      return {
        assignment,
        currentDeadline,
        availability,
        canClaim: availability === 'claimable',
        claimedDays: claimStats.claimedDays,
        claimCount: claimStats.claimCount,
        latestClaimAt: claimStats.latestClaimAt,
      };
    });
  }, [assignments, claimStatsByAssignment, latestDeadlineByAssignment, remaining]);

  const activeSummaries = assignmentSummaries.filter((summary) => summary.assignment.active);
  const claimableSummaries = activeSummaries.filter((summary) => summary.canClaim);
  const awaitingDeadlineCount = activeSummaries.filter((summary) => summary.availability === 'awaiting_deadline').length;
  const claimedAssignmentCount = activeSummaries.filter((summary) => summary.claimCount > 0).length;

  const selectedSummary = selectedAssignmentId
    ? assignmentSummaries.find((summary) => summary.assignment.id === selectedAssignmentId) ?? null
    : null;
  const selectedDaysCount = Number(selectedDays) || 1;
  const previewDueAt =
    selectedSummary?.currentDeadline && selectedSummary.canClaim
      ? addHours(selectedSummary.currentDeadline, selectedDaysCount * 24)
      : null;

  const fetchLateDays = async () => {
    if (!user?.email || !erp) {
      setAssignments([]);
      setClaims([]);
      setAdjustments([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const [assignmentResponse, claimsResponse, adjustmentResponse] = await Promise.all([
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
        .from('late_day_adjustments')
        .select('*')
        .order('created_at', { ascending: false }),
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

    if (adjustmentResponse.error) {
      toast.error(`Failed to load late-day grants: ${adjustmentResponse.error.message}`);
      setAdjustments([]);
    } else {
      setAdjustments(adjustmentResponse.data ?? []);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    void fetchLateDays();
  }, [user?.email, erp]);

  const openClaimDialog = (assignmentId?: string) => {
    setSelectedAssignmentId(assignmentId ?? '');
    setSelectedDays('1');
    setIsDialogOpen(true);
  };

  const closeClaimDialog = () => {
    setIsDialogOpen(false);
    setSelectedAssignmentId('');
    setSelectedDays('1');
  };

  const handleClaim = async () => {
    if (!selectedSummary) return;
    if (!selectedSummary.canClaim) {
      toast.error('This assignment cannot be claimed right now.');
      return;
    }

    const days = Number(selectedDays);
    if (!Number.isInteger(days) || days < 1 || days > remaining) {
      toast.error('Please select a valid number of late days.');
      return;
    }

    setIsClaiming(true);
    const { data, error } = await supabase.rpc('claim_late_days', {
      p_assignment_id: selectedSummary.assignment.id,
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
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Remaining Late Days</CardDescription>
            <CardTitle>{remaining}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Used Days</CardDescription>
            <CardTitle>{usedDays}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Can Claim Now</CardDescription>
            <CardTitle>{claimableSummaries.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Awaiting Deadline</CardDescription>
            <CardTitle>{awaitingDeadlineCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Total allowance: {totalAllowance} (base {BASE_LATE_DAYS}{grantedDays > 0 ? ` + ${grantedDays} TA-granted` : ''}). Claimed across {claimedAssignmentCount} assignment(s).
      </p>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Assignment Status</CardTitle>
              <CardDescription>
                Assignments without deadlines are visible but cannot be claimed until TAs set a deadline.
              </CardDescription>
            </div>
            <Button onClick={() => openClaimDialog()} disabled={claimableSummaries.length === 0 || remaining <= 0}>
              Avail Late Days
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {grantedDays > 0 && (
            <div className="mb-4 rounded-lg border border-emerald-300/50 bg-emerald-50/40 p-3 text-sm text-emerald-800">
              TA grants applied: +{grantedDays} late day(s).
            </div>
          )}

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assignment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Current Deadline</TableHead>
                  <TableHead>Your Claims</TableHead>
                  <TableHead>Last Claimed</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeSummaries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No late-day assignments are active right now.
                    </TableCell>
                  </TableRow>
                ) : (
                  activeSummaries.map((summary) => (
                    <TableRow key={summary.assignment.id}>
                      <TableCell className="font-medium">{summary.assignment.title}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Badge className={availabilityConfig[summary.availability].className}>
                            {availabilityConfig[summary.availability].label}
                          </Badge>
                          {summary.claimCount > 0 && (
                            <Badge variant="outline">
                              Claimed {summary.claimedDays} day{summary.claimedDays === 1 ? '' : 's'}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {summary.currentDeadline ? format(summary.currentDeadline, 'PPP p') : 'Not set by TA'}
                      </TableCell>
                      <TableCell>{summary.claimCount > 0 ? `${summary.claimCount} claim(s)` : 'None'}</TableCell>
                      <TableCell>{summary.latestClaimAt ? format(summary.latestClaimAt, 'PPP p') : '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => openClaimDialog(summary.assignment.id)} disabled={!summary.canClaim}>
                          Claim
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {awaitingDeadlineCount > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {awaitingDeadlineCount} assignment(s) are waiting for TA deadline setup and cannot be claimed yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Claim History</CardTitle>
          <CardDescription>Immutable history of each claim you have made.</CardDescription>
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

      <Dialog open={isDialogOpen} onOpenChange={(open) => (!open ? closeClaimDialog() : setIsDialogOpen(true))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Avail Late Days</DialogTitle>
            <DialogDescription>
              Choose a claimable assignment and how many late days to apply.
            </DialogDescription>
          </DialogHeader>

          {claimableSummaries.length === 0 ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              No assignments are currently claimable.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">Assignment</div>
                <Select
                  value={selectedAssignmentId}
                  onValueChange={setSelectedAssignmentId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select claimable assignment" />
                  </SelectTrigger>
                  <SelectContent>
                    {claimableSummaries.map((summary) => (
                      <SelectItem key={summary.assignment.id} value={summary.assignment.id}>
                        {summary.assignment.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedSummary && (
                <>
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
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              onClick={handleClaim}
              disabled={isClaiming || !selectedSummary || !selectedSummary.canClaim}
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
