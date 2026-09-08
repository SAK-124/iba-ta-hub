export const STUDENT_SERIAL_HEADER = 'S.No.';
export const STUDENT_SERIAL_CLASS = 'w-[52px] min-w-[52px] max-w-[52px] text-center';

export const compareStudentRows = (
  left: { class_no: string; student_name: string; erp: string },
  right: { class_no: string; student_name: string; erp: string },
) =>
  left.class_no.localeCompare(right.class_no, undefined, { numeric: true, sensitivity: 'base' }) ||
  left.student_name.localeCompare(right.student_name, undefined, { sensitivity: 'base' }) ||
  left.erp.localeCompare(right.erp, undefined, { numeric: true, sensitivity: 'base' });

export const sortStudentRows = <T extends { class_no: string; student_name: string; erp: string }>(rows: T[]) =>
  [...rows].sort(compareStudentRows);
