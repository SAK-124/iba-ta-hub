import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ta/ui/card';
import { Button } from '@/components/ta/ui/button';
import { Label } from '@/components/ta/ui/label';
import { Input } from '@/components/ta/ui/input';
import { Switch } from '@/components/ta/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ta/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ta/ui/table';
import { Checkbox } from '@/components/ta/ui/checkbox';
import { Badge } from '@/components/ta/ui/badge';
import {
  FileSpreadsheet,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Search,
  Filter,
  Copy,
  Download,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { subscribeRosterDataUpdated } from '@/lib/data-sync-events';
import { cn } from '@/lib/utils';
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
  filterQuery: string;
  filterClass: string;
  penaltiesMinusOneOnly: boolean;
  ignoredKeys: string[];
  filterName?: string;
  filterErp?: string;
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

const downloadJson = (filename: string, data: unknown) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const normalizeHeaderKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

const extractPenaltyAppliedValue = (row: GenericRow): unknown => {
  const direct = pickFirst(row, [
    'Penalty Applied',
    'penalty applied',
    'penalty_applied',
    'PenaltyApplied',
    'Penalty Applied (naming)',
    'Naming Penalty',
  ]);

  if (toText(direct) !== '') {
    return direct;
  }

  for (const [key, value] of Object.entries(row)) {
    const normalized = normalizeHeaderKey(key);
    if (normalized === 'penaltyapplied' || (normalized.includes('penalty') && normalized.includes('applied'))) {
      if (toText(value) !== '') return value;
    }
  }

  return undefined;
};

const hasMinusOnePenaltyApplied = (row: GenericRow) => {
  const value = extractPenaltyAppliedValue(row);
  const text = toText(value);
  if (!text) return false;

  if (text.replace(/\s+/g, '') === '-1') return true;
  const numeric = Number(text);
  return Number.isFinite(numeric) && numeric === -1;
};

const rowToSearchText = (row: GenericRow) =>
  Object.values(row)
    .map((value) => toText(value))
    .join(' ')
    .toLowerCase();

export default function TAZoomProcess() {
  const cached = zoomWorkspaceCache;

  const [data, setData] = useState<ProcessedData | null>(() => cached?.data ?? null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcDots, setCalcDots] = useState(0);
  const [activeTab, setActiveTab] = useState(() => cached?.activeTab ?? 'matches');

  const [step, setStep] = useState<'upload' | 'review' | 'results'>(() => cached?.step ?? 'upload');

  const [zoomFile, setZoomFile] = useState<File | null>(() => cached?.zoomFile ?? null);
  const [rosterFile, setRosterFile] = useState<File | null>(() => cached?.rosterFile ?? null);
  const [useSavedRoster, setUseSavedRoster] = useState(() => cached?.useSavedRoster ?? true);
  const [manualDuration, setManualDuration] = useState(() => cached?.manualDuration ?? '');
  const [namazBreak, setNamazBreak] = useState(() => cached?.namazBreak ?? '');

  const [filterQuery, setFilterQuery] = useState(() => {
    const cachedQuery = cached?.filterQuery?.trim();
    if (cachedQuery) return cachedQuery;

    const legacyQuery = [cached?.filterErp, cached?.filterName]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .trim();

    return legacyQuery;
  });
  const [filterClass, setFilterClass] = useState(() => cached?.filterClass ?? '');
  const [penaltiesMinusOneOnly, setPenaltiesMinusOneOnly] = useState(() => cached?.penaltiesMinusOneOnly ?? false);

  const [ignoredKeys, setIgnoredKeys] = useState<Set<string>>(() => new Set(cached?.ignoredKeys ?? []));
  const [rosterReference, setRosterReference] = useState<Record<string, RosterReference>>({});

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

  const loadReferenceData = async () => {
    const rosterRes = await supabase.from('students_roster').select('erp, student_name, class_no');

    if (rosterRes.error) {
      toast.error(`Failed to load roster reference: ${rosterRes.error.message}`);
      return;
    }

    const map: Record<string, RosterReference> = {};
    for (const row of (rosterRes.data || []) as RosterReference[]) {
      map[row.erp] = row;
    }
    setRosterReference(map);
  };

  useEffect(() => {
    void loadReferenceData();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeRosterDataUpdated(() => {
      void loadReferenceData();
    });

    return unsubscribe;
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
      filterQuery,
      filterClass,
      penaltiesMinusOneOnly,
      ignoredKeys: Array.from(ignoredKeys),
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
    filterQuery,
    filterClass,
    penaltiesMinusOneOnly,
    ignoredKeys,
  ]);

  useEffect(() => {
    setIgnoredKeys(new Set());
  }, [data]);

  useEffect(() => {
    if (!isCalculating) {
      setCalcDots(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setCalcDots((prev) => (prev + 1) % 4);
    }, 300);

    return () => window.clearInterval(intervalId);
  }, [isCalculating]);

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

    return {
      attendanceRows,
      issuesRows,
      absentRows,
      penaltiesRows,
      matchesRows,
      rawRows,
      issues,
      unidentifiedIssues: issues.filter((issue) => issue.unidentified),
      notInRosterIssues: issues.filter((issue) => issue.notInRoster),
    };
  }, [data, rosterErpSet]);

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

    const fromCalculateButton = targetStep === 'results';
    if (fromCalculateButton) {
      setIsCalculating(true);
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

      toast.dismiss(loadingToast);
      toast.success(targetStep === 'review' ? 'Match analysis complete' : 'Attendance generated');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown processing failure';
      console.error('[Zoom Process] Processing failed:', error);
      toast.dismiss(loadingToast);
      toast.error('Processing failed', { description: message });
    } finally {
      setIsProcessing(false);
      if (fromCalculateButton) {
        setIsCalculating(false);
      }
    }
  };

  const handleZoomFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.[0]) return;

    setZoomFile(event.target.files[0]);
    event.target.value = '';
    setStep('upload');
    setData(null);
  };

  const renderTable = (
    rows: GenericRow[],
    options?: { isRaw?: boolean; searchMode?: 'erp_and_name' | 'full_row'; showMinusOneOnly?: boolean }
  ) => {
    const isRaw = options?.isRaw ?? false;
    const searchMode = options?.searchMode ?? 'erp_and_name';
    const showMinusOneOnly = options?.showMinusOneOnly ?? false;

    if (rows.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <AlertCircle className="mb-4 h-12 w-12 opacity-20" />
          <p>No data available for this sheet.</p>
        </div>
      );
    }

    const filteredRows = rows.filter((row) => {
      const classNo = extractClassNo(row).toLowerCase();
      const query = filterQuery.trim().toLowerCase();
      const searchableText =
        searchMode === 'full_row' ? rowToSearchText(row) : `${extractERP(row)} ${extractName(row)}`.toLowerCase();

      const queryMatch = query ? searchableText.includes(query) : true;
      const classMatch = filterClass ? classNo.includes(filterClass.toLowerCase()) : true;
      const minusOneMatch = showMinusOneOnly && penaltiesMinusOneOnly ? hasMinusOnePenaltyApplied(row) : true;

      return queryMatch && classMatch && minusOneMatch;
    });

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

    const hasActiveFilters = Boolean(filterClass.trim() || filterQuery.trim() || (showMinusOneOnly && penaltiesMinusOneOnly));

    return (
      <div className="space-y-4">
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
            <Label className="text-[10px] uppercase text-muted-foreground">Search</Label>
            <Input
              className="h-8 w-40 text-xs"
              placeholder="Search ERP or Name"
              value={filterQuery}
              onChange={(event) => setFilterQuery(event.target.value)}
            />
          </div>
          {showMinusOneOnly && (
            <label className="mt-5 flex h-8 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 text-xs">
              <Checkbox
                checked={penaltiesMinusOneOnly}
                onCheckedChange={(checked) => setPenaltiesMinusOneOnly(Boolean(checked))}
              />
              <span>Only -1 applied</span>
            </label>
          )}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-5 h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                setFilterClass('');
                setFilterQuery('');
                if (showMinusOneOnly) setPenaltiesMinusOneOnly(false);
              }}
            >
              Clear
            </Button>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-border">
          <div className="max-h-[600px] overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 backdrop-blur-md">
                <TableRow>
                  {headers.map((header) => (
                    <TableHead key={header} className="whitespace-nowrap font-bold">
                      {header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={headers.length} className="h-40">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <Filter className="mb-3 h-8 w-8 opacity-20" />
                        <p>No rows match filters.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row, idx) => (
                    <TableRow key={getRowKey(row, idx)} className="transition-colors">
                      {headers.map((header) => (
                        <TableCell key={`${idx}-${header}`} className="whitespace-nowrap font-mono text-xs">
                          {String(row[header] ?? '')}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
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
      const query = filterQuery.trim().toLowerCase();
      const searchMatch = query ? `${extractERP(row)} ${extractName(row)}`.toLowerCase().includes(query) : true;
      return classMatch && searchMatch;
    });

    const nonIgnoredCount = filteredRows.filter((row, idx) => !ignoredKeys.has(getRowKey(row, idx))).length;
    const hasActiveFilters = Boolean(filterClass.trim() || filterQuery.trim());

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-primary/5 bg-muted/30 p-3">
          <div className="flex items-center gap-4 text-sm font-medium">
            <span>
              <span className="text-red-500">{filteredRows.length}</span> absent
            </span>
            <span>
              <span className="text-[#8fe1dd]">{ignoredKeys.size}</span> ignored
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
            <Label className="text-[10px] uppercase text-muted-foreground">Search</Label>
            <Input
              className="h-8 w-40 text-xs"
              placeholder="Search ERP or Name"
              value={filterQuery}
              onChange={(event) => setFilterQuery(event.target.value)}
            />
          </div>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-5 h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                setFilterClass('');
                setFilterQuery('');
              }}
            >
              Clear
            </Button>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-border">
          <div className="max-h-[600px] overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 backdrop-blur-md">
                <TableRow>
                  <TableHead className="w-16 whitespace-nowrap font-bold">Ignore</TableHead>
                  {headers.map((header) => (
                    <TableHead key={header} className="whitespace-nowrap font-bold">
                      {header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={headers.length + 1} className="h-32 text-center text-muted-foreground">
                      No rows match filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row, idx) => {
                    const key = getRowKey(row, idx);
                    const isIgnored = ignoredKeys.has(key);

                    return (
                      <TableRow key={key} className={`transition-colors ${isIgnored ? 'opacity-50' : ''}`}>
                        <TableCell className="w-16">
                          <Checkbox
                            checked={isIgnored}
                            onCheckedChange={() => toggleIgnoreKey(key)}
                            className="data-[state=checked]:border-[var(--neo-accent)] data-[state=checked]:bg-[var(--neo-accent)]"
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
                  })
                )}
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
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[rgba(0,122,118,0.35)] bg-[rgba(0,122,118,0.11)] p-3">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-[#9be6e2]" />
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
                  <Badge variant="outline" className="ta-status-chip status-all status-all-table-text">
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

  return (
    <div className="animate-fade-in space-y-8 pb-20 ta-sand-theme ta-module-shell">
      <div className="space-y-1">
        <h2 className="text-3xl font-bold tracking-tight ta-sand-text-title">Zoom Processor</h2>
        <p className="text-base ta-sand-text-secondary">Upload Zoom logs, review matches, and generate attendance.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="ta-sand-card border-0 md:col-span-2 shadow-none">
          <CardHeader className="pb-4 border-b border-[rgba(0,122,118,0.16)] mx-6 px-0 pt-6">
            <CardTitle className="flex items-center gap-3 text-[15px] font-semibold ta-sand-text-title">
              Upload & Match
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Zoom Log</Label>
                <div className="relative h-[110px]">
                  <input type="file" accept=".csv" className="hidden" id="main-zoom-upload" onChange={handleZoomFileChange} disabled={isProcessing} />
                  <Label
                    htmlFor="main-zoom-upload"
                    className={cn(
                      'ta-sand-field upload-zone absolute inset-0 flex flex-col items-center justify-center cursor-pointer overflow-hidden group transition-all duration-300',
                      zoomFile ? 'is-selected' : '',
                      isProcessing && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {zoomFile ? (
                      <div className="flex flex-col items-center gap-2 text-[var(--accent-glow)]">
                        <CheckCircle2 className="w-6 h-6" />
                        <span className="text-[13px] font-bold tracking-wide max-w-[180px] truncate">{zoomFile.name}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3 group-hover:text-[var(--accent-glow)] transition-colors text-debossed">
                        <svg className="w-6 h-6 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
                          <polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round" />
                          <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="text-[13px] font-semibold tracking-wide uppercase">Select CSV</span>
                      </div>
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
                <div className="relative h-[110px]">
                  {useSavedRoster ? (
                    <div className="ta-sand-field upload-zone is-selected absolute inset-0 flex flex-col items-center justify-center">
                      <CheckCircle2 className="w-6 h-6" />
                      <span className="text-[13px] font-bold tracking-wide max-w-[180px] truncate">Using Saved Roster</span>
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
                        className={cn(
                          'ta-sand-field upload-zone absolute inset-0 flex flex-col items-center justify-center cursor-pointer overflow-hidden group transition-all duration-300',
                          rosterFile ? 'is-selected' : '',
                          (isProcessing || useSavedRoster) && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        {rosterFile ? (
                          <div className="flex flex-col items-center gap-2 text-[var(--accent-glow)]">
                            <CheckCircle2 className="w-6 h-6" />
                            <span className="text-[13px] font-bold tracking-wide max-w-[180px] truncate">{rosterFile.name}</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-3 group-hover:text-[var(--accent-glow)] transition-colors text-debossed">
                            <FileSpreadsheet className="w-6 h-6 opacity-70" />
                            <span className="text-[13px] font-semibold tracking-wide uppercase">Select Roster</span>
                          </div>
                        )}
                      </Label>
                    </>
                  )}
                </div>
              </div>
            </div>

            {zoomFile && step === 'upload' && (
              <button
                type="button"
                className={cn(
                  'mt-8 h-[52px] w-full ta-sand-btn-primary flex items-center justify-center gap-3 text-[15px] tracking-wide uppercase',
                  isProcessing && 'opacity-50 cursor-not-allowed pointer-events-none'
                )}
                onClick={() => processFile('review')} disabled={isProcessing}
              >
                {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                Analyze Matrix
              </button>
            )}
          </CardContent>
        </Card>

        <Card className={`ta-sand-card border-0 shadow-none ${step === 'upload' ? 'pointer-events-none opacity-50' : ''}`}>
          <CardHeader className="pb-4 border-b border-[rgba(0,122,118,0.16)] mx-6 px-0 pt-6">
            <CardTitle className="flex items-center gap-3 text-[15px] font-semibold ta-sand-text-title">
              Parameters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <div className="space-y-2.5">
              <Label className="uppercase text-[11px] font-bold text-[#5f6a74] tracking-wider">Custom Duration (mins)</Label>
              <Input type="number" placeholder="Auto" value={manualDuration} onChange={(event) => setManualDuration(event.target.value)} className="ta-sand-field h-12" />
            </div>
            <div className="space-y-2.5">
              <Label className="uppercase text-[11px] font-bold text-[#5f6a74] tracking-wider">Namaz Break (mins)</Label>
              <Input type="number" placeholder="0" value={namazBreak} onChange={(event) => setNamazBreak(event.target.value)} className="ta-sand-field h-12" />
            </div>
            <button
              type="button"
              className={cn(
                'mt-8 w-full h-[52px] flex items-center justify-center gap-3 text-[15px] tracking-wide uppercase',
                isProcessing || step === 'upload'
                  ? 'ta-sand-field text-[#5f6a74] cursor-not-allowed'
                  : 'ta-sand-btn-primary'
              )}
              onClick={() => processFile('results')}
              disabled={isProcessing || step === 'upload'}
            >
              {isCalculating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
              <span>
                {isCalculating
                  ? `Analyzing Logs${'.'.repeat(calcDots)}`
                  : step === 'results'
                    ? 'Update Results'
                    : 'Calculate Attendance'}
              </span>
            </button>
          </CardContent>
        </Card>
      </div>

      {data && (
        <Card className="ta-sand-card animate-fade-in border-0 mt-8 shadow-none">
          <CardHeader className="pb-4 border-b border-[rgba(0,122,118,0.16)] mx-6 px-0 pt-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-[17px] font-semibold ta-sand-text-title">{step === 'review' ? 'Match Review' : 'Final Results'}</CardTitle>
                <CardDescription className="ta-sand-text-secondary mt-1">
                  {data.rows ?? normalizedRows.rawRows.length} records processed. {step === 'review' && 'Review matches before finalizing.'}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="ta-status-chip status-present status-present-table-text">
                  Present: {attendanceStatusCounts.present}
                </Badge>
                <Badge variant="outline" className="ta-status-chip status-absent status-absent-table-text">
                  Absent: {attendanceStatusCounts.absent}
                </Badge>
                <Badge variant="outline" className="ta-status-chip status-all status-all-table-text">
                  Issues: {diagnostics.issuesCount}
                </Badge>
                <Badge variant="outline" className="ta-status-chip status-all status-all-table-text">
                  Unidentified: {diagnostics.unidentifiedCount}
                </Badge>
                <Badge variant="outline" className="ta-status-chip status-all">
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
              <div className="mt-3 rounded-lg border border-[rgba(0,122,118,0.35)] bg-[rgba(0,122,118,0.1)] p-3 text-sm">
                <p className="mb-2 font-semibold text-[#a8f5f1]">Integrity warnings</p>
                <ul className="list-disc space-y-1 pl-5 text-[#a8f5f1]">
                  {diagnostics.integrityWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardHeader>
          <CardContent className="pt-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="mb-6 h-auto w-full justify-start overflow-x-auto ta-sand-field p-1 border border-[rgba(0,122,118,0.16)] ta-sand-scrollbar">
                {step === 'review' ? (
                  <>
                    <TabsTrigger value="matches" className="rounded-lg">Matches</TabsTrigger>
                    <TabsTrigger value="issues" className="rounded-lg">Issues</TabsTrigger>
                    <TabsTrigger value="unidentified" className="rounded-lg">Unidentified</TabsTrigger>
                    <TabsTrigger value="raw" className="rounded-lg">Raw Zoom Log</TabsTrigger>
                  </>
                ) : (
                  <>
                    <TabsTrigger value="attendance" className="rounded-lg">Attendance</TabsTrigger>
                    <TabsTrigger value="absent" className="rounded-lg">Absent</TabsTrigger>
                    <TabsTrigger value="penalties" className="rounded-lg">Penalties</TabsTrigger>
                    <TabsTrigger value="matches" className="rounded-lg">Matches</TabsTrigger>
                    <TabsTrigger value="issues" className="rounded-lg">Issues</TabsTrigger>
                    <TabsTrigger value="unidentified" className="rounded-lg">Unidentified</TabsTrigger>
                    <TabsTrigger value="raw" className="rounded-lg">Raw Zoom Log</TabsTrigger>
                  </>
                )}
              </TabsList>

              <TabsContent value="matches" className="animate-fade-in">
                {renderTable(normalizedRows.matchesRows)}
              </TabsContent>
              <TabsContent value="issues" className="animate-fade-in">
                <div className="space-y-4">
                  {diagnostics.notInRosterCount > 0 && (
                    <div className="rounded-lg border border-[rgba(0,122,118,0.24)] bg-[rgba(0,122,118,0.08)] p-3 text-sm">
                      <p className="font-semibold text-[#89c8c5]">Students not in roster ({diagnostics.notInRosterCount})</p>
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
                {renderTable(normalizedRows.rawRows, { isRaw: true, searchMode: 'full_row' })}
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
                    <div className="space-y-3">
                      <p className="text-sm font-semibold">Original penalties output (raw table)</p>
                      {renderTable(normalizedRows.penaltiesRows, {
                        isRaw: true,
                        showMinusOneOnly: true,
                      })}
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
