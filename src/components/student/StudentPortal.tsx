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
  const { erp, setERP, isVerified, studentName, isLoading } = useERP();
  const [inputErp, setInputErp] = useState(erp || '');

  const handleErpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputErp.trim()) {
      setERP(inputErp.trim());
    }
  };

  return (
    <div className="container max-w-4xl mx-auto p-4 space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Student Portal</h1>
          <p className="text-muted-foreground">Manage your course issues and track attendance</p>
        </div>

        <Card className="w-full md:w-auto min-w-[300px]">
          <CardContent className="pt-6">
            <form onSubmit={handleErpSubmit} className="flex gap-2">
              <Input
                placeholder="Enter your ERP"
                value={inputErp}
                onChange={(e) => setInputErp(e.target.value)}
                className={isVerified ? "border-green-500" : ""}
              />
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </form>
            {erp && (
              <div className="mt-2 text-sm flex items-center gap-2">
                {isVerified ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-green-600 font-medium">Verified: {studentName}</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span className="text-destructive font-medium">Not found in roster</span>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {!isVerified && erp && !isLoading ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Access Restricted
            </CardTitle>
            <CardDescription className="text-destructive/90">
              Your ERP wasn't found in the roster. Please contact the TAs via email.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Tabs defaultValue="submit" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="submit" disabled={!isVerified}>Submit Issue</TabsTrigger>
            <TabsTrigger value="issues" disabled={!isVerified}>My Issues</TabsTrigger>
            <TabsTrigger value="attendance" disabled={!isVerified}>Attendance</TabsTrigger>
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
      )}
    </div>
  );
}
