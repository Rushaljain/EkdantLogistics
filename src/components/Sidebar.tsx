import React from 'react';
import { 
  FileText, 
  FileSpreadsheet, 
  Anchor, 
  ShieldCheck, 
  KeyRound, 
  CheckCircle2
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

        {/* ICEGATE Filings */}
        <button
          type="button"
          className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors text-left"
        >
          <FileSpreadsheet className="w-4 h-4 text-slate-400" />
          <span className="flex-1 truncate">ICEGATE EDI Export</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
            .sb / .be
          </span>
        </button>

        {/* Customs Ports */}
        <button
          type="button"
          className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors text-left"
        >
          <Anchor className="w-4 h-4 text-slate-400" />
          <span className="flex-1 truncate">Port Masters</span>
          <span className="text-[10px] font-mono text-slate-400">
            INNSA1
          </span>
        </button>

        {/* Compliance Audit */}
        <button
          type="button"
          className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors text-left"
        >
          <ShieldCheck className="w-4 h-4 text-slate-400" />
          <span className="flex-1 truncate">HSN & Math Audit</span>
        </button>

        <div className="pt-4 px-2 pb-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
          Configuration
        </div>

        {/* API Settings */}
        <button
          type="button"
          onClick={onOpenApiKeyModal}
          className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors text-left group"
        >
          <KeyRound className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
          <span className="flex-1 truncate">API Key Settings</span>
          <span className={`w-2 h-2 rounded-full ${hasApiKey ? 'bg-emerald-500' : 'bg-amber-400'}`} title={hasApiKey ? 'Active' : 'Key missing'} />
        </button>
      </div>

      {/* 3. Bottom Footer / CHA License info */}
      <div className="p-3.5 border-t border-slate-200/80 bg-slate-50/50 space-y-2 shrink-0">
        <div className="bg-white border border-slate-200/70 rounded-xl p-2.5 shadow-2xs text-[11px] space-y-1">
          <div className="flex items-center justify-between text-slate-700 font-semibold">
            <span>Customs House Agent</span>
            <span className="flex items-center text-emerald-600 text-[10px]">
              <CheckCircle2 className="w-3 h-3 mr-0.5" /> Ready
            </span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between">
            <span>CHA Lic: 11/1892</span>
            <span>ICES 1.5</span>
          </div>
        </div>

        <div className="flex items-center justify-between px-1 text-[10px] text-slate-400">
          <span>Nhava Sheva & Mumbai Air</span>
          <span className="font-mono">v2.5</span>
        </div>
      </div>
    </aside>
  );
};
