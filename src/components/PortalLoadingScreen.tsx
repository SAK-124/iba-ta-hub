import { Loader2 } from 'lucide-react';

interface PortalLoadingScreenProps {
  title?: string;
  subtitle?: string;
}

const dots = [0, 1, 2] as const;

export default function PortalLoadingScreen({
  title = 'Securing Portal Access',
  subtitle = 'Verifying session, role, and workspace data...',
}: PortalLoadingScreenProps) {
  return (
    <div data-ui-surface="ta" className="min-h-screen relative overflow-hidden flex items-center justify-center px-4 py-10">
      <div className="matte-grain" />

      <div className="relative z-10 w-full max-w-lg neo-out rounded-[32px] border border-[#141517] p-8 sm:p-10">
        <div className="mx-auto mb-6 h-20 w-20 rounded-2xl neo-in flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-debossed-sm status-all-text" />
        </div>

        <div className="space-y-2 text-center">
          <h1 className="text-debossed text-2xl sm:text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="text-debossed-body text-sm sm:text-base">{subtitle}</p>
        </div>

        <div className="mt-7 flex items-center justify-center gap-2" aria-hidden>
          {dots.map((dot) => (
            <span
              key={dot}
              className="h-2.5 w-2.5 rounded-full neo-in status-all-led animate-pulse"
              style={{ animationDelay: `${dot * 180}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
