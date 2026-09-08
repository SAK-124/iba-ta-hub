import type { GroupMember, GroupSummary } from './types';

/** The student who created a group is its point of contact (POC). */
export const isGroupPoc = (group: Pick<GroupSummary, 'created_by_erp'>, erp: string) =>
  Boolean(group.created_by_erp && group.created_by_erp === erp);

/** Keep the POC first, then use the existing deterministic roster order. */
export const orderGroupMembers = (
  group: Pick<GroupSummary, 'created_by_erp' | 'members'>,
): GroupMember[] => [...group.members].sort((a, b) => {
  const aIsPoc = isGroupPoc(group, a.erp) ? 0 : 1;
  const bIsPoc = isGroupPoc(group, b.erp) ? 0 : 1;
  return aIsPoc - bIsPoc
    || a.class_no.localeCompare(b.class_no)
    || a.student_name.localeCompare(b.student_name)
    || a.erp.localeCompare(b.erp);
});
