import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Download,
  Layers,
  LogOut,
  MessageSquare,
  Settings,
  ShieldAlert,
  Users,
  Video,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/lib/auth';
import {
  getScreenContextSummary,
  type AgentCommandEnvelope,
  type AttendanceAgentCommand,
  type ConsolidatedAgentCommand,
  type ExportAgentCommand,
  type HelpAssistantAction,
  type HelpContextSnapshot,
  type IssueQueueAgentCommand,
  type LateDaysAgentCommand,
  type RosterAgentCommand,
  type RuleExceptionsAgentCommand,
  type SessionAgentCommand,
  type SettingsAgentCommand,
  type ZoomAgentCommand,
} from '@/lib/ta-help-actions';
import {
  readScopedSessionStorage,
  removeScopedSessionStorage,
  writeScopedSessionStorage,
} from '@/lib/scoped-session-storage';
import { cn } from '@/lib/utils';
import {
  normalizeZoomSessionReport,
  type ZoomReportLoadRequest,
  type ZoomSessionReport,
} from '@/lib/zoom-session-report';
import PortalLoadingScreen from '@/components/PortalLoadingScreen';
import TAHelpAssistant from './TAHelpAssistant';

const TAZoomProcess = lazy(() => import('./TAZoomProcess'));
const AttendanceMarking = lazy(() => import('./AttendanceMarking'));
const SessionManagement = lazy(() => import('./SessionManagement'));
const ConsolidatedView = lazy(() => import('./ConsolidatedView'));
const RuleExceptions = lazy(() => import('./RuleExceptions'));
const RosterManagement = lazy(() => import('./RosterManagement'));
const LateDaysManagement = lazy(() => import('./LateDaysManagement'));
const ExportData = lazy(() => import('./ExportData'));
const IssueManagement = lazy(() => import('./IssueManagement'));
const ListsSettings = lazy(() => import('./ListsSettings'));

type PortalModule =
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

type AttendanceWorkspaceTab = 'zoom' | 'attendance';

interface SessionManagementAgentPrefill {
  token: number;
  selectedDate: string | null;
  focusField: 'session-number' | null;
}

const makeCommandEnvelope = <T,>(command: T, token: number): AgentCommandEnvelope<T> => ({
  token,
  command,
});

interface ModuleConfig {
  id: PortalModule;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  colSpan?: 1 | 2;
}

const ATTENDANCE_TAB_STORAGE_KEY = 'ta-attendance-workspace-tab';
const TA_STORAGE_SCOPE = 'ta';
const ACTIVE_MODULE_STORAGE_KEY = 'active-module';
const ATTENDANCE_WORKSPACE_TAB_STORAGE_KEY = 'attendance-workspace-tab';
const LATEST_ZOOM_REPORT_STORAGE_KEY = 'latest-final-zoom-report';
const MODULE_SUSPENSE_FALLBACK = (
  <PortalLoadingScreen
    title="Loading Module"
    subtitle="Preparing tools and data for this workspace..."
  />
);

const MODULES: ModuleConfig[] = [
  { id: 'zoom', title: 'Zoom Processor', description: 'Upload logs, review matches, and generate attendance', icon: Video, colSpan: 2 },
  { id: 'attendance', title: 'Live Attendance', description: 'Mark attendance live and apply manual overrides', icon: ClipboardCheck, colSpan: 1 },
  { id: 'roster', title: 'Roster Management', description: 'Import and manage the student master list', icon: Users, colSpan: 1 },
  { id: 'consolidated', title: 'Consolidated View', description: 'Review full attendance with penalties by session', icon: Layers, colSpan: 1 },
  { id: 'sessions', title: 'Session Management', description: 'Configure session calendar and timing rules', icon: CalendarDays, colSpan: 1 },
  { id: 'exceptions', title: 'Rule Exceptions', description: 'Manage approved exceptions and overrides', icon: ShieldAlert, colSpan: 1 },
  { id: 'late-days', title: 'Late Days', description: 'Configure late-day allowances and windows', icon: Clock3, colSpan: 1 },
  { id: 'issues', title: 'Issue Queue', description: 'Track and resolve attendance issues', icon: MessageSquare, colSpan: 1 },
  { id: 'export', title: 'Export Data', description: 'Generate and export attendance reports', icon: Download, colSpan: 1 },
  { id: 'settings', title: 'Lists & Settings', description: 'Manage access and submission lists', icon: Settings, colSpan: 2 },
];

const isAttendanceWorkspaceTab = (value: string | null): value is AttendanceWorkspaceTab => value === 'zoom' || value === 'attendance';
const isPortalModule = (value: string | null): value is PortalModule =>
  Boolean(value && MODULES.some((module) => module.id === value));

const readStoredAttendanceWorkspaceTab = (userEmail: string | null | undefined): AttendanceWorkspaceTab => {
  const storedScopedTab = readScopedSessionStorage<string | null>(
    TA_STORAGE_SCOPE,
    userEmail,
    ATTENDANCE_WORKSPACE_TAB_STORAGE_KEY,
    null,
  );
  if (isAttendanceWorkspaceTab(storedScopedTab)) {
    return storedScopedTab;
  }

  if (typeof window === 'undefined') {
    return 'zoom';
  }

  const legacyStoredTab = window.sessionStorage.getItem(ATTENDANCE_TAB_STORAGE_KEY);
  if (isAttendanceWorkspaceTab(legacyStoredTab)) {
    return legacyStoredTab;
  }

  return 'zoom';
};

const formatLocalIsoDate = (value: Date) => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getImmediateStageForModule = (
  module: PortalModule,
  attendanceTab: AttendanceWorkspaceTab = 'zoom',
) => {
  switch (module) {
    case 'zoom':
      return 'Zoom Processor · upload step';
    case 'attendance':
      return 'Live Attendance · selecting session';
    case 'sessions':
      return 'Session Management · overview';
    case 'consolidated':
      return 'Consolidated View · table review';
    case 'late-days':
      return 'Late Days · overview';
    case 'exceptions':
      return 'Rule Exceptions · overview';
    case 'roster':
      return 'Roster Management · overview';
    case 'export':
      return 'Export Data · overview';
    case 'issues':
      return 'Issue Queue · overview';
    case 'settings':
      return 'Lists & Settings · overview';
    default:
      return attendanceTab === 'zoom' ? 'Zoom Processor · upload step' : 'Live Attendance · selecting session';
  }
};

export default function TAPortal() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const userEmail = user?.email ?? null;
  const initialAttendanceWorkspaceTab = readStoredAttendanceWorkspaceTab(userEmail);
  const initialActiveModule = readScopedSessionStorage<string | null>(
    TA_STORAGE_SCOPE,
    userEmail,
    ACTIVE_MODULE_STORAGE_KEY,
    null,
  );
  const [activeModule, setActiveModule] = useState<PortalModule | null>(
    isPortalModule(initialActiveModule) ? initialActiveModule : null,
  );
  const [attendanceWorkspaceTab, setAttendanceWorkspaceTab] = useState<AttendanceWorkspaceTab>(
    initialAttendanceWorkspaceTab,
  );
  const [loadedAttendanceTabs, setLoadedAttendanceTabs] = useState<Set<AttendanceWorkspaceTab>>(() => {
    const next = new Set<AttendanceWorkspaceTab>(['zoom']);
    if (initialAttendanceWorkspaceTab === 'attendance' || initialActiveModule === 'attendance') {
      next.add('attendance');
    }
    return next;
  });
  const [latestFinalZoomReport, setLatestFinalZoomReport] = useState<ZoomSessionReport | null>(() =>
    normalizeZoomSessionReport(
      readScopedSessionStorage<unknown | null>(
        TA_STORAGE_SCOPE,
        userEmail,
        LATEST_ZOOM_REPORT_STORAGE_KEY,
        null,
      ),
    ),
  );
  const [pendingZoomReportLoad, setPendingZoomReportLoad] = useState<ZoomReportLoadRequest | null>(null);
  const [helpModuleStage, setHelpModuleStage] = useState<string | null>(() =>
    isPortalModule(initialActiveModule) ? getImmediateStageForModule(initialActiveModule, initialAttendanceWorkspaceTab) : null,
  );
  const [sessionAgentPrefill, setSessionAgentPrefill] = useState<SessionManagementAgentPrefill | null>(null);
  const [helpSnapshotDetails, setHelpSnapshotDetails] = useState<Partial<HelpContextSnapshot>>({});
  const [zoomAgentCommand, setZoomAgentCommand] = useState<AgentCommandEnvelope<ZoomAgentCommand> | null>(null);
  const [attendanceAgentCommand, setAttendanceAgentCommand] = useState<AgentCommandEnvelope<AttendanceAgentCommand> | null>(null);
  const [sessionAgentCommand, setSessionAgentCommand] = useState<AgentCommandEnvelope<SessionAgentCommand> | null>(null);
  const [rosterAgentCommand, setRosterAgentCommand] = useState<AgentCommandEnvelope<RosterAgentCommand> | null>(null);
  const [consolidatedAgentCommand, setConsolidatedAgentCommand] = useState<AgentCommandEnvelope<ConsolidatedAgentCommand> | null>(null);
  const [ruleExceptionsAgentCommand, setRuleExceptionsAgentCommand] = useState<AgentCommandEnvelope<RuleExceptionsAgentCommand> | null>(null);
  const [issueQueueAgentCommand, setIssueQueueAgentCommand] = useState<AgentCommandEnvelope<IssueQueueAgentCommand> | null>(null);
  const [lateDaysAgentCommand, setLateDaysAgentCommand] = useState<AgentCommandEnvelope<LateDaysAgentCommand> | null>(null);
  const [exportAgentCommand, setExportAgentCommand] = useState<AgentCommandEnvelope<ExportAgentCommand> | null>(null);
  const [settingsAgentCommand, setSettingsAgentCommand] = useState<AgentCommandEnvelope<SettingsAgentCommand> | null>(null);
  const commandTokenRef = useRef(0);

  const showAttendanceSwitch = activeModule === 'zoom' || activeModule === 'attendance';

  useEffect(() => {
    const root = document.documentElement;
    const hadLight = root.classList.contains('light');
    const hadDark = root.classList.contains('dark');
    root.classList.remove('light');
    root.classList.add('dark');

    return () => {
      root.classList.remove('light', 'dark');
      if (hadLight) {
        root.classList.add('light');
      }
      if (hadDark) {
        root.classList.add('dark');
      }
    };
  }, []);

  useEffect(() => {
    writeScopedSessionStorage(
      TA_STORAGE_SCOPE,
      userEmail,
      ATTENDANCE_WORKSPACE_TAB_STORAGE_KEY,
      attendanceWorkspaceTab,
    );

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(ATTENDANCE_TAB_STORAGE_KEY, attendanceWorkspaceTab);
    }
  }, [attendanceWorkspaceTab, userEmail]);

  useEffect(() => {
    writeScopedSessionStorage(TA_STORAGE_SCOPE, userEmail, ACTIVE_MODULE_STORAGE_KEY, activeModule);
  }, [activeModule, userEmail]);

  useEffect(() => {
    if (latestFinalZoomReport) {
      writeScopedSessionStorage(
        TA_STORAGE_SCOPE,
        userEmail,
        LATEST_ZOOM_REPORT_STORAGE_KEY,
        latestFinalZoomReport,
      );
      return;
    }

    removeScopedSessionStorage(TA_STORAGE_SCOPE, userEmail, LATEST_ZOOM_REPORT_STORAGE_KEY);
  }, [latestFinalZoomReport, userEmail]);

  useEffect(() => {
    if (!activeModule) {
      setHelpModuleStage(null);
    }
  }, [activeModule]);

  useEffect(() => {
    setHelpSnapshotDetails({});
  }, [activeModule, attendanceWorkspaceTab]);

  const activeModuleConfig = useMemo(
    () => (activeModule ? MODULES.find((module) => module.id === activeModule) ?? null : null),
    [activeModule],
  );
  const helpModuleTitle = useMemo(() => {
    if (showAttendanceSwitch) {
      return attendanceWorkspaceTab === 'zoom' ? 'Zoom Processor' : 'Live Attendance';
    }

    return activeModuleConfig?.title ?? 'TA Dashboard';
  }, [activeModuleConfig?.title, attendanceWorkspaceTab, showAttendanceSwitch]);

  const helpSnapshot = useMemo<HelpContextSnapshot>(() => {
    const defaultSummary = getScreenContextSummary(helpModuleTitle, helpModuleStage);
    return {
      moduleId: (showAttendanceSwitch ? attendanceWorkspaceTab : activeModule) ?? 'dashboard',
      moduleTitle: helpModuleTitle,
      moduleStage: helpModuleStage,
      screenDescription: helpSnapshotDetails.screenDescription ?? defaultSummary?.description ?? null,
      openSurface: helpSnapshotDetails.openSurface ?? null,
      visibleControls:
        helpSnapshotDetails.visibleControls && helpSnapshotDetails.visibleControls.length > 0
          ? helpSnapshotDetails.visibleControls
          : defaultSummary?.visibleControls ?? [],
      searchQuery: helpSnapshotDetails.searchQuery ?? null,
      filters: helpSnapshotDetails.filters,
      selected: helpSnapshotDetails.selected ?? null,
      actionTargets: helpSnapshotDetails.actionTargets ?? [],
    };
  }, [
    activeModule,
    attendanceWorkspaceTab,
    helpModuleStage,
    helpModuleTitle,
    helpSnapshotDetails.actionTargets,
    helpSnapshotDetails.filters,
    helpSnapshotDetails.openSurface,
    helpSnapshotDetails.screenDescription,
    helpSnapshotDetails.searchQuery,
    helpSnapshotDetails.selected,
    helpSnapshotDetails.visibleControls,
    showAttendanceSwitch,
  ]);

  const nextCommandToken = () => {
    commandTokenRef.current += 1;
    return commandTokenRef.current;
  };

  const clearPendingCommands = () => {
    setZoomAgentCommand(null);
    setAttendanceAgentCommand(null);
    setSessionAgentCommand(null);
    setRosterAgentCommand(null);
    setConsolidatedAgentCommand(null);
    setRuleExceptionsAgentCommand(null);
    setIssueQueueAgentCommand(null);
    setLateDaysAgentCommand(null);
    setExportAgentCommand(null);
    setSettingsAgentCommand(null);
  };

  const handleOpenModule = (module: PortalModule) => {
    clearPendingCommands();
    setHelpSnapshotDetails({});
    setHelpModuleStage(getImmediateStageForModule(module, attendanceWorkspaceTab));
    if (module === 'zoom' || module === 'attendance') {
      setAttendanceWorkspaceTab(module);
      setLoadedAttendanceTabs((prev) => {
        const next = new Set(prev);
        next.add(module);
        return next;
      });
    }
    setActiveModule(module);
  };

  const handleSwitchAttendanceTab = (tab: AttendanceWorkspaceTab) => {
    clearPendingCommands();
    setHelpSnapshotDetails({});
    setHelpModuleStage(getImmediateStageForModule(tab, tab));
    setAttendanceWorkspaceTab(tab);
    setLoadedAttendanceTabs((prev) => {
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
    setActiveModule(tab);
  };

  const handleRunHelpAction = (action: HelpAssistantAction) => {
    switch (action.type) {
      case 'open-module':
        handleOpenModule(action.module);
        return;
      case 'switch-attendance-tab':
        handleSwitchAttendanceTab(action.tab);
        return;
      case 'zoom-command':
        setHelpModuleStage('Zoom Processor · upload step');
        setAttendanceWorkspaceTab('zoom');
        setLoadedAttendanceTabs((prev) => new Set(prev).add('zoom'));
        setActiveModule('zoom');
        setZoomAgentCommand(makeCommandEnvelope(action.command, nextCommandToken()));
        return;
      case 'attendance-command':
        setHelpModuleStage(
          action.command.kind === 'prepare-sync'
            ? 'Live Attendance · reviewing session'
            : action.command.kind === 'prepare-submit'
              ? 'Live Attendance · reviewing absent ERP list'
              : action.command.kind === 'select-session'
                ? 'Live Attendance · selecting session'
                : 'Live Attendance · reviewing session',
        );
        setAttendanceWorkspaceTab('attendance');
        setLoadedAttendanceTabs((prev) => new Set(prev).add('attendance'));
        setActiveModule('attendance');
        setAttendanceAgentCommand(makeCommandEnvelope(action.command, nextCommandToken()));
        return;
      case 'session-command':
        setHelpModuleStage('Session Management · creating a session');
        setActiveModule('sessions');
        setSessionAgentPrefill({
          token: nextCommandToken(),
          selectedDate: action.command.selectedDate,
          focusField: 'session-number',
        });
        setSessionAgentCommand(makeCommandEnvelope(action.command, nextCommandToken()));
        return;
      case 'roster-command':
        setHelpModuleStage(
          action.command.kind === 'open-add-student'
            ? 'Roster Management · add student dialog'
            : action.command.kind === 'open-edit-student'
              ? 'Roster Management · edit student dialog'
              : action.command.kind === 'prepare-delete-student'
                ? 'Roster Management · delete student confirmation'
                : action.command.kind === 'prepare-bulk-roster'
                  ? 'Roster Management · bulk roster draft'
                  : 'Roster Management · overview',
        );
        setActiveModule('roster');
        setRosterAgentCommand(makeCommandEnvelope(action.command, nextCommandToken()));
        return;
      case 'consolidated-command':
        setHelpModuleStage(
          action.command.kind === 'focus-sync'
            ? 'Consolidated View · table review'
            : action.command.kind === 'search'
              ? 'Consolidated View · search active'
              : 'Consolidated View · table review',
        );
        setActiveModule('consolidated');
        setConsolidatedAgentCommand(makeCommandEnvelope(action.command, nextCommandToken()));
        return;
      case 'rule-exceptions-command':
        setHelpModuleStage(
          action.command.kind === 'open-add-exception'
            ? 'Rule Exceptions · add exception dialog'
            : action.command.kind === 'search-tracker' || action.command.kind === 'mark-warned' || action.command.kind === 'clear-warning'
              ? 'Rule Exceptions · tracker search'
              : 'Rule Exceptions · overview',
        );
        setActiveModule('exceptions');
        setRuleExceptionsAgentCommand(makeCommandEnvelope(action.command, nextCommandToken()));
        return;
      case 'issue-queue-command':
        setHelpModuleStage(
          action.command.kind === 'open-ticket' ||
          action.command.kind === 'prepare-resolve-ticket' ||
          action.command.kind === 'prepare-escalate-ticket' ||
          action.command.kind === 'prepare-delete-ticket' ||
          action.command.kind === 'prefill-response'
            ? 'Issue Queue · ticket sheet open'
            : 'Issue Queue · filtered list',
        );
        setActiveModule('issues');
        setIssueQueueAgentCommand(makeCommandEnvelope(action.command, nextCommandToken()));
        return;
      case 'late-days-command':
        setHelpModuleStage(
          action.command.kind === 'open-grant-dialog'
            ? 'Late Days · granting late days'
            : action.command.kind === 'prepare-create-assignment'
              ? 'Late Days · creating assignment'
              : action.command.kind === 'open-claim-details'
                ? 'Late Days · reviewing claim details'
                : 'Late Days · overview',
        );
        setActiveModule('late-days');
        setLateDaysAgentCommand(makeCommandEnvelope(action.command, nextCommandToken()));
        return;
      case 'export-command':
        setHelpModuleStage('Export Data · overview');
        setActiveModule('export');
        setExportAgentCommand(makeCommandEnvelope(action.command, nextCommandToken()));
        return;
      case 'settings-command':
        setHelpModuleStage('Lists & Settings · editing inputs');
        setActiveModule('settings');
        setSettingsAgentCommand(makeCommandEnvelope(action.command, nextCommandToken()));
        return;
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const getModuleContext = () => {
    if (showAttendanceSwitch) {
      return {
        title: 'Attendance Workspace',
        description: 'Switch between Zoom Checker and Live Attendance without losing in-progress state.',
        label: attendanceWorkspaceTab === 'zoom' ? 'Zoom Checker Active' : 'Live Attendance Active',
      };
    }

    if (!activeModuleConfig) {
      return {
        title: 'TA Dashboard',
        description: 'Attendance Operations',
        label: 'Live',
      };
    }

    return {
      title: activeModuleConfig.title,
      description: activeModuleConfig.description,
      label: 'Module View',
    };
  };

  const renderActiveModule = () => {
    if (showAttendanceSwitch) {
      return (
        <div className="relative">
          {loadedAttendanceTabs.has('zoom') && (
            <div
              className={cn(
                'transition-opacity duration-300 ease-out',
                attendanceWorkspaceTab === 'zoom' ? 'relative opacity-100' : 'pointer-events-none absolute inset-0 opacity-0',
              )}
              aria-hidden={attendanceWorkspaceTab !== 'zoom'}
            >
              <Suspense fallback={MODULE_SUSPENSE_FALLBACK}>
                <TAZoomProcess
                  onFinalReportReady={setLatestFinalZoomReport}
                  reportLoadRequest={pendingZoomReportLoad}
                  onReportLoadHandled={() => setPendingZoomReportLoad(null)}
                  onContextChange={setHelpModuleStage}
                  onHelpContextChange={setHelpSnapshotDetails}
                  agentCommand={zoomAgentCommand}
                  onAgentCommandHandled={() => setZoomAgentCommand(null)}
                />
              </Suspense>
            </div>
          )}
          {loadedAttendanceTabs.has('attendance') && (
            <div
              className={cn(
                'transition-opacity duration-300 ease-out',
                attendanceWorkspaceTab === 'attendance' ? 'relative opacity-100' : 'pointer-events-none absolute inset-0 opacity-0',
              )}
              aria-hidden={attendanceWorkspaceTab !== 'attendance'}
            >
              <Suspense fallback={MODULE_SUSPENSE_FALLBACK}>
                <AttendanceMarking
                  latestFinalZoomReport={latestFinalZoomReport}
                  onContextChange={setHelpModuleStage}
                  onHelpContextChange={setHelpSnapshotDetails}
                  agentCommand={attendanceAgentCommand}
                  onAgentCommandHandled={() => setAttendanceAgentCommand(null)}
                />
              </Suspense>
            </div>
          )}
        </div>
      );
    }

    switch (activeModule) {
      case 'sessions':
        return (
          <Suspense fallback={MODULE_SUSPENSE_FALLBACK}>
            <SessionManagement
              agentPrefill={sessionAgentPrefill}
              onAgentPrefillHandled={() => setSessionAgentPrefill(null)}
              onContextChange={setHelpModuleStage}
              onHelpContextChange={setHelpSnapshotDetails}
              agentCommand={sessionAgentCommand}
              onAgentCommandHandled={() => setSessionAgentCommand(null)}
              onOpenZoomReport={(request) => {
                setPendingZoomReportLoad(request);
                setLatestFinalZoomReport(request.report);
                setAttendanceWorkspaceTab('zoom');
                setLoadedAttendanceTabs((prev) => {
                  const next = new Set(prev);
                  next.add('zoom');
                  return next;
                });
                setActiveModule('zoom');
              }}
            />
          </Suspense>
        );
      case 'consolidated':
        return (
          <Suspense fallback={MODULE_SUSPENSE_FALLBACK}>
            <ConsolidatedView
              isActive={true}
              onContextChange={setHelpModuleStage}
              onHelpContextChange={setHelpSnapshotDetails}
              agentCommand={consolidatedAgentCommand}
              onAgentCommandHandled={() => setConsolidatedAgentCommand(null)}
            />
          </Suspense>
        );
      case 'exceptions':
        return (
          <Suspense fallback={MODULE_SUSPENSE_FALLBACK}>
            <RuleExceptions
              onContextChange={setHelpModuleStage}
              onHelpContextChange={setHelpSnapshotDetails}
              agentCommand={ruleExceptionsAgentCommand}
              onAgentCommandHandled={() => setRuleExceptionsAgentCommand(null)}
            />
          </Suspense>
        );
      case 'roster':
        return (
          <Suspense fallback={MODULE_SUSPENSE_FALLBACK}>
            <RosterManagement
              onContextChange={setHelpModuleStage}
              onHelpContextChange={setHelpSnapshotDetails}
              agentCommand={rosterAgentCommand}
              onAgentCommandHandled={() => setRosterAgentCommand(null)}
            />
          </Suspense>
        );
      case 'late-days':
        return (
          <Suspense fallback={MODULE_SUSPENSE_FALLBACK}>
            <LateDaysManagement
              onContextChange={setHelpModuleStage}
              onHelpContextChange={setHelpSnapshotDetails}
              agentCommand={lateDaysAgentCommand}
              onAgentCommandHandled={() => setLateDaysAgentCommand(null)}
            />
          </Suspense>
        );
      case 'export':
        return (
          <Suspense fallback={MODULE_SUSPENSE_FALLBACK}>
            <ExportData
              onContextChange={setHelpModuleStage}
              onHelpContextChange={setHelpSnapshotDetails}
              agentCommand={exportAgentCommand}
              onAgentCommandHandled={() => setExportAgentCommand(null)}
            />
          </Suspense>
        );
      case 'issues':
        return (
          <Suspense fallback={MODULE_SUSPENSE_FALLBACK}>
            <IssueManagement
              onContextChange={setHelpModuleStage}
              onHelpContextChange={setHelpSnapshotDetails}
              agentCommand={issueQueueAgentCommand}
              onAgentCommandHandled={() => setIssueQueueAgentCommand(null)}
            />
          </Suspense>
        );
      case 'settings':
        return (
          <Suspense fallback={MODULE_SUSPENSE_FALLBACK}>
            <ListsSettings
              onContextChange={setHelpModuleStage}
              onHelpContextChange={setHelpSnapshotDetails}
              agentCommand={settingsAgentCommand}
              onAgentCommandHandled={() => setSettingsAgentCommand(null)}
            />
          </Suspense>
        );
      default:
        return null;
    }
  };

  const moduleContext = getModuleContext();

  return (
    <div data-ui-surface="ta" className="min-h-screen p-8 font-sans relative overflow-hidden">
      <div className="matte-grain" />

      <div className="max-w-6xl mx-auto">
        <AnimatePresence mode="wait">
          {!activeModule ? (
            <motion.div
              key="hub"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            >
              <header className="mb-12 flex justify-between items-end px-4">
                <div>
                  <h1 className="text-4xl font-extrabold tracking-tight mb-2 text-debossed">TA Dashboard</h1>
                  <p className="text-debossed-sm text-sm tracking-wide font-bold uppercase">Attendance Operations</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="group flex items-center gap-2 neo-in px-4 py-2 rounded-full transition-all duration-300 hover:translate-y-[-1px]"
                  >
                    <LogOut className="w-3.5 h-3.5 text-debossed-sm status-all-text transition-colors duration-300" />
                    <span className="text-xs font-bold tracking-widest text-debossed-sm status-all-text transition-colors duration-300">
                      LOGOUT
                    </span>
                  </button>

                  <div className="group flex items-center space-x-3 neo-in px-5 py-2.5 rounded-full transition-all cursor-default">
                    <div className="w-2.5 h-2.5 rounded-full neo-in relative flex items-center justify-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-transparent status-all-led transition-all duration-300" />
                    </div>
                    <span className="text-xs font-bold tracking-widest text-debossed-sm status-all-text transition-all duration-300">LIVE</span>
                  </div>
                </div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-7 px-4">
                {MODULES.map((card) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.id}
                      onClick={() => handleOpenModule(card.id)}
                      className={cn(
                        'ta-dashboard-card neo-btn neo-out group cursor-pointer flex flex-col justify-between min-h-[190px] rounded-[32px] p-7 relative text-left',
                        card.colSpan === 2 ? 'lg:col-span-2' : 'lg:col-span-1',
                      )}
                    >
                      <div className="flex justify-between items-start mb-6">
                        <div className="ta-dashboard-icon-shell w-[72px] h-[72px] rounded-2xl neo-in p-1 flex items-center justify-center relative overflow-hidden">
                          <Icon className="ta-dashboard-icon-base relative z-[1] w-8 h-8 text-debossed-sm" />
                          <Icon
                            aria-hidden="true"
                            className="ta-dashboard-icon-glow ta-dashboard-icon-glow--base absolute w-8 h-8 status-all-table-text pointer-events-none"
                          />
                          <Icon
                            aria-hidden="true"
                            className="ta-dashboard-icon-glow ta-dashboard-icon-glow--hover absolute w-8 h-8 status-all-table-text pointer-events-none"
                          />
                        </div>

                        <div className="w-4 h-4 rounded-full neo-in relative flex items-center justify-center">
                          <div className="ta-dashboard-led w-2 h-2 rounded-full transition-all duration-300 delay-100" />
                        </div>
                      </div>

                      <div>
                        <h3 className="ta-dashboard-title text-debossed font-black mb-1.5 tracking-wide text-lg">{card.title}</h3>
                        <p className="ta-dashboard-description text-debossed-sm text-sm leading-relaxed font-semibold">{card.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="module"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-6"
            >
              <div className="neo-out rounded-[32px] p-5 md:p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <button onClick={() => { setHelpModuleStage(null); setActiveModule(null); }} className="group/back flex items-center gap-2 text-sm font-bold tracking-wide text-debossed-sm">
                    <div className="p-1.5 rounded-full neo-in">
                      <ArrowLeft className="w-4 h-4" />
                    </div>
                    Back to Modules
                  </button>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="group flex items-center gap-2 neo-in px-4 py-2 rounded-full transition-all duration-300 hover:translate-y-[-1px]"
                    >
                      <LogOut className="w-3.5 h-3.5 text-debossed-sm status-all-text transition-colors duration-300" />
                      <span className="text-xs font-bold tracking-widest text-debossed-sm status-all-text transition-colors duration-300">
                        LOGOUT
                      </span>
                    </button>

                    <div className="group/live flex items-center space-x-3 neo-in px-4 py-2 rounded-full">
                      <div className="w-2.5 h-2.5 rounded-full neo-in relative flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-all)] shadow-[0_0_8px_var(--color-all)]" />
                      </div>
                      <span className="text-xs font-bold tracking-widest text-debossed-sm">{moduleContext.label}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-debossed">{moduleContext.title}</h2>
                  <p className="mt-1 text-sm md:text-[15px] text-debossed-sm">{moduleContext.description}</p>
                </div>

                {showAttendanceSwitch && (
                  <div className="mt-4 flex flex-wrap items-center gap-4" role="tablist" aria-label="Attendance workspace tabs">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={attendanceWorkspaceTab === 'zoom'}
                      onClick={() => handleSwitchAttendanceTab('zoom')}
                      className={`group neo-btn px-5 py-2.5 rounded-full flex items-center gap-3 border border-[#141517] ${
                        attendanceWorkspaceTab === 'zoom' ? 'neo-in active' : 'neo-out cursor-pointer'
                      }`}
                    >
                      <div className="w-2.5 h-2.5 rounded-full neo-in relative flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-transparent transition-all duration-300 status-all-led" />
                      </div>
                      <span className="text-debossed-sm text-xs font-black tracking-widest transition-all duration-300 status-all-text">ZOOM</span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={attendanceWorkspaceTab === 'attendance'}
                      onClick={() => handleSwitchAttendanceTab('attendance')}
                      className={`group neo-btn px-5 py-2.5 rounded-full flex items-center gap-3 border border-[#141517] ${
                        attendanceWorkspaceTab === 'attendance' ? 'neo-in active' : 'neo-out cursor-pointer'
                      }`}
                    >
                      <div className="w-2.5 h-2.5 rounded-full neo-in relative flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-transparent transition-all duration-300 status-present-led" />
                      </div>
                      <span className="text-debossed-sm text-xs font-black tracking-widest transition-all duration-300 status-present-text">LIVE ATTENDANCE</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="neo-out rounded-[26px] p-3 md:p-4">{renderActiveModule()}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <TAHelpAssistant snapshot={helpSnapshot} onRunAction={handleRunHelpAction} />
    </div>
  );
}
