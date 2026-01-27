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
    total_class_minutes: number;
    effective_threshold_minutes: number;
    rows: number;
}

export default function TAZoomProcess() {
    const [data, setData] = useState<ProcessedData | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [activeTab, setActiveTab] = useState('attendance');

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
            // Default threshold
            formData.append('threshold', '0.8');

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

    const renderTable = (rows: any[]) => {
        if (!rows || rows.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
                    <p>No data available for this sheet.</p>
                </div>
            );
        }

        const headers = Object.keys(rows[0]);

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

            <Card className="glass-card border-primary/10">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5 text-primary" />
                        Upload Log
                    </CardTitle>
                    <CardDescription>Select the CSV file downloaded from Zoom.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
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
                                className={`flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl font-bold uppercase tracking-wider cursor-pointer hover:bg-primary/90 transition-all active:scale-95 shadow-lg shadow-primary/20 ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                {isUploading ? 'Processing...' : 'Select CSV'}
                            </Label>
                        </div>
                    </div>
                </CardContent>
            </Card>

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
                        </Tabs>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
