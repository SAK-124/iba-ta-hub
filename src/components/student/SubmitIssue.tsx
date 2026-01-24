import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useERP } from '@/lib/erp-context';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AlertCircle, ArrowLeft, CheckCircle, Loader2, MonitorPlay, Camera, Wifi, HelpCircle, FileQuestion, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { format, subHours, isAfter } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

interface SubmitIssueProps {
  canAccess: boolean | null;
  isBlocked: boolean | null | undefined;
}

interface Session {
  id: string;
  session_number: number;
  session_date: string;
  day_of_week: string;
  end_time: string | null;
}

interface SubmissionItem {
  id: string;
  label: string;
}

interface PenaltyType {
  id: string;
  label: string;
  time_window_hours: number;
}

type GroupType = 'class_issue' | 'grading_query' | 'penalty_query' | 'absence_query';
type ClassIssueCategory = 'two_devices' | 'camera_issue' | 'connectivity_issue' | 'other';
type CameraSubcategory = 'not_working' | 'excused';
type CameraDuration = 'one_day' | 'recurring' | 'blanket';

export default function SubmitIssue({ canAccess, isBlocked }: SubmitIssueProps) {
  const { user } = useAuth();
  const { erp, rosterInfo } = useERP();
  const [step, setStep] = useState<'main' | 'class_issue' | 'other_options' | 'form'>('main');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form state
  const [groupType, setGroupType] = useState<GroupType | null>(null);
  const [category, setCategory] = useState<string>('');
  const [subcategory, setSubcategory] = useState<string>('');
  const [detailsText, setDetailsText] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<string>('');
  const [selectedPenalty, setSelectedPenalty] = useState<string>('');
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [absenceType, setAbsenceType] = useState<string>('');
  const [questions, setQuestions] = useState<string>('');
  
  // Camera excused specific
  const [cameraDuration, setCameraDuration] = useState<CameraDuration>('one_day');
  const [cameraDate, setCameraDate] = useState<string>('');
  const [cameraDays, setCameraDays] = useState<string>('Friday');
  const [cameraWeeks, setCameraWeeks] = useState<string>('1');

  // Data
  const [sessions, setSessions] = useState<Session[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [penaltyTypes, setPenaltyTypes] = useState<PenaltyType[]>([]);
  const [eligibleSessions, setEligibleSessions] = useState<Session[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [sessionsRes, submissionsRes, penaltiesRes] = await Promise.all([
      supabase.from('sessions').select('*').order('session_number', { ascending: true }),
      supabase.from('submissions_list').select('*').eq('active', true).order('sort_order'),
      supabase.from('penalty_types').select('*').eq('active', true)
    ]);

    if (sessionsRes.data) setSessions(sessionsRes.data);
    if (submissionsRes.data) setSubmissions(submissionsRes.data);
    if (penaltiesRes.data) setPenaltyTypes(penaltiesRes.data);
  };

  const calculateEligibleSessions = (penaltyId: string) => {
    const penalty = penaltyTypes.find(p => p.id === penaltyId);
    if (!penalty) return;

    const karachiTz = 'Asia/Karachi';
    const now = toZonedTime(new Date(), karachiTz);
    const windowStart = subHours(now, penalty.time_window_hours);

    const eligible = sessions.filter(session => {
      const sessionDate = new Date(session.session_date);
      const endTime = session.end_time || '23:59:00';
      const [hours, minutes] = endTime.split(':').map(Number);
      sessionDate.setHours(hours, minutes, 0, 0);
      
      const sessionEndKarachi = toZonedTime(sessionDate, karachiTz);
      
      return isAfter(sessionEndKarachi, windowStart) && isAfter(now, sessionEndKarachi);
    });

    setEligibleSessions(eligible);
  };

  const resetForm = () => {
    setStep('main');
    setGroupType(null);
    setCategory('');
    setSubcategory('');
    setDetailsText('');
    setSelectedSubmission('');
    setSelectedPenalty('');
    setSelectedSession('');
    setAbsenceType('');
    setQuestions('');
    setCameraDuration('one_day');
    setCameraDate('');
    setCameraDays('Friday');
    setCameraWeeks('1');
  };

  const handleSubmit = async () => {
    if (!user?.email || !erp || !groupType || !category) return;

    setIsSubmitting(true);
    try {
      let detailsJson: Record<string, unknown> | null = null;

      if (groupType === 'class_issue' && category === 'camera_issue' && subcategory === 'excused') {
        detailsJson = {
          duration_type: cameraDuration,
          ...(cameraDuration === 'one_day' && { date: cameraDate }),
          ...(cameraDuration === 'recurring' && { days: cameraDays, weeks: cameraWeeks }),
          ...(cameraDuration === 'blanket' && { days: cameraDays })
        };
      }

      if (groupType === 'grading_query') {
        detailsJson = {
          submission_id: selectedSubmission,
          questions: questions.split(',').map(q => q.trim())
        };
      }

      if (groupType === 'penalty_query') {
        detailsJson = {
          penalty_type_id: selectedPenalty,
          session_id: selectedSession
        };
      }

      if (groupType === 'absence_query') {
        detailsJson = {
          session_id: selectedSession,
          query_type: absenceType
        };
      }

      const ticketData = {
        created_by_email: user.email,
        entered_erp: erp,
        roster_name: rosterInfo?.student_name || null,
        roster_class_no: rosterInfo?.class_no || null,
        group_type: groupType,
        category: category,
        subcategory: subcategory || null,
        details_text: detailsText || null,
        details_json: detailsJson as unknown as null
      };
      
      const { error } = await supabase.from('tickets').insert([ticketData]);

      if (error) throw error;

      toast.success('Issue submitted successfully!');
      resetForm();
    } catch (error) {
      console.error('Error submitting issue:', error);
      toast.error('Failed to submit issue. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!erp) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Please enter your ERP above to submit an issue.</p>
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

  if (step === 'main') {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Card 
          className="cursor-pointer transition-all hover:shadow-md hover:border-primary"
          onClick={() => setStep('class_issue')}
        >
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <MonitorPlay className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-lg">Class-specific Issues</CardTitle>
            <CardDescription>Camera, connectivity, multiple devices</CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className="cursor-pointer transition-all hover:shadow-md hover:border-primary"
          onClick={() => setStep('other_options')}
        >
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-2">
              <HelpCircle className="w-8 h-8 text-accent" />
            </div>
            <CardTitle className="text-lg">Other Options</CardTitle>
            <CardDescription>Grading, penalties, absences</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (step === 'class_issue') {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setStep('main')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <h3 className="text-lg font-semibold mb-4">Select Issue Type</h3>

        <div className="grid gap-3">
          <Card 
            className="cursor-pointer transition-all hover:shadow-md hover:border-primary p-4"
            onClick={() => {
              setGroupType('class_issue');
              setCategory('two_devices');
              setStep('form');
            }}
          >
            <div className="flex items-center gap-4">
              <MonitorPlay className="w-8 h-8 text-primary" />
              <div>
                <h4 className="font-medium">Need to join from 2 devices</h4>
                <p className="text-sm text-muted-foreground">Request permission for multiple device login</p>
              </div>
            </div>
          </Card>

          <Card 
            className="cursor-pointer transition-all hover:shadow-md hover:border-primary p-4"
            onClick={() => {
              setGroupType('class_issue');
              setCategory('camera_issue');
              setStep('form');
            }}
          >
            <div className="flex items-center gap-4">
              <Camera className="w-8 h-8 text-primary" />
              <div>
                <h4 className="font-medium">Camera issue</h4>
                <p className="text-sm text-muted-foreground">Camera not working or excused</p>
              </div>
            </div>
          </Card>

          <Card 
            className="cursor-pointer transition-all hover:shadow-md hover:border-primary p-4"
            onClick={() => {
              setGroupType('class_issue');
              setCategory('connectivity_issue');
              setStep('form');
            }}
          >
            <div className="flex items-center gap-4">
              <Wifi className="w-8 h-8 text-primary" />
              <div>
                <h4 className="font-medium">Connectivity issue</h4>
                <p className="text-sm text-muted-foreground">Internet or connection problems</p>
              </div>
            </div>
          </Card>

          <Card 
            className="cursor-pointer transition-all hover:shadow-md hover:border-primary p-4"
            onClick={() => {
              setGroupType('class_issue');
              setCategory('other');
              setStep('form');
            }}
          >
            <div className="flex items-center gap-4">
              <HelpCircle className="w-8 h-8 text-primary" />
              <div>
                <h4 className="font-medium">Other</h4>
                <p className="text-sm text-muted-foreground">Any other class-related issue</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (step === 'other_options') {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setStep('main')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <h3 className="text-lg font-semibold mb-4">Select Query Type</h3>

        <div className="grid gap-3">
          <Card 
            className="cursor-pointer transition-all hover:shadow-md hover:border-primary p-4"
            onClick={() => {
              setGroupType('grading_query');
              setCategory('grading_query');
              setStep('form');
            }}
          >
            <div className="flex items-center gap-4">
              <FileQuestion className="w-8 h-8 text-primary" />
              <div>
                <h4 className="font-medium">Grading related query</h4>
                <p className="text-sm text-muted-foreground">Questions about submissions and grades</p>
              </div>
            </div>
          </Card>

          <Card 
            className="cursor-pointer transition-all hover:shadow-md hover:border-primary p-4"
            onClick={() => {
              setGroupType('penalty_query');
              setCategory('penalty_query');
              setStep('form');
            }}
          >
            <div className="flex items-center gap-4">
              <AlertTriangle className="w-8 h-8 text-warning" />
              <div>
                <h4 className="font-medium">Penalty query</h4>
                <p className="text-sm text-muted-foreground">Questions about naming or other penalties</p>
              </div>
            </div>
          </Card>

          <Card 
            className="cursor-pointer transition-all hover:shadow-md hover:border-primary p-4"
            onClick={() => {
              setGroupType('absence_query');
              setCategory('absence_query');
              setStep('form');
            }}
          >
            <div className="flex items-center gap-4">
              <Clock className="w-8 h-8 text-primary" />
              <div>
                <h4 className="font-medium">Absence query</h4>
                <p className="text-sm text-muted-foreground">Why marked absent or request excusal</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Form step
  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={() => {
        if (groupType === 'class_issue') {
          setStep('class_issue');
        } else {
          setStep('other_options');
        }
        setSubcategory('');
        setDetailsText('');
      }}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>
            {category === 'two_devices' && 'Request: Multiple Devices'}
            {category === 'camera_issue' && 'Camera Issue'}
            {category === 'connectivity_issue' && 'Connectivity Issue'}
            {category === 'other' && 'Other Issue'}
            {groupType === 'grading_query' && 'Grading Query'}
            {groupType === 'penalty_query' && 'Penalty Query'}
            {groupType === 'absence_query' && 'Absence Query'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Camera issue subcategory selection */}
          {category === 'camera_issue' && !subcategory && (
            <div className="grid gap-3">
              <Card 
                className="cursor-pointer transition-all hover:shadow-md hover:border-primary p-4"
                onClick={() => setSubcategory('not_working')}
              >
                <h4 className="font-medium">Camera not working</h4>
                <p className="text-sm text-muted-foreground">My camera is malfunctioning</p>
              </Card>
              <Card 
                className="cursor-pointer transition-all hover:shadow-md hover:border-primary p-4"
                onClick={() => setSubcategory('excused')}
              >
                <h4 className="font-medium">Camera excused</h4>
                <p className="text-sm text-muted-foreground">I have approval to keep camera off</p>
              </Card>
            </div>
          )}

          {/* Camera not working form */}
          {category === 'camera_issue' && subcategory === 'not_working' && (
            <div className="space-y-4">
              <div>
                <Label>Reason</Label>
                <Textarea
                  value={detailsText}
                  onChange={(e) => setDetailsText(e.target.value)}
                  placeholder="Explain why your camera is not working..."
                  rows={4}
                />
              </div>
              <Button onClick={handleSubmit} disabled={isSubmitting || !detailsText}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Submit Issue
              </Button>
            </div>
          )}

          {/* Camera excused form */}
          {category === 'camera_issue' && subcategory === 'excused' && (
            <div className="space-y-4">
              <div className="p-4 bg-warning/10 rounded-lg text-warning text-sm">
                <AlertCircle className="w-4 h-4 inline mr-2" />
                You must email proof of approval from Sir to the TAs.
              </div>

              <div>
                <Label>Duration</Label>
                <RadioGroup value={cameraDuration} onValueChange={(v) => setCameraDuration(v as CameraDuration)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="one_day" id="one_day" />
                    <Label htmlFor="one_day">One day</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="recurring" id="recurring" />
                    <Label htmlFor="recurring">Recurring days</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="blanket" id="blanket" />
                    <Label htmlFor="blanket">Blanket approval</Label>
                  </div>
                </RadioGroup>
              </div>

              {cameraDuration === 'one_day' && (
                <div>
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={cameraDate}
                    onChange={(e) => setCameraDate(e.target.value)}
                  />
                </div>
              )}

              {(cameraDuration === 'recurring' || cameraDuration === 'blanket') && (
                <div>
                  <Label>Days</Label>
                  <Select value={cameraDays} onValueChange={setCameraDays}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Friday">Friday only</SelectItem>
                      <SelectItem value="Saturday">Saturday only</SelectItem>
                      <SelectItem value="Both">Friday & Saturday</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {cameraDuration === 'recurring' && (
                <div>
                  <Label>Number of weeks</Label>
                  <Input
                    type="number"
                    min="1"
                    value={cameraWeeks}
                    onChange={(e) => setCameraWeeks(e.target.value)}
                  />
                </div>
              )}

              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Submit Issue
              </Button>
            </div>
          )}

          {/* Two devices - no extra fields */}
          {category === 'two_devices' && (
            <div className="space-y-4">
              <p className="text-muted-foreground">This request will notify the TAs that you need to join class from two devices.</p>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Submit Request
              </Button>
            </div>
          )}

          {/* Connectivity issue */}
          {category === 'connectivity_issue' && (
            <div className="space-y-4">
              <div>
                <Label>Reason</Label>
                <Textarea
                  value={detailsText}
                  onChange={(e) => setDetailsText(e.target.value)}
                  placeholder="Describe your connectivity issue..."
                  rows={4}
                />
              </div>
              <Button onClick={handleSubmit} disabled={isSubmitting || !detailsText}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Submit Issue
              </Button>
            </div>
          )}

          {/* Other class issue */}
          {groupType === 'class_issue' && category === 'other' && (
            <div className="space-y-4">
              <div>
                <Label>Description</Label>
                <Textarea
                  value={detailsText}
                  onChange={(e) => setDetailsText(e.target.value)}
                  placeholder="Describe your issue..."
                  rows={4}
                />
              </div>
              <Button onClick={handleSubmit} disabled={isSubmitting || !detailsText}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Submit Issue
              </Button>
            </div>
          )}

          {/* Grading query */}
          {groupType === 'grading_query' && (
            <div className="space-y-4">
              <div>
                <Label>Submission</Label>
                <Select value={selectedSubmission} onValueChange={setSelectedSubmission}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select submission" />
                  </SelectTrigger>
                  <SelectContent>
                    {submissions.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Questions (comma-separated, e.g., "1, 1a part 1, 2b")</Label>
                <Input
                  value={questions}
                  onChange={(e) => setQuestions(e.target.value)}
                  placeholder="e.g., 1, 1a part 1, 2b"
                />
              </div>

              <div>
                <Label>Query</Label>
                <Textarea
                  value={detailsText}
                  onChange={(e) => setDetailsText(e.target.value)}
                  placeholder="Describe your grading query..."
                  rows={4}
                />
              </div>

              <Button onClick={handleSubmit} disabled={isSubmitting || !selectedSubmission || !detailsText}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Submit Query
              </Button>
            </div>
          )}

          {/* Penalty query */}
          {groupType === 'penalty_query' && (
            <div className="space-y-4">
              <div>
                <Label>Penalty Type</Label>
                <Select value={selectedPenalty} onValueChange={(v) => {
                  setSelectedPenalty(v);
                  calculateEligibleSessions(v);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select penalty type" />
                  </SelectTrigger>
                  <SelectContent>
                    {penaltyTypes.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedPenalty && (
                <p className="text-sm text-muted-foreground">
                  <AlertCircle className="w-4 h-4 inline mr-1" />
                  Naming penalties can only be reported within 24 hours.
                </p>
              )}

              {selectedPenalty && (
                <div>
                  <Label>Session</Label>
                  <Select value={selectedSession} onValueChange={setSelectedSession}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select session" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleSessions.length === 0 ? (
                        <SelectItem value="" disabled>No eligible sessions in time window</SelectItem>
                      ) : (
                        eligibleSessions.map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            Session {s.session_number} - {format(new Date(s.session_date), 'MMM d')} ({s.day_of_week})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>Query</Label>
                <Textarea
                  value={detailsText}
                  onChange={(e) => setDetailsText(e.target.value)}
                  placeholder="Describe your penalty query..."
                  rows={4}
                />
              </div>

              <Button onClick={handleSubmit} disabled={isSubmitting || !selectedPenalty || !detailsText}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Submit Query
              </Button>
            </div>
          )}

          {/* Absence query */}
          {groupType === 'absence_query' && (
            <div className="space-y-4">
              <div>
                <Label>Session</Label>
                <Select value={selectedSession} onValueChange={setSelectedSession}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select session" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        Session {s.session_number} - {format(new Date(s.session_date), 'MMM d')} ({s.day_of_week})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Query Type</Label>
                <Select value={absenceType} onValueChange={setAbsenceType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select query type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="why_absent">Why was I marked absent?</SelectItem>
                    <SelectItem value="request_excusal">Request excusal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  value={detailsText}
                  onChange={(e) => setDetailsText(e.target.value)}
                  placeholder="Provide details for your query..."
                  rows={4}
                />
              </div>

              <Button onClick={handleSubmit} disabled={isSubmitting || !selectedSession || !absenceType || !detailsText}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Submit Query
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
