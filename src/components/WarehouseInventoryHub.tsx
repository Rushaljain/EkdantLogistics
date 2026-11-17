import React, { useState, useMemo, useRef } from 'react';
import {
  Boxes,
  Truck,
  FileSpreadsheet,
  Upload,
  Download,
  AlertTriangle,
  CheckCircle2,
  Package,
  Layers,
  ArrowRight,
  Trash2,
  Calendar,
  Search,
  Filter,
  Check,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import type {
  CFSLedgerEntry,
  CustomerStockSummary,
  ExtractedShipmentJSON,
  PalletStockUnit
} from '../types/index.ts';
import {
  CFS_MONTHS,
  type CFSMonth,
  getCFSLedgerEntries,
  addOrUpdateCFSEntry,
  deleteCFSEntry,
  confirmFullGateIn,
  updatePalletReceivedQuantity,
  confirmStuffingDispatch,
  getCustomerStockSummaries,
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

export function WarehouseInventoryHub({
  onLoadShipmentIntoWorkspace,
  onNavigateToWorkspace,
  activeShipmentJson: _activeShipmentJson
}: WarehouseInventoryHubProps): React.JSX.Element {
  const [entries, setEntries] = useState<CFSLedgerEntry[]>(() => getCFSLedgerEntries());
  const [activeTab, setActiveTab] = useState<'pick_dispatch' | 'stock_report' | 'carting_report'>('stock_report');
  const [selectedMonth, setSelectedMonth] = useState<CFSMonth>('ALL');
  const [customerFilter, setCustomerFilter] = useState<string>('ALL');
  const [alertFilter, setAlertFilter] = useState<'ALL' | 'STOCK_OUT' | 'LOW_STOCK' | 'FACTORY_SHORTFALL'>('ALL');
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

  // Edit Gate-In Modal / State
  const [editingEntry, setEditingEntry] = useState<CFSLedgerEntry | null>(null);

  // File import ref
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Reload entries from storage
  const reloadEntries = () => {
    const loaded = getCFSLedgerEntries();
    setEntries(loaded);
  };

  // Compute live customer summaries & alerts
  const customerSummaries = useMemo<CustomerStockSummary[]>(() => {
    return getCustomerStockSummaries(entries);
  }, [entries]);

  // Unique customers list
  const uniqueCustomers = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.customer?.trim()) set.add(e.customer.trim());
    });
    return Array.from(set).sort();
  }, [entries]);

  // KPIs
  const kpis = useMemo(() => {
    const totalBalancePallets = entries.reduce((s, e) => s + (e.balancePallets || 0), 0);
    const totalBalanceBatteries = entries.reduce((s, e) => s + (e.balanceBatteries || 0), 0);
    const totalShortfallPallets = entries.reduce((s, e) => s + (e.shortfallPallets || 0), 0);
    const totalShortfallBatteries = entries.reduce((s, e) => s + (e.shortfallBatteries || 0), 0);
    const totalStuffedPallets = entries.reduce((s, e) => s + (e.actualStuffedPallets || 0), 0);
    const totalStuffedBatteries = entries.reduce((s, e) => s + (e.actualStuffedBatteries || 0), 0);
    const total20GPLoads = Math.ceil(totalBalancePallets / 22);

    const stockOutCount = customerSummaries.filter((s) => s.alertType === 'STOCK_OUT').length;
    const lowStockCount = customerSummaries.filter((s) => s.alertType === 'LOW_STOCK').length;
    const shortfallCount = customerSummaries.filter((s) => s.alertType === 'FACTORY_SHORTFALL').length;

    return {
      totalBalancePallets,
      totalBalanceBatteries,
      totalShortfallPallets,
      totalShortfallBatteries,
      totalStuffedPallets,
      totalStuffedBatteries,
      total20GPLoads,
      stockOutCount,
      lowStockCount,
      shortfallCount
    };
  }, [entries, customerSummaries]);

  // Filtered entries for Stock & Carting tables
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (selectedMonth !== 'ALL' && (e.month || '').toUpperCase() !== selectedMonth.toUpperCase()) {
        return false;
      }
      if (customerFilter !== 'ALL' && e.customer?.trim().toUpperCase() !== customerFilter.toUpperCase()) {
        return false;
      }
      if (alertFilter !== 'ALL') {
        const sum = customerSummaries.find((s) => s.customer.toUpperCase() === e.customer?.toUpperCase());
        if (!sum || sum.alertType !== alertFilter) return false;
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
  }, [entries, selectedMonth, customerFilter, alertFilter, searchQuery, customerSummaries]);

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

  // Stats for currently selected pallets
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

  // Handle Pallet Checkbox Toggle
  const togglePalletSelection = (palletId: string, customer: string) => {
    setSelectedPalletIds((prev) => {
      const next = new Set(prev);
      if (next.has(palletId)) {
        next.delete(palletId);
        if (next.size === 0) {
          setSelectedDispatchCustomer('');
        }
      } else {
        // Lock selection to a single customer/consignee for clean dispatch
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

  // Select all pallets for the chosen customer
  const toggleSelectAllCustomerPallets = () => {
    if (selectedPalletIds.size > 0) {
      setSelectedPalletIds(new Set());
      setSelectedDispatchCustomer('');
    } else if (availablePallets.length > 0) {
      const firstCust = availablePallets[0].entry.customer;
      const matchingCustPallets = availablePallets.filter((item) => item.entry.customer === firstCust);
      const next = new Set<string>();
      matchingCustPallets.forEach((item) => next.add(item.pallet.id));
      setSelectedPalletIds(next);
      setSelectedDispatchCustomer(firstCust);
    }
  };

  // Action: Load Selected into 20' GP & Generate DG / BL
  const handleLoadSelectedIntoWorkspace = () => {
    if (selectedPalletsStats.palletList.length === 0) {
      showToast('Please select at least 1 pallet to load into 20\' GP container.');
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
      showToast('Please provide Container No and Seal No for dispatch.');
      return;
    }

    const { stuffedCount } = confirmStuffingDispatch(
      Array.from(selectedPalletIds),
      dispatchDetails
    );

    showToast(`Successfully dispatched ${stuffedCount} pallets into Container ${dispatchDetails.containerNo}!`);
    setShowDispatchModal(false);
    setSelectedPalletIds(new Set());
    setSelectedDispatchCustomer('');
    reloadEntries();
  };

  // Action: 1-Click Confirm Full Gate-In
  const handleConfirmFullGateIn = (entryId: string) => {
    const updated = confirmFullGateIn(entryId);
    if (updated) {
      showToast(`Confirmed 100% Gate-In for Invoice ${updated.customInvoiceNo}!`);
      reloadEntries();
    }
  };

  // Action: Excel Import
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const res = await importCFSExcel(file);
    if (res.importedCount > 0) {
      showToast(`Successfully imported ${res.importedCount} records from ${file.name}!`);
      reloadEntries();
    } else {
      showToast(`Import completed with 0 records. ${res.errors.join(' ')}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden select-none font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-lg shadow-xl text-xs font-semibold flex items-center space-x-2 animate-fade-in border border-emerald-400">
          <CheckCircle2 className="w-4 h-4 text-white" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="h-14 border-b border-white/10 px-6 flex items-center justify-between shrink-0 bg-slate-900/60 backdrop-blur-sm">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md">
            <Boxes className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-sm font-bold text-white tracking-wide">
                CHA WAREHOUSE INVENTORY & CFS STOCK LEDGER
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                1:1 CFS REPORT ALIGNMENT
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Live Factory Gate-In Carting, Container Stuffing, CFS Floor Balance & Ageing System
            </p>
          </div>
        </div>

        {/* Global Hub Action Buttons */}
        <div className="flex items-center space-x-2">
          {/* Hidden Excel Importer Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx,.xls"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 text-xs font-medium flex items-center space-x-1.5 transition-colors"
            title="Import historical CFS Stock or Carting Excel"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            <span>Import Excel</span>
          </button>

          <button
            onClick={() => exportCFSStockReportXlsx(entries, selectedMonth)}
            className="px-2.5 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-200 border border-emerald-700/50 text-xs font-medium flex items-center space-x-1.5 transition-colors"
            title="Export 22-column multi-sheet CFS Stock Report with live Excel formulas"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export Stock (.xlsx)</span>
          </button>

          <button
            onClick={() => exportCFSCartingReportXlsx(entries)}
            className="px-2.5 py-1.5 rounded-lg bg-blue-950/60 hover:bg-blue-900/80 text-blue-200 border border-blue-700/50 text-xs font-medium flex items-center space-x-1.5 transition-colors"
            title="Export 17-column CFS Carting Report"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>Export Carting (.xlsx)</span>
          </button>

          <button
            onClick={onNavigateToWorkspace}
            className="px-3 py-1.5 rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-medium flex items-center space-x-1.5 shadow-md transition-colors"
          >
            <span>Workspace</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Top KPI & Operational Alert Ribbon */}
      <div className="grid grid-cols-4 gap-3 p-4 bg-slate-900/40 border-b border-white/10 shrink-0">
        {/* KPI 1: Live Available Balance in CFS */}
        <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] font-mono uppercase text-emerald-400 font-semibold block tracking-wider">
              Available Balance (CFS Floor)
            </span>
            <div className="flex items-baseline space-x-2 mt-0.5">
              <span className="text-xl font-bold text-white font-mono">{kpis.totalBalancePallets}</span>
              <span className="text-xs text-slate-400">Pallets</span>
              <span className="text-xs font-mono text-emerald-400">({kpis.totalBalanceBatteries} Units)</span>
            </div>
            <span className="text-[11px] text-slate-400 block mt-0.5">
              Load: ~{kpis.total20GPLoads} x 20' GP Container(s)
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Package className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 2: Factory Shortfall */}
        <div
          onClick={() => setAlertFilter(alertFilter === 'FACTORY_SHORTFALL' ? 'ALL' : 'FACTORY_SHORTFALL')}
          className={`cursor-pointer transition-all rounded-xl p-3 flex items-center justify-between border ${
            alertFilter === 'FACTORY_SHORTFALL'
              ? 'bg-rose-950/80 border-rose-500 ring-2 ring-rose-500/40'
              : 'bg-slate-900 border-rose-500/30 hover:border-rose-500/60'
          }`}
        >
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] font-mono uppercase text-rose-400 font-semibold block tracking-wider">
                Factory Shortfall
              </span>
              {kpis.shortfallCount > 0 && (
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  {kpis.shortfallCount} Clients
                </span>
              )}
            </div>
            <div className="flex items-baseline space-x-2 mt-0.5">
              <span className="text-xl font-bold text-rose-300 font-mono">{kpis.totalShortfallPallets}</span>
              <span className="text-xs text-slate-400">Plt Pending</span>
              <span className="text-xs font-mono text-rose-400">({kpis.totalShortfallBatteries} Bat)</span>
            </div>
            <span className="text-[11px] text-rose-400/80 block mt-0.5">
              Actual Received &lt; As Invoiced
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 3: Total Stuffed / Dispatched */}
        <div className="bg-slate-900 border border-blue-500/30 rounded-xl p-3 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] font-mono uppercase text-blue-400 font-semibold block tracking-wider">
              Stuffed &amp; Dispatched (Stock-Out)
            </span>
            <div className="flex items-baseline space-x-2 mt-0.5">
              <span className="text-xl font-bold text-white font-mono">{kpis.totalStuffedPallets}</span>
              <span className="text-xs text-slate-400">Pallets</span>
              <span className="text-xs font-mono text-blue-400">({kpis.totalStuffedBatteries} Units)</span>
            </div>
            <span className="text-[11px] text-slate-400 block mt-0.5">
              Cleared Customs &amp; Stuffed in 20' GP
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 4: Active Alert Badges Filter Bar */}
        <div className="bg-slate-900 border border-white/10 rounded-xl p-3 flex flex-col justify-between">
          <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold block tracking-wider">
            Operational Warning Filters
          </span>
          <div className="flex items-center space-x-2 mt-1.5">
            <button
              onClick={() => setAlertFilter(alertFilter === 'LOW_STOCK' ? 'ALL' : 'LOW_STOCK')}
              className={`flex-1 text-center py-1 px-1.5 rounded text-[11px] font-mono border transition-all ${
                alertFilter === 'LOW_STOCK'
                  ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
              }`}
            >
              Low Stock ({kpis.lowStockCount})
            </button>
            <button
              onClick={() => setAlertFilter(alertFilter === 'STOCK_OUT' ? 'ALL' : 'STOCK_OUT')}
              className={`flex-1 text-center py-1 px-1.5 rounded text-[11px] font-mono border transition-all ${
                alertFilter === 'STOCK_OUT'
                  ? 'bg-rose-600 text-white font-bold border-rose-500'
                  : 'bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-rose-500/20'
              }`}
            >
              Depleted ({kpis.stockOutCount})
            </button>
            <button
              onClick={() => setAlertFilter('ALL')}
              className={`py-1 px-2 rounded text-[11px] font-mono border transition-all ${
                alertFilter === 'ALL'
                  ? 'bg-slate-700 text-white font-bold border-slate-500'
                  : 'bg-slate-800 text-slate-400 border-white/10 hover:text-white'
              }`}
              title="Clear Filter"
            >
              All
            </button>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 truncate">
            {alertFilter === 'ALL' ? 'Showing all inventory rows' : `Active filter: ${alertFilter}`}
          </span>
        </div>
      </div>

      {/* Main Tab Switcher & Filter Controls */}
      <div className="border-b border-white/10 px-6 py-2.5 flex items-center justify-between shrink-0 bg-slate-900/50">
        {/* Tab Buttons */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setActiveTab('stock_report')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all ${
              activeTab === 'stock_report'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>CFS Monthly Stock Report (22-Col)</span>
          </button>

          <button
            onClick={() => setActiveTab('carting_report')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all ${
              activeTab === 'carting_report'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>CFS Carting Gate-In Report (17-Col)</span>
          </button>

          <button
            onClick={() => setActiveTab('pick_dispatch')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all ${
              activeTab === 'pick_dispatch'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Pick &amp; Dispatch Pool ({availablePallets.length} Pallets)</span>
          </button>
        </div>

        {/* Global Filter Bar */}
        <div className="flex items-center space-x-2.5">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search invoice, customer, container..."
              className="pl-8 pr-3 py-1 bg-slate-900 border border-white/10 rounded-md text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-52 font-sans"
            />
          </div>

          {/* Month Selector */}
          <div className="flex items-center space-x-1.5 bg-slate-900 border border-white/10 rounded-md px-2 py-1">
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value as CFSMonth)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer font-mono"
            >
              {CFS_MONTHS.map((m) => (
                <option key={m} value={m} className="bg-slate-900 text-white">
                  {m === 'ALL' ? 'All Months' : m}
                </option>
              ))}
            </select>
          </div>

          {/* Customer Filter */}
          <div className="flex items-center space-x-1.5 bg-slate-900 border border-white/10 rounded-md px-2 py-1">
            <Filter className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer max-w-[140px] truncate"
            >
              <option value="ALL" className="bg-slate-900 text-white">
                All Customers
              </option>
              {uniqueCustomers.map((c) => (
                <option key={c} value={c} className="bg-slate-900 text-white truncate">
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="flex-1 overflow-auto p-4">
        {/* ======================================================== */}
        {/* TAB A: PICK & DISPATCH POOL (Pallet-Level Stock Units) */}
        {/* ======================================================== */}
        {activeTab === 'pick_dispatch' && (
          <div className="space-y-4">
            {/* Pick & Dispatch Command Bar */}
            <div className="bg-slate-900 border border-white/10 rounded-xl p-3.5 flex items-center justify-between shadow-sm">
              <div className="flex items-center space-x-4">
                <button
                  onClick={toggleSelectAllCustomerPallets}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono border border-white/10 flex items-center space-x-1.5 transition-colors"
                >
                  <Check className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    {selectedPalletIds.size > 0 ? 'Deselect All' : 'Select Customer Pool'}
                  </span>
                </button>

                <div className="text-xs">
                  <span className="text-slate-400">Selected for Dispatch: </span>
                  <span className="font-bold text-white font-mono">
                    {selectedPalletsStats.count} Pallets
                  </span>
                  <span className="text-slate-400 mx-1.5">•</span>
                  <span className="font-bold text-indigo-300 font-mono">
                    {selectedPalletsStats.batteries} Units
                  </span>
                  <span className="text-slate-400 mx-1.5">•</span>
                  <span className="font-bold text-slate-300 font-mono">
                    {selectedPalletsStats.grossKg} kg Gross
                  </span>
                  <span className="text-slate-400 mx-1.5">•</span>
                  <span className="font-bold text-emerald-400 font-mono">
                    Requires {selectedPalletsStats.required20GP} x 20' GP
                  </span>
                  {selectedDispatchCustomer && (
                    <span className="ml-2 font-mono text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      Customer: {selectedDispatchCustomer}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleLoadSelectedIntoWorkspace}
                  disabled={selectedPalletIds.size === 0}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 shadow-md transition-all ${
                    selectedPalletIds.size > 0
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
                  }`}
                  title="Allocates picked pallets into 20' GP containers and opens Workspace"
                >
                  <span>🚀 Load Selected into 20' GP &amp; Generate DG / BL</span>
                </button>

                <button
                  onClick={() => setShowDispatchModal(true)}
                  disabled={selectedPalletIds.size === 0}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 shadow-md transition-all ${
                    selectedPalletIds.size > 0
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
                  }`}
                  title="Deducts pallets from CFS balance and records container details"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>✅ Confirm Stuffing / Stock-Out</span>
                </button>
              </div>
            </div>

            {/* Pallet Cards Grid */}
            {availablePallets.length === 0 ? (
              <div className="text-center py-16 bg-slate-900/40 border border-dashed border-white/10 rounded-xl p-8">
                <Boxes className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <h3 className="text-sm font-semibold text-slate-300">No Warehouse Floor Pallets Available</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Upload an invoice or import a CFS Carting report to populate incoming factory pallets into the warehouse ledger.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {availablePallets.map(({ pallet, entry }) => {
                  const isSelected = selectedPalletIds.has(pallet.id);
                  return (
                    <div
                      key={pallet.id}
                      onClick={() => togglePalletSelection(pallet.id, entry.customer)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer select-none ${
                        isSelected
                          ? 'bg-indigo-950/60 border-indigo-500 ring-2 ring-indigo-500/30'
                          : 'bg-slate-900 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // handled by parent onClick
                            className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="font-mono text-xs font-bold text-indigo-400">
                            PLT #{pallet.palletNumber}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/10 truncate max-w-[100px]">
                          {pallet.model}
                        </span>
                      </div>

                      <div className="mt-2 space-y-1 text-xs">
                        <div className="flex justify-between text-slate-400">
                          <span>Customer:</span>
                          <span className="font-semibold text-slate-200 truncate max-w-[120px]">
                            {entry.customer}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Invoice:</span>
                          <span className="font-mono text-slate-200">{entry.customInvoiceNo}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Batteries:</span>
                          <span className="font-mono font-bold text-white">
                            {pallet.receivedBatteries || pallet.invoicedBatteries} Units
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Gross Weight:</span>
                          <span className="font-mono text-slate-300">{pallet.grossWeightKg} kg</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB B: CFS MONTHLY STOCK REPORT (22 Columns) */}
        {/* ======================================================== */}
        {activeTab === 'stock_report' && (
          <div className="bg-slate-900 border border-white/10 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                {/* 2-Row Grouped Header */}
                <thead>
                  {/* Row 1: Merged Group Header */}
                  <tr className="bg-slate-950/80 text-[10px] uppercase font-mono tracking-wider border-b border-white/10">
                    <th colSpan={2} className="px-3 py-2 text-slate-400 border-r border-white/10 text-center">
                      Invoice Identification
                    </th>
                    <th colSpan={2} className="px-3 py-2 text-indigo-300 bg-indigo-950/30 border-r border-white/10 text-center">
                      As Received from EIL-Export
                    </th>
                    <th colSpan={2} className="px-3 py-2 text-emerald-300 bg-emerald-950/30 border-r border-white/10 text-center">
                      Actual Received from Factory
                    </th>
                    <th colSpan={2} className="px-3 py-2 text-rose-300 bg-rose-950/30 border-r border-white/10 text-center">
                      Short Fall (Pending)
                    </th>
                    <th className="px-3 py-2 text-slate-400 border-r border-white/10 text-center">
                      Carting Date
                    </th>
                    <th colSpan={2} className="px-3 py-2 text-blue-300 bg-blue-950/30 border-r border-white/10 text-center">
                      Actual Stuffed Qty
                    </th>
                    <th colSpan={2} className="px-3 py-2 text-amber-300 bg-amber-950/30 border-r border-white/10 text-center">
                      Balance Qty (CFS Floor)
                    </th>
                    <th colSpan={2} className="px-3 py-2 text-slate-400 border-r border-white/10 text-center">
                      Customs Shipping Bill
                    </th>
                    <th colSpan={2} className="px-3 py-2 text-slate-400 border-r border-white/10 text-center">
                      Equipment
                    </th>
                    <th colSpan={3} className="px-3 py-2 text-slate-400 border-r border-white/10 text-center">
                      Logistics Dates
                    </th>
                    <th className="px-3 py-2 text-slate-400 border-r border-white/10 text-center">
                      CFS Ageing
                    </th>
                    <th className="px-3 py-2 text-slate-400 text-center">Remarks &amp; Actions</th>
                  </tr>

                  {/* Row 2: Detailed 22 Columns */}
                  <tr className="bg-slate-900/90 text-[11px] font-semibold text-slate-300 border-b border-white/10">
                    <th className="px-3 py-2 border-r border-white/5">Customer</th>
                    <th className="px-3 py-2 border-r border-white/10">Custom Invoice No</th>

                    {/* Invoiced */}
                    <th className="px-2.5 py-2 text-right font-mono bg-indigo-950/20">Pallets</th>
                    <th className="px-2.5 py-2 text-right font-mono bg-indigo-950/20 border-r border-white/10">Batteries</th>

                    {/* Received */}
                    <th className="px-2.5 py-2 text-right font-mono bg-emerald-950/20">Pallets</th>
                    <th className="px-2.5 py-2 text-right font-mono bg-emerald-950/20 border-r border-white/10">Batteries</th>

                    {/* Shortfall */}
                    <th className="px-2.5 py-2 text-right font-mono bg-rose-950/20">Pallets</th>
                    <th className="px-2.5 py-2 text-right font-mono bg-rose-950/20 border-r border-white/10">Batteries</th>

                    {/* Carting Date */}
                    <th className="px-3 py-2 font-mono border-r border-white/10">Carting Date</th>

                    {/* Stuffed */}
                    <th className="px-2.5 py-2 text-right font-mono bg-blue-950/20">Pallets</th>
                    <th className="px-2.5 py-2 text-right font-mono bg-blue-950/20 border-r border-white/10">Batteries</th>

                    {/* Balance */}
                    <th className="px-2.5 py-2 text-right font-mono bg-amber-950/20 font-bold text-amber-300">Pallets</th>
                    <th className="px-2.5 py-2 text-right font-mono bg-amber-950/20 font-bold text-amber-300 border-r border-white/10">Batteries</th>

                    {/* Customs */}
                    <th className="px-2.5 py-2 border-r border-white/5">SB No.</th>
                    <th className="px-2.5 py-2 border-r border-white/10">Date</th>

                    {/* Equipment */}
                    <th className="px-2.5 py-2 border-r border-white/5">Container No</th>
                    <th className="px-2.5 py-2 border-r border-white/10">Seal No</th>

                    {/* Dates */}
                    <th className="px-2 py-2">Stuffing</th>
                    <th className="px-2 py-2">Pick-up</th>
                    <th className="px-2 py-2 border-r border-white/10">Gate-in</th>

                    {/* Days in CFS */}
                    <th className="px-2.5 py-2 text-right font-mono border-r border-white/10">Days in CFS</th>

                    {/* Remarks & Action */}
                    <th className="px-3 py-2 text-center">Remarks</th>
                  </tr>
                </thead>

                {/* Table Body */}
                <tbody className="divide-y divide-white/5 font-sans">
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={22} className="px-4 py-12 text-center text-slate-500">
                        No CFS Stock entries match the active month and filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map((e) => {
                      const hasShortfall = e.shortfallPallets > 0 || e.shortfallBatteries > 0;
                      return (
                        <tr
                          key={e.id}
                          className="hover:bg-slate-800/40 transition-colors group"
                        >
                          <td className="px-3 py-2.5 font-medium text-white border-r border-white/5 truncate max-w-[130px]" title={e.customer}>
                            {e.customer}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-indigo-300 border-r border-white/10">
                            {e.customInvoiceNo}
                          </td>

                          {/* Invoiced */}
                          <td className="px-2.5 py-2.5 text-right font-mono text-slate-300 bg-indigo-950/10">
                            {e.invoicedPallets}
                          </td>
                          <td className="px-2.5 py-2.5 text-right font-mono text-slate-300 bg-indigo-950/10 border-r border-white/10">
                            {e.invoicedBatteries}
                          </td>

                          {/* Received (Editable) */}
                          <td className="px-2.5 py-2.5 text-right font-mono text-emerald-300 bg-emerald-950/10">
                            {e.actualReceivedPallets}
                          </td>
                          <td className="px-2.5 py-2.5 text-right font-mono text-emerald-300 bg-emerald-950/10 border-r border-white/10">
                            {e.actualReceivedBatteries}
                          </td>

                          {/* Shortfall (Auto-derived) */}
                          <td className={`px-2.5 py-2.5 text-right font-mono bg-rose-950/10 font-bold ${hasShortfall ? 'text-rose-400' : 'text-slate-500'}`}>
                            {e.shortfallPallets}
                          </td>
                          <td className={`px-2.5 py-2.5 text-right font-mono bg-rose-950/10 border-r border-white/10 font-bold ${hasShortfall ? 'text-rose-400' : 'text-slate-500'}`}>
                            {e.shortfallBatteries}
                          </td>

                          {/* Carting Date */}
                          <td className="px-3 py-2.5 font-mono text-slate-300 border-r border-white/10">
                            {e.cartingInDate}
                          </td>

                          {/* Stuffed */}
                          <td className="px-2.5 py-2.5 text-right font-mono text-blue-300 bg-blue-950/10">
                            {e.actualStuffedPallets}
                          </td>
                          <td className="px-2.5 py-2.5 text-right font-mono text-blue-300 bg-blue-950/10 border-r border-white/10">
                            {e.actualStuffedBatteries}
                          </td>

                          {/* Balance (CFS Floor) */}
                          <td className="px-2.5 py-2.5 text-right font-mono font-bold text-amber-300 bg-amber-950/10">
                            {e.balancePallets}
                          </td>
                          <td className="px-2.5 py-2.5 text-right font-mono font-bold text-amber-300 bg-amber-950/10 border-r border-white/10">
                            {e.balanceBatteries}
                          </td>

                          {/* Customs */}
                          <td className="px-2.5 py-2.5 font-mono text-slate-300 border-r border-white/5 truncate max-w-[100px]">
                            {e.shippingBillNo || '-'}
                          </td>
                          <td className="px-2.5 py-2.5 font-mono text-slate-400 border-r border-white/10 text-xs">
                            {e.shippingBillDate || '-'}
                          </td>

                          {/* Equipment */}
                          <td className="px-2.5 py-2.5 font-mono text-cyan-300 border-r border-white/5 truncate max-w-[110px]">
                            {e.containerNo || '-'}
                          </td>
                          <td className="px-2.5 py-2.5 font-mono text-slate-400 border-r border-white/10 truncate max-w-[90px]">
                            {e.sealNo || '-'}
                          </td>

                          {/* Dates */}
                          <td className="px-2 py-2.5 font-mono text-slate-400 text-xs">{e.stuffingDate || '-'}</td>
                          <td className="px-2 py-2.5 font-mono text-slate-400 text-xs">{e.pickupDate || '-'}</td>
                          <td className="px-2 py-2.5 font-mono text-slate-400 text-xs border-r border-white/10">{e.portGateInDate || '-'}</td>

                          {/* Days in CFS */}
                          <td className="px-2.5 py-2.5 text-right font-mono font-bold text-indigo-300 border-r border-white/10">
                            {e.daysInCFS} d
                          </td>

                          {/* Remarks & Quick Action */}
                          <td className="px-3 py-2.5 text-center">
                            <div className="flex items-center justify-center space-x-1.5">
                              <span
                                className={`font-mono text-[10px] px-2 py-0.5 rounded border truncate ${
                                  e.remarks === 'DONE'
                                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                    : e.remarks === 'FACTORY SHORTFALL'
                                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                    : e.remarks === 'PARTIAL / BALANCE IN CFS'
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                }`}
                              >
                                {e.remarks || 'IN CFS - READY'}
                              </span>

                              {hasShortfall && (
                                <button
                                  onClick={() => handleConfirmFullGateIn(e.id)}
                                  className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                                  title="Confirm 100% Full Gate-In (Clears factory shortfall)"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                              )}

                              <button
                                onClick={() => setEditingEntry(e)}
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                                title="Edit Gate-In / Container Details"
                              >
                                ✏️
                              </button>

                              <button
                                onClick={() => {
                                  if (confirm(`Delete entry ${e.customInvoiceNo}?`)) {
                                    deleteCFSEntry(e.id);
                                    reloadEntries();
                                  }
                                }}
                                className="p-1 rounded hover:bg-rose-950 text-slate-500 hover:text-rose-400 transition-colors"
                                title="Delete Entry"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
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

        {/* ======================================================== */}
        {/* TAB C: CFS CARTING REPORT (17 Columns Gate-In Log) */}
        {/* ======================================================== */}
        {activeTab === 'carting_report' && (
          <div className="bg-slate-900 border border-white/10 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-[11px] font-semibold text-slate-300 border-b border-white/10 font-sans">
                    <th className="px-3 py-2.5 border-r border-white/5">INVOICE NO.</th>
                    <th className="px-3 py-2.5 border-r border-white/5">CONSIGNEE</th>
                    <th className="px-3 py-2.5 border-r border-white/5">POD</th>
                    <th className="px-3 py-2.5 text-right font-mono border-r border-white/5">GROSS WEIGHT</th>
                    <th className="px-3 py-2.5 text-right font-mono border-r border-white/5">TOTAL BATTERIES</th>
                    <th className="px-3 py-2.5 text-right font-mono border-r border-white/5">Total Pallet Quantity</th>
                    <th className="px-3 py-2.5 text-right font-mono border-r border-white/5 text-emerald-400">Received pallets</th>
                    <th className="px-3 py-2.5 text-right font-mono border-r border-white/5 text-rose-400">pending plt qty</th>
                    <th className="px-2.5 py-2.5 text-center font-mono border-r border-white/5">STATUS</th>
                    <th className="px-3 py-2.5 font-mono border-r border-white/5">CARTING DATE</th>
                    <th className="px-3 py-2.5 font-mono border-r border-white/5">VEHICLE NO.</th>
                    <th className="px-3 py-2.5 font-mono border-r border-white/5">LAST PLT RECD</th>
                    <th className="px-3 py-2.5 font-mono border-r border-white/5">DATE (TRIP 2)</th>
                    <th className="px-3 py-2.5 font-mono border-r border-white/5">VEHICLE NO (TRIP 2)</th>
                    <th className="px-3 py-2.5 text-center">ACTIONS</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/5">
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="px-4 py-12 text-center text-slate-500">
                        No Carting Gate-In entries available.
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map((e) => {
                      const isExpanded = expandedInvoiceIds.has(e.id);
                      const hasPallets = (e.pallets || []).length > 0;
                      return (
                        <React.Fragment key={e.id}>
                          <tr className="hover:bg-slate-800/40 transition-colors">
                            <td className="px-3 py-2.5 font-mono text-indigo-300 font-bold border-r border-white/5">
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
                                    className="text-slate-400 hover:text-white"
                                  >
                                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                  </button>
                                )}
                                <span>{e.customInvoiceNo}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 font-medium text-white border-r border-white/5 truncate max-w-[130px]">
                              {e.customer}
                            </td>
                            <td className="px-3 py-2.5 font-medium text-slate-300 border-r border-white/5">
                              {e.pod || '-'}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-slate-300 border-r border-white/5">
                              {e.invoicedGrossWeightKg} kg
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-slate-300 border-r border-white/5">
                              {e.invoicedBatteries}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-slate-300 border-r border-white/5">
                              {e.invoicedPallets}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-emerald-300 font-bold border-r border-white/5">
                              {e.actualReceivedPallets}
                            </td>
                            <td className={`px-3 py-2.5 text-right font-mono font-bold border-r border-white/5 ${e.shortfallPallets > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                              {e.shortfallPallets}
                            </td>
                            <td className="px-2.5 py-2.5 text-center font-mono text-slate-300 border-r border-white/5">
                              {e.gateInStatus || '1'}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-slate-300 border-r border-white/5">
                              {e.cartingInDate}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-slate-300 border-r border-white/5">
                              {e.vehicleNo || '-'}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-slate-300 border-r border-white/5">
                              {e.lastPltRecdDate || '-'}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-slate-400 border-r border-white/5">
                              {e.secondVehicleDate || '-'}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-slate-400 border-r border-white/5">
                              {e.secondVehicleNo || '-'}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <div className="flex items-center justify-center space-x-1.5">
                                <button
                                  onClick={() => handleConfirmFullGateIn(e.id)}
                                  className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-600/30 hover:bg-emerald-600 text-emerald-200 border border-emerald-500/40 transition-colors"
                                  title="Confirm 100% Pallets Received"
                                >
                                  Confirm Gate-In
                                </button>
                                <button
                                  onClick={() => setEditingEntry(e)}
                                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                                >
                                  ✏️
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expandable Pallet Sub-rows */}
                          {isExpanded && hasPallets && (
                            <tr className="bg-slate-950/60">
                              <td colSpan={15} className="p-3 pl-10 border-b border-white/10">
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-mono text-indigo-400 uppercase font-semibold">
                                      Pallet Verification &amp; Split Truck Gate-In Log ({e.pallets.length} Units)
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                      Edit QTY REC to record partial arrivals or damages
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-6 gap-2">
                                    {e.pallets.map((p) => {
                                      const isShort = (p.receivedBatteries || 0) < p.invoicedBatteries;
                                      return (
                                        <div
                                          key={p.id}
                                          className={`p-2 rounded-lg border text-xs ${
                                            isShort
                                              ? 'bg-rose-950/40 border-rose-500/40'
                                              : 'bg-slate-900 border-white/10'
                                          }`}
                                        >
                                          <div className="flex justify-between font-mono font-bold">
                                            <span className="text-indigo-300">PLT #{p.palletNumber}</span>
                                            <span className="text-[10px] text-slate-400">{p.model}</span>
                                          </div>
                                          <div className="mt-1 flex items-center justify-between text-[11px]">
                                            <span className="text-slate-400">ACTUAL:</span>
                                            <span className="font-mono text-slate-200">{p.invoicedBatteries}</span>
                                          </div>
                                          <div className="mt-1 flex items-center justify-between text-[11px]">
                                            <span className="text-slate-400">QTY REC:</span>
                                            <input
                                              type="number"
                                              value={p.receivedBatteries}
                                              onChange={(ev) => {
                                                const val = parseInt(ev.target.value, 10) || 0;
                                                updatePalletReceivedQuantity(e.id, p.id, val);
                                                reloadEntries();
                                              }}
                                              className="w-16 px-1.5 py-0.5 rounded bg-slate-950 border border-white/20 text-white font-mono text-right focus:outline-none focus:border-indigo-500"
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2">
                <Truck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">
                  Confirm 20' GP Container Stuffing &amp; Dispatch (Stock-Out)
                </h3>
              </div>
              <button
                onClick={() => setShowDispatchModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Deduct <strong className="text-white font-mono">{selectedPalletsStats.count} pallets</strong> ({selectedPalletsStats.batteries} batteries) from live CFS warehouse floor balance for <strong className="text-white">{selectedDispatchCustomer}</strong>.
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Container Number *</label>
                <input
                  type="text"
                  value={dispatchDetails.containerNo}
                  onChange={(e) => setDispatchDetails({ ...dispatchDetails, containerNo: e.target.value.toUpperCase() })}
                  placeholder="e.g. MSKU1234567"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Seal Number *</label>
                <input
                  type="text"
                  value={dispatchDetails.sealNo}
                  onChange={(e) => setDispatchDetails({ ...dispatchDetails, sealNo: e.target.value.toUpperCase() })}
                  placeholder="e.g. SL987654"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Shipping Bill No.</label>
                <input
                  type="text"
                  value={dispatchDetails.shippingBillNo}
                  onChange={(e) => setDispatchDetails({ ...dispatchDetails, shippingBillNo: e.target.value })}
                  placeholder="e.g. 5622160"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Shipping Bill Date</label>
                <input
                  type="text"
                  value={dispatchDetails.shippingBillDate}
                  onChange={(e) => setDispatchDetails({ ...dispatchDetails, shippingBillDate: e.target.value })}
                  placeholder="DD.MM.YYYY"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Stuffing Date</label>
                <input
                  type="text"
                  value={dispatchDetails.stuffingDate}
                  onChange={(e) => setDispatchDetails({ ...dispatchDetails, stuffingDate: e.target.value })}
                  placeholder="DD.MM.YYYY"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Port Gate-in Date</label>
                <input
                  type="text"
                  value={dispatchDetails.portGateInDate}
                  onChange={(e) => setDispatchDetails({ ...dispatchDetails, portGateInDate: e.target.value })}
                  placeholder="DD.MM.YYYY"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-white/10">
              <button
                onClick={() => setShowDispatchModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteDispatch}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-colors"
              >
                Confirm Dispatch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Entry Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">
                  Edit CFS Stock Entry: {editingEntry.customInvoiceNo}
                </h3>
              </div>
              <button
                onClick={() => setEditingEntry(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs max-h-[60vh] overflow-y-auto pr-1">
              <div>
                <label className="block text-slate-400 mb-1">Customer / Consignee</label>
                <input
                  type="text"
                  value={editingEntry.customer}
                  onChange={(e) => setEditingEntry({ ...editingEntry, customer: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Custom Invoice No</label>
                <input
                  type="text"
                  value={editingEntry.customInvoiceNo}
                  onChange={(e) => setEditingEntry({ ...editingEntry, customInvoiceNo: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Actual Received Pallets</label>
                <input
                  type="number"
                  value={editingEntry.actualReceivedPallets}
                  onChange={(e) => setEditingEntry({ ...editingEntry, actualReceivedPallets: Number(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Actual Received Batteries</label>
                <input
                  type="number"
                  value={editingEntry.actualReceivedBatteries}
                  onChange={(e) => setEditingEntry({ ...editingEntry, actualReceivedBatteries: Number(e.target.value) || 0 })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Carting in Date</label>
                <input
                  type="text"
                  value={editingEntry.cartingInDate}
                  onChange={(e) => setEditingEntry({ ...editingEntry, cartingInDate: e.target.value })}
                  placeholder="DD.MM.YYYY"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Vehicle No. (Truck 1)</label>
                <input
                  type="text"
                  value={editingEntry.vehicleNo}
                  onChange={(e) => setEditingEntry({ ...editingEntry, vehicleNo: e.target.value.toUpperCase() })}
                  placeholder="e.g. MH46F3970"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Last Plt Recd Date</label>
                <input
                  type="text"
                  value={editingEntry.lastPltRecdDate}
                  onChange={(e) => setEditingEntry({ ...editingEntry, lastPltRecdDate: e.target.value })}
                  placeholder="DD.MM.YYYY"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Port Gate-in Date</label>
                <input
                  type="text"
                  value={editingEntry.portGateInDate}
                  onChange={(e) => setEditingEntry({ ...editingEntry, portGateInDate: e.target.value })}
                  placeholder="DD.MM.YYYY"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Container No</label>
                <input
                  type="text"
                  value={editingEntry.containerNo}
                  onChange={(e) => setEditingEntry({ ...editingEntry, containerNo: e.target.value.toUpperCase() })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Seal No</label>
                <input
                  type="text"
                  value={editingEntry.sealNo}
                  onChange={(e) => setEditingEntry({ ...editingEntry, sealNo: e.target.value.toUpperCase() })}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-slate-400 mb-1">Remarks</label>
                <input
                  type="text"
                  value={editingEntry.remarks}
                  onChange={(e) => setEditingEntry({ ...editingEntry, remarks: e.target.value })}
                  placeholder="DONE / PARTIAL / BALANCE IN CFS"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-white/10">
              <button
                onClick={() => setEditingEntry(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const saved = addOrUpdateCFSEntry(editingEntry);
                  showToast(`Saved changes for ${saved.customInvoiceNo}!`);
                  setEditingEntry(null);
                  reloadEntries();
                }}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
