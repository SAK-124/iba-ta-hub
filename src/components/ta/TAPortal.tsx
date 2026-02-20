import { useEffect, useState, type ReactNode } from 'react';
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
import LateDaysManagement from './LateDaysManagement';

type PortalTabValue =
  | 'zoom'
  | 'attendance'
  | 'sessions'
  | 'consolidated'
  | 'exceptions'
  | 'roster'
  | 'late-days'
  | 'export'
  | 'issues'
  | 'settings';

interface PortalUiCache {
  activeTab: PortalTabValue;
  visitedTabs: PortalTabValue[];
}

let taPortalUiCache: PortalUiCache | null = null;

const isPortalTabValue = (value: string): value is PortalTabValue =>
  ['zoom', 'attendance', 'sessions', 'consolidated', 'exceptions', 'roster', 'late-days', 'export', 'issues', 'settings'].includes(value);

const tabTriggerClassName =
  'portal-tab-trigger group flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25';

interface AnimatedTabTriggerProps {
  value: PortalTabValue;
  label: string;
  mobileLabel?: string;
  icon: ReactNode;
}

function AnimatedTabTrigger({ value, label, mobileLabel, icon }: AnimatedTabTriggerProps) {
  return (
    <TabsTrigger value={value} className={tabTriggerClassName}>
      {icon}
      {mobileLabel ? (
        <>
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">{mobileLabel}</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </TabsTrigger>
  );
}

export default function TAPortal() {
  const cached = taPortalUiCache;
  const [activeTab, setActiveTab] = useState<PortalTabValue>(() => cached?.activeTab ?? 'zoom');
  const [visitedTabs, setVisitedTabs] = useState<Set<PortalTabValue>>(
    () => new Set(cached?.visitedTabs ?? ['zoom'])
  );

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  useEffect(() => {
    taPortalUiCache = {
      activeTab,
      visitedTabs: Array.from(visitedTabs),
    };
  }, [activeTab, visitedTabs]);

  const handleTabChange = (value: string) => {
    if (!isPortalTabValue(value)) return;

    setActiveTab(value);
    setVisitedTabs((prev) => {
      if (prev.has(value)) return prev;
      const next = new Set(prev);
      next.add(value);
      return next;
    });
  };

  const shouldRenderTab = (tab: PortalTabValue) => visitedTabs.has(tab) || activeTab === tab;

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
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="portal-tabs-list flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl p-1.5">
          {/* Group A */}
          <AnimatedTabTrigger
            value="zoom"
            label="Zoom Process"
            mobileLabel="Zoom"
            icon={
              <svg viewBox="0 0 24 24" className="portal-tab-icon" aria-hidden="true">
                <rect x="2" y="6" width="14" height="12" rx="2" />
                <polygon className="zoom-lens" points="16,10 22,7 22,17 16,14" />
                <circle className="zoom-dot" cx="6" cy="10" r="1.5" />
              </svg>
            }
          />
          <AnimatedTabTrigger
            value="attendance"
            label="Attendance"
            mobileLabel="Attend"
            icon={
              <svg viewBox="0 0 24 24" className="portal-tab-icon" aria-hidden="true">
                <path className="att-board" d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect className="att-board" x="8" y="2" width="8" height="4" rx="1" />
                <path className="att-check" d="M9 14l2 2 4-4" />
              </svg>
            }
          />
          <AnimatedTabTrigger
            value="sessions"
            label="Sessions"
            icon={
              <svg viewBox="0 0 24 24" className="portal-tab-icon" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <line className="sess-dot sess-dot-1" x1="8" y1="14" x2="8.01" y2="14" />
                <line className="sess-dot sess-dot-2" x1="12" y1="14" x2="12.01" y2="14" />
                <line className="sess-dot sess-dot-3" x1="16" y1="14" x2="16.01" y2="14" />
                <line className="sess-dot sess-dot-2" x1="8" y1="18" x2="8.01" y2="18" />
                <line className="sess-dot sess-dot-3" x1="12" y1="18" x2="12.01" y2="18" />
                <line className="sess-dot sess-dot-1" x1="16" y1="18" x2="16.01" y2="18" />
              </svg>
            }
          />
          <AnimatedTabTrigger
            value="consolidated"
            label="Consolidated"
            mobileLabel="Sheet"
            icon={
              <svg viewBox="0 0 24 24" className="portal-tab-icon" aria-hidden="true">
                <polygon className="layer layer-1" points="12 2 2 7 12 12 22 7" />
                <polyline className="layer layer-2" points="2 12 12 17 22 12" />
                <polyline className="layer layer-3" points="2 17 12 22 22 17" />
              </svg>
            }
          />
          <AnimatedTabTrigger
            value="exceptions"
            label="Exceptions"
            mobileLabel="Rules"
            icon={
              <svg viewBox="0 0 24 24" className="portal-tab-icon" aria-hidden="true">
                <path d="M12 22 L12 6" />
                <path d="M9 22 L15 22" />
                <line className="scale-beam" x1="4" y1="6" x2="20" y2="6" />
                <path className="scale-pan-l" d="M2 12 L6 12 L4 6 Z" />
                <path className="scale-pan-r" d="M18 12 L22 12 L20 6 Z" />
              </svg>
            }
          />

          <div className="mx-1 h-6 w-px self-center bg-border/80" aria-hidden="true" />

          {/* Group B */}
          <AnimatedTabTrigger
            value="roster"
            label="Roster"
            icon={
              <svg viewBox="0 0 24 24" className="portal-tab-icon" aria-hidden="true">
                <g>
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </g>
                <g>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </g>
                <line className="roster-scan" x1="2" y1="2" x2="2" y2="22" />
              </svg>
            }
          />
          <AnimatedTabTrigger
            value="late-days"
            label="Late Days"
            icon={
              <svg viewBox="0 0 24 24" className="portal-tab-icon" aria-hidden="true">
                <g className="hourglass-frame">
                  <path d="M5 2h14 M5 22h14" />
                  <path d="M19 2l-7 9-7-9z M5 22l7-9 7 9z" />
                </g>
                <line className="sand-stream" x1="12" y1="11" x2="12" y2="18" />
              </svg>
            }
          />
          <AnimatedTabTrigger
            value="export"
            label="Export"
            icon={
              <svg viewBox="0 0 24 24" className="portal-tab-icon" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <g className="export-arrow">
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </g>
              </svg>
            }
          />
          <AnimatedTabTrigger
            value="issues"
            label="Issues"
            icon={
              <svg viewBox="0 0 24 24" className="portal-tab-icon" aria-hidden="true">
                <circle className="issue-circle" cx="12" cy="12" r="10" />
                <line className="issue-mark" x1="12" y1="8" x2="12" y2="12" />
                <line className="issue-mark" x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            }
          />
          <AnimatedTabTrigger
            value="settings"
            label="Settings"
            icon={
              <svg viewBox="0 0 24 24" className="portal-tab-icon" aria-hidden="true">
                <g className="gear-icon">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </g>
              </svg>
            }
          />
        </TabsList>

        {/* Tab Contents */}
        {shouldRenderTab('zoom') && (
          <TabsContent value="zoom" className="mt-6" forceMount>
            <TAZoomProcess />
          </TabsContent>
        )}

        {shouldRenderTab('attendance') && (
          <TabsContent value="attendance" className="mt-6" forceMount>
            <AttendanceMarking />
          </TabsContent>
        )}

        {shouldRenderTab('sessions') && (
          <TabsContent value="sessions" className="mt-6" forceMount>
            <SessionManagement />
          </TabsContent>
        )}

        {shouldRenderTab('consolidated') && (
          <TabsContent value="consolidated" className="mt-6" forceMount>
            <ConsolidatedView />
          </TabsContent>
        )}

        {shouldRenderTab('exceptions') && (
          <TabsContent value="exceptions" className="mt-6" forceMount>
            <RuleExceptions />
          </TabsContent>
        )}

        {shouldRenderTab('roster') && (
          <TabsContent value="roster" className="mt-6" forceMount>
            <RosterManagement />
          </TabsContent>
        )}

        {shouldRenderTab('late-days') && (
          <TabsContent value="late-days" className="mt-6" forceMount>
            <LateDaysManagement />
          </TabsContent>
        )}

        {shouldRenderTab('export') && (
          <TabsContent value="export" className="mt-6" forceMount>
            <ExportData />
          </TabsContent>
        )}

        {shouldRenderTab('issues') && (
          <TabsContent value="issues" className="mt-6" forceMount>
            <IssueManagement />
          </TabsContent>
        )}

        {shouldRenderTab('settings') && (
          <TabsContent value="settings" className="mt-6" forceMount>
            <ListsSettings />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
