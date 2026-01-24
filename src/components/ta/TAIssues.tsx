import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Loader2, RefreshCw, Search, Eye, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Ticket {
  id: string;
  created_at: string;
  created_by_email: string;
  entered_erp: string;
  roster_name: string | null;
  roster_class_no: string | null;
  group_type: string;
  category: string;
  subcategory: string | null;
  details_text: string | null;
  details_json: unknown;
  status: string;
  updated_at: string;
}

export default function TAIssues() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [groupTypeFilter, setGroupTypeFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('');
  const [erpSearch, setErpSearch] = useState<string>('');

  useEffect(() => {
    fetchTickets();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('tickets-all')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTickets(prev => [payload.new as Ticket, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setTickets(prev => prev.map(t => 
              t.id === payload.new.id ? payload.new as Ticket : t
            ));
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
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTickets(data || []);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      toast.error('Failed to fetch tickets');
    } finally {
      setIsLoading(false);
    }
  };

  const updateTicketStatus = async (ticketId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ status: newStatus })
        .eq('id', ticketId);

      if (error) throw error;
      toast.success(`Ticket marked as ${newStatus}`);
    } catch (error) {
      console.error('Error updating ticket:', error);
      toast.error('Failed to update ticket');
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    if (statusFilter !== 'all' && ticket.status !== statusFilter) return false;
    if (groupTypeFilter !== 'all' && ticket.group_type !== groupTypeFilter) return false;
    if (classFilter && ticket.roster_class_no !== classFilter) return false;
    if (erpSearch && !ticket.entered_erp.toLowerCase().includes(erpSearch.toLowerCase())) return false;
    return true;
  });

  const getGroupTypeLabel = (type: string) => {
    switch (type) {
      case 'class_issue': return 'Class Issue';
      case 'grading_query': return 'Grading Query';
      case 'penalty_query': return 'Penalty Query';
      case 'absence_query': return 'Absence Query';
      default: return type;
    }
  };

  const uniqueClasses = [...new Set(tickets.map(t => t.roster_class_no).filter(Boolean))];

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>All Issues</CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchTickets} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="grid gap-4 mb-6 md:grid-cols-4">
            <div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={groupTypeFilter} onValueChange={setGroupTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="class_issue">Class Issue</SelectItem>
                  <SelectItem value="grading_query">Grading Query</SelectItem>
                  <SelectItem value="penalty_query">Penalty Query</SelectItem>
                  <SelectItem value="absence_query">Absence Query</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Classes</SelectItem>
                  {uniqueClasses.map(c => (
                    <SelectItem key={c} value={c!}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search ERP..."
                value={erpSearch}
                onChange={(e) => setErpSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No issues found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>ERP</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTickets.map(ticket => (
                    <TableRow key={ticket.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(ticket.created_at), 'MMM d, HH:mm')}
                      </TableCell>
                      <TableCell className="font-mono">{ticket.entered_erp}</TableCell>
                      <TableCell>{ticket.roster_name || '-'}</TableCell>
                      <TableCell>{ticket.roster_class_no || '-'}</TableCell>
                      <TableCell>{getGroupTypeLabel(ticket.group_type)}</TableCell>
                      <TableCell>
                        <span className={`status-badge ${ticket.status === 'pending' ? 'status-pending' : 'status-resolved'}`}>
                          {ticket.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedTicket(ticket);
                              setIsSheetOpen(true);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {ticket.status === 'pending' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateTicketStatus(ticket.id, 'resolved')}
                              className="text-success hover:text-success"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateTicketStatus(ticket.id, 'pending')}
                              className="text-warning hover:text-warning"
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="overflow-y-auto">
          {selectedTicket && (
            <>
              <SheetHeader>
                <SheetTitle>Ticket Details</SheetTitle>
                <SheetDescription>
                  Submitted on {format(new Date(selectedTicket.created_at), 'MMM d, yyyy HH:mm')}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">ERP</p>
                    <p className="font-mono">{selectedTicket.entered_erp}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Name</p>
                    <p>{selectedTicket.roster_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Class</p>
                    <p>{selectedTicket.roster_class_no || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="text-sm break-all">{selectedTicket.created_by_email}</p>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <p>{getGroupTypeLabel(selectedTicket.group_type)}</p>
                </div>
                
                <div>
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p>{selectedTicket.category}{selectedTicket.subcategory && ` - ${selectedTicket.subcategory}`}</p>
                </div>

                {selectedTicket.details_text && (
                  <div>
                    <p className="text-sm text-muted-foreground">Details</p>
                    <p className="whitespace-pre-wrap">{selectedTicket.details_text}</p>
                  </div>
                )}

                {selectedTicket.details_json && (
                  <div>
                    <p className="text-sm text-muted-foreground">Additional Info</p>
                    <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
                      {JSON.stringify(selectedTicket.details_json, null, 2)}
                    </pre>
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  {selectedTicket.status === 'pending' ? (
                    <Button 
                      onClick={() => {
                        updateTicketStatus(selectedTicket.id, 'resolved');
                        setIsSheetOpen(false);
                      }}
                      className="w-full"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Mark as Resolved
                    </Button>
                  ) : (
                    <Button 
                      variant="outline"
                      onClick={() => {
                        updateTicketStatus(selectedTicket.id, 'pending');
                        setIsSheetOpen(false);
                      }}
                      className="w-full"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Mark as Pending
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
