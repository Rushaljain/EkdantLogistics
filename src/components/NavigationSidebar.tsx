import React from 'react';
import {
  Layers,
  Files,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Boxes,
  ShieldCheck
} from 'lucide-react';

export type PageId = 'workspace' | 'files' | 'formats';

interface NavigationSidebarProps {
  activePage: PageId;
  onSelectPage: (page: PageId) => void;
  filesCount: number;
  formatsCount: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenApiKeyModal?: () => void;
  hasCustomKey?: boolean;
  lastPurgedAt: string | null;
  onHardReset?: () => void;
  isPurging?: boolean;
}

export function NavigationSidebar({
  activePage,
  onSelectPage,
  filesCount,
  formatsCount,
  isCollapsed,
  onToggleCollapse,
  lastPurgedAt
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
                  LOGISTICS
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
      <div className="p-2 border-t border-white/10">
        {!isCollapsed && lastPurgedAt && (
          <div className="px-2 py-1 text-[9px] font-mono text-content-on-dark-muted truncate flex items-center space-x-1">
            <ShieldCheck className="w-3 h-3 text-content-on-dark-muted shrink-0" />
            <span className="truncate">Clean session: {lastPurgedAt}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
