import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Check, Download, Loader2, Plus, RefreshCcw, Search, Trash2, Unlock, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/date-format';
import { formatDistanceToNow } from 'date-fns';
import { removeRealtimeChannel, subscribeToRealtimeTables } from '@/lib/realtime-table-subscriptions';
import { STUDENT_SERIAL_CLASS, STUDENT_SERIAL_HEADER } from '@/lib/student-table';
import { readScopedSessionStorage, writeScopedSessionStorage } from '@/lib/scoped-session-storage';
import { getErrorMessage } from '@/shared/errors';
import { Tables } from '@/integrations/supabase/types';
import type {
  AgentCommandEnvelope,
  GroupsAgentCommand,
  HelpContextSnapshot,
} from '@/lib/ta-help-actions';
import {
  taAdjustAllGroupLateDays,
  taClearGroupRoster,
  taCreateGroup,
  taDeleteGroup,
  taSetGroupPoc,
  taEnableGroupEditingAll,
  taEnableGroupEditingSelected,
  taSetGroupEditDeadlineAll,
  taSetGroupEditDeadlineSelected,
  taSetStudentGroup,
  respondToGroupJoinRequest,
  buildGroupsCsv,
  useGroupAdminState,
  orderGroupMembers,
  type GroupSummary,
} from '@/features/groups';
import { listLateDaysAdminData } from '@/features/late-days';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ta/ui/alert-dialog';
import { Badge } from '@/components/ta/ui/badge';
import { Button } from '@/components/ta/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ta/ui/card';
import { Checkbox } from '@/components/ta/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ta/ui/dialog';
import { Input } from '@/components/ta/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ta/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ta/ui/select';

const TA_STORAGE_SCOPE = 'ta';
const GROUPS_MANAGEMENT_STORAGE_KEY = 'module-groups';

type LateDayClaim = Tables<'late_day_claims'>;
type RosterFilter = 'all' | 'grouped' | 'unassigned' | 'locked';
type DeadlineScope = 'all' | 'selected' | null;

interface PersistedGroupsState {
  rosterSearchQuery: string;
  groupedStudentSearch: string;
  unassignedStudentSearch: string;
  groupSearchQuery: string;
  targetGroupsByErp: Record<string, string>;
  selectedGroupNumbers: number[];
  activeRosterFilter: RosterFilter;
  pendingRecomputeAll?: boolean;
  pendingClearRoster?: boolean;
}

interface GroupsManagementProps {
  onContextChange?: (context: string | null) => void;
  onHelpContextChange?: (snapshot: Partial<HelpContextSnapshot>) => void;
  agentCommand?: AgentCommandEnvelope<GroupsAgentCommand> | null;
  onAgentCommandHandled?: () => void;
}

const normalize = (value: string) => value.trim().toLowerCase();
const toDateTimeLocalValue = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};
const defaultDeadlineValue = () => toDateTimeLocalValue(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
const getGroupHeading = (groupNumber: number, displayName: string | null) =>
  displayName ? `Group ${groupNumber} · ${displayName}` : `Group ${groupNumber}`;

const findMatchingRosterEntry = (
  roster: Array<{ erp: string; student_name: string; class_no: string }>,
  query: string,
) => {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return null;
  }

  const matches = roster.filter((entry) =>
    [entry.erp, entry.student_name, entry.class_no]
      .map(normalize)
      .some((value) => value.includes(normalizedQuery) || normalizedQuery.includes(value)),
  );

  return matches.length === 1 ? matches[0] : null;
};

const METRICS: Array<{ key: RosterFilter; label: string }> = [
  { key: 'all', label: 'Total Groups' },
  { key: 'grouped', label: 'Grouped Students' },
  { key: 'unassigned', label: 'Unassigned Students' },
  { key: 'locked', label: 'Locked Groups' },
];

export default function GroupsManagement({
  onContextChange,
  onHelpContextChange,
  agentCommand = null,
  onAgentCommandHandled,
}: GroupsManagementProps = {}) {
  const { user } = useAuth();
  const userEmail = user?.email ?? null;
  const persistedState = readScopedSessionStorage<PersistedGroupsState>(
    TA_STORAGE_SCOPE,
    userEmail,
    GROUPS_MANAGEMENT_STORAGE_KEY,
    {
      rosterSearchQuery: '',
      groupedStudentSearch: '',
      unassignedStudentSearch: '',
      groupSearchQuery: '',
      targetGroupsByErp: {},
      selectedGroupNumbers: [],
      activeRosterFilter: 'all',
      pendingRecomputeAll: false,
      pendingClearRoster: false,
    },
  );

  const { data, setData, isLoading, isUpdating, refetch } = useGroupAdminState(Boolean(userEmail));
  const [rosterSearchQuery, setRosterSearchQuery] = useState(persistedState.rosterSearchQuery);
  const [groupedStudentSearch, setGroupedStudentSearch] = useState(persistedState.groupedStudentSearch);
  const [unassignedStudentSearch, setUnassignedStudentSearch] = useState(persistedState.unassignedStudentSearch);
  const [groupSearchQuery, setGroupSearchQuery] = useState(persistedState.groupSearchQuery);
  const [targetGroupsByErp, setTargetGroupsByErp] = useState<Record<string, string>>(persistedState.targetGroupsByErp);
  const [selectedGroupNumbers, setSelectedGroupNumbers] = useState<number[]>(persistedState.selectedGroupNumbers);
  const [activeRosterFilter, setActiveRosterFilter] = useState<RosterFilter>(persistedState.activeRosterFilter);
  const [pendingRecomputeAll, setPendingRecomputeAll] = useState(Boolean(persistedState.pendingRecomputeAll));
  const [pendingClearRoster, setPendingClearRoster] = useState(Boolean(persistedState.pendingClearRoster));
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<GroupSummary | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [claims, setClaims] = useState<LateDayClaim[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createGroupNumber, setCreateGroupNumber] = useState('');
  const [createGroupName, setCreateGroupName] = useState('');
  const [createGroupDeadline, setCreateGroupDeadline] = useState(defaultDeadlineValue);
  const [selectedCreateStudentErps, setSelectedCreateStudentErps] = useState<string[]>([]);
  const [createPocErp, setCreatePocErp] = useState('');
  const [pocDrafts, setPocDrafts] = useState<Record<string, string>>({});
  const [deadlineDialogScope, setDeadlineDialogScope] = useState<DeadlineScope>(null);
  const [deadlineInput, setDeadlineInput] = useState(defaultDeadlineValue);
  const lastHandledAgentCommandTokenRef = useRef<number | null>(null);
  const rosterSearchInputRef = useRef<HTMLInputElement>(null);

  const selectedCreateStudents = useMemo(
    () => data.roster
      .filter((entry) => selectedCreateStudentErps.includes(entry.erp))
      .sort((a, b) => a.class_no.localeCompare(b.class_no) || a.student_name.localeCompare(b.student_name) || a.erp.localeCompare(b.erp)),
    [data.roster, selectedCreateStudentErps],
  );

  const fetchGroupLateDays = useCallback(async () => {
    const lateDaysData = await listLateDaysAdminData();
    setClaims(lateDaysData.claims ?? []);
  }, []);

  useEffect(() => {
    writeScopedSessionStorage(TA_STORAGE_SCOPE, userEmail, GROUPS_MANAGEMENT_STORAGE_KEY, {
      rosterSearchQuery,
      groupedStudentSearch,
      unassignedStudentSearch,
      groupSearchQuery,
      targetGroupsByErp,
      selectedGroupNumbers,
      activeRosterFilter,
      pendingRecomputeAll,
      pendingClearRoster,
    });
  }, [
    activeRosterFilter,
    groupSearchQuery,
    groupedStudentSearch,
    pendingClearRoster,
    pendingRecomputeAll,
    rosterSearchQuery,
    selectedGroupNumbers,
    targetGroupsByErp,
    unassignedStudentSearch,
    userEmail,
  ]);

  useEffect(() => {
    const stageLabel = pendingRecomputeAll
      ? 'Groups · recalculating shared balances'
      : pendingClearRoster
        ? 'Groups · delete confirmation'
        : isCreateDialogOpen
          ? 'Groups · creating group'
          : deadlineDialogScope
            ? `Groups · setting ${deadlineDialogScope} deadline`
            : 'Groups · overview';
    onContextChange?.(stageLabel);
  }, [deadlineDialogScope, isCreateDialogOpen, onContextChange, pendingClearRoster, pendingRecomputeAll]);

  useEffect(() => {
    onHelpContextChange?.({
      openSurface: pendingClearRoster
        ? 'clear group roster confirmation'
        : pendingRecomputeAll
          ? 'recalculate all groups confirmation'
          : isCreateDialogOpen
            ? 'create group dialog'
            : deadlineDialogScope
              ? 'edit deadline dialog'
              : 'groups workspace',
      screenDescription:
        'Manage groups from a left-side directory with group actions and a right-side individual assignment list with clickable filters.',
      visibleControls: [
        'Create Group',
        'Enable Editing For Everyone',
        'Enable Editing For Selected Groups',
        'Set Edit Deadline',
        'Assign Student',
        'Remove From Group',
      ],
      searchQuery: rosterSearchQuery,
      actionTargets: [
        ...data.roster.slice(0, 150).map((entry) => ({
          kind: 'student' as const,
          id: entry.erp,
          label: entry.student_name,
          aliases: [entry.erp, entry.class_no],
          meta: {
            erp: entry.erp,
            class_no: entry.class_no,
            group_number: entry.group_number,
          },
        })),
        ...data.groups.slice(0, 60).map((group) => ({
          kind: 'group' as const,
          id: group.id,
          label: getGroupHeading(group.group_number, group.display_name),
          aliases: group.members.map((member) => member.erp),
          meta: {
            group_number: group.group_number,
            member_count: group.member_count,
          },
        })),
      ],
    });
  }, [
    data.groups,
    data.roster,
    deadlineDialogScope,
    isCreateDialogOpen,
    onHelpContextChange,
    pendingClearRoster,
    pendingRecomputeAll,
    rosterSearchQuery,
  ]);

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
      case 'prepare-assign-student':
        setRosterSearchQuery(agentCommand.command.query ?? '');
        window.setTimeout(() => rosterSearchInputRef.current?.focus(), 0);
        break;
      case 'prepare-remove-student':
        setRosterSearchQuery(agentCommand.command.query ?? '');
        window.setTimeout(() => rosterSearchInputRef.current?.focus(), 0);
        break;
      case 'prepare-recompute-group':
        setPendingRecomputeAll(true);
        break;
    }

    onAgentCommandHandled?.();
  }, [agentCommand, onAgentCommandHandled]);

  useEffect(() => {
    if (!userEmail) {
      return;
    }
    void fetchGroupLateDays();
  }, [fetchGroupLateDays, userEmail]);

  useEffect(() => {
    const availableErps = new Set(data.roster.map((entry) => entry.erp));
    setSelectedCreateStudentErps((previous) => {
      const next = previous.filter((erp) => availableErps.has(erp));
      return next.length === previous.length ? previous : next;
    });
  }, [data.roster]);

  useEffect(() => {
    if (createPocErp && !selectedCreateStudentErps.includes(createPocErp)) {
      setCreatePocErp('');
    }
  }, [createPocErp, selectedCreateStudentErps]);

  useEffect(() => {
    setPocDrafts((previous) => {
      const next = { ...previous };
      let changed = false;
      data.groups.forEach((group) => {
        const draft = next[group.id];
        if (draft && !group.members.some((member) => member.erp === draft)) {
          next[group.id] = group.created_by_erp ?? '';
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [data.groups]);

  useEffect(() => {
    if (!userEmail) {
      return;
    }

    const channel = subscribeToRealtimeTables(
      `ta-groups-${userEmail}`,
      [
        { table: 'student_groups' },
        { table: 'student_group_members' },
        { table: 'students_roster' },
        { table: 'late_day_claims' },
        { table: 'late_day_adjustments' },
      ],
      () => {
        void refetch();
        void fetchGroupLateDays();
      },
    );

    return () => {
      void removeRealtimeChannel(channel);
    };
  }, [fetchGroupLateDays, refetch, userEmail]);

  const groupLookup = useMemo(
    () =>
      new Map(
        data.groups.map((group) => [
          group.group_number,
          group,
        ]),
      ),
    [data.groups],
  );

  const totalGroupedStudents = data.roster.filter((entry) => entry.group_number !== null).length;
  const unassignedStudents = data.roster.length - totalGroupedStudents;
  const lockedGroups = data.groups.filter((group) => group.is_locked).length;

  const groupCards = useMemo(
    () =>
      data.groups
        .map((group) => {
          const memberErps = new Set(group.members.map((member) => member.erp));
          const originalClaims = claims.filter(
            (claim) =>
              memberErps.has(claim.student_erp) &&
              (claim.claim_role === 'self' || claim.claim_role === 'initiator'),
          );
          const groupUsedDays = originalClaims.reduce((sum, claim) => sum + claim.days_used, 0);
          const claimers = group.members
            .map((member) => ({
              ...member,
              claimed_days: originalClaims
                .filter((claim) => claim.student_erp === member.erp)
                .reduce((sum, claim) => sum + claim.days_used, 0),
            }))
            .filter((member) => member.claimed_days > 0)
            .sort((a, b) => b.claimed_days - a.claimed_days || a.student_name.localeCompare(b.student_name));

          return {
            ...group,
            groupUsedDays,
            groupRemainingDays: Math.max(3 - groupUsedDays, 0),
            claimers,
          };
        })
        .filter((group) => {
          const query = normalize(groupSearchQuery);
          if (!query) {
            return true;
          }
          const haystack = `${group.group_number} ${group.display_name ?? ''} ${group.members.map((member) => `${member.erp} ${member.student_name}`).join(' ')}`.toLowerCase();
          return haystack.includes(query);
        })
        .sort((a, b) => a.group_number - b.group_number),
    [claims, data.groups, groupSearchQuery],
  );

  const filteredRoster = useMemo(() => {
    const query = normalize(rosterSearchQuery);
    return data.roster.filter((entry) => {
      if (activeRosterFilter === 'grouped' && entry.group_number === null) {
        return false;
      }
      if (activeRosterFilter === 'unassigned' && entry.group_number !== null) {
        return false;
      }
      if (
        activeRosterFilter === 'locked' &&
        (entry.group_number === null || !groupLookup.get(entry.group_number)?.is_locked)
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = `${entry.erp} ${entry.student_name} ${entry.class_no} ${entry.group_number ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [activeRosterFilter, data.roster, groupLookup, rosterSearchQuery]);

  const groupedCandidates = useMemo(() => {
    const query = normalize(groupedStudentSearch);
    return data.roster
      .filter((entry) => entry.group_number !== null)
      .filter((entry) => {
        if (!query) {
          return true;
        }
        const haystack = `${entry.erp} ${entry.student_name} ${entry.group_number ?? ''}`.toLowerCase();
        return haystack.includes(query);
      });
  }, [data.roster, groupedStudentSearch]);

  const unassignedCandidates = useMemo(() => {
    const query = normalize(unassignedStudentSearch);
    return data.roster
      .filter((entry) => entry.group_number === null)
      .filter((entry) => {
        if (!query) {
          return true;
        }
        const haystack = `${entry.erp} ${entry.student_name}`.toLowerCase();
        return haystack.includes(query);
      });
  }, [data.roster, unassignedStudentSearch]);

  const metrics = {
    all: data.groups.length,
    grouped: totalGroupedStudents,
    unassigned: unassignedStudents,
    locked: lockedGroups,
  } as const;

  const runAction = async (actionKey: string, action: () => Promise<void>) => {
    setBusyAction(actionKey);
    try {
      await action();
    } finally {
      setBusyAction(null);
    }
  };

  const handleAssign = async (studentErp: string) => {
    const targetValue = targetGroupsByErp[studentErp] ?? '';
    const groupNumber = Number(targetValue);
    if (!Number.isInteger(groupNumber) || groupNumber < 1) {
      toast.error('Enter a valid group number for this student before assigning.');
      return;
    }

    await runAction(`assign-${studentErp}`, async () => {
      const result = await taSetStudentGroup(studentErp, groupNumber);
      setData(result.state);
      setTargetGroupsByErp((prev) => ({ ...prev, [studentErp]: '' }));
      await fetchGroupLateDays();
      toast.success(`Assigned ${studentErp} to Group ${groupNumber}.`);
    }).catch((error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to assign group.'));
    });
  };

  const handleRemove = async (studentErp: string) => {
    await runAction(`remove-${studentErp}`, async () => {
      const result = await taSetStudentGroup(studentErp, null);
      setData(result.state);
      await fetchGroupLateDays();
      toast.success(`Removed ${studentErp} from their group.`);
    }).catch((error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to remove student from group.'));
    });
  };

  const handleRespondToRequest = async (requestId: string, accept: boolean) => {
    await runAction(`${accept ? 'accept' : 'decline'}-request-${requestId}`, async () => {
      const result = await respondToGroupJoinRequest(requestId, accept);
      if ('viewer_email' in result.state) setData(result.state);
      toast.success(accept ? 'Join request approved.' : 'Join request declined.');
    }).catch((error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to respond to group request.'));
    });
  };

  const handleExportGroups = () => {
    const blob = new Blob([buildGroupsCsv(data)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `group_roster_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleRecompute = async () => {
    await runAction('recompute-all-groups', async () => {
      for (const group of data.groups) {
        await taAdjustAllGroupLateDays(group.group_number);
      }
      await fetchGroupLateDays();
      setPendingRecomputeAll(false);
      toast.success(`Recalculated shared late-day balances for ${data.groups.length} group(s).`);
    }).catch((error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to recalculate shared group late days.'));
    });
  };

  const handleClearRoster = async () => {
    await runAction('clear-groups', async () => {
      const result = await taClearGroupRoster();
      await refetch();
      await fetchGroupLateDays();
      setPendingClearRoster(false);
      setSelectedGroupNumbers([]);
      setTargetGroupsByErp({});
      toast.success(`Cleared ${result.removed_groups} group(s) and ${result.removed_members} memberships.`);
    }).catch((error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to clear group roster.'));
    });
  };

  const handleDeleteGroup = async () => {
    if (!pendingDeleteGroup) return;
    const groupNumber = pendingDeleteGroup.group_number;

    await runAction(`delete-group-${groupNumber}`, async () => {
      const result = await taDeleteGroup(groupNumber);
      await refetch();
      await fetchGroupLateDays();
      setPendingDeleteGroup(null);
      setSelectedGroupNumbers((previous) => previous.filter((value) => value !== groupNumber));
      toast.success(`Deleted Group ${groupNumber}. Attendance and roster records were preserved.`);
      return result;
    }).catch((error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to delete group.'));
    });
  };

  const handleEnableEditingAll = async () => {
    await runAction('enable-editing-all', async () => {
      const result = await taEnableGroupEditingAll();
      setData(result.state);
      toast.success('Enabled student editing for all groups.');
    }).catch((error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to enable editing for all groups.'));
    });
  };

  const handleEnableEditingSelected = async () => {
    await runAction('enable-editing-selected', async () => {
      const result = await taEnableGroupEditingSelected(selectedGroupNumbers);
      setData(result.state);
      toast.success(`Enabled student editing for ${selectedGroupNumbers.length} selected group(s).`);
    }).catch((error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to enable editing for selected groups.'));
    });
  };

  const handleConfirmDeadline = async () => {
    const deadline = new Date(deadlineInput);
    if (Number.isNaN(deadline.getTime())) {
      toast.error('Enter a valid edit deadline.');
      return;
    }

    await runAction(`set-deadline-${deadlineDialogScope ?? 'all'}`, async () => {
      const iso = deadline.toISOString();
      if (deadlineDialogScope === 'selected') {
        const result = await taSetGroupEditDeadlineSelected(selectedGroupNumbers, iso);
        toast.success(`Updated the edit deadline for ${result.updated_groups} group(s).`);
      } else {
        const result = await taSetGroupEditDeadlineAll(iso);
        toast.success(`Updated the edit deadline for ${result.updated_groups} group(s).`);
      }
      setDeadlineDialogScope(null);
      await refetch();
    }).catch((error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to update group edit deadline.'));
    });
  };

  const handleCreateGroup = async () => {
    const groupNumber = Number(createGroupNumber);
    if (!Number.isInteger(groupNumber) || groupNumber < 1) {
      toast.error('Enter a valid positive group number.');
      return;
    }
    if (selectedCreateStudentErps.length === 0) {
      toast.error('Select at least one student for the new group.');
      return;
    }
    if (!createPocErp || !selectedCreateStudentErps.includes(createPocErp)) {
      toast.error('Select one group POC from the selected students.');
      return;
    }
    const deadline = new Date(createGroupDeadline);
    if (Number.isNaN(deadline.getTime())) {
      toast.error('Enter a valid edit deadline.');
      return;
    }

    await runAction('create-group', async () => {
      const result = await taCreateGroup({
        groupNumber,
        displayName: createGroupName,
        studentErps: selectedCreateStudentErps,
        pocErp: createPocErp,
        editDeadline: deadline.toISOString(),
      });
      setData(result.state);
      await fetchGroupLateDays();
      setIsCreateDialogOpen(false);
      setCreateGroupNumber('');
      setCreateGroupName('');
      setCreateGroupDeadline(defaultDeadlineValue());
      setSelectedCreateStudentErps([]);
      setCreatePocErp('');
      setGroupedStudentSearch('');
      setUnassignedStudentSearch('');
      toast.success(`Created Group ${groupNumber}.`);
    }).catch((error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to create group.'));
    });
  };

  const handleTargetChange = (studentErp: string, value: string) => {
    setTargetGroupsByErp((prev) => ({
      ...prev,
      [studentErp]: value,
    }));
  };

  const toggleGroupSelection = (groupNumber: number) => {
    setSelectedGroupNumbers((prev) =>
      prev.includes(groupNumber) ? prev.filter((value) => value !== groupNumber) : [...prev, groupNumber].sort((a, b) => a - b),
    );
  };

  const toggleCreateStudent = (studentErp: string) => {
    setSelectedCreateStudentErps((prev) => {
      if (prev.includes(studentErp)) {
        if (createPocErp === studentErp) setCreatePocErp('');
        return prev.filter((value) => value !== studentErp);
      }
      return [...prev, studentErp];
    });
  };

  const openCreateDialog = () => {
    setCreateGroupNumber('');
    setCreateGroupName('');
    setCreateGroupDeadline(defaultDeadlineValue());
    setSelectedCreateStudentErps([]);
    setCreatePocErp('');
    setGroupedStudentSearch('');
    setUnassignedStudentSearch('');
    setIsCreateDialogOpen(true);
  };

  const handleSetGroupPoc = async (groupNumber: number, groupId: string) => {
    const pocErp = pocDrafts[groupId] ?? data.groups.find((group) => group.id === groupId)?.created_by_erp ?? '';
    if (!pocErp) {
      toast.error('Select a current member as the group POC.');
      return;
    }
    await runAction(`set-poc-${groupId}`, async () => {
      const result = await taSetGroupPoc(groupNumber, pocErp);
      setData(result.state);
      setPocDrafts((previous) => ({ ...previous, [groupId]: pocErp }));
      toast.success(`Group ${groupNumber} POC updated.`);
    }).catch((error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to update group POC.'));
    });
  };

  const openDeadlineDialog = (scope: DeadlineScope) => {
    setDeadlineDialogScope(scope);
    setDeadlineInput(defaultDeadlineValue());
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-8">
      <div className="flex h-6 justify-end" aria-live="polite">
        <span className={`w-24 text-right text-xs text-muted-foreground transition-opacity ${isUpdating ? 'opacity-100' : 'opacity-0'}`}>
          Updating…
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {METRICS.map((metric) => (
          <button
            key={metric.key}
            type="button"
            onClick={() => setActiveRosterFilter(metric.key)}
            className={`neo-out h-full min-h-[88px] rounded-[24px] border p-4 text-left transition ${
              activeRosterFilter === metric.key ? 'border-primary/60 bg-primary/8' : ''
            }`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {metric.label}
            </div>
            <div className="mt-2 text-2xl font-semibold">{metrics[metric.key]}</div>
          </button>
        ))}
      </div>

      <Card className="ta-module-card">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">Pending Join Requests <Badge aria-label={`${data.join_requests.length} pending join requests`} variant={data.join_requests.length > 0 ? 'default' : 'secondary'}>{data.join_requests.length}</Badge></CardTitle>
              <CardDescription>Review student requests before managing the full group roster.</CardDescription>
            </div>
            <span className="text-xs text-muted-foreground" aria-live="polite">{isUpdating ? 'Updating…' : 'Live status'}</span>
          </div>
        </CardHeader>
        <CardContent>
          {data.join_requests.length === 0 ? <p className="text-sm text-muted-foreground">No pending requests.</p> : (
            <div className="space-y-2">
              {data.join_requests.map((request) => {
                const group = data.groups.find((item) => item.group_number === request.group_number);
                const parsedRequestDate = new Date(request.created_at);
                const requestAge = Number.isNaN(parsedRequestDate.getTime()) ? 'time unavailable' : formatDistanceToNow(parsedRequestDate, { addSuffix: true });
                return <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3">
                  <div className="min-w-0 text-sm"><div className="font-medium">{request.student_name} ({request.student_erp})</div><div className="text-muted-foreground">Class {request.class_no} · Group {request.group_number} · {group?.member_count ?? 0}/5 members</div><div className="text-xs text-muted-foreground">Requested {requestAge} · {formatDate(request.created_at, 'PPP p')}</div></div>
                  <div className="flex gap-2"><Button size="sm" onClick={() => handleRespondToRequest(request.id, true)} disabled={busyAction?.includes(request.id)}>{busyAction === `accept-request-${request.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Approve</Button><Button size="sm" variant="outline" onClick={() => handleRespondToRequest(request.id, false)} disabled={busyAction?.includes(request.id)}><X className="mr-2 h-4 w-4" />Decline</Button></div>
                </div>;
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(420px,0.95fr)]">
        <Card className="ta-module-card">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <CardTitle>Groups Overview</CardTitle>
                <CardDescription>
                  Search groups, select them for bulk actions, and create new groups without using the roster list as a shared target.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" title="Create group" onClick={openCreateDialog}>
                  <Plus className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" title="Download group roster CSV" onClick={handleExportGroups} disabled={data.roster.length === 0}>
                  <Download className="h-4 w-4" />
                </Button>
                <div className="mx-1 h-7 w-px bg-border" />
                <Button
                  variant="outline"
                  size="icon"
                  title="Recalculate all groups"
                  onClick={() => setPendingRecomputeAll(true)}
                  disabled={busyAction === 'recompute-all-groups' || data.groups.length === 0}
                >
                  {busyAction === 'recompute-all-groups' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  title="Delete all groups"
                  onClick={() => setPendingClearRoster(true)}
                  disabled={busyAction === 'clear-groups'}
                >
                  {busyAction === 'clear-groups' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Find group by number, name, or member"
                  value={groupSearchQuery}
                  onChange={(event) => setGroupSearchQuery(event.target.value)}
                />
              </div>
              <Badge variant={selectedGroupNumbers.length > 0 ? 'default' : 'secondary'}>
                {selectedGroupNumbers.length > 0 ? `${selectedGroupNumbers.length} selected` : 'No groups selected'}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={handleEnableEditingAll}
                disabled={busyAction === 'enable-editing-all' || data.groups.length === 0}
              >
                {busyAction === 'enable-editing-all' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unlock className="mr-2 h-4 w-4" />}
                Enable Editing For Everyone
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleEnableEditingSelected}
                disabled={busyAction === 'enable-editing-selected' || selectedGroupNumbers.length === 0}
              >
                {busyAction === 'enable-editing-selected' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unlock className="mr-2 h-4 w-4" />}
                Enable Editing For Selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openDeadlineDialog('all')}
                disabled={data.groups.length === 0}
              >
                <CalendarClock className="mr-2 h-4 w-4" />
                Set Deadline For Everyone
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openDeadlineDialog('selected')}
                disabled={selectedGroupNumbers.length === 0}
              >
                <CalendarClock className="mr-2 h-4 w-4" />
                Set Deadline For Selected
              </Button>
            </div>

            {groupCards.length === 0 ? (
              <p className="text-sm text-muted-foreground">No groups match the current search.</p>
            ) : (
              <div className="space-y-3">
                {groupCards.map((group) => {
                  const isSelected = selectedGroupNumbers.includes(group.group_number);
                  return (
                    <div
                      key={group.id}
                      className={`rounded-[28px] border p-4 transition ${isSelected ? 'border-primary/60 bg-primary/5' : 'bg-background/40'}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleGroupSelection(group.group_number)}
                            aria-label={`Select Group ${group.group_number}`}
                          />
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold">{getGroupHeading(group.group_number, group.display_name)}</h3>
                              <Badge variant={group.is_locked ? 'secondary' : 'default'}>{group.member_count}/5</Badge>
                              {group.is_locked ? <Badge variant="outline">Locked</Badge> : null}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{group.groupUsedDays} used</span>
                              <span>{group.groupRemainingDays} left</span>
                              <span>{group.claimers.length} claimers</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2 text-right text-xs text-muted-foreground">
                          <span>{group.is_locked ? 'Student edits locked' : `Editable until ${formatDate(group.student_edit_locked_at, 'PPP p')}`}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            title={`Delete Group ${group.group_number}`}
                            aria-label={`Delete Group ${group.group_number}`}
                            onClick={() => setPendingDeleteGroup(group)}
                            disabled={busyAction === `delete-group-${group.group_number}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
                        <div className="min-w-[240px] flex-1">
                          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Group POC</div>
                          <Select
                            value={pocDrafts[group.id] ?? group.created_by_erp ?? ''}
                            onValueChange={(value) => setPocDrafts((previous) => ({ ...previous, [group.id]: value }))}
                            disabled={group.members.length === 0}
                          >
                            <SelectTrigger aria-label={`Group ${group.group_number} POC`}>
                              <SelectValue placeholder="Select a current member" />
                            </SelectTrigger>
                            <SelectContent>
                              {orderGroupMembers(group).map((member) => (
                                <SelectItem key={member.erp} value={member.erp}>
                                  {member.student_name} · ERP {member.erp}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleSetGroupPoc(group.group_number, group.id)}
                          disabled={busyAction === `set-poc-${group.id}` || !pocDrafts[group.id] || pocDrafts[group.id] === (group.created_by_erp ?? '')}
                        >
                          {busyAction === `set-poc-${group.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Save POC
                        </Button>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Members</div>
                          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                            {orderGroupMembers(group).map((member) => (
                              <div key={member.erp}>{member.student_name} ({member.erp})</div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Actual Claimers</div>
                          <div className="mt-2 text-sm text-muted-foreground">
                            {group.claimers.length === 0
                              ? 'No original claims yet.'
                              : group.claimers.map((member) => `${member.student_name} (${member.claimed_days})`).join(', ')}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="ta-module-card">
          <CardHeader>
            <CardTitle>Individual Assignment</CardTitle>
            <CardDescription>
              Search the roster, filter the list with the metric tiles above, and assign groups explicitly per student.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={rosterSearchInputRef}
                  className="pl-9"
                  placeholder="Search by ERP, name, class, or current group"
                  value={rosterSearchQuery}
                  onChange={(event) => setRosterSearchQuery(event.target.value)}
                />
              </div>
              <Badge variant={activeRosterFilter === 'all' ? 'secondary' : 'default'}>
                {activeRosterFilter === 'all' ? 'All Students' : `${activeRosterFilter} filter`}
              </Badge>
            </div>

            <Table containerClassName="max-h-[760px]">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className={STUDENT_SERIAL_CLASS}>{STUDENT_SERIAL_HEADER}</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoster.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No students match this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRoster.map((entry, index) => (
                    <TableRow key={entry.erp}>
                      <TableCell className={STUDENT_SERIAL_CLASS}>{index + 1}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{entry.student_name}</div>
                          <div className="text-xs text-muted-foreground">
                            ERP {entry.erp} · Class {entry.class_no}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {entry.group_number !== null ? (
                          <Badge variant="outline">
                            Group {entry.group_number}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Unassigned</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={targetGroupsByErp[entry.erp] ?? ''}
                          onChange={(event) => handleTargetChange(entry.erp, event.target.value)}
                          placeholder={entry.group_number !== null ? String(entry.group_number) : 'Group #'}
                          className="max-w-[108px]"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleAssign(entry.erp)}
                            disabled={busyAction === `assign-${entry.erp}`}
                          >
                            {busyAction === `assign-${entry.erp}` ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Users className="mr-2 h-4 w-4" />
                            )}
                            Assign
                          </Button>
                          {entry.group_number !== null ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRemove(entry.erp)}
                              disabled={busyAction === `remove-${entry.erp}`}
                            >
                              {busyAction === `remove-${entry.erp}` ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="mr-2 h-4 w-4" />
                              )}
                              Remove
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Create Group</DialogTitle>
            <DialogDescription>
              Create a numbered group, choose its POC, optionally add a TA-only display name, and select members from grouped and unassigned students.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-3">
            <Input
              type="number"
              min={1}
              value={createGroupNumber}
              onChange={(event) => setCreateGroupNumber(event.target.value)}
              placeholder="Group number"
            />
            <Input
              value={createGroupName}
              onChange={(event) => setCreateGroupName(event.target.value)}
              placeholder="Optional display name"
            />
            <Input
              type="datetime-local"
              value={createGroupDeadline}
              onChange={(event) => setCreateGroupDeadline(event.target.value)}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border p-4 space-y-3">
              <div className="space-y-1">
                <div className="font-semibold">Existing Group Members</div>
                <div className="text-sm text-muted-foreground">Students already assigned to a group.</div>
              </div>
              <Input
                value={groupedStudentSearch}
                onChange={(event) => setGroupedStudentSearch(event.target.value)}
                placeholder="Search grouped students"
              />
              <div className="max-h-[320px] overflow-auto space-y-2">
                {groupedCandidates.map((entry) => (
                  <label key={entry.erp} className="flex items-start gap-3 rounded-xl border p-3">
                    <Checkbox
                      checked={selectedCreateStudentErps.includes(entry.erp)}
                      onCheckedChange={() => toggleCreateStudent(entry.erp)}
                    />
                    <div className="text-sm">
                      <div className="font-medium">{entry.student_name}</div>
                      <div className="text-muted-foreground">
                        ERP {entry.erp} · Group {entry.group_number}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border p-4 space-y-3">
              <div className="space-y-1">
                <div className="font-semibold">Unassigned Students</div>
                <div className="text-sm text-muted-foreground">Students not currently in any group.</div>
              </div>
              <Input
                value={unassignedStudentSearch}
                onChange={(event) => setUnassignedStudentSearch(event.target.value)}
                placeholder="Search unassigned students"
              />
              <div className="max-h-[320px] overflow-auto space-y-2">
                {unassignedCandidates.map((entry) => (
                  <label key={entry.erp} className="flex items-start gap-3 rounded-xl border p-3">
                    <Checkbox
                      checked={selectedCreateStudentErps.includes(entry.erp)}
                      onCheckedChange={() => toggleCreateStudent(entry.erp)}
                    />
                    <div className="text-sm">
                      <div className="font-medium">{entry.student_name}</div>
                      <div className="text-muted-foreground">ERP {entry.erp}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="mb-2 space-y-1">
              <div className="font-semibold">Group POC <span className="text-destructive">*</span></div>
              <div className="text-sm text-muted-foreground">Select exactly one current member. The POC appears first in the group table and CSV.</div>
            </div>
            <Select value={createPocErp} onValueChange={setCreatePocErp} disabled={selectedCreateStudents.length === 0}>
              <SelectTrigger aria-label="Group POC">
                <SelectValue placeholder={selectedCreateStudents.length === 0 ? 'Select members first' : 'Select a POC'} />
              </SelectTrigger>
              <SelectContent>
                {selectedCreateStudents.map((entry) => (
                  <SelectItem key={entry.erp} value={entry.erp}>
                    {entry.student_name} · ERP {entry.erp} · Class {entry.class_no}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateGroup} disabled={busyAction === 'create-group'}>
              {busyAction === 'create-group' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deadlineDialogScope !== null} onOpenChange={(open) => !open && setDeadlineDialogScope(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Group Edit Deadline</DialogTitle>
            <DialogDescription>
              {deadlineDialogScope === 'selected'
                ? 'Apply a new student editing deadline to the selected groups.'
                : 'Apply a new student editing deadline to all groups.'}
            </DialogDescription>
          </DialogHeader>
          <Input type="datetime-local" value={deadlineInput} onChange={(event) => setDeadlineInput(event.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeadlineDialogScope(null)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmDeadline} disabled={busyAction?.startsWith('set-deadline-')}>
              {busyAction?.startsWith('set-deadline-') ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarClock className="mr-2 h-4 w-4" />}
              Save Deadline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingRecomputeAll} onOpenChange={(open) => !open && setPendingRecomputeAll(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recalculate all shared group balances?</AlertDialogTitle>
            <AlertDialogDescription>
              This will sum the original claims made by current members of every group and rebuild the derived sync adjustments. Original individual claim rows stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRecompute()}>
              {busyAction === 'recompute-all-groups' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Recalculate All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingClearRoster} onOpenChange={(open) => !open && setPendingClearRoster(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all groups?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes current groups, memberships, grouped claim-batch metadata, and derived shared-balance sync adjustments. Original individual claims and TA manual grants remain intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleClearRoster()}>
              {busyAction === 'clear-groups' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Delete All Groups
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingDeleteGroup !== null} onOpenChange={(open) => !open && setPendingDeleteGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group {pendingDeleteGroup?.group_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes only this group, its memberships, join requests, grouped claim-batch metadata, and derived shared-balance adjustments. Attendance, roster students, and original individual late-day claims remain intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteGroup()}
              disabled={pendingDeleteGroup !== null && busyAction === `delete-group-${pendingDeleteGroup.group_number}`}
            >
              {pendingDeleteGroup !== null && busyAction === `delete-group-${pendingDeleteGroup.group_number}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Delete Group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
