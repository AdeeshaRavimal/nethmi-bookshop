import { useState, useEffect } from 'react';
import { db } from '../db';
import { useToast } from './Toast';
import { 
  Download, 
  Upload, 
  AlertTriangle, 
  X, 
  CheckCircle2, 
  HardDrive,
  Cloud,
  FolderSync,
  RefreshCw,
  FolderOpen
} from 'lucide-react';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BackupModal({ isOpen, onClose }: BackupModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Cloud Sync Settings
  const [cloudFolder, setCloudFolder] = useState('');
  const [autoBackupOnClose, setAutoBackupOnClose] = useState(true);
  const [lastBackupTime, setLastBackupTime] = useState('');
  const [lastBackupFile, setLastBackupFile] = useState('');

  const loadSettings = async () => {
    try {
      const settings = await db.getBackupSettings();
      setCloudFolder(settings.folderPath || '');
      setAutoBackupOnClose(settings.autoBackupOnClose !== false);
      setLastBackupTime(settings.lastBackupTime || '');
      setLastBackupFile(settings.lastBackupFile || '');
    } catch (err) {
      console.error('Failed to load backup settings', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      setStatusMessage(null);
    }
  }, [isOpen]);

  const handleSelectFolder = async () => {
    try {
      const res = await db.selectBackupFolder();
      if (res.success && res.folderPath) {
        setCloudFolder(res.folderPath);
        setStatusMessage({
          type: 'success',
          text: `Cloud sync folder updated to:\n${res.folderPath}`
        });
        toast.success('Backup folder updated!');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to select folder');
    }
  };

  const handleToggleAutoBackup = async (val: boolean) => {
    setAutoBackupOnClose(val);
    try {
      await db.saveBackupSettings({ autoBackupOnClose: val });
      toast.success(val ? 'Automatic exit backup enabled' : 'Automatic exit backup disabled');
    } catch (err: any) {
      toast.error('Failed to save settings');
    }
  };

  const handleExecuteCloudBackup = async () => {
    setCloudLoading(true);
    setStatusMessage(null);
    try {
      const res = await db.executeCloudBackup();
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: `Backup saved successfully!\nPath: ${res.filePath || 'Saved'}`
        });
        toast.success('Backup created in cloud folder!');
        loadSettings();
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Failed to perform cloud backup.'
        });
        toast.error(res.error || 'Backup failed');
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error occurred.' });
    } finally {
      setCloudLoading(false);
    }
  };

  const handleManualBackup = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await db.backup();
      if (res.success && res.filePath) {
        setStatusMessage({
          type: 'success',
          text: `Standalone database snapshot saved to:\n${res.filePath}`
        });
        toast.success('Manual backup saved successfully!');
      } else if (!res.cancelled) {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Failed to backup database.'
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'An unexpected error occurred during backup.'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    const confirmed = window.confirm(
      'WARNING: Restoring will overwrite all current system data with the selected backup file.\n\nA safety recovery snapshot of your current database will be saved before restoring.\n\nDo you want to proceed?'
    );
    if (!confirmed) return;

    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await db.restore();
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: 'Database restored successfully! Application will now reload in 2 seconds...'
        });
        toast.success('Restore complete! Reloading...');
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else if (!res.cancelled) {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Failed to restore database.'
        });
        toast.error(res.error || 'Restore failed');
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'An unexpected error occurred during restore.'
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex justify-between items-center shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm leading-tight text-white">Database Safety & Cloud Backup</h3>
              <p className="text-[11px] text-slate-400">Automated local and cloud snapshots for SQLite</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">

          {/* Status Alert Banner */}
          {statusMessage && (
            <div className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
              statusMessage.type === 'success' 
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' 
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
            }`}>
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="whitespace-pre-wrap font-mono text-[11px] flex-1 leading-relaxed">
                {statusMessage.text}
              </div>
            </div>
          )}

          {/* Section 1: Google Drive / Cloud Auto-Backup */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-600 text-white rounded-md">
                  <FolderSync className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 text-xs">Cloud Folder Sync</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Syncs to Google Drive, OneDrive, or Flash Drive</p>
                </div>
              </div>

              {cloudFolder ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  Not Configured
                </span>
              )}
            </div>

            {/* Folder Path Display & Selector */}
            <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 overflow-hidden flex-1">
                <FolderOpen className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate" title={cloudFolder || 'No folder selected'}>
                  {cloudFolder || 'No folder selected yet...'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleSelectFolder}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-md text-xs font-semibold transition-colors shrink-0 cursor-pointer"
              >
                {cloudFolder ? 'Change Folder' : 'Select Cloud Folder'}
              </button>
            </div>

            {/* Auto-backup settings & triggers */}
            <div className="space-y-2.5 pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoBackupOnClose}
                  onChange={(e) => handleToggleAutoBackup(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                />
                <span className="font-medium">
                  Auto-backup snapshot when exiting application
                </span>
              </label>

              {lastBackupTime && (
                <div className="text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-700/80 flex items-center justify-between">
                  <span>Last backup: <strong className="text-slate-700 dark:text-slate-200">{new Date(lastBackupTime).toLocaleString()}</strong></span>
                  <span className="font-mono text-[10px] text-slate-400 truncate max-w-[180px]">{lastBackupFile}</span>
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleExecuteCloudBackup}
                  disabled={cloudLoading || !cloudFolder}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white rounded-lg font-semibold text-xs transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${cloudLoading ? 'animate-spin' : ''}`} />
                  {cloudLoading ? 'Backing up...' : 'Backup to Cloud Now'}
                </button>
              </div>
            </div>
          </div>

          {/* Section 2: Manual Backup & Restore */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wider">Manual Controls</h4>

            {/* Manual Backup */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/80 flex justify-between items-center gap-4">
              <div>
                <span className="font-bold text-xs text-slate-800 dark:text-slate-200 block">Export Standalone Snapshot</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Save a standalone <code className="bg-slate-200 dark:bg-slate-700 px-1 py-0.2 rounded text-[10px]">.sqlite</code> file anywhere.</span>
              </div>
              <button
                type="button"
                onClick={handleManualBackup}
                disabled={loading}
                className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-semibold text-xs transition-colors shadow-2xs shrink-0 flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
            </div>

            {/* Restore */}
            <div className="p-3 bg-rose-50/50 dark:bg-rose-950/20 rounded-xl border border-rose-200 dark:border-rose-900/40 flex justify-between items-center gap-4">
              <div>
                <span className="font-bold text-xs text-rose-900 dark:text-rose-300 block">Restore Database from Backup</span>
                <span className="text-[11px] text-rose-700 dark:text-rose-400">Load a previous backup file to restore system data.</span>
              </div>
              <button
                type="button"
                onClick={handleRestore}
                disabled={loading}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-lg font-semibold text-xs transition-colors shadow-2xs shrink-0 flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Restore
              </button>
            </div>
          </div>

          {/* Info note */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/80 flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
            <HardDrive className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <strong>Automatic retention:</strong> Backups older than 30 days are automatically pruned to conserve disk space. Backups run silently in under 0.1s.
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
