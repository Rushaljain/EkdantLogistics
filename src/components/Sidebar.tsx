import React from 'react';
import { 
  FileText, 
  User,
  Settings
} from 'lucide-react';

interface SidebarProps {
  onOpenApiKeyModal?: () => void;
  hasApiKey?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onOpenApiKeyModal,
  hasApiKey = true
}) => {
  return (
    <aside className="w-64 h-screen bg-white border-r border-slate-200/80 flex flex-col shrink-0 select-none">
      {/* 1. Top Brand Header: Logo & Wordmark (Shifted to Far Top-Left) */}
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
      <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        <div className="px-2 pb-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
          Workspace
        </div>

        {/* Active: Document Converter */}
        <button
          type="button"
          className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-50/80 text-indigo-700 border border-indigo-100 shadow-2xs transition-colors text-left"
        >
          <FileText className="w-4 h-4 text-indigo-600" />
          <span className="flex-1 truncate">Document Converter</span>
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
        </button>
      </div>

      {/* 3. Bottom User Profile: Replaced with User XYZ */}
      <div className="p-3 border-t border-slate-200/80 bg-slate-50/60 shrink-0">
        <div 
          onClick={onOpenApiKeyModal}
          className="flex items-center space-x-3 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer group"
          title="User XYZ Profile & Settings"
        >
          <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-medium text-xs shrink-0 shadow-2xs">
            <User className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">
              User XYZ
            </div>
            <div className="text-[10px] text-slate-400 flex items-center space-x-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${hasApiKey ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              <span>Active</span>
            </div>
          </div>
          {onOpenApiKeyModal && (
            <button 
              type="button" 
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white transition-colors"
              title="Settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
