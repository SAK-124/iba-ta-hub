import { useState, useEffect } from 'react';
import { useERP } from '@/lib/erp-context';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

interface MyIssuesProps {
  canAccess: boolean | null;
  isBlocked: boolean | null | undefined;
}

interface Ticket {
  id: string;
  created_at: string;
  group_type: string;
  category: string;
  subcategory: string | null;
  status: string;
  details_text: string | null;
}

export default function MyIssues({ canAccess, isBlocked }: MyIssuesProps) {
  const { erp } = useERP();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (canAccess && erp) {
      fetchTickets();
      
      // Subscribe to realtime updates
      const channel = supabase
        .channel('tickets-status')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'tickets', filter: `entered_erp=eq.${erp}` },
          (payload) => {
            setTickets(prev => prev.map(t => 
              t.id === payload.new.id ? { ...t, status: payload.new.status } : t
            ));
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [canAccess, erp]);

  const fetchTickets = async () => {
    if (!erp) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('id, created_at, group_type, category, subcategory, status, details_text')
        .eq('entered_erp', erp)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTickets(data || []);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!erp) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Please enter your ERP above to view your issues.</p>
        </CardContent>
      </Card>
    );
  }

  if (isBlocked) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive font-medium">Your ERP wasn't found in the roster.</p>
          <p className="text-muted-foreground mt-2">Please contact the TAs via email.</p>
        </CardContent>
      </Card>
    );
  }

  const getGroupTypeLabel = (type: string) => {
    switch (type) {
      case 'class_issue': return 'Class Issue';
      case 'grading_query': return 'Grading Query';
      case 'penalty_query': return 'Penalty Query';
      case 'absence_query': return 'Absence Query';
      default: return type;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'two_devices': return 'Two Devices';
      case 'camera_issue': return 'Camera Issue';
      case 'connectivity_issue': return 'Connectivity';
      case 'other': return 'Other';
      case 'grading_query': return 'Grading';
      case 'penalty_query': return 'Penalty';
      case 'absence_query': return 'Absence';
      default: return category;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>My Issues</CardTitle>
        <Button variant="ghost" size="sm" onClick={fetchTickets} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No issues submitted yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map(ticket => (
                  <TableRow key={ticket.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(ticket.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>{getGroupTypeLabel(ticket.group_type)}</TableCell>
                    <TableCell>
                      {getCategoryLabel(ticket.category)}
                      {ticket.subcategory && (
                        <span className="text-muted-foreground"> - {ticket.subcategory}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`status-badge ${ticket.status === 'pending' ? 'status-pending' : 'status-resolved'}`}>
                        {ticket.status}
                      </span>
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
