import React from 'react';
import { FileText, FolderArchive } from 'lucide-react';

export type NavTab = 'converter' | 'files';

interface SidebarProps {
  activeTab?: NavTab;
  onSelectTab?: (tab: NavTab) => void;
  savedFilesCount?: number;
  onOpenKeyModal?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab = 'converter',
  onSelectTab,
  savedFilesCount = 0,
}) => {
  return (
    <aside className="w-64 h-full bg-white border-r border-slate-200/80 flex flex-col shrink-0 select-none">
      {/* Navigation Items */}
      <div className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto">
        {/* Document Converter */}
        <button
          type="button"
          onClick={() => onSelectTab?.('converter')}
          className={`w-full flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer ${
            activeTab === 'converter'
              ? 'bg-indigo-50/80 text-indigo-700 border border-indigo-100 shadow-2xs'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
          }`}
        >
          <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="flex-1 truncate">Document Converter</span>
        </button>

        {/* Files */}
        <button
          type="button"
          onClick={() => onSelectTab?.('files')}
          className={`w-full flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer ${
            activeTab === 'files'
              ? 'bg-indigo-50/80 text-indigo-700 border border-indigo-100 shadow-2xs'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
          }`}
        >
          <FolderArchive className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="flex-1 truncate">Files</span>
          {savedFilesCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 font-mono">
              {savedFilesCount}
            </span>
          )}
        </button>
      </div>

      {/* Bottom System & Port Indicator */}
      <div className="p-3.5 border-t border-slate-200/80 bg-slate-50/40 shrink-0 flex items-center justify-between text-[11px]">
        <div className="text-slate-500 font-semibold tracking-tight truncate">
          Ekdant EDI System
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-200/60 text-slate-700">
          INNSA1 / INBOM4
        </span>
      </div>
    </aside>
  );
};

