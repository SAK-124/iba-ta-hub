import { useEffect, useState } from 'react';
import { useERP } from '@/lib/erp-context';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';

export default function MyIssues() {
  const { erp } = useERP();
  const [tickets, setTickets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTickets = async () => {
      if (!erp) return;
      setIsLoading(true);
      const { data, error } = await supabase.rpc('get_student_tickets', { student_erp: erp });
      if (!error && data) {
        setTickets(data);
      }
      setIsLoading(false);
    };

    fetchTickets();

    // Subscribe to realtime updates for this ERP's tickets
    const channel = supabase
      .channel('my-tickets')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tickets', filter: `entered_erp=eq.${erp}` },
        (payload) => {
          // Update the specific ticket in state
          setTickets(prev => prev.map(t => t.id === payload.new.id ? payload.new : t));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [erp]);

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (tickets.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <p>No issues reported yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ScrollArea className="h-[600px] pr-4">
      <div className="space-y-4">
        {tickets.map((ticket) => (
          <Card key={ticket.id}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg font-semibold">{ticket.category}</CardTitle>
                  <CardDescription>
                    {format(new Date(ticket.created_at), 'PPP p')}
                  </CardDescription>
                </div>
                <Badge variant={ticket.status === 'resolved' ? 'default' : 'secondary'} className={ticket.status === 'resolved' ? 'bg-green-500 hover:bg-green-600' : ''}>
                  {ticket.status.toUpperCase()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {ticket.subcategory && (
                <Badge variant="outline" className="mb-2 mr-2">{ticket.subcategory}</Badge>
              )}
              <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                {ticket.details_text || (ticket.details_json && JSON.stringify(ticket.details_json, null, 2))}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}
