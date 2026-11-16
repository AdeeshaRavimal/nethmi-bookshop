import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { db } from '../db';
import {
  generateTotpSecret,
  generateOtpAuthUri,
  verifyTotpCode,
} from '../utils/totp';

export interface SecurityConfig {
  requireForInventory: boolean;
  requireForReports: boolean;
  requireForCashbook: boolean;
  requireForSuppliers: boolean;
  requireForAssets: boolean;
  requireForMarketing: boolean;
  requireForGRN: boolean;
  requireForBills: boolean;
  requireForReturns: boolean;
  requireForBackup: boolean;
  autoLockMinutes: number; // 0 = never auto lock
}

const DEFAULT_CONFIG: SecurityConfig = {
  requireForInventory: true,
  requireForReports: true,
  requireForCashbook: true,
  requireForSuppliers: true,
  requireForAssets: true,
  requireForMarketing: true,
  requireForGRN: true,
  requireForBills: true,
  requireForReturns: true,
  requireForBackup: true,
  autoLockMinutes: 15,
};

const DEFAULT_PIN = '1234';

interface SecurityContextType {
  isUnlocked: boolean;
  config: SecurityConfig;
  hasCustomPin: boolean;
  isTotpConfigured: boolean;
  verifyPin: (pin: string) => Promise<boolean>;
  verifyTotp: (code: string) => Promise<boolean>;
  verifyPinOrOtp: (code: string) => Promise<boolean>;
  unlock: (pin: string) => Promise<boolean>;
  unlockWithTotp: (code: string) => Promise<boolean>;
  lock: () => void;
  updatePin: (oldPin: string, newPin: string) => Promise<{ success: boolean; error?: string }>;
  updateConfig: (newConfig: Partial<SecurityConfig>) => Promise<void>;
  setupTotpSecret: () => Promise<{ secret: string; uri: string; qrDataUrl: string }>;
  confirmAndSaveTotp: (secret: string, verificationCode: string) => Promise<{ success: boolean; error?: string }>;
  disableTotp: () => Promise<{ success: boolean; error?: string }>;
  requestAuth: (reason: string) => Promise<boolean>;
  // For modal handling
  authModalState: {
    isOpen: boolean;
    reason: string;
    resolve?: (value: boolean) => void;
  };
  closeAuthModal: (success: boolean) => void;
}

const SecurityContext = createContext<SecurityContextType | null>(null);

export function SecurityProvider({ children }: { children: ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [config, setConfig] = useState<SecurityConfig>(DEFAULT_CONFIG);
  const [hasCustomPin, setHasCustomPin] = useState(false);
  const [isTotpConfigured, setIsTotpConfigured] = useState(false);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const [authModalState, setAuthModalState] = useState<{
    isOpen: boolean;
    reason: string;
    resolve?: (value: boolean) => void;
  }>({
    isOpen: false,
    reason: '',
  });

  // Load configuration, PIN, and TOTP status from db settings
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [pinRes, configRes, totpRes] = await Promise.all([
          db.settings.get('manager_security_pin', DEFAULT_PIN),
          db.settings.get('manager_security_config', ''),
          db.settings.get('manager_totp_secret', ''),
        ]);

        if (!isMounted) return;

        if (pinRes.success && pinRes.value && pinRes.value !== DEFAULT_PIN) {
          setHasCustomPin(true);
        }

        if (totpRes.success && totpRes.value && totpRes.value.trim().length >= 16) {
          setIsTotpConfigured(true);
        }

        if (configRes.success && configRes.value) {
          try {
            const parsed = JSON.parse(configRes.value);
            setConfig((prev) => ({ ...prev, ...parsed }));
          } catch {
            // Ignore parse errors, use defaults
          }
        }
      } catch (err) {
        console.error('Failed to load security settings:', err);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // Activity tracker for auto-lock
  useEffect(() => {
    if (!isUnlocked || config.autoLockMinutes <= 0) return;

    const interval = setInterval(() => {
      const elapsedMinutes = (Date.now() - lastActivity) / 1000 / 60;
      if (elapsedMinutes >= config.autoLockMinutes) {
        setIsUnlocked(false);
      }
    }, 15000); // Check every 15s

    const handleUserActivity = () => {
      setLastActivity(Date.now());
    };

    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('mousedown', handleUserActivity);

    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('mousedown', handleUserActivity);
    };
  }, [isUnlocked, lastActivity, config.autoLockMinutes]);

  const getStoredPin = useCallback(async (): Promise<string> => {
    try {
      const res = await db.settings.get('manager_security_pin', DEFAULT_PIN);
      return res.success && res.value ? res.value : DEFAULT_PIN;
    } catch {
      return DEFAULT_PIN;
    }
  }, []);

  const getStoredTotpSecret = useCallback(async (): Promise<string> => {
    try {
      const res = await db.settings.get('manager_totp_secret', '');
      return res.success && res.value ? res.value : '';
    } catch {
      return '';
    }
  }, []);

  const verifyPin = useCallback(
    async (inputPin: string): Promise<boolean> => {
      const stored = await getStoredPin();
      return inputPin.trim() === stored.trim();
    },
    [getStoredPin]
  );

  const verifyTotp = useCallback(
    async (code: string): Promise<boolean> => {
      const secret = await getStoredTotpSecret();
      if (!secret) return false;
      return verifyTotpCode(secret, code.trim());
    },
    [getStoredTotpSecret]
  );

  const verifyPinOrOtp = useCallback(
    async (code: string): Promise<boolean> => {
      // 1. Try checking as Master PIN
      const isPinValid = await verifyPin(code);
      if (isPinValid) return true;

      // 2. Try checking as Google Authenticator 6-digit OTP
      if (code.trim().length === 6) {
        const isTotpValid = await verifyTotp(code);
        if (isTotpValid) return true;
      }

      return false;
    },
    [verifyPin, verifyTotp]
  );

  const unlock = useCallback(
    async (inputPin: string): Promise<boolean> => {
      const isValid = await verifyPin(inputPin);
      if (isValid) {
        setIsUnlocked(true);
        setLastActivity(Date.now());
        return true;
      }
      return false;
    },
    [verifyPin]
  );

  const unlockWithTotp = useCallback(
    async (code: string): Promise<boolean> => {
      const isValid = await verifyTotp(code);
      if (isValid) {
        setIsUnlocked(true);
        setLastActivity(Date.now());
        return true;
      }
      return false;
    },
    [verifyTotp]
  );

  const lock = useCallback(() => {
    setIsUnlocked(false);
  }, []);

  const updatePin = useCallback(
    async (oldPin: string, newPin: string): Promise<{ success: boolean; error?: string }> => {
      if (!newPin || newPin.length < 4) {
        return { success: false, error: 'New PIN must be at least 4 digits.' };
      }
      const isValid = await verifyPin(oldPin);
      if (!isValid) {
        return { success: false, error: 'Current Manager PIN is incorrect.' };
      }

      try {
        const res = await db.settings.set('manager_security_pin', newPin.trim());
        if (res.success) {
          setHasCustomPin(true);
          return { success: true };
        }
        return { success: false, error: 'Database update failed.' };
      } catch (err: any) {
        return { success: false, error: err.message || 'Failed to save new PIN.' };
      }
    },
    [verifyPin]
  );

  const updateConfig = useCallback(async (newConfig: Partial<SecurityConfig>) => {
    setConfig((prev) => {
      const updated = { ...prev, ...newConfig };
      db.settings.set('manager_security_config', JSON.stringify(updated)).catch(console.error);
      return updated;
    });
  }, []);

  const setupTotpSecret = useCallback(async () => {
    const secret = generateTotpSecret();
    const uri = generateOtpAuthUri(secret, 'Manager', 'Hiru Bookshop');
    const qrDataUrl = await QRCode.toDataURL(uri, {
      width: 220,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
    return { secret, uri, qrDataUrl };
  }, []);

  const confirmAndSaveTotp = useCallback(
    async (secret: string, verificationCode: string): Promise<{ success: boolean; error?: string }> => {
      const isValid = await verifyTotpCode(secret, verificationCode.trim());
      if (!isValid) {
        return { success: false, error: 'Invalid Google Authenticator code. Please check your phone time and try again.' };
      }

      try {
        const res = await db.settings.set('manager_totp_secret', secret.trim());
        if (res.success) {
          setIsTotpConfigured(true);
          return { success: true };
        }
        return { success: false, error: 'Failed to save Authenticator secret.' };
      } catch (err: any) {
        return { success: false, error: err.message || 'Error activating Authenticator.' };
      }
    },
    []
  );

  const disableTotp = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await db.settings.set('manager_totp_secret', '');
      if (res.success) {
        setIsTotpConfigured(false);
        return { success: true };
      }
      return { success: false, error: 'Failed to disable Authenticator.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error disabling Authenticator.' };
    }
  }, []);

  const requestAuth = useCallback(
    (reason: string): Promise<boolean> => {
      if (isUnlocked) {
        setLastActivity(Date.now());
        return Promise.resolve(true);
      }

      return new Promise<boolean>((resolve) => {
        setAuthModalState({
          isOpen: true,
          reason,
          resolve,
        });
      });
    },
    [isUnlocked]
  );

  const closeAuthModal = useCallback((success: boolean) => {
    setAuthModalState((prev) => {
      if (prev.resolve) {
        prev.resolve(success);
      }
      return { isOpen: false, reason: '', resolve: undefined };
    });
    if (success) {
      setIsUnlocked(true);
      setLastActivity(Date.now());
    }
  }, []);

  return (
    <SecurityContext.Provider
      value={{
        isUnlocked,
        config,
        hasCustomPin,
        isTotpConfigured,
        verifyPin,
        verifyTotp,
        verifyPinOrOtp,
        unlock,
        unlockWithTotp,
        lock,
        updatePin,
        updateConfig,
        setupTotpSecret,
        confirmAndSaveTotp,
        disableTotp,
        requestAuth,
        authModalState,
        closeAuthModal,
      }}
    >
      {children}
    </SecurityContext.Provider>
  );
}

export function useSecurity() {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error('useSecurity must be used within a SecurityProvider');
  }
  return context;
}
