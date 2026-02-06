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
    SheetClose
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
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
} from "@/components/ui/alert-dialog"
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
        <div className="space-y-8 animate-fade-in">
            <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-3xl font-extrabold tracking-tight text-foreground uppercase">
                        Issue Tracker
                    </h1>
                    <p className="text-muted-foreground">Manage student tickets and inquiries with ease.</p>
                </div>

                <div className="flex gap-3 flex-wrap w-full md:w-auto">
                    <div className="relative w-full md:w-64 group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        <Input
                            placeholder="Search by ERP or Name..."
                            value={searchErp}
                            onChange={e => setSearchErp(e.target.value)}
                            className="pl-9 h-11 bg-background/50 border-primary/20 rounded-xl focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                    </div>

                    <div className="flex gap-2 w-full md:w-auto">
                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                            <SelectTrigger className="w-full md:w-[130px] h-11 bg-background/50 border-primary/20 rounded-xl focus:ring-2 focus:ring-primary/20">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent className="glass-card">
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="resolved">Resolved</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={filterGroup} onValueChange={setFilterGroup}>
                            <SelectTrigger className="w-full md:w-[150px] h-11 bg-background/50 border-primary/20 rounded-xl focus:ring-2 focus:ring-primary/20">
                                <SelectValue placeholder="Category" />
                            </SelectTrigger>
                            <SelectContent className="glass-card">
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

            <div className="glass-card rounded-2xl border border-primary/10 overflow-hidden shadow-2xl backdrop-blur-xl">
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-primary/5">
                                <TableRow className="border-primary/10 hover:bg-transparent">
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
                                                <p className="text-sm font-semibold text-foreground">
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
                                        <TableRow key={ticket.id} className="border-primary/5 hover:bg-primary/5 transition-colors group">
                                            <TableCell className="py-4 px-6 whitespace-nowrap">
                                                <span className="text-xs font-semibold text-muted-foreground uppercase">{format(new Date(ticket.created_at), 'MMM d, h:mm a')}</span>
                                            </TableCell>
                                            <TableCell className="py-4 px-6">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-sm group-hover:text-primary transition-colors">{ticket.real_name}</span>
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
                                                <Badge variant="outline" className={`rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider ${ticket.status === 'resolved' ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-warning border-warning/20'}`}>
                                                    {ticket.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-4 px-6 text-right flex items-center justify-end gap-2">
                                                <Sheet>
                                                    <SheetTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="rounded-lg hover:bg-primary/10 hover:text-primary font-bold text-xs uppercase transition-all active:scale-95">Inspect</Button>
                                                    </SheetTrigger>
                                                    <SheetContent className="w-full sm:max-w-xl glass-card border-l border-primary/20 overflow-y-auto pt-10">
                                                        <SheetHeader className="mb-8">
                                                            <SheetTitle className="text-2xl font-extrabold tracking-tight uppercase">Ticket Details</SheetTitle>
                                                            <SheetDescription className="text-muted-foreground font-medium">Submitted on {format(new Date(ticket.created_at), 'PPP p')}</SheetDescription>
                                                        </SheetHeader>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                        <div className="space-y-1">
                                                            <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest">Student Information</h4>
                                                            <p className="font-bold">{ticket.real_name}</p>
                                                            <p className="text-sm font-mono text-muted-foreground uppercase">{ticket.entered_erp} • {ticket.roster_class_no}</p>
                                                        </div>

                                                        <div className="space-y-1">
                                                            <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest">Issue Classification</h4>
                                                            <div className="flex items-center gap-2">
                                                                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] font-bold uppercase">{ticket.group_type}</Badge>
                                                            </div>
                                                            <div className="font-bold text-sm uppercase">{ticket.category}</div>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest">Detailed Description</h4>
                                                        <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 text-sm whitespace-pre-wrap leading-relaxed">
                                                            {ticket.details_text}
                                                        </div>
                                                    </div>

                                                    <div className="space-y-3 pt-6 border-t border-primary/10">
                                                        <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest">Internal TA Notes</h4>
                                                        <Textarea
                                                            placeholder="Add private notes or response details..."
                                                            value={ticket.ta_response || ''}
                                                            className="min-h-[120px] bg-background/50 border-primary/10 rounded-xl focus:ring-2 focus:ring-primary/20 resize-none transition-all"
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

                                                        <div className="pt-6 border-t border-primary/10 grid grid-cols-1 gap-3">
                                                        <Button
                                                            className={`w-full h-12 rounded-xl font-bold uppercase transition-all active:scale-95 ${ticket.status === 'pending' ? 'bg-success hover:bg-success/90 text-white shadow-lg shadow-success/20' : 'bg-background border border-primary/20 hover:bg-primary/5 text-primary'}`}
                                                            onClick={() => toggleStatus(ticket)}
                                                        >
                                                            {ticket.status === 'pending' ? 'Resolve Ticket' : 'Reopen Ticket'}
                                                        </Button>

                                                        {ticket.group_type === 'class_issue' && (
                                                            <Button
                                                                variant="outline"
                                                                className="w-full h-12 rounded-xl font-bold uppercase border-primary/20 hover:bg-primary/5 text-primary tracking-tight"
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
                                                                <Button variant="ghost" className="w-full h-10 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive font-bold uppercase text-[10px] mt-2">
                                                                    <Trash2 className="w-4 h-4 mr-2" /> Delete Ticket
                                                                </Button>
                                                            </AlertDialogTrigger>
                                                            <AlertDialogContent className="glass-card border-destructive/20">
                                                                <AlertDialogHeader>
                                                                    <AlertDialogTitle className="text-destructive">Delete Ticket?</AlertDialogTitle>
                                                                    <AlertDialogDescription>
                                                                        This action cannot be undone. This will permanently delete the ticket and remove the data from our servers.
                                                                    </AlertDialogDescription>
                                                                </AlertDialogHeader>
                                                                <AlertDialogFooter>
                                                                    <AlertDialogCancel className="rounded-xl border-primary/10">Cancel</AlertDialogCancel>
                                                                    <AlertDialogAction onClick={() => deleteTicket(ticket.id)} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
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
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-lg" onClick={(e) => { e.stopPropagation(); deleteTicket(ticket.id); }}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>
        </div>
    );
}
