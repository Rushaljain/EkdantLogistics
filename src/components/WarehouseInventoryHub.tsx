// Ekdant Logistics - CHA Warehouse Inventory Hub (Sprint 5)
// "Top Control Deck + 3 Operational Tiles" Architecture
// Strict zero-hardcoding: dynamic resolution from ExtractedShipmentJSON & CFSLedgerEntry

import React, { useState, useMemo, useRef } from 'react';
import {
  Boxes,
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  ArrowRight,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  X,
  Maximize2,
  Minimize2,
  Printer,
  AlertTriangle,
  History,
  Grid
} from 'lucide-react';
import type {
  CFSLedgerEntry,
  ExtractedShipmentJSON,
  PalletStockUnit
} from '../types/index.ts';
import {
  CFS_MONTHS,
  type CFSMonth,
  getCFSLedgerEntries,
  addOrUpdateCFSEntry,
  confirmFullGateIn,
  updatePalletReceivedQuantity,
  confirmStuffingDispatch,
  buildShipmentFromStockPallets,
  exportCFSStockReportXlsx,
  exportCFSCartingReportXlsx,
  importCFSExcel,
  formatToDDMMYYYY,
  getDerivedInventoryMovements,
  exportCFSMovementLogsXlsx
} from '../utils/inventoryStore.ts';

interface WarehouseInventoryHubProps {
  onLoadShipmentIntoWorkspace: (shipment: ExtractedShipmentJSON) => void;
  onNavigateToWorkspace: () => void;
  activeShipmentJson?: ExtractedShipmentJSON;
}

// In-place click-to-edit cell matching enterprise spreadsheet ergonomics
function InlineCell({
  value,
  onChange,
  type = 'text',
  className = '',
  align = 'left'
}: {
  value: string | number;
  onChange: (val: string) => void;
  type?: 'text' | 'number';
  className?: string;
  align?: 'left' | 'right' | 'center';
}): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false);
  const [tempVal, setTempVal] = useState('');

  const handleStartEdit = () => {
    setTempVal(String(value ?? ''));
    setIsEditing(true);
  };

  const commit = () => {
    setIsEditing(false);
    if (tempVal !== String(value ?? '')) {
      onChange(tempVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        autoFocus
        type={type}
        value={tempVal}
        onChange={(e) => setTempVal(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className={`w-full px-1 py-0.5 text-xs bg-input-bg border border-brand-primary rounded text-content-primary focus:outline-none font-mono ${
          align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
        } ${className}`}
      />
    );
  }

  const isBlank = value === '' || value === null || value === undefined || value === 0;
  return (
    <div
      onClick={handleStartEdit}
      title="Click to edit"
      className={`cursor-pointer px-1 py-0.5 rounded hover:bg-slate-200/50 truncate font-mono text-xs transition-colors ${
        isBlank ? 'text-content-muted italic' : 'text-content-primary'
      } ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'} ${className}`}
    >
      {isBlank ? '-' : value}
    </div>
  );
}

// Helper to parse dates into timestamp for filtering
function parseDateStrToTime(str?: string): number | null {
  if (!str) return null;
  const s = String(str).trim();
  const parts = s.split(/[./-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return isNaN(d.getTime()) ? null : d.getTime();
    }
    const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getTime();
}

export function WarehouseInventoryHub({
  onLoadShipmentIntoWorkspace,
  onNavigateToWorkspace,
  activeShipmentJson: _activeShipmentJson
}: WarehouseInventoryHubProps): React.JSX.Element {
  const [entries, setEntries] = useState<CFSLedgerEntry[]>(() => getCFSLedgerEntries());

  // Operational View Modes: 'grid' (all 3 tiles) or focus on single tile ('inventory' | 'reports' | 'logs')
  const [tileViewMode, setTileViewMode] = useState<'grid' | 'inventory' | 'reports' | 'logs'>('grid');

  // Top Control Deck: Collapsible
  const [isDeckExpanded, setIsDeckExpanded] = useState<boolean>(true);

  // Global Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [customerFilter, setCustomerFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'READY' | 'LOW_STOCK' | 'SHORTFALL' | 'AGEING' | 'DONE'>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<CFSMonth>('ALL');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Tile 1 (Inventory) States
  const [selectedPalletIds, setSelectedPalletIds] = useState<Set<string>>(new Set());
  const [selectedDispatchCustomer, setSelectedDispatchCustomer] = useState<string>('');
  const [expandedInventoryInvoiceIds, setExpandedInventoryInvoiceIds] = useState<Set<string>>(new Set());
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState<'ALL' | 'PENDING_GATE_IN' | 'IN_WAREHOUSE' | 'SHORTFALL'>('ALL');

  // Tile 2 (Monthly Live Reports) States
  const [reportType, setReportType] = useState<'stock_22' | 'carting_17'>('stock_22');
  const [expandedCartingInvoiceIds, setExpandedCartingInvoiceIds] = useState<Set<string>>(new Set());

  // Tile 3 (Inventory Logs) States
  const [logDirectionFilter, setLogDirectionFilter] = useState<'ALL' | 'STOCK_OUT' | 'STOCK_IN'>('ALL');

  // Stuffing & Dispatch Modal State
  const [showDispatchModal, setShowDispatchModal] = useState<boolean>(false);
  const [dispatchDetails, setDispatchDetails] = useState(() => {
    const today = formatToDDMMYYYY(new Date());
    return {
      containerNo: '',
      sealNo: '',
      shippingBillNo: '',
      shippingBillDate: today,
      stuffingDate: today,
      pickupDate: today,
      portGateInDate: today
    };
  });

  // File import ref & toast
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const reloadEntries = () => {
    const loaded = getCFSLedgerEntries();
    setEntries(loaded);
  };

  // Customer Summaries for Header Pills
  const customerPillData = useMemo(() => {
    const map = new Map<string, { pallets: number; batteries: number }>();
    entries.forEach((e) => {
      const cust = e.customer?.trim();
      if (!cust) return;
      const cur = map.get(cust) || { pallets: 0, batteries: 0 };
      cur.pallets += e.balancePallets || 0;
      cur.batteries += e.balanceBatteries || 0;
      map.set(cust, cur);
    });
    return Array.from(map.entries()).map(([cust, stats]) => ({
      customer: cust,
      ...stats
    }));
  }, [entries]);

  // Top 4 Primary Live KPI Cards
  const kpis = useMemo(() => {
    const totalBalancePallets = entries.reduce((s, e) => s + (e.balancePallets || 0), 0);
    const totalBalanceBatteries = entries.reduce((s, e) => s + (e.balanceBatteries || 0), 0);
    const totalBalanceGrossKg = entries.reduce((s, e) => {
      if (e.invoicedPallets > 0 && e.balancePallets > 0) {
        return s + Math.round((e.invoicedGrossWeightKg / e.invoicedPallets) * e.balancePallets);
      }
      return s;
    }, 0);

    const totalInvoicedPallets = entries.reduce((s, e) => s + (e.invoicedPallets || 0), 0);
    const totalReceivedPallets = entries.reduce((s, e) => s + (e.actualReceivedPallets || 0), 0);
    const pendingGateInCount = entries.filter((e) => (e.actualReceivedPallets || 0) < e.invoicedPallets).length;

    const totalStuffedPallets = entries.reduce((s, e) => s + (e.actualStuffedPallets || 0), 0);
    const totalStuffedBatteries = entries.reduce((s, e) => s + (e.actualStuffedBatteries || 0), 0);

    const containerSet = new Set<string>();
    entries.forEach((e) => {
      if (e.containerNo && e.containerNo.trim()) containerSet.add(e.containerNo.trim());
      (e.pallets || []).forEach((p) => {
        if (p.containerNo && p.containerNo.trim()) containerSet.add(p.containerNo.trim());
      });
    });
    const dispatchedContainersCount = containerSet.size;

    const totalShortfallPallets = entries.reduce((s, e) => s + (e.shortfallPallets || 0), 0);
    const lowStockCount = entries.filter((e) => e.balancePallets > 0 && e.balancePallets < 22).length;
    const ageingCount = entries.filter((e) => (e.daysInCFS || 0) > 15 && e.balancePallets > 0).length;

    const total20GPLoads = Math.ceil(totalBalancePallets / 22);

    return {
      totalBalancePallets,
      totalBalanceBatteries,
      totalBalanceGrossKg,
      totalInvoicedPallets,
      totalReceivedPallets,
      pendingGateInCount,
      totalStuffedPallets,
      totalStuffedBatteries,
      dispatchedContainersCount,
      totalShortfallPallets,
      lowStockCount,
      ageingCount,
      total20GPLoads
    };
  }, [entries]);

  // Filtered Entries for Tables and Inventory
  const filteredEntries = useMemo(() => {
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;

    return entries.filter((e) => {
      if (selectedMonth !== 'ALL' && (e.month || '').toUpperCase() !== selectedMonth.toUpperCase()) {
        return false;
      }
      if (customerFilter !== 'ALL' && e.customer?.trim().toUpperCase() !== customerFilter.toUpperCase()) {
        return false;
      }
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'READY' && !(e.balancePallets > 0 && e.actualStuffedPallets === 0)) return false;
        if (statusFilter === 'LOW_STOCK' && !(e.balancePallets >= 1 && e.balancePallets < 22)) return false;
        if (statusFilter === 'SHORTFALL' && !(e.shortfallPallets > 0 || e.shortfallBatteries > 0)) return false;
        if (statusFilter === 'AGEING' && !(e.daysInCFS > 15 && e.balancePallets > 0)) return false;
        if (statusFilter === 'DONE' && !(e.balancePallets === 0 && e.actualStuffedPallets > 0)) return false;
      }
      if (fromTime !== null || toTime !== null) {
        const entryDates = [
          parseDateStrToTime(e.cartingInDate),
          parseDateStrToTime(e.lastPltRecdDate),
          parseDateStrToTime(e.stuffingDate),
          parseDateStrToTime(e.createdAt)
        ].filter((t): t is number => t !== null);

        if (entryDates.length > 0) {
          const checkTime = entryDates[0];
          if (fromTime !== null && checkTime < fromTime) return false;
          if (toTime !== null && checkTime > toTime) return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          (e.customer || '').toLowerCase().includes(q) ||
          (e.customInvoiceNo || '').toLowerCase().includes(q) ||
          (e.containerNo || '').toLowerCase().includes(q) ||
          (e.shippingBillNo || '').toLowerCase().includes(q) ||
          (e.pod || '').toLowerCase().includes(q) ||
          (e.vehicleNo || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [entries, selectedMonth, customerFilter, statusFilter, dateFrom, dateTo, searchQuery]);

  // Tile 1: Active Floor Stock Invoices
  const activeStockInvoices = useMemo(() => {
    return filteredEntries.filter((e) => {
      if (inventoryStatusFilter === 'ALL') {
        return e.balancePallets > 0 || e.actualReceivedPallets < e.invoicedPallets;
      }
      if (inventoryStatusFilter === 'PENDING_GATE_IN') {
        return e.actualReceivedPallets < e.invoicedPallets;
      }
      if (inventoryStatusFilter === 'IN_WAREHOUSE') {
        return e.balancePallets > 0;
      }
      if (inventoryStatusFilter === 'SHORTFALL') {
        return e.shortfallPallets > 0 || e.shortfallBatteries > 0;
      }
      return true;
    });
  }, [filteredEntries, inventoryStatusFilter]);

  // Tile 1: Available Pallet Units for Picking
  const availablePalletUnits = useMemo(() => {
    const list: { pallet: PalletStockUnit; entry: CFSLedgerEntry }[] = [];
    filteredEntries.forEach((e) => {
      if (selectedDispatchCustomer && e.customer?.trim().toUpperCase() !== selectedDispatchCustomer.toUpperCase()) {
        return;
      }
      (e.pallets || []).forEach((p) => {
        if (p.status === 'IN_WAREHOUSE') {
          list.push({ pallet: p, entry: e });
        }
      });
    });
    return list;
  }, [filteredEntries, selectedDispatchCustomer]);

  // Selected Pallets Stats
  const selectedPalletsStats = useMemo(() => {
    let count = 0;
    let batteries = 0;
    let grossKg = 0;
    const palletList: PalletStockUnit[] = [];

    entries.forEach((e) => {
      (e.pallets || []).forEach((p) => {
        if (selectedPalletIds.has(p.id)) {
          count++;
          batteries += p.receivedBatteries || p.invoicedBatteries || 0;
          grossKg += p.grossWeightKg || 0;
          palletList.push(p);
        }
      });
    });

    const required20GP = Math.ceil(count / 22);
    return { count, batteries, grossKg: Math.round(grossKg), required20GP, palletList };
  }, [selectedPalletIds, entries]);

  // Toggle Pallet Selection
  const togglePalletSelection = (palletId: string, customer: string) => {
    setSelectedPalletIds((prev) => {
      const next = new Set(prev);
      if (next.has(palletId)) {
        next.delete(palletId);
        if (next.size === 0) {
          setSelectedDispatchCustomer('');
        }
      } else {
        if (!selectedDispatchCustomer) {
          setSelectedDispatchCustomer(customer);
        } else if (selectedDispatchCustomer !== customer) {
          showToast(`Dispatch locked to customer: ${selectedDispatchCustomer}. Clear selection to pick another customer.`);
          return prev;
        }
        next.add(palletId);
      }
      return next;
    });
  };

  // Toggle All Pallets for an Invoice
  const toggleSelectAllForInvoice = (entry: CFSLedgerEntry) => {
    const available = (entry.pallets || []).filter((p) => p.status === 'IN_WAREHOUSE');
    if (available.length === 0) return;

    if (selectedDispatchCustomer && selectedDispatchCustomer !== entry.customer) {
      showToast(`Selection locked to ${selectedDispatchCustomer}. Clear selection to switch customer.`);
      return;
    }

    const allSelected = available.every((p) => selectedPalletIds.has(p.id));
    setSelectedPalletIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        available.forEach((p) => next.delete(p.id));
        if (next.size === 0) setSelectedDispatchCustomer('');
      } else {
        setSelectedDispatchCustomer(entry.customer);
        available.forEach((p) => next.add(p.id));
      }
      return next;
    });
  };

  // Quick Select All for Selected Customer
  const handleSelectAllForCustomer = () => {
    if (availablePalletUnits.length === 0) return;
    const targetCust = customerFilter !== 'ALL' ? customerFilter : availablePalletUnits[0].entry.customer;
    const matching = availablePalletUnits.filter((item) => item.entry.customer === targetCust);
    const next = new Set<string>();
    matching.forEach((item) => next.add(item.pallet.id));
    setSelectedPalletIds(next);
    setSelectedDispatchCustomer(targetCust);
  };

  // Action: Load into 20' GP & Navigate to Workspace
  const handleLoadSelectedIntoWorkspace = () => {
    if (selectedPalletsStats.palletList.length === 0) {
      showToast('Select at least 1 pallet to load into 20\' GP.');
      return;
    }
    const customer = selectedDispatchCustomer || selectedPalletsStats.palletList[0].brand || 'Consignee';
    const firstEntry = entries.find((e) => (e.pallets || []).some((p) => p.id === selectedPalletsStats.palletList[0].id));

    const truthJson = buildShipmentFromStockPallets(
      selectedPalletsStats.palletList,
      customer,
      firstEntry?.pod,
      firstEntry?.exporterShipper
    );

    onLoadShipmentIntoWorkspace(truthJson);
    showToast(`Loaded ${selectedPalletsStats.count} pallets (${selectedPalletsStats.required20GP} × 20' GP) into Workspace!`);
    onNavigateToWorkspace();
  };

  // Action: Confirm Stuffing & Stock-Out Dispatch
  const handleExecuteDispatch = () => {
    if (selectedPalletsStats.palletList.length === 0) return;
    if (!dispatchDetails.containerNo.trim() || !dispatchDetails.sealNo.trim()) {
      showToast('Please enter Container No and Seal No.');
      return;
    }

    const { stuffedCount } = confirmStuffingDispatch(
      Array.from(selectedPalletIds),
      dispatchDetails
    );

    showToast(`Dispatched ${stuffedCount} pallets into Container ${dispatchDetails.containerNo}!`);
    setShowDispatchModal(false);
    setSelectedPalletIds(new Set());
    setSelectedDispatchCustomer('');
    reloadEntries();
  };

  // Action: 1-Click Confirm Full Gate-In
  const handleConfirmFullGateIn = (entryId: string) => {
    const updated = confirmFullGateIn(entryId);
    if (updated) {
      showToast(`Confirmed 100% Gate-In for ${updated.customInvoiceNo}!`);
      reloadEntries();
    }
  };

  // Action: Excel Import
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const res = await importCFSExcel(file);
    if (res.importedCount > 0) {
      showToast(`Imported ${res.importedCount} records from ${file.name}!`);
      reloadEntries();
    } else {
      showToast(`0 records imported. ${res.errors.join(' ')}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Tile 3: Derived Inventory Movement Records
  const allMovementRecords = useMemo(() => {
    return getDerivedInventoryMovements(entries);
  }, [entries]);

  // Filtered Movement Records
  const filteredMovementRecords = useMemo(() => {
    return allMovementRecords.filter((r) => {
      if (logDirectionFilter !== 'ALL' && r.direction !== logDirectionFilter) {
        return false;
      }
      if (customerFilter !== 'ALL' && r.customer.trim().toUpperCase() !== customerFilter.toUpperCase()) {
        return false;
      }
      if (dateFrom || dateTo) {
        const time = parseDateStrToTime(r.movementDate) || parseDateStrToTime(r.createdAt);
        if (time) {
          if (dateFrom && time < new Date(`${dateFrom}T00:00:00`).getTime()) return false;
          if (dateTo && time > new Date(`${dateTo}T23:59:59`).getTime()) return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          r.customer.toLowerCase().includes(q) ||
          r.customInvoiceNo.toLowerCase().includes(q) ||
          (r.containerNo || '').toLowerCase().includes(q) ||
          (r.vehicleNo || '').toLowerCase().includes(q) ||
          (r.shippingBillNo || '').toLowerCase().includes(q) ||
          (r.modelDescription || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [allMovementRecords, logDirectionFilter, customerFilter, dateFrom, dateTo, searchQuery]);

  // Customer-Wise Outgoing Summary Strip (Tile 3)
  const customerOutgoingSummaries = useMemo(() => {
    const map = new Map<string, { pallets: number; batteries: number; containers: Set<string> }>();
    allMovementRecords.forEach((r) => {
      if (r.direction === 'STOCK_OUT') {
        const cur = map.get(r.customer) || { pallets: 0, batteries: 0, containers: new Set() };
        cur.pallets += r.pallets || 0;
        cur.batteries += r.batteries || 0;
        if (r.containerNo && r.containerNo !== '-') cur.containers.add(r.containerNo);
        map.set(r.customer, cur);
      }
    });
    return Array.from(map.entries()).map(([cust, s]) => ({
      customer: cust,
      pallets: s.pallets,
      batteries: s.batteries,
      containersCount: s.containers.size
    }));
  }, [allMovementRecords]);

  // Clear all active filters helper
  const hasActiveFilters = searchQuery || customerFilter !== 'ALL' || statusFilter !== 'ALL' || selectedMonth !== 'ALL' || dateFrom || dateTo;
  const handleClearFilters = () => {
    setSearchQuery('');
    setCustomerFilter('ALL');
    setStatusFilter('ALL');
    setSelectedMonth('ALL');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-app text-content-primary overflow-hidden font-sans select-none">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-3.5 py-2 rounded-lg shadow-xl text-xs font-semibold flex items-center space-x-2 animate-fade-in border border-emerald-400">
          <CheckCircle2 className="w-4 h-4 text-white" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hidden Excel File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".xlsx,.xls"
        className="hidden"
      />

      {/* =========================================================================
          1. TOP CONTROL DECK: "USER DASHBOARD" (Always on Top, Collapsible)
          ========================================================================= */}
      <section className="bg-surface border-b border-divider shrink-0 z-20 shadow-xs transition-all">
        {/* Top Control Bar Header */}
        <div className="h-13 px-4 sm:px-6 flex items-center justify-between border-b border-divider/60">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-brand-primary flex items-center justify-center text-white shadow-xs">
              <Boxes className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xs font-bold text-content-primary tracking-wide uppercase">
                  CFS Warehouse Hub
                </h1>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface-secondary border border-divider text-content-secondary font-medium">
                  Control Deck
                </span>
              </div>
              <p className="text-[10px] text-content-muted hidden sm:block">
                Floor Stock Ledger • 20' GP Pallet Stuffer • Gate-In Audit Trail
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Compact / Expand Deck Toggle Button */}
            <button
              onClick={() => setIsDeckExpanded((prev) => !prev)}
              className="px-2.5 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface border border-divider text-xs font-medium text-content-secondary hover:text-content-primary flex items-center space-x-1.5 transition-colors cursor-pointer"
              title={isDeckExpanded ? 'Collapse to slim KPI bar' : 'Expand full user dashboard deck'}
            >
              {isDeckExpanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Compact Deck</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Expand Deck</span>
                </>
              )}
            </button>

            {/* Quick Import Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary border border-divider text-xs font-medium flex items-center space-x-1.5 transition-colors shadow-xs cursor-pointer"
              title="Import historical CFS Excel"
            >
              <Upload className="w-3.5 h-3.5 text-brand-primary" />
              <span className="hidden md:inline">Import .xlsx</span>
            </button>

            {/* Direct Workspace Link */}
            <button
              onClick={onNavigateToWorkspace}
              className="px-3 py-1.5 rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <span>Workspace</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Expanded Deck View */}
        {isDeckExpanded ? (
          <div className="p-3.5 sm:p-4 space-y-3 bg-surface-secondary/40">
            {/* 4 Primary Live KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 font-mono tabular-nums">
              {/* KPI 1: Available Floor Balance */}
              <div className="bg-surface border border-divider rounded-xl p-3 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-[11px] text-content-secondary font-sans">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Available Floor Balance</span>
                  <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold font-mono">
                    ≈ {kpis.total20GPLoads} × 20' GP
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline space-x-1.5">
                  <span className="text-xl font-extrabold text-content-primary">{kpis.totalBalancePallets}</span>
                  <span className="text-xs text-content-muted font-normal font-sans">Plt</span>
                  <span className="text-content-muted">•</span>
                  <span className="text-base font-bold text-indigo-700">{kpis.totalBalanceBatteries.toLocaleString()}</span>
                  <span className="text-xs text-content-muted font-normal font-sans">Units</span>
                </div>
                <div className="mt-1 text-[11px] text-content-secondary">
                  Gross: <strong className="text-content-primary">{kpis.totalBalanceGrossKg.toLocaleString()} kg</strong>
                </div>
              </div>

              {/* KPI 2: Incoming / Gate-In Status */}
              <div className="bg-surface border border-divider rounded-xl p-3 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-[11px] text-content-secondary font-sans">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Gate-In Status</span>
                  {kpis.pendingGateInCount > 0 ? (
                    <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold font-mono">
                      {kpis.pendingGateInCount} Invoices Pending
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold font-mono">
                      All Gate-In Ready
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex items-baseline space-x-1.5">
                  <span className="text-xl font-extrabold text-content-primary">{kpis.totalReceivedPallets}</span>
                  <span className="text-xs text-content-muted font-normal font-sans">/ {kpis.totalInvoicedPallets} Plt Checked In</span>
                </div>
                <div className="mt-1 text-[11px] text-content-secondary">
                  Receipt Rate: <strong className="text-content-primary">{kpis.totalInvoicedPallets > 0 ? Math.round((kpis.totalReceivedPallets / kpis.totalInvoicedPallets) * 100) : 100}%</strong>
                </div>
              </div>

              {/* KPI 3: Dispatched (Stock-Out) */}
              <div className="bg-surface border border-divider rounded-xl p-3 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-[11px] text-content-secondary font-sans">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Dispatched (Stock-Out)</span>
                  <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold font-mono">
                    {kpis.dispatchedContainersCount} Containers
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline space-x-1.5">
                  <span className="text-xl font-extrabold text-content-primary">{kpis.totalStuffedPallets}</span>
                  <span className="text-xs text-content-muted font-normal font-sans">Plt</span>
                  <span className="text-content-muted">•</span>
                  <span className="text-base font-bold text-blue-700">{kpis.totalStuffedBatteries.toLocaleString()}</span>
                  <span className="text-xs text-content-muted font-normal font-sans">Units</span>
                </div>
                <div className="mt-1 text-[11px] text-content-secondary">
                  Stuffed &amp; Port Dispatched
                </div>
              </div>

              {/* KPI 4: Exceptions & Alerts */}
              <div className="bg-surface border border-divider rounded-xl p-3 shadow-xs flex flex-col justify-between font-sans">
                <div className="flex items-center justify-between text-[11px] text-content-secondary">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Exceptions &amp; Alerts</span>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1 font-mono text-[11px]">
                  <button
                    onClick={() => setStatusFilter((cur) => (cur === 'SHORTFALL' ? 'ALL' : 'SHORTFALL'))}
                    className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                      statusFilter === 'SHORTFALL'
                        ? 'bg-rose-600 text-white border-rose-600 font-bold'
                        : kpis.totalShortfallPallets > 0
                        ? 'bg-rose-50 text-rose-700 border-rose-200 font-semibold hover:bg-rose-100'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}
                    title="Click to filter by shortfall"
                  >
                    Shortfall ({kpis.totalShortfallPallets}p)
                  </button>

                  <button
                    onClick={() => setStatusFilter((cur) => (cur === 'LOW_STOCK' ? 'ALL' : 'LOW_STOCK'))}
                    className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                      statusFilter === 'LOW_STOCK'
                        ? 'bg-amber-600 text-white border-amber-600 font-bold'
                        : kpis.lowStockCount > 0
                        ? 'bg-amber-50 text-amber-800 border-amber-200 font-semibold hover:bg-amber-100'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}
                    title="Click to filter by low stock (<22 pallets)"
                  >
                    Low Stock ({kpis.lowStockCount})
                  </button>

                  <button
                    onClick={() => setStatusFilter((cur) => (cur === 'AGEING' ? 'ALL' : 'AGEING'))}
                    className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                      statusFilter === 'AGEING'
                        ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                        : kpis.ageingCount > 0
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold hover:bg-indigo-100'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}
                    title="Click to filter ageing CFS stock (>15 days)"
                  >
                    Ageing &gt;15d ({kpis.ageingCount})
                  </button>
                </div>
                <div className="mt-1 text-[10px] text-content-muted">
                  Interactive filters applied to all 3 tiles below
                </div>
              </div>
            </div>

            {/* Interactive Customer & Global Filter Strip */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pt-1 border-t border-divider/60">
              {/* Left: Global Search Box */}
              <div className="flex items-center space-x-2">
                <div className="relative w-full sm:w-72">
                  <Search className="w-3.5 h-3.5 text-content-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search Invoice, Customer, Container, SB No., Truck..."
                    className="w-full pl-8 pr-7 py-1.5 bg-surface border border-divider rounded-lg text-xs text-content-primary placeholder-content-muted focus:outline-none focus:border-brand-primary"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {hasActiveFilters && (
                  <button
                    onClick={handleClearFilters}
                    className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold flex items-center space-x-1 transition-colors cursor-pointer shrink-0"
                    title="Reset all filters"
                  >
                    <X className="w-3 h-3" />
                    <span>Clear All Filters</span>
                  </button>
                )}
              </div>

              {/* Right: Horizontal Customer Stock Pills */}
              <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs font-mono tabular-nums">
                <button
                  onClick={() => setCustomerFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg border text-xs transition-colors shrink-0 cursor-pointer font-sans ${
                    customerFilter === 'ALL'
                      ? 'bg-brand-primary text-white border-brand-primary font-bold shadow-2xs'
                      : 'bg-surface hover:bg-surface-secondary text-content-secondary border-divider'
                  }`}
                >
                  All Customers ({kpis.totalBalancePallets}p)
                </button>

                {customerPillData.map((c) => {
                  const isSelected = customerFilter.toUpperCase() === c.customer.toUpperCase();
                  return (
                    <button
                      key={c.customer}
                      onClick={() => setCustomerFilter(isSelected ? 'ALL' : c.customer)}
                      className={`px-2.5 py-1 rounded-lg border text-xs transition-colors shrink-0 flex items-center space-x-1.5 cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-2xs'
                          : 'bg-surface hover:bg-surface-secondary text-content-primary border-divider'
                      }`}
                      title={`Filter by ${c.customer}`}
                    >
                      <span className="font-sans font-medium truncate max-w-[120px]">{c.customer}</span>
                      <span className="text-[10px] font-bold px-1 rounded bg-black/10">
                        {c.pallets}p
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Slim Collapsed KPI Bar */
          <div className="h-10 px-4 sm:px-6 bg-surface-secondary/60 flex items-center justify-between text-xs font-mono tabular-nums">
            <div className="flex items-center space-x-2 truncate">
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                Balance: {kpis.totalBalancePallets} Plt ({kpis.totalBalanceBatteries} Units • {kpis.total20GPLoads} × 20' GP)
              </span>
              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 hidden sm:inline">
                Gate-In: {kpis.totalReceivedPallets}/{kpis.totalInvoicedPallets} Plt
              </span>
              <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 hidden md:inline">
                Stuffed: {kpis.totalStuffedPallets} Plt ({kpis.dispatchedContainersCount} Cont)
              </span>
              {kpis.totalShortfallPallets > 0 && (
                <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200 font-bold">
                  Shortfall: {kpis.totalShortfallPallets} Plt
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              {customerFilter !== 'ALL' && (
                <span className="px-2 py-0.5 rounded bg-brand-primary text-white text-[11px] font-sans font-semibold">
                  {customerFilter}
                </span>
              )}
              <button
                onClick={() => setIsDeckExpanded(true)}
                className="text-[11px] text-brand-primary hover:underline font-sans font-medium cursor-pointer"
              >
                Show Dashboard
              </button>
            </div>
          </div>
        )}
      </section>

      {/* =========================================================================
          2. SUB-HEADER: RESPONSIVE VIEW MODE SWITCHER
          ========================================================================= */}
      <div className="h-12 px-4 sm:px-6 border-b border-divider bg-surface flex items-center justify-between shrink-0 text-xs">
        {/* Left: View Mode Switcher */}
        <div className="flex items-center space-x-2">
          <span className="text-content-secondary font-medium hidden sm:inline text-xs">
            Operational View:
          </span>
          <div className="bg-surface-secondary border border-divider p-0.5 rounded-lg flex items-center space-x-0.5 text-xs font-medium">
            <button
              onClick={() => setTileViewMode('grid')}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center space-x-1.5 cursor-pointer ${
                tileViewMode === 'grid'
                  ? 'bg-surface text-brand-primary font-bold shadow-xs'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
              title="View all 3 tiles in a responsive split grid"
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Overview Grid (All 3)</span>
            </button>

            <button
              onClick={() => setTileViewMode('inventory')}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center space-x-1.5 cursor-pointer ${
                tileViewMode === 'inventory'
                  ? 'bg-surface text-brand-primary font-bold shadow-xs'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
              title="Focus 100% on Floor Stock & Container Picking"
            >
              <Boxes className="w-3.5 h-3.5 text-emerald-600" />
              <span>1. Inventory ({availablePalletUnits.length}p)</span>
            </button>

            <button
              onClick={() => setTileViewMode('reports')}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center space-x-1.5 cursor-pointer ${
                tileViewMode === 'reports'
                  ? 'bg-surface text-brand-primary font-bold shadow-xs'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
              title="Focus 100% on Monthly CFS Stock & Carting Tables"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
              <span>2. Monthly Live Reports</span>
            </button>

            <button
              onClick={() => setTileViewMode('logs')}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center space-x-1.5 cursor-pointer ${
                tileViewMode === 'logs'
                  ? 'bg-surface text-brand-primary font-bold shadow-xs'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
              title="Focus 100% on Outgoing & Gate-In Movement Ledger"
            >
              <History className="w-3.5 h-3.5 text-blue-600" />
              <span>3. Inventory Logs ({allMovementRecords.length})</span>
            </button>
          </div>
        </div>

        {/* Right: Quick Active Filter Pills */}
        <div className="flex items-center space-x-1.5 text-[11px] font-mono">
          {customerFilter !== 'ALL' && (
            <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
              Cust: {customerFilter}
            </span>
          )}
          {statusFilter !== 'ALL' && (
            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
              Filter: {statusFilter}
            </span>
          )}
          {(dateFrom || dateTo) && (
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
              Dates: {dateFrom || 'Start'} → {dateTo || 'End'}
            </span>
          )}
        </div>
      </div>

      {/* =========================================================================
          3. MAIN OPERATIONAL AREA: 3 TILES (GRID OR FOCUSED 100% FULL-WIDTH)
          ========================================================================= */}
      <div className="flex-1 overflow-auto p-4 sm:p-5 relative">
        {/* =====================================================================
            VIEW MODE A: UNIFIED OVERVIEW GRID (ALL 3 TILES IN 3 COLUMNS)
            ===================================================================== */}
        {tileViewMode === 'grid' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 pb-20">
            {/* TILE 1: INVENTORY (CARD IN GRID) */}
            <div className="bg-surface border border-divider rounded-xl shadow-xs flex flex-col h-[750px] overflow-hidden">
              <div className="p-3 border-b border-divider bg-surface-secondary/50 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                    1
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-content-primary uppercase">Inventory Floor Stock</h2>
                    <p className="text-[10px] text-content-muted font-mono">{availablePalletUnits.length} Ready Pallets</p>
                  </div>
                </div>
                <button
                  onClick={() => setTileViewMode('inventory')}
                  className="p-1 rounded text-content-secondary hover:text-content-primary hover:bg-surface border border-divider transition-colors cursor-pointer"
                  title="Maximize Tile 1 to 100% full width"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="p-3 border-b border-divider/60 flex items-center justify-between text-xs bg-slate-50/50">
                <button
                  onClick={handleSelectAllForCustomer}
                  className="px-2 py-1 rounded bg-surface hover:bg-surface-secondary border border-divider text-xs font-semibold text-brand-primary transition-colors cursor-pointer"
                >
                  Select All for Customer
                </button>
                {selectedPalletIds.size > 0 && (
                  <button
                    onClick={() => {
                      setSelectedPalletIds(new Set());
                      setSelectedDispatchCustomer('');
                    }}
                    className="text-xs text-rose-600 hover:underline cursor-pointer"
                  >
                    Clear ({selectedPalletIds.size})
                  </button>
                )}
              </div>

              {/* Scrollable Pallet Cards List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {availablePalletUnits.length === 0 ? (
                  <div className="text-center py-16 text-content-muted">
                    <Boxes className="w-8 h-8 mx-auto mb-1 opacity-50" />
                    <p className="text-xs">No active stock matches criteria.</p>
                  </div>
                ) : (
                  availablePalletUnits.map(({ pallet, entry }) => {
                    const isSelected = selectedPalletIds.has(pallet.id);
                    return (
                      <div
                        key={pallet.id}
                        onClick={() => togglePalletSelection(pallet.id, entry.customer)}
                        className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-brand-primary-soft/60 border-brand-primary shadow-xs ring-1 ring-brand-primary/40'
                            : 'bg-surface border-divider hover:border-brand-primary/40 shadow-xs'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="rounded border-divider text-brand-primary focus:ring-brand-primary"
                            />
                            <span className="font-mono text-xs font-bold text-brand-primary">
                              PLT #{pallet.palletNumber}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-surface-secondary border border-divider text-content-secondary truncate max-w-[80px]">
                            {pallet.model}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] font-mono">
                          <span className="text-content-secondary truncate max-w-[120px]">{entry.customer}</span>
                          <span className="font-bold text-content-primary">{pallet.receivedBatteries || pallet.invoicedBatteries} Units</span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between text-[10px] font-mono text-content-muted">
                          <span>Inv: {entry.customInvoiceNo}</span>
                          <span>{pallet.grossWeightKg} kg</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* TILE 2: MONTHLY LIVE REPORTS (CARD IN GRID) */}
            <div className="bg-surface border border-divider rounded-xl shadow-xs flex flex-col h-[750px] overflow-hidden">
              <div className="p-3 border-b border-divider bg-surface-secondary/50 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold text-xs">
                    2
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-content-primary uppercase">Monthly Live Reports</h2>
                    <p className="text-[10px] text-content-muted font-mono">22-Col Stock &amp; 17-Col Carting</p>
                  </div>
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => exportCFSStockReportXlsx(entries, selectedMonth)}
                    className="p-1 rounded text-emerald-700 hover:bg-surface border border-divider transition-colors cursor-pointer"
                    title="Export 22-Col Stock Report (.xlsx)"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setTileViewMode('reports')}
                    className="p-1 rounded text-content-secondary hover:text-content-primary hover:bg-surface border border-divider transition-colors cursor-pointer"
                    title="Maximize Tile 2 to 100% full width"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Month Selector Pills in Grid */}
              <div className="p-2 border-b border-divider bg-slate-50 flex items-center space-x-1 overflow-x-auto text-[11px] font-mono">
                {CFS_MONTHS.slice(0, 7).map((m) => (
                  <button
                    key={m}
                    onClick={() => setSelectedMonth(m)}
                    className={`px-1.5 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
                      selectedMonth === m
                        ? 'bg-brand-primary text-white font-bold'
                        : 'bg-surface hover:bg-slate-200 text-content-secondary border border-divider'
                    }`}
                  >
                    {m}
                  </button>
                ))}
                <span className="text-content-muted text-[10px]">...</span>
              </div>

              {/* Compact Invoices List Preview */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filteredEntries.length === 0 ? (
                  <div className="text-center py-16 text-content-muted">
                    <FileSpreadsheet className="w-8 h-8 mx-auto mb-1 opacity-50" />
                    <p className="text-xs">No records for selected month.</p>
                  </div>
                ) : (
                  filteredEntries.map((e) => (
                    <div
                      key={e.id}
                      onClick={() => setTileViewMode('reports')}
                      className="p-2.5 rounded-lg border border-divider bg-surface hover:border-brand-primary transition-all cursor-pointer shadow-xs"
                      title="Click to view full 22-column report"
                    >
                      <div className="flex items-center justify-between font-mono text-xs">
                        <span className="font-bold text-brand-primary">{e.customInvoiceNo}</span>
                        <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold">
                          {e.month}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-content-primary font-medium truncate">
                        {e.customer}
                      </div>
                      <div className="mt-1.5 grid grid-cols-3 gap-1 text-[10px] font-mono text-center">
                        <div className="bg-slate-50 p-1 rounded border border-divider/40">
                          <span className="text-content-muted block text-[9px]">REC</span>
                          <strong className="text-emerald-700">{e.actualReceivedPallets}p</strong>
                        </div>
                        <div className="bg-slate-50 p-1 rounded border border-divider/40">
                          <span className="text-content-muted block text-[9px]">STUFF</span>
                          <strong className="text-blue-700">{e.actualStuffedPallets}p</strong>
                        </div>
                        <div className="bg-slate-50 p-1 rounded border border-divider/40">
                          <span className="text-content-muted block text-[9px]">BAL</span>
                          <strong className="text-amber-700">{e.balancePallets}p</strong>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* TILE 3: INVENTORY LOGS (CARD IN GRID) */}
            <div className="bg-surface border border-divider rounded-xl shadow-xs flex flex-col h-[750px] overflow-hidden">
              <div className="p-3 border-b border-divider bg-surface-secondary/50 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs">
                    3
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-content-primary uppercase">Inventory Movement Logs</h2>
                    <p className="text-[10px] text-content-muted font-mono">{filteredMovementRecords.length} Historical Records</p>
                  </div>
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => exportCFSMovementLogsXlsx(filteredMovementRecords)}
                    className="p-1 rounded text-blue-700 hover:bg-surface border border-divider transition-colors cursor-pointer"
                    title="Export Movement Logs (.xlsx)"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setTileViewMode('logs')}
                    className="p-1 rounded text-content-secondary hover:text-content-primary hover:bg-surface border border-divider transition-colors cursor-pointer"
                    title="Maximize Tile 3 to 100% full width"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Quick Direction Toggle */}
              <div className="p-2 border-b border-divider bg-slate-50 flex items-center space-x-1 text-xs font-mono">
                {(['ALL', 'STOCK_OUT', 'STOCK_IN'] as const).map((dir) => (
                  <button
                    key={dir}
                    onClick={() => setLogDirectionFilter(dir)}
                    className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                      logDirectionFilter === dir
                        ? 'bg-brand-primary text-white font-bold'
                        : 'bg-surface hover:bg-slate-200 text-content-secondary border border-divider'
                    }`}
                  >
                    {dir === 'ALL' ? 'All' : dir === 'STOCK_OUT' ? 'Out (Stuffed)' : 'In (Gate)'}
                  </button>
                ))}
              </div>

              {/* Scrollable Movement List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filteredMovementRecords.length === 0 ? (
                  <div className="text-center py-16 text-content-muted">
                    <History className="w-8 h-8 mx-auto mb-1 opacity-50" />
                    <p className="text-xs">No movement records match.</p>
                  </div>
                ) : (
                  filteredMovementRecords.slice(0, 30).map((r) => (
                    <div
                      key={r.id}
                      className="p-2.5 rounded-lg border border-divider bg-surface shadow-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span
                          className={`px-1.5 py-0.2 rounded font-bold text-[10px] ${
                            r.direction === 'STOCK_OUT'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {r.direction === 'STOCK_OUT' ? 'OUT • DISPATCH' : 'IN • GATE-IN'}
                        </span>
                        <span className="text-content-muted text-[10px]">{r.movementDate}</span>
                      </div>
                      <div className="text-xs font-medium text-content-primary truncate">
                        {r.customer}
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-content-secondary">Inv: {r.customInvoiceNo}</span>
                        <strong className="text-content-primary">{r.pallets} Plt / {r.batteries}u</strong>
                      </div>
                      {r.containerNo && r.containerNo !== '-' && (
                        <div className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                          Cont: {r.containerNo} {r.sealNo && r.sealNo !== '-' ? `• Seal: ${r.sealNo}` : ''}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            VIEW MODE B: FOCUSED 100% FULL-WIDTH TILE 1 — INVENTORY
            ===================================================================== */}
        {tileViewMode === 'inventory' && (
          <div className="space-y-4 pb-24">
            {/* Tile 1 Header Strip */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface border border-divider rounded-xl p-3 shadow-xs">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                  1
                </div>
                <div>
                  <h2 className="text-xs font-bold text-content-primary uppercase">
                    Tile 1: Active Warehouse Floor Stock &amp; 20' GP Pallet Picking
                  </h2>
                  <p className="text-[11px] text-content-secondary">
                    {activeStockInvoices.length} active invoices • {availablePalletUnits.length} available pallets on floor
                  </p>
                </div>
              </div>

              {/* Status Filters + Restore Grid Button */}
              <div className="flex items-center space-x-1.5 text-xs font-mono">
                {(['ALL', 'PENDING_GATE_IN', 'IN_WAREHOUSE', 'SHORTFALL'] as const).map((st) => {
                  const labels = {
                    ALL: 'All Active Stock',
                    PENDING_GATE_IN: 'Pending Gate-In',
                    IN_WAREHOUSE: 'In Warehouse Ready',
                    SHORTFALL: 'With Shortfall'
                  };
                  return (
                    <button
                      key={st}
                      onClick={() => setInventoryStatusFilter(st)}
                      className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                        inventoryStatusFilter === st
                          ? 'bg-brand-primary text-white font-bold'
                          : 'bg-surface hover:bg-surface-secondary text-content-secondary border border-divider'
                      }`}
                    >
                      {labels[st]}
                    </button>
                  );
                })}

                <button
                  onClick={() => setTileViewMode('grid')}
                  className="px-2.5 py-1 rounded-md bg-surface-secondary hover:bg-surface border border-divider font-medium text-content-primary flex items-center space-x-1 cursor-pointer ml-2"
                  title="Restore 3-tile grid"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Restore Grid</span>
                </button>
              </div>
            </div>

            {/* Invoice Grouped Stock Position Cards */}
            {activeStockInvoices.length === 0 ? (
              <div className="text-center py-20 bg-surface border border-dashed border-divider rounded-xl p-8">
                <Boxes className="w-10 h-10 text-content-muted mx-auto mb-2 opacity-60" />
                <h3 className="text-xs font-semibold text-content-secondary">No active stock matching selected filters</h3>
                <p className="text-[11px] text-content-muted mt-1">Adjust search or filters above to reveal inventory</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeStockInvoices.map((entry) => {
                  const isExpanded = expandedInventoryInvoiceIds.has(entry.id);
                  const availableUnits = (entry.pallets || []).filter((p) => p.status === 'IN_WAREHOUSE');
                  const allSelected = availableUnits.length > 0 && availableUnits.every((p) => selectedPalletIds.has(p.id));

                  return (
                    <div
                      key={entry.id}
                      className="bg-surface border border-divider rounded-xl overflow-hidden shadow-xs transition-all"
                    >
                      {/* Invoice Summary Header Row */}
                      <div className="p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-surface-secondary/40 border-b border-divider/60">
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={() => {
                              setExpandedInventoryInvoiceIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(entry.id)) next.delete(entry.id);
                                else next.add(entry.id);
                                return next;
                              });
                            }}
                            className="p-1 rounded text-content-muted hover:text-content-primary hover:bg-surface transition-colors cursor-pointer"
                          >
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>

                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-mono text-xs font-bold text-brand-primary">
                                {entry.customInvoiceNo}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                                {entry.month}
                              </span>
                              <span className="text-xs font-medium text-content-primary">
                                {entry.customer}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center space-x-2 text-[11px] font-mono text-content-secondary">
                              <span>POD: <strong className="text-content-primary">{entry.pod || '-'}</strong></span>
                              <span>•</span>
                              <span>Invoiced: <strong className="text-content-primary">{entry.invoicedPallets} Plt</strong></span>
                              <span>•</span>
                              <span>Floor Balance: <strong className="text-amber-700 font-bold">{entry.balancePallets} Plt ({entry.balanceBatteries} Units)</strong></span>
                            </div>
                          </div>
                        </div>

                        {/* Inline Gate-In Controls */}
                        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                          <div className="flex items-center space-x-1 bg-surface border border-divider rounded-md px-2 py-1">
                            <span className="text-[10px] text-content-muted">Rec Plt:</span>
                            <InlineCell
                              value={entry.actualReceivedPallets}
                              type="number"
                              align="right"
                              className="w-10 font-bold text-emerald-700"
                              onChange={(val) => {
                                addOrUpdateCFSEntry({ ...entry, actualReceivedPallets: Number(val) || 0 });
                                reloadEntries();
                              }}
                            />
                          </div>

                          <div className="flex items-center space-x-1 bg-surface border border-divider rounded-md px-2 py-1">
                            <span className="text-[10px] text-content-muted">Carting:</span>
                            <InlineCell
                              value={entry.cartingInDate}
                              align="center"
                              className="w-20"
                              onChange={(val) => {
                                addOrUpdateCFSEntry({ ...entry, cartingInDate: val });
                                reloadEntries();
                              }}
                            />
                          </div>

                          <div className="flex items-center space-x-1 bg-surface border border-divider rounded-md px-2 py-1">
                            <span className="text-[10px] text-content-muted">Truck:</span>
                            <InlineCell
                              value={entry.vehicleNo}
                              className="w-24 uppercase"
                              onChange={(val) => {
                                addOrUpdateCFSEntry({ ...entry, vehicleNo: val.toUpperCase() });
                                reloadEntries();
                              }}
                            />
                          </div>

                          <button
                            onClick={() => handleConfirmFullGateIn(entry.id)}
                            className="px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 font-semibold transition-colors cursor-pointer text-xs"
                            title="Confirm 100% Pallets Received from Factory"
                          >
                            Confirm Full Gate-In
                          </button>

                          {availableUnits.length > 0 && (
                            <button
                              onClick={() => toggleSelectAllForInvoice(entry)}
                              className={`px-2.5 py-1 rounded border text-xs font-semibold transition-colors cursor-pointer ${
                                allSelected
                                  ? 'bg-brand-primary text-white border-brand-primary'
                                  : 'bg-surface hover:bg-surface-secondary text-content-secondary border-divider'
                              }`}
                            >
                              {allSelected ? 'Deselect Invoice' : `Select All (${availableUnits.length}p)`}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expandable Pallet Drawer */}
                      {isExpanded && (
                        <div className="p-3 sm:p-4 bg-surface border-t border-divider">
                          <div className="flex items-center justify-between text-xs mb-2">
                            <span className="font-mono text-content-secondary font-bold text-[11px] uppercase">
                              Individual Pallet Units ({entry.pallets?.length || 0})
                            </span>
                            <span className="text-content-muted text-[10px]">
                              Click any card to select for 20' GP container stuffing
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                            {(entry.pallets || []).map((p) => {
                              const isSelected = selectedPalletIds.has(p.id);
                              const isStuffed = p.status === 'STUFFED_DISPATCHED';
                              const isPending = p.status === 'PENDING_GATE_IN';

                              return (
                                <div
                                  key={p.id}
                                  onClick={() => {
                                    if (isStuffed) return;
                                    togglePalletSelection(p.id, entry.customer);
                                  }}
                                  className={`p-2.5 rounded-lg border text-xs transition-all select-none ${
                                    isStuffed
                                      ? 'bg-slate-100/70 border-slate-200 text-content-muted opacity-60 cursor-not-allowed'
                                      : isSelected
                                      ? 'bg-brand-primary-soft/60 border-brand-primary shadow-xs ring-1 ring-brand-primary/40 cursor-pointer'
                                      : 'bg-surface border-divider hover:border-brand-primary/40 shadow-xs cursor-pointer'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-1.5 font-mono font-bold text-xs">
                                      {!isStuffed && (
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => {}}
                                          className="rounded border-divider text-brand-primary focus:ring-brand-primary"
                                        />
                                      )}
                                      <span className={isStuffed ? 'text-content-muted' : 'text-brand-primary'}>
                                        PLT #{p.palletNumber}
                                      </span>
                                    </div>
                                    <span className="text-[10px] font-mono px-1 rounded bg-surface-secondary border border-divider text-content-secondary truncate max-w-[65px]">
                                      {p.model}
                                    </span>
                                  </div>

                                  <div className="mt-1 flex items-center justify-between text-[11px] font-mono">
                                    <span className="text-content-secondary">STATUS:</span>
                                    <span
                                      className={`font-semibold text-[10px] ${
                                        isStuffed ? 'text-blue-700' : isPending ? 'text-amber-700' : 'text-emerald-700'
                                      }`}
                                    >
                                      {isStuffed ? 'STUFFED' : isPending ? 'PENDING' : 'FLOOR'}
                                    </span>
                                  </div>

                                  <div className="mt-0.5 flex items-center justify-between text-[11px] font-mono">
                                    <span className="text-content-secondary">QTY:</span>
                                    <strong className="text-content-primary">{p.receivedBatteries || p.invoicedBatteries}u</strong>
                                  </div>

                                  <div className="mt-0.5 flex items-center justify-between text-[10px] font-mono text-content-muted">
                                    <span>Gross Wt:</span>
                                    <span>{p.grossWeightKg} kg</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Floating Bottom Docked Action Bar */}
            {selectedPalletsStats.count > 0 && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-surface/95 backdrop-blur border border-divider shadow-2xl rounded-2xl px-5 py-3 flex items-center space-x-6 text-xs animate-slide-up">
                <div className="font-mono tabular-nums space-x-2">
                  <span className="text-content-secondary">Selected:</span>
                  <strong className="text-content-primary">{selectedPalletsStats.count} Pallets</strong>
                  <span className="text-content-muted">•</span>
                  <strong className="text-indigo-600">{selectedPalletsStats.batteries} Units</strong>
                  <span className="text-content-muted">•</span>
                  <strong className="text-slate-700">{selectedPalletsStats.grossKg} kg</strong>
                  <span className="text-content-muted">•</span>
                  <strong className="text-emerald-700">Requires {selectedPalletsStats.required20GP} × 20' GP (Max 22 Plt / 25t)</strong>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleLoadSelectedIntoWorkspace}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
                  >
                    <span>Load into 20' GP &amp; Open Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setShowDispatchModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm Dispatch (Mark Stock-Out)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            VIEW MODE C: FOCUSED 100% FULL-WIDTH TILE 2 — MONTHLY LIVE REPORTS
            ===================================================================== */}
        {tileViewMode === 'reports' && (
          <div className="space-y-3 pb-20">
            {/* Date & Month Filter Bar */}
            <div className="bg-surface border border-divider rounded-xl p-3 shadow-xs space-y-2.5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Left: Report View Toggle & Title */}
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center font-bold text-sm">
                    2
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-content-primary uppercase">
                      Tile 2: Monthly Live Reports
                    </h2>
                    <p className="text-[11px] text-content-secondary">
                      {reportType === 'stock_22' ? '22-Column CFS Stock Report' : '17-Column CFS Carting Gate-In Report'}
                    </p>
                  </div>

                  <div className="bg-surface-secondary border border-divider p-0.5 rounded-lg flex items-center space-x-0.5 text-xs font-semibold ml-2">
                    <button
                      onClick={() => setReportType('stock_22')}
                      className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                        reportType === 'stock_22'
                          ? 'bg-surface text-brand-primary shadow-xs'
                          : 'text-content-secondary hover:text-content-primary'
                      }`}
                    >
                      22-Col Stock Report
                    </button>
                    <button
                      onClick={() => setReportType('carting_17')}
                      className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                        reportType === 'carting_17'
                          ? 'bg-surface text-brand-primary shadow-xs'
                          : 'text-content-secondary hover:text-content-primary'
                      }`}
                    >
                      17-Col Carting Report
                    </button>
                  </div>
                </div>

                {/* Right: Export & Print Buttons + Restore Grid */}
                <div className="flex items-center space-x-2 text-xs">
                  <button
                    onClick={() => exportCFSStockReportXlsx(entries, selectedMonth)}
                    className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary border border-divider font-medium flex items-center space-x-1.5 transition-colors shadow-xs cursor-pointer"
                    title="Export 22-column CFS Stock Report with live formulas"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Export Stock (.xlsx)</span>
                  </button>

                  <button
                    onClick={() => exportCFSCartingReportXlsx(entries)}
                    className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary border border-divider font-medium flex items-center space-x-1.5 transition-colors shadow-xs cursor-pointer"
                    title="Export 17-column CFS Carting Report"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-600" />
                    <span>Export Carting (.xlsx)</span>
                  </button>

                  <button
                    onClick={() => window.print()}
                    className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary border border-divider font-medium flex items-center space-x-1.5 transition-colors shadow-xs cursor-pointer"
                    title="Print active report table"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-700" />
                    <span>Print / PDF</span>
                  </button>

                  <button
                    onClick={() => setTileViewMode('grid')}
                    className="px-2.5 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface border border-divider font-medium text-content-primary flex items-center space-x-1 cursor-pointer ml-1"
                    title="Restore 3-tile grid"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>Restore Grid</span>
                  </button>
                </div>
              </div>

              {/* Fiscal Month Selector Pills & Date Range Filter */}
              <div className="pt-2 border-t border-divider/60 flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs">
                {/* Month Selector Pills */}
                <div className="flex items-center space-x-1 overflow-x-auto pb-1 font-mono text-[11px]">
                  <span className="text-content-secondary font-sans text-xs mr-1 shrink-0 font-medium">Month:</span>
                  {CFS_MONTHS.map((m) => {
                    const isSelected = selectedMonth === m;
                    return (
                      <button
                        key={m}
                        onClick={() => setSelectedMonth(m)}
                        className={`px-2 py-0.5 rounded transition-colors shrink-0 cursor-pointer ${
                          isSelected
                            ? 'bg-brand-primary text-white font-bold shadow-2xs'
                            : 'bg-surface hover:bg-surface-secondary text-content-secondary border border-divider'
                        }`}
                      >
                        {m === 'ALL' ? 'ALL' : m}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Date Range Filter */}
                <div className="flex items-center space-x-1.5 font-mono text-xs">
                  <span className="text-content-secondary font-sans mr-0.5 font-medium">Range:</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="px-2 py-1 bg-surface border border-divider rounded-md text-xs text-content-primary focus:outline-none focus:border-brand-primary"
                    title="From Date"
                  />
                  <span className="text-content-muted">—</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="px-2 py-1 bg-surface border border-divider rounded-md text-xs text-content-primary focus:outline-none focus:border-brand-primary"
                    title="To Date"
                  />
                  {(dateFrom || dateTo) && (
                    <button
                      onClick={() => {
                        setDateFrom('');
                        setDateTo('');
                      }}
                      className="text-xs text-rose-600 hover:underline px-1 cursor-pointer font-sans"
                    >
                      Clear Dates
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Sub-view 1: 22-Column CFS Stock Report */}
            {reportType === 'stock_22' && (
              <div className="bg-surface border border-divider rounded-xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto max-h-[calc(100vh-250px)]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur shadow-2xs">
                      {/* Row 1: Merged Group Headers */}
                      <tr className="text-[10px] uppercase font-mono tracking-wider border-b border-divider text-content-secondary">
                        <th colSpan={2} className="px-3 py-1.5 border-r border-divider text-center">
                          Invoice Identification
                        </th>
                        <th colSpan={2} className="px-3 py-1.5 text-indigo-700 bg-indigo-50/70 border-r border-divider text-center">
                          As Received from EIL-Export
                        </th>
                        <th colSpan={2} className="px-3 py-1.5 text-emerald-700 bg-emerald-50/70 border-r border-divider text-center">
                          Actual Received from Factory
                        </th>
                        <th colSpan={2} className="px-3 py-1.5 text-rose-700 bg-rose-50/70 border-r border-divider text-center">
                          Short Fall (Pending)
                        </th>
                        <th className="px-3 py-1.5 border-r border-divider text-center">
                          Carting Date
                        </th>
                        <th colSpan={2} className="px-3 py-1.5 text-blue-700 bg-blue-50/70 border-r border-divider text-center">
                          Actual Stuffed Qty
                        </th>
                        <th colSpan={2} className="px-3 py-1.5 text-amber-700 bg-amber-50/70 border-r border-divider text-center">
                          Balance Qty (CFS Floor)
                        </th>
                        <th colSpan={2} className="px-3 py-1.5 border-r border-divider text-center">
                          Customs Shipping Bill
                        </th>
                        <th colSpan={2} className="px-3 py-1.5 border-r border-divider text-center">
                          Equipment
                        </th>
                        <th colSpan={3} className="px-3 py-1.5 border-r border-divider text-center">
                          Logistics Dates
                        </th>
                        <th className="px-3 py-1.5 border-r border-divider text-center">
                          CFS Ageing
                        </th>
                        <th className="px-3 py-1.5 text-center">Remarks</th>
                      </tr>

                      {/* Row 2: 22 Column Sub-headers */}
                      <tr className="text-[11px] font-semibold text-content-primary border-b border-divider">
                        <th className="px-3 py-2 border-r border-divider/60">Customer</th>
                        <th className="px-3 py-2 border-r border-divider">Custom Invoice No</th>

                        <th className="px-2 py-2 text-right font-mono bg-indigo-50/30">Pallets</th>
                        <th className="px-2 py-2 text-right font-mono bg-indigo-50/30 border-r border-divider">Batteries</th>

                        <th className="px-2 py-2 text-right font-mono bg-emerald-50/30">Pallets</th>
                        <th className="px-2 py-2 text-right font-mono bg-emerald-50/30 border-r border-divider">Batteries</th>

                        <th className="px-2 py-2 text-right font-mono bg-rose-50/30">Pallets</th>
                        <th className="px-2 py-2 text-right font-mono bg-rose-50/30 border-r border-divider">Batteries</th>

                        <th className="px-2.5 py-2 font-mono border-r border-divider text-center">Carting Date</th>

                        <th className="px-2 py-2 text-right font-mono bg-blue-50/30">Pallets</th>
                        <th className="px-2 py-2 text-right font-mono bg-blue-50/30 border-r border-divider">Batteries</th>

                        <th className="px-2 py-2 text-right font-mono font-bold text-amber-700 bg-amber-50/40">Pallets</th>
                        <th className="px-2 py-2 text-right font-mono font-bold text-amber-700 bg-amber-50/40 border-r border-divider">Batteries</th>

                        <th className="px-2.5 py-2 border-r border-divider/60">SB No.</th>
                        <th className="px-2 py-2 border-r border-divider text-center">Date</th>

                        <th className="px-2.5 py-2 border-r border-divider/60">Container No</th>
                        <th className="px-2 py-2 border-r border-divider">Seal No</th>

                        <th className="px-2 py-2 text-center">Stuffing</th>
                        <th className="px-2 py-2 text-center">Pick-up</th>
                        <th className="px-2 py-2 border-r border-divider text-center">Gate-in</th>

                        <th className="px-2.5 py-2 text-right font-mono border-r border-divider">Days in CFS</th>
                        <th className="px-3 py-2 text-center">Remarks</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-divider/60">
                      {filteredEntries.length === 0 ? (
                        <tr>
                          <td colSpan={22} className="px-4 py-12 text-center text-content-muted">
                            No CFS Stock entries match criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredEntries.map((e) => (
                          <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-3 py-1.5 font-medium text-content-primary border-r border-divider/60 truncate max-w-[130px]">
                              {e.customer}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-brand-primary font-bold border-r border-divider">
                              {e.customInvoiceNo}
                            </td>

                            {/* Invoiced */}
                            <td className="px-2 py-1.5 text-right font-mono bg-indigo-50/20">{e.invoicedPallets}</td>
                            <td className="px-2 py-1.5 text-right font-mono bg-indigo-50/20 border-r border-divider">{e.invoicedBatteries}</td>

                            {/* Received */}
                            <td className="px-1 py-1.5 bg-emerald-50/20">
                              <InlineCell
                                value={e.actualReceivedPallets}
                                align="right"
                                type="number"
                                onChange={(val) => {
                                  addOrUpdateCFSEntry({ ...e, actualReceivedPallets: Number(val) || 0 });
                                  reloadEntries();
                                }}
                              />
                            </td>
                            <td className="px-1 py-1.5 bg-emerald-50/20 border-r border-divider">
                              <InlineCell
                                value={e.actualReceivedBatteries}
                                align="right"
                                type="number"
                                onChange={(val) => {
                                  addOrUpdateCFSEntry({ ...e, actualReceivedBatteries: Number(val) || 0 });
                                  reloadEntries();
                                }}
                              />
                            </td>

                            {/* Shortfall */}
                            <td className={`px-2 py-1.5 text-right font-mono font-bold bg-rose-50/20 ${e.shortfallPallets > 0 ? 'text-rose-600' : 'text-content-muted'}`}>
                              {e.shortfallPallets}
                            </td>
                            <td className={`px-2 py-1.5 text-right font-mono font-bold bg-rose-50/20 border-r border-divider ${e.shortfallBatteries > 0 ? 'text-rose-600' : 'text-content-muted'}`}>
                              {e.shortfallBatteries}
                            </td>

                            {/* Carting Date */}
                            <td className="px-1 py-1.5 border-r border-divider text-center">
                              <InlineCell
                                value={e.cartingInDate}
                                align="center"
                                onChange={(val) => {
                                  addOrUpdateCFSEntry({ ...e, cartingInDate: val });
                                  reloadEntries();
                                }}
                              />
                            </td>

                            {/* Stuffed */}
                            <td className="px-1 py-1.5 bg-blue-50/20">
                              <InlineCell
                                value={e.actualStuffedPallets}
                                align="right"
                                type="number"
                                onChange={(val) => {
                                  addOrUpdateCFSEntry({ ...e, actualStuffedPallets: Number(val) || 0 });
                                  reloadEntries();
                                }}
                              />
                            </td>
                            <td className="px-1 py-1.5 bg-blue-50/20 border-r border-divider">
                              <InlineCell
                                value={e.actualStuffedBatteries}
                                align="right"
                                type="number"
                                onChange={(val) => {
                                  addOrUpdateCFSEntry({ ...e, actualStuffedBatteries: Number(val) || 0 });
                                  reloadEntries();
                                }}
                              />
                            </td>

                            {/* Balance */}
                            <td className="px-2 py-1.5 text-right font-mono font-extrabold text-amber-700 bg-amber-50/30">
                              {e.balancePallets}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono font-extrabold text-amber-700 bg-amber-50/30 border-r border-divider">
                              {e.balanceBatteries}
                            </td>

                            {/* Customs */}
                            <td className="px-1 py-1.5 border-r border-divider/60">
                              <InlineCell
                                value={e.shippingBillNo}
                                onChange={(val) => {
                                  addOrUpdateCFSEntry({ ...e, shippingBillNo: val });
                                  reloadEntries();
                                }}
                              />
                            </td>
                            <td className="px-1 py-1.5 border-r border-divider text-center">
                              <InlineCell
                                value={e.shippingBillDate}
                                align="center"
                                onChange={(val) => {
                                  addOrUpdateCFSEntry({ ...e, shippingBillDate: val });
                                  reloadEntries();
                                }}
                              />
                            </td>

                            {/* Equipment */}
                            <td className="px-1 py-1.5 border-r border-divider/60">
                              <InlineCell
                                value={e.containerNo}
                                className="uppercase font-bold"
                                onChange={(val) => {
                                  addOrUpdateCFSEntry({ ...e, containerNo: val.toUpperCase() });
                                  reloadEntries();
                                }}
                              />
                            </td>
                            <td className="px-1 py-1.5 border-r border-divider">
                              <InlineCell
                                value={e.sealNo}
                                className="uppercase"
                                onChange={(val) => {
                                  addOrUpdateCFSEntry({ ...e, sealNo: val.toUpperCase() });
                                  reloadEntries();
                                }}
                              />
                            </td>

                            {/* Logistics Dates */}
                            <td className="px-1 py-1.5 text-center">
                              <InlineCell
                                value={e.stuffingDate}
                                align="center"
                                onChange={(val) => {
                                  addOrUpdateCFSEntry({ ...e, stuffingDate: val });
                                  reloadEntries();
                                }}
                              />
                            </td>
                            <td className="px-1 py-1.5 text-center">
                              <InlineCell
                                value={e.pickupDate}
                                align="center"
                                onChange={(val) => {
                                  addOrUpdateCFSEntry({ ...e, pickupDate: val });
                                  reloadEntries();
                                }}
                              />
                            </td>
                            <td className="px-1 py-1.5 border-r border-divider text-center">
                              <InlineCell
                                value={e.portGateInDate}
                                align="center"
                                onChange={(val) => {
                                  addOrUpdateCFSEntry({ ...e, portGateInDate: val });
                                  reloadEntries();
                                }}
                              />
                            </td>

                            {/* Days in CFS */}
                            <td className="px-2.5 py-1.5 text-right font-mono border-r border-divider font-semibold">
                              {e.daysInCFS}
                            </td>

                            {/* Remarks */}
                            <td className="px-1 py-1.5">
                              <InlineCell
                                value={e.remarks}
                                onChange={(val) => {
                                  addOrUpdateCFSEntry({ ...e, remarks: val });
                                  reloadEntries();
                                }}
                              />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Sub-view 2: 17-Column CFS Carting Report */}
            {reportType === 'carting_17' && (
              <div className="bg-surface border border-divider rounded-xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto max-h-[calc(100vh-250px)]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur shadow-2xs">
                      <tr className="text-[11px] font-semibold text-content-primary border-b border-divider">
                        <th className="px-3 py-2 border-r border-divider/60">INVOICE NO.</th>
                        <th className="px-3 py-2 border-r border-divider/60">CONSIGNEE</th>
                        <th className="px-3 py-2 border-r border-divider/60">POD</th>
                        <th className="px-2.5 py-2 text-right font-mono border-r border-divider/60">GROSS WEIGHT</th>
                        <th className="px-2.5 py-2 text-right font-mono border-r border-divider/60">TOTAL BATTERIES</th>
                        <th className="px-2.5 py-2 text-right font-mono border-r border-divider/60">Total Pallet Quantity</th>
                        <th className="px-2.5 py-2 text-right font-mono border-r border-divider/60 text-emerald-700">Received pallets</th>
                        <th className="px-2.5 py-2 text-right font-mono border-r border-divider/60 text-rose-700">pending plt qty</th>
                        <th className="px-2 py-2 text-center font-mono border-r border-divider/60">STATUS</th>
                        <th className="px-2.5 py-2 font-mono border-r border-divider/60 text-center">CARTING DATE</th>
                        <th className="px-2.5 py-2 font-mono border-r border-divider/60">VEHICLE NO.</th>
                        <th className="px-2.5 py-2 font-mono border-r border-divider/60 text-center">LAST PLT RECD</th>
                        <th className="px-2.5 py-2 font-mono border-r border-divider/60 text-center">DATE (TRIP 2)</th>
                        <th className="px-2.5 py-2 font-mono border-r border-divider/60">VEHICLE NO (TRIP 2)</th>
                        <th className="px-3 py-2 text-center">ACTIONS</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-divider/60">
                      {filteredEntries.length === 0 ? (
                        <tr>
                          <td colSpan={15} className="px-4 py-12 text-center text-content-muted">
                            No Carting Gate-In entries available.
                          </td>
                        </tr>
                      ) : (
                        filteredEntries.map((e) => {
                          const isExpanded = expandedCartingInvoiceIds.has(e.id);
                          const hasPallets = (e.pallets || []).length > 0;
                          return (
                            <React.Fragment key={e.id}>
                              <tr className="hover:bg-slate-50 transition-colors">
                                <td className="px-3 py-1.5 font-mono text-brand-primary font-bold border-r border-divider/60">
                                  <div className="flex items-center space-x-1.5">
                                    {hasPallets && (
                                      <button
                                        onClick={() => {
                                          setExpandedCartingInvoiceIds((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(e.id)) next.delete(e.id);
                                            else next.add(e.id);
                                            return next;
                                          });
                                        }}
                                        className="text-content-muted hover:text-content-primary cursor-pointer"
                                      >
                                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                      </button>
                                    )}
                                    <span>{e.customInvoiceNo}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-1.5 font-medium text-content-primary border-r border-divider/60 truncate max-w-[130px]">
                                  {e.customer}
                                </td>
                                <td className="px-3 py-1.5 text-content-secondary border-r border-divider/60">
                                  {e.pod || '-'}
                                </td>
                                <td className="px-2.5 py-1.5 text-right font-mono text-content-secondary border-r border-divider/60">
                                  {e.invoicedGrossWeightKg} kg
                                </td>
                                <td className="px-2.5 py-1.5 text-right font-mono text-content-secondary border-r border-divider/60">
                                  {e.invoicedBatteries}
                                </td>
                                <td className="px-2.5 py-1.5 text-right font-mono text-content-secondary border-r border-divider/60">
                                  {e.invoicedPallets}
                                </td>
                                <td className="px-1 py-1.5 border-r border-divider/60 bg-emerald-50/20">
                                  <InlineCell
                                    value={e.actualReceivedPallets}
                                    align="right"
                                    type="number"
                                    onChange={(val) => {
                                      addOrUpdateCFSEntry({ ...e, actualReceivedPallets: Number(val) || 0 });
                                      reloadEntries();
                                    }}
                                  />
                                </td>
                                <td className={`px-2.5 py-1.5 text-right font-mono font-bold border-r border-divider/60 ${e.shortfallPallets > 0 ? 'text-rose-600' : 'text-content-muted'}`}>
                                  {e.shortfallPallets}
                                </td>
                                <td className="px-2 py-1.5 text-center font-mono border-r border-divider/60">
                                  <InlineCell
                                    value={e.gateInStatus || '1'}
                                    align="center"
                                    onChange={(val) => {
                                      addOrUpdateCFSEntry({ ...e, gateInStatus: val });
                                      reloadEntries();
                                    }}
                                  />
                                </td>
                                <td className="px-1 py-1.5 border-r border-divider/60 text-center">
                                  <InlineCell
                                    value={e.cartingInDate}
                                    align="center"
                                    onChange={(val) => {
                                      addOrUpdateCFSEntry({ ...e, cartingInDate: val });
                                      reloadEntries();
                                    }}
                                  />
                                </td>
                                <td className="px-1 py-1.5 border-r border-divider/60">
                                  <InlineCell
                                    value={e.vehicleNo}
                                    onChange={(val) => {
                                      addOrUpdateCFSEntry({ ...e, vehicleNo: val.toUpperCase() });
                                      reloadEntries();
                                    }}
                                  />
                                </td>
                                <td className="px-1 py-1.5 border-r border-divider/60 text-center">
                                  <InlineCell
                                    value={e.lastPltRecdDate}
                                    align="center"
                                    onChange={(val) => {
                                      addOrUpdateCFSEntry({ ...e, lastPltRecdDate: val });
                                      reloadEntries();
                                    }}
                                  />
                                </td>
                                <td className="px-1 py-1.5 border-r border-divider/60 text-center">
                                  <InlineCell
                                    value={e.secondVehicleDate || ''}
                                    align="center"
                                    onChange={(val) => {
                                      addOrUpdateCFSEntry({ ...e, secondVehicleDate: val });
                                      reloadEntries();
                                    }}
                                  />
                                </td>
                                <td className="px-1 py-1.5 border-r border-divider/60">
                                  <InlineCell
                                    value={e.secondVehicleNo || ''}
                                    onChange={(val) => {
                                      addOrUpdateCFSEntry({ ...e, secondVehicleNo: val.toUpperCase() });
                                      reloadEntries();
                                    }}
                                  />
                                </td>
                                <td className="px-3 py-1.5 text-center">
                                  <button
                                    onClick={() => handleConfirmFullGateIn(e.id)}
                                    className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 transition-colors cursor-pointer"
                                    title="Confirm 100% Pallets Received"
                                  >
                                    Confirm Gate-In
                                  </button>
                                </td>
                              </tr>

                              {/* Expandable Pallet Verification Rows */}
                              {isExpanded && hasPallets && (
                                <tr className="bg-surface-secondary/80">
                                  <td colSpan={15} className="p-3 pl-10 border-b border-divider">
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="font-mono text-brand-primary uppercase font-bold text-[11px]">
                                          Pallet Verification Log ({e.pallets.length} Units)
                                        </span>
                                        <span className="text-content-muted text-[10px]">
                                          Click QTY REC to adjust partial deliveries
                                        </span>
                                      </div>

                                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                        {e.pallets.map((p) => {
                                          const isShort = (p.receivedBatteries || 0) < p.invoicedBatteries;
                                          return (
                                            <div
                                              key={p.id}
                                              className={`p-2 rounded-lg border text-xs ${
                                                isShort
                                                  ? 'bg-rose-50/60 border-rose-300'
                                                  : 'bg-surface border-divider'
                                              }`}
                                            >
                                              <div className="flex justify-between font-mono font-bold">
                                                <span className="text-brand-primary">PLT #{p.palletNumber}</span>
                                                <span className="text-[10px] text-content-secondary truncate max-w-[60px]">{p.model}</span>
                                              </div>
                                              <div className="mt-1 flex items-center justify-between text-[11px] font-mono">
                                                <span className="text-content-secondary">ACTUAL:</span>
                                                <span className="text-content-primary font-semibold">{p.invoicedBatteries}</span>
                                              </div>
                                              <div className="mt-0.5 flex items-center justify-between text-[11px] font-mono">
                                                <span className="text-content-secondary">QTY REC:</span>
                                                <InlineCell
                                                  value={p.receivedBatteries}
                                                  type="number"
                                                  align="right"
                                                  className="w-14 font-bold text-emerald-700"
                                                  onChange={(val) => {
                                                    const v = parseInt(val, 10) || 0;
                                                    updatePalletReceivedQuantity(e.id, p.id, v);
                                                    reloadEntries();
                                                  }}
                                                />
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            VIEW MODE D: FOCUSED 100% FULL-WIDTH TILE 3 — INVENTORY LOGS
            ===================================================================== */}
        {tileViewMode === 'logs' && (
          <div className="space-y-4 pb-20">
            {/* Tile 3 Header & Filter Strip */}
            <div className="bg-surface border border-divider rounded-xl p-3 sm:p-4 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-sm">
                    3
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-content-primary uppercase">
                      Tile 3: Outgoing Stock History &amp; Customer-Wise Movement Ledger
                    </h2>
                    <p className="text-[11px] text-content-secondary">
                      Chronological audit trail of outgoing dispatches (Stock-Out) and factory receipts (Stock-In)
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => exportCFSMovementLogsXlsx(filteredMovementRecords)}
                    className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary border border-divider text-xs font-medium flex items-center space-x-1.5 transition-colors shadow-xs cursor-pointer"
                    title="Export movement logs to Excel"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-600" />
                    <span>Export Movement Logs (.xlsx)</span>
                  </button>

                  <button
                    onClick={() => setTileViewMode('grid')}
                    className="px-2.5 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface border border-divider font-medium text-content-primary text-xs flex items-center space-x-1 cursor-pointer"
                    title="Restore 3-tile grid"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>Restore Grid</span>
                  </button>
                </div>
              </div>

              {/* Customer-Wise Outgoing Summary Strip */}
              <div className="pt-2 border-t border-divider/60">
                <div className="text-[10px] uppercase font-mono tracking-wider text-content-secondary font-bold mb-1.5">
                  Customer Outgoing Dispatched Summary (Stock-Out):
                </div>
                <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs font-mono tabular-nums">
                  {customerOutgoingSummaries.length === 0 ? (
                    <span className="text-content-muted text-xs italic">No outgoing dispatches recorded yet.</span>
                  ) : (
                    customerOutgoingSummaries.map((s) => (
                      <div
                        key={s.customer}
                        className="px-3 py-1.5 rounded-lg bg-surface-secondary/70 border border-divider text-xs shrink-0 flex items-center space-x-2 shadow-2xs"
                      >
                        <span className="font-sans font-semibold text-content-primary">{s.customer}:</span>
                        <span className="font-bold text-emerald-700">{s.pallets} Plt</span>
                        <span className="text-content-muted">•</span>
                        <span className="text-indigo-700">{s.batteries.toLocaleString()}u</span>
                        <span className="text-content-muted">•</span>
                        <span className="text-blue-700">{s.containersCount} Cont</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Log Filter Controls */}
              <div className="pt-2 border-t border-divider/60 flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs font-mono">
                <div className="flex items-center space-x-1.5">
                  <span className="text-content-secondary font-sans mr-1 font-medium">Movement:</span>
                  {(['ALL', 'STOCK_OUT', 'STOCK_IN'] as const).map((dir) => (
                    <button
                      key={dir}
                      onClick={() => setLogDirectionFilter(dir)}
                      className={`px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                        logDirectionFilter === dir
                          ? 'bg-brand-primary text-white font-bold'
                          : 'bg-surface hover:bg-surface-secondary text-content-secondary border border-divider'
                      }`}
                    >
                      {dir === 'ALL' ? 'All Movements' : dir === 'STOCK_OUT' ? 'Outgoing (Stock-Out) Only' : 'Incoming (Gate-In) Only'}
                    </button>
                  ))}
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-content-secondary font-sans font-medium">Date Range:</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="px-2 py-0.5 bg-surface border border-divider rounded text-xs text-content-primary focus:outline-none"
                    title="From Date"
                  />
                  <span>—</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="px-2 py-0.5 bg-surface border border-divider rounded text-xs text-content-primary focus:outline-none"
                    title="To Date"
                  />
                  {(dateFrom || dateTo) && (
                    <button
                      onClick={() => {
                        setDateFrom('');
                        setDateTo('');
                      }}
                      className="text-xs text-rose-600 hover:underline px-1 font-sans cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Chronological Movement Ledger Table */}
            <div className="bg-surface border border-divider rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto max-h-[calc(100vh-270px)]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur shadow-2xs">
                    <tr className="text-[11px] font-semibold text-content-primary border-b border-divider">
                      <th className="px-3 py-2 border-r border-divider/60 font-mono text-center">Movement Date</th>
                      <th className="px-3 py-2 border-r border-divider/60 text-center">Direction Badge</th>
                      <th className="px-3 py-2 border-r border-divider/60">Customer / Consignee</th>
                      <th className="px-3 py-2 border-r border-divider/60 font-mono">Custom Invoice No</th>
                      <th className="px-3 py-2 border-r border-divider/60">Model / Description</th>
                      <th className="px-2.5 py-2 text-right font-mono border-r border-divider/60">Pallets</th>
                      <th className="px-2.5 py-2 text-right font-mono border-r border-divider/60">Batteries</th>
                      <th className="px-2.5 py-2 text-right font-mono border-r border-divider/60">Gross Weight</th>
                      <th className="px-2.5 py-2 font-mono border-r border-divider/60">Container No</th>
                      <th className="px-2.5 py-2 font-mono border-r border-divider/60">Seal No</th>
                      <th className="px-2.5 py-2 font-mono border-r border-divider/60">Shipping Bill</th>
                      <th className="px-2.5 py-2 font-mono border-r border-divider/60">Vehicle / Truck</th>
                      <th className="px-2.5 py-2 text-right font-mono border-r border-divider/60">Remaining Balance</th>
                      <th className="px-3 py-2">Remarks</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-divider/60">
                    {filteredMovementRecords.length === 0 ? (
                      <tr>
                        <td colSpan={14} className="px-4 py-16 text-center text-content-muted">
                          No inventory movement records match criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredMovementRecords.map((r) => {
                        const isOut = r.direction === 'STOCK_OUT';
                        return (
                          <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-3 py-2 font-mono text-center text-content-primary border-r border-divider/60">
                              {r.movementDate}
                            </td>
                            <td className="px-3 py-2 text-center border-r border-divider/60">
                              <span
                                className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                                  isOut
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                                    : 'bg-amber-50 text-amber-800 border border-amber-300'
                                }`}
                              >
                                {isOut ? 'STOCK-OUT • DISPATCHED' : 'STOCK-IN • GATE RECEIPT'}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-medium text-content-primary border-r border-divider/60 truncate max-w-[140px]">
                              {r.customer}
                            </td>
                            <td className="px-3 py-2 font-mono font-bold text-brand-primary border-r border-divider/60">
                              {r.customInvoiceNo}
                            </td>
                            <td className="px-3 py-2 text-content-secondary border-r border-divider/60 truncate max-w-[150px]">
                              {r.modelDescription}
                            </td>
                            <td className="px-2.5 py-2 text-right font-mono font-bold border-r border-divider/60">
                              <span className={isOut ? 'text-emerald-700' : 'text-blue-700'}>{r.pallets} Plt</span>
                            </td>
                            <td className="px-2.5 py-2 text-right font-mono border-r border-divider/60">
                              {r.batteries.toLocaleString()}u
                            </td>
                            <td className="px-2.5 py-2 text-right font-mono text-content-secondary border-r border-divider/60">
                              {r.grossWeightKg ? `${r.grossWeightKg.toLocaleString()} kg` : '-'}
                            </td>
                            <td className="px-2.5 py-2 font-mono font-semibold text-content-primary border-r border-divider/60">
                              {r.containerNo && r.containerNo !== '-' ? (
                                <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  {r.containerNo}
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-2.5 py-2 font-mono text-content-secondary border-r border-divider/60">
                              {r.sealNo || '-'}
                            </td>
                            <td className="px-2.5 py-2 font-mono text-content-secondary border-r border-divider/60">
                              {r.shippingBillNo && r.shippingBillNo !== '-' ? (
                                <span>{r.shippingBillNo} {r.shippingBillDate && r.shippingBillDate !== '-' ? `(${r.shippingBillDate})` : ''}</span>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-2.5 py-2 font-mono text-content-secondary border-r border-divider/60">
                              {r.vehicleNo || '-'}
                            </td>
                            <td className="px-2.5 py-2 text-right font-mono font-bold text-amber-700 border-r border-divider/60">
                              {r.remainingBalancePallets} Plt ({r.remainingBalanceBatteries}u)
                            </td>
                            <td className="px-3 py-2 text-content-muted text-[11px] truncate max-w-[120px]">
                              {r.remarks || '-'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stuffing & Dispatch Modal */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-divider rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-divider">
              <div className="flex items-center space-x-2 text-sm font-bold text-content-primary">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Confirm Stuffing &amp; Stock-Out Dispatch</span>
              </div>
              <button
                onClick={() => setShowDispatchModal(false)}
                className="text-content-muted hover:text-content-primary cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-content-secondary leading-relaxed">
              Deduct <strong className="font-mono text-content-primary font-bold">{selectedPalletsStats.count} pallets</strong> ({selectedPalletsStats.batteries} batteries) from CFS floor balance for <strong className="text-content-primary">{selectedDispatchCustomer}</strong>.
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-content-secondary mb-1">Container Number *</label>
                <input
                  type="text"
                  value={dispatchDetails.containerNo}
                  onChange={(e) => setDispatchDetails({ ...dispatchDetails, containerNo: e.target.value.toUpperCase() })}
                  placeholder="e.g. MSKU1234567"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-input-bg border border-divider text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div>
                <label className="block text-content-secondary mb-1">Seal Number *</label>
                <input
                  type="text"
                  value={dispatchDetails.sealNo}
                  onChange={(e) => setDispatchDetails({ ...dispatchDetails, sealNo: e.target.value.toUpperCase() })}
                  placeholder="e.g. SL987654"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-input-bg border border-divider text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div>
                <label className="block text-content-secondary mb-1">Shipping Bill No.</label>
                <input
                  type="text"
                  value={dispatchDetails.shippingBillNo}
                  onChange={(e) => setDispatchDetails({ ...dispatchDetails, shippingBillNo: e.target.value })}
                  placeholder="e.g. 5622160"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-input-bg border border-divider text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div>
                <label className="block text-content-secondary mb-1">Shipping Bill Date</label>
                <input
                  type="text"
                  value={dispatchDetails.shippingBillDate}
                  onChange={(e) => setDispatchDetails({ ...dispatchDetails, shippingBillDate: e.target.value })}
                  placeholder="DD.MM.YYYY"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-input-bg border border-divider text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div>
                <label className="block text-content-secondary mb-1">Stuffing Date</label>
                <input
                  type="text"
                  value={dispatchDetails.stuffingDate}
                  onChange={(e) => setDispatchDetails({ ...dispatchDetails, stuffingDate: e.target.value })}
                  placeholder="DD.MM.YYYY"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-input-bg border border-divider text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div>
                <label className="block text-content-secondary mb-1">Port Gate-in Date</label>
                <input
                  type="text"
                  value={dispatchDetails.portGateInDate}
                  onChange={(e) => setDispatchDetails({ ...dispatchDetails, portGateInDate: e.target.value })}
                  placeholder="DD.MM.YYYY"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-input-bg border border-divider text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-divider">
              <button
                onClick={() => setShowDispatchModal(false)}
                className="px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary border border-divider text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteDispatch}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                Confirm Dispatch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
