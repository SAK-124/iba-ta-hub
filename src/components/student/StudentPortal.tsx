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
        <Tabs defaultValue="submit" className="w-full space-y-8">
          <TabsList className="flex w-full bg-muted/30 p-1.5 rounded-xl h-auto overflow-x-auto no-scrollbar">
            <TabsTrigger value="submit" className="flex-1 py-3 px-6 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg transition-all duration-300">
              Submit Issue
            </TabsTrigger>
            <TabsTrigger value="issues" className="flex-1 py-3 px-6 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg transition-all duration-300">
              My Issues
            </TabsTrigger>
            <TabsTrigger value="attendance" className="flex-1 py-3 px-6 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg transition-all duration-300">
              Attendance
            </TabsTrigger>
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
