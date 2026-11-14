import { useState, useEffect } from 'react';
import { db, type UpdaterStatus } from '../db';
import { DownloadCloud, RefreshCw, X, CheckCircle } from 'lucide-react';

export default function UpdateNotifier() {
  const [updateStatus, setUpdateStatus] = useState<UpdaterStatus | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    const unsubscribe = db.updater.onStatus((status) => {
      setUpdateStatus(status);
      if (status.status === 'available') {
        setIsDismissed(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  if (!updateStatus || isDismissed) return null;

  // Only show banner when an actionable update exists: available, downloading, or ready.
  // Silent on background check, up-to-date, or 404/network errors so cashiers aren't disrupted.
  if (updateStatus.status !== 'available' && updateStatus.status !== 'downloading' && updateStatus.status !== 'ready') {
    return null;
  }

  const handleInstall = async () => {
    setIsInstalling(true);
    await db.updater.install();
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-white rounded-2xl shadow-2xl border border-blue-100 p-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
            {updateStatus.status === 'available' && <DownloadCloud className="w-5 h-5 text-blue-600 animate-bounce" />}
            {updateStatus.status === 'downloading' && <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />}
            {updateStatus.status === 'ready' && <CheckCircle className="w-5 h-5 text-emerald-600" />}
          </div>
          <div>
            <h4 className="text-sm font-bold text-gray-900">
              {updateStatus.status === 'available' && 'App Update Available'}
              {updateStatus.status === 'downloading' && 'Downloading Update...'}
              {updateStatus.status === 'ready' && 'Update Ready'}
            </h4>
            <p className="text-xs text-gray-500 mt-0.5">
              {updateStatus.status === 'available' && 'A newer version of Hiru POS is ready to download.'}
              {updateStatus.status === 'downloading' && (
                updateStatus.progress?.percent 
                  ? `${Math.round(updateStatus.progress.percent)}% downloaded` 
                  : 'Fetching the latest patch...'
              )}
              {updateStatus.status === 'ready' && 'Installing update and restarting...'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsDismissed(true)}
          className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 cursor-pointer"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {updateStatus.status === 'downloading' && updateStatus.progress && (
        <div className="mt-3 w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${Math.round(updateStatus.progress.percent)}%` }}
          />
        </div>
      )}

      {updateStatus.status === 'available' && (
        <div className="mt-3 flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
          <button
            onClick={() => setIsDismissed(true)}
            className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            Later
          </button>
          <button
            onClick={handleInstall}
            disabled={isInstalling}
            className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isInstalling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <DownloadCloud className="w-3.5 h-3.5" />}
            {isInstalling ? 'Starting...' : 'Update Now'}
          </button>
        </div>
      )}
    </div>
  );
}
