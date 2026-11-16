import React, { useState } from 'react';
import {
  Shield,
  Key,
  X,
  Check,
  AlertCircle,
  Clock,
  Lock,
  Smartphone,
  QrCode,
  Trash2,
  Copy,
} from 'lucide-react';
import { useSecurity, type SecurityConfig } from '../context/SecurityContext';
import { useToast } from './Toast';

interface SecuritySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SecuritySettingsModal({
  isOpen,
  onClose,
}: SecuritySettingsModalProps) {
  const {
    config,
    updateConfig,
    updatePin,
    isTotpConfigured,
    setupTotpSecret,
    confirmAndSaveTotp,
    disableTotp,
  } = useSecurity();
  const toast = useToast();

  // Change PIN states
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isChangingPin, setIsChangingPin] = useState(false);

  // TOTP Setup states
  const [isSettingUpTotp, setIsSettingUpTotp] = useState(false);
  const [totpSetupData, setTotpSetupData] = useState<{
    secret: string;
    uri: string;
    qrDataUrl: string;
  } | null>(null);
  const [totpVerifyCode, setTotpVerifyCode] = useState('');
  const [totpError, setTotpError] = useState<string | null>(null);
  const [isActivatingTotp, setIsActivatingTotp] = useState(false);

  if (!isOpen) return null;

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);

    if (newPin !== confirmPin) {
      setPinError('New PIN and confirmation do not match.');
      return;
    }

    if (newPin.length < 4) {
      setPinError('New PIN must be at least 4 digits.');
      return;
    }

    setIsChangingPin(true);
    try {
      const res = await updatePin(currentPin, newPin);
      if (res.success) {
        toast.success('Manager Security PIN updated successfully!');
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
      } else {
        setPinError(res.error || 'Failed to update PIN.');
      }
    } catch (err: any) {
      setPinError(err.message || 'Error updating PIN.');
    } finally {
      setIsChangingPin(false);
    }
  };

  const handleStartTotpSetup = async () => {
    setIsSettingUpTotp(true);
    setTotpError(null);
    setTotpVerifyCode('');
    try {
      const setup = await setupTotpSecret();
      setTotpSetupData(setup);
    } catch (err: any) {
      setTotpError(err.message || 'Failed to generate QR code.');
    }
  };

  const handleConfirmTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpSetupData || !totpVerifyCode || isActivatingTotp) return;

    setIsActivatingTotp(true);
    setTotpError(null);

    try {
      const res = await confirmAndSaveTotp(totpSetupData.secret, totpVerifyCode);
      if (res.success) {
        toast.success('Google Authenticator successfully paired and activated!');
        setIsSettingUpTotp(false);
        setTotpSetupData(null);
        setTotpVerifyCode('');
      } else {
        setTotpError(res.error || 'Invalid code. Check your phone time and try again.');
      }
    } catch (err: any) {
      setTotpError(err.message || 'Activation failed.');
    } finally {
      setIsActivatingTotp(false);
    }
  };

  const handleDisableTotp = async () => {
    if (!window.confirm('Are you sure you want to disable Google Authenticator? Cashiers will only be able to unlock using the Master PIN.')) {
      return;
    }
    const res = await disableTotp();
    if (res.success) {
      toast.success('Google Authenticator disabled.');
      setIsSettingUpTotp(false);
      setTotpSetupData(null);
    } else {
      toast.error(res.error || 'Failed to disable Authenticator.');
    }
  };

  const handleToggle = (key: keyof Omit<SecurityConfig, 'autoLockMinutes'>) => {
    updateConfig({ [key]: !config[key] });
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200/60 dark:border-blue-800/60">
              <Shield className="w-5 h-5 stroke-[2]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Security & Fraud Prevention Settings
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage Master PIN, Google Authenticator OTP & Protections
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Google Authenticator (TOTP) Emergency Access Card */}
          <div className="p-4 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-200/70 dark:border-blue-900/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                    <span>Google Authenticator (Phone OTP)</span>
                    {isTotpConfigured && (
                      <span className="px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 text-[10px] font-mono font-bold border border-emerald-200 dark:border-emerald-800">
                        Active
                      </span>
                    )}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Provides remote rotating 30-second codes for emergency cashier access without revealing your PIN.
                  </p>
                </div>
              </div>

              {!isSettingUpTotp && (
                <div>
                  {isTotpConfigured ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleStartTotpSetup}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        Re-scan QR
                      </button>
                      <button
                        type="button"
                        onClick={handleDisableTotp}
                        className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                        title="Disable Authenticator"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartTotpSetup}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Setup Now</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* QR Code Setup Step */}
            {isSettingUpTotp && totpSetupData && (
              <div className="mt-3 p-4 bg-white dark:bg-slate-900 rounded-xl border border-blue-200 dark:border-blue-900/60 space-y-4 animate-in fade-in">
                <div className="flex flex-col sm:flex-row items-center gap-5">
                  {/* QR Code Image */}
                  <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-xs shrink-0">
                    <img
                      src={totpSetupData.qrDataUrl}
                      alt="Google Authenticator QR Code"
                      className="w-36 h-36 rounded-lg object-contain"
                    />
                  </div>

                  {/* Instructions */}
                  <div className="text-xs space-y-2 text-slate-700 dark:text-slate-300">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      Pairing Instructions:
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-400 text-[11px]">
                      <li>Open <strong>Google Authenticator</strong> on your phone.</li>
                      <li>Tap the <strong>+</strong> button and choose <strong>Scan a QR code</strong>.</li>
                      <li>Scan the QR code shown here on your screen.</li>
                    </ol>

                    <div className="pt-1">
                      <span className="text-[10px] text-slate-400 block mb-0.5">
                        Manual entry secret key (if camera is unavailable):
                      </span>
                      <div className="flex items-center gap-1.5">
                        <code className="px-2 py-0.5 font-mono text-[11px] font-bold bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 select-all">
                          {totpSetupData.secret.match(/.{1,4}/g)?.join(' ')}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(totpSetupData.secret);
                            toast.info('Secret copied to clipboard');
                          }}
                          className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                          title="Copy Secret"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Verification Confirmation */}
                <form
                  onSubmit={handleConfirmTotp}
                  className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center gap-3"
                >
                  <div className="flex-1 w-full">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                      Enter the 6-digit code currently showing on your phone to verify:
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={totpVerifyCode}
                      onChange={(e) => setTotpVerifyCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 482910"
                      className="w-full px-3 py-1.5 text-center font-mono font-bold tracking-widest text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                    />
                  </div>

                  <div className="flex items-center gap-2 self-end">
                    <button
                      type="button"
                      onClick={() => {
                        setIsSettingUpTotp(false);
                        setTotpSetupData(null);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isActivatingTotp || totpVerifyCode.length !== 6}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>{isActivatingTotp ? 'Verifying...' : 'Activate'}</span>
                    </button>
                  </div>
                </form>

                {totpError && (
                  <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{totpError}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Change PIN Section */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-3">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Change Manager Security PIN
              </h4>
            </div>

            <form onSubmit={handleSavePin} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                    Current PIN
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 1234"
                    maxLength={8}
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                    New PIN
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="New 4-8 digits"
                    maxLength={8}
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                    Confirm PIN
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Repeat new PIN"
                    maxLength={8}
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600 font-mono"
                  />
                </div>
              </div>

              {pinError && (
                <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{pinError}</span>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isChangingPin || !currentPin || !newPin || !confirmPin}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isChangingPin ? 'Updating...' : 'Update PIN'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Auto-lock Timer */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Automatic Security Relock Timer
              </label>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              When Manager unlocks the system, automatically re-lock back to Cashier Mode after inactivity:
            </p>
            <select
              value={config.autoLockMinutes}
              onChange={(e) => updateConfig({ autoLockMinutes: parseInt(e.target.value, 10) })}
              className="px-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-600"
            >
              <option value={5}>5 Minutes Inactivity</option>
              <option value={15}>15 Minutes Inactivity (Recommended)</option>
              <option value={30}>30 Minutes Inactivity</option>
              <option value={60}>1 Hour Inactivity</option>
              <option value={0}>Never (Manual Lock Only)</option>
            </select>
          </div>

          {/* Protected Sections Checklist */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-500" />
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Sections Protected from Cashiers
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {[
                { key: 'requireForInventory', label: 'Inventory (Prices, Stock & Edits)' },
                { key: 'requireForReports', label: 'Reports & Total Store Profits' },
                { key: 'requireForCashbook', label: 'Cashbook & Drawer Reconciliations' },
                { key: 'requireForSuppliers', label: 'Suppliers & Cheque Management' },
                { key: 'requireForReturns', label: 'Invoice Returns & Restocking' },
                { key: 'requireForGRN', label: 'GRN (Stock In Deliveries)' },
                { key: 'requireForBills', label: 'Credit GRN Bills & Payables' },
                { key: 'requireForAssets', label: 'Store Fixed Assets' },
                { key: 'requireForMarketing', label: 'Deadstock & Promotion Velocity' },
                { key: 'requireForBackup', label: 'Database Backup & Restore' },
              ].map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/80 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(config[key as keyof Omit<SecurityConfig, 'autoLockMinutes'>])}
                    onChange={() => handleToggle(key as keyof Omit<SecurityConfig, 'autoLockMinutes'>)}
                    className="rounded text-blue-600 focus:ring-blue-600 w-4 h-4"
                  />
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
