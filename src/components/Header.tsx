import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-subtle">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Brand Identification */}
        <div className="flex items-center space-x-2.5">
          <img 
            src="/logo.png" 
            alt="Ekdant Logistics Logo" 
            className="h-8 w-auto object-contain rounded" 
            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
          />
          <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-none">
            Ekdant Logistics
          </h1>
        </div>
      </div>
    </header>
  );
};
