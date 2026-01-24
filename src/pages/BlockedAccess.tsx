import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { AlertCircle, Lock } from 'lucide-react';

export default function BlockedAccess() {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
          <Lock className="w-8 h-8 text-destructive" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Access Restricted</h1>
          <p className="text-muted-foreground">
            Only IBA emails can access this portal.
          </p>
        </div>

        <div className="bg-muted/50 p-4 rounded-lg flex items-start gap-3 text-left">
          <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Why am I seeing this?</p>
            <p className="text-muted-foreground mt-1">
              This application is restricted to users with an <strong>@khi.iba.edu.pk</strong> email address.
              If you are a TA using a personal email, ask an admin to add you to the allowlist.
            </p>
          </div>
        </div>

        <Button variant="outline" onClick={() => signOut()} className="w-full">
          Sign Out
        </Button>
      </div>
    </div>
  );
}
