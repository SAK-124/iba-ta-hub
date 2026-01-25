import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { GraduationCap, LogOut, User, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
    navigate('/auth');
  };
  return <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground my-0 text-center">AAMD Portal</h1>
              <p className="text-xs text-muted-foreground">
            </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              {isTA ? <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                  <Shield className="w-3.5 h-3.5" />
                  <span className="font-medium">TA</span>
                </div> : <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                  <User className="w-3.5 h-3.5" />
                  <span className="font-medium">Student</span>
                </div>}
              <span className="text-muted-foreground hidden sm:inline">
                {user?.email}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6">
        {children}
      </main>
    </div>;
}