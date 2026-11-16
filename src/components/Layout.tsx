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
} from 'lucide-react';
import { db } from '../db';
import { useToast } from './Toast';
import BackupModal from './BackupModal';
import UpdateNotifier from './UpdateNotifier';
import AboutModal from './AboutModal';
import hiruLogo from '../assets/logo.png';
import inkoartLogo from '../assets/inkoart-logo.png';

interface NavGroup {
  label: string;
  items: Array<{
    name: string;
    path: string;
    icon: any;
    badge?: string;
  }>;
}

const navGroups: NavGroup[] = [
  {
    label: 'OPERATIONS',
    items: [
      { name: 'POS & Sales', path: '/', icon: ShoppingCart },
      { name: 'Invoices', path: '/invoices', icon: FileText },
      { name: 'Cashbook', path: '/cashbook', icon: Wallet },
      { name: 'Credit Book', path: '/credit', icon: Users },
    ],
  },
  {
    label: 'STOCK & PROCUREMENT',
    items: [
      { name: 'Inventory', path: '/inventory', icon: Package },
      { name: 'GRN (Stock In)', path: '/grn', icon: ClipboardList },
      { name: 'Credit GRN Invoices', path: '/bills', icon: Receipt },
      { name: 'Suppliers', path: '/suppliers', icon: Truck },
      { name: 'Assets', path: '/assets', icon: Monitor },
    ],
  },
  {
    label: 'ANALYTICS & GROWTH',
    items: [
      { name: 'Reports & Analytics', path: '/reports', icon: BarChart3 },
      { name: 'Marketing', path: '/marketing', icon: Megaphone },
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

  return { dark, toggle: () => setDark(d => !d) };
}

export default function Layout() {
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const toast = useToast();
  const { dark, toggle } = useTheme();

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

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 antialiased selection:bg-blue-600 selection:text-white">
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
              {dark ? <Moon className="w-3.5 h-3.5 text-blue-400" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
              <span>{dark ? 'Dark Mode' : 'Light Mode'}</span>
            </div>
            <span className={`w-8 h-4.5 rounded-full p-0.5 transition-colors ${dark ? 'bg-blue-600' : 'bg-slate-300'}`}>
              <span className={`block w-3.5 h-3.5 rounded-full bg-white transition-transform ${dark ? 'translate-x-3.5' : ''}`} />
            </span>
          </button>

          {/* Data & Backup */}
          <button
            type="button"
            onClick={() => setIsBackupModalOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors text-xs font-medium border border-slate-200 dark:border-slate-700/80 cursor-pointer shadow-2xs"
            title="Backup or restore database"
          >
            <div className="flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Data & Backup</span>
            </div>
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
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
              <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${isCheckingUpdate ? 'animate-spin text-blue-600' : ''}`} />
              <span>{isCheckingUpdate ? 'Checking...' : 'Check for Updates'}</span>
            </div>
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">Online</span>
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
      <main className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950 min-w-0">
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

      {/* Auto-updater notifications */}
      <UpdateNotifier />
    </div>
  );
}
