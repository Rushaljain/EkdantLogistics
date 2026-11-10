import React from 'react';
import {
  Layers,
  Files,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Boxes,
  Key,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';

export type PageId = 'workspace' | 'files' | 'formats';

interface NavigationSidebarProps {
  activePage: PageId;
  onSelectPage: (page: PageId) => void;
  filesCount: number;
  formatsCount: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenApiKeyModal: () => void;
  hasCustomKey: boolean;
  lastPurgedAt: string | null;
  onHardReset: () => void;
  isPurging: boolean;
}

export function NavigationSidebar({
  activePage,
  onSelectPage,
  filesCount,
  formatsCount,
  isCollapsed,
  onToggleCollapse,
  onOpenApiKeyModal,
  hasCustomKey,
  lastPurgedAt,
  onHardReset,
  isPurging
}: NavigationSidebarProps): React.JSX.Element {
  const navItems = [
    {
      id: 'workspace' as PageId,
      label: 'Workspace',
      icon: Layers,
      description: 'Operational 3-panel processor',
      badge: null
    },
    {
      id: 'files' as PageId,
      label: 'Files',
      icon: Files,
      description: 'Uploaded document repository',
      badge: filesCount > 0 ? String(filesCount) : null
    },
    {
      id: 'formats' as PageId,
      label: 'Format Adder',
      icon: SlidersHorizontal,
      description: 'Carrier manifest schemas',
      badge: formatsCount > 0 ? String(formatsCount) : null
    }
  ];

  return (
    <aside
      className={`h-screen sticky top-0 flex flex-col justify-between bg-slate-950 border-r border-slate-800/80 transition-all duration-200 select-none z-30 ${
        isCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Brand Header */}
      <div>
        <div className="h-14 border-b border-slate-800/80 flex items-center justify-between px-3.5">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-700 flex items-center justify-center shrink-0 shadow-md shadow-cyan-900/40">
              <Boxes className="w-4 h-4 text-white" />
            </div>
            {!isCollapsed && (
              <div className="truncate">
                <span className="text-sm font-bold tracking-tight text-white block truncate leading-tight">
                  EKDANT
                </span>
                <span className="text-[10px] font-mono tracking-wider text-cyan-400 block uppercase">
                  Logistics v2.0
                </span>
              </div>
            )}
          </div>

          <button
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? 'Expand navigation drawer' : 'Collapse navigation drawer'}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
            title={isCollapsed ? 'Expand drawer' : 'Collapse drawer'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Primary Navigation List */}
        <nav className="p-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onSelectPage(item.id)}
                title={item.label}
                className={`w-full flex items-center rounded-lg transition-all text-xs font-medium ${
                  isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2.5 space-x-3'
                } ${
                  isActive
                    ? 'bg-blue-600/20 text-cyan-300 border border-cyan-500/30 shadow-sm shadow-cyan-950/50'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900/70 border border-transparent'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-cyan-400' : 'text-slate-400'
                  }`}
                />

                {!isCollapsed && (
                  <div className="flex-1 flex items-center justify-between text-left truncate">
                    <span className="truncate">{item.label}</span>
                    {item.badge && (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                          isActive
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Drawer Footer Controls */}
      <div className="p-2 border-t border-slate-800/80 space-y-1.5">
        {/* API Key Status & Modal Trigger */}
        <button
          onClick={onOpenApiKeyModal}
          title={hasCustomKey ? 'Custom Gemini Key Configured' : 'Using Environment / Default Gemini Key'}
          className={`w-full flex items-center rounded-lg transition-all text-xs ${
            isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 space-x-2.5'
          } ${
            hasCustomKey
              ? 'bg-emerald-950/30 text-emerald-300 border border-emerald-800/40 hover:bg-emerald-950/50'
              : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-slate-200'
          }`}
        >
          <Key className="w-3.5 h-3.5 shrink-0" />
          {!isCollapsed && (
            <div className="flex-1 flex items-center justify-between truncate text-left">
              <span className="truncate font-mono text-[11px]">
                {hasCustomKey ? 'Custom Key' : 'API Key'}
              </span>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  hasCustomKey ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
            </div>
          )}
        </button>

        {/* Quick Hard Reset */}
        <button
          onClick={onHardReset}
          disabled={isPurging}
          title="Hard Reset Workspace Storage & Session"
          className={`w-full flex items-center rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-950/20 border border-slate-800/80 hover:border-rose-900/30 transition-all text-xs ${
            isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 space-x-2.5'
          }`}
        >
          <RotateCcw className={`w-3.5 h-3.5 shrink-0 ${isPurging ? 'animate-spin text-rose-400' : ''}`} />
          {!isCollapsed && (
            <span className="truncate font-mono text-[11px]">
              {isPurging ? 'Purging...' : 'Hard Reset'}
            </span>
          )}
        </button>

        {!isCollapsed && lastPurgedAt && (
          <div className="px-2 pt-1 pb-0.5 text-[9px] font-mono text-slate-500 truncate flex items-center space-x-1">
            <ShieldCheck className="w-3 h-3 text-slate-500 shrink-0" />
            <span className="truncate">Clean session: {lastPurgedAt}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
