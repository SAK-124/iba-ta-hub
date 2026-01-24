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

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

export default function Auth() {
  const navigate = useNavigate();
  const { signInWithOtp, loginAsTestUser, signIn } = useAuth(); // Keeping signIn for password fallback if needed
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError('Please enter your email.');
      return;
    }

    // Test User Bypass
    if (trimmedEmail === '00000') {
      loginAsTestUser();
      navigate('/');
      return;
    }

    // Email Validation
    try {
      emailSchema.parse(trimmedEmail);
    } catch (err) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      // Send Magic Link
      const { error } = await signInWithOtp(trimmedEmail);
      if (error) {
        setError(error.message);
      } else {
        setSuccessMessage('Check your email for the login link!');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
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
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Enter your email to sign in (No password required).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {successMessage && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-success/10 text-success text-sm">
                <span>{successMessage}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="text"
                  placeholder="email@khi.iba.edu.pk or 00000"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continue
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center text-xs text-muted-foreground">
            TAs will be automatically recognized as admins.
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
