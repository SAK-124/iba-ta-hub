import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import IssueManagement from './IssueManagement';
import AttendanceMarking from './AttendanceMarking';
import RosterManagement from './RosterManagement';
import SessionManagement from './SessionManagement';
import ListsSettings from './ListsSettings';
import ExportData from './ExportData';
import ConsolidatedView from './ConsolidatedView';

export default function TAPortal() {
  return (
    <div className="container mx-auto p-4 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">TA Dashboard</h1>
        <div className="text-sm text-muted-foreground">Admin Access</div>
      </div>

      <Tabs defaultValue="issues" className="w-full">
        <TabsList className="flex w-full overflow-x-auto justify-start h-auto p-1">
          <TabsTrigger value="issues">Issues</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="consolidated">Consolidated</TabsTrigger>
          <TabsTrigger value="lists">Settings</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>

        <TabsContent value="issues" className="mt-6 space-y-4">
          <IssueManagement />
        </TabsContent>

        <TabsContent value="attendance" className="mt-6 space-y-4">
          <AttendanceMarking />
        </TabsContent>

        <TabsContent value="roster" className="mt-6 space-y-4">
          <RosterManagement />
        </TabsContent>

        <TabsContent value="sessions" className="mt-6 space-y-4">
          <SessionManagement />
        </TabsContent>

        <TabsContent value="consolidated" className="mt-6 space-y-4">
          <ConsolidatedView />
        </TabsContent>

        <TabsContent value="lists" className="mt-6 space-y-4">
          <ListsSettings />
        </TabsContent>

        <TabsContent value="export" className="mt-6 space-y-4">
          <ExportData />
        </TabsContent>
      </Tabs>
    </div>
  );
}
