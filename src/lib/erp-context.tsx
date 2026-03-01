import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ERPContextType {
  erp: string | null;
  setERP: (erp: string) => void;
  isVerified: boolean;
  studentName: string | null;
  classNo: string | null;
  isLoading: boolean;
  checkRoster: (erpToCheck: string) => Promise<boolean>;
}

const ERPContext = createContext<ERPContextType | undefined>(undefined);

export function ERPProvider({ children }: { children: React.ReactNode }) {
  const [erp, setErpState] = useState<string | null>(() => {
    return localStorage.getItem('student_erp');
  });
  const [isVerified, setIsVerified] = useState(false);
  const [studentName, setStudentName] = useState<string | null>(null);
  const [classNo, setClassNo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const latestCheckIdRef = useRef(0);

  const setERP = useCallback((newErp: string) => {
    setErpState(newErp);
    localStorage.setItem('student_erp', newErp);
  }, []);

  const checkRoster = useCallback(async (erpToCheck: string) => {
    const checkId = ++latestCheckIdRef.current;
    setIsLoading(true);
    try {
      if (erpToCheck === '00000') {
        if (checkId !== latestCheckIdRef.current) return false;
        setIsVerified(true);
        setStudentName('Test Student');
        setClassNo('TEST');
        return true;
      }

      // First check if verification is enabled
      const { data: settings } = await supabase
        .from('app_settings')
        .select('roster_verification_enabled')
        .single();

      if (checkId !== latestCheckIdRef.current) return false;
      const verificationEnabled = settings?.roster_verification_enabled ?? true;

      if (!verificationEnabled) {
        if (checkId !== latestCheckIdRef.current) return false;
        setIsVerified(true);
        setStudentName('Student');
        setClassNo(null);
        setIsLoading(false);
        return true;
      }

      const { data, error } = await supabase
        .rpc('check_roster', { check_erp: erpToCheck });

      if (checkId !== latestCheckIdRef.current) return false;
      if (error) {
        console.error('Roster check error:', error);
        toast.error('Failed to verify roster');
        setIsVerified(false);
        return false;
      }

      // data is returned as jsonb from the RPC
      const result = data as { found: boolean; student_name?: string; class_no?: string };

      if (result.found) {
        setIsVerified(true);
        setStudentName(result.student_name || null);
        setClassNo(result.class_no || null);
        return true;
      } else {
        setIsVerified(false);
        setStudentName(null);
        setClassNo(null);
        return false;
      }
    } catch (error) {
      if (checkId !== latestCheckIdRef.current) return false;
      console.error('Error checking roster:', error);
      setIsVerified(false);
      return false;
    } finally {
      if (checkId === latestCheckIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const detectErpFromUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isMounted) return;

      if (user?.email) {
        // Regex to extract 5 digits before @
        // e.g. s.khan.26611@khi.iba.edu.pk -> 26611
        const match = user.email.match(/(\d{5})@/);
        if (match && match[1]) {
          const autoErp = match[1];
          if (autoErp !== erp) {
            console.log('Auto-setting ERP from email:', autoErp);
            setERP(autoErp);
            return;
          }
        }
      }

      // If no ERP was detected and none persisted, stop initial loading.
      if (!erp) {
        setIsLoading(false);
      }
    };

    void detectErpFromUser();

    return () => {
      isMounted = false;
    };
  }, [erp, setERP]);

  useEffect(() => {
    if (!erp) {
      setIsVerified(false);
      setStudentName(null);
      setClassNo(null);
      setIsLoading(false);
      return;
    }

    void checkRoster(erp);
  }, [erp, checkRoster]);

  return (
    <ERPContext.Provider value={{ erp, setERP, isVerified, studentName, classNo, isLoading, checkRoster }}>
      {children}
    </ERPContext.Provider>
  );
}

export function useERP() {
  const context = useContext(ERPContext);
  if (context === undefined) {
    throw new Error('useERP must be used within an ERPProvider');
  }
  return context;
}
