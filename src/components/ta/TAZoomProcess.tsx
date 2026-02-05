import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  FileSpreadsheet,
  Loader2,
  Upload,
  AlertCircle,
  CheckCircle2,
  Search,
  Filter,
  Copy,
  Download,
  AlertTriangle,
  ListChecks,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { syncPublicAttendanceSnapshot } from '@/lib/public-attendance-sync';
import * as XLSX from 'xlsx';

type GenericRow = Record<string, unknown>;

interface ProcessedData {
  attendance_rows: unknown[];
  issues_rows: unknown[];
  absent_rows: unknown[];
  penalties_rows: unknown[];
  matches_rows: unknown[];
  raw_rows: unknown[];
  total_class_minutes?: number;
  effective_threshold_minutes?: number;
  rows?: number;
}

interface SessionRow {
  id: string;
  session_number: number;
  session_date: string;
}

interface RosterReference {
  erp: string;
  student_name: string;
  class_no: string;
}

interface NormalizedIssue {
  id: string;
  name: string;
  erpCandidate: string;
  reason: string;
  notInRoster: boolean;
  unidentified: boolean;
  raw: GenericRow;
}

interface PenaltyCandidate {
  key: string;
  erp: string;
  name: string;
  classNo: string;
  reason: string;
  canApply: boolean;
  raw: GenericRow;
}

interface ZoomDiagnostics {
  rosterCount: number;
  attendanceRowCount: number;
  uniqueMatchedErpCount: number;
  duplicateMatchedErpCount: number;
  issuesCount: number;
  notInRosterCount: number;
  unidentifiedCount: number;
  integrityWarnings: string[];
}

interface ZoomWorkspaceCache {
  data: ProcessedData | null;
  activeTab: string;
  step: 'upload' | 'review' | 'results';
  zoomFile: File | null;
  rosterFile: File | null;
  useSavedRoster: boolean;
  manualDuration: string;
  namazBreak: string;
  filterName: string;
  filterErp: string;
  filterClass: string;
  ignoredKeys: string[];
  penaltySessionId: string;
  selectedPenaltyKeys: string[];
  missingAttendanceErps: string[];
}

const ERP_REGEX = /(\d{5})/;
let zoomWorkspaceCache: ZoomWorkspaceCache | null = null;

const toText = (value: unknown) => (value == null ? '' : String(value).trim());

const toRecordArray = (value: unknown): GenericRow[] => {
  if (!Array.isArray(value)) return [];

  return value.map((row) => {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      return row as GenericRow;
    }

    return { value: row };
  });
};

const pickFirst = (row: GenericRow, keys: string[]) => {
  for (const key of keys) {
    if (!(key in row)) continue;
    const value = row[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text !== '') return value;
  }

  return undefined;
};

const extractERP = (row: GenericRow): string => {
  const value = pickFirst(row, [
    'ERP',
    'erp',
    'Erp',
    'ERP Candidate',
    'ERP Candidate(s)',
    'Matched ERP',
    'Roster ERP',
    'Student ERP',
    'Key',
  ]);

  const match = toText(value).match(ERP_REGEX);
  return match?.[1] || '';
};

const extractName = (row: GenericRow): string => {
  const value = pickFirst(row, [
    'Name',
    'name',
    'Student Name',
    'RosterName',
    'Roster Name',
    'Zoom Name',
    'Zoom Names (raw)',
    'Display Name',
    'Participant',
    'Full Name',
  ]);

  return toText(value);
};

const extractClassNo = (row: GenericRow): string => {
  const value = pickFirst(row, ['Class No', 'Class', 'class_no', 'Section']);
  return toText(value);
};

const extractReason = (row: GenericRow): string => {
  const value = pickFirst(row, [
    'Reason',
    'reason',
    'Issue',
    'issue',
    'Error',
    'error',
    'Message',
    'message',
    'Status',
    'status',
    'Notes',
    'Remarks',
  ]);

  return toText(value) || 'No reason provided';
};

const getRowKey = (row: GenericRow, idx: number) => {
  const explicit = toText(pickFirst(row, ['Key', 'key', 'ID', 'id']));
  if (explicit) return explicit;

  const erp = extractERP(row);
  const name = extractName(row);
  const classNo = extractClassNo(row);
  const email = toText(pickFirst(row, ['Email', 'email']));
  const joinTime = toText(pickFirst(row, ['Join Time', 'join_time', 'Join']));

  const compositeKey = `${erp || 'no-erp'}:${name || 'no-name'}:${classNo || 'no-class'}:${email || 'no-email'}:${joinTime || 'no-join'}`;
  if (compositeKey.includes('no-erp') && compositeKey.includes('no-name') && compositeKey.includes('no-class')) {
    return `row-${idx}`;
  }

  return compositeKey;
};

const toBool = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  const text = toText(value).toLowerCase();
  return text === 'true' || text === '1' || text === 'yes';
};

const isNotInRosterReason = (reason: string) => /not\s+in\s+roster|outside\s+roster|not\s+on\s+roster|missing\s+from\s+roster/i.test(reason);

const isUnidentifiedReason = (reason: string) =>
  /unidentified|unable\s+to\s+identify|unmatched|ambiguous|could\s+not\s+match|no\s+erp|missing\s+erp|unknown/i.test(reason);

const isNamingPenaltyReason = (reason: string) => /naming|name\s*format|display\s*name|rename/i.test(reason);

const downloadJson = (filename: string, data: unknown) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export default function TAZoomProcess() {
  const cached = zoomWorkspaceCache;

  const [data, setData] = useState<ProcessedData | null>(() => cached?.data ?? null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState(() => cached?.activeTab ?? 'matches');

  const [step, setStep] = useState<'upload' | 'review' | 'results'>(() => cached?.step ?? 'upload');

  const [zoomFile, setZoomFile] = useState<File | null>(() => cached?.zoomFile ?? null);
  const [rosterFile, setRosterFile] = useState<File | null>(() => cached?.rosterFile ?? null);
  const [useSavedRoster, setUseSavedRoster] = useState(() => cached?.useSavedRoster ?? true);
  const [manualDuration, setManualDuration] = useState(() => cached?.manualDuration ?? '');
  const [namazBreak, setNamazBreak] = useState(() => cached?.namazBreak ?? '');

  const [filterName, setFilterName] = useState(() => cached?.filterName ?? '');
  const [filterErp, setFilterErp] = useState(() => cached?.filterErp ?? '');
  const [filterClass, setFilterClass] = useState(() => cached?.filterClass ?? '');

  const [ignoredKeys, setIgnoredKeys] = useState<Set<string>>(() => new Set(cached?.ignoredKeys ?? []));
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [rosterReference, setRosterReference] = useState<Record<string, RosterReference>>({});

  const [penaltySessionId, setPenaltySessionId] = useState(() => cached?.penaltySessionId ?? '');
  const [selectedPenaltyKeys, setSelectedPenaltyKeys] = useState<Set<string>>(
    () => new Set(cached?.selectedPenaltyKeys ?? [])
  );
  const [isApplyingPenalties, setIsApplyingPenalties] = useState(false);
  const [missingAttendanceErps, setMissingAttendanceErps] = useState<string[]>(() => cached?.missingAttendanceErps ?? []);

  const toggleIgnoreKey = (key: string) => {
    setIgnoredKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  useEffect(() => {
    const loadReferenceData = async () => {
      const [sessionsRes, rosterRes] = await Promise.all([
        supabase.from('sessions').select('id, session_number, session_date').order('session_number', { ascending: false }),
        supabase.from('students_roster').select('erp, student_name, class_no'),
      ]);

      if (sessionsRes.error) {
        toast.error(`Failed to load sessions: ${sessionsRes.error.message}`);
      } else {
        const nextSessions = (sessionsRes.data || []) as SessionRow[];
        setSessions(nextSessions);
        setPenaltySessionId((current) => current || nextSessions[0]?.id || '');
      }

      if (rosterRes.error) {
        toast.error(`Failed to load roster reference: ${rosterRes.error.message}`);
      } else {
        const map: Record<string, RosterReference> = {};
        for (const row of (rosterRes.data || []) as RosterReference[]) {
          map[row.erp] = row;
        }
        setRosterReference(map);
      }
    };

    void loadReferenceData();
  }, []);

  useEffect(() => {
    zoomWorkspaceCache = {
      data,
      activeTab,
      step,
      zoomFile,
      rosterFile,
      useSavedRoster,
      manualDuration,
      namazBreak,
      filterName,
      filterErp,
      filterClass,
      ignoredKeys: Array.from(ignoredKeys),
      penaltySessionId,
      selectedPenaltyKeys: Array.from(selectedPenaltyKeys),
      missingAttendanceErps,
    };
  }, [
    data,
    activeTab,
    step,
    zoomFile,
    rosterFile,
    useSavedRoster,
    manualDuration,
    namazBreak,
    filterName,
    filterErp,
    filterClass,
    ignoredKeys,
    penaltySessionId,
    selectedPenaltyKeys,
    missingAttendanceErps,
  ]);

  useEffect(() => {
    setIgnoredKeys(new Set());
  }, [data]);

  const rosterErpSet = useMemo(() => new Set(Object.keys(rosterReference)), [rosterReference]);
  const rosterCount = Object.keys(rosterReference).length;

  const normalizedRows = useMemo(() => {
    const attendanceRows = toRecordArray(data?.attendance_rows);
    const issuesRows = toRecordArray(data?.issues_rows);
    const absentRows = toRecordArray(data?.absent_rows);
    const penaltiesRows = toRecordArray(data?.penalties_rows);
    const matchesRows = toRecordArray(data?.matches_rows);
    const rawRows = toRecordArray(data?.raw_rows);

    const issues: NormalizedIssue[] = issuesRows.map((row, idx) => {
      const erpCandidate = extractERP(row);
      const reason = extractReason(row);
      const notInRosterFlag =
        toBool(pickFirst(row, ['Not In Roster', 'not_in_roster', 'Out Of Roster'])) ||
        isNotInRosterReason(reason) ||
        (!!erpCandidate && !rosterErpSet.has(erpCandidate));

      const unidentifiedFlag =
        toBool(pickFirst(row, ['Unidentified', 'unidentified'])) ||
        !erpCandidate ||
        isUnidentifiedReason(reason);

      return {
        id: getRowKey(row, idx),
        name: extractName(row),
        erpCandidate,
        reason,
        notInRoster: notInRosterFlag,
        unidentified: unidentifiedFlag,
        raw: row,
      };
    });

    const fallbackPenaltyIssues = issues.filter((issue) => isNamingPenaltyReason(issue.reason));

    const penaltyCandidates: PenaltyCandidate[] =
      penaltiesRows.length > 0
        ? penaltiesRows.map((row, idx) => {
            const erp = extractERP(row);
            const name = extractName(row) || rosterReference[erp]?.student_name || '';
            const classNo = extractClassNo(row) || rosterReference[erp]?.class_no || '';
            const reason = extractReason(row);

            return {
              key: getRowKey(row, idx),
              erp,
              name,
              classNo,
              reason,
              canApply: !!erp,
              raw: row,
            };
          })
        : fallbackPenaltyIssues.map((issue, idx) => ({
            key: `${issue.id}:penalty:${idx}`,
            erp: issue.erpCandidate,
            name: issue.name || rosterReference[issue.erpCandidate]?.student_name || '',
            classNo: rosterReference[issue.erpCandidate]?.class_no || '',
            reason: issue.reason,
            canApply: !!issue.erpCandidate,
            raw: issue.raw,
          }));

    return {
      attendanceRows,
      issuesRows,
      absentRows,
      penaltiesRows,
      matchesRows,
      rawRows,
      issues,
      penaltyCandidates,
      unidentifiedIssues: issues.filter((issue) => issue.unidentified),
      notInRosterIssues: issues.filter((issue) => issue.notInRoster),
    };
  }, [data, rosterErpSet, rosterReference]);

  useEffect(() => {
    const defaults = normalizedRows.penaltyCandidates
      .filter((candidate) => candidate.canApply)
      .map((candidate) => candidate.key);

    setSelectedPenaltyKeys(new Set(defaults));
  }, [normalizedRows.penaltyCandidates]);

  const diagnostics = useMemo<ZoomDiagnostics>(() => {
    const matchedErps = normalizedRows.matchesRows.map((row) => extractERP(row)).filter(Boolean);
    const uniqueMatchedErps = new Set(matchedErps);

    const warnings: string[] = [];
    const duplicateMatchedErpCount = Math.max(matchedErps.length - uniqueMatchedErps.size, 0);

    if (rosterCount > 0 && uniqueMatchedErps.size > rosterCount) {
      warnings.push(
        `Matched ERP count (${uniqueMatchedErps.size}) is greater than roster size (${rosterCount}). Check duplicate or non-roster rows.`
      );
    }

    if (duplicateMatchedErpCount > 0) {
      warnings.push(`${duplicateMatchedErpCount} duplicate matched ERP row(s) found in Zoom results.`);
    }

    if (rosterCount > 0 && normalizedRows.attendanceRows.length > rosterCount) {
      warnings.push(
        `Attendance rows (${normalizedRows.attendanceRows.length}) exceed roster size (${rosterCount}). Verify merged participants.`
      );
    }

    return {
      rosterCount,
      attendanceRowCount: normalizedRows.attendanceRows.length,
      uniqueMatchedErpCount: uniqueMatchedErps.size,
      duplicateMatchedErpCount,
      issuesCount: normalizedRows.issues.length,
      notInRosterCount: normalizedRows.notInRosterIssues.length,
      unidentifiedCount: normalizedRows.unidentifiedIssues.length,
      integrityWarnings: warnings,
    };
  }, [normalizedRows, rosterCount]);

  useEffect(() => {
    if (!data) return;

    console.groupCollapsed('[Zoom Process] Diagnostics');
    console.table({
      rosterCount: diagnostics.rosterCount,
      attendanceRowCount: diagnostics.attendanceRowCount,
      uniqueMatchedErpCount: diagnostics.uniqueMatchedErpCount,
      duplicateMatchedErpCount: diagnostics.duplicateMatchedErpCount,
      issuesCount: diagnostics.issuesCount,
      notInRosterCount: diagnostics.notInRosterCount,
      unidentifiedCount: diagnostics.unidentifiedCount,
    });

    if (diagnostics.integrityWarnings.length > 0) {
      console.warn('[Zoom Process] Integrity warnings:', diagnostics.integrityWarnings);
    }

    console.groupEnd();
  }, [data, diagnostics]);

  const attendanceStatusCounts = useMemo(() => {
    let present = 0;
    let absent = 0;
    let excused = 0;

    normalizedRows.attendanceRows.forEach((row) => {
      const status = toText(pickFirst(row, ['status', 'Status', 'Attendance'])).toLowerCase();
      if (status === 'present') present += 1;
      else if (status === 'absent') absent += 1;
      else if (status === 'excused') excused += 1;
    });

    return { present, absent, excused };
  }, [normalizedRows.attendanceRows]);

  const copyAbsentErps = () => {
    const erps = normalizedRows.absentRows
      .filter((row, idx) => {
        const key = getRowKey(row, idx);
        const erp = extractERP(row);
        return !!erp && !ignoredKeys.has(key);
      })
      .map((row) => extractERP(row));

    navigator.clipboard.writeText(erps.join('\n'));
    toast.success(`Copied ${erps.length} ERP(s) to clipboard`);
  };

  const copyUnidentifiedSummary = async () => {
    const lines = normalizedRows.unidentifiedIssues.map((item) => {
      return `${item.name || 'Unknown Name'} | ERP: ${item.erpCandidate || 'N/A'} | Reason: ${item.reason}`;
    });

    await navigator.clipboard.writeText(lines.join('\n'));
    toast.success(`Copied ${normalizedRows.unidentifiedIssues.length} unidentified row(s)`);
  };

  const fetchSavedRosterBlob = async (): Promise<Blob | null> => {
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(`Authentication error: ${sessionError.message}`);
      }

      if (!sessionData?.session) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const { data: students, error } = await supabase
        .from('students_roster')
        .select('class_no, student_name, erp');

      if (error) {
        if (error.code === 'PGRST301' || error.message.includes('permission')) {
          throw new Error('Permission denied. You may not have TA access.');
        }
        throw new Error(`Database query failed: ${error.message}`);
      }

      if (!students || students.length === 0) {
        throw new Error('No students found in saved roster. Upload roster first in Roster Management.');
      }

      const mappedStudents = students.map((student) => ({
        'Class No': student.class_no,
        Name: student.student_name,
        ERP: student.erp,
      }));

      const ws = XLSX.utils.json_to_sheet(mappedStudents);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Roster');

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      return new Blob([wbout], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load roster.';
      console.error('Error fetching saved roster:', error);
      toast.error('Failed to load saved roster', { description: message });
      return null;
    }
  };

  const processFile = async (targetStep: 'review' | 'results') => {
    if (!zoomFile) {
      toast.error('Please select a Zoom CSV file first.');
      return;
    }

    setIsProcessing(true);
    const loadingToast = toast.loading(targetStep === 'review' ? 'Analyzing matches...' : 'Generating attendance...');

    try {
      const formData = new FormData();
      formData.append('file', zoomFile);
      formData.append('threshold', '0.8');

      if (manualDuration) formData.append('manual_duration', manualDuration);
      if (namazBreak) formData.append('namaz_break', namazBreak);

      if (useSavedRoster) {
        const rosterBlob = await fetchSavedRosterBlob();
        if (!rosterBlob) {
          throw new Error('Could not load saved roster.');
        }

        formData.append('roster', rosterBlob, 'saved_roster.xlsx');
      } else if (rosterFile) {
        formData.append('roster', rosterFile);
      }

      const apiUrl = import.meta.env.VITE_ZOOM_API_URL;
      if (!import.meta.env.DEV && !apiUrl) {
        throw new Error('VITE_ZOOM_API_URL is not configured. Add it to your deployment environment variables.');
      }

      const endpoint = import.meta.env.DEV ? '/api/process' : `${apiUrl}/api/process`;

      console.groupCollapsed('[Zoom Process] Request context');
      console.log('Mode:', import.meta.env.DEV ? 'development' : 'production');
      console.log('Endpoint:', endpoint);
      console.log(
        'Form fields:',
        [...formData.entries()].map(([key, value]) => `${key}: ${typeof value === 'object' ? (value as File).name : value}`)
      );
      console.groupEnd();

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          body: formData,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown network failure';
        throw new Error(`Network error while reaching Zoom processor API: ${message}`);
      }

      const responseText = await response.text();

      if (!response.ok) {
        let errorMessage = responseText;
        try {
          const parsedError = JSON.parse(responseText) as { error?: string; message?: string };
          errorMessage = parsedError.error || parsedError.message || responseText;
        } catch {
          // Keep raw text fallback.
        }

        throw new Error(`Backend error (${response.status}): ${errorMessage}`);
      }

      let parsedResult: unknown;
      try {
        parsedResult = JSON.parse(responseText);
      } catch {
        throw new Error('Backend returned non-JSON response. Check /api/process logs.');
      }

      if (!parsedResult || typeof parsedResult !== 'object') {
        throw new Error('Unexpected response shape from backend.');
      }

      const nextData = parsedResult as ProcessedData;

      setData({
        attendance_rows: toRecordArray(nextData.attendance_rows),
        issues_rows: toRecordArray(nextData.issues_rows),
        absent_rows: toRecordArray(nextData.absent_rows),
        penalties_rows: toRecordArray(nextData.penalties_rows),
        matches_rows: toRecordArray(nextData.matches_rows),
        raw_rows: toRecordArray(nextData.raw_rows),
        total_class_minutes: nextData.total_class_minutes,
        effective_threshold_minutes: nextData.effective_threshold_minutes,
        rows: nextData.rows,
      });

      setStep(targetStep);
      setActiveTab(targetStep === 'review' ? 'matches' : 'attendance');
      setMissingAttendanceErps([]);

      toast.dismiss(loadingToast);
      toast.success(targetStep === 'review' ? 'Match analysis complete' : 'Attendance generated');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown processing failure';
      console.error('[Zoom Process] Processing failed:', error);
      toast.dismiss(loadingToast);
      toast.error('Processing failed', { description: message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleZoomFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.[0]) return;

    setZoomFile(event.target.files[0]);
    event.target.value = '';
    setStep('upload');
    setData(null);
    setMissingAttendanceErps([]);
  };

  const renderTable = (rows: GenericRow[], isRaw = false) => {
    if (rows.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <AlertCircle className="mb-4 h-12 w-12 opacity-20" />
          <p>No data available for this sheet.</p>
        </div>
      );
    }

    const filteredRows = rows.filter((row) => {
      const name = extractName(row).toLowerCase();
      const erp = extractERP(row);
      const classNo = extractClassNo(row).toLowerCase();

      const nameMatch = filterName ? name.includes(filterName.toLowerCase()) : true;
      const erpMatch = filterErp ? erp.includes(filterErp) : true;
      const classMatch = filterClass ? classNo.includes(filterClass.toLowerCase()) : true;

      return nameMatch && erpMatch && classMatch;
    });

    if (filteredRows.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Filter className="mb-4 h-12 w-12 opacity-20" />
          <p>No rows match filters.</p>
        </div>
      );
    }

    const headers = [...Object.keys(rows[0])];
    if (!isRaw) {
      const priority = ['ERP', 'Name', 'Student Name', 'RosterName', 'Class No', 'Status'];
      headers.sort((a, b) => {
        const aIdx = priority.indexOf(a);
        const bIdx = priority.indexOf(b);
        if (aIdx === -1 && bIdx === -1) return 0;
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
      });
    }

    return (
      <div className="space-y-4">
        {!isRaw && (
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-primary/5 bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Filters</span>
            </div>
            <div className="h-6 w-[1px] bg-border" />
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Class</Label>
              <Input className="h-8 w-20 text-xs" placeholder="All" value={filterClass} onChange={(event) => setFilterClass(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">ERP</Label>
              <Input className="h-8 w-24 text-xs" placeholder="Search" value={filterErp} onChange={(event) => setFilterErp(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Name</Label>
              <Input className="h-8 w-32 text-xs" placeholder="Search" value={filterName} onChange={(event) => setFilterName(event.target.value)} />
            </div>
            {(filterClass || filterErp || filterName) && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-5 h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  setFilterClass('');
                  setFilterErp('');
                  setFilterName('');
                }}
              >
                Clear
              </Button>
            )}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-border">
          <div className="max-h-[600px] overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/50 backdrop-blur-md">
                <TableRow>
                  {headers.map((header) => (
                    <TableHead key={header} className="whitespace-nowrap font-bold text-foreground">
                      {header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row, idx) => (
                  <TableRow key={idx} className="transition-colors hover:bg-muted/50">
                    {headers.map((header) => (
                      <TableCell key={`${idx}-${header}`} className="whitespace-nowrap font-mono text-xs">
                        {String(row[header] ?? '')}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">Showing {filteredRows.length} row(s)</div>
      </div>
    );
  };

  const renderAbsentTable = (rows: GenericRow[]) => {
    if (rows.length === 0) {
      return <div className="p-8 text-center text-muted-foreground">No absent students</div>;
    }

    const headers = ['ERP', 'Name', 'Class No', 'Reason'];

    const filteredRows = rows.filter((row) => {
      const classMatch = filterClass ? extractClassNo(row).toLowerCase().includes(filterClass.toLowerCase()) : true;
      const erpMatch = filterErp ? extractERP(row).includes(filterErp) : true;
      const nameMatch = filterName ? extractName(row).toLowerCase().includes(filterName.toLowerCase()) : true;
      return classMatch && erpMatch && nameMatch;
    });

    const nonIgnoredCount = filteredRows.filter((row, idx) => !ignoredKeys.has(getRowKey(row, idx))).length;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-primary/5 bg-muted/30 p-3">
          <div className="flex items-center gap-4 text-sm font-medium">
            <span>
              <span className="text-red-500">{filteredRows.length}</span> absent
            </span>
            <span>
              <span className="text-yellow-500">{ignoredKeys.size}</span> ignored
            </span>
            <span>
              <span className="text-green-500">{nonIgnoredCount}</span> to copy
            </span>
          </div>
          <Button onClick={copyAbsentErps} variant="outline" size="sm" className="gap-2">
            <Copy className="h-4 w-4" />
            Copy Absent ERPs
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-primary/5 bg-muted/30 p-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Filters</span>
          </div>
          <div className="h-6 w-[1px] bg-border" />
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Class</Label>
            <Input className="h-8 w-20 text-xs" placeholder="All" value={filterClass} onChange={(event) => setFilterClass(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">ERP</Label>
            <Input className="h-8 w-24 text-xs" placeholder="Search" value={filterErp} onChange={(event) => setFilterErp(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Name</Label>
            <Input className="h-8 w-32 text-xs" placeholder="Search" value={filterName} onChange={(event) => setFilterName(event.target.value)} />
          </div>
          {(filterClass || filterErp || filterName) && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-5 h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                setFilterClass('');
                setFilterErp('');
                setFilterName('');
              }}
            >
              Clear
            </Button>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-border">
          <div className="max-h-[600px] overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/50 backdrop-blur-md">
                <TableRow>
                  <TableHead className="w-16 whitespace-nowrap font-bold text-foreground">Ignore</TableHead>
                  {headers.map((header) => (
                    <TableHead key={header} className="whitespace-nowrap font-bold text-foreground">
                      {header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row, idx) => {
                  const key = getRowKey(row, idx);
                  const isIgnored = ignoredKeys.has(key);

                  return (
                    <TableRow key={key} className={`transition-colors hover:bg-muted/50 ${isIgnored ? 'bg-muted/20 opacity-50' : ''}`}>
                      <TableCell className="w-16">
                        <Checkbox
                          checked={isIgnored}
                          onCheckedChange={() => toggleIgnoreKey(key)}
                          className="data-[state=checked]:border-yellow-500 data-[state=checked]:bg-yellow-500"
                        />
                      </TableCell>
                      <TableCell className={`whitespace-nowrap font-mono text-xs ${isIgnored ? 'line-through' : ''}`}>
                        {extractERP(row)}
                      </TableCell>
                      <TableCell className={`whitespace-nowrap font-mono text-xs ${isIgnored ? 'line-through' : ''}`}>
                        {extractName(row)}
                      </TableCell>
                      <TableCell className={`whitespace-nowrap font-mono text-xs ${isIgnored ? 'line-through' : ''}`}>
                        {extractClassNo(row)}
                      </TableCell>
                      <TableCell className={`whitespace-nowrap font-mono text-xs ${isIgnored ? 'line-through' : ''}`}>
                        {extractReason(row)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    );
  };

  const renderUnidentifiedRows = () => {
    if (normalizedRows.unidentifiedIssues.length === 0) {
      return (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          No unidentified rows found.
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>
              <strong>{normalizedRows.unidentifiedIssues.length}</strong> unidentified row(s)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={copyUnidentifiedSummary} className="gap-2">
              <Copy className="h-4 w-4" />
              Copy List
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadJson('zoom-unidentified-rows.json', normalizedRows.unidentifiedIssues)}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export JSON
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {normalizedRows.unidentifiedIssues.map((issue) => (
            <details key={issue.id} className="rounded-xl border border-border bg-background p-4">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">{issue.name || 'Unknown participant'}</p>
                    <p className="text-xs text-muted-foreground">ERP candidate: {issue.erpCandidate || 'N/A'}</p>
                  </div>
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600">
                    {issue.reason}
                  </Badge>
                </div>
              </summary>
              <pre className="mt-4 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(issue.raw, null, 2)}</pre>
            </details>
          ))}
        </div>
      </div>
    );
  };

  const togglePenaltyCandidate = (key: string, checked: boolean) => {
    setSelectedPenaltyKeys((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const selectAllPenaltyCandidates = () => {
    setSelectedPenaltyKeys(
      new Set(normalizedRows.penaltyCandidates.filter((candidate) => candidate.canApply).map((candidate) => candidate.key))
    );
  };

  const clearAllPenaltyCandidates = () => {
    setSelectedPenaltyKeys(new Set());
  };

  const handleApplySelectedPenalties = async () => {
    if (!penaltySessionId) {
      toast.error('Select a session before applying penalties.');
      return;
    }

    const applicableCandidates = normalizedRows.penaltyCandidates.filter((candidate) => candidate.canApply);
    if (applicableCandidates.length === 0) {
      toast.error('No penalty candidates with valid ERP were found.');
      return;
    }

    const selectedCandidates = applicableCandidates.filter((candidate) => selectedPenaltyKeys.has(candidate.key));
    if (selectedCandidates.length === 0) {
      toast.error('Select at least one student to apply penalty.');
      return;
    }

    const selectedErps = Array.from(new Set(selectedCandidates.map((candidate) => candidate.erp)));
    const allCandidateErps = Array.from(new Set(applicableCandidates.map((candidate) => candidate.erp)));

    setIsApplyingPenalties(true);

    try {
      const { data: attendanceRows, error: attendanceError } = await supabase
        .from('attendance')
        .select('erp')
        .eq('session_id', penaltySessionId)
        .in('erp', allCandidateErps);

      if (attendanceError) {
        throw new Error(attendanceError.message);
      }

      const existingSet = new Set((attendanceRows || []).map((row) => toText((row as { erp?: string }).erp)));
      const missingSelectedErps = selectedErps.filter((erp) => !existingSet.has(erp));

      if (missingSelectedErps.length > 0) {
        setMissingAttendanceErps(missingSelectedErps);
        toast.error('Attendance missing for selected students in this session. Mark attendance first, then retry.');
        return;
      }

      setMissingAttendanceErps([]);

      const selectedExistingErps = selectedErps.filter((erp) => existingSet.has(erp));
      const unselectedExistingErps = allCandidateErps.filter(
        (erp) => !selectedExistingErps.includes(erp) && existingSet.has(erp)
      );
      const skippedErps = allCandidateErps.filter((erp) => !existingSet.has(erp));

      if (selectedExistingErps.length > 0) {
        const { error: applyError } = await supabase
          .from('attendance')
          .update({ naming_penalty: true } as never)
          .eq('session_id', penaltySessionId)
          .in('erp', selectedExistingErps);

        if (applyError) {
          throw new Error(applyError.message);
        }
      }

      if (unselectedExistingErps.length > 0) {
        const { error: clearError } = await supabase
          .from('attendance')
          .update({ naming_penalty: false } as never)
          .eq('session_id', penaltySessionId)
          .in('erp', unselectedExistingErps);

        if (clearError) {
          throw new Error(clearError.message);
        }
      }

      const { ok } = await syncPublicAttendanceSnapshot({ source: 'ta_zoom_penalty_apply' });

      toast.success(
        `Penalties updated. Applied: ${selectedExistingErps.length}, Cleared: ${unselectedExistingErps.length}, Skipped: ${skippedErps.length}`
      );

      if (!ok) {
        toast.error('Penalties saved, but Google Sheet sync failed.');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to apply penalties: ${message}`);
    } finally {
      setIsApplyingPenalties(false);
    }
  };

  const selectedPenaltyCount = normalizedRows.penaltyCandidates.filter((candidate) => selectedPenaltyKeys.has(candidate.key)).length;

  return (
    <div className="animate-fade-in space-y-6 pb-20">
      <div className="space-y-1">
        <h1 className="text-3xl font-extrabold uppercase tracking-tight text-foreground">Zoom Processor</h1>
        <p className="text-muted-foreground">Upload Zoom logs, review matches, and generate attendance.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="glass-card border-primary/10 md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">1</div>
              Upload & Match
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Zoom Log</Label>
                <div className="relative">
                  <input type="file" accept=".csv" className="hidden" id="main-zoom-upload" onChange={handleZoomFileChange} disabled={isProcessing} />
                  <Label
                    htmlFor="main-zoom-upload"
                    className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 font-bold uppercase tracking-wider text-foreground transition-all ${
                      zoomFile
                        ? 'border-primary bg-primary/10'
                        : 'border-primary/20 bg-primary/5 hover:bg-primary/10'
                    }`}
                  >
                    {zoomFile ? (
                      <>
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <CheckCircle2 className="h-5 w-5" />
                        </div>
                        <span className="max-w-[150px] truncate text-xs">{zoomFile.name}</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-6 w-6 text-primary/50" />
                        <span className="text-xs">Select CSV</span>
                      </>
                    )}
                  </Label>
                </div>
              </div>

              <div className="space-y-2">
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Roster</Label>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="saved-roster" className="cursor-pointer text-[10px]">
                      Use Saved
                    </Label>
                    <Switch
                      id="saved-roster"
                      checked={useSavedRoster}
                      onCheckedChange={(checked) => {
                        setUseSavedRoster(checked);
                        setStep('upload');
                      }}
                      className="scale-75"
                    />
                  </div>
                </div>
                <div className="relative h-full">
                  {useSavedRoster ? (
                    <div className="flex h-[100px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/20 bg-primary/5 px-4 py-6 font-bold uppercase tracking-wider text-primary">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="text-xs">Using Saved Roster</span>
                    </div>
                  ) : (
                    <>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        id="roster-upload"
                        onChange={(event) => {
                          setRosterFile(event.target.files?.[0] || null);
                          setStep('upload');
                        }}
                        disabled={isProcessing || useSavedRoster}
                      />
                      <Label
                        htmlFor="roster-upload"
                        className={`flex h-[100px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 font-bold uppercase tracking-wider transition-all ${
                          rosterFile
                            ? 'border-primary/50 bg-primary/5 text-primary'
                            : 'border-muted-foreground/20 text-muted-foreground hover:bg-muted/50'
                        }`}
                      >
                        {rosterFile ? (
                          <>
                            <CheckCircle2 className="h-5 w-5" />
                            <span className="max-w-[150px] truncate text-xs">{rosterFile.name}</span>
                          </>
                        ) : (
                          <>
                            <FileSpreadsheet className="h-5 w-5 opacity-50" />
                            <span className="text-xs">Select Roster</span>
                          </>
                        )}
                      </Label>
                    </>
                  )}
                </div>
              </div>
            </div>

            {zoomFile && step === 'upload' && (
              <Button className="h-12 w-full text-sm font-bold uppercase tracking-wider" onClick={() => processFile('review')} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                Analyze & Match Roster
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className={`glass-card border-primary/10 ${step === 'upload' ? 'pointer-events-none opacity-50' : ''}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">2</div>
              Parameters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Custom Duration (mins)</Label>
              <Input type="number" placeholder="Auto" value={manualDuration} onChange={(event) => setManualDuration(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Namaz Break (mins)</Label>
              <Input type="number" placeholder="0" value={namazBreak} onChange={(event) => setNamazBreak(event.target.value)} />
            </div>
            <Button className="mt-4 w-full" variant={step === 'results' ? 'outline' : 'default'} onClick={() => processFile('results')} disabled={isProcessing || step === 'upload'}>
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              {step === 'results' ? 'Update Results' : 'Calculate Attendance'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {data && (
        <Card className="glass-card animate-fade-in border-primary/10 shadow-2xl">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="uppercase tracking-wide">{step === 'review' ? 'Match Review' : 'Final Results'}</CardTitle>
                <CardDescription>
                  {data.rows ?? normalizedRows.rawRows.length} records processed. {step === 'review' && 'Review matches before finalizing.'}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="bg-green-500/10 text-green-600">
                  Present: {attendanceStatusCounts.present}
                </Badge>
                <Badge variant="outline" className="bg-red-500/10 text-red-600">
                  Absent: {attendanceStatusCounts.absent}
                </Badge>
                <Badge variant="outline" className="bg-orange-500/10 text-orange-600">
                  Issues: {diagnostics.issuesCount}
                </Badge>
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600">
                  Unidentified: {diagnostics.unidentifiedCount}
                </Badge>
                <Badge variant="outline" className="bg-purple-500/10 text-purple-600">
                  Not In Roster: {diagnostics.notInRosterCount}
                </Badge>
              </div>
            </div>

            <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
              <div>Roster count: {diagnostics.rosterCount}</div>
              <div>Unique matched ERP: {diagnostics.uniqueMatchedErpCount}</div>
              <div>Duplicate ERP matches: {diagnostics.duplicateMatchedErpCount}</div>
              <div>Attendance rows: {diagnostics.attendanceRowCount}</div>
              <div>Issues: {diagnostics.issuesCount}</div>
              <div>Unidentified: {diagnostics.unidentifiedCount}</div>
            </div>

            {diagnostics.integrityWarnings.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <p className="mb-2 font-semibold text-amber-700">Integrity warnings</p>
                <ul className="list-disc space-y-1 pl-5 text-amber-700">
                  {diagnostics.integrityWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="mb-6 h-auto w-full justify-start overflow-x-auto bg-muted/20 p-1">
                {step === 'review' ? (
                  <>
                    <TabsTrigger value="matches">Matches</TabsTrigger>
                    <TabsTrigger value="issues">Issues</TabsTrigger>
                    <TabsTrigger value="unidentified">Unidentified</TabsTrigger>
                    <TabsTrigger value="raw">Raw Zoom Log</TabsTrigger>
                  </>
                ) : (
                  <>
                    <TabsTrigger value="attendance">Attendance</TabsTrigger>
                    <TabsTrigger value="absent">Absent</TabsTrigger>
                    <TabsTrigger value="penalties">Penalties</TabsTrigger>
                    <TabsTrigger value="matches">Matches</TabsTrigger>
                    <TabsTrigger value="issues">Issues</TabsTrigger>
                    <TabsTrigger value="unidentified">Unidentified</TabsTrigger>
                    <TabsTrigger value="raw">Raw Zoom Log</TabsTrigger>
                  </>
                )}
              </TabsList>

              <TabsContent value="matches" className="animate-fade-in">
                {renderTable(normalizedRows.matchesRows)}
              </TabsContent>
              <TabsContent value="issues" className="animate-fade-in">
                <div className="space-y-4">
                  {diagnostics.notInRosterCount > 0 && (
                    <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3 text-sm">
                      <p className="font-semibold text-purple-700">Students not in roster ({diagnostics.notInRosterCount})</p>
                      <div className="mt-2 max-h-32 space-y-1 overflow-auto font-mono text-xs">
                        {normalizedRows.notInRosterIssues.slice(0, 30).map((item) => (
                          <div key={item.id}>
                            {item.erpCandidate || 'N/A'} - {item.name || 'Unknown'}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {renderTable(normalizedRows.issuesRows)}
                </div>
              </TabsContent>
              <TabsContent value="unidentified" className="animate-fade-in">
                {renderUnidentifiedRows()}
              </TabsContent>
              <TabsContent value="raw" className="animate-fade-in">
                {renderTable(normalizedRows.rawRows, true)}
              </TabsContent>

              {step === 'results' && (
                <>
                  <TabsContent value="attendance" className="animate-fade-in">
                    {renderTable(normalizedRows.attendanceRows)}
                  </TabsContent>
                  <TabsContent value="absent" className="animate-fade-in">
                    {renderAbsentTable(normalizedRows.absentRows)}
                  </TabsContent>
                  <TabsContent value="penalties" className="animate-fade-in">
                    <div className="space-y-4">
                      <div className="grid gap-3 rounded-xl border border-primary/10 bg-muted/20 p-4 md:grid-cols-[220px_1fr_auto] md:items-end">
                        <div className="space-y-2">
                          <Label>Session for Penalty Apply</Label>
                          <Select value={penaltySessionId} onValueChange={setPenaltySessionId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select session" />
                            </SelectTrigger>
                            <SelectContent>
                              {sessions.map((session) => (
                                <SelectItem key={session.id} value={session.id}>
                                  Session {session.session_number}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={selectAllPenaltyCandidates}>
                            Select all
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={clearAllPenaltyCandidates}>
                            Clear all
                          </Button>
                          <Badge variant="outline" className="bg-primary/10 text-primary">
                            Selected: {selectedPenaltyCount}
                          </Badge>
                        </div>

                        <Button
                          type="button"
                          onClick={handleApplySelectedPenalties}
                          disabled={isApplyingPenalties || normalizedRows.penaltyCandidates.length === 0}
                          className="gap-2"
                        >
                          {isApplyingPenalties ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
                          Apply Selected Penalties
                        </Button>
                      </div>

                      {missingAttendanceErps.length > 0 && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700">
                          <p className="font-semibold">Attendance is missing for selected ERP(s)</p>
                          <p className="mt-1">Mark attendance for this session first, then retry penalty apply.</p>
                          <div className="mt-2 max-h-24 overflow-auto font-mono text-xs">{missingAttendanceErps.join(', ')}</div>
                        </div>
                      )}

                      {normalizedRows.penaltyCandidates.length === 0 ? (
                        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                          No penalty candidates found.
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-xl border border-border">
                          <div className="max-h-[560px] overflow-x-auto">
                            <Table>
                              <TableHeader className="sticky top-0 z-10 bg-muted/50 backdrop-blur-md">
                                <TableRow>
                                  <TableHead className="w-14">Pick</TableHead>
                                  <TableHead>ERP</TableHead>
                                  <TableHead>Name</TableHead>
                                  <TableHead>Class</TableHead>
                                  <TableHead>Reason</TableHead>
                                  <TableHead>Raw</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {normalizedRows.penaltyCandidates.map((candidate) => (
                                  <TableRow key={candidate.key} className={!candidate.canApply ? 'opacity-60' : ''}>
                                    <TableCell>
                                      <Checkbox
                                        checked={selectedPenaltyKeys.has(candidate.key)}
                                        onCheckedChange={(checked) => togglePenaltyCandidate(candidate.key, checked as boolean)}
                                        disabled={!candidate.canApply}
                                      />
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{candidate.erp || 'N/A'}</TableCell>
                                    <TableCell>{candidate.name || 'Unknown'}</TableCell>
                                    <TableCell>{candidate.classNo || '-'}</TableCell>
                                    <TableCell className="text-xs">{candidate.reason}</TableCell>
                                    <TableCell>
                                      <details>
                                        <summary className="cursor-pointer text-xs text-primary">View</summary>
                                        <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(candidate.raw, null, 2)}</pre>
                                      </details>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}

                      {normalizedRows.penaltiesRows.length > 0 && (
                        <div className="rounded-lg border border-border p-3">
                          <p className="mb-2 text-sm font-semibold">Original penalties output (raw table)</p>
                          {renderTable(normalizedRows.penaltiesRows)}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </>
              )}
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
