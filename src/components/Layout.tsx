import { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import {
  Package,
  Monitor,
  Receipt,
  Truck,
  Megaphone,
  ShoppingCart,
  BarChart3,
  FileText,
  Database,
  ShieldCheck,
  Moon,
  Sun,
  ClipboardList,
  Wallet,
  Users,
  RefreshCw,
  Lock,
  Unlock,
  Settings,
} from 'lucide-react';
import { db } from '../db';
import { useToast } from './Toast';
import BackupModal from './BackupModal';
import UpdateNotifier from './UpdateNotifier';
import AboutModal from './AboutModal';
import SecuritySettingsModal from './SecuritySettingsModal';
import { useSecurity, type SecurityConfig } from '../context/SecurityContext';
import hiruLogo from '../assets/logo.png';
import inkoartLogo from '../assets/inkoart-logo.png';

interface NavGroup {
  label: string;
  items: Array<{
    name: string;
    path: string;
    icon: any;
    permKey?: keyof Omit<SecurityConfig, 'autoLockMinutes'>;
    badge?: string;
  }>;
}

const navGroups: NavGroup[] = [
  {
    label: 'OPERATIONS',
    items: [
      { name: 'POS & Sales', path: '/', icon: ShoppingCart },
      { name: 'Invoices', path: '/invoices', icon: FileText },
      { name: 'Cashbook', path: '/cashbook', icon: Wallet, permKey: 'requireForCashbook' },
      { name: 'Credit Book', path: '/credit', icon: Users },
    ],
  },
  {
    label: 'STOCK & PROCUREMENT',
    items: [
      { name: 'Inventory', path: '/inventory', icon: Package, permKey: 'requireForInventory' },
      { name: 'GRN (Stock In)', path: '/grn', icon: ClipboardList, permKey: 'requireForGRN' },
      { name: 'Credit GRN Invoices', path: '/bills', icon: Receipt, permKey: 'requireForBills' },
      { name: 'Suppliers', path: '/suppliers', icon: Truck, permKey: 'requireForSuppliers' },
      { name: 'Assets', path: '/assets', icon: Monitor, permKey: 'requireForAssets' },
    ],
  },
  {
    label: 'ANALYTICS & GROWTH',
    items: [
      { name: 'Reports & Analytics', path: '/reports', icon: BarChart3, permKey: 'requireForReports' },
      { name: 'Marketing', path: '/marketing', icon: Megaphone, permKey: 'requireForMarketing' },
    ],
  },
];

function useTheme() {
  const [dark, setDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('hiru-theme') || localStorage.getItem('nethmi-theme');
    if (saved) return saved === 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('hiru-theme', dark ? 'dark' : 'light');
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}

export default function Layout() {
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isSecuritySettingsOpen, setIsSecuritySettingsOpen] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const toast = useToast();
  const { dark, toggle } = useTheme();
  const { isUnlocked, config, lock, requestAuth } = useSecurity();

  const handleManualCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    toast.info('Checking for latest updates...');
    try {
      const res = await db.updater.check();
      if (!res.success && res.error) {
        if (res.error === 'Dev mode') {
          toast.info('Updates are disabled in development mode.');
        } else {
          toast.error(res.error, 'Update check error');
        }
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to check updates');
    } finally {
      setTimeout(() => setIsCheckingUpdate(false), 2000);
    }
  };

  const handleOpenBackup = async () => {
    if (config.requireForBackup && !isUnlocked) {
      const authorized = await requestAuth('Manager authorization required to access Data & Backup.');
      if (!authorized) return;
    }
    setIsBackupModalOpen(true);
  };

  return (
    <div className="flex h-screen print:h-auto print:block print:bg-white bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 antialiased selection:bg-blue-600 selection:text-white">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 select-none print:hidden z-20">
        {/* Brand Header */}
        <div className="h-16 flex items-center px-4 border-b border-slate-200 dark:border-slate-800 justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={hiruLogo}
              alt="Hiru Logo"
              className="w-9 h-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h1 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate tracking-tight">
                  Hiru Bookshop
                </h1>
                <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-1 py-0.2 rounded border border-slate-200 dark:border-slate-700">
                  v1.0.4
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate font-medium">
                Maniyangama, Avissawella
              </p>
            </div>
          </div>
        </div>

        {/* Security Role Mode Pill */}
        <div className="px-3.5 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isUnlocked ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
              }`}
            />
            <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
              {isUnlocked ? 'Manager Mode' : 'Cashier Mode'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {isUnlocked ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsSecuritySettingsOpen(true)}
                  title="Security & PIN Settings"
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={lock}
                  title="Lock to Cashier Mode"
                  className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-[10px] font-semibold text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Lock className="w-2.5 h-2.5" />
                  <span>Lock</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() =>
                  requestAuth('Enter Manager PIN to unlock full management access.')
                }
                className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/80 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60 text-[10px] font-semibold transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
              >
                <Unlock className="w-2.5 h-2.5" />
                <span>Unlock</span>
              </button>
            )}
          </div>
        </div>

        {/* Grouped Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-1">
              <span className="px-3 text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase block mb-1">
                {group.label}
              </span>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isItemLocked =
                    !isUnlocked && item.permKey && config[item.permKey];

                  return (
                    <li key={item.name}>
                      <NavLink
                        to={item.path}
                        className={({ isActive }) =>
                          `flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                            isActive
                              ? 'bg-blue-50/90 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 font-semibold border-l-2 border-blue-600 shadow-2xs'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                          }`
                        }
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Icon className="w-4 h-4 shrink-0 stroke-[1.8]" />
                          <span className="truncate">{item.name}</span>
                        </div>

                        {isItemLocked && (
                          <Lock className="w-3 h-3 text-slate-400 dark:text-slate-500 stroke-[2] shrink-0" />
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer Controls */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 bg-slate-50/50 dark:bg-slate-900/50">
          {/* Theme Switcher */}
          <button
            type="button"
            onClick={toggle}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors text-xs font-medium border border-slate-200 dark:border-slate-700/80 cursor-pointer shadow-2xs"
            title="Toggle theme (Light / Dark)"
          >
            <div className="flex items-center gap-2">
              {dark ? (
                <Moon className="w-3.5 h-3.5 text-blue-400" />
              ) : (
                <Sun className="w-3.5 h-3.5 text-amber-500" />
              )}
              <span>{dark ? 'Dark Mode' : 'Light Mode'}</span>
            </div>
            <span
              className={`w-8 h-4.5 rounded-full p-0.5 transition-colors ${
                dark ? 'bg-blue-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`block w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                  dark ? 'translate-x-3.5' : ''
                }`}
              />
            </span>
          </button>

          {/* Data & Backup */}
          <button
            type="button"
            onClick={handleOpenBackup}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors text-xs font-medium border border-slate-200 dark:border-slate-700/80 cursor-pointer shadow-2xs"
            title="Backup or restore database"
          >
            <div className="flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Data & Backup</span>
            </div>
            {!isUnlocked && config.requireForBackup ? (
              <Lock className="w-3 h-3 text-slate-400" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>

          {/* Online Updates */}
          <button
            type="button"
            onClick={handleManualCheckUpdate}
            disabled={isCheckingUpdate}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-[11px] font-medium cursor-pointer disabled:opacity-50"
            title="Check for software updates"
          >
            <div className="flex items-center gap-2">
              <RefreshCw
                className={`w-3.5 h-3.5 text-slate-400 ${
                  isCheckingUpdate ? 'animate-spin text-blue-600' : ''
                }`}
              />
              <span>{isCheckingUpdate ? 'Checking...' : 'Check for Updates'}</span>
            </div>
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
              Online
            </span>
          </button>

          {/* System & Developer Info */}
          <button
            type="button"
            onClick={() => setIsAboutModalOpen(true)}
            className="w-full flex items-center justify-between px-3 py-1 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors text-[10px] font-medium cursor-pointer"
            title="System Design & Developer Details"
          >
            <div className="flex items-center gap-1.5">
              <img
                src={inkoartLogo}
                alt="Inkoart"
                className="w-3.5 h-3.5 rounded-xs object-cover opacity-80"
              />
              <span>System Credits</span>
            </div>
            <span className="font-mono text-slate-400">Inkoart</span>
          </button>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <main className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950 min-w-0 print:overflow-visible print:h-auto print:bg-white">
        <Outlet />
      </main>

      {/* Backup & Restore Modal */}
      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
      />

      {/* System & Developer Info Modal */}
      <AboutModal
        isOpen={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
      />

      {/* Security & PIN Settings Modal */}
      <SecuritySettingsModal
        isOpen={isSecuritySettingsOpen}
        onClose={() => setIsSecuritySettingsOpen(false)}
      />

      {/* Auto-updater notifications */}
      <UpdateNotifier />
    </div>
  );
}
