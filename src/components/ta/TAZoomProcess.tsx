import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileSpreadsheet, Loader2, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

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
    const [isUploading, setIsUploading] = useState(false);
    const [activeTab, setActiveTab] = useState('attendance');

    // Form State
    const [manualDuration, setManualDuration] = useState('');
    const [namazBreak, setNamazBreak] = useState('');
    const [rosterFile, setRosterFile] = useState<File | null>(null);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Reset input
        e.target.value = '';

        setIsUploading(true);
        const loadingToast = toast.loading('Processing Zoom Log...');

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('threshold', '0.8');

            // Add optional fields
            if (manualDuration) formData.append('manual_duration', manualDuration);
            if (namazBreak) formData.append('namaz_break', namazBreak);
            if (rosterFile) formData.append('roster', rosterFile);

            const apiUrl = import.meta.env.VITE_ZOOM_API_URL;

            if (!apiUrl) {
                throw new Error('API URL not configured (VITE_ZOOM_API_URL)');
            }

            const response = await fetch(`${apiUrl}/api/process`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Failed to process file on server');
            }

            const result = await response.json();
            setData(result);
            toast.dismiss(loadingToast);
            toast.success('Processed Successfully');
        } catch (error: any) {
            console.error(error);
            toast.dismiss(loadingToast);
            toast.error('Processing Failed', { description: error.message });
        } finally {
            setIsUploading(false);
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

        // Sort headers: ERP, Name, Email first
        let headers = Object.keys(rows[0]);
        if (!isRaw) {
            const priority = ['ERP', 'Name', 'RosterName', 'Email'];
            headers.sort((a, b) => {
                const aIdx = priority.indexOf(a);
                const bIdx = priority.indexOf(b);
                if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
                if (aIdx !== -1) return -1;
                if (bIdx !== -1) return 1;
                return a.localeCompare(b);
            });
        }

        return (
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
                            {rows.map((row, idx) => (
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
        );
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="space-y-1">
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground uppercase">
                    Zoom Processor
                </h1>
                <p className="text-muted-foreground">Upload raw Zoom CSV logs to generate attendance reports.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="glass-card border-primary/10 md:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileSpreadsheet className="w-5 h-5 text-primary" />
                            Upload Files
                        </CardTitle>
                        <CardDescription>Select the Zoom CSV log and an optional Roster.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            {/* Zoom Log Upload */}
                            <div className="space-y-2">
                                <Label className="text-xs uppercase font-bold text-muted-foreground">Zoom Log (Required)</Label>
                                <div className="relative">
                                    <input
                                        type="file"
                                        accept=".csv"
                                        className="hidden"
                                        id="main-zoom-upload"
                                        onChange={handleUpload}
                                        disabled={isUploading}
                                    />
                                    <Label
                                        htmlFor="main-zoom-upload"
                                        className={`flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-8 rounded-xl font-bold uppercase tracking-wider cursor-pointer hover:bg-primary/90 transition-all active:scale-95 shadow-lg shadow-primary/20 ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
                                    >
                                        {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                                        {isUploading ? 'Processing...' : 'Select Zoom CSV'}
                                    </Label>
                                </div>
                            </div>

                            {/* Roster Upload */}
                            <div className="space-y-2">
                                <Label className="text-xs uppercase font-bold text-muted-foreground">Roster (Optional)</Label>
                                <div className="relative h-full">
                                    <input
                                        type="file"
                                        accept=".xlsx,.xls,.csv"
                                        className="hidden"
                                        id="roster-upload"
                                        onChange={(e) => setRosterFile(e.target.files?.[0] || null)}
                                        disabled={isUploading}
                                    />
                                    <Label
                                        htmlFor="roster-upload"
                                        className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed border-muted-foreground/20 text-muted-foreground px-4 py-5 rounded-xl font-bold uppercase tracking-wider cursor-pointer hover:bg-muted/50 transition-all h-[88px] ${rosterFile ? 'border-primary/50 text-primary bg-primary/5' : ''}`}
                                    >
                                        {rosterFile ? (
                                            <>
                                                <CheckCircle2 className="w-5 h-5" />
                                                <span className="text-xs truncate max-w-[150px]">{rosterFile.name}</span>
                                            </>
                                        ) : (
                                            <>
                                                <FileSpreadsheet className="w-5 h-5 opacity-50" />
                                                <span className="text-xs">Select Roster</span>
                                            </>
                                        )}
                                    </Label>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Settings Card */}
                <Card className="glass-card border-primary/10">
                    <CardHeader>
                        <CardTitle className="text-lg">Settings</CardTitle>
                        <CardDescription>Optional parameters.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Custom Duration (mins)</Label>
                            <div className="relative">
                                <input
                                    type="number"
                                    placeholder="Auto"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={manualDuration}
                                    onChange={(e) => setManualDuration(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Namaz Break (mins)</Label>
                            <div className="relative">
                                <input
                                    type="number"
                                    placeholder="0"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={namazBreak}
                                    onChange={(e) => setNamazBreak(e.target.value)}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {data && (
                <Card className="glass-card border-primary/10 animate-fade-in">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Results</CardTitle>
                                <CardDescription>
                                    Processed {data.rows} records. Class duration: {data.total_class_minutes} mins.
                                </CardDescription>
                            </div>
                            <CheckCircle2 className="w-6 h-6 text-success" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 mb-6">
                                <TabsTrigger value="attendance">Attendance</TabsTrigger>
                                <TabsTrigger value="issues">Issues</TabsTrigger>
                                <TabsTrigger value="absent">Absent</TabsTrigger>
                                <TabsTrigger value="penalties">Penalties</TabsTrigger>
                                <TabsTrigger value="matches">Matches</TabsTrigger>
                                <TabsTrigger value="raw">Raw Zoom CSV</TabsTrigger>
                            </TabsList>

                            <TabsContent value="attendance" className="animate-fade-in">
                                {renderTable(data.attendance_rows)}
                            </TabsContent>
                            <TabsContent value="issues" className="animate-fade-in">
                                {renderTable(data.issues_rows)}
                            </TabsContent>
                            <TabsContent value="absent" className="animate-fade-in">
                                {renderTable(data.absent_rows)}
                            </TabsContent>
                            <TabsContent value="penalties" className="animate-fade-in">
                                {renderTable(data.penalties_rows)}
                            </TabsContent>
                            <TabsContent value="matches" className="animate-fade-in">
                                {renderTable(data.matches_rows)}
                            </TabsContent>
                            <TabsContent value="raw" className="animate-fade-in">
                                {renderTable(data.raw_rows, true)}
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
