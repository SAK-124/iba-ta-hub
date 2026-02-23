import { useEffect, useId, useMemo, useState, type ComponentType } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

import AttendanceMarking from './AttendanceMarking';
import ConsolidatedView from './ConsolidatedView';
import ExportData from './ExportData';
import IssueManagement from './IssueManagement';
import LateDaysManagement from './LateDaysManagement';
import ListsSettings from './ListsSettings';
import RosterManagement from './RosterManagement';
import RuleExceptions from './RuleExceptions';
import SessionManagement from './SessionManagement';
import TAZoomProcess from './TAZoomProcess';

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
  icon: ComponentType;
  colSpan?: 1 | 2;
}

interface NeoIconShapeProps {
  plasticPath: string;
  neonPath?: string;
  viewBox?: string;
}

const ATTENDANCE_TAB_STORAGE_KEY = 'ta-attendance-workspace-tab';

const NeoIconShape = ({ plasticPath, neonPath, viewBox = '0 0 24 24' }: NeoIconShapeProps) => {
  const rawId = useId();
  const gradientId = `neon-accent-${rawId.replace(/[:]/g, '')}`;

  return (
    <svg viewBox={viewBox} className="w-8 h-8 overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#009995" />
          <stop offset="100%" stopColor="#004b49" />
        </linearGradient>
      </defs>

      <path
        d={plasticPath}
        fill="none"
        stroke="var(--ss-neo-deboss)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-colors duration-500 ease-out"
        style={{
          filter: 'drop-shadow(1px 1px 1px rgba(255,255,255,0.08)) drop-shadow(-1px -1px 3px rgba(0,0,0,1))',
        }}
      />

      {neonPath && (
        <path
          d={neonPath}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-500 ease-out"
          style={{ filter: 'drop-shadow(0 0 6px rgba(0, 100, 97, 0.8))' }}
        />
      )}
    </svg>
  );
};

const ZoomProcessorIcon = () => (
  <NeoIconShape plasticPath="M23 7l-7 5 7 5V7z M1 5h15v14H1z" neonPath="M8 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" />
);

const LiveAttendanceIcon = () => (
  <NeoIconShape
    plasticPath="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M15 2H9v4h6V2z"
    neonPath="M9 12l2 2 4-4"
  />
);

const RosterManagementIcon = () => (
  <NeoIconShape
    plasticPath="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"
    neonPath="M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75"
  />
);

const ConsolidatedViewIcon = () => (
  <NeoIconShape plasticPath="M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5" neonPath="M2 12l10 5 10-5" />
);

const SessionManagementIcon = () => (
  <NeoIconShape plasticPath="M3 4h18v18H3z M16 2v4 M8 2v4 M3 10h18" neonPath="M8 14l2 2 4-4" />
);

const RuleExceptionsIcon = () => (
  <NeoIconShape plasticPath="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" neonPath="M12 8v4 M12 16h.01" />
);

const LateDaysIcon = () => (
  <NeoIconShape plasticPath="M6 2v6l6 6-6 6v6h12v-6l-6-6 6-6V2z" neonPath="M12 10v4 M10 16h4" />
);

const IssueQueueIcon = () => (
  <NeoIconShape plasticPath="M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01" neonPath="M19 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" />
);

const ExportDataIcon = () => (
  <NeoIconShape plasticPath="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" neonPath="M7 10l5 5 5-5 M12 15V3" />
);

const ListsAndSettingsIcon = () => (
  <NeoIconShape
    plasticPath="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
    neonPath="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
  />
);

const MODULES: ModuleConfig[] = [
  { id: 'zoom', title: 'Zoom Processor', description: 'Upload logs, review matches, and generate attendance', icon: ZoomProcessorIcon, colSpan: 2 },
  { id: 'attendance', title: 'Live Attendance', description: 'Mark attendance live and apply manual overrides', icon: LiveAttendanceIcon, colSpan: 1 },
  { id: 'roster', title: 'Roster Management', description: 'Import and manage the student master list', icon: RosterManagementIcon, colSpan: 1 },
  { id: 'consolidated', title: 'Consolidated View', description: 'Review full attendance with penalties by session', icon: ConsolidatedViewIcon, colSpan: 1 },
  { id: 'sessions', title: 'Session Management', description: 'Configure session calendar and timing rules', icon: SessionManagementIcon, colSpan: 1 },
  { id: 'exceptions', title: 'Rule Exceptions', description: 'Manage approved exceptions and overrides', icon: RuleExceptionsIcon, colSpan: 1 },
  { id: 'late-days', title: 'Late Days', description: 'Configure late-day allowances and windows', icon: LateDaysIcon, colSpan: 1 },
  { id: 'issues', title: 'Issue Queue', description: 'Track and resolve attendance issues', icon: IssueQueueIcon, colSpan: 1 },
  { id: 'export', title: 'Export Data', description: 'Generate and export attendance reports', icon: ExportDataIcon, colSpan: 1 },
  { id: 'settings', title: 'Lists & Settings', description: 'Manage access and submission lists', icon: ListsAndSettingsIcon, colSpan: 2 },
];

const isAttendanceWorkspaceTab = (value: string | null): value is AttendanceWorkspaceTab => value === 'zoom' || value === 'attendance';

export default function TAPortal() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [activeModule, setActiveModule] = useState<PortalModule | null>(null);
  const [attendanceWorkspaceTab, setAttendanceWorkspaceTab] = useState<AttendanceWorkspaceTab>('zoom');

  const showAttendanceSwitch = activeModule === 'zoom' || activeModule === 'attendance';

  useEffect(() => {
    const root = document.documentElement;
    const hadLight = root.classList.contains('light');
    const hadDark = root.classList.contains('dark');
    root.classList.remove('light');
    root.classList.add('dark');

    const storedTab = window.sessionStorage.getItem(ATTENDANCE_TAB_STORAGE_KEY);
    if (isAttendanceWorkspaceTab(storedTab)) {
      setAttendanceWorkspaceTab(storedTab);
    }

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
    window.sessionStorage.setItem(ATTENDANCE_TAB_STORAGE_KEY, attendanceWorkspaceTab);
  }, [attendanceWorkspaceTab]);

  const activeModuleConfig = useMemo(
    () => (activeModule ? MODULES.find((module) => module.id === activeModule) ?? null : null),
    [activeModule],
  );

  const handleOpenModule = (module: PortalModule) => {
    if (module === 'zoom' || module === 'attendance') {
      setAttendanceWorkspaceTab(module);
    }
    setActiveModule(module);
  };

  const handleSwitchAttendanceTab = (tab: AttendanceWorkspaceTab) => {
    setAttendanceWorkspaceTab(tab);
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
          <div
            className={cn(
              'transition-opacity duration-300 ease-out',
              attendanceWorkspaceTab === 'zoom' ? 'relative opacity-100' : 'pointer-events-none absolute inset-0 opacity-0',
            )}
            aria-hidden={attendanceWorkspaceTab !== 'zoom'}
          >
            <TAZoomProcess />
          </div>
          <div
            className={cn(
              'transition-opacity duration-300 ease-out',
              attendanceWorkspaceTab === 'attendance' ? 'relative opacity-100' : 'pointer-events-none absolute inset-0 opacity-0',
            )}
            aria-hidden={attendanceWorkspaceTab !== 'attendance'}
          >
            <AttendanceMarking />
          </div>
        </div>
      );
    }

    switch (activeModule) {
      case 'sessions':
        return <SessionManagement />;
      case 'consolidated':
        return <ConsolidatedView isActive={true} />;
      case 'exceptions':
        return <RuleExceptions />;
      case 'roster':
        return <RosterManagement />;
      case 'late-days':
        return <LateDaysManagement />;
      case 'export':
        return <ExportData />;
      case 'issues':
        return <IssueManagement />;
      case 'settings':
        return <ListsSettings />;
      default:
        return null;
    }
  };

  const moduleContext = getModuleContext();

  return (
    <div data-ui-surface="ta" className="ta-sandstone min-h-screen p-8 font-sans relative overflow-hidden">
      <div className="ss-matte-grain" />

      <div className="max-w-6xl mx-auto ss-shell">
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
                  <h1 className="text-4xl font-extrabold tracking-tight mb-2 ss-text-marble-debossed">TA Dashboard</h1>
                  <p className="ss-text-debossed-sm text-sm tracking-wide font-bold uppercase">Attendance Operations</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="group/logout flex items-center gap-2 ss-neo-in px-4 py-2 rounded-full transition-all duration-300 hover:translate-y-[-1px]"
                  >
                    <LogOut className="w-3.5 h-3.5 ss-text-debossed-sm group-hover/logout:text-[var(--ss-accent-glow)] transition-colors duration-300" />
                    <span className="text-xs font-bold tracking-widest ss-text-debossed-sm group-hover/logout:text-[var(--ss-accent-glow)] transition-colors duration-300">
                      LOGOUT
                    </span>
                  </button>

                  <div className="group/live flex items-center space-x-3 ss-neo-in px-5 py-2.5 rounded-full transition-all cursor-default">
                    <div className="w-2.5 h-2.5 rounded-full ss-neo-in relative flex items-center justify-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-transparent group-hover/live:bg-[var(--ss-accent-glow)] group-hover/live:shadow-[0_0_8px_var(--ss-accent-glow)] transition-all duration-300" />
                    </div>
                    <span
                      className="text-xs font-bold tracking-widest ss-text-debossed-sm group-hover/live:text-[var(--ss-accent-glow)] transition-all duration-300"
                      style={{ textShadow: '-1px -1px 2px rgba(0,0,0,0.8), 1px 1px 1px rgba(255,255,255,0.12)' }}
                    >
                      LIVE
                    </span>
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
                        'ss-neo-card ss-neo-out group cursor-pointer flex flex-col justify-between min-h-[190px] rounded-[32px] p-7 relative text-left',
                        card.colSpan === 2 ? 'lg:col-span-2' : 'lg:col-span-1',
                      )}
                    >
                      <div className="flex justify-between items-start mb-6">
                        <div className="w-[72px] h-[72px] rounded-2xl ss-neo-in p-1 flex items-center justify-center">
                          <Icon />
                        </div>

                        <div className="w-4 h-4 rounded-full ss-neo-in relative flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-transparent group-hover:bg-[var(--ss-accent-glow)] group-hover:shadow-[0_0_8px_var(--ss-accent-glow)] transition-all duration-300 delay-100" />
                        </div>
                      </div>

                      <div>
                        <h3 className="ss-text-debossed font-black mb-1.5 tracking-wide text-lg">{card.title}</h3>
                        <p className="ss-text-debossed-sm text-sm leading-relaxed font-semibold">{card.description}</p>
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
              <div className="ss-neo-out rounded-[32px] p-5 md:p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <button onClick={() => setActiveModule(null)} className="group/back flex items-center gap-2 text-sm font-bold tracking-wide ss-text-debossed-sm">
                    <div className="p-1.5 rounded-full ss-neo-in">
                      <ArrowLeft className="w-4 h-4" />
                    </div>
                    Back to Modules
                  </button>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="group/logout flex items-center gap-2 ss-neo-in px-4 py-2 rounded-full transition-all duration-300 hover:translate-y-[-1px]"
                    >
                      <LogOut className="w-3.5 h-3.5 ss-text-debossed-sm group-hover/logout:text-[var(--ss-accent-glow)] transition-colors duration-300" />
                      <span className="text-xs font-bold tracking-widest ss-text-debossed-sm group-hover/logout:text-[var(--ss-accent-glow)] transition-colors duration-300">
                        LOGOUT
                      </span>
                    </button>

                    <div className="group/live flex items-center space-x-3 ss-neo-in px-4 py-2 rounded-full">
                      <div className="w-2.5 h-2.5 rounded-full ss-neo-in relative flex items-center justify-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--ss-accent-glow)] shadow-[0_0_8px_var(--ss-accent-glow)]" />
                      </div>
                      <span className="text-xs font-bold tracking-widest ss-text-debossed-sm">{moduleContext.label}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight ss-text-marble-debossed">{moduleContext.title}</h2>
                  <p className="mt-1 text-sm md:text-[15px] ss-text-debossed-sm">{moduleContext.description}</p>
                </div>

                {showAttendanceSwitch && (
                  <div className="mt-4 ss-tab-shell" role="tablist" aria-label="Attendance workspace tabs">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={attendanceWorkspaceTab === 'zoom'}
                      onClick={() => handleSwitchAttendanceTab('zoom')}
                      className={cn('ss-tab-btn', attendanceWorkspaceTab === 'zoom' && 'ss-active')}
                    >
                      Zoom Checker
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={attendanceWorkspaceTab === 'attendance'}
                      onClick={() => handleSwitchAttendanceTab('attendance')}
                      className={cn('ss-tab-btn', attendanceWorkspaceTab === 'attendance' && 'ss-active')}
                    >
                      Live Attendance
                    </button>
                  </div>
                )}
              </div>

              <div className="ss-neo-out rounded-[26px] p-3 md:p-4">{renderActiveModule()}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
