import React, { useState, useRef, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Lock, ArrowLeft, Check, AlertCircle, Smartphone } from 'lucide-react';
import { useSecurity, type SecurityConfig } from '../context/SecurityContext';

interface ProtectedRouteProps {
  permission: keyof Omit<SecurityConfig, 'autoLockMinutes'>;
  title: string;
  description: string;
  children: React.ReactNode;
}

export default function ProtectedRoute({
  permission,
  title,
  description,
  children,
}: ProtectedRouteProps) {
  const { isUnlocked, config, unlock, unlockWithTotp, verifyPinOrOtp, hasCustomPin, isTotpConfigured } = useSecurity();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [redirectToPOS, setRedirectToPOS] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isUnlocked && config[permission]) {
      inputRef.current?.focus();
    }
  }, [isUnlocked, config, permission]);

  // If this permission is turned off in settings, allow direct access
  if (!config[permission]) {
    return <>{children}</>;
  }

  // If currently unlocked in Manager mode, allow access
  if (isUnlocked) {
    return <>{children}</>;
  }

  if (redirectToPOS) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pin || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const isValid = await verifyPinOrOtp(pin);
      if (isValid) {
        if (pin.length === 6 && isTotpConfigured) {
          await unlockWithTotp(pin);
        } else {
          await unlock(pin);
        }
      } else {
        setError(isTotpConfigured ? 'Incorrect PIN or Google Authenticator code.' : 'Incorrect PIN. Please try again.');
        setPin('');
        inputRef.current?.focus();
      }
    } catch (err: any) {
      setError(err.message || 'Verification error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Banner */}
        <div className="p-6 bg-slate-900 dark:bg-slate-950 text-white flex items-center gap-4 border-b border-slate-800">
          <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <Lock className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400 font-bold block mb-0.5">
              Cashier Restriction &bull; Manager Only
            </span>
            <h2 className="text-base font-bold text-white tracking-tight">
              {title}
            </h2>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {description}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Manager Security PIN or Authenticator OTP
                </label>
                {isTotpConfigured && (
                  <span className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                    <Smartphone className="w-3 h-3" />
                    Google Auth Ready
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  ref={inputRef}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    if (val.length <= 8) setPin(val);
                    setError(null);
                  }}
                  placeholder="&bull; &bull; &bull; &bull;"
                  className="w-full text-center text-xl tracking-[0.4em] font-mono font-bold py-3 px-4 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all"
                  autoFocus
                />
              </div>

              {error && (
                <div className="mt-2 flex items-center gap-1.5 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRedirectToPOS(true)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to POS</span>
              </button>

              <button
                type="submit"
                disabled={isSubmitting || pin.length < 4}
                className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>{isSubmitting ? 'Verifying...' : 'Unlock Section'}</span>
              </button>
            </div>
          </form>

          {!hasCustomPin && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 rounded-xl text-[11px] text-amber-800 dark:text-amber-300">
              Default Manager PIN is <strong className="font-mono">1234</strong>. You can change this or activate Google Authenticator in Security Settings.
            </div>
          )}

          {isTotpConfigured && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center">
              💡 <strong>Remote Manager Emergency:</strong> Ask the manager for the 6-digit code currently visible on their Google Authenticator app.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
