import { useEffect, useMemo, useState } from 'react';
import { Loader2, Users, UserPlus, UserMinus, LogOut, Lock, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/date-format';
import { STUDENT_SERIAL_CLASS, STUDENT_SERIAL_HEADER } from '@/lib/student-table';
import { removeRealtimeChannel, subscribeToRealtimeTables } from '@/lib/realtime-table-subscriptions';
import {
  studentCreateGroup,
  studentJoinGroup,
  studentCancelGroupJoinRequest,
  respondToGroupJoinRequest,
  studentLeaveGroup,
  studentRemoveGroupMember,
  useStudentGroupsState,
  orderGroupMembers,
  isGroupPoc,
  type GroupSummary,
} from '@/features/groups';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const MEMBER_LIMIT = 5;

const getGroupDisplayName = (groupNumber: number) => `Group ${groupNumber}`;
const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }

  return fallback;
};

export default function Groups() {
  const { user } = useAuth();
  const { data, setData, isLoading, isUpdating, refetch } = useStudentGroupsState(Boolean(user?.email));
  const [createGroupNumber, setCreateGroupNumber] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.email) {
      return;
    }

    const channel = subscribeToRealtimeTables(
      `student-groups-${user.email}`,
      [
        { table: 'student_groups' },
        { table: 'student_group_members' },
        { table: 'student_group_join_requests' },
      ],
      () => {
        void refetch();
      },
    );

    return () => {
      void removeRealtimeChannel(channel);
    };
  }, [refetch, user?.email]);

  const currentGroup = useMemo(
    () => data.groups.find((group) => group.id === data.current_group_id) ?? null,
    [data.current_group_id, data.groups],
  );
  const isCreator = Boolean(currentGroup && isGroupPoc(currentGroup, data.student_erp));
  const canManageMembers = Boolean(currentGroup && currentGroup.created_by_role === 'student' && isCreator && !currentGroup.is_locked);
  const canLeaveGroup = Boolean(currentGroup && !currentGroup.is_locked);
  const creatorMustStay = Boolean(currentGroup && currentGroup.created_by_role === 'student' && isCreator && currentGroup.member_count > 1);

  const joinableGroups = useMemo(
    () =>
      data.groups.filter((group) => !group.is_locked && group.member_count < MEMBER_LIMIT),
    [data.groups],
  );

  const runAction = async (actionKey: string, action: () => Promise<void>) => {
    setBusyAction(actionKey);
    try {
      await action();
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateGroup = async () => {
    const groupNumber = Number(createGroupNumber);
    if (!Number.isInteger(groupNumber) || groupNumber < 1) {
      toast.error('Enter a valid positive group number.');
      return;
    }

    await runAction('create-group', async () => {
      const result = await studentCreateGroup(groupNumber);
      setData(result.state);
      setCreateGroupNumber('');
      toast.success(`${getGroupDisplayName(groupNumber)} created.`);
    }).catch((error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to create group.'));
    });
  };

  const handleJoinGroup = async (groupNumber: number) => {
    await runAction(`join-${groupNumber}`, async () => {
      const result = await studentJoinGroup(groupNumber);
      setData(result.state);
      toast.success(`Request sent to ${getGroupDisplayName(groupNumber)}.`);
    }).catch((error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to join group.'));
    });
  };

  const handleCancelRequest = async () => {
    if (!data.my_join_request) return;
    await runAction('cancel-join-request', async () => {
      const result = await studentCancelGroupJoinRequest(data.my_join_request!.id);
      setData(result.state);
      toast.success('Group request cancelled.');
    }).catch((error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to cancel group request.'));
    });
  };

  const handleRespondToRequest = async (requestId: string, accept: boolean) => {
    await runAction(`${accept ? 'accept' : 'decline'}-request-${requestId}`, async () => {
      const result = await respondToGroupJoinRequest(requestId, accept);
      if ('student_email' in result.state) setData(result.state);
      else await refetch();
      toast.success(accept ? 'Join request approved.' : 'Join request declined.');
    }).catch((error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to respond to group request.'));
    });
  };

  const handleRemoveMember = async (group: GroupSummary, studentErp: string) => {
    await runAction(`remove-${studentErp}`, async () => {
      const result = await studentRemoveGroupMember(group.group_number, studentErp);
      setData(result.state);
      toast.success(`Removed ${studentErp} from ${getGroupDisplayName(group.group_number)}.`);
    }).catch((error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to remove member.'));
    });
  };

  const handleLeaveGroup = async () => {
    await runAction('leave-group', async () => {
      const result = await studentLeaveGroup();
      setData(result.state);
      toast.success('You left your group.');
    }).catch((error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to leave group.'));
    });
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
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="h-full">
          <CardHeader className="h-full p-5">
            <CardDescription>Your Group</CardDescription>
            <CardTitle>{currentGroup ? getGroupDisplayName(currentGroup.group_number) : data.my_join_request ? 'Request pending' : 'Ungrouped'}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="h-full">
          <CardHeader className="h-full p-5">
            <CardDescription>Editable Until</CardDescription>
            <CardTitle>{currentGroup ? formatDate(currentGroup.student_edit_locked_at, 'PPP p') : 'Not assigned'}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="h-full">
          <CardHeader className="h-full p-5">
            <CardDescription>Open Groups</CardDescription>
            <CardTitle>{joinableGroups.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {currentGroup ? (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {getGroupDisplayName(currentGroup.group_number)}
                </CardTitle>
                <CardDescription>
                  {currentGroup.is_locked
                    ? 'This group is locked for student edits. Only TAs can change membership now.'
                    : isCreator
                      ? creatorMustStay
                         ? 'You are the group POC. You can review join requests until the lock time, but you must stay until the group has no other members.'
                         : 'You are the group POC. You can review join requests until the lock time.'
                       : 'You can stay in this group or leave it until the lock time. Only the group POC can review join requests.'}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={currentGroup.is_locked ? 'secondary' : 'default'}>
                  {currentGroup.member_count}/{MEMBER_LIMIT} members
                </Badge>
                {currentGroup.is_locked && (
                  <Badge variant="outline" className="gap-1">
                    <Lock className="h-3.5 w-3.5" />
                    Locked
                  </Badge>
                )}
                {canLeaveGroup && (
                  <Button
                    variant="outline"
                    onClick={handleLeaveGroup}
                    disabled={busyAction === 'leave-group' || creatorMustStay}
                  >
                    {busyAction === 'leave-group' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                    Leave Group
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={STUDENT_SERIAL_CLASS}>{STUDENT_SERIAL_HEADER}</TableHead>
                    <TableHead>ERP</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderGroupMembers(currentGroup).map((member, index) => {
                    const memberIsCreator = isGroupPoc(currentGroup, member.erp);
                    return (
                      <TableRow key={member.erp}>
                        <TableCell className={STUDENT_SERIAL_CLASS}>{index + 1}</TableCell>
                        <TableCell className="font-medium">{member.erp}</TableCell>
                        <TableCell>{member.student_name}</TableCell>
                        <TableCell>{member.class_no}</TableCell>
                        <TableCell>
                          <Badge variant={memberIsCreator ? 'default' : 'outline'}>
                            {memberIsCreator ? 'POC' : member.erp === data.student_erp ? 'You' : 'Member'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {canManageMembers && member.erp !== data.student_erp && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRemoveMember(currentGroup, member.erp)}
                              disabled={busyAction === `remove-${member.erp}`}
                            >
                              {busyAction === `remove-${member.erp}` ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <UserMinus className="mr-2 h-4 w-4" />
                              )}
                              Remove
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {isCreator && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <h3 className="font-semibold">Join Requests</h3>
                  <p className="text-sm text-muted-foreground">
                    Students must request to join. Review requests below; only TAs can directly assign students.
                  </p>
                </div>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className={STUDENT_SERIAL_CLASS}>{STUDENT_SERIAL_HEADER}</TableHead>
                        <TableHead>ERP</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Class</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data.incoming_join_requests ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                            No pending join requests.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (data.incoming_join_requests ?? []).map((request, index) => {
                          return (
                          <TableRow key={request.id}>
                            <TableCell className={STUDENT_SERIAL_CLASS}>{index + 1}</TableCell>
                            <TableCell className="font-medium">{request.student_erp}</TableCell>
                            <TableCell>{request.student_name}</TableCell>
                            <TableCell>{request.class_no}</TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex gap-2">
                              <Button size="sm" onClick={() => handleRespondToRequest(request.id, true)} disabled={busyAction?.includes(request.id)}>
                                {busyAction === `accept-request-${request.id}` ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="mr-2 h-4 w-4" />
                                )}
                                Approve
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleRespondToRequest(request.id, false)} disabled={busyAction?.includes(request.id)}>
                                <X className="mr-2 h-4 w-4" /> Decline
                              </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Create or Join a Group</CardTitle>
            <CardDescription>
              Groups are course-wide numbered teams. You can create a new group number or join an existing open group while you are still ungrouped.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 md:grid-cols-[220px_auto]">
              <Input
                type="number"
                min={1}
                value={createGroupNumber}
                onChange={(event) => setCreateGroupNumber(event.target.value)}
                placeholder="Group number"
              />
              <Button onClick={handleCreateGroup} disabled={busyAction === 'create-group'}>
                {busyAction === 'create-group' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                Create Group
              </Button>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Group</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>Editable Until</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.groups.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No groups exist yet. Create the first one.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.groups.map((group) => {
                      const canJoin = !group.is_locked && group.member_count < MEMBER_LIMIT && !data.my_join_request;
                      return (
                        <TableRow key={group.id}>
                          <TableCell className="font-medium">{getGroupDisplayName(group.group_number)}</TableCell>
                          <TableCell>{group.member_count}/{MEMBER_LIMIT}</TableCell>
                          <TableCell>{formatDate(group.student_edit_locked_at, 'PPP p')}</TableCell>
                          <TableCell>
                            <Badge variant={canJoin ? 'default' : 'secondary'}>
                              {group.is_locked ? 'Locked' : group.member_count >= MEMBER_LIMIT ? 'Full' : 'Open'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                               onClick={() => handleJoinGroup(group.group_number)}
                              disabled={!canJoin || busyAction === `join-${group.group_number}`}
                            >
                              {busyAction === `join-${group.group_number}` ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <UserPlus className="mr-2 h-4 w-4" />
                              )}
                              {data.my_join_request?.group_number === group.group_number ? 'Requested' : 'Request to Join'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {data.my_join_request ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-4 text-sm">
                <span>Request pending for {getGroupDisplayName(data.my_join_request.group_number)}. The group creator or a TA must approve it.</span>
                <Button variant="outline" size="sm" onClick={handleCancelRequest} disabled={busyAction === 'cancel-join-request'}>
                  {busyAction === 'cancel-join-request' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Cancel request
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
