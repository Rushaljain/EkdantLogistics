import React from 'react';
import { FileText } from 'lucide-react';

interface SidebarProps {}

export const Sidebar: React.FC<SidebarProps> = () => {
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
      <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {/* Active: Document Converter (Clean, no redundant dot) */}
        <button
          type="button"
          className="w-full flex items-center space-x-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-indigo-50/80 text-indigo-700 border border-indigo-100 shadow-2xs transition-colors text-left"
        >
          <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="flex-1 truncate">Document Converter</span>
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
