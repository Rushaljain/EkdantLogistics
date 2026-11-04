import React from 'react';
import { Layers, FolderArchive, SlidersHorizontal } from 'lucide-react';

export type NavTab = 'converter' | 'files';

interface SidebarProps {
  activeTab?: NavTab;
  onSelectTab?: (tab: NavTab) => void;
  savedFilesCount?: number;
  onOpenKeyModal?: () => void;
  onOpenFormatsModal?: () => void;
  showHeader?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab = 'converter',
  onSelectTab,
  savedFilesCount = 0,
  onOpenFormatsModal,
}) => {
  return (
    <aside className="w-60 h-full bg-white border-r border-zinc-200 flex flex-col shrink-0 select-none">
      {/* Navigation Items */}
      <div className="flex-1 py-3 px-2.5 space-y-1 overflow-y-auto">
        {/* Document Workspace */}
        <button
          type="button"
          onClick={() => onSelectTab?.('converter')}
          className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs transition-all text-left cursor-pointer ${
            activeTab === 'converter'
              ? 'bg-zinc-100 text-zinc-900 font-medium'
              : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 font-normal'
          }`}
        >
          <Layers className={`w-4 h-4 shrink-0 ${activeTab === 'converter' ? 'text-zinc-900' : 'text-zinc-400'}`} />
          <span className="flex-1 truncate">Document Workspace</span>
        </button>

        {/* Files Repository */}
        <button
          type="button"
          onClick={() => onSelectTab?.('files')}
          className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs transition-all text-left cursor-pointer ${
            activeTab === 'files'
              ? 'bg-zinc-100 text-zinc-900 font-medium'
              : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 font-normal'
          }`}
        >
          <FolderArchive className={`w-4 h-4 shrink-0 ${activeTab === 'files' ? 'text-zinc-900' : 'text-zinc-400'}`} />
          <span className="flex-1 truncate">Files Repository</span>
          {savedFilesCount > 0 && (
            <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-zinc-200/80 text-zinc-700 font-mono">
              {savedFilesCount}
            </span>
          )}
        </button>

        {/* Manage Master Formats */}
        {onOpenFormatsModal && (
          <button
            type="button"
            onClick={onOpenFormatsModal}
            className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-all text-left cursor-pointer font-normal"
          >
            <SlidersHorizontal className="w-4 h-4 shrink-0 text-zinc-400" />
            <span className="flex-1 truncate">Manage Master Formats</span>
          </button>
        )}
      </div>

      {/* Bottom System & Container Status Indicator */}
      <div className="p-3 border-t border-zinc-200 bg-zinc-50/50 shrink-0 flex items-center justify-between text-xs">
        <div className="text-zinc-500 font-medium tracking-tight truncate">
          Ekdant Dispatch
        </div>
      </div>
    </aside>
  );
};
