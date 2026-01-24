import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface RosterInfo {
  found: boolean;
  student_name?: string;
  class_no?: string;
}

interface ERPContextType {
  erp: string;
  setErp: (erp: string) => void;
  rosterInfo: RosterInfo | null;
  isVerifying: boolean;
  isVerificationEnabled: boolean;
  verifyErp: (erp: string) => Promise<RosterInfo>;
  clearErp: () => void;
}

const ERPContext = createContext<ERPContextType | undefined>(undefined);

const STORAGE_KEY = 'ta_dashboard_erp';

export function ERPProvider({ children }: { children: React.ReactNode }) {
  const [erp, setErpState] = useState<string>('');
  const [rosterInfo, setRosterInfo] = useState<RosterInfo | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerificationEnabled, setIsVerificationEnabled] = useState(true);

  useEffect(() => {
    const storedErp = localStorage.getItem(STORAGE_KEY);
    if (storedErp) {
      setErpState(storedErp);
    }

    // Check if roster verification is enabled
    supabase
      .from('app_settings')
      .select('roster_verification_enabled')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single()
      .then(({ data }) => {
        if (data) {
          setIsVerificationEnabled(data.roster_verification_enabled);
        }
      });
  }, []);

  const setErp = (newErp: string) => {
    setErpState(newErp);
    localStorage.setItem(STORAGE_KEY, newErp);
    setRosterInfo(null);
  };

  const verifyErp = async (checkErp: string): Promise<RosterInfo> => {
    if (!isVerificationEnabled) {
      const info = { found: true };
      setRosterInfo(info);
      return info;
    }

    setIsVerifying(true);
    try {
      const { data, error } = await supabase.rpc('check_roster', { check_erp: checkErp });
      
      if (error) {
        console.error('Error checking roster:', error);
        const info: RosterInfo = { found: false };
        setRosterInfo(info);
        return info;
      }

      const info = data as unknown as RosterInfo;
      setRosterInfo(info);
      return info;
    } finally {
      setIsVerifying(false);
    }
  };

  const clearErp = () => {
    setErpState('');
    localStorage.removeItem(STORAGE_KEY);
    setRosterInfo(null);
  };

  return (
    <ERPContext.Provider value={{ 
      erp, 
      setErp, 
      rosterInfo, 
      isVerifying, 
      isVerificationEnabled, 
      verifyErp,
      clearErp 
    }}>
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
