import React from 'react';
import { Ship, Plane, KeyRound } from 'lucide-react';
import type { CustomsPort } from '../types';

interface HeaderProps {
  currentPort: CustomsPort;
  onPortChange: (port: CustomsPort) => void;
  hasApiKey: boolean;
  onOpenKeyModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentPort,
  onPortChange,
  hasApiKey,
  onOpenKeyModal
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-subtle">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Brand Identification */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-700 via-indigo-600 to-indigo-500 text-white font-black text-sm flex items-center justify-center shadow-sm shadow-indigo-100 tracking-wider">
            EL
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold text-slate-900 tracking-tight leading-none">
                Ekdant Logistics
              </h1>
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200/60 font-mono">
                CHA Lic: 11/1892
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 font-normal">
              Customs Document Converter
            </p>
          </div>
        </div>

        {/* Right: Operational Controls */}
        <div className="flex items-center space-x-3">
          {/* Port Selector Pill */}
          <div className="bg-slate-100/80 p-0.5 rounded-lg border border-slate-200/60 flex items-center text-xs font-medium">
            <button
              onClick={() => onPortChange('INNSA1')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md transition-all ${
                currentPort === 'INNSA1'
                  ? 'bg-white text-slate-900 font-semibold shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Ship className="w-3.5 h-3.5 text-indigo-600" />
              <span>Nhava Sheva (INNSA1)</span>
            </button>
            <button
              onClick={() => onPortChange('INBOM4')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md transition-all ${
                currentPort === 'INBOM4'
                  ? 'bg-white text-slate-900 font-semibold shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Plane className="w-3.5 h-3.5 text-indigo-600" />
              <span>Mumbai Air (INBOM4)</span>
            </button>
          </div>

          {/* API Key Settings Button */}
          <button
            onClick={onOpenKeyModal}
            className="flex items-center space-x-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200/80 px-2.5 py-1.5 rounded-lg transition-colors shadow-subtle group"
            title="Configure Google Gemini API Key"
          >
            <KeyRound className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-colors" />
            <span className="font-medium hidden sm:inline">API Key</span>
            <span
              className={`w-2 h-2 rounded-full ${
                hasApiKey ? 'bg-emerald-500 ring-4 ring-emerald-50' : 'bg-amber-400'
              }`}
            />
          </button>
        </div>
      </div>
    </header>
  );
};
