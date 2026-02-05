import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import IssueManagement from './IssueManagement';
import AttendanceMarking from './AttendanceMarking';
import RosterManagement from './RosterManagement';
import SessionManagement from './SessionManagement';
import ListsSettings from './ListsSettings';
import ExportData from './ExportData';
import ConsolidatedView from './ConsolidatedView';
import RuleExceptions from './RuleExceptions';
import TAZoomProcess from './TAZoomProcess';
import {
  Users,
  Calendar,
  ClipboardCheck,
  FileSpreadsheet,
  AlertCircle,
  Settings,
  Download,
  Scale,
  Video
} from 'lucide-react';

export default function TAPortal() {
  const [activeTab, setActiveTab] = useState('zoom');

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">TA Dashboard</h1>
          <p className="text-sm text-muted-foreground">Manage attendance, roster, and student issues</p>
        </div>
        <div className="text-xs font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20">
          Admin Access
        </div>
      </div>

      {/* Tabs - Ordered by workflow: Setup → Daily Use → Review → Admin */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex w-full overflow-x-auto justify-start h-auto p-1.5 gap-1 bg-muted/50 rounded-xl">
          {/* Primary: Daily Workflow */}
          <TabsTrigger value="zoom" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
            <Video className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Zoom Process</span>
            <span className="sm:hidden">Zoom</span>
          </TabsTrigger>
          <TabsTrigger value="attendance" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Attendance</span>
            <span className="sm:hidden">Attend</span>
          </TabsTrigger>
          <TabsTrigger value="issues" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Issues</span>
          </TabsTrigger>

          {/* Secondary: Data Views */}
          <TabsTrigger value="consolidated" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Consolidated</span>
            <span className="sm:hidden">Sheet</span>
          </TabsTrigger>
          <TabsTrigger value="export" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </TabsTrigger>

          {/* Tertiary: Setup & Config */}
          <TabsTrigger value="roster" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
            <Users className="w-3.5 h-3.5" />
            <span>Roster</span>
          </TabsTrigger>
          <TabsTrigger value="sessions" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
            <Calendar className="w-3.5 h-3.5" />
            <span>Sessions</span>
          </TabsTrigger>
          <TabsTrigger value="exceptions" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
            <Scale className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exceptions</span>
            <span className="sm:hidden">Rules</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab Contents */}
        <TabsContent value="zoom" className="mt-6" forceMount>
          <TAZoomProcess />
        </TabsContent>

        <TabsContent value="attendance" className="mt-6">
          <AttendanceMarking />
        </TabsContent>

        <TabsContent value="issues" className="mt-6">
          <IssueManagement />
        </TabsContent>

        <TabsContent value="consolidated" className="mt-6">
          <ConsolidatedView />
        </TabsContent>

        <TabsContent value="export" className="mt-6">
          <ExportData />
        </TabsContent>

        <TabsContent value="roster" className="mt-6">
          <RosterManagement />
        </TabsContent>

        <TabsContent value="sessions" className="mt-6">
          <SessionManagement />
        </TabsContent>

        <TabsContent value="exceptions" className="mt-6">
          <RuleExceptions />
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <ListsSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
