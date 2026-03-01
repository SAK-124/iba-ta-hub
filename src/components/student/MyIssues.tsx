import { useEffect, useState } from 'react';
import { useERP } from '@/lib/erp-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import {
  listTicketsByErp,
  removeTicketChannel,
  subscribeMyTickets,
  type TicketRow,
} from '@/features/tickets';

export default function MyIssues() {
  const { erp } = useERP();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTickets = async () => {
      if (!erp) return;
      setIsLoading(true);
      const data = await listTicketsByErp(erp);
      setTickets(data);
      setIsLoading(false);
    };

    void fetchTickets();

    // Subscribe to realtime updates for this ERP's tickets
    if (!erp) {
      return;
    }

    const channel = subscribeMyTickets(erp, (payload) => {
      setTickets((prev) => prev.map((ticket) => (ticket.id === payload.new.id ? payload.new : ticket)));
    });

    return () => {
      void removeTicketChannel(channel);
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
              {ticket.ta_response && (
                <div className="mt-4 p-3 bg-muted rounded-md border text-sm">
                  <span className="font-semibold block mb-1">TA Response:</span>
                  {ticket.ta_response}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}
