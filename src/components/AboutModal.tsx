import { useEffect } from 'react';
import { X, Globe, Mail, Phone, ShieldCheck, Sparkles, Code2, Heart } from 'lucide-react';
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
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Banner */}
        <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            <img 
              src={hiruLogo} 
              alt="Hiru Logo" 
              className="w-14 h-14 rounded-2xl shadow-md border-2 border-white/20 object-cover bg-white" 
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black tracking-tight">Hiru Bookshop & Communication</h2>
              </div>
              <p className="text-xs text-blue-100 font-medium mt-0.5">Maniyangama, Avissawella • Tel: 070200042</p>
              <p className="text-[11px] text-white/70 font-mono mt-1">Version 1.0.0 (Production Build)</p>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Developer / Company Card */}
          <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-4 border border-gray-100 dark:border-gray-700/60">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Designed & Developed By
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                <Sparkles className="w-3 h-3" /> Official Partner
              </span>
            </div>

            <div className="flex items-center gap-3.5 mb-3">
              <img
                src={inkoartLogo}
                alt="Inkoart Logo"
                className="w-12 h-12 rounded-xl shadow-xs border border-gray-200 dark:border-gray-700 object-cover bg-[#ece9e6]"
              />
              <div>
                <h3 className="text-base font-extrabold text-gray-900 dark:text-white leading-tight">Inkoart</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Creative Tech & POS Solutions</p>
              </div>
            </div>

            {/* Contact Details List */}
            <div className="space-y-2 pt-2 border-t border-gray-200/60 dark:border-gray-700/60 text-xs">
              <a 
                href="https://inkoart.online" 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors group p-1 rounded-lg hover:bg-white dark:hover:bg-gray-700/50"
              >
                <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 group-hover:scale-110 transition-transform" />
                <span className="font-semibold text-gray-900 dark:text-gray-100">Website:</span>
                <span className="font-mono text-blue-600 dark:text-blue-400 underline">inkoart.online</span>
              </a>

              <a 
                href="mailto:info@inkoart.online"
                className="flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors group p-1 rounded-lg hover:bg-white dark:hover:bg-gray-700/50"
              >
                <Mail className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 group-hover:scale-110 transition-transform" />
                <span className="font-semibold text-gray-900 dark:text-gray-100">Email:</span>
                <span className="font-mono">info@inkoart.online</span>
              </a>

              <a 
                href="tel:0724207000"
                className="flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors group p-1 rounded-lg hover:bg-white dark:hover:bg-gray-700/50"
              >
                <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 group-hover:scale-110 transition-transform" />
                <span className="font-semibold text-gray-900 dark:text-gray-100">Hotline / WhatsApp:</span>
                <span className="font-mono font-bold text-gray-900 dark:text-white">072 420 7000</span>
              </a>
            </div>
          </div>

          {/* System Info Chips */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="text-gray-600 dark:text-gray-300 font-medium">SQLite WAL Database</span>
            </div>
            <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 flex items-center gap-2">
              <Heart className="w-4 h-4 text-rose-500 shrink-0" />
              <span className="text-gray-600 dark:text-gray-300 font-medium">100% Offline Capable</span>
            </div>
          </div>

          {/* Footer Note */}
          <div className="text-center pt-2">
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              © {new Date().getFullYear()} Hiru Bookshop & Communication. Software custom-tailored by Inkoart.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
