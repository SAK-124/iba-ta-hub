import { useEffect, useState } from 'react';
import { useERP } from '@/lib/erp-context';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SubmitIssue from './SubmitIssue';
import MyIssues from './MyIssues';
import AttendanceView from './AttendanceView';
import LateDays from './LateDays';
import { useAuth } from '@/lib/auth';
import { useAppSettingsQuery } from '@/features/settings';
import { useLateDaysSummary } from '@/features/late-days';

type StudentPortalTab = 'submit' | 'issues' | 'attendance' | 'late-days';

interface LateDaysSummary {
  remaining: number;
  totalAllowance: number;
}

export default function StudentPortal() {
  const { erp, isVerified, studentName, isLoading } = useERP();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<StudentPortalTab>('attendance');
  const [hasInitializedTab, setHasInitializedTab] = useState(false);
  const { data: appSettings, isLoading: isSettingsLoading } = useAppSettingsQuery();
  const ticketsEnabled = appSettings?.tickets_enabled ?? true;
  const { data: lateDaysSummary, isLoading: isLateDaysLoading } = useLateDaysSummary(
    isVerified ? user?.email ?? null : null,
    isVerified ? erp : null,
  );
  const lateDaysRemaining = lateDaysSummary.remaining;
  const lateDaysTotal = lateDaysSummary.totalAllowance;

  useEffect(() => {
    if (!isSettingsLoading && !hasInitializedTab) {
      setActiveTab(ticketsEnabled ? 'submit' : 'attendance');
      setHasInitializedTab(true);
    }
  }, [isSettingsLoading, ticketsEnabled, hasInitializedTab]);

  const handleLateDaysSummaryChange = (_summary: LateDaysSummary) => {
    // Keep callback for LateDays component contract; source of truth is feature hook above.
  };

  if (isLoading || isSettingsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="container max-w-5xl mx-auto p-4 md:p-8 space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
        <div className="space-y-1 text-center md:text-left">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground text-center md:text-left">
            Student Portal
          </h1>
          <p className="text-muted-foreground text-lg">Manage your course issues and track attendance</p>
        </div>

        {erp && (
          <div className="w-full md:w-auto">
            <div className={`glass-card p-4 rounded-2xl border flex items-center gap-4 transition-all duration-300 hover:scale-[1.02] ${isVerified ? 'border-success/20 bg-success/5' : 'border-destructive/20 bg-destructive/5'}`}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isVerified ? 'bg-success/20 text-success' : 'bg-destructive/10 text-destructive'}`}>
                {isVerified ? <CheckCircle2 className="h-6 w-6" /> : <AlertCircle className="h-6 w-6" />}
              </div>
              <div className="flex flex-col">
                <span className={`text-sm font-bold tracking-wide uppercase ${isVerified ? 'text-success' : 'text-destructive'}`}>
                  {isVerified ? 'Verified Account' : 'Status: Unverified'}
                </span>
                <span className="text-foreground font-semibold">
                  {isVerified ? `${studentName} (${erp})` : `ERP: ${erp}`}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {!isVerified && erp ? (
        <div className="glass-card border-destructive/20 bg-destructive/5 p-8 rounded-2xl flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-destructive">Access Restricted</h2>
            <p className="text-muted-foreground max-w-md">
              Your ERP <span className="font-mono bg-destructive/10 px-1.5 py-0.5 rounded text-destructive">{erp}</span> was not found in the official roster. Please contact the TAs if you believe this is an error.
            </p>
          </div>
        </div>
      ) : isVerified ? (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Late Days</CardTitle>
                  <CardDescription>You can use 3 base late days plus any TA-granted bonus days.</CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-md border px-3 py-1 text-sm font-semibold">
                    {isLateDaysLoading ? 'Loading...' : `${lateDaysRemaining} / ${lateDaysTotal} left`}
                  </span>
                  <Button onClick={() => setActiveTab('late-days')}>
                    Avail Late Days
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as StudentPortalTab)} className="w-full space-y-8">
            <TabsList className="flex w-full bg-muted/30 p-1.5 rounded-xl h-auto overflow-x-auto no-scrollbar">
              {ticketsEnabled && (
                <TabsTrigger value="submit" className="flex-1 py-3 px-6 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg transition-all duration-300">
                  Submit Issue
                </TabsTrigger>
              )}
              {ticketsEnabled && (
                <TabsTrigger value="issues" className="flex-1 py-3 px-6 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg transition-all duration-300">
                  My Issues
                </TabsTrigger>
              )}
              <TabsTrigger value="attendance" className="flex-1 py-3 px-6 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg transition-all duration-300">
                Attendance
              </TabsTrigger>
              <TabsTrigger value="late-days" className="flex-1 py-3 px-6 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg transition-all duration-300">
                Late Days
              </TabsTrigger>
            </TabsList>

            {ticketsEnabled && (
              <TabsContent value="submit" className="mt-6">
                <SubmitIssue />
              </TabsContent>
            )}

            {ticketsEnabled && (
              <TabsContent value="issues" className="mt-6">
                <MyIssues />
              </TabsContent>
            )}

            <TabsContent value="attendance" className="mt-6">
              {!ticketsEnabled && (
                <Card className="mb-6 border-amber-300/60 bg-amber-50/50">
                  <CardHeader>
                    <CardTitle className="text-lg">Ticketing is currently disabled</CardTitle>
                    <CardDescription>
                      Complaints/ticket submission is temporarily turned off by the TA team. Please email the TAs directly for support.
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}
              <AttendanceView />
            </TabsContent>

            <TabsContent value="late-days" className="mt-6">
              <LateDays onSummaryChange={handleLateDaysSummaryChange} />
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p>Could not identify your ERP from your email.</p>
          <p className="text-sm mt-2">Please ensure you are logged in with your IBA email.</p>
        </div>
      )}
    </div>
  );
}
