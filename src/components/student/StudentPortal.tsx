import { useState } from 'react';
import { useERP } from '@/lib/erp-context';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Search } from 'lucide-react';
import SubmitIssue from './SubmitIssue';
import MyIssues from './MyIssues';
import AttendanceView from './AttendanceView';

export default function StudentPortal() {
  const { erp, isVerified, studentName, isLoading } = useERP();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto p-4 space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Student Portal</h1>
          <p className="text-muted-foreground">Manage your course issues and track attendance</p>
        </div>

        {erp && (
          <Card className="w-full md:w-auto min-w-[300px]">
            <CardContent className="pt-6">
              <div className="text-sm flex items-center gap-2">
                {isVerified ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-green-600 font-medium">Verified: {studentName} ({erp})</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span className="text-destructive font-medium">Not found in roster: {erp}</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {!isVerified && erp ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Access Restricted
            </CardTitle>
            <CardDescription className="text-destructive/90">
              Your ERP ({erp}) wasn't found in the roster. Please contact the TAs via email if you believe this is a mistake.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : isVerified ? (
        <Tabs defaultValue="submit" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-auto">
            <TabsTrigger value="submit">Submit Issue</TabsTrigger>
            <TabsTrigger value="issues">My Issues</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
          </TabsList>

          <TabsContent value="submit" className="mt-6">
            <SubmitIssue />
          </TabsContent>

          <TabsContent value="issues" className="mt-6">
            <MyIssues />
          </TabsContent>

          <TabsContent value="attendance" className="mt-6">
            <AttendanceView />
          </TabsContent>
        </Tabs>
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
