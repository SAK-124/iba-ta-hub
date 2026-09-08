import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { AccessCheckError, checkRosterCached, checkTaAllowlistCached } from '@/lib/access-checks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { ModeToggle } from '@/components/mode-toggle';
import CompanionBotLogo from '@/components/CompanionBotLogo';

type AuthMode = 'student' | 'ta';

const DEFAULT_PASSWORD = 'iba-student-password-2024';
const ACCESS_CHECK_UNAVAILABLE_MESSAGE = 'Access verification is temporarily unavailable. Please try again in a moment.';

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

        const isAllowed = await checkTaAllowlistCached(trimmedEmail);
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

      const rosterResult = await checkRosterCached(erp);
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
      const message = err instanceof AccessCheckError
        ? ACCESS_CHECK_UNAVAILABLE_MESSAGE
        : err instanceof Error
          ? err.message
          : 'Something went wrong while signing in.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-8 sm:px-6">
      <div className="absolute right-4 top-4 sm:right-6">
        <ModeToggle />
      </div>
      <div className="w-full max-w-md animate-fade-in">
        <Link
          to="/"
          className="mb-5 inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to dashboard</span>
        </Link>
        <div className="mb-8 flex items-center justify-center px-2">
          <div className="flex items-center gap-3">
            <CompanionBotLogo className="h-[72px] w-[72px] shrink-0" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Course Portal</h1>
              <p className="text-sm text-muted-foreground">Sign in to continue</p>
            </div>
          </div>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="space-y-6">
            <div className="space-y-2">
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
            {error && (
              <div role="alert" className="animate-in fade-in zoom-in-95 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive duration-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
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
