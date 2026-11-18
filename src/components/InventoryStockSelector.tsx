// Ekdant Logistics - Inventory Stock Selector (Sprint 6)
// Replaces raw file dropzone in Workspace with interactive customer/invoice search from active warehouse inventory

import React, { useState, useMemo } from 'react';
import {
  Boxes,
  Search,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Plus
} from 'lucide-react';
import type { CFSLedgerEntry, ExtractedShipmentJSON } from '../types/index.ts';
import { getCFSLedgerEntries, buildShipmentFromInventoryInvoices } from '../utils/inventoryStore.ts';

interface InventoryStockSelectorProps {
  onSelectShipment: (shipment: ExtractedShipmentJSON) => void;
  onOpenInventory: () => void;
  onCancel?: () => void;
  isModal?: boolean;
}

export function InventoryStockSelector({
  onSelectShipment,
  onOpenInventory,
  onCancel,
  isModal = false
}: InventoryStockSelectorProps): React.JSX.Element {
  const [entries] = useState<CFSLedgerEntry[]>(() => getCFSLedgerEntries());

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'READY' | 'PENDING'>('ALL');

  // Selected Invoices and Pallet IDs: Map<entryId, Set<palletId>>
  const [selectedInvoices, setSelectedInvoices] = useState<Map<string, Set<string>>>(new Map());
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<string>>(new Set());

  // Distinct Customers who have available inventory balance
  const customerList = useMemo(() => {
    const map = new Map<string, { pallets: number; batteries: number; count: number }>();
    entries.forEach((e) => {
      const cust = e.customer?.trim();
      if (!cust) return;
      if (e.balancePallets > 0 || e.balanceBatteries > 0) {
        const cur = map.get(cust) || { pallets: 0, batteries: 0, count: 0 };
        cur.pallets += e.balancePallets || 0;
        cur.batteries += e.balanceBatteries || 0;
        cur.count += 1;
        map.set(cust, cur);
      }
    });
    return Array.from(map.entries())
      .map(([name, stats]) => ({
        name,
        ...stats
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  // Filter available invoices
  const availableInvoices = useMemo(() => {
    return entries.filter((e) => {
      // Must have active balance or pending gate-in
      const hasBalance = e.balancePallets > 0 || e.balanceBatteries > 0 || (e.actualReceivedPallets || 0) < e.invoicedPallets;
      if (!hasBalance) return false;

      // Customer filter
      if (selectedCustomer !== 'ALL' && e.customer?.trim().toUpperCase() !== selectedCustomer.toUpperCase()) {
        return false;
      }

      // Status filter
      if (statusFilter === 'READY' && e.balancePallets <= 0) return false;
      if (statusFilter === 'PENDING' && (e.actualReceivedPallets || 0) >= e.invoicedPallets) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          (e.customer || '').toLowerCase().includes(q) ||
          (e.customInvoiceNo || '').toLowerCase().includes(q) ||
          (e.pod || '').toLowerCase().includes(q) ||
          (e.containerNo || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [entries, selectedCustomer, statusFilter, searchQuery]);

  // Toggle entire invoice selection
  const handleToggleInvoice = (entry: CFSLedgerEntry) => {
    setSelectedInvoices((prev) => {
      const next = new Map(prev);
      if (next.has(entry.id)) {
        next.delete(entry.id);
      } else {
        // Default to all available IN_WAREHOUSE pallets for this invoice
        const availableUnits = (entry.pallets || []).filter((p) => p.status === 'IN_WAREHOUSE');
        const palletSet = new Set(
          availableUnits.length > 0
            ? availableUnits.map((p) => p.id)
            : (entry.pallets || []).map((p) => p.id)
        );
        next.set(entry.id, palletSet);
      }
      return next;
    });
  };

  // Toggle specific pallet within invoice
  const handleTogglePallet = (entryId: string, palletId: string) => {
    setSelectedInvoices((prev) => {
      const next = new Map(prev);
      const currentSet = next.get(entryId) ? new Set(next.get(entryId)) : new Set<string>();

      if (currentSet.has(palletId)) {
        currentSet.delete(palletId);
        if (currentSet.size === 0) {
          next.delete(entryId);
        } else {
          next.set(entryId, currentSet);
        }
      } else {
        currentSet.add(palletId);
        next.set(entryId, currentSet);
      }
      return next;
    });
  };

  // Compute selection totals
  const selectionSummary = useMemo(() => {
    let invoiceCount = selectedInvoices.size;
    let palletCount = 0;
    let batteryCount = 0;
    let grossKg = 0;

    selectedInvoices.forEach((palletIdSet, entryId) => {
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) return;

      const units = (entry.pallets || []).filter((p) => palletIdSet.has(p.id));
      if (units.length > 0) {
        palletCount += units.length;
        units.forEach((u) => {
          batteryCount += u.receivedBatteries || u.invoicedBatteries || 0;
          grossKg += u.grossWeightKg || 0;
        });
      } else {
        palletCount += entry.balancePallets;
        batteryCount += entry.balanceBatteries;
        if (entry.invoicedPallets > 0) {
          grossKg += Math.round((entry.invoicedGrossWeightKg / entry.invoicedPallets) * entry.balancePallets);
        }
      }
    });

    const required20GP = Math.ceil(palletCount / 22) || 1;
    return {
      invoiceCount,
      palletCount,
      batteryCount,
      grossKg: Math.round(grossKg),
      required20GP
    };
  }, [selectedInvoices, entries]);

  // Execute 1-Click Load into Workspace
  const handleLoadSelected = () => {
    if (selectedInvoices.size === 0) return;

    const selections: { entry: CFSLedgerEntry; palletIds?: string[] }[] = [];
    selectedInvoices.forEach((palletIdSet, entryId) => {
      const entry = entries.find((e) => e.id === entryId);
      if (entry) {
        selections.push({
          entry,
          palletIds: Array.from(palletIdSet)
        });
      }
    });

    const unifiedShipment = buildShipmentFromInventoryInvoices(selections);
    onSelectShipment(unifiedShipment);
  };

  return (
    <div className={`flex flex-col h-full bg-app text-content-primary overflow-hidden ${isModal ? 'p-0' : 'p-4 sm:p-6'}`}>
      {/* HEADER BAR */}
      <div className="bg-surface border border-divider rounded-xl p-4 sm:p-5 shadow-xs shrink-0 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center text-brand-primary">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-content-primary tracking-tight">
                Select Invoices from Warehouse Inventory
              </h2>
              <p className="text-xs text-content-secondary mt-0.5">
                Choose active floor stock to plan containers, DG declarations, and Bill of Lading
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onOpenInventory}
              className="px-3 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface border border-divider text-xs font-semibold text-brand-primary flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <span>+ Upload Invoice to Inventory (Stock-In)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            {onCancel && (
              <button
                onClick={onCancel}
                className="px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary border border-divider text-xs font-medium text-content-secondary cursor-pointer"
              >
                Close
              </button>
            )}
          </div>
        </div>

        {/* SEARCH & CUSTOMER FILTER ROW */}
        <div className="pt-2 border-t border-divider/60 flex flex-wrap items-center gap-3 text-xs">
          {/* Customer Dropdown */}
          <div className="flex items-center space-x-1.5">
            <label htmlFor="selector-customer" className="text-content-secondary font-medium shrink-0">
              Customer:
            </label>
            <select
              id="selector-customer"
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="px-3 py-1.5 bg-surface-secondary border border-divider rounded-lg font-semibold text-content-primary focus:outline-none focus:border-brand-primary cursor-pointer text-xs max-w-xs truncate"
            >
              <option value="ALL">All Customers with Stock ({customerList.length})</option>
              {customerList.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.pallets}p • {c.count} inv)
                </option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-content-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer, invoice no, port, container..."
              className="w-full pl-8 pr-3 py-1.5 bg-surface-secondary/50 border border-divider rounded-lg text-xs text-content-primary placeholder-content-muted focus:outline-none focus:border-brand-primary"
            />
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center space-x-1 bg-surface-secondary p-0.5 rounded-lg border border-divider">
            {(['ALL', 'READY', 'PENDING'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  statusFilter === st
                    ? 'bg-surface text-brand-primary font-bold shadow-2xs'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                {st === 'ALL' ? 'All' : st === 'READY' ? 'Ready in Warehouse' : 'Pending Gate-In'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AVAILABLE INVOICES LIST */}
      <div className="flex-1 overflow-y-auto mt-4 space-y-3 pb-24">
        {availableInvoices.length === 0 ? (
          <div className="text-center py-24 bg-surface border border-dashed border-divider rounded-xl p-8 space-y-3">
            <Boxes className="w-12 h-12 text-content-muted mx-auto opacity-50" />
            <div>
              <h3 className="text-sm font-semibold text-content-primary">No matching warehouse inventory</h3>
              <p className="text-xs text-content-secondary mt-1">
                {entries.length === 0
                  ? 'Your inventory is currently empty. Upload commercial invoices to stock the warehouse.'
                  : 'No active stock matches your filter or search query.'}
              </p>
            </div>
            <button
              onClick={onOpenInventory}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-brand-primary text-white text-xs font-semibold hover:bg-brand-primary-hover shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Go to Inventory Hub to Upload New Invoice</span>
            </button>
          </div>
        ) : (
          availableInvoices.map((entry) => {
            const isSelected = selectedInvoices.has(entry.id);
            const isExpanded = expandedInvoiceIds.has(entry.id);
            const selectedPalletIds = selectedInvoices.get(entry.id) || new Set<string>();

            const availableUnits = (entry.pallets || []).filter((p) => p.status === 'IN_WAREHOUSE');
            const isPendingGateIn = (entry.actualReceivedPallets || 0) < entry.invoicedPallets;

            return (
              <div
                key={entry.id}
                className={`bg-surface border rounded-xl overflow-hidden shadow-xs transition-all ${
                  isSelected
                    ? 'border-brand-primary ring-1 ring-brand-primary/50'
                    : 'border-divider hover:border-brand-primary/40'
                }`}
              >
                {/* Invoice Main Row */}
                <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleInvoice(entry)}
                      className="w-4 h-4 rounded border-divider text-brand-primary focus:ring-brand-primary cursor-pointer"
                    />

                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-sm font-bold text-brand-primary">
                          {entry.customInvoiceNo}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                          {entry.month}
                        </span>
                        <span className="text-xs font-semibold text-content-primary">
                          {entry.customer}
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-content-secondary font-mono">
                        <span>POD: <strong className="text-content-primary">{entry.pod || '-'}</strong></span>
                        <span>•</span>
                        <span>Invoiced: <strong className="text-content-primary">{entry.invoicedPallets} Plt</strong> ({entry.invoicedBatteries.toLocaleString()}u)</span>
                        <span>•</span>
                        <span>Gross: <strong className="text-content-primary">{entry.invoicedGrossWeightKg.toLocaleString()} kg</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Available Balance & Status */}
                  <div className="flex items-center space-x-3 shrink-0">
                    <div className="text-right font-mono text-xs">
                      <div className="text-[11px] text-content-secondary">Available Floor Balance:</div>
                      <div className="font-bold">
                        <span className="text-emerald-700 text-sm">{entry.balancePallets} Plt</span>
                        <span className="text-content-muted"> / </span>
                        <span className="text-indigo-700">{entry.balanceBatteries.toLocaleString()}u</span>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold font-mono uppercase tracking-wider border ${
                        entry.balancePallets > 0
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : isPendingGateIn
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {entry.balancePallets > 0 ? 'In Warehouse' : 'Pending Gate-In'}
                    </span>

                    {/* Pallets Drawer Toggle */}
                    <button
                      onClick={() => {
                        setExpandedInvoiceIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(entry.id)) next.delete(entry.id);
                          else next.add(entry.id);
                          return next;
                        });
                      }}
                      className="p-1 rounded text-content-secondary hover:text-content-primary hover:bg-surface-secondary border border-divider cursor-pointer"
                      title={isExpanded ? 'Hide pallet breakdown' : 'View individual pallets'}
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* EXPANDABLE PALLET UNITS DRAWER */}
                {isExpanded && (
                  <div className="p-3 sm:p-4 bg-surface-secondary/40 border-t border-divider/60 space-y-2">
                    <div className="text-xs font-semibold text-content-secondary flex items-center justify-between">
                      <span>Pallet Breakdown ({entry.pallets?.length || 0} Total • {availableUnits.length} Ready on Floor):</span>
                      <span className="text-content-muted font-normal text-[11px]">Check/uncheck individual pallets to adjust selection</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 font-mono text-xs">
                      {(entry.pallets || []).map((p) => {
                        const isPalletSelected = isSelected && selectedPalletIds.has(p.id);
                        const isStuffed = p.status === 'STUFFED_DISPATCHED';

                        return (
                          <div
                            key={p.id}
                            onClick={() => {
                              if (!isStuffed) {
                                handleTogglePallet(entry.id, p.id);
                              }
                            }}
                            className={`p-2 rounded-lg border text-xs transition-all ${
                              isStuffed
                                ? 'bg-slate-100 text-content-muted border-slate-200 cursor-not-allowed opacity-60'
                                : isPalletSelected
                                ? 'bg-brand-primary-soft border-brand-primary ring-1 ring-brand-primary cursor-pointer shadow-xs'
                                : 'bg-surface border-divider hover:border-brand-primary cursor-pointer'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-brand-primary">PLT #{p.palletNumber}</span>
                              <span className="text-[10px] px-1 rounded bg-surface-secondary truncate max-w-[50px]">{p.model}</span>
                            </div>
                            <div className="mt-1 flex items-center justify-between text-[11px]">
                              <span className="text-content-secondary">Qty:</span>
                              <strong className="text-content-primary">{p.receivedBatteries || p.invoicedBatteries}u</strong>
                            </div>
                            <div className="mt-0.5 text-[10px] text-content-muted text-right">
                              {isStuffed ? 'Shipped' : `${p.grossWeightKg}kg`}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* BOTTOM DOCKED ACTION BAR */}
      {selectedInvoices.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-divider p-3 sm:p-4 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center space-x-3 text-xs font-mono">
            <span className="px-2.5 py-1 rounded-md bg-brand-primary text-white font-bold">
              Selected: {selectionSummary.invoiceCount} Invoices • {selectionSummary.palletCount} Pallets
            </span>
            <span className="text-content-secondary">
              {selectionSummary.batteryCount.toLocaleString()} Units • {selectionSummary.grossKg.toLocaleString()} kg
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold hidden md:inline">
              Requires {selectionSummary.required20GP} × 20' GP
            </span>
          </div>

          <div className="flex items-center space-x-2 text-xs">
            <button
              onClick={() => setSelectedInvoices(new Map())}
              className="px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-secondary border border-divider cursor-pointer"
            >
              Clear Selection
            </button>

            <button
              onClick={handleLoadSelected}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center space-x-1.5 cursor-pointer shadow-md transition-all"
            >
              <span>Load Selected Inventory into Dispatch Tool ({selectionSummary.palletCount} Pallets)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
