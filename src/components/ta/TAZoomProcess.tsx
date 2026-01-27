import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileSpreadsheet, Loader2, Upload, AlertCircle, CheckCircle2, Search, Filter, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';
import { Checkbox } from '@/components/ui/checkbox';

interface ProcessedData {
    attendance_rows: any[];
    issues_rows: any[];
    absent_rows: any[];
    penalties_rows: any[];
    matches_rows: any[];
    raw_rows: any[];
    total_class_minutes: number;
    effective_threshold_minutes: number;
    rows: number;
}

export default function TAZoomProcess() {
    const [data, setData] = useState<ProcessedData | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeTab, setActiveTab] = useState('matches');

    // Workflow State
    const [step, setStep] = useState<'upload' | 'review' | 'results'>('upload');

    // Input State
    const [zoomFile, setZoomFile] = useState<File | null>(null);
    const [rosterFile, setRosterFile] = useState<File | null>(null);
    const [useSavedRoster, setUseSavedRoster] = useState(true);
    const [manualDuration, setManualDuration] = useState('');
    const [namazBreak, setNamazBreak] = useState('');

    // Filter State
    const [filterName, setFilterName] = useState('');
    const [filterErp, setFilterErp] = useState('');
    const [filterClass, setFilterClass] = useState('');

    // Ignored Keys State (for Absent tab) - uses Key field which is unique per student
    const [ignoredKeys, setIgnoredKeys] = useState<Set<string>>(new Set());

    const toggleIgnoreKey = (key: string) => {
        setIgnoredKeys(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) {
                newSet.delete(key);
            } else {
                newSet.add(key);
            }
            return newSet;
        });
    };

    const copyAbsentErps = () => {
        if (!data?.absent_rows) return;
        const erps = data.absent_rows
            .filter(row => {
                const key = String(row.Key || '');
                const erp = String(row.ERP || '');
                return erp && /^\d{5}$/.test(erp) && !ignoredKeys.has(key);
            })
            .map(row => row.ERP);

        navigator.clipboard.writeText(erps.join('\n'));
        toast.success(`Copied ${erps.length} ERPs to clipboard`);
    };

    const fetchSavedRosterBlob = async (): Promise<Blob | null> => {
        try {
            // First check if user is authenticated
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

            if (sessionError) {
                console.error("Session Error:", sessionError);
                throw new Error("Authentication error: " + sessionError.message);
            }

            if (!sessionData?.session) {
                throw new Error("Not authenticated. Please log in again.");
            }

            console.log("Fetching roster for user:", sessionData.session.user.email);

            const { data: students, error } = await supabase
                .from('students_roster')
                .select('class_no, student_name, erp');

            if (error) {
                console.error("Supabase Query Error:", error);
                // Check for RLS/permission errors
                if (error.code === 'PGRST301' || error.message.includes('permission')) {
                    throw new Error("Permission denied. You may not have TA access.");
                }
                throw new Error("Database query failed: " + error.message);
            }

            console.log("Roster query result:", students?.length ?? 0, "students found");

            if (!students || students.length === 0) {
                throw new Error("No students found in saved roster. Please upload a roster first in Roster Management.");
            }

            // Map to standard headers expected by backend/core.py
            const mappedStudents = students.map(s => ({
                "Class No": s.class_no,
                "Name": s.student_name,
                "ERP": s.erp
            }));

            // Create worksheet
            const ws = XLSX.utils.json_to_sheet(mappedStudents);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Roster");

            // Write to buffer
            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        } catch (err: any) {
            console.error("Error fetching roster:", err);
            toast.error("Failed to load saved roster", { description: err.message });
            return null;
        }
    };

    const processFile = async (targetStep: 'review' | 'results') => {
        if (!zoomFile) {
            toast.error("Please select a Zoom CSV file first.");
            return;
        }

        setIsProcessing(true);
        const loadingToast = toast.loading(targetStep === 'review' ? 'Analyzing Matches...' : 'Generating Attendance...');

        try {
            const formData = new FormData();
            formData.append('file', zoomFile);
            formData.append('threshold', '0.8');

            // Add optional fields
            if (manualDuration) formData.append('manual_duration', manualDuration);
            if (namazBreak) formData.append('namaz_break', namazBreak);

            if (useSavedRoster) {
                const rosterBlob = await fetchSavedRosterBlob();
                if (rosterBlob) {
                    formData.append('roster', rosterBlob, 'saved_roster.xlsx');
                } else {
                    throw new Error("Could not load saved roster.");
                }
            } else if (rosterFile) {
                formData.append('roster', rosterFile);
            }

            // Use Vite proxy in dev, or env URL in production
            const apiUrl = import.meta.env.VITE_ZOOM_API_URL;
            const endpoint = import.meta.env.DEV ? '/api/process' : `${apiUrl}/api/process`;

            console.log("=== API DEBUG ===");
            console.log("Mode:", import.meta.env.DEV ? "Development (using Vite proxy)" : "Production");
            console.log("API endpoint:", endpoint);
            console.log("FormData entries:", [...formData.entries()].map(([k, v]) => `${k}: ${typeof v === 'object' ? (v as File).name : v}`));

            let response: Response;
            try {
                response = await fetch(endpoint, {
                    method: 'POST',
                    body: formData,
                });
            } catch (fetchError: any) {
                console.error("Network/CORS Error:", fetchError);
                throw new Error(`Network error: ${fetchError.message}. Check if Flask server is running.`);
            }

            console.log("Response status:", response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Server error response:", errorText);
                throw new Error(`Server error (${response.status}): ${errorText}`);
            }

            const result = await response.json();
            console.log("API Result received:", Object.keys(result));
            setData(result);
            setStep(targetStep);

            // Set appropriate tab
            if (targetStep === 'review') {
                setActiveTab('matches');
            } else {
                setActiveTab('attendance');
            }

            toast.dismiss(loadingToast);
            toast.success(targetStep === 'review' ? 'Analysis Complete' : 'Attendance Generated');
        } catch (error: any) {
            console.error("=== PROCESSING ERROR ===", error);
            toast.dismiss(loadingToast);
            toast.error('Processing Failed', { description: error.message });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleZoomFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setZoomFile(e.target.files[0]);
            // Reset input
            e.target.value = '';
            // Reset step to upload if file changes to force re-analysis
            setStep('upload');
            setData(null);
        }
    };

    const renderTable = (rows: any[], isRaw = false) => {
        if (!rows || rows.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
                    <p>No data available for this sheet.</p>
                </div>
            );
        }

        // Filter Logic
        const filteredRows = rows.filter(row => {
            const nameMatch = filterName ? String(row['Name'] || row['RosterName'] || row['Student Name'] || '').toLowerCase().includes(filterName.toLowerCase()) : true;
            const erpMatch = filterErp ? String(row['ERP'] || '').includes(filterErp) : true;
            // Helper to find class no if the key varies
            const classVal = row['Class No'] || row['Class'] || '';
            const classMatch = filterClass ? String(classVal).toLowerCase().includes(filterClass.toLowerCase()) : true;

            return nameMatch && erpMatch && classMatch;
        });

        if (filteredRows.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Filter className="w-12 h-12 mb-4 opacity-20" />
                    <p>No rows match filters.</p>
                </div>
            );
        }

        // Exact Column Ordering Logic
        let headers = Object.keys(rows[0]);
        if (!isRaw) {
            // Prioritize ERP, Name, then others
            // The user wants "same exact order as python app".
            // Python app attendance rows: Key, ERP, Name, Zoom Names(raw), Attended Mins...
            const priority = ['Key', 'ERP', 'Name', 'Student Name', 'RosterName', 'Email'];

            headers.sort((a, b) => {
                const aIdx = priority.indexOf(a);
                const bIdx = priority.indexOf(b);

                // If both are priority, sort by priority index
                if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
                // If only a is priority, it comes first
                if (aIdx !== -1) return -1;
                // If only b is priority, it comes first
                if (bIdx !== -1) return 1;
                // Otherwise keep original order if possible, or alphabetical?
                // Actually Object.keys order is not guaranteed. 
                // Let's rely on backend order mostly, but force ERP/Name to front.
                return 0;
            });

            // Re-enforce ERP/Name at very start just in case
            const front = ['ERP', 'Name'];
            const startCols: string[] = [];
            const otherCols: string[] = [];
            headers.forEach(h => {
                if (front.includes(h)) startCols.push(h);
                else otherCols.push(h);
            });
            startCols.sort((a, b) => front.indexOf(a) - front.indexOf(b));
            headers = [...startCols, ...otherCols];
        }

        return (
            <div className="space-y-4">
                {/* Filter Bar (Only show for result tables) */}
                {!isRaw && (
                    <div className="flex flex-wrap gap-4 items-center p-4 rounded-xl bg-muted/30 border border-primary/5">
                        <div className="flex items-center gap-2">
                            <Filter className="w-4 h-4 text-primary" />
                            <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Filters</span>
                        </div>
                        <div className="h-6 w-[1px] bg-border" />
                        <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground">Class</Label>
                            <Input className="h-8 w-20 text-xs" placeholder="All" value={filterClass} onChange={(e) => setFilterClass(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground">ERP</Label>
                            <Input className="h-8 w-24 text-xs" placeholder="Search" value={filterErp} onChange={(e) => setFilterErp(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground">Name</Label>
                            <Input className="h-8 w-32 text-xs" placeholder="Search" value={filterName} onChange={(e) => setFilterName(e.target.value)} />
                        </div>
                        {(filterClass || filterErp || filterName) && (
                            <Button variant="ghost" size="sm" className="h-8 px-2 mt-5 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => { setFilterClass(''); setFilterErp(''); setFilterName(''); }}>Clear</Button>
                        )}
                    </div>
                )}

                <div className="rounded-xl border border-border overflow-hidden">
                    <div className="overflow-x-auto max-h-[600px]">
                        <Table>
                            <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur-md">
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
                                    <TableRow key={idx} className="hover:bg-muted/50 transition-colors">
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
                <div className="text-xs text-muted-foreground text-right">Showing {filteredRows.length} rows</div>
            </div>
        );
    };

    // Custom renderer for Absent tab with Ignore checkboxes
    const renderAbsentTable = (rows: any[]) => {
        if (!rows || rows.length === 0) {
            return <div className="p-8 text-center text-muted-foreground">No absent students</div>;
        }

        let headers = Object.keys(rows[0] || {});
        const front = ['ERP', 'Name', 'Class No', 'Zoom Names (raw)'];
        const startCols: string[] = [];
        const otherCols: string[] = [];
        headers.forEach(h => {
            if (front.includes(h)) startCols.push(h);
            else otherCols.push(h);
        });
        startCols.sort((a, b) => front.indexOf(a) - front.indexOf(b));
        headers = [...startCols, ...otherCols];

        // Apply filters
        let filteredRows = rows;
        if (filterClass) {
            filteredRows = filteredRows.filter(r => String(r['Class No'] || '').toLowerCase().includes(filterClass.toLowerCase()));
        }
        if (filterErp) {
            filteredRows = filteredRows.filter(r => String(r.ERP || '').includes(filterErp));
        }
        if (filterName) {
            filteredRows = filteredRows.filter(r => String(r.Name || '').toLowerCase().includes(filterName.toLowerCase()));
        }

        const nonIgnoredCount = filteredRows.filter(r => !ignoredKeys.has(String(r.Key || ''))).length;

        return (
            <div className="space-y-4">
                {/* Action Bar */}
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-primary/5">
                    <div className="flex items-center gap-4">
                        <span className="text-sm font-medium">
                            <span className="text-red-500">{filteredRows.length}</span> absent •
                            <span className="text-yellow-500 ml-1">{ignoredKeys.size}</span> ignored •
                            <span className="text-green-500 ml-1">{nonIgnoredCount}</span> to copy
                        </span>
                    </div>
                    <Button onClick={copyAbsentErps} variant="outline" size="sm" className="gap-2">
                        <Copy className="w-4 h-4" />
                        Copy Absent ERPs
                    </Button>
                </div>

                {/* Filter Bar */}
                <div className="flex flex-wrap gap-4 items-center p-4 rounded-xl bg-muted/30 border border-primary/5">
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-primary" />
                        <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Filters</span>
                    </div>
                    <div className="h-6 w-[1px] bg-border" />
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground">Class</Label>
                        <Input className="h-8 w-20 text-xs" placeholder="All" value={filterClass} onChange={(e) => setFilterClass(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground">ERP</Label>
                        <Input className="h-8 w-24 text-xs" placeholder="Search" value={filterErp} onChange={(e) => setFilterErp(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground">Name</Label>
                        <Input className="h-8 w-32 text-xs" placeholder="Search" value={filterName} onChange={(e) => setFilterName(e.target.value)} />
                    </div>
                    {(filterClass || filterErp || filterName) && (
                        <Button variant="ghost" size="sm" className="h-8 px-2 mt-5 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => { setFilterClass(''); setFilterErp(''); setFilterName(''); }}>Clear</Button>
                    )}
                </div>

                {/* Table with Ignore Column */}
                <div className="rounded-xl border border-border overflow-hidden">
                    <div className="overflow-x-auto max-h-[600px]">
                        <Table>
                            <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur-md">
                                <TableRow>
                                    <TableHead className="whitespace-nowrap font-bold text-foreground w-16">Ignore</TableHead>
                                    {headers.map((header) => (
                                        <TableHead key={header} className="whitespace-nowrap font-bold text-foreground">
                                            {header}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredRows.map((row, idx) => {
                                    const key = String(row.Key || '');
                                    const isIgnored = ignoredKeys.has(key);
                                    return (
                                        <TableRow key={idx} className={`hover:bg-muted/50 transition-colors ${isIgnored ? 'opacity-50 bg-muted/20' : ''}`}>
                                            <TableCell className="w-16">
                                                <Checkbox
                                                    checked={isIgnored}
                                                    onCheckedChange={() => toggleIgnoreKey(key)}
                                                    className="data-[state=checked]:bg-yellow-500 data-[state=checked]:border-yellow-500"
                                                />
                                            </TableCell>
                                            {headers.map((header) => (
                                                <TableCell key={`${idx}-${header}`} className={`whitespace-nowrap font-mono text-xs ${isIgnored ? 'line-through' : ''}`}>
                                                    {String(row[header] ?? '')}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </div>
                <div className="text-xs text-muted-foreground text-right">Showing {filteredRows.length} rows</div>
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <div className="space-y-1">
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground uppercase">Zoom Processor</h1>
                <p className="text-muted-foreground">Upload Zoom Logs → Match Roster → Generate Attendance.</p>
            </div>

            {/* STEP 1: UPLOAD & MATCH */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="glass-card border-primary/10 md:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold">1</div>
                            Upload & Match
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs uppercase font-bold text-muted-foreground">Zoom Log</Label>
                                <div className="relative">
                                    <input type="file" accept=".csv" className="hidden" id="main-zoom-upload" onChange={handleZoomFileChange} disabled={isProcessing} />
                                    <Label htmlFor="main-zoom-upload" className={`flex flex-col items-center justify-center gap-2 bg-primary/5 border-2 border-dashed border-primary/20 hover:bg-primary/10 text-foreground px-4 py-6 rounded-xl font-bold uppercase tracking-wider cursor-pointer transition-all ${zoomFile ? 'border-primary bg-primary/10' : ''}`}>
                                        {zoomFile ? (
                                            <>
                                                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center"><CheckCircle2 className="w-5 h-5" /></div>
                                                <span className="text-xs truncate max-w-[150px]">{zoomFile.name}</span>
                                            </>
                                        ) : (
                                            <>
                                                <Upload className="w-6 h-6 text-primary/50" />
                                                <span className="text-xs">Select CSV</span>
                                            </>
                                        )}
                                    </Label>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between mb-2">
                                    <Label className="text-xs uppercase font-bold text-muted-foreground">Roster</Label>
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor="saved-roster" className="text-[10px] cursor-pointer">Use Saved</Label>
                                        <Switch id="saved-roster" checked={useSavedRoster} onCheckedChange={(v) => { setUseSavedRoster(v); setStep('upload'); }} className="scale-75" />
                                    </div>
                                </div>
                                <div className="relative h-full">
                                    {useSavedRoster ? (
                                        <div className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-primary/20 bg-primary/5 text-primary px-4 py-6 rounded-xl font-bold uppercase tracking-wider h-[100px]">
                                            <CheckCircle2 className="w-5 h-5" />
                                            <span className="text-xs">Using Saved Roster</span>
                                        </div>
                                    ) : (
                                        <>
                                            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" id="roster-upload" onChange={(e) => { setRosterFile(e.target.files?.[0] || null); setStep('upload'); }} disabled={isProcessing || useSavedRoster} />
                                            <Label htmlFor="roster-upload" className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed border-muted-foreground/20 text-muted-foreground px-4 py-6 rounded-xl font-bold uppercase tracking-wider cursor-pointer hover:bg-muted/50 transition-all h-[100px] ${rosterFile ? 'border-primary/50 text-primary bg-primary/5' : ''}`}>
                                                {rosterFile ? (
                                                    <><CheckCircle2 className="w-5 h-5" /><span className="text-xs truncate max-w-[150px]">{rosterFile.name}</span></>
                                                ) : (
                                                    <><FileSpreadsheet className="w-5 h-5 opacity-50" /><span className="text-xs">Select Roster</span></>
                                                )}
                                            </Label>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {zoomFile && step === 'upload' && (
                            <Button className="w-full h-12 text-sm font-bold tracking-wider uppercase" onClick={() => processFile('review')} disabled={isProcessing}>
                                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                                Analyze & Match Roster
                            </Button>
                        )}
                    </CardContent>
                </Card>

                {/* STEP 2: PARAMETERS (Only visible after match) */}
                <Card className={`glass-card border-primary/10 ${step === 'upload' ? 'opacity-50 pointer-events-none' : ''}`}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold">2</div>
                            Parameters
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Custom Duration (mins)</Label>
                            <Input type="number" placeholder="Auto" value={manualDuration} onChange={(e) => setManualDuration(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Namaz Break (mins)</Label>
                            <Input type="number" placeholder="0" value={namazBreak} onChange={(e) => setNamazBreak(e.target.value)} />
                        </div>
                        <Button className="w-full mt-4" variant={step === 'results' ? "outline" : "default"} onClick={() => processFile('results')} disabled={isProcessing || step === 'upload'}>
                            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                            {step === 'results' ? 'Update Results' : 'Calculate Attendance'}
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* RESULTS SECTION */}
            {data && (
                <Card className="glass-card border-primary/10 animate-fade-in shadow-2xl">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="uppercase tracking-wide">{step === 'review' ? 'Match Review' : 'Final Results'}</CardTitle>
                                <CardDescription>
                                    {data.rows} records processed. {step === 'review' && 'Review matches before finalizing.'}
                                </CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <span className="px-3 py-1 rounded-full bg-green-500/10 text-green-500 text-xs font-mono font-bold">
                                    Matches: {data.matches_rows.length}
                                </span>
                                <span className="px-3 py-1 rounded-full bg-red-500/10 text-red-500 text-xs font-mono font-bold">
                                    Issues: {data.issues_rows.length}
                                </span>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 mb-6 bg-muted/20">
                                {step === 'review' ? (
                                    <>
                                        <TabsTrigger value="matches">Matches</TabsTrigger>
                                        <TabsTrigger value="issues">Issues</TabsTrigger>
                                        <TabsTrigger value="raw">Raw Zoom Log</TabsTrigger>
                                    </>
                                ) : (
                                    <>
                                        <TabsTrigger value="attendance">Attendance</TabsTrigger>
                                        <TabsTrigger value="absent">Absent</TabsTrigger>
                                        <TabsTrigger value="penalties">Penalties</TabsTrigger>
                                        <TabsTrigger value="matches">Matches</TabsTrigger>
                                        <TabsTrigger value="issues">Issues</TabsTrigger>
                                        <TabsTrigger value="raw">Raw Zoom Log</TabsTrigger>
                                    </>
                                )}
                            </TabsList>

                            <TabsContent value="matches" className="animate-fade-in">{renderTable(data.matches_rows)}</TabsContent>
                            <TabsContent value="issues" className="animate-fade-in">{renderTable(data.issues_rows)}</TabsContent>
                            <TabsContent value="raw" className="animate-fade-in">{renderTable(data.raw_rows, true)}</TabsContent>

                            {step === 'results' && (
                                <>
                                    <TabsContent value="attendance" className="animate-fade-in">{renderTable(data.attendance_rows)}</TabsContent>
                                    <TabsContent value="absent" className="animate-fade-in">{renderAbsentTable(data.absent_rows)}</TabsContent>
                                    <TabsContent value="penalties" className="animate-fade-in">{renderTable(data.penalties_rows)}</TabsContent>
                                </>
                            )}
                        </Tabs>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
