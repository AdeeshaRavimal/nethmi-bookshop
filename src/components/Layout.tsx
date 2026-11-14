import { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import {
  Package,
  Monitor,
  Receipt,
  Truck,
  Megaphone,
  ShoppingCart,
  BarChart,
  FileText,
  Database,
  ShieldCheck,
  Moon,
  Sun,
  ClipboardList,
  Wallet,
} from 'lucide-react';
import BackupModal from './BackupModal';
import UpdateNotifier from './UpdateNotifier';
import AboutModal from './AboutModal';
import hiruLogo from '../assets/logo.png';
import inkoartLogo from '../assets/inkoart-logo.png';

const navItems = [
  { name: 'POS & Sales', path: '/', icon: ShoppingCart },
  { name: 'Invoices', path: '/invoices', icon: FileText },
  { name: 'Cashbook', path: '/cashbook', icon: Wallet },
  { name: 'Inventory', path: '/inventory', icon: Package },
  { name: 'GRN (Stock In)', path: '/grn', icon: ClipboardList },
  { name: 'Credit GRN Invoices', path: '/bills', icon: Receipt },
  { name: 'Assets', path: '/assets', icon: Monitor },
  { name: 'Suppliers', path: '/suppliers', icon: Truck },
  { name: 'Marketing', path: '/marketing', icon: Megaphone },
  { name: 'Reports', path: '/reports', icon: BarChart },
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
  const { dark, toggle } = useTheme();

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col print:hidden">
        <div className="h-16 flex items-center px-5 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <img
              src={hiruLogo}
              alt="Hiru Logo"
              className="w-10 h-10 rounded-xl shadow-xs object-cover border border-gray-100 dark:border-gray-700"
            />
            <div>
              <h1 className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">Hiru Bookshop & Communication</h1>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold tracking-wide">Maniyangama, Avissawella</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.name}>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      `flex items-center px-6 py-3 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-r-4 border-blue-600 font-semibold'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                      }`
                    }
                  >
                    <Icon className="w-5 h-5 mr-3 shrink-0" />
                    {item.name}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Sidebar Footer: Theme toggle, Database Safety & Backup */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-2">
          <button
            onClick={toggle}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors text-xs font-bold border border-gray-100 dark:border-gray-700 cursor-pointer"
            title="Toggle dark mode"
          >
            <div className="flex items-center gap-2">
              {dark ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
              <span>{dark ? 'Dark Mode' : 'Light Mode'}</span>
            </div>
            <span className={`w-9 h-5 rounded-full p-0.5 transition-colors ${dark ? 'bg-indigo-500' : 'bg-gray-300'}`}>
              <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${dark ? 'translate-x-4' : ''}`} />
            </span>
          </button>

          <button
            onClick={() => setIsBackupModalOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 transition-colors text-xs font-bold border border-blue-100 dark:border-blue-800 shadow-xs cursor-pointer"
            title="Backup or restore SQLite database"
          >
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Data & Backup</span>
            </div>
            <ShieldCheck className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
          </button>

          {/* System & Company Info button */}
          <button
            onClick={() => setIsAboutModalOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-[11px] font-semibold cursor-pointer"
            title="System Design & Developer Details"
          >
            <div className="flex items-center gap-2">
              <img
                src={inkoartLogo}
                alt="Inkoart"
                className="w-4 h-4 rounded-sm object-cover bg-[#ece9e6]"
              />
              <span>System Info & Credits</span>
            </div>
            <span className="text-[10px] text-gray-400 font-mono">Inkoart</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-950">
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
