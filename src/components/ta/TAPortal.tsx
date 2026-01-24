import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Ticket, CalendarCheck, Users, Calendar, Settings, Download } from 'lucide-react';
import TAIssues from '@/components/ta/TAIssues';
import TAAttendance from '@/components/ta/TAAttendance';
import TARoster from '@/components/ta/TARoster';
import TASessions from '@/components/ta/TASessions';
import TASettings from '@/components/ta/TASettings';
import TAExport from '@/components/ta/TAExport';

export default function TAPortal() {
  const [activeTab, setActiveTab] = useState('issues');

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold mb-6">TA Portal</h2>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 mb-6">
          <TabsTrigger value="issues" className="flex items-center gap-2">
            <Ticket className="w-4 h-4" />
            <span className="hidden sm:inline">Issues</span>
          </TabsTrigger>
          <TabsTrigger value="attendance" className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Attendance</span>
          </TabsTrigger>
          <TabsTrigger value="roster" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Roster</span>
          </TabsTrigger>
          <TabsTrigger value="sessions" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <span className="hidden sm:inline">Sessions</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Settings</span>
          </TabsTrigger>
          <TabsTrigger value="export" className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="issues">
          <TAIssues />
        </TabsContent>
        
        <TabsContent value="attendance">
          <TAAttendance />
        </TabsContent>
        
        <TabsContent value="roster">
          <TARoster />
        </TabsContent>
        
        <TabsContent value="sessions">
          <TASessions />
        </TabsContent>
        
        <TabsContent value="settings">
          <TASettings />
        </TabsContent>
        
        <TabsContent value="export">
          <TAExport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
