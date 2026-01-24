import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import { Loader2, Search, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function IssueManagement() {
    const [tickets, setTickets] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterGroup, setFilterGroup] = useState<string>('all');
    const [searchErp, setSearchErp] = useState('');

    // Realtime subscription
    useEffect(() => {
        fetchTickets();

        const channel = supabase
            .channel('ta-tickets')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'tickets' },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        setTickets(prev => [payload.new, ...prev]);
                    } else if (payload.eventType === 'UPDATE') {
                        setTickets(prev => prev.map(t => t.id === payload.new.id ? payload.new : t));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchTickets = async () => {
        setIsLoading(true);
        // We need to join with students_roster to get the latest name
        // However, Supabase simple join might be tricky if no foreign key exists on erased_erp
        // But we can fetch roster data separately or try a join if FK exists. 
        // Let's assume no FK on entered_erp (it's just text). 
        // We'll fetch all tickets, then fetch all matching roster entries? Or just rely on what we have?
        // Better: Use a custom query or just fetch roster names for the ERPs we have.

        const { data: ticketsData, error } = await supabase
            .from('tickets')
            .select('*')
            .order('created_at', { ascending: false });

        if (!error && ticketsData) {
            // Fetch names for these ERPs
            const erps = [...new Set(ticketsData.map(t => t.entered_erp))];
            const { data: rosterData } = await supabase
                .from('students_roster')
                .select('erp, student_name')
                .in('erp', erps);

            const nameMap = new Map();
            rosterData?.forEach(r => nameMap.set(r.erp, r.student_name));

            const augmentedTickets = ticketsData.map(t => ({
                ...t,
                real_name: nameMap.get(t.entered_erp) || t.roster_name || 'Unknown'
            }));

            setTickets(augmentedTickets);
        }
        setIsLoading(false);
    };

    const toggleStatus = async (ticket: any) => {
        const newStatus = ticket.status === 'pending' ? 'resolved' : 'pending';
        const { error } = await supabase
            .from('tickets')
            .update({ status: newStatus })
            .eq('id', ticket.id);

        if (error) {
            toast.error('Failed to update status');
        } else {
            toast.success(`Ticket marked as ${newStatus}`);
            // Optimistic update
            setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, status: newStatus } : t));
        }
    };

    const filteredTickets = tickets.filter(t => {
        if (filterStatus !== 'all' && t.status !== filterStatus) return false;
        if (filterGroup !== 'all' && t.group_type !== filterGroup) return false;
        const erp = t.entered_erp || '';
        const name = t.real_name || t.roster_name || '';
        if (searchErp) {
            const q = searchErp.toLowerCase();
            if (!erp.toLowerCase().includes(q) && !name.toLowerCase().includes(q)) return false;
        }
        return true;
    });

    return (
        <Card className="min-h-[600px]">
            <CardHeader>
                <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                    <div>
                        <CardTitle>Issue Tracker</CardTitle>
                        <CardDescription>Manage student tickets and inquiries.</CardDescription>
                    </div>

                    <div className="flex gap-2 flex-wrap w-full md:w-auto">
                        <div className="relative w-full md:w-40">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search ERP"
                                value={searchErp}
                                onChange={e => setSearchErp(e.target.value)}
                                className="pl-8"
                            />
                        </div>

                        <div className="flex gap-2 w-full md:w-auto">
                            <Select value={filterStatus} onValueChange={setFilterStatus}>
                                <SelectTrigger className="w-full md:w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="resolved">Resolved</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={filterGroup} onValueChange={setFilterGroup}>
                                <SelectTrigger className="w-full md:w-[150px]"><SelectValue placeholder="Type" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Types</SelectItem>
                                    <SelectItem value="class_issue">Class Issue</SelectItem>
                                    <SelectItem value="grading_query">Grading</SelectItem>
                                    <SelectItem value="penalty_query">Penalty</SelectItem>
                                    <SelectItem value="absence_query">Absence</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
                ) : (
                    <div className="rounded-md border overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Student</TableHead>
                                    <TableHead>Category</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredTickets.map((ticket) => (
                                    <TableRow key={ticket.id}>
                                        <TableCell className="whitespace-nowrap">{format(new Date(ticket.created_at), 'MMM d, p')}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{ticket.real_name}</span>
                                                <span className="text-xs text-muted-foreground">{ticket.entered_erp}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span>{ticket.category}</span>
                                                {ticket.subcategory && <span className="text-xs text-muted-foreground">{ticket.subcategory}</span>}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={ticket.status === 'resolved' ? 'default' : 'destructive'} className={ticket.status === 'resolved' ? 'bg-green-500' : ''}>
                                                {ticket.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Sheet>
                                                <SheetTrigger asChild>
                                                    <Button variant="ghost" size="sm">View</Button>
                                                </SheetTrigger>
                                                <SheetContent className="w-full sm:max-w-md overflow-y-auto">
                                                    <SheetHeader>
                                                        <SheetTitle>Ticket Details</SheetTitle>
                                                        <SheetDescription>Submitted on {format(new Date(ticket.created_at), 'PPP p')}</SheetDescription>
                                                    </SheetHeader>

                                                    <div className="space-y-6 mt-6">
                                                        <div>
                                                            <h4 className="text-sm font-medium text-muted-foreground mb-1">Student</h4>
                                                            <p>{ticket.real_name} ({ticket.entered_erp})</p>
                                                            <p className="text-sm text-muted-foreground">{ticket.roster_class_no}</p>
                                                        </div>

                                                        <div>
                                                            <h4 className="text-sm font-medium text-muted-foreground mb-1">Issue Type</h4>
                                                            <Badge variant="outline">{ticket.group_type}</Badge>
                                                            <div className="mt-1 font-medium">{ticket.category}</div>
                                                        </div>

                                                        <div>
                                                            <h4 className="text-sm font-medium text-muted-foreground mb-1">Description</h4>
                                                            <div className="bg-muted p-3 rounded-md text-sm whitespace-pre-wrap">
                                                                {ticket.details_text}
                                                            </div>
                                                        </div>

                                                        {ticket.details_json && (
                                                            <div>
                                                                <h4 className="text-sm font-medium text-muted-foreground mb-1">Structured Data</h4>
                                                                <pre className="bg-muted p-3 rounded-md text-xs overflow-auto">
                                                                    {JSON.stringify(ticket.details_json, null, 2)}
                                                                </pre>
                                                            </div>
                                                        )}

                                                        <div className="pt-4 border-t">
                                                            <Button
                                                                className="w-full"
                                                                variant={ticket.status === 'pending' ? 'default' : 'outline'}
                                                                onClick={() => toggleStatus(ticket)}
                                                            >
                                                                {ticket.status === 'pending' ? 'Mark Resolved' : 'Reopen Ticket'}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </SheetContent>
                                            </Sheet>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
