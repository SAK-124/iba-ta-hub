import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ta/ui/card';
import { Badge } from '@/components/ta/ui/badge';
import { Button } from '@/components/ta/ui/button';
import { Input } from '@/components/ta/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ta/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ta/ui/table';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
    SheetClose
} from '@/components/ta/ui/sheet';
import { Textarea } from '@/components/ta/ui/textarea';
import { Trash2, Loader2, Search, Filter, MoreVertical, CheckCircle2, XCircle, Clock, MessageSquare, ExternalLink } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ta/ui/alert-dialog"
import { format } from 'date-fns';
import { toast } from 'sonner';
import { subscribeRosterDataUpdated } from '@/lib/data-sync-events';

export default function IssueManagement() {
    const [tickets, setTickets] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterGroup, setFilterGroup] = useState<string>('all');
    const [searchErp, setSearchErp] = useState('');

    // Realtime subscription
    useEffect(() => {
        void fetchTickets();

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

        const unsubscribeRoster = subscribeRosterDataUpdated(() => {
            void fetchTickets();
        });

        return () => {
            unsubscribeRoster();
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchTickets = async () => {
        setIsLoading(true);
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
        const { error } = await supabase.from('tickets').update({ status: ticket.status === 'pending' ? 'resolved' : 'pending' }).eq('id', ticket.id);
        if (error) toast.error('Failed to update status');
        else {
            toast.success('Status updated');
            fetchTickets();
        }
    };

    const deleteTicket = async (id: string) => {
        if (!confirm('Are you sure you want to delete this ticket?')) return;
        const { error } = await supabase.from('tickets').delete().eq('id', id);
        if (error) toast.error('Failed to delete ticket');
        else {
            toast.success('Ticket deleted');
            fetchTickets();
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

    const hasActiveFilters = Boolean(searchErp.trim()) || filterStatus !== 'all' || filterGroup !== 'all';

    const clearFilters = () => {
        setSearchErp('');
        setFilterStatus('all');
        setFilterGroup('all');
    };

    return (
        <div className="ta-module-shell space-y-8 animate-fade-in">
            <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
                <div className="space-y-1">
                    <h1 className="ta-section-title text-3xl font-extrabold tracking-tight uppercase">
                        Issue Tracker
                    </h1>
                    <p className="ta-section-subtitle">Manage student tickets and inquiries with ease.</p>
                </div>

                <div className="flex gap-3 flex-wrap w-full md:w-auto">
                    <div className="relative w-full md:w-64 group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-debossed-sm transition-colors" />
                        <Input
                            placeholder="Search by ERP or Name..."
                            value={searchErp}
                            onChange={e => setSearchErp(e.target.value)}
                            className="pl-9 h-11"
                        />
                    </div>

                    <div className="flex gap-2 w-full md:w-auto">
                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                            <SelectTrigger className="w-full md:w-[130px] h-11">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="resolved">Resolved</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={filterGroup} onValueChange={setFilterGroup}>
                            <SelectTrigger className="w-full md:w-[150px] h-11">
                                <SelectValue placeholder="Category" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Categories</SelectItem>
                                <SelectItem value="class_issue">Class Issue</SelectItem>
                                <SelectItem value="grading_query">Grading</SelectItem>
                                <SelectItem value="penalty_query">Penalty</SelectItem>
                                <SelectItem value="absence_query">Absence</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <div className="neo-out ta-module-card rounded-2xl border border-[#111214] overflow-hidden">
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-10 w-10 animate-spin text-debossed-sm" />
                    </div>
                ) : (
                        <Table scrollClassName="overflow-x-auto">
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground py-4 px-6">Date & Time</TableHead>
                                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground py-4 px-6">Student ERP</TableHead>
                                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground py-4 px-6">Reason / Category</TableHead>
                                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground py-4 px-6">Status</TableHead>
                                    <TableHead className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground py-4 px-6 text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredTickets.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="py-16">
                                            <div className="flex flex-col items-center gap-3 text-center">
                                                <p className="text-sm font-semibold text-debossed-body">
                                                    {hasActiveFilters ? 'No tickets match your filters.' : 'No tickets found yet.'}
                                                </p>
                                                {hasActiveFilters && (
                                                    <Button variant="outline" size="sm" onClick={clearFilters}>
                                                        Clear filters
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredTickets.map((ticket) => (
                                        <TableRow key={ticket.id} className="transition-colors group">
                                            <TableCell className="py-4 px-6 whitespace-nowrap">
                                                <span className="text-xs font-semibold text-muted-foreground uppercase">{format(new Date(ticket.created_at), 'MMM d, h:mm a')}</span>
                                            </TableCell>
                                            <TableCell className="py-4 px-6">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-sm">{ticket.real_name}</span>
                                                    <span className="text-[10px] font-mono tracking-tighter text-muted-foreground uppercase">{ticket.entered_erp}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-4 px-6">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-semibold">{ticket.category}</span>
                                                    {ticket.subcategory && <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">{ticket.subcategory}</span>}
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-4 px-6">
                                                <Badge
                                                    variant="outline"
                                                    className={`rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                                        ticket.status === 'resolved' ? 'status-present-table-text' : 'status-excused-table-text'
                                                    }`}
                                                >
                                                    {ticket.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-4 px-6 text-right flex items-center justify-end gap-2">
                                                <Sheet>
                                                    <SheetTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="rounded-lg font-bold text-xs uppercase">Inspect</Button>
                                                    </SheetTrigger>
                                                    <SheetContent className="w-full sm:max-w-xl overflow-y-auto pt-10">
                                                        <SheetHeader className="mb-8">
                                                            <SheetTitle className="text-2xl font-extrabold tracking-tight uppercase">Ticket Details</SheetTitle>
                                                            <SheetDescription className="text-debossed-sm font-medium">Submitted on {format(new Date(ticket.created_at), 'PPP p')}</SheetDescription>
                                                        </SheetHeader>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                        <div className="space-y-1">
                                                            <h4 className="text-[10px] font-bold text-debossed-sm uppercase tracking-widest">Student Information</h4>
                                                            <p className="font-bold">{ticket.real_name}</p>
                                                            <p className="text-sm font-mono text-muted-foreground uppercase">{ticket.entered_erp} • {ticket.roster_class_no}</p>
                                                        </div>

                                                        <div className="space-y-1">
                                                            <h4 className="text-[10px] font-bold text-debossed-sm uppercase tracking-widest">Issue Classification</h4>
                                                            <div className="flex items-center gap-2">
                                                                <Badge variant="outline" className="text-[10px] font-bold uppercase">{ticket.group_type}</Badge>
                                                            </div>
                                                            <div className="font-bold text-sm uppercase">{ticket.category}</div>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <h4 className="text-[10px] font-bold text-debossed-sm uppercase tracking-widest">Detailed Description</h4>
                                                        <div className="neo-in p-4 rounded-xl border border-[#141517] text-sm whitespace-pre-wrap leading-relaxed">
                                                            {ticket.details_text}
                                                        </div>
                                                    </div>

                                                    <div className="space-y-3 pt-6 border-t border-[#141517]">
                                                        <h4 className="text-[10px] font-bold text-debossed-sm uppercase tracking-widest">Internal TA Notes</h4>
                                                        <Textarea
                                                            placeholder="Add private notes or response details..."
                                                            value={ticket.ta_response || ''}
                                                            className="min-h-[120px] rounded-xl resize-none"
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, ta_response: val } : t));
                                                            }}
                                                            onBlur={async (e) => {
                                                                const val = e.target.value;
                                                                const { error } = await supabase.from('tickets').update({ ta_response: val }).eq('id', ticket.id);
                                                                if (error) toast.error('Failed to save response');
                                                                else toast.success('Internal response persistent');
                                                            }}
                                                        />
                                                        <p className="text-[9px] text-muted-foreground italic text-right">Drafting is auto-saved on blur.</p>
                                                    </div>

                                                        <div className="pt-6 border-t border-[#141517] grid grid-cols-1 gap-3">
                                                        <Button
                                                            className="w-full h-12 rounded-xl neo-btn neo-out font-bold uppercase"
                                                            onClick={() => toggleStatus(ticket)}
                                                        >
                                                            <span className={ticket.status === 'pending' ? 'status-present-text text-debossed-sm' : 'status-absent-text text-debossed-sm'}>
                                                                {ticket.status === 'pending' ? 'Resolve Ticket' : 'Reopen Ticket'}
                                                            </span>
                                                        </Button>

                                                        {ticket.group_type === 'class_issue' && (
                                                            <Button
                                                                variant="outline"
                                                                className="w-full h-12 rounded-xl font-bold uppercase tracking-tight"
                                                                onClick={async () => {
                                                                    const { error } = await supabase.from('rule_exceptions' as any).insert({
                                                                        erp: ticket.entered_erp,
                                                                        student_name: ticket.real_name || ticket.roster_name || 'Unknown',
                                                                        class_no: ticket.roster_class_no,
                                                                        issue_type: 'camera_excused',
                                                                        assigned_day: 'both',
                                                                        notes: 'Added from ticket: ' + ticket.category
                                                                    });
                                                                    if (error) toast.error('Failed to add exception');
                                                                    else toast.success('Added to Rule Exceptions');
                                                                }}
                                                            >
                                                                Escalate to Exception
                                                            </Button>
                                                        )}

                                                        <AlertDialog>
                                                            <AlertDialogTrigger asChild>
                                                                <Button variant="ghost" className="w-full h-10 rounded-xl font-bold uppercase text-[10px] mt-2">
                                                                    <Trash2 className="w-4 h-4 mr-2 status-absent-text" /> <span className="status-absent-text">Delete Ticket</span>
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent className="border-[#141517]">
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle className="status-absent-text">Delete Ticket?</AlertDialogTitle>
                                                                    <AlertDialogDescription>
                                                                        This action cannot be undone. This will permanently delete the ticket and remove the data from our servers.
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                                                                    <AlertDialogAction onClick={() => deleteTicket(ticket.id)} className="rounded-xl neo-btn neo-out text-debossed-sm">
                                                                        <span className="status-absent-text">Delete</span>
                                                                    </AlertDialogAction>
                                                                </AlertDialogFooter>
                                                            </AlertDialogContent>
                                                        </AlertDialog>

                                                        <SheetClose asChild>
                                                            <Button variant="ghost" className="w-full h-10 rounded-xl text-muted-foreground hover:text-foreground font-bold uppercase text-[10px] mt-2">
                                                                Exit Details
                                                            </Button>
                                                        </SheetClose>
                                                        </div>
                                                    </SheetContent>
                                                </Sheet>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={(e) => { e.stopPropagation(); deleteTicket(ticket.id); }}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                )}
            </div>
        </div>
    );
}
