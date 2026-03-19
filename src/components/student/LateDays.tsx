import { useCallback, useEffect, useMemo, useState } from 'react';
import { addHours, format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { formatDate, toValidDate } from '@/lib/date-format';
import { useERP } from '@/lib/erp-context';
import { Tables } from '@/integrations/supabase/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { sendNtfyNotification } from '@/lib/ntfy';
import { removeRealtimeChannel, subscribeToRealtimeTables } from '@/lib/realtime-table-subscriptions';
import { useStudentGroupsState } from '@/features/groups';
import {
  claimLateDays,
  getAllowedLateDayClaimOptions,
  getCurrentLateDayDeadline,
  getMinimumLateDaysRequired,
  listStudentLateDaysData,
} from '@/features/late-days';

type LateDayAssignment = Tables<'late_day_assignments'>;
type LateDayClaimBatch = Tables<'late_day_claim_batches'>;
type LateDayClaim = Tables<'late_day_claims'>;
type LateDayAdjustment = Tables<'late_day_adjustments'>;

interface ClaimLateDaysResult {
  claim?: LateDayClaim;
  remaining_late_days?: number;
  total_allowance?: number;
  group_number?: number;
  affected_students_count?: number;
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
  minimumClaimDays: number | null;
  claimedDays: number;
  claimCount: number;
  latestClaimAt: Date | null;
}

const BASE_LATE_DAYS = 3;
const GROUP_SYNC_REASON_PREFIX = 'group-shared-sync:';

const availabilityConfig: Record<AvailabilityState, { label: string; className: string }> = {
  claimable: { label: 'Can Claim', className: 'bg-emerald-500 hover:bg-emerald-600 text-white border-transparent' },
  awaiting_deadline: { label: 'Awaiting Deadline', className: 'bg-amber-500 hover:bg-amber-600 text-white border-transparent' },
  closed: { label: 'Window Closed', className: 'bg-slate-500 hover:bg-slate-600 text-white border-transparent' },
  no_balance: { label: 'No Late Days Left', className: 'bg-rose-500 hover:bg-rose-600 text-white border-transparent' },
  archived: { label: 'Archived', className: 'bg-muted text-muted-foreground border-border' },
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }

  return fallback;
};

export default function LateDays({ onSummaryChange }: LateDaysProps) {
  const { user } = useAuth();
  const { erp } = useERP();
  const { data: groupState } = useStudentGroupsState(Boolean(user?.email));

  const [assignments, setAssignments] = useState<LateDayAssignment[]>([]);
  const [claimBatches, setClaimBatches] = useState<LateDayClaimBatch[]>([]);
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

  const manualAdjustments = useMemo(
    () => adjustments.filter((adjustment) => !String(adjustment.reason ?? '').startsWith(GROUP_SYNC_REASON_PREFIX)),
    [adjustments],
  );
  const groupSyncAdjustments = useMemo(
    () => adjustments.filter((adjustment) => String(adjustment.reason ?? '').startsWith(GROUP_SYNC_REASON_PREFIX)),
    [adjustments],
  );
  const grantedDays = useMemo(() => manualAdjustments.reduce((sum, adjustment) => sum + adjustment.days_delta, 0), [manualAdjustments]);
  const totalAdjustmentDays = useMemo(() => adjustments.reduce((sum, adjustment) => sum + adjustment.days_delta, 0), [adjustments]);
  const groupSyncDays = useMemo(
    () => Math.max(groupSyncAdjustments.reduce((sum, adjustment) => sum - adjustment.days_delta, 0), 0),
    [groupSyncAdjustments],
  );
  const usedDays = useMemo(() => claims.reduce((sum, claim) => sum + claim.days_used, 0), [claims]);
  const totalAllowance = BASE_LATE_DAYS + totalAdjustmentDays;
  const remaining = Math.max(totalAllowance - usedDays, 0);
  const currentGroup = useMemo(
    () => groupState.groups.find((group) => group.id === groupState.current_group_id) ?? null,
    [groupState.current_group_id, groupState.groups],
  );
  const currentGroupBatches = useMemo(
    () => claimBatches.filter((batch) => batch.group_id !== null && batch.group_id === currentGroup?.id),
    [claimBatches, currentGroup?.id],
  );
  const personalClaims = useMemo(
    () => claims.filter((claim) => claim.student_erp === erp),
    [claims, erp],
  );
  const groupUsedDays = useMemo(() => Math.max(usedDays + groupSyncDays, usedDays), [groupSyncDays, usedDays]);
  const groupRemainingDays = Math.max(BASE_LATE_DAYS - groupUsedDays, 0);
  const currentGroupMemberNames = useMemo(
    () =>
      new Map(
        (currentGroup?.members ?? []).map((member) => [member.erp, member.student_name]),
      ),
    [currentGroup?.members],
  );
  const groupClaimActivity = useMemo(
    () =>
      currentGroupBatches.map((batch) => ({
        ...batch,
        claimantName: currentGroupMemberNames.get(batch.claimed_by_erp) ?? batch.claimed_by_erp,
      })),
    [currentGroupBatches, currentGroupMemberNames],
  );

  useEffect(() => {
    onSummaryChange?.({ remaining, totalAllowance, grantedDays, usedDays });
  }, [remaining, totalAllowance, grantedDays, usedDays, onSummaryChange]);

  const latestDeadlineByAssignment = useMemo(() => {
    const map = new Map<string, Date>();
    for (const claim of claims) {
      const candidate = toValidDate(claim.due_at_after_claim);
      if (!candidate) {
        continue;
      }
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
      const claimedAt = toValidDate(claim.claimed_at);
      map.set(claim.assignment_id, {
        claimedDays: existing.claimedDays + claim.days_used,
        claimCount: existing.claimCount + 1,
        latestClaimAt:
          claimedAt && (!existing.latestClaimAt || claimedAt.getTime() > existing.latestClaimAt.getTime())
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
      const currentDeadline = getCurrentLateDayDeadline(assignment.due_at, latestClaimDeadline);
      const minimumClaimDays = getMinimumLateDaysRequired(currentDeadline, now);
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
      } else if (remaining <= 0) {
        availability = 'no_balance';
      } else if (!minimumClaimDays || remaining < minimumClaimDays) {
        availability = 'closed';
      } else {
        availability = 'claimable';
      }

      return {
        assignment,
        currentDeadline,
        availability,
        canClaim: availability === 'claimable',
        minimumClaimDays,
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
  const selectedAllowedClaimDays = useMemo(() => {
    if (!selectedSummary?.canClaim) {
      return [];
    }

    return getAllowedLateDayClaimOptions(selectedSummary.currentDeadline, remaining);
  }, [remaining, selectedSummary]);
  const selectedDaysCount = Number(selectedDays) || 1;
  const previewDueAt =
    selectedSummary?.currentDeadline && selectedSummary.canClaim && selectedAllowedClaimDays.length > 0
      ? addHours(selectedSummary.currentDeadline, selectedDaysCount * 24)
      : null;

  const fetchLateDays = useCallback(async (mode: 'initial' | 'silent' = 'initial') => {
    if (!user?.email || !erp) {
      setAssignments([]);
      setClaimBatches([]);
      setClaims([]);
      setAdjustments([]);
      setIsLoading(false);
      return;
    }

    if (mode === 'initial') {
      setIsLoading(true);
    }

    try {
      const data = await listStudentLateDaysData();
      setAssignments(data.assignments ?? []);
      setClaimBatches(data.batches ?? []);
      setClaims(data.claims ?? []);
      setAdjustments(data.adjustments ?? []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to load late-day data: ${message}`);
      setAssignments([]);
      setClaimBatches([]);
      setClaims([]);
      setAdjustments([]);
    } finally {
      if (mode === 'initial') {
        setIsLoading(false);
      }
    }
  }, [erp, user?.email]);

  useEffect(() => {
    void fetchLateDays('initial');
  }, [fetchLateDays]);

  useEffect(() => {
    if (!user?.email || !erp) {
      return;
    }

    const channel = subscribeToRealtimeTables(
      `student-late-days-${user.email}`,
      [
        { table: 'late_day_assignments' },
        { table: 'late_day_claim_batches' },
        { table: 'late_day_claims' },
        { table: 'late_day_adjustments' },
      ],
      () => {
        void fetchLateDays('silent');
      },
    );

    return () => {
      void removeRealtimeChannel(channel);
    };
  }, [erp, fetchLateDays, user?.email]);

  const openClaimDialog = (assignmentId?: string) => {
    const nextAssignmentId = assignmentId ?? claimableSummaries[0]?.assignment.id ?? '';
    const nextSummary = nextAssignmentId
      ? assignmentSummaries.find((summary) => summary.assignment.id === nextAssignmentId) ?? null
      : null;
    const allowedClaimDays = nextSummary
      ? getAllowedLateDayClaimOptions(nextSummary.currentDeadline, remaining)
      : [];

    setSelectedAssignmentId(nextAssignmentId);
    setSelectedDays(allowedClaimDays[0] ? String(allowedClaimDays[0]) : '1');
    setIsDialogOpen(true);
  };

  const closeClaimDialog = () => {
    setIsDialogOpen(false);
    setSelectedAssignmentId('');
    setSelectedDays('1');
  };

  useEffect(() => {
    if (!selectedSummary) {
      return;
    }

    if (selectedAllowedClaimDays.length === 0) {
      if (selectedDays !== '1') {
        setSelectedDays('1');
      }
      return;
    }

    const currentSelectedDays = Number(selectedDays);
    if (!selectedAllowedClaimDays.includes(currentSelectedDays)) {
      setSelectedDays(String(selectedAllowedClaimDays[0]));
    }
  }, [selectedAllowedClaimDays, selectedDays, selectedSummary]);

  const handleClaim = async () => {
    if (!selectedSummary) return;
    if (!selectedSummary.canClaim) {
      toast.error('This assignment cannot be claimed right now.');
      return;
    }

    const days = Number(selectedDays);
    const minimumClaimDays = selectedSummary.minimumClaimDays ?? 1;
    if (!Number.isInteger(days) || !selectedAllowedClaimDays.includes(days)) {
      toast.error(
        minimumClaimDays > 1
          ? `Please claim at least ${minimumClaimDays} late day(s) to cover the current lateness.`
          : 'Please select a valid number of late days.',
      );
      return;
    }

    setIsClaiming(true);
    let payload: ClaimLateDaysResult | null = null;
    try {
      const result = await claimLateDays(selectedSummary.assignment.id, days);
      payload = (result.data ?? null) as ClaimLateDaysResult | null;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Unknown error'));
      setIsClaiming(false);
      return;
    }
    await fetchLateDays('silent');

    const claimedAt = payload?.claim?.claimed_at ?? new Date().toISOString();
    const dueAfterClaim =
      payload?.claim?.due_at_after_claim ??
      (previewDueAt ? previewDueAt.toISOString() : selectedSummary.currentDeadline?.toISOString() ?? null);
    const remainingAfterClaim =
      typeof payload?.remaining_late_days === 'number' ? payload.remaining_late_days : Math.max(remaining - days, 0);
    const usedDaysForNotification = payload?.claim?.days_used ?? days;

    const notificationMessage = [
      'Event: Late Day Used',
      `ERP: ${erp || '-'}`,
      `Assignment: ${selectedSummary.assignment.title}`,
      `Days Used: ${usedDaysForNotification}`,
      `Claimed At: ${claimedAt}`,
      `New Due: ${dueAfterClaim ?? '-'}`,
      `Remaining Late Days: ${remainingAfterClaim}`,
      ...(typeof payload?.group_number === 'number'
        ? [`Group: ${payload.group_number}`, `Affected Members: ${payload.affected_students_count ?? 1}`]
        : []),
    ].join('\n');

    void sendNtfyNotification({
      title: 'Late Day Used',
      message: notificationMessage,
      tags: ['late-day', 'student'],
      priority: 3,
    }).then((ok) => {
      if (!ok) {
        console.warn('[ntfy] Failed to send late-day notification');
      }
    });

    toast.success(
      typeof payload?.group_number === 'number'
        ? `Late days claimed for Group ${payload.group_number}.`
        : 'Late days claimed successfully.',
    );
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
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{currentGroup ? 'Shared Late Days Left' : 'Late Days Left'}</CardDescription>
            <CardTitle>{remaining}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Your Claimed Days</CardDescription>
            <CardTitle>{usedDays}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{currentGroup ? 'Group Late Days Remaining' : 'Awaiting Deadline'}</CardDescription>
            <CardTitle>{currentGroup ? groupRemainingDays : awaitingDeadlineCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <p className="text-sm text-muted-foreground">
        {currentGroup
          ? `Your group shares a total of ${BASE_LATE_DAYS} late days. When any member claims late days, the shared total goes down for everyone in the group.`
          : `You can use up to ${BASE_LATE_DAYS} late days unless TAs add more.`}
      </p>

      {currentGroup && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Group Late Days</CardTitle>
            <CardDescription>
              Group {currentGroup.group_number} shares one pool of {BASE_LATE_DAYS} late days. Any claim by a member reduces the remaining group balance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{groupUsedDays} used</Badge>
              <Badge variant="outline">{groupRemainingDays} left</Badge>
            </div>
            <div className="text-muted-foreground">
              {groupClaimActivity.length > 0
                ? 'Below is the claim activity for members in your group.'
                : usedDays > 0
                  ? `You have already used ${usedDays} late day${usedDays === 1 ? '' : 's'}. No other member in your current group has claimed a late day yet.`
                  : groupUsedDays > 0
                    ? `${groupUsedDays} late day${groupUsedDays === 1 ? '' : 's'} are already counted against this group's balance, but there are no visible claim records from the current group roster yet.`
                    : 'No one in your group has claimed a late day yet.'}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Assignment Status</CardTitle>
              <CardDescription>
                Claiming late days always uses your remaining balance. If you are in a group, the claim also uses the shared group total.
              </CardDescription>
            </div>
            <Button onClick={() => openClaimDialog()} disabled={claimableSummaries.length === 0 || remaining <= 0}>
              Use Late Days
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {grantedDays > 0 && (
            <div className="mb-4 rounded-lg border border-emerald-300/50 bg-emerald-50/40 p-3 text-sm text-emerald-800">
              TA grants applied: +{grantedDays} late day(s).
            </div>
          )}
          {groupSyncDays > 0 && (
            <div className="mb-4 rounded-lg border border-amber-300/50 bg-amber-50/40 p-3 text-sm text-amber-900">
              Your current balance already reflects late days claimed by your group.
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
                          {summary.canClaim && (summary.minimumClaimDays ?? 1) > 1 && (
                            <Badge variant="outline">
                              Need {summary.minimumClaimDays} days now
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatDate(summary.currentDeadline, 'PPP p', 'Not set by TA')}
                      </TableCell>
                      <TableCell>{summary.claimCount > 0 ? `${summary.claimCount} claim(s)` : 'None'}</TableCell>
                      <TableCell>{formatDate(summary.latestClaimAt, 'PPP p')}</TableCell>
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
          <CardTitle>Your Claim History</CardTitle>
          <CardDescription>Claims you personally made.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assignment</TableHead>
                  <TableHead>Claim Type</TableHead>
                  <TableHead>Days Used</TableHead>
                  <TableHead>Claimed At</TableHead>
                  <TableHead>Previous Due</TableHead>
                  <TableHead>New Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {personalClaims.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      You have not claimed late days yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  personalClaims.map((claim) => {
                    return (
                      <TableRow key={claim.id}>
                        <TableCell className="font-medium">{assignmentTitleById[claim.assignment_id] ?? 'Unknown Assignment'}</TableCell>
                        <TableCell>{claim.group_id ? 'Claimed while grouped' : 'Self claim'}</TableCell>
                        <TableCell>{claim.days_used}</TableCell>
                        <TableCell>{formatDate(claim.claimed_at, 'PPP p')}</TableCell>
                        <TableCell>{formatDate(claim.due_at_before_claim, 'PPP p')}</TableCell>
                        <TableCell>{formatDate(claim.due_at_after_claim, 'PPP p')}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {currentGroup && (
        <Card>
          <CardHeader>
            <CardTitle>Group Claim Activity</CardTitle>
            <CardDescription>Who in your group claimed late days, when they claimed, and how many days they used.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assignment</TableHead>
                    <TableHead>Claimed By</TableHead>
                    <TableHead>Days Used</TableHead>
                    <TableHead>Claimed At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupClaimActivity.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        No group claims yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    groupClaimActivity.map((batch) => (
                      <TableRow key={batch.id}>
                        <TableCell className="font-medium">{assignmentTitleById[batch.assignment_id] ?? 'Unknown Assignment'}</TableCell>
                        <TableCell>{batch.claimantName}</TableCell>
                        <TableCell>{batch.days_used}</TableCell>
                        <TableCell>{formatDate(batch.claimed_at, 'PPP p')}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={isDialogOpen} onOpenChange={(open) => (!open ? closeClaimDialog() : setIsDialogOpen(true))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Use Late Days</DialogTitle>
            <DialogDescription>
              Choose a claimable assignment and how many late days to apply from your remaining balance.
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
                  onValueChange={(assignmentId) => {
                    const nextSummary =
                      assignmentSummaries.find((summary) => summary.assignment.id === assignmentId) ?? null;
                    const allowedClaimDays = nextSummary
                      ? getAllowedLateDayClaimOptions(nextSummary.currentDeadline, remaining)
                      : [];

                    setSelectedAssignmentId(assignmentId);
                    setSelectedDays(allowedClaimDays[0] ? String(allowedClaimDays[0]) : '1');
                  }}
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
                        {selectedAllowedClaimDays.map((value) => (
                          <SelectItem key={value} value={String(value)}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {(selectedSummary.minimumClaimDays ?? 1) > 1 && (
                    <div className="rounded-md border border-amber-300/60 bg-amber-50/50 p-3 text-sm text-amber-900">
                      This deadline has already passed. Claim at least {selectedSummary.minimumClaimDays} late day(s) to bring it back within the allowed range.
                    </div>
                  )}

                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    <div>Claim timestamp: {format(new Date(), 'PPP p')}</div>
                    <div className="mt-1">
                      New due date if claimed: {previewDueAt ? format(previewDueAt, 'PPP p') : '-'}
                    </div>
                    {currentGroup && (
                      <div className="mt-1">
                        Group late days left after this claim: {Math.max(groupRemainingDays - selectedDaysCount, 0)}
                      </div>
                    )}
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
