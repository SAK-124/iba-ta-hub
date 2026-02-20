import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, Loader2 } from 'lucide-react';
import { ModeToggle } from '@/components/mode-toggle';
import CompanionBotLogo from '@/components/CompanionBotLogo';

type AuthMode = 'student' | 'ta';

const DEFAULT_PASSWORD = 'iba-student-password-2024';

export default function Auth() {
  const navigate = useNavigate();
  const { signIn, signUp, loginAsTestUser } = useAuth();

  const [authMode, setAuthMode] = useState<AuthMode>('student');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const isStudentMode = authMode === 'student';

  const handleModeChange = (mode: string) => {
    if (mode !== 'student' && mode !== 'ta') return;

    setAuthMode(mode);
    setError(null);
    setPassword('');
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError('Please enter your email.');
      return;
    }

    // Test user bypass for student mode.
    if (isStudentMode && trimmedEmail === '00000') {
      setIsLoading(true);
      const { error: testUserError } = await loginAsTestUser();

      if (testUserError) {
        setError(testUserError.message);
        setIsLoading(false);
      } else {
        navigate('/dashboard');
      }

      return;
    }

    setIsLoading(true);

    try {
      if (!isStudentMode) {
        if (!password) {
          setError('Please enter your password.');
          return;
        }

        const { data: isAllowed, error: allowlistError } = await supabase
          .rpc('check_ta_allowlist' as never, { check_email: trimmedEmail } as never);

        if (allowlistError) {
          throw allowlistError;
        }

        if (!isAllowed) {
          setError('This email is not authorized for TA access.');
          return;
        }

        const { error: signInError } = await signIn(trimmedEmail, password);

        if (signInError) {
          setError(signInError.message);
          return;
        }

        navigate('/dashboard');
        return;
      }

      if (!trimmedEmail.endsWith('@khi.iba.edu.pk')) {
        setError('Please use your IBA email address.');
        return;
      }

      const match = trimmedEmail.match(/(\d{5})@/);
      if (!match || !match[1]) {
        setError('Could not extract ERP from email. Format should be: name.12345@khi.iba.edu.pk');
        return;
      }

      const erp = match[1];

      const { data: rosterData, error: rosterError } = await supabase
        .rpc('check_roster', { check_erp: erp });

      if (rosterError) {
        throw rosterError;
      }

      const rosterResult = rosterData as { found: boolean };

      if (!rosterResult.found) {
        setError('Your ERP was not found in the course roster.');
        return;
      }

      const { error: signInError } = await signIn(trimmedEmail, DEFAULT_PASSWORD);

      if (signInError) {
        if (signInError.message.includes('Invalid login credentials')) {
          const { error: signUpError } = await signUp(trimmedEmail, DEFAULT_PASSWORD);

          if (signUpError) {
            setError(signUpError.message);
            return;
          }

          navigate('/dashboard');
          return;
        }

        setError(signInError.message);
        return;
      }

      navigate('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong while signing in.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute right-4 top-4">
        <ModeToggle />
      </div>
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 flex items-center justify-center">
          <div className="flex items-center gap-3">
            <CompanionBotLogo className="h-14 w-14" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Course Portal</h1>
              <p className="text-sm text-muted-foreground">Sign in to continue</p>
            </div>
          </div>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="space-y-4">
            <div>
              <CardTitle>{isStudentMode ? 'Student Login' : 'TA Login'}</CardTitle>
              <CardDescription>
                {isStudentMode
                  ? 'Enter your IBA email to access the student portal.'
                  : 'Enter your TA email and password to access the TA dashboard.'}
              </CardDescription>
            </div>

            <Tabs value={authMode} onValueChange={handleModeChange}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="student">Student</TabsTrigger>
                <TabsTrigger value="ta">TA</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="min-h-[40px]">
              {error && (
                <div className="animate-in fade-in zoom-in-95 duration-200 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{isStudentMode ? 'IBA Email' : 'TA Email'}</Label>
                <Input
                  id="email"
                  type="text"
                  placeholder={isStudentMode ? 'name.12345@khi.iba.edu.pk' : 'ta@khi.iba.edu.pk'}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>

              {!isStudentMode && (
                <div className="animate-in fade-in slide-in-from-top-2 space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    autoFocus
                  />
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isStudentMode ? 'Continue' : 'Sign In'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
