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
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to select folder.'
      });
    }
  };

  const handleToggleAutoBackup = async (checked: boolean) => {
    setAutoBackupOnClose(checked);
    await db.saveBackupSettings({ autoBackupOnClose: checked });
  };

  const handleExecuteCloudBackup = async () => {
    if (!cloudFolder) {
      toast.warning('Please select your Google Drive or Cloud backup folder first.');
      return;
    }

    setCloudLoading(true);
    setStatusMessage(null);
    try {
      const res = await db.executeCloudBackup();
      if (res.success && res.filePath) {
        setLastBackupTime(res.timestamp || new Date().toISOString());
        setStatusMessage({
          type: 'success',
          text: `Cloud backup created successfully!\nFile: ${res.filePath}`
        });
        loadSettings();
      } else if (res.error) {
        setStatusMessage({
          type: 'error',
          text: res.error
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Cloud backup failed.'
      });
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
          text: `Backup successfully saved to:\n${res.filePath}`
        });
      } else if (res.error) {
        setStatusMessage({
          type: 'error',
          text: res.error
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to create backup.'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    const confirmed = window.confirm(
      '⚠️ WARNING: Restoring a backup will overwrite the current database with the selected backup file.\n\nAny unsaved changes or new transactions since that backup will be replaced.\n\nDo you want to proceed?'
    );
    if (!confirmed) return;

    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await db.restore();
      if (res.success && res.filePath) {
        toast.success('Database restored successfully! The application will now reload.');
        onClose();
      } else if (res.error) {
        setStatusMessage({
          type: 'error',
          text: res.error
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to restore database.'
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-gray-100 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white dark:bg-gray-800/10 rounded-lg">
              <Cloud className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Google Drive & Database Safety</h3>
              <p className="text-xs text-blue-200">Automatic cloud backup & restore protection</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white dark:bg-gray-800/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">

          {/* Status Alert Banner */}
          {statusMessage && (
            <div className={`p-4 rounded-xl text-sm flex items-start gap-3 ${
              statusMessage.type === 'success' 
                ? 'bg-green-50 text-green-800 border border-green-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="whitespace-pre-wrap font-mono text-xs flex-1">
                {statusMessage.text}
              </div>
            </div>
          )}

          {/* Section 1: Google Drive / Cloud Auto-Backup */}
          <div className="p-5 bg-gradient-to-br from-blue-50/70 to-indigo-50/50 rounded-2xl border border-blue-100 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-600 text-white rounded-md shadow-xs">
                  <FolderSync className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm">Google Drive / Cloud Folder Sync</h4>
                  <p className="text-xs text-gray-500">Syncs to Google Drive, OneDrive, or USB Flash Drive</p>
                </div>
              </div>

              {cloudFolder ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-200 text-gray-600">
                  Not Configured
                </span>
              )}
            </div>

            {/* Folder Path Display & Selector */}
            <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 overflow-hidden flex-1">
                <FolderOpen className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate" title={cloudFolder || 'No folder selected'}>
                  {cloudFolder || 'No Google Drive folder selected yet...'}
                </span>
              </div>
              <button
                onClick={handleSelectFolder}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 dark:text-gray-100 rounded-lg text-xs font-bold transition-colors shrink-0 cursor-pointer"
              >
                {cloudFolder ? 'Change Folder' : 'Select Google Drive Folder'}
              </button>
            </div>

            {/* Auto-backup settings & triggers */}
            <div className="space-y-3 pt-1">
              <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoBackupOnClose}
                  onChange={(e) => handleToggleAutoBackup(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="font-medium">
                  <strong>Auto-backup when closing store / exiting app</strong> (Takes a 0.1s snapshot on exit)
                </span>
              </label>

              {lastBackupTime && (
                <div className="text-xs text-gray-500 bg-white dark:bg-gray-800/80 p-2.5 rounded-lg border border-gray-200 flex items-center justify-between">
                  <span>Last backup: <strong>{new Date(lastBackupTime).toLocaleString()}</strong></span>
                  <span className="font-mono text-[11px] text-gray-400">{lastBackupFile}</span>
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  onClick={handleExecuteCloudBackup}
                  disabled={cloudLoading || !cloudFolder}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-bold text-xs transition-colors shadow-sm flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${cloudLoading ? 'animate-spin' : ''}`} />
                  {cloudLoading ? 'Syncing to Drive...' : 'Backup to Google Drive Now'}
                </button>
              </div>
            </div>
          </div>

          {/* Section 2: Manual Backup & Restore */}
          <div className="space-y-3">
            <h4 className="font-bold text-gray-800 dark:text-gray-100 text-xs uppercase tracking-wider">Manual Data Controls</h4>

            {/* Manual Backup */}
            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 flex justify-between items-center gap-4">
              <div>
                <span className="font-bold text-xs text-gray-800 dark:text-gray-100 block">Export Snapshot to Custom Location</span>
                <span className="text-[11px] text-gray-500">Save a standalone <code className="bg-gray-200 px-1 py-0.5 rounded">.sqlite</code> copy anywhere.</span>
              </div>
              <button
                onClick={handleManualBackup}
                disabled={loading}
                className="px-3.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 hover:bg-gray-100 text-gray-700 dark:text-gray-300 rounded-lg font-bold text-xs transition-colors shadow-xs shrink-0 flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Save Copy
              </button>
            </div>

            {/* Restore */}
            <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200 flex justify-between items-center gap-4">
              <div>
                <span className="font-bold text-xs text-amber-900 block">Restore Database from Backup</span>
                <span className="text-[11px] text-amber-700">Load an existing backup file to recover previous data.</span>
              </div>
              <button
                onClick={handleRestore}
                disabled={loading}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs transition-colors shadow-xs shrink-0 flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Restore
              </button>
            </div>
          </div>

          {/* Helpful Tip */}
          <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 flex items-start gap-2.5 text-xs text-gray-600">
            <HardDrive className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <strong>How Google Drive Sync works:</strong> When you select your <em>Google Drive for Desktop</em> folder (e.g. inside <code>G:\My Drive</code>), Hiru POS creates daily backups. Google Drive silently uploads each file to the cloud as soon as your computer is online. Backups older than 30 days are automatically cleaned up to save space.
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
