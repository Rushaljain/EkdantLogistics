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
      className={`h-screen sticky top-0 flex flex-col justify-between bg-sidebar-bg border-r border-white/10 transition-all duration-200 select-none z-30 ${
        isCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Brand Header */}
      <div>
        <div className="h-14 border-b border-white/10 flex items-center justify-between px-3.5">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-brand-primary flex items-center justify-center shrink-0 shadow-md">
              <Boxes className="w-4 h-4 text-white" />
            </div>
            {!isCollapsed && (
              <div className="truncate">
                <span className="text-sm font-bold tracking-tight text-content-on-dark block truncate leading-tight">
                  EKDANT
                </span>
                <span className="text-[10px] font-mono tracking-wider text-content-on-dark-muted block uppercase">
                  Logistics v2.0
                </span>
              </div>
            )}
          </div>

          <button
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? 'Expand navigation drawer' : 'Collapse navigation drawer'}
            className="p-1 rounded-md text-content-on-dark-muted hover:text-white hover:bg-sidebar-hover transition-colors"
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
                    ? 'bg-sidebar-active text-white font-semibold'
                    : 'text-content-on-dark-muted hover:text-white hover:bg-sidebar-hover'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-white' : 'text-content-on-dark-muted'
                  }`}
                />

                {!isCollapsed && (
                  <div className="flex-1 flex items-center justify-between text-left truncate">
                    <span className="truncate">{item.label}</span>
                    {item.badge && (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                          isActive
                            ? 'bg-brand-primary text-white'
                            : 'bg-sidebar-hover text-content-on-dark-muted'
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
      <div className="p-2 border-t border-white/10 space-y-1.5">
        {/* API Key Status & Modal Trigger */}
        <button
          onClick={onOpenApiKeyModal}
          title={hasCustomKey ? 'Custom Gemini Key Configured' : 'Using Environment / Default Gemini Key'}
          className={`w-full flex items-center rounded-lg transition-all text-xs ${
            isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 space-x-2.5'
          } ${
            hasCustomKey
              ? 'bg-state-success-bg text-state-success border border-state-success/30 hover:bg-state-success-bg/80'
              : 'bg-sidebar-hover text-content-on-dark-muted border border-white/10 hover:text-white'
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
                  hasCustomKey ? 'bg-state-success' : 'bg-state-warning'
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
          className={`w-full flex items-center rounded-lg text-content-on-dark-muted hover:text-state-error hover:bg-state-error-bg/10 border border-white/10 hover:border-state-error/30 transition-all text-xs ${
            isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 space-x-2.5'
          }`}
        >
          <RotateCcw className={`w-3.5 h-3.5 shrink-0 ${isPurging ? 'animate-spin text-state-error' : ''}`} />
          {!isCollapsed && (
            <span className="truncate font-mono text-[11px]">
              {isPurging ? 'Purging...' : 'Hard Reset'}
            </span>
          )}
        </button>

        {!isCollapsed && lastPurgedAt && (
          <div className="px-2 pt-1 pb-0.5 text-[9px] font-mono text-content-on-dark-muted truncate flex items-center space-x-1">
            <ShieldCheck className="w-3 h-3 text-content-on-dark-muted shrink-0" />
            <span className="truncate">Clean session: {lastPurgedAt}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
