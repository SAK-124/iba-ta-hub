import { useEffect, useState } from 'react';
import { useERP } from '@/lib/erp-context';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import SubmitIssue from './SubmitIssue';
import MyIssues from './MyIssues';
import AttendanceView from './AttendanceView';
import LateDays from './LateDays';
import Groups from './Groups';
import { useAuth } from '@/lib/auth';
import { useAppSettingsQuery } from '@/features/settings';
import { readScopedSessionStorage, writeScopedSessionStorage } from '@/lib/scoped-session-storage';

type StudentPortalTab = 'submit' | 'issues' | 'attendance' | 'groups' | 'late-days';
const STUDENT_STORAGE_SCOPE = 'student';
const ACTIVE_TAB_STORAGE_KEY = 'active-tab';

const isStudentPortalTab = (value: string | null): value is StudentPortalTab =>
  value === 'submit' || value === 'issues' || value === 'attendance' || value === 'groups' || value === 'late-days';

export default function StudentPortal() {
  const { erp, isVerified, studentName, isLoading } = useERP();
  const { user } = useAuth();
  const storageUserKey = user?.email ?? erp ?? null;
  const storedActiveTab = readScopedSessionStorage<string | null>(
    STUDENT_STORAGE_SCOPE,
    storageUserKey,
    ACTIVE_TAB_STORAGE_KEY,
    null,
  );
  const [activeTab, setActiveTab] = useState<StudentPortalTab>(
    isStudentPortalTab(storedActiveTab) ? storedActiveTab : 'attendance',
  );
  const [hasInitializedTab, setHasInitializedTab] = useState(false);
  const { data: appSettings, isLoading: isSettingsLoading } = useAppSettingsQuery();
  const ticketsEnabled = appSettings?.tickets_enabled ?? true;

  useEffect(() => {
    if (!isSettingsLoading && !hasInitializedTab) {
      setActiveTab((currentTab) => {
        if (ticketsEnabled) {
          if (!isStudentPortalTab(storedActiveTab)) {
            return 'submit';
          }
          return currentTab;
        }

        if (currentTab === 'submit' || currentTab === 'issues') {
          return 'attendance';
        }

        return currentTab;
      });
      setHasInitializedTab(true);
    }
  }, [isSettingsLoading, ticketsEnabled, hasInitializedTab]);

  useEffect(() => {
    if (!hasInitializedTab) {
      return;
    }

    writeScopedSessionStorage(STUDENT_STORAGE_SCOPE, storageUserKey, ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab, hasInitializedTab, storageUserKey]);

  if (isLoading || isSettingsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
        <div className="space-y-2 text-center md:text-left">
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
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as StudentPortalTab)} className="w-full space-y-6">
            <div className="w-full overflow-x-auto no-scrollbar">
              <TabsList className="flex h-auto min-w-full w-max justify-start gap-1 rounded-xl bg-muted/30 p-1.5">
                {ticketsEnabled && (
                  <TabsTrigger value="submit" className="min-w-[8rem] flex-1 rounded-lg px-4 py-3 transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg sm:min-w-0">
                    Submit Issue
                  </TabsTrigger>
                )}
                {ticketsEnabled && (
                  <TabsTrigger value="issues" className="min-w-[8rem] flex-1 rounded-lg px-4 py-3 transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg sm:min-w-0">
                    My Issues
                  </TabsTrigger>
                )}
                <TabsTrigger value="attendance" className="min-w-[8rem] flex-1 rounded-lg px-4 py-3 transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg sm:min-w-0">
                  Attendance
                </TabsTrigger>
                <TabsTrigger value="groups" className="min-w-[8rem] flex-1 rounded-lg px-4 py-3 transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg sm:min-w-0">
                  Groups
                </TabsTrigger>
                <TabsTrigger value="late-days" className="min-w-[8rem] flex-1 rounded-lg px-4 py-3 transition-all duration-300 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg sm:min-w-0">
                  Late Days
                </TabsTrigger>
              </TabsList>
            </div>

            {ticketsEnabled && (
              <TabsContent value="submit" className="mt-0">
                <SubmitIssue />
              </TabsContent>
            )}

            {ticketsEnabled && (
              <TabsContent value="issues" className="mt-0">
                <MyIssues />
              </TabsContent>
            )}

            <TabsContent value="attendance" className="mt-0">
              <AttendanceView />
            </TabsContent>

            <TabsContent value="groups" className="mt-0">
              <Groups />
            </TabsContent>

            <TabsContent value="late-days" className="mt-0">
              <LateDays />
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
