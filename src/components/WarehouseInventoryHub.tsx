import React, { useState, useMemo, useRef } from 'react';
import {
  Boxes,
  Truck,
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  ArrowRight,
  Search,
  Filter,
  Check,
  ChevronDown,
  ChevronRight,
  Calendar,
  X
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
  formatToDDMMYYYY
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

  if (isEditing) {
    return (
      <input
        type={type}
        autoFocus
        value={tempVal}
        onChange={(e) => setTempVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setIsEditing(false);
          }
        }}
        className={`w-full px-1 py-0.5 text-xs font-mono bg-white border border-brand-primary rounded focus:outline-none focus:ring-1 focus:ring-brand-primary ${
          align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
        } ${className}`}
      />
    );
  }

  const isBlank = value === '' || value === null || value === undefined || value === '-';

  return (
    <div
      onClick={handleStartEdit}
      title="Click to edit"
      className={`cursor-pointer px-1 py-0.5 rounded hover:bg-slate-200/60 transition-colors font-mono tabular-nums truncate ${
        isBlank ? 'text-content-muted italic' : 'text-content-primary'
      } ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'} ${className}`}
    >
      {isBlank ? '-' : value}
    </div>
  );
}

export function WarehouseInventoryHub({
  onLoadShipmentIntoWorkspace,
  onNavigateToWorkspace,
  activeShipmentJson: _activeShipmentJson
}: WarehouseInventoryHubProps): React.JSX.Element {
  const [entries, setEntries] = useState<CFSLedgerEntry[]>(() => getCFSLedgerEntries());
  const [activeTab, setActiveTab] = useState<'pick_dispatch' | 'stock_report' | 'carting_report'>('stock_report');
  const [selectedMonth, setSelectedMonth] = useState<CFSMonth>('ALL');
  const [customerFilter, setCustomerFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'READY' | 'LOW_STOCK' | 'SHORTFALL' | 'DONE'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected pallets in Tab A (Pick & Dispatch)
  const [selectedPalletIds, setSelectedPalletIds] = useState<Set<string>>(new Set());
  const [selectedDispatchCustomer, setSelectedDispatchCustomer] = useState<string>('');

  // Stuffing & Dispatch Modal State
  const [showDispatchModal, setShowDispatchModal] = useState(false);
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

  // Expandable rows in Carting Report
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<string>>(new Set());

  // File import ref
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const reloadEntries = () => {
    const loaded = getCFSLedgerEntries();
    setEntries(loaded);
  };

  // Unique customers list
  const uniqueCustomers = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.customer?.trim()) set.add(e.customer.trim());
    });
    return Array.from(set).sort();
  }, [entries]);

  // Top KPIs
  const kpis = useMemo(() => {
    const totalBalancePallets = entries.reduce((s, e) => s + (e.balancePallets || 0), 0);
    const totalBalanceBatteries = entries.reduce((s, e) => s + (e.balanceBatteries || 0), 0);
    const totalShortfallPallets = entries.reduce((s, e) => s + (e.shortfallPallets || 0), 0);
    const totalShortfallBatteries = entries.reduce((s, e) => s + (e.shortfallBatteries || 0), 0);
    const totalStuffedPallets = entries.reduce((s, e) => s + (e.actualStuffedPallets || 0), 0);
    const total20GPLoads = Math.ceil(totalBalancePallets / 22);

    return {
      totalBalancePallets,
      totalBalanceBatteries,
      totalShortfallPallets,
      totalShortfallBatteries,
      totalStuffedPallets,
      total20GPLoads
    };
  }, [entries]);

  // Filtered entries for Stock & Carting tables
  const filteredEntries = useMemo(() => {
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
        if (statusFilter === 'DONE' && !(e.balancePallets === 0 && e.actualStuffedPallets > 0)) return false;
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
  }, [entries, selectedMonth, customerFilter, statusFilter, searchQuery]);

  // Available pallets for Tab A (Pick & Dispatch)
  const availablePallets = useMemo(() => {
    const list: { pallet: PalletStockUnit; entry: CFSLedgerEntry }[] = [];
    entries.forEach((e) => {
      if (customerFilter !== 'ALL' && e.customer?.trim().toUpperCase() !== customerFilter.toUpperCase()) {
        return;
      }
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
  }, [entries, customerFilter, selectedDispatchCustomer]);

  // Stats for selected pallets
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

  // Quick Select All for Customer in Pick & Dispatch
  const handleSelectAllForCustomer = () => {
    if (availablePallets.length === 0) return;
    const targetCust = customerFilter !== 'ALL' ? customerFilter : availablePallets[0].entry.customer;
    const matching = availablePallets.filter((item) => item.entry.customer === targetCust);
    const next = new Set<string>();
    matching.forEach((item) => next.add(item.pallet.id));
    setSelectedPalletIds(next);
    setSelectedDispatchCustomer(targetCust);
  };

  // Action: Load into 20' GP & Generate Docs
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
    showToast(`Loaded ${selectedPalletsStats.count} pallets (${selectedPalletsStats.required20GP} x 20' GP) into Workspace!`);
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
      showToast(`Confirmed Gate-In for ${updated.customInvoiceNo}!`);
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
          UNIFIED COMPACT TOP CONTROL HEADER (Single Row matching WorkspacePage.tsx)
          ========================================================================= */}
      <header className="h-14 px-4 sm:px-6 border-b border-divider bg-surface flex items-center justify-between shrink-0 z-20 shadow-xs">
        {/* Left: Title + Inline Compact KPI Badges */}
        <div className="flex items-center space-x-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-brand-primary flex items-center justify-center text-white shadow-xs">
            <Boxes className="w-4 h-4" />
          </div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xs font-bold text-content-primary tracking-wide uppercase">
              CFS Warehouse Ledger
            </h1>
            <div className="hidden lg:flex items-center space-x-1.5 font-mono text-[11px] tabular-nums">
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold" title="Live Available Balance in CFS">
                Balance: {kpis.totalBalancePallets} Plt / {kpis.totalBalanceBatteries} Units • {kpis.total20GPLoads} × 20' GP
              </span>
              <span className={`px-2 py-0.5 rounded border font-semibold ${kpis.totalShortfallPallets > 0 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`} title="Pending Factory Receipt">
                Shortfall: {kpis.totalShortfallPallets} Plt
              </span>
              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold" title="Stuffed & Dispatched">
                Stuffed: {kpis.totalStuffedPallets} Plt
              </span>
            </div>
          </div>
        </div>

        {/* Right: Segmented Tab Switcher + Action Buttons */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Segmented Tab Switcher */}
          <div className="bg-surface-secondary border border-divider p-0.5 rounded-lg flex items-center space-x-0.5 text-xs font-medium">
            <button
              onClick={() => setActiveTab('pick_dispatch')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                activeTab === 'pick_dispatch'
                  ? 'bg-surface text-brand-primary font-bold shadow-xs'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              Pick &amp; Dispatch ({availablePallets.length}p)
            </button>
            <button
              onClick={() => setActiveTab('stock_report')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                activeTab === 'stock_report'
                  ? 'bg-surface text-brand-primary font-bold shadow-xs'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              Monthly Stock (22-Col)
            </button>
            <button
              onClick={() => setActiveTab('carting_report')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                activeTab === 'carting_report'
                  ? 'bg-surface text-brand-primary font-bold shadow-xs'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              Carting Log (17-Col)
            </button>
          </div>

          {/* Action Buttons */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary border border-divider text-xs font-medium flex items-center space-x-1.5 transition-colors shadow-xs"
            title="Import historical CFS Excel"
          >
            <Upload className="w-3.5 h-3.5 text-brand-primary" />
            <span className="hidden xl:inline">Import .xlsx</span>
          </button>

          <button
            onClick={() => exportCFSStockReportXlsx(entries, selectedMonth)}
            className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary border border-divider text-xs font-medium flex items-center space-x-1.5 transition-colors shadow-xs"
            title="Export 22-column CFS Stock Report with live formulas"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden xl:inline">Export Stock</span>
          </button>

          <button
            onClick={() => exportCFSCartingReportXlsx(entries)}
            className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary border border-divider text-xs font-medium flex items-center space-x-1.5 transition-colors shadow-xs"
            title="Export 17-column CFS Carting Report"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden xl:inline">Export Carting</span>
          </button>

          <button
            onClick={onNavigateToWorkspace}
            className="px-3 py-1.5 rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-semibold flex items-center space-x-1 shadow-xs transition-colors"
          >
            <span>Workspace</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* =========================================================================
          SLIM UNIFIED FILTER BAR (Search + Customer + Month + Status Pills)
          ========================================================================= */}
      <div className="h-11 px-4 sm:px-6 border-b border-divider bg-surface-secondary/70 flex items-center justify-between shrink-0 text-xs">
        {/* Left: Search & Dropdowns */}
        <div className="flex items-center space-x-2.5">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-content-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search invoice, customer, container..."
              className="pl-8 pr-3 py-1 bg-surface border border-divider rounded-md text-xs text-content-primary placeholder-content-muted focus:outline-none focus:border-brand-primary w-48 font-sans"
            />
          </div>

          {/* Customer Dropdown */}
          <div className="flex items-center space-x-1 bg-surface border border-divider rounded-md px-2 py-1">
            <Filter className="w-3 h-3 text-brand-primary" />
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="bg-transparent text-xs text-content-primary focus:outline-none cursor-pointer max-w-[130px] truncate"
            >
              <option value="ALL">All Customers</option>
              {uniqueCustomers.map((c) => (
                <option key={c} value={c} className="truncate">
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Month Dropdown (visible in Stock Report) */}
          {activeTab === 'stock_report' && (
            <div className="flex items-center space-x-1 bg-surface border border-divider rounded-md px-2 py-1 font-mono">
              <Calendar className="w-3 h-3 text-brand-primary" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value as CFSMonth)}
                className="bg-transparent text-xs text-content-primary focus:outline-none cursor-pointer"
              >
                {CFS_MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m === 'ALL' ? 'All Months' : m}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Right: Operational Status Filter Pills */}
        <div className="flex items-center space-x-1.5 font-mono text-[11px]">
          {(['ALL', 'READY', 'LOW_STOCK', 'SHORTFALL', 'DONE'] as const).map((st) => {
            const labels = {
              ALL: 'All',
              READY: 'Ready in CFS',
              LOW_STOCK: 'Low Stock (<22p)',
              SHORTFALL: 'Shortfall',
              DONE: 'Done'
            };
            const isSelected = statusFilter === st;
            return (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-brand-primary text-white font-bold shadow-2xs'
                    : 'bg-surface hover:bg-surface-secondary text-content-secondary border border-divider'
                }`}
              >
                {labels[st]}
              </button>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
          MAIN BODY (Tab A, Tab B, or Tab C)
          ========================================================================= */}
      <div className="flex-1 overflow-auto p-4 sm:p-6 relative">
        {/* =====================================================================
            TAB A: PICK & DISPATCH POOL (Pallet-Level Stock Units)
            ===================================================================== */}
        {activeTab === 'pick_dispatch' && (
          <div className="space-y-4 pb-20">
            {/* Quick Action & Counter Strip */}
            <div className="flex items-center justify-between bg-surface border border-divider rounded-xl p-3 shadow-xs">
              <div className="flex items-center space-x-3 text-xs">
                <button
                  onClick={handleSelectAllForCustomer}
                  className="px-2.5 py-1 rounded bg-surface-secondary hover:bg-surface border border-divider font-medium text-content-primary transition-colors flex items-center space-x-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 text-brand-primary" />
                  <span>Select All Available for Customer</span>
                </button>
                {selectedPalletIds.size > 0 && (
                  <button
                    onClick={() => {
                      setSelectedPalletIds(new Set());
                      setSelectedDispatchCustomer('');
                    }}
                    className="text-xs text-content-muted hover:text-state-error flex items-center space-x-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                )}
              </div>

              <div className="text-xs font-mono tabular-nums text-content-secondary">
                Available on Floor: <strong className="text-content-primary">{availablePallets.length} Pallets</strong>
              </div>
            </div>

            {/* Pallet Cards Grid */}
            {availablePallets.length === 0 ? (
              <div className="text-center py-16 bg-surface border border-dashed border-divider rounded-xl p-8">
                <Boxes className="w-10 h-10 text-content-muted mx-auto mb-2" />
                <h3 className="text-xs font-semibold text-content-secondary">No pallets currently on warehouse floor</h3>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {availablePallets.map(({ pallet, entry }) => {
                  const isSelected = selectedPalletIds.has(pallet.id);
                  return (
                    <div
                      key={pallet.id}
                      onClick={() => togglePalletSelection(pallet.id, entry.customer)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer select-none ${
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
                            onChange={() => {}} // handled by parent onClick
                            className="rounded border-divider text-brand-primary focus:ring-brand-primary cursor-pointer"
                          />
                          <span className="font-mono text-xs font-bold text-brand-primary">
                            PLT #{pallet.palletNumber}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface-secondary border border-divider text-content-secondary truncate max-w-[90px]">
                          {pallet.model}
                        </span>
                      </div>

                      {/* Brand & Invoice Pills */}
                      <div className="flex items-center space-x-1 mt-1.5">
                        {pallet.brand && (
                          <span className="text-[9.5px] font-mono px-1 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 truncate max-w-[80px]">
                            {pallet.brand}
                          </span>
                        )}
                        <span className="text-[9.5px] font-mono px-1 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 truncate max-w-[90px]">
                          {entry.customInvoiceNo}
                        </span>
                      </div>

                      {/* Pallet Metrics */}
                      <div className="mt-2 space-y-0.5 text-xs font-mono tabular-nums">
                        <div className="flex justify-between text-content-secondary text-[11px]">
                          <span>Customer:</span>
                          <span className="font-semibold text-content-primary truncate max-w-[100px]">{entry.customer}</span>
                        </div>
                        <div className="flex justify-between text-content-secondary text-[11px]">
                          <span>Quantity:</span>
                          <span className="font-bold text-content-primary">{pallet.receivedBatteries || pallet.invoicedBatteries} Units</span>
                        </div>
                        <div className="flex justify-between text-content-secondary text-[11px]">
                          <span>Gross Weight:</span>
                          <span>{pallet.grossWeightKg} kg</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Floating Bottom-Docked Action Bar */}
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
                  <strong className="text-emerald-700">Requires {selectedPalletsStats.required20GP} × 20' GP</strong>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleLoadSelectedIntoWorkspace}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
                  >
                    <span>Load into 20' GP &amp; Generate Docs</span>
                  </button>

                  <button
                    onClick={() => setShowDispatchModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm Dispatch (Stock-Out)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            TAB B: CFS MONTHLY STOCK REPORT (22 Columns)
            ===================================================================== */}
        {activeTab === 'stock_report' && (
          <div className="bg-surface border border-divider rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto max-h-[calc(100vh-210px)]">
              <table className="w-full text-left text-xs border-collapse">
                {/* 2-Row Grouped Header */}
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
                    <th className="px-3 py-1.5 text-center">Remarks &amp; Actions</th>
                  </tr>

                  {/* Row 2: 22 Column Sub-headers */}
                  <tr className="text-[11px] font-semibold text-content-primary border-b border-divider">
                    <th className="px-3 py-2 border-r border-divider/60">Customer</th>
                    <th className="px-3 py-2 border-r border-divider">Custom Invoice No</th>

                    {/* Invoiced */}
                    <th className="px-2 py-2 text-right font-mono bg-indigo-50/30">Pallets</th>
                    <th className="px-2 py-2 text-right font-mono bg-indigo-50/30 border-r border-divider">Batteries</th>

                    {/* Received */}
                    <th className="px-2 py-2 text-right font-mono bg-emerald-50/30">Pallets</th>
                    <th className="px-2 py-2 text-right font-mono bg-emerald-50/30 border-r border-divider">Batteries</th>

                    {/* Shortfall */}
                    <th className="px-2 py-2 text-right font-mono bg-rose-50/30">Pallets</th>
                    <th className="px-2 py-2 text-right font-mono bg-rose-50/30 border-r border-divider">Batteries</th>

                    {/* Carting Date */}
                    <th className="px-2.5 py-2 font-mono border-r border-divider text-center">Carting Date</th>

                    {/* Stuffed */}
                    <th className="px-2 py-2 text-right font-mono bg-blue-50/30">Pallets</th>
                    <th className="px-2 py-2 text-right font-mono bg-blue-50/30 border-r border-divider">Batteries</th>

                    {/* Balance */}
                    <th className="px-2 py-2 text-right font-mono font-bold text-amber-700 bg-amber-50/40">Pallets</th>
                    <th className="px-2 py-2 text-right font-mono font-bold text-amber-700 bg-amber-50/40 border-r border-divider">Batteries</th>

                    {/* Customs */}
                    <th className="px-2.5 py-2 border-r border-divider/60">SB No.</th>
                    <th className="px-2 py-2 border-r border-divider text-center">Date</th>

                    {/* Equipment */}
                    <th className="px-2.5 py-2 border-r border-divider/60">Container No</th>
                    <th className="px-2 py-2 border-r border-divider">Seal No</th>

                    {/* Dates */}
                    <th className="px-2 py-2 text-center">Stuffing</th>
                    <th className="px-2 py-2 text-center">Pick-up</th>
                    <th className="px-2 py-2 border-r border-divider text-center">Gate-in</th>

                    {/* Days in CFS */}
                    <th className="px-2.5 py-2 text-right font-mono border-r border-divider">Days in CFS</th>

                    {/* Remarks & Action */}
                    <th className="px-3 py-2 text-center">Remarks</th>
                  </tr>
                </thead>

                {/* Table Body */}
                <tbody className="divide-y divide-divider/60">
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={22} className="px-4 py-12 text-center text-content-muted">
                        No CFS Stock entries match criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map((e) => {
                      const hasShortfall = e.shortfallPallets > 0 || e.shortfallBatteries > 0;
                      return (
                        <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-1.5 font-medium text-content-primary border-r border-divider/60 truncate max-w-[130px]">
                            {e.customer}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-brand-primary font-semibold border-r border-divider">
                            {e.customInvoiceNo}
                          </td>

                          {/* Invoiced */}
                          <td className="px-2 py-1.5 text-right font-mono text-content-secondary bg-indigo-50/15">
                            {e.invoicedPallets}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-content-secondary bg-indigo-50/15 border-r border-divider">
                            {e.invoicedBatteries}
                          </td>

                          {/* Received (Inline editable) */}
                          <td className="px-1 py-1.5 bg-emerald-50/15">
                            <InlineCell
                              value={e.actualReceivedPallets}
                              align="right"
                              type="number"
                              onChange={(val) => {
                                addOrUpdateCFSEntry({
                                  ...e,
                                  actualReceivedPallets: Number(val) || 0
                                });
                                reloadEntries();
                              }}
                            />
                          </td>
                          <td className="px-1 py-1.5 bg-emerald-50/15 border-r border-divider">
                            <InlineCell
                              value={e.actualReceivedBatteries}
                              align="right"
                              type="number"
                              onChange={(val) => {
                                addOrUpdateCFSEntry({
                                  ...e,
                                  actualReceivedBatteries: Number(val) || 0
                                });
                                reloadEntries();
                              }}
                            />
                          </td>

                          {/* Shortfall (Auto-derived) */}
                          <td className={`px-2 py-1.5 text-right font-mono font-bold bg-rose-50/15 ${hasShortfall ? 'text-rose-600' : 'text-content-muted'}`}>
                            {e.shortfallPallets}
                          </td>
                          <td className={`px-2 py-1.5 text-right font-mono font-bold bg-rose-50/15 border-r border-divider ${hasShortfall ? 'text-rose-600' : 'text-content-muted'}`}>
                            {e.shortfallBatteries}
                          </td>

                          {/* Carting Date (Inline editable) */}
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
                          <td className="px-2 py-1.5 text-right font-mono text-blue-700 bg-blue-50/15">
                            {e.actualStuffedPallets}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-blue-700 bg-blue-50/15 border-r border-divider">
                            {e.actualStuffedBatteries}
                          </td>

                          {/* Balance (CFS Floor) */}
                          <td className="px-2 py-1.5 text-right font-mono font-bold text-amber-700 bg-amber-50/30">
                            {e.balancePallets}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono font-bold text-amber-700 bg-amber-50/30 border-r border-divider">
                            {e.balanceBatteries}
                          </td>

                          {/* Customs (Inline editable) */}
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

                          {/* Equipment (Inline editable) */}
                          <td className="px-1 py-1.5 border-r border-divider/60">
                            <InlineCell
                              value={e.containerNo}
                              onChange={(val) => {
                                addOrUpdateCFSEntry({ ...e, containerNo: val.toUpperCase() });
                                reloadEntries();
                              }}
                            />
                          </td>
                          <td className="px-1 py-1.5 border-r border-divider">
                            <InlineCell
                              value={e.sealNo}
                              onChange={(val) => {
                                addOrUpdateCFSEntry({ ...e, sealNo: val.toUpperCase() });
                                reloadEntries();
                              }}
                            />
                          </td>

                          {/* Dates (Inline editable) */}
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
                          <td className="px-2 py-1.5 text-right font-mono font-bold text-indigo-700 border-r border-divider">
                            {e.daysInCFS} d
                          </td>

                          {/* Remarks & Action */}
                          <td className="px-2 py-1.5 text-center">
                            <div className="flex items-center justify-center space-x-1.5">
                              <span
                                className={`font-mono text-[10px] px-2 py-0.5 rounded border truncate ${
                                  e.remarks === 'DONE'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : e.remarks === 'FACTORY SHORTFALL'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : e.remarks === 'PARTIAL / BALANCE IN CFS'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                              >
                                {e.remarks || 'IN CFS - READY'}
                              </span>

                              {hasShortfall && (
                                <button
                                  onClick={() => handleConfirmFullGateIn(e.id)}
                                  className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer"
                                  title="Confirm 100% Full Gate-In (Clears factory shortfall)"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB C: CFS CARTING REPORT (17 Columns Gate-In Log)
            ===================================================================== */}
        {activeTab === 'carting_report' && (
          <div className="bg-surface border border-divider rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto max-h-[calc(100vh-210px)]">
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
                      const isExpanded = expandedInvoiceIds.has(e.id);
                      const hasPallets = (e.pallets || []).length > 0;
                      return (
                        <React.Fragment key={e.id}>
                          <tr className="hover:bg-slate-50 transition-colors">
                            <td className="px-3 py-1.5 font-mono text-brand-primary font-bold border-r border-divider/60">
                              <div className="flex items-center space-x-1.5">
                                {hasPallets && (
                                  <button
                                    onClick={() => {
                                      setExpandedInvoiceIds((prev) => {
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

                          {/* Expandable Pallet Sub-rows */}
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

      {/* Stuffing & Dispatch Modal */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-divider rounded-xl max-w-lg w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-divider pb-2.5">
              <div className="flex items-center space-x-2">
                <Truck className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-bold text-content-primary uppercase tracking-wider">
                  Confirm 20' GP Container Stuffing &amp; Dispatch
                </h3>
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
