import { useState, useEffect } from 'react';
import { useERP } from '@/lib/erp-context';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SubmitIssue() {
  const { erp, studentName, classNo } = useERP();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [issueType, setIssueType] = useState<'class' | 'other' | null>(null);
  const [specificIssue, setSpecificIssue] = useState<string>('');

  // Dynamic data
  const [submissions, setSubmissions] = useState<{ id: string, label: string }[]>([]);
  const [penaltyTypes, setPenaltyTypes] = useState<{ id: string, label: string }[]>([]);
  const [sessions, setSessions] = useState<{ id: string, session_number: number, session_date: string }[]>([]);

  // Form states
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('one_day');
  const [days, setDays] = useState('both');
  const [weeks, setWeeks] = useState('1');
  const [date, setDate] = useState<Date | undefined>(new Date());

  const [selectedSubmission, setSelectedSubmission] = useState('');
  const [questionLabels, setQuestionLabels] = useState('');
  const [query, setQuery] = useState('');

  const [selectedPenalty, setSelectedPenalty] = useState('');
  const [eligibleSession, setEligibleSession] = useState('');

  const [selectedSession, setSelectedSession] = useState('');
  const [absenceType, setAbsenceType] = useState('why_absent');

  useEffect(() => {
    // Fetch dropdown data
    const fetchData = async () => {
      const { data: subs } = await supabase.from('submissions_list').select('id, label').eq('active', true).order('sort_order');
      if (subs) setSubmissions(subs);

      const { data: pens } = await supabase.from('penalty_types').select('id, label').eq('active', true);
      if (pens) setPenaltyTypes(pens);

      const { data: sess } = await supabase.from('sessions').select('id, session_number, session_date').order('session_number', { ascending: false });
      if (sess) setSessions(sess);
    };

    fetchData();
  }, []);

  const handleSubmit = async () => {
    if (!issueType) return;
    setIsSubmitting(true);



    console.log('[SubmitIssue] Starting submission...');
    console.log('[SubmitIssue] User:', user);
    console.log('[SubmitIssue] ERP Context:', { erp, studentName, classNo });

    if (!user || !user.email) {
      toast.error('User email not found. Please reload or sign in again.');
      setIsSubmitting(false);
      return;
    }

    if (!erp) {
      toast.error('ERP not found. Please reload.');
      setIsSubmitting(false);
      return;
    }

    try {
      const { data: settings, error: settingsError } = await supabase
        .from('app_settings')
        .select('tickets_enabled')
        .single();

      if (settingsError) {
        throw settingsError;
      }

      if (settings?.tickets_enabled === false) {
        toast.error('Ticket submissions are currently disabled. Please email the TAs directly.');
        return;
      }

      const ticketData: any = {
        entered_erp: erp,
        roster_name: studentName,
        roster_class_no: classNo,
        created_by_email: user.email,
        status: 'pending'
      };

      console.log('[SubmitIssue] Payload:', ticketData);

      if (issueType === 'class') {
        ticketData.group_type = 'class_issue';
        ticketData.category = specificIssue;

        if (specificIssue === 'camera_issue') {
          // Map visual reason to data structure
          if (reason === 'excused') {
            ticketData.subcategory = 'camera_excused';
            ticketData.details_json = {
              duration,
              days: duration !== 'one_day' ? days : undefined,
              weeks: duration === 'recurring' ? weeks : undefined,
              date: duration === 'one_day' ? date : undefined
            };
          } else {
            ticketData.subcategory = 'camera_not_working';
            ticketData.details_text = query; // Use query input for not working reason
          }
          ticketData.category = 'Camera Issue';
        } else {
          ticketData.details_text = reason;
        }

      } else {
        // Other options
        if (specificIssue === 'grading') {
          ticketData.group_type = 'grading_query';
          ticketData.category = 'Grading Query';
          ticketData.details_json = {
            submission_id: selectedSubmission,
            question_labels: questionLabels.split(',').map(s => s.trim()).filter(Boolean)
          };
          ticketData.details_text = query;
        } else if (specificIssue === 'penalty') {
          ticketData.group_type = 'penalty_query';
          ticketData.category = 'Penalty Query';
          ticketData.details_json = {
            penalty_type_id: selectedPenalty,
            session_id: eligibleSession
          };
          ticketData.details_text = query;
        } else if (specificIssue === 'absence') {
          ticketData.group_type = 'absence_query';
          ticketData.category = absenceType;
          ticketData.details_json = { session_id: selectedSession };
          ticketData.details_text = query;
        }
      }

      const { error } = await supabase.from('tickets').insert(ticketData);

      if (error) throw error;

      toast.success('Ticket submitted successfully');
      // Reset form
      setIssueType(null);
      setSpecificIssue('');
      setReason('');
      setQuery('');

    } catch (error: any) {
      console.error('Submit Ticket Error:', error);
      toast.error('Failed to submit ticket: ' + (error.message || 'Unknown error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderClassIssues = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
      <RadioGroup onValueChange={setSpecificIssue} className="grid gap-4">
        <div>
          <RadioGroupItem value="join_2_devices" id="join_2_devices" className="peer sr-only" />
          <Label
            htmlFor="join_2_devices"
            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
          >
            Need to join from 2 devices
          </Label>
        </div>

        <div>
          <RadioGroupItem value="camera_issue" id="camera_issue" className="peer sr-only" />
          <Label
            htmlFor="camera_issue"
            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
          >
            Camera Issue
          </Label>
        </div>

        <div>
          <RadioGroupItem value="connectivity_issue" id="connectivity_issue" className="peer sr-only" />
          <Label
            htmlFor="connectivity_issue"
            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
          >
            Connectivity Issue
          </Label>
        </div>

        <div>
          <RadioGroupItem value="other_class" id="other_class" className="peer sr-only" />
          <Label
            htmlFor="other_class"
            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
          >
            Other
          </Label>
        </div>
      </RadioGroup>

      {specificIssue === 'camera_issue' && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Camera Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                variant={reason === 'not_working' ? 'default' : 'outline'}
                className="flex-1 whitespace-normal h-auto py-2"
                onClick={() => setReason('not_working')}
              >
                Camera Not Working
              </Button>
              <Button
                variant={reason === 'excused' ? 'default' : 'outline'}
                className="flex-1 whitespace-normal h-auto py-2"
                onClick={() => setReason('excused')}
              >
                Camera Excused
              </Button>
            </div>

            {reason === 'not_working' && (
              <Input placeholder="Reason for camera failure" value={query} onChange={e => setQuery(e.target.value)} />
            )}

            {reason === 'excused' && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">You must email proof of approval from Sir to the TAs.</p>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger><SelectValue placeholder="Duration" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one_day">One day</SelectItem>
                    <SelectItem value="recurring">Recurring days</SelectItem>
                    <SelectItem value="blanket">Blanket approval</SelectItem>
                  </SelectContent>
                </Select>

                {duration === 'one_day' && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? format(date, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={setDate} initialFocus /></PopoverContent>
                  </Popover>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(specificIssue === 'connectivity_issue' || specificIssue === 'other_class') && (
        <Textarea placeholder="Describe the issue..." value={reason} onChange={e => setReason(e.target.value)} />
      )}
    </div>
  );

  const renderOtherOptions = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
      <Select onValueChange={(val) => setSpecificIssue(val)}>
        <SelectTrigger><SelectValue placeholder="Select Issue Type" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="grading">Grading related query</SelectItem>
          <SelectItem value="penalty">Penalty query</SelectItem>
          <SelectItem value="absence">Absence query</SelectItem>
        </SelectContent>
      </Select>

      {specificIssue === 'grading' && (
        <div className="space-y-3">
          <Select value={selectedSubmission} onValueChange={setSelectedSubmission}>
            <SelectTrigger><SelectValue placeholder="Select Submission" /></SelectTrigger>
            <SelectContent>
              {submissions.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Question Labels (e.g. 1, 1a, 2)" value={questionLabels} onChange={e => setQuestionLabels(e.target.value)} />
          <Textarea placeholder="Query details..." value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      )}

      {specificIssue === 'penalty' && (
        <div className="space-y-3">
          <Select value={selectedPenalty} onValueChange={setSelectedPenalty}>
            <SelectTrigger><SelectValue placeholder="Select Penalty Type" /></SelectTrigger>
            <SelectContent>
              {penaltyTypes.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Logic to filter eligible sessions would go here, simplified for now */}
          <Select value={eligibleSession} onValueChange={setEligibleSession}>
            <SelectTrigger><SelectValue placeholder="Select Session" /></SelectTrigger>
            <SelectContent>
              {sessions.slice(0, 5).map(s => <SelectItem key={s.id} value={s.id}>Session {s.session_number} ({s.session_date})</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground p-2 bg-muted rounded">Naming penalties can only be reported within 24 hours.</div>
          <Textarea placeholder="Query details..." value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      )}

      {specificIssue === 'absence' && (
        <div className="space-y-3">
          <Select value={selectedSession} onValueChange={setSelectedSession}>
            <SelectTrigger><SelectValue placeholder="Select Session" /></SelectTrigger>
            <SelectContent>
              {sessions.map(s => <SelectItem key={s.id} value={s.id}>Session {s.session_number} ({s.session_date})</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={absenceType} onValueChange={setAbsenceType}>
            <SelectTrigger><SelectValue placeholder="Query Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="why_absent">Why was I marked absent?</SelectItem>
              <SelectItem value="request_excusal">Request excusal</SelectItem>
            </SelectContent>
          </Select>
          <Textarea placeholder="Description..." value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit a New Issue</CardTitle>
        <CardDescription>Select the category that best describes your problem.</CardDescription>
        <div className="mt-2 rounded-md border border-amber-300/60 bg-amber-50/60 p-3 text-sm text-amber-900">
          Important: After creating a ticket, also email the TAs with your ERP and issue summary so your case is tracked without delay.
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button
            variant={issueType === 'class' ? 'default' : 'outline'}
            className="h-auto py-6 text-lg whitespace-normal text-center"
            onClick={() => { setIssueType('class'); setSpecificIssue(''); }}
          >
            Class-specific issues
          </Button>
          <Button
            variant={issueType === 'other' ? 'default' : 'outline'}
            className="h-auto py-6 text-lg whitespace-normal text-center"
            onClick={() => { setIssueType('other'); setSpecificIssue(''); }}
          >
            Other options
          </Button>
        </div>

        {issueType === 'class' && renderClassIssues()}
        {issueType === 'other' && renderOtherOptions()}

        <Button
          className="w-full"
          disabled={!issueType || !specificIssue || isSubmitting}
          onClick={handleSubmit}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit Ticket
        </Button>
      </CardContent>
    </Card>
  );
}
