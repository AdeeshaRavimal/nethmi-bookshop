import React, { useState, useEffect, useRef } from 'react';
import { Lock, X, Delete, Check, AlertCircle, KeyRound } from 'lucide-react';
import { useSecurity } from '../context/SecurityContext';

export default function SecurityPinModal() {
  const { authModalState, closeAuthModal, verifyPin, hasCustomPin } = useSecurity();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (authModalState.isOpen) {
      setPin('');
      setError(null);
      setIsSubmitting(false);
      setShake(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [authModalState.isOpen]);

  if (!authModalState.isOpen) return null;

  const handleDigit = (digit: string) => {
    if (pin.length < 8) {
      setPin((prev) => prev + digit);
      setError(null);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    setPin('');
    setError(null);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pin || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const isValid = await verifyPin(pin);
      if (isValid) {
        closeAuthModal(true);
      } else {
        setShake(true);
        setError('Incorrect PIN. Please try again.');
        setTimeout(() => setShake(false), 500);
        setPin('');
        inputRef.current?.focus();
      }
    } catch (err: any) {
      setError(err.message || 'Verification error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeAuthModal(false);
    } else if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
      onKeyDown={handleKeyDown}
    >
      <div
        className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-sm overflow-hidden transition-transform ${
          shake ? 'animate-shake' : ''
        }`}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200/60 dark:border-blue-800/60">
              <Lock className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Manager Authorization
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Protected action / section
              </p>
            </div>
          </div>
          <button
            onClick={() => closeAuthModal(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Reason Banner */}
        {authModalState.reason && (
          <div className="px-5 py-2.5 bg-blue-50/60 dark:bg-blue-950/30 border-b border-blue-100/60 dark:border-blue-900/40 flex items-start gap-2 text-xs text-blue-900 dark:text-blue-200">
            <KeyRound className="w-3.5 h-3.5 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-[11px] font-medium leading-relaxed">
              {authModalState.reason}
            </span>
          </div>
        )}

        {/* PIN Input Display */}
        <div className="p-5 flex flex-col items-center">
          <div className="text-center mb-4">
            <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
              Enter Manager Security PIN
            </label>

            {/* Hidden native input for physical keyboard entry */}
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                if (val.length <= 8) setPin(val);
              }}
              className="sr-only"
              autoFocus
            />

            {/* Visual PIN circles */}
            <div
              onClick={() => inputRef.current?.focus()}
              className="flex items-center justify-center gap-3 py-2 cursor-pointer"
            >
              {[0, 1, 2, 3].map((idx) => {
                const hasValue = pin.length > idx;
                return (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-full border transition-all duration-150 ${
                      hasValue
                        ? 'bg-blue-600 border-blue-600 scale-110 shadow-xs'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800'
                    }`}
                  />
                );
              })}
              {pin.length > 4 && (
                <span className="text-xs font-mono font-bold text-blue-600 ml-1">
                  +{pin.length - 4}
                </span>
              )}
            </div>

            {error && (
              <div className="mt-2.5 flex items-center justify-center gap-1.5 text-rose-600 dark:text-rose-400 text-xs font-semibold animate-in fade-in">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* On-screen Keypad */}
          <div className="grid grid-cols-3 gap-2 w-full max-w-[240px]">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleDigit(digit)}
                className="h-11 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-mono text-base font-bold transition-all active:scale-95 cursor-pointer shadow-2xs"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="h-11 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-2xs"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="h-11 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-mono text-base font-bold transition-all active:scale-95 cursor-pointer shadow-2xs"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="h-11 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-2xs"
              title="Backspace"
            >
              <Delete className="w-4 h-4" />
            </button>
          </div>

          {/* Action buttons */}
          <div className="w-full mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => closeAuthModal(false)}
              className="flex-1 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={isSubmitting || pin.length < 4}
              className="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{isSubmitting ? 'Verifying...' : 'Authorize'}</span>
            </button>
          </div>

          {!hasCustomPin && (
            <p className="mt-3 text-[10px] text-slate-400 dark:text-slate-500 text-center">
              Default Manager PIN is <strong className="font-mono text-slate-600 dark:text-slate-300">1234</strong>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
