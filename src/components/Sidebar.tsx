import React from 'react';
import { FileText, FolderArchive } from 'lucide-react';

export type NavTab = 'converter' | 'files';

interface SidebarProps {
  activeTab?: NavTab;
  onSelectTab?: (tab: NavTab) => void;
  savedFilesCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab = 'converter',
  onSelectTab,
  savedFilesCount = 0
}) => {
  return (
    <aside className="w-64 h-screen bg-white border-r border-slate-200/80 flex flex-col shrink-0 select-none">
      {/* 1. Top Brand Header: Logo & Wordmark */}
      <div className="h-16 px-5 border-b border-slate-200/80 flex items-center space-x-3 shrink-0">
        <img 
          src="/logo.png" 
          alt="Ekdant Logistics Logo" 
          className="h-9 w-auto object-contain rounded" 
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-slate-900 tracking-tight leading-tight truncate">
            Ekdant Logistics
          </h1>
          <p className="text-[10px] text-slate-400 font-medium truncate">
            Customs Document Converter
          </p>
        </div>
      </div>

      {/* 2. Navigation Items */}
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

      {/* 3. Bottom User Profile: User XYZ (Clean text, no icon) */}
      <div className="p-4 border-t border-slate-200/80 bg-slate-50/40 shrink-0">
        <div className="px-2 text-xs font-semibold text-slate-800 tracking-tight">
          User XYZ
        </div>
      </div>
    </aside>
  );
};
