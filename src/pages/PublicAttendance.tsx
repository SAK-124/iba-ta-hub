import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LogIn } from 'lucide-react';
import PublicAttendanceBoard from '@/components/public/PublicAttendanceBoard';
import { ModeToggle } from '@/components/mode-toggle';
import CompanionBotLogo from '@/components/CompanionBotLogo';

export default function PublicAttendance() {
  return (
    <div className="min-h-screen bg-background transition-colors duration-300">
      <header className="safe-sticky-header sticky top-0 z-50 w-full glass-morphism border-b border-primary/10">
        <div className="site-header-content container flex min-h-20 items-center justify-between px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <CompanionBotLogo className="h-16 w-16 shrink-0 sm:h-[72px] sm:w-[72px]" />
            <div>
              <h1 className="text-lg font-semibold text-foreground">AAMD Portal</h1>
              <p className="text-xs text-muted-foreground">Public Attendance Record</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ModeToggle />
            <Button asChild>
              <Link to="/auth" className="inline-flex items-center gap-2">
                <LogIn className="h-4 w-4" />
                Login
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="container px-4 py-6 sm:px-8">
        <PublicAttendanceBoard />
      </main>
    </div>
  );
}
