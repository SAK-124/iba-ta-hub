import { lazy, Suspense, useEffect, useMemo, useState, type ComponentType } from 'react';
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

  const activeModuleConfig = useMemo(
    () => (activeModule ? MODULES.find((module) => module.id === activeModule) ?? null : null),
    [activeModule],
  );

  const handleOpenModule = (module: PortalModule) => {
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
    setAttendanceWorkspaceTab(tab);
    setLoadedAttendanceTabs((prev) => {
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
    setActiveModule(tab);
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
                <AttendanceMarking latestFinalZoomReport={latestFinalZoomReport} />
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
            <ConsolidatedView isActive={true} />
          </Suspense>
        );
      case 'exceptions':
        return (
          <Suspense fallback={MODULE_SUSPENSE_FALLBACK}>
            <RuleExceptions />
          </Suspense>
        );
      case 'roster':
        return (
          <Suspense fallback={MODULE_SUSPENSE_FALLBACK}>
            <RosterManagement />
          </Suspense>
        );
      case 'late-days':
        return (
          <Suspense fallback={MODULE_SUSPENSE_FALLBACK}>
            <LateDaysManagement />
          </Suspense>
        );
      case 'export':
        return (
          <Suspense fallback={MODULE_SUSPENSE_FALLBACK}>
            <ExportData />
          </Suspense>
        );
      case 'issues':
        return (
          <Suspense fallback={MODULE_SUSPENSE_FALLBACK}>
            <IssueManagement />
          </Suspense>
        );
      case 'settings':
        return (
          <Suspense fallback={MODULE_SUSPENSE_FALLBACK}>
            <ListsSettings />
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
                        'neo-btn neo-out group cursor-pointer flex flex-col justify-between min-h-[190px] rounded-[32px] p-7 relative text-left',
                        card.colSpan === 2 ? 'lg:col-span-2' : 'lg:col-span-1',
                      )}
                    >
                      <div className="flex justify-between items-start mb-6">
                        <div className="w-[72px] h-[72px] rounded-2xl neo-in p-1 flex items-center justify-center">
                          <Icon className="w-8 h-8 text-debossed-sm status-all-text" />
                        </div>

                        <div className="w-4 h-4 rounded-full neo-in relative flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-transparent status-all-led transition-all duration-300 delay-100" />
                        </div>
                      </div>

                      <div>
                        <h3 className="text-debossed font-black mb-1.5 tracking-wide text-lg">{card.title}</h3>
                        <p className="text-debossed-sm text-sm leading-relaxed font-semibold">{card.description}</p>
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
                  <button onClick={() => setActiveModule(null)} className="group/back flex items-center gap-2 text-sm font-bold tracking-wide text-debossed-sm">
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
    </div>
  );
}
