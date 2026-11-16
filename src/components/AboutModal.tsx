import { useEffect } from 'react';
import { X, Globe, Mail, Phone, Code2 } from 'lucide-react';
import hiruLogo from '../assets/logo.png';
import inkoartLogo from '../assets/inkoart-logo.png';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AboutModal({ isOpen, onClose }: AboutModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Banner - Corporate Blue Minimal */}
        <div className="bg-slate-900 text-white p-5 relative border-b border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3.5">
            <img 
              src={hiruLogo} 
              alt="Hiru Logo" 
              className="w-12 h-12 rounded-xl border border-slate-700 object-cover bg-white shrink-0" 
            />
            <div className="min-w-0 pr-6">
              <h2 className="text-sm font-bold text-white tracking-tight truncate">Hiru Bookshop & Communication</h2>
              <p className="text-xs text-slate-400 mt-0.5 truncate">Maniyangama, Avissawella • 070200042</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-mono text-blue-400 font-semibold bg-blue-950/60 border border-blue-800/80 px-1.5 py-0.2 rounded">
                  v1.0.4 Enterprise
                </span>
                <span className="text-[10px] text-slate-400 font-medium">Point of Sale System</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {/* Developer / Company Card */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700/80">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Designed & Engineered By
              </span>
              <span className="text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-300 bg-slate-200/70 dark:bg-slate-700 px-2 py-0.5 rounded">
                Official Release
              </span>
            </div>

            <div className="flex items-center gap-3 mb-3">
              <img
                src={inkoartLogo}
                alt="Inkoart Logo"
                className="w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700 object-cover bg-[#ece9e6]"
              />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">Inkoart</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Software & POS Engineering Solutions</p>
              </div>
            </div>

            {/* Contact Details List */}
            <div className="space-y-1.5 pt-2.5 border-t border-slate-200 dark:border-slate-700 text-xs">
              <a 
                href="https://inkoart.online" 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 py-1 transition-colors"
              >
                <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="font-medium text-slate-500 dark:text-slate-400">Website:</span>
                <span className="font-mono text-blue-600 dark:text-blue-400">inkoart.online</span>
              </a>

              <a 
                href="mailto:info@inkoart.online"
                className="flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 py-1 transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="font-medium text-slate-500 dark:text-slate-400">Email:</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">info@inkoart.online</span>
              </a>

              <a 
                href="tel:070200042"
                className="flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 py-1 transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="font-medium text-slate-500 dark:text-slate-400">Support Hotline:</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">070 2000 042</span>
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
