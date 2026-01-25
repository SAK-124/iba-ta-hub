import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, GraduationCap, Loader2 } from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

export default function Auth() {
  const navigate = useNavigate();
  const { signIn, signUp, loginAsTestUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordMode, setIsPasswordMode] = useState(false);

  const DEFAULT_PASSWORD = 'iba-student-password-2024';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError('Please enter your email.');
      return;
    }

    // Test User Bypass (Only in standard mode)
    if (!isPasswordMode && trimmedEmail === '00000') {
      setIsLoading(true);
      const { error } = await loginAsTestUser();
      if (error) {
        setError(error.message);
        setIsLoading(false);
      } else {
        // Navigation handled by auth listener, but we can also nav here
        navigate('/');
      }
      return;
    }

    setIsLoading(true);

    try {
      // ---------------------------------------------------------
      // PASSWORD MODE: LOGIN AS TA
      // ---------------------------------------------------------
      if (isPasswordMode) {
        if (!password) {
          setError('Please enter your password.');
          setIsLoading(false);
          return;
        }

        // Try signing in
        const { error: signInError } = await signIn(trimmedEmail, password);

        if (signInError) {
          if (signInError.message.includes('Invalid login credentials')) {
            // Check if this is a first-time setup for a TA (Lazy Signup)
            const { data: isValidSetup, error: verifyError } = await supabase
              .rpc('verify_ta_setup' as any, {
                check_email: trimmedEmail,
                check_password: password
              });

            if (isValidSetup) {
              // Initial password matched! Create the account now.
              toast.info('First time login detected. Creating you account...');
              const { error: signUpError } = await supabase.auth.signUp({
                email: trimmedEmail,
                password: password,
                options: {
                  data: { full_name: 'TA User' }
                }
              });

              if (signUpError) {
                console.error('Lazy Signup Error:', signUpError);
                setError(signUpError.message);
              } else {
                // Signup success - usually auto logs in
                toast.success('Account created successfully!');
                navigate('/');
              }
            } else {
              // Not a valid setup or wrong password
              setError('Invalid login credentials. If this is your first time, ensure you are using the provided initial password.');
            }
          } else {
            setError(signInError.message);
          }
        } else {
          // Sign in success
          navigate('/');
        }

        setIsLoading(false);
        return;
      }

      // ---------------------------------------------------------
      // STANDARD MODE: CHECK USER TYPE
      // ---------------------------------------------------------

      // 1. Check if TA
      const { data: isAllowed, error: rpcError } = await supabase
        .rpc('check_ta_allowlist' as any, { check_email: trimmedEmail });

      if (isAllowed) {
        // User is a TA -> Switch to Password Mode
        setIsPasswordMode(true);
        setIsLoading(false);
        return;
      }

      // 2. If not TA -> Student Flow (Roster Check)

      // Email Validation: Must be IBA email for students
      if (!trimmedEmail.endsWith('@khi.iba.edu.pk')) {
        setError('Please use your IBA email address.');
        setIsLoading(false);
        return;
      }

      // Extract ERP
      const match = trimmedEmail.match(/(\d{5})@/);
      if (!match || !match[1]) {
        setError('Could not extract ERP from email. Format should be: name.erp@khi.iba.edu.pk');
        setIsLoading(false);
        return;
      }
      const erp = match[1];

      // Check Roster
      const { data: rosterData, error: rosterError } = await supabase
        .rpc('check_roster', { check_erp: erp });

      if (rosterError) throw rosterError;

      const rosterResult = rosterData as { found: boolean };

      if (!rosterResult.found) {
        setError('Your ERP was not found in the course roster.');
        setIsLoading(false);
        return;
      }

      // Auto Login/Signup (Default Password)
      const { error: signInError } = await signIn(trimmedEmail, DEFAULT_PASSWORD);

      if (signInError) {
        if (signInError.message.includes('Invalid login credentials')) {
          const { error: signUpError } = await signUp(trimmedEmail, DEFAULT_PASSWORD);
          if (signUpError) {
            setError(signUpError.message);
          } else {
            navigate('/');
          }
        } else {
          setError(signInError.message);
        }
      } else {
        navigate('/');
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      if (!isPasswordMode) setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <GraduationCap className="w-7 h-7 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Course Portal</h1>
              <p className="text-sm text-muted-foreground">Sign in to continue</p>
            </div>
          </div>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>{isPasswordMode ? 'Enter Password' : 'Welcome'}</CardTitle>
            <CardDescription>
              {isPasswordMode
                ? `Logging in as ${email}`
                : 'Enter your IBA email to access the portal.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="text"
                  placeholder="email@khi.iba.edu.pk"
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value);
                    if (isPasswordMode) setIsPasswordMode(false); // Reset mode on email change
                  }}
                  required
                />
              </div>

              {isPasswordMode && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isPasswordMode ? 'Sign In' : 'Continue'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
