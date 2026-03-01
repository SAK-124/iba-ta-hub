import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isTA: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithOtp: (email: string) => Promise<{ error: Error | null }>;
  loginAsTestUser: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTA, setIsTA] = useState(false);
  const latestSyncIdRef = useRef(0);
  const sawAuthEventRef = useRef(false);

  const checkTAStatus = async (email: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('check_ta_allowlist', { check_email: email });
      if (error) {
        return false;
      }
      return Boolean(data);
    } catch {
      return false;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const syncSessionState = async (
      nextSession: Session | null,
      source: 'initial' | 'event',
    ) => {
      if (!isMounted) return;
      if (source === 'initial' && sawAuthEventRef.current) {
        return;
      }
      if (source === 'event') {
        sawAuthEventRef.current = true;
      }

      const syncId = ++latestSyncIdRef.current;
      setIsLoading(true);
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user?.email) {
        if (syncId !== latestSyncIdRef.current || !isMounted) return;
        setIsTA(false);
        setIsLoading(false);
        return;
      }

      const taStatus = await checkTAStatus(nextSession.user.email);
      if (syncId !== latestSyncIdRef.current || !isMounted) return;

      setIsTA(taStatus);
      setIsLoading(false);
    };

    setIsLoading(true);

    supabase.auth.getSession().then(({ data: { session } }) => {
      void syncSessionState(session, 'initial');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void syncSessionState(nextSession, 'event');
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signInWithOtp = async (email: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl }
    });
    return { error };
  }

  const loginAsTestUser = async () => {
    const email = 'test.00000@khi.iba.edu.pk';
    const password = 'iba-student-password-2024';

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error && error.message.includes('Invalid login credentials')) {
      // Create the test user if it doesn't exist
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: 'Test Student' },
          emailRedirectTo: window.location.origin
        }
      });
      if (signUpError) return { error: signUpError };
    } else if (error) {
      return { error };
    }

    return { error: null };
  };

  const signUp = async (email: string, password: string) => {
    // ... keeping existing signUp for TAs if needed, or we can just rely on OTP
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl }
    });
    return { error };
  };

  const signOut = async () => {
    if (user?.id === '00000') {
      setUser(null);
      setSession(null);
      setIsTA(false);
      return;
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, isTA, signIn, signUp, signOut, signInWithOtp, loginAsTestUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
