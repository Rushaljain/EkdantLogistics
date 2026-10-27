import React from 'react';
import { Ship, Plane } from 'lucide-react';
import type { CustomsPort } from '../types';

interface HeaderProps {
  currentPort: CustomsPort;
  onPortChange: (port: CustomsPort) => void;
  hasApiKey?: boolean;
  onOpenKeyModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentPort,
  onPortChange,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-subtle">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Brand Identification */}
        <div className="flex items-center">
          <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-none">
            Ekdant Logistics
          </h1>
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
        </div>
      </div>
    </header>
  );
};
