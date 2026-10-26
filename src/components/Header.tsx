import React from 'react';
import { 
  Ship, 
  Plane, 
  Sparkles, 
  Upload, 
  FolderOpen, 
  ShieldCheck
} from 'lucide-react';
import type { CustomsPortCode, UserRole, ShipmentData } from '../types/customs';
import { ALL_SAMPLE_SHIPMENTS } from '../data/mockInvoices';

interface HeaderProps {
  currentPort: CustomsPortCode;
  onPortChange: (port: CustomsPortCode) => void;
  userRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  hasGeminiKey: boolean;
  onOpenKeyModal: () => void;
  onLoadSample: (sample: ShipmentData) => void;
  onUploadPdfClick: () => void;
  jobNo?: string;
}

export const Header: React.FC<HeaderProps> = ({
  currentPort,
  onPortChange,
  userRole,
  onRoleChange,
  hasGeminiKey,
  onOpenKeyModal,
  onLoadSample,
  onUploadPdfClick,
  jobNo
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-40 px-4 py-2.5 shadow-lg">
      <div className="max-w-[1920px] mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Client Identification */}
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-tr from-sky-600 to-indigo-600 text-white p-2 rounded-lg shadow-md shadow-sky-950 flex items-center justify-center">
            <Ship className="w-5 h-5 text-sky-100" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold tracking-tight text-white text-base">
                EKDANT LOGISTICS
              </span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-sky-950 text-sky-400 border border-sky-800">
                CHA Lic: 11/1892
              </span>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> ICEGATE EDI ACCELERATOR
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Nhava Sheva (<span className="text-sky-300 font-mono">INNSA1</span>) • Mumbai Air Cargo (<span className="text-sky-300 font-mono">INBOM4</span>)
            </p>
          </div>
        </div>

        {/* Port Selector & Job Indicator */}
        <div className="flex items-center space-x-3">
          {/* Port toggle */}
          <div className="bg-slate-900 border border-slate-800 p-1 rounded-lg flex items-center space-x-1">
            <button
              onClick={() => onPortChange('INNSA1')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
                currentPort === 'INNSA1'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Jawaharlal Nehru Port Trust / Nhava Sheva Sea Port"
            >
              <Ship className="w-3.5 h-3.5" />
              <span>JNPT (INNSA1)</span>
            </button>
            <button
              onClick={() => onPortChange('INBOM4')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
                currentPort === 'INBOM4'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Mumbai Air Cargo Complex, Sahar"
            >
              <Plane className="w-3.5 h-3.5" />
              <span>Air Cargo (INBOM4)</span>
            </button>
          </div>

          {/* Active Job badge */}
          {jobNo && (
            <div className="hidden sm:flex items-center space-x-1.5 bg-slate-900 border border-slate-800 px-3 py-1 rounded text-xs font-mono text-slate-300">
              <span className="text-slate-500">JOB:</span>
              <span className="text-sky-400 font-bold">{jobNo}</span>
            </div>
          )}
        </div>

        {/* Actions & Settings */}
        <div className="flex items-center space-x-2">
          {/* Sample Invoices Loader Dropdown */}
          <div className="relative group">
            <button
              className="flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              title="Load pre-built test cases (Nhava Sheva, Air Cargo, Math Drift)"
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Sample Invoices</span>
            </button>
            <div className="absolute right-0 mt-1 w-64 bg-slate-900 border border-slate-800 rounded-lg shadow-2xl py-1 hidden group-hover:block z-50">
              <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                Customs Preloaded Test Cases
              </div>
              <button
                onClick={() => onLoadSample(ALL_SAMPLE_SHIPMENTS[0])}
                className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-sky-400 flex flex-col"
              >
                <span className="font-semibold text-sky-300">1. Apex Eng. (INNSA1)</span>
                <span className="text-[10px] text-slate-400">Valves & Flanges (6-digit HSN test)</span>
              </button>
              <button
                onClick={() => onLoadSample(ALL_SAMPLE_SHIPMENTS[1])}
                className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-indigo-400 flex flex-col border-t border-slate-800/60"
              >
                <span className="font-semibold text-indigo-300">2. Sahyadri Pharma (INBOM4)</span>
                <span className="text-[10px] text-slate-400">Air Cargo Formulation Export</span>
              </button>
              <button
                onClick={() => onLoadSample(ALL_SAMPLE_SHIPMENTS[2])}
                className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-rose-400 flex flex-col border-t border-slate-800/60"
              >
                <span className="font-semibold text-rose-300">3. Drift Scenario (Test Auto-Fix)</span>
                <span className="text-[10px] text-slate-400">Math drift + Gross&lt;Net + 4-digit HSN</span>
              </button>
            </div>
          </div>

          {/* Upload Custom PDF Button */}
          <button
            onClick={onUploadPdfClick}
            className="flex items-center space-x-1.5 bg-sky-600 hover:bg-sky-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Ingest PDF</span>
          </button>

          {/* Gemini API Key status / modal button */}
          <button
            onClick={onOpenKeyModal}
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              hasGeminiKey
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800 hover:bg-emerald-900/60'
                : 'bg-amber-950/60 text-amber-300 border-amber-800 hover:bg-amber-900/60'
            }`}
            title="Google Gemini Vision Flash Engine Settings"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{hasGeminiKey ? 'Gemini AI Ready' : 'Set Gemini Key'}</span>
          </button>

          {/* Role Switcher */}
          <div className="bg-slate-900 border border-slate-800 p-0.5 rounded-lg flex items-center">
            <button
              onClick={() => onRoleChange('OPERATOR')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                userRole === 'OPERATOR'
                  ? 'bg-slate-800 text-sky-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Punching Operator Workspace"
            >
              Operator
            </button>
            <button
              onClick={() => onRoleChange('SENIOR_CHA_ADMIN')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                userRole === 'SENIOR_CHA_ADMIN'
                  ? 'bg-slate-800 text-indigo-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Senior CHA Customs Approver"
            >
              Admin
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
