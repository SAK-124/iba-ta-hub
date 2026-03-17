import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Tables } from '@/integrations/supabase/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ta/ui/card';
import { Input } from '@/components/ta/ui/input';
import { Button } from '@/components/ta/ui/button';
import { Badge } from '@/components/ta/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ta/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ta/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ta/ui/table';
import { Textarea } from '@/components/ta/ui/textarea';
import { useAuth } from '@/lib/auth';
import { formatDate, toValidDate } from '@/lib/date-format';
import { useStaleRefreshOnFocus } from '@/hooks/use-stale-refresh-on-focus';
import { removeRealtimeChannel, subscribeToRealtimeTables } from '@/lib/realtime-table-subscriptions';
import { readScopedSessionStorage, writeScopedSessionStorage } from '@/lib/scoped-session-storage';
import type {
  AgentCommandEnvelope,
  HelpContextSnapshot,
  LateDaysAgentCommand,
} from '@/lib/ta-help-actions';
import {
  archiveLateDayAssignment,
  createLateDayAssignment,
  deleteLateDayClaim,
  listLateDaysAdminData,
  taAddLateDay,
  updateLateDayAssignment,
} from '@/features/late-days';
import { listRoster } from '@/features/roster';

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
  const date = toValidDate(isoValue);
  if (!date) return '';
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
};

const toIsoFromLocalDateTime = (localValue: string) => new Date(localValue).toISOString();

const formatDeadline = (deadline: string | null) => formatDate(deadline, 'PPP p', 'Not set yet');

const TA_STORAGE_SCOPE = 'ta';
const LATE_DAYS_MANAGEMENT_STORAGE_KEY = 'module-late-days';

interface PersistedLateDaysManagementState {
  newTitle: string;
  newDueAt: string;
  rosterSearchQuery: string;
  editingAssignment: LateDayAssignment | null;
  editTitle: string;
  editDueAt: string;
  grantTarget: RosterStudent | null;
  grantDays: string;
  grantReason: string;
  selectedClaimGroupKey: string | null;
  assignmentPendingArchive: LateDayAssignment | null;
  claimPendingDelete: string | null;
}

interface LateDaysManagementProps {
  onContextChange?: (context: string | null) => void;
  onHelpContextChange?: (snapshot: Partial<HelpContextSnapshot>) => void;
  agentCommand?: AgentCommandEnvelope<LateDaysAgentCommand> | null;
  onAgentCommandHandled?: () => void;
}

const normalizeLateDayValue = (value: string) => value.trim().toLowerCase();

const findMatchingRosterStudent = (students: RosterStudent[], query: string) => {
  const normalizedQuery = normalizeLateDayValue(query);
  if (!normalizedQuery) {
    return null;
  }

  const matches = students.filter((student) =>
    [student.student_name, student.erp, student.class_no]
      .map((value) => normalizeLateDayValue(String(value ?? '')))
      .some((value) => value.includes(normalizedQuery) || normalizedQuery.includes(value))
  );

  return matches.length === 1 ? matches[0] : null;
};

const findMatchingClaimGroup = (groups: ClaimGroup[], query: string) => {
  const normalizedQuery = normalizeLateDayValue(query);
  if (!normalizedQuery) {
    return null;
  }

  const matches = groups.filter((group) =>
    [
      group.student_email,
      group.student_erp,
      group.assignment_id,
    ]
      .map((value) => normalizeLateDayValue(String(value ?? '')))
      .some((value) => value.includes(normalizedQuery) || normalizedQuery.includes(value))
  );

  return matches.length === 1 ? matches[0] : null;
};

export default function LateDaysManagement({
  onContextChange,
  onHelpContextChange,
  agentCommand = null,
  onAgentCommandHandled,
}: LateDaysManagementProps = {}) {
  const { user } = useAuth();
  const userEmail = user?.email ?? null;
  const persistedState = readScopedSessionStorage<PersistedLateDaysManagementState>(
    TA_STORAGE_SCOPE,
    userEmail,
    LATE_DAYS_MANAGEMENT_STORAGE_KEY,
    {
      newTitle: '',
      newDueAt: '',
      rosterSearchQuery: '',
      editingAssignment: null,
      editTitle: '',
      editDueAt: '',
      grantTarget: null,
      grantDays: '1',
      grantReason: '',
      selectedClaimGroupKey: null,
      assignmentPendingArchive: null,
      claimPendingDelete: null,
    },
  );
  const [assignments, setAssignments] = useState<LateDayAssignment[]>([]);
  const [claims, setClaims] = useState<LateDayClaim[]>([]);
  const [adjustments, setAdjustments] = useState<LateDayAdjustment[]>([]);
  const [rosterStudents, setRosterStudents] = useState<RosterStudent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingAssignment, setIsCreatingAssignment] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingClaimId, setDeletingClaimId] = useState<string | null>(null);
  const [assignmentPendingArchive, setAssignmentPendingArchive] = useState<LateDayAssignment | null>(persistedState.assignmentPendingArchive);
  const [claimPendingDelete, setClaimPendingDelete] = useState<string | null>(persistedState.claimPendingDelete);
  const markRefreshedRef = useRef<() => void>(() => {});
  const hasLoadedOnceRef = useRef(false);

  const [newTitle, setNewTitle] = useState(persistedState.newTitle);
  const [newDueAt, setNewDueAt] = useState(persistedState.newDueAt);
  const [rosterSearchQuery, setRosterSearchQuery] = useState(persistedState.rosterSearchQuery);

  const [editingAssignment, setEditingAssignment] = useState<LateDayAssignment | null>(persistedState.editingAssignment);
  const [editTitle, setEditTitle] = useState(persistedState.editTitle);
  const [editDueAt, setEditDueAt] = useState(persistedState.editDueAt);

  const [grantTarget, setGrantTarget] = useState<RosterStudent | null>(persistedState.grantTarget);
  const [grantDays, setGrantDays] = useState(persistedState.grantDays);
  const [grantReason, setGrantReason] = useState(persistedState.grantReason);
  const [isGranting, setIsGranting] = useState(false);
  const [selectedClaimGroupKey, setSelectedClaimGroupKey] = useState<string | null>(persistedState.selectedClaimGroupKey);
  const rosterSearchInputRef = useRef<HTMLInputElement>(null);
  const newAssignmentTitleRef = useRef<HTMLInputElement>(null);
  const grantDaysInputRef = useRef<HTMLInputElement>(null);
  const lastHandledAgentCommandTokenRef = useRef<number | null>(null);

  useEffect(() => {
    const stageLabel = grantTarget
      ? `Late Days · granting late days to ${grantTarget.erp}`
      : editingAssignment
        ? 'Late Days · editing assignment'
        : selectedClaimGroupKey
          ? 'Late Days · reviewing claim details'
          : newTitle.trim() || newDueAt
            ? 'Late Days · creating assignment'
            : 'Late Days · overview';

    onContextChange?.(stageLabel);
  }, [editingAssignment, grantTarget, newDueAt, newTitle, onContextChange, selectedClaimGroupKey]);

  useEffect(() => {
    onHelpContextChange?.({
      openSurface: grantTarget
        ? 'grant late day dialog'
        : editingAssignment
          ? 'edit assignment dialog'
          : selectedClaimGroupKey
            ? 'claim breakdown dialog'
            : 'late days dashboard',
      screenDescription: 'Manage assignment deadlines, late-day balances, and claim history.',
      visibleControls: ['Search by class, name, or ERP', 'Add', 'View', 'Grant Late Day', 'Archive', 'Delete Claim'],
      searchQuery: rosterSearchQuery,
      actionTargets: [
        ...rosterStudents.slice(0, 120).map((student) => ({
          kind: 'student' as const,
          id: student.id,
          label: student.student_name,
          aliases: [student.erp, student.class_no],
          meta: {
            erp: student.erp,
            class_no: student.class_no,
          },
        })),
        ...assignments.slice(0, 60).map((assignment) => ({
          kind: 'assignment' as const,
          id: assignment.id,
          label: assignment.title,
          meta: {
            due_at: assignment.due_at,
            active: assignment.active,
          },
        })),
      ],
    });
  }, [assignments, editingAssignment, grantTarget, onHelpContextChange, rosterSearchQuery, rosterStudents, selectedClaimGroupKey]);

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
      const claimCreatedAt = toValidDate(claim.claimed_at);
      const existingLatestClaimAt = toValidDate(existing.latest_claimed_at);
      if (claimCreatedAt && (!existingLatestClaimAt || claimCreatedAt.getTime() > existingLatestClaimAt.getTime())) {
        existing.latest_claimed_at = claim.claimed_at;
      }
      const claimDueAfter = toValidDate(claim.due_at_after_claim);
      const existingCurrentDueAt = toValidDate(existing.current_due_at);
      if (claimDueAfter && (!existingCurrentDueAt || claimDueAfter.getTime() > existingCurrentDueAt.getTime())) {
        existing.current_due_at = claim.due_at_after_claim;
      }
      existing.events.push(claim);
    }

    return Object.values(groups)
      .map((group) => ({
        ...group,
        events: group.events.sort(
          (a, b) =>
            (toValidDate(b.claimed_at)?.getTime() ?? 0) - (toValidDate(a.claimed_at)?.getTime() ?? 0)
        ),
      }))
      .sort(
        (a, b) =>
          (toValidDate(b.latest_claimed_at)?.getTime() ?? 0) -
          (toValidDate(a.latest_claimed_at)?.getTime() ?? 0)
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

  useEffect(() => {
    if (!agentCommand) {
      return;
    }

    if (lastHandledAgentCommandTokenRef.current === agentCommand.token) {
      return;
    }

    lastHandledAgentCommandTokenRef.current = agentCommand.token;

    switch (agentCommand.command.kind) {
      case 'search-student':
        setRosterSearchQuery(agentCommand.command.query ?? '');
        window.setTimeout(() => rosterSearchInputRef.current?.focus(), 0);
        break;
      case 'open-grant-dialog': {
        const query = agentCommand.command.query ?? '';
        setRosterSearchQuery(query);
        const match = findMatchingRosterStudent(rosterStudents, query);
        if (match) {
          openGrantDialog(match);
          setGrantDays(agentCommand.command.days ?? '1');
          setGrantReason(agentCommand.command.reason ?? '');
          window.setTimeout(() => grantDaysInputRef.current?.focus(), 0);
        } else {
          window.setTimeout(() => rosterSearchInputRef.current?.focus(), 0);
        }
        break;
      }
      case 'prepare-create-assignment':
        setNewTitle(agentCommand.command.title ?? '');
        setNewDueAt(agentCommand.command.dueAt ?? '');
        window.setTimeout(() => newAssignmentTitleRef.current?.focus(), 0);
        break;
      case 'open-claim-details': {
        const group = findMatchingClaimGroup(claimGroups, agentCommand.command.query ?? '');
        if (group) {
          openClaimBreakdown(group.key);
        }
        break;
      }
      case 'prepare-archive-assignment': {
        const normalizedQuery = normalizeLateDayValue(agentCommand.command.query ?? '');
        const match = assignments.find((assignment) =>
          normalizeLateDayValue(assignment.title).includes(normalizedQuery) ||
          normalizedQuery.includes(normalizeLateDayValue(assignment.title))
        );
        if (match) {
          setAssignmentPendingArchive(match);
        }
        break;
      }
      case 'prepare-delete-claim': {
        const group = findMatchingClaimGroup(claimGroups, agentCommand.command.query ?? '');
        if (group) {
          openClaimBreakdown(group.key);
          setClaimPendingDelete(group.events[0]?.id ?? null);
        }
        break;
      }
    }

    onAgentCommandHandled?.();
  }, [agentCommand, assignments, claimGroups, onAgentCommandHandled, rosterStudents]);

  const fetchLateDaysData = useCallback(async (mode: 'initial' | 'silent' = 'initial') => {
    const shouldShowLoader = mode === 'initial' && !hasLoadedOnceRef.current;
    if (shouldShowLoader) {
      setIsLoading(true);
    }
    try {
      const [lateDaysData, rosterData] = await Promise.all([listLateDaysAdminData(), listRoster()]);
      setAssignments(lateDaysData.assignments ?? []);
      setClaims(lateDaysData.claims ?? []);
      setAdjustments(lateDaysData.adjustments ?? []);
      setRosterStudents((rosterData.rows ?? [])
        .sort((a, b) => a.class_no.localeCompare(b.class_no) || a.student_name.localeCompare(b.student_name)) as RosterStudent[]);
      hasLoadedOnceRef.current = true;
      markRefreshedRef.current();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to load late-day data: ${message}`);
      setAssignments([]);
      setClaims([]);
      setRosterStudents([]);
      setAdjustments([]);
    } finally {
      if (shouldShowLoader) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchLateDaysData('initial');
  }, [fetchLateDaysData]);

  useEffect(() => {
    writeScopedSessionStorage(TA_STORAGE_SCOPE, userEmail, LATE_DAYS_MANAGEMENT_STORAGE_KEY, {
      newTitle,
      newDueAt,
      rosterSearchQuery,
      editingAssignment,
      editTitle,
      editDueAt,
      grantTarget,
      grantDays,
      grantReason,
      selectedClaimGroupKey,
      assignmentPendingArchive,
      claimPendingDelete,
    });
  }, [
    assignmentPendingArchive,
    claimPendingDelete,
    editDueAt,
    editTitle,
    editingAssignment,
    grantDays,
    grantReason,
    grantTarget,
    newDueAt,
    newTitle,
    rosterSearchQuery,
    selectedClaimGroupKey,
    userEmail,
  ]);

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
    try {
      await createLateDayAssignment(newTitle.trim(), newDueAt ? toIsoFromLocalDateTime(newDueAt) : null);
      toast.success(newDueAt ? 'Assignment added.' : 'Assignment added without deadline.');
      setNewTitle('');
      setNewDueAt('');
      await fetchLateDaysData('silent');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('null value in column "due_at"')) {
        toast.error('Database schema is outdated. Run: ALTER TABLE public.late_day_assignments ALTER COLUMN due_at DROP NOT NULL;');
      } else {
        toast.error(`Failed to create assignment: ${message}`);
      }
    } finally {
      setIsCreatingAssignment(false);
    }
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
    try {
      await updateLateDayAssignment(editingAssignment.id, {
        title: editTitle.trim(),
        due_at: editDueAt ? toIsoFromLocalDateTime(editDueAt) : null,
      });
      toast.success(editDueAt ? 'Assignment updated.' : 'Assignment updated. Deadline cleared.');
      closeEditDialog();
      await fetchLateDaysData('silent');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('null value in column "due_at"')) {
        toast.error('Database schema is outdated. Run: ALTER TABLE public.late_day_assignments ALTER COLUMN due_at DROP NOT NULL;');
      } else {
        toast.error(`Failed to update assignment: ${message}`);
      }
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleArchiveAssignment = async (assignment: LateDayAssignment) => {
    if (!assignment.active) return;

    try {
      await archiveLateDayAssignment(assignment.id);
      toast.success('Assignment archived.');
      await fetchLateDaysData('silent');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to archive assignment: ${message}`);
      return;
    }
  };

  const handleDeleteClaim = async (claimId: string) => {
    setDeletingClaimId(claimId);
    try {
      await deleteLateDayClaim(claimId);
      toast.success('Claim deleted.');
      setClaims((prev) => prev.filter((claim) => claim.id !== claimId));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to delete claim: ${message}`);
      setDeletingClaimId(null);
      return;
    }
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
    try {
      const result = await taAddLateDay(grantTarget.erp, days, grantReason.trim() ? grantReason.trim() : undefined);
      const payload = (result.data ?? null) as GrantRpcResult | null;
      toast.success(
        typeof payload?.remaining_late_days === 'number'
          ? `Late days added. New remaining: ${payload.remaining_late_days}`
          : 'Late days added.'
      );
      closeGrantDialog();
      await fetchLateDaysData('silent');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to add late day: ${message}`);
    } finally {
      setIsGranting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { markRefreshed } = useStaleRefreshOnFocus(
    () => fetchLateDaysData('silent'),
    { staleAfterMs: 60_000 },
  );

  useEffect(() => {
    markRefreshedRef.current = markRefreshed;
  }, [markRefreshed]);

  useEffect(() => {
    const channel = subscribeToRealtimeTables(
      `ta-late-days-${userEmail ?? 'anonymous'}`,
      [
        { table: 'late_day_assignments' },
        { table: 'late_day_claims' },
        { table: 'late_day_adjustments' },
        { table: 'students_roster' },
      ],
      () => {
        void fetchLateDaysData('silent');
      },
    );

    return () => {
      void removeRealtimeChannel(channel);
    };
  }, [fetchLateDaysData, userEmail]);

  return (
    <div className="ta-module-shell grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <Card className="ta-module-card">
          <CardHeader>
            <CardTitle>Late Day Assignments</CardTitle>
            <CardDescription>
              Add assignments now and set deadlines later. Students can only claim once a deadline exists.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
              <Input
                ref={newAssignmentTitleRef}
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

            <Table scrollClassName="overflow-x-auto">
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
                              <Badge variant="outline" className="status-all-table-text">
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
                              onClick={() => setAssignmentPendingArchive(assignment)}
                              disabled={!assignment.active}
                            >
                              <Trash2 className="h-4 w-4 status-absent-text" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
          </CardContent>
        </Card>

        <Card className="ta-module-card">
          <CardHeader>
            <CardTitle>Late Day Claims</CardTitle>
            <CardDescription>
              Grouped by student and assignment. Click a row to view day-by-day claim history.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table containerClassName="max-h-[360px]">
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
                        <TableCell>{formatDate(group.latest_claimed_at, 'PPP p')}</TableCell>
                        <TableCell>{formatDate(group.current_due_at, 'PPP p')}</TableCell>
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
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6 xl:col-span-1">
        <Card className="ta-module-card">
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
                ref={rosterSearchInputRef}
                placeholder="Search by class, name, or ERP"
                className="pl-9"
                value={rosterSearchQuery}
                onChange={(event) => setRosterSearchQuery(event.target.value)}
              />
            </div>

            <Table containerClassName="max-h-[620px]">
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
            <Table containerClassName="max-h-[420px]">
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
                      <TableCell>{formatDate(claimEvent.claimed_at, 'PPP p')}</TableCell>
                      <TableCell>{formatDate(claimEvent.due_at_before_claim, 'PPP p')}</TableCell>
                      <TableCell>{formatDate(claimEvent.due_at_after_claim, 'PPP p')}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setClaimPendingDelete(claimEvent.id)}
                          disabled={deletingClaimId === claimEvent.id}
                        >
                          {deletingClaimId === claimEvent.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 status-absent-text" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
                ref={newAssignmentTitleRef}
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
                ref={grantDaysInputRef}
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

      <AlertDialog open={Boolean(assignmentPendingArchive)} onOpenChange={(open) => !open && setAssignmentPendingArchive(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive assignment?</AlertDialogTitle>
            <AlertDialogDescription>
              This assignment will be hidden from students, and claim history will remain preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!assignmentPendingArchive) return;
                void handleArchiveAssignment(assignmentPendingArchive);
                setAssignmentPendingArchive(null);
              }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(claimPendingDelete)} onOpenChange={(open) => !open && setClaimPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete claim row?</AlertDialogTitle>
            <AlertDialogDescription>
              Deleting a claim returns those late days to the student balance and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!claimPendingDelete) return;
                void handleDeleteClaim(claimPendingDelete);
                setClaimPendingDelete(null);
              }}
            >
              Delete Claim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
