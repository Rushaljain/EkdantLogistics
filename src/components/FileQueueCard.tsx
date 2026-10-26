import React from 'react';
import { FileText, Loader2, CheckCircle2, AlertCircle, RefreshCw, X } from 'lucide-react';
import type { QueueFile } from '../types';

interface FileQueueCardProps {
  queue: QueueFile[];
  onRetry: (fileId: string) => void;
  onRemove: (fileId: string) => void;
  onClearCompleted: () => void;
}

export const FileQueueCard: React.FC<FileQueueCardProps> = ({
  queue,
  onRetry,
  onRemove,
  onClearCompleted
}) => {
  if (queue.length === 0) return null;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const hasCompleted = queue.some(q => q.status === 'converted');

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-subtle p-4 space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
            Selected Files
          </span>
          <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {queue.length}
          </span>
        </div>

        {hasCompleted && (
          <button
            onClick={onClearCompleted}
            className="text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
          >
            Clear Finished
          </button>
        )}
      </div>

      <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto pr-1">
        {queue.map(item => (
          <div key={item.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between text-xs gap-3">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-slate-500">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-slate-800 truncate max-w-[180px] sm:max-w-[220px]" title={item.name}>
                  {item.name}
                </p>
                <p className="text-[11px] text-slate-400 font-mono">
                  {formatFileSize(item.size)}
                </p>
              </div>
            </div>

            {/* Status indicator */}
            <div className="flex items-center space-x-2 shrink-0">
              {item.status === 'processing' && (
                <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700">
                  <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
                  <span>Processing...</span>
                </span>
              )}

              {item.status === 'converted' && (
                <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>Converted</span>
                </span>
              )}

              {item.status === 'failed' && (
                <div className="flex items-center space-x-1">
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/50">
                    <AlertCircle className="w-3 h-3 text-rose-500" />
                    <span>Failed</span>
                  </span>
                  <button
                    onClick={() => onRetry(item.id)}
                    className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                    title="Retry"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
              )}

              <button
                onClick={() => onRemove(item.id)}
                className="p-1 text-slate-300 hover:text-slate-500 rounded transition-colors"
                title="Remove file"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
