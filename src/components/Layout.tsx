import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { LogOut, User, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ModeToggle } from './mode-toggle';
import CompanionBotLogo from './CompanionBotLogo';
interface LayoutProps {
  children: React.ReactNode;
}
export default function Layout({
  children
}: LayoutProps) {
  const {
    user,
    isTA,
    signOut
  } = useAuth();
  const navigate = useNavigate();
  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };
  return <div className="min-h-screen bg-background transition-colors duration-300">
    <header className="sticky top-0 z-50 w-full glass-morphism border-b border-primary/10">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-3">
          <CompanionBotLogo />
          <div>
            <h1 className="text-lg font-semibold text-foreground my-0 text-center">AAMD Portal</h1>
            <p className="text-xs text-muted-foreground">{isTA ? 'TA Dashboard' : 'Student Portal'}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            {isTA ? <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 shadow-sm shadow-primary/10">
              <Shield className="w-3.5 h-3.5 text-primary" />
              <span className="font-semibold text-[10px] tracking-wider uppercase">TA</span>
            </div> : <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary text-secondary-foreground border border-border shadow-sm">
              <User className="w-3.5 h-3.5" />
              <span className="font-semibold text-[10px] tracking-wider uppercase">Student</span>
            </div>}
            <span className="text-muted-foreground hidden lg:inline-block max-w-[150px] truncate">
              {user?.email}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ModeToggle />
            <Button variant="ghost" size="icon" onClick={handleSignOut} className="rounded-full w-9 h-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-300" title="Sign Out">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>

    <main className="container py-6">
      {children}
    </main>
  </div>;
}
