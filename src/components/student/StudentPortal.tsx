import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Clock, CalendarCheck } from 'lucide-react';
import ERPInput from '@/components/student/ERPInput';
import SubmitIssue from '@/components/student/SubmitIssue';
import MyIssues from '@/components/student/MyIssues';
import Attendance from '@/components/student/Attendance';
import { useERP } from '@/lib/erp-context';

export default function StudentPortal() {
  const [activeTab, setActiveTab] = useState('submit');
  const { erp, rosterInfo, isVerificationEnabled } = useERP();

  const isBlocked = erp && isVerificationEnabled && rosterInfo && !rosterInfo.found;
  const canAccessFeatures = erp && (!isVerificationEnabled || (rosterInfo && rosterInfo.found));

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold mb-6">Student Portal</h2>
      
      <ERPInput />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="submit" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Submit Issue</span>
            <span className="sm:hidden">Submit</span>
          </TabsTrigger>
          <TabsTrigger value="issues" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span className="hidden sm:inline">My Issues</span>
            <span className="sm:hidden">Issues</span>
          </TabsTrigger>
          <TabsTrigger value="attendance" className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Attendance</span>
            <span className="sm:hidden">Attend.</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="submit">
          <SubmitIssue canAccess={canAccessFeatures} isBlocked={isBlocked} />
        </TabsContent>
        
        <TabsContent value="issues">
          <MyIssues canAccess={canAccessFeatures} isBlocked={isBlocked} />
        </TabsContent>
        
        <TabsContent value="attendance">
          <Attendance canAccess={canAccessFeatures} isBlocked={isBlocked} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
