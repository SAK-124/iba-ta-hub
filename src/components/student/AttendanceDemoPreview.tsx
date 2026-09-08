import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const DEMO_ROWS = [
  {
    label: 'Present',
    status: 'PRESENT',
    zoomName: '12345_Demo Student',
    attended: '60 min',
    required: '48 min',
    shortfall: '0 min',
    detail: 'Cutoff met · Correct name format.',
    className: 'border-green-500/30',
  },
  {
    label: 'Absent',
    status: 'ABSENT',
    zoomName: 'No matching Zoom name',
    attended: '30 min',
    required: '48 min',
    shortfall: '18 min',
    detail: '18 min below the required 80% cutoff.',
    className: 'border-red-500/30',
  },
  {
    label: 'Name penalty',
    status: 'PRESENT',
    zoomName: 'Demo Student',
    attended: '55 min',
    required: '48 min',
    shortfall: '0 min',
    detail: 'Present · Name format incorrect.',
    className: 'border-pink-500/30',
  },
] as const;

/** Development-only sample content. It never reads from or writes to Supabase. */
export default function AttendanceDemoPreview() {
  return (
    <Card className="min-w-0 overflow-hidden border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Sample student preview</CardTitle>
        <CardDescription className="break-words">Demo-only examples of the attendance evidence layout. No real student record is used.</CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {DEMO_ROWS.map((row) => (
          <div key={row.label} className={`min-w-0 overflow-hidden rounded-lg border p-3 ${row.className}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 break-words text-sm font-medium">{row.label}</span>
              <Badge variant={row.status === 'PRESENT' ? 'default' : 'destructive'}>{row.status}</Badge>
            </div>
            <dl className="mt-3 space-y-1 text-xs">
              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2"><dt className="text-muted-foreground">Zoom name</dt><dd className="min-w-0 break-words text-right">{row.zoomName}</dd></div>
              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2"><dt className="text-muted-foreground">Attended</dt><dd className="text-right">{row.attended}</dd></div>
              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2"><dt className="text-muted-foreground">Required</dt><dd className="text-right">{row.required}</dd></div>
              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2"><dt className="text-muted-foreground">Shortfall</dt><dd className="text-right">{row.shortfall}</dd></div>
            </dl>
            <p className="mt-2 break-words text-xs text-muted-foreground">{row.detail}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
