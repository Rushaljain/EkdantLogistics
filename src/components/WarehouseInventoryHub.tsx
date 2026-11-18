// Ekdant Logistics - Warehouse Inventory
// Clean, simplified operator UI: 3 KPI Cards + Section Dropdown (Inventory, Monthly Live Reports, Inventory Logs)

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
  X,
  Printer,
  History,
  Plus,
  Loader2,
  Trash2,
  AlertTriangle
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
  deleteCFSEntry,
  deletePalletFromCFSEntry,
  deletePalletsFromCFS,
  confirmFullGateIn,
  updatePalletReceivedQuantity,
  confirmStuffingDispatch,
  buildShipmentFromStockPallets,
  exportCFSStockReportXlsx,
  exportCFSCartingReportXlsx,
  importCFSExcel,
  formatToDDMMYYYY,
  getDerivedInventoryMovements,
  exportCFSMovementLogsXlsx,
  ingestShipmentToLedger
} from '../utils/inventoryStore.ts';
import { parseDocumentsToJSON } from '../utils/documentParser.ts';

interface WarehouseInventoryHubProps {
  onLoadShipmentIntoWorkspace: (shipment: ExtractedShipmentJSON) => void;
  onNavigateToWorkspace: () => void;
  activeShipmentJson?: ExtractedShipmentJSON;
}

// In-place click-to-edit cell
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

  // Section Selector: 'inventory' | 'reports' | 'logs'
  const [activeSection, setActiveSection] = useState<'inventory' | 'reports' | 'logs'>('inventory');

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [customerFilter, setCustomerFilter] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<CFSMonth>('ALL');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Inventory States
  const [selectedPalletIds, setSelectedPalletIds] = useState<Set<string>>(new Set());
  const [selectedDispatchCustomer, setSelectedDispatchCustomer] = useState<string>('');
  const [expandedInventoryInvoiceIds, setExpandedInventoryInvoiceIds] = useState<Set<string>>(new Set());
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState<'ALL' | 'PENDING_GATE_IN' | 'IN_WAREHOUSE' | 'SHORTFALL'>('ALL');

  // Reports States
  const [reportType, setReportType] = useState<'stock_22' | 'carting_17'>('stock_22');
  const [expandedCartingInvoiceIds, setExpandedCartingInvoiceIds] = useState<Set<string>>(new Set());

  // Logs States
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

  // Invoice Upload (Stock-In) States
  const invoiceInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadBannerState, setUploadBannerState] = useState<'idle' | 'uploading' | 'uploaded'>('idle');

  const handleInvoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    setUploadBannerState('uploading');
    try {
      const customKey = localStorage.getItem('ekdant_custom_gemini_key') || undefined;
      const mode = files.length > 1 ? 'MULTI_INVOICE' : 'SINGLE_INVOICE';
      const result = await parseDocumentsToJSON(files, mode, customKey);
      if (result.shipmentJson && result.shipmentJson.invoiceNumbers.length > 0) {
        ingestShipmentToLedger(result.shipmentJson);
        reloadEntries();
        const invoiceList = result.shipmentJson.invoiceNumbers.join(', ');
        showToast(`Uploaded ${invoiceList} (${result.shipmentJson.totalPallets} Pallets) into Warehouse!`);
        setUploadBannerState('uploaded');
        setTimeout(() => {
          setUploadBannerState('idle');
        }, 1000);
      } else if (result.warnings && result.warnings.length > 0) {
        showToast(`Warning: ${result.warnings.join(' ')}`);
        setUploadBannerState('idle');
      } else {
        showToast('Document parsed without invoice numbers. Please verify file.');
        setUploadBannerState('idle');
      }
    } catch (err: any) {
      showToast(`Upload failed: ${err?.message || 'Error parsing document'}`);
      setUploadBannerState('idle');
    } finally {
      if (invoiceInputRef.current) invoiceInputRef.current.value = '';
    }
  };

  // Customer Summaries for Customer Dropdown
  const customerDropdownData = useMemo(() => {
    const map = new Map<string, { pallets: number; batteries: number }>();
    entries.forEach((e) => {
      const cust = e.customer?.trim();
      if (!cust) return;
      const cur = map.get(cust) || { pallets: 0, batteries: 0 };
      cur.pallets += e.balancePallets || 0;
      cur.batteries += e.balanceBatteries || 0;
      map.set(cust, cur);
    });
    return Array.from(map.entries())
      .map(([cust, stats]) => ({
        customer: cust,
        ...stats
      }))
      .sort((a, b) => a.customer.localeCompare(b.customer));
  }, [entries]);

  // Clean KPI Totals
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

    return {
      totalBalancePallets,
      totalBalanceBatteries,
      totalBalanceGrossKg,
      totalInvoicedPallets,
      totalReceivedPallets,
      pendingGateInCount,
      totalStuffedPallets,
      totalStuffedBatteries,
      dispatchedContainersCount
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
  }, [entries, selectedMonth, customerFilter, dateFrom, dateTo, searchQuery]);

  // Active Floor Stock Invoices
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

  // Available Pallet Units for Picking
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
          showToast(`Selection locked to customer: ${selectedDispatchCustomer}. Clear to select another customer.`);
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
      showToast(`Selection locked to ${selectedDispatchCustomer}. Clear selection first.`);
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

  // Action: Load into 20' GP & Navigate to Workspace
  const handleLoadSelectedIntoWorkspace = () => {
    if (selectedPalletsStats.palletList.length === 0) {
      showToast("Select at least 1 pallet to load.");
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
    showToast(`Loaded ${selectedPalletsStats.count} pallets into Workspace.`);
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

  // Action: Confirm Full Gate-In
  const handleConfirmFullGateIn = (entryId: string) => {
    const updated = confirmFullGateIn(entryId);
    if (updated) {
      showToast(`Confirmed receipt for ${updated.customInvoiceNo}`);
      reloadEntries();
    }
  };

  // Deletion Confirmation Modal State & Handlers
  const [itemToDelete, setItemToDelete] = useState<{
    type: 'invoice' | 'pallet' | 'selected_pallets';
    id?: string;
    palletId?: string;
    title: string;
    description: string;
  } | null>(null);

  const promptDeleteInvoice = (entry: CFSLedgerEntry) => {
    setItemToDelete({
      type: 'invoice',
      id: entry.id,
      title: `Delete Invoice ${entry.customInvoiceNo}?`,
      description: `This will permanently remove invoice ${entry.customInvoiceNo} and its ${entry.pallets?.length || entry.invoicedPallets} pallets for ${entry.customer} from warehouse inventory.`
    });
  };

  const promptDeletePallet = (entry: CFSLedgerEntry, pallet: PalletStockUnit) => {
    setItemToDelete({
      type: 'pallet',
      id: entry.id,
      palletId: pallet.id,
      title: `Delete Pallet #${pallet.palletNumber}?`,
      description: `This will remove pallet #${pallet.palletNumber} (${pallet.receivedBatteries || pallet.invoicedBatteries} units, ${pallet.grossWeightKg} kg) from invoice ${entry.customInvoiceNo}.`
    });
  };

  const promptDeleteSelectedPallets = () => {
    if (selectedPalletIds.size === 0) return;
    setItemToDelete({
      type: 'selected_pallets',
      title: `Delete ${selectedPalletIds.size} Selected Pallets?`,
      description: `This will permanently remove ${selectedPalletIds.size} selected pallets (${selectedPalletsStats.batteries} units, ${selectedPalletsStats.grossKg} kg) from active warehouse inventory.`
    });
  };

  const handleConfirmDelete = () => {
    if (!itemToDelete) return;
    if (itemToDelete.type === 'invoice' && itemToDelete.id) {
      const entryId = itemToDelete.id;
      const deletedEntry = entries.find((e) => e.id === entryId);
      deleteCFSEntry(entryId);
      if (deletedEntry) {
        setSelectedPalletIds((prev) => {
          const next = new Set(prev);
          (deletedEntry.pallets || []).forEach((p) => next.delete(p.id));
          if (next.size === 0) setSelectedDispatchCustomer('');
          return next;
        });
      }
      showToast('Invoice deleted from inventory.');
    } else if (itemToDelete.type === 'pallet' && itemToDelete.id && itemToDelete.palletId) {
      deletePalletFromCFSEntry(itemToDelete.id, itemToDelete.palletId);
      setSelectedPalletIds((prev) => {
        const next = new Set(prev);
        next.delete(itemToDelete.palletId!);
        if (next.size === 0) setSelectedDispatchCustomer('');
        return next;
      });
      showToast('Pallet deleted from inventory.');
    } else if (itemToDelete.type === 'selected_pallets') {
      const ids = Array.from(selectedPalletIds);
      deletePalletsFromCFS(ids);
      setSelectedPalletIds(new Set());
      setSelectedDispatchCustomer('');
      showToast(`Deleted ${ids.length} pallets from inventory.`);
    }
    setItemToDelete(null);
    reloadEntries();
  };

  // Action: Excel Import
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const res = await importCFSExcel(file);
    if (res.importedCount > 0) {
      showToast(`Imported ${res.importedCount} records from ${file.name}`);
      reloadEntries();
    } else {
      showToast(`0 records imported. ${res.errors.join(' ')}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Derived Inventory Movement Records
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

  // Customer Outgoing Summary
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

  // Clear all filters
  const hasActiveFilters = searchQuery || customerFilter !== 'ALL' || selectedMonth !== 'ALL' || dateFrom || dateTo;
  const handleClearFilters = () => {
    setSearchQuery('');
    setCustomerFilter('ALL');
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

      {/* Hidden CFS Excel File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".xlsx,.xls"
        className="hidden"
      />

      {/* Hidden Commercial Invoice / Packing List Input (Supports multiple PDF/Excel/Word files) */}
      <input
        type="file"
        ref={invoiceInputRef}
        onChange={handleInvoiceUpload}
        accept=".pdf,.xlsx,.xls,.docx"
        multiple
        className="hidden"
      />

      {/* TOP HEADER */}
      <header className="bg-surface border-b border-divider shrink-0 z-20 shadow-xs">
        {/* Real-time Upload Banner */}
        {uploadBannerState !== 'idle' && (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs flex items-center justify-between animate-fade-in shadow-inner">
            <div className="flex items-center space-x-2">
              {uploadBannerState === 'uploading' ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-white" />
              )}
              <span className="font-semibold">
                {uploadBannerState === 'uploading' ? 'Uploading...' : 'Uploaded'}
              </span>
            </div>
          </div>
        )}

        <div className="h-12 px-4 sm:px-6 flex items-center justify-between border-b border-divider/60">
          <div>
            <h1 className="text-sm font-bold text-content-primary tracking-tight">
              Warehouse Inventory
            </h1>
          </div>

          <div className="flex items-center space-x-2">
            {/* Prominent + Upload Invoice to Inventory (Stock-In) Button */}
            <button
              onClick={() => invoiceInputRef.current?.click()}
              disabled={uploadBannerState !== 'idle'}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-85 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
              title="Upload commercial invoices or packing lists (select single or multiple PDF, Excel, Word files) into warehouse inventory"
            >
              {uploadBannerState === 'uploading' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : uploadBannerState === 'uploaded' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>
                {uploadBannerState === 'uploading'
                  ? 'Uploading...'
                  : uploadBannerState === 'uploaded'
                  ? 'Uploaded'
                  : '+ Upload Invoice to Inventory (Stock-In)'}
              </span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary border border-divider text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="Import historical CFS Excel file"
            >
              <Upload className="w-3.5 h-3.5 text-brand-primary" />
              <span className="hidden sm:inline">Import Excel</span>
            </button>

            <button
              onClick={onNavigateToWorkspace}
              className="px-3 py-1.5 rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <span>Workspace</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 3 CLEAN KPI CARDS (Redundant badges & exception card removed) */}
        <div className="p-3 sm:p-4 bg-surface-secondary/30">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono tabular-nums">
            {/* Card 1: Available Stock */}
            <div className="bg-surface border border-divider rounded-xl p-3 shadow-xs flex flex-col justify-between">
              <div className="text-xs font-semibold text-content-secondary font-sans">
                Available Stock
              </div>
              <div className="mt-1.5 flex items-baseline space-x-2">
                <span className="text-xl font-bold text-content-primary">{kpis.totalBalancePallets}</span>
                <span className="text-xs text-content-muted font-sans font-normal">Pallets</span>
                <span className="text-content-muted">•</span>
                <span className="text-base font-bold text-indigo-700">{kpis.totalBalanceBatteries.toLocaleString()}</span>
                <span className="text-xs text-content-muted font-sans font-normal">Units</span>
              </div>
              <div className="mt-1 text-xs text-content-secondary font-sans">
                Weight: <strong className="text-content-primary font-mono">{kpis.totalBalanceGrossKg.toLocaleString()} kg</strong>
              </div>
            </div>

            {/* Card 2: Gate-In Received */}
            <div className="bg-surface border border-divider rounded-xl p-3 shadow-xs flex flex-col justify-between">
              <div className="text-xs font-semibold text-content-secondary font-sans">
                Gate-In Received
              </div>
              <div className="mt-1.5 flex items-baseline space-x-2">
                <span className="text-xl font-bold text-content-primary">{kpis.totalReceivedPallets}</span>
                <span className="text-xs text-content-muted font-sans font-normal">/ {kpis.totalInvoicedPallets} Pallets</span>
              </div>
              <div className="mt-1 text-xs text-content-secondary font-sans">
                {kpis.pendingGateInCount > 0 ? (
                  <span className="text-amber-700 font-medium">{kpis.pendingGateInCount} invoices pending receipt</span>
                ) : (
                  <span className="text-emerald-700 font-medium">All invoices received</span>
                )}
              </div>
            </div>

            {/* Card 3: Dispatched */}
            <div className="bg-surface border border-divider rounded-xl p-3 shadow-xs flex flex-col justify-between">
              <div className="text-xs font-semibold text-content-secondary font-sans">
                Dispatched
              </div>
              <div className="mt-1.5 flex items-baseline space-x-2">
                <span className="text-xl font-bold text-content-primary">{kpis.totalStuffedPallets}</span>
                <span className="text-xs text-content-muted font-sans font-normal">Pallets</span>
                <span className="text-content-muted">•</span>
                <span className="text-base font-bold text-blue-700">{kpis.totalStuffedBatteries.toLocaleString()}</span>
                <span className="text-xs text-content-muted font-sans font-normal">Units</span>
              </div>
              <div className="mt-1 text-xs text-content-secondary font-sans">
                <strong className="text-content-primary font-mono">{kpis.dispatchedContainersCount}</strong> containers shipped
              </div>
            </div>
          </div>
        </div>

        {/* CONTROLS BAR: SECTION DROPDOWN + CUSTOMER DROPDOWN + SEARCH */}
        <div className="px-4 sm:px-6 py-2.5 bg-surface border-t border-divider flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            {/* Section Selector Dropdown (Yellow items placed in clean dropdown) */}
            <div className="flex items-center space-x-1.5">
              <label htmlFor="section-select" className="text-content-secondary font-medium shrink-0">Section:</label>
              <select
                id="section-select"
                value={activeSection}
                onChange={(e) => setActiveSection(e.target.value as 'inventory' | 'reports' | 'logs')}
                className="px-3 py-1.5 bg-surface-secondary border border-divider rounded-lg font-semibold text-content-primary focus:outline-none focus:border-brand-primary cursor-pointer text-xs"
              >
                <option value="inventory">Inventory ({availablePalletUnits.length} pallets)</option>
                <option value="reports">Monthly Live Reports</option>
                <option value="logs">Inventory Logs ({allMovementRecords.length})</option>
              </select>
            </div>

            {/* Customer Dropdown */}
            <div className="flex items-center space-x-1.5">
              <label htmlFor="customer-select" className="text-content-secondary font-medium shrink-0">Customer:</label>
              <select
                id="customer-select"
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
                className="px-3 py-1.5 bg-surface-secondary border border-divider rounded-lg font-medium text-content-primary focus:outline-none focus:border-brand-primary cursor-pointer text-xs max-w-[220px] truncate"
              >
                <option value="ALL">All Customers ({kpis.totalBalancePallets}p)</option>
                {customerDropdownData.map((c) => (
                  <option key={c.customer} value={c.customer}>
                    {c.customer} ({c.pallets}p)
                  </option>
                ))}
              </select>
            </div>

            {/* Search Input */}
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-content-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search invoice, container, vehicle..."
                className="w-full pl-8 pr-7 py-1.5 bg-surface-secondary/50 border border-divider rounded-lg text-xs text-content-primary placeholder-content-muted focus:outline-none focus:border-brand-primary"
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
                className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-medium flex items-center space-x-1 transition-colors cursor-pointer"
                title="Reset filters"
              >
                <X className="w-3 h-3" />
                <span>Clear Filters</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA: OCCUPIES 100% FULL WIDTH (GRID REMOVED) */}
      <main className="flex-1 overflow-auto p-4 sm:p-5 relative">
        {/* =====================================================================
            SECTION 1: INVENTORY (FLOOR STOCK & PALLET PICKING)
            ===================================================================== */}
        {activeSection === 'inventory' && (
          <div className="space-y-4 pb-24">
            {/* Filter & Status Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface border border-divider rounded-xl p-3 shadow-xs">
              <div>
                <h2 className="text-xs font-bold text-content-primary uppercase tracking-wide">
                  Floor Stock &amp; Pallet Picking
                </h2>
                <p className="text-xs text-content-secondary mt-0.5">
                  {activeStockInvoices.length} active invoices • {availablePalletUnits.length} available pallets on floor
                </p>
              </div>

              {/* Status Filter Buttons */}
              <div className="flex items-center space-x-1.5 text-xs font-mono">
                {(['ALL', 'PENDING_GATE_IN', 'IN_WAREHOUSE', 'SHORTFALL'] as const).map((st) => {
                  const labels = {
                    ALL: 'All Active',
                    PENDING_GATE_IN: 'Pending Gate-In',
                    IN_WAREHOUSE: 'Ready in Warehouse',
                    SHORTFALL: 'Shortfall'
                  };
                  return (
                    <button
                      key={st}
                      onClick={() => setInventoryStatusFilter(st)}
                      className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer font-sans text-xs ${
                        inventoryStatusFilter === st
                          ? 'bg-brand-primary text-white font-semibold'
                          : 'bg-surface hover:bg-surface-secondary text-content-secondary border border-divider'
                      }`}
                    >
                      {labels[st]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Invoices List */}
            {activeStockInvoices.length === 0 ? (
              <div className="text-center py-20 bg-surface border border-dashed border-divider rounded-xl p-8">
                <Boxes className="w-10 h-10 text-content-muted mx-auto mb-2 opacity-60" />
                <h3 className="text-xs font-semibold text-content-secondary">No active stock matching selected filters</h3>
                <p className="text-xs text-content-muted mt-1">Try adjusting your customer filter or search query</p>
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
                      {/* Invoice Summary Header */}
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
                            <div className="mt-1 flex items-center space-x-2 text-xs font-mono text-content-secondary">
                              <span>POD: <strong className="text-content-primary">{entry.pod || '-'}</strong></span>
                              <span>•</span>
                              <span>Invoiced: <strong className="text-content-primary">{entry.invoicedPallets} Plt</strong></span>
                              <span>•</span>
                              <span>Gross Wt: <strong className="text-content-primary">{entry.invoicedGrossWeightKg} kg</strong></span>
                            </div>
                          </div>
                        </div>

                        {/* Status & Gate-In Controls */}
                        <div className="flex flex-wrap items-center gap-2.5 text-xs">
                          {/* Live Balance */}
                          <div className="px-2.5 py-1 rounded-lg bg-surface border border-divider text-xs font-mono">
                            <span className="text-content-secondary">Floor Balance: </span>
                            <strong className="text-emerald-700 font-bold">{entry.balancePallets} Plt</strong>
                            <span className="text-content-muted"> / </span>
                            <strong className="text-indigo-700 font-bold">{entry.balanceBatteries} Units</strong>
                          </div>

                          {/* Gate-in status badge */}
                          {entry.actualReceivedPallets < entry.invoicedPallets ? (
                            <button
                              onClick={() => handleConfirmFullGateIn(entry.id)}
                              className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
                              title="Click to confirm full gate-in receipt"
                            >
                              <span>Pending Gate-In ({entry.actualReceivedPallets}/{entry.invoicedPallets})</span>
                              <span className="underline ml-1 font-bold">Confirm</span>
                            </button>
                          ) : (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold flex items-center space-x-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>100% Received</span>
                            </span>
                          )}

                          {/* Select All for Invoice */}
                          {availableUnits.length > 0 && (
                            <button
                              onClick={() => toggleSelectAllForInvoice(entry)}
                              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                                allSelected
                                  ? 'bg-brand-primary text-white border-brand-primary'
                                  : 'bg-surface hover:bg-surface-secondary text-content-primary border-divider'
                              }`}
                            >
                              {allSelected ? 'Deselect Invoice' : `Select All (${availableUnits.length} Plt)`}
                            </button>
                          )}

                          {/* Delete Invoice */}
                          <button
                            type="button"
                            onClick={() => promptDeleteInvoice(entry)}
                            className="p-1.5 rounded-lg text-content-muted hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
                            title={`Delete invoice ${entry.customInvoiceNo} and all its pallets`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Gate-In Edit Strip */}
                      <div className="px-4 py-2 bg-slate-50 border-b border-divider text-xs flex flex-wrap items-center gap-4 text-content-secondary">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-medium">Carting Date:</span>
                          <InlineCell
                            value={entry.cartingInDate}
                            className="w-24 bg-surface"
                            onChange={(val) => {
                              addOrUpdateCFSEntry({ ...entry, cartingInDate: val });
                              reloadEntries();
                            }}
                          />
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <span className="font-medium">Vehicle No:</span>
                          <InlineCell
                            value={entry.vehicleNo}
                            className="w-28 bg-surface"
                            onChange={(val) => {
                              addOrUpdateCFSEntry({ ...entry, vehicleNo: val });
                              reloadEntries();
                            }}
                          />
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <span className="font-medium">Received Pallets:</span>
                          <InlineCell
                            value={entry.actualReceivedPallets}
                            type="number"
                            className="w-14 bg-surface text-right"
                            onChange={(val) => {
                              const num = parseInt(val, 10) || 0;
                              addOrUpdateCFSEntry({ ...entry, actualReceivedPallets: num });
                              reloadEntries();
                            }}
                          />
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <span className="font-medium">Received Units:</span>
                          <InlineCell
                            value={entry.actualReceivedBatteries}
                            type="number"
                            className="w-16 bg-surface text-right"
                            onChange={(val) => {
                              const num = parseInt(val, 10) || 0;
                              addOrUpdateCFSEntry({ ...entry, actualReceivedBatteries: num });
                              reloadEntries();
                            }}
                          />
                        </div>

                        {(entry.shortfallPallets > 0 || entry.shortfallBatteries > 0) && (
                          <div className="text-rose-700 font-bold ml-auto">
                            Shortfall: {entry.shortfallPallets} Plt / {entry.shortfallBatteries} Units
                          </div>
                        )}
                      </div>

                      {/* Expandable Pallets Grid */}
                      {isExpanded && (
                        <div className="p-3 sm:p-4 bg-surface border-t border-divider/60">
                          <div className="text-xs font-semibold text-content-secondary mb-2 flex items-center justify-between">
                            <span>Pallet Units ({entry.pallets?.length || 0} Total • {availableUnits.length} Ready in Warehouse):</span>
                            <span className="text-content-muted font-normal">Click a pallet to select for container loading</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2 font-mono">
                            {(entry.pallets || []).map((pallet) => {
                              const isSelected = selectedPalletIds.has(pallet.id);
                              const isStuffed = pallet.status === 'STUFFED_DISPATCHED';
                              const isPending = pallet.status === 'PENDING_GATE_IN';

                              return (
                                <div
                                  key={pallet.id}
                                  onClick={() => {
                                    if (!isStuffed && !isPending) {
                                      togglePalletSelection(pallet.id, entry.customer);
                                    }
                                  }}
                                  className={`p-2 rounded-lg border text-xs transition-all ${
                                    isStuffed
                                      ? 'bg-slate-100 text-content-muted border-slate-200 cursor-not-allowed opacity-75'
                                      : isPending
                                      ? 'bg-amber-50/50 text-amber-900 border-amber-200 cursor-not-allowed'
                                      : isSelected
                                      ? 'bg-brand-primary-soft border-brand-primary ring-1 ring-brand-primary cursor-pointer shadow-xs'
                                      : 'bg-surface border-divider hover:border-brand-primary cursor-pointer'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-1.5">
                                      {!isStuffed && !isPending && (
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => {}}
                                          className="rounded border-divider text-brand-primary focus:ring-brand-primary"
                                        />
                                      )}
                                      <span className="font-bold text-brand-primary">
                                        PLT #{pallet.palletNumber}
                                      </span>
                                    </div>
                                    <div className="flex items-center space-x-1">
                                      <span className="text-[10px] px-1 py-0.2 rounded bg-surface-secondary border border-divider text-content-secondary truncate max-w-[70px]">
                                        {pallet.model}
                                      </span>
                                      {!isStuffed && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            promptDeletePallet(entry, pallet);
                                          }}
                                          className="p-0.5 rounded text-content-muted hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                          title={`Delete Pallet #${pallet.palletNumber}`}
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  <div className="mt-1 flex items-center justify-between text-[11px]">
                                    <span className="text-content-secondary">Qty:</span>
                                    <strong className="text-content-primary">{pallet.receivedBatteries || pallet.invoicedBatteries} u</strong>
                                  </div>

                                  <div className="mt-0.5 flex items-center justify-between text-[10px] text-content-muted">
                                    <span>{pallet.grossWeightKg} kg</span>
                                    <span className="uppercase font-semibold">
                                      {isStuffed ? 'Shipped' : isPending ? 'Pending' : 'Ready'}
                                    </span>
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

            {/* Bottom Docked Pallet Action Bar */}
            {selectedPalletIds.size > 0 && (
              <div className="fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-divider p-3 sm:p-4 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
                <div className="flex items-center space-x-3 text-xs font-mono">
                  <span className="px-2.5 py-1 rounded-md bg-brand-primary text-white font-bold">
                    Selected: {selectedPalletsStats.count} Pallets
                  </span>
                  <span className="text-content-secondary">
                    {selectedPalletsStats.batteries.toLocaleString()} Units • {selectedPalletsStats.grossKg.toLocaleString()} kg
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold hidden md:inline">
                    Requires {selectedPalletsStats.required20GP} × 20' GP
                  </span>
                  {selectedDispatchCustomer && (
                    <span className="text-content-muted hidden lg:inline">
                      Customer: <strong className="text-content-primary font-sans">{selectedDispatchCustomer}</strong>
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2 text-xs">
                  <button
                    onClick={() => {
                      setSelectedPalletIds(new Set());
                      setSelectedDispatchCustomer('');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-secondary border border-divider cursor-pointer"
                  >
                    Clear
                  </button>

                  <button
                    type="button"
                    onClick={promptDeleteSelectedPallets}
                    className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold flex items-center space-x-1.5 cursor-pointer shadow-xs transition-colors"
                    title="Delete selected pallets from inventory"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Selected ({selectedPalletsStats.count})</span>
                  </button>

                  <button
                    onClick={handleLoadSelectedIntoWorkspace}
                    className="px-3.5 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-brand-primary border border-brand-primary font-semibold flex items-center space-x-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Load into 20' GP Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setShowDispatchModal(true)}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center space-x-1.5 cursor-pointer shadow-xs"
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
            SECTION 2: MONTHLY LIVE REPORTS (22-COL STOCK & 17-COL CARTING)
            ===================================================================== */}
        {activeSection === 'reports' && (
          <div className="space-y-4 pb-20">
            {/* Reports Control Bar */}
            <div className="bg-surface border border-divider rounded-xl p-3 sm:p-4 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xs font-bold text-content-primary uppercase tracking-wide">
                    Monthly Live Reports
                  </h2>
                  <p className="text-xs text-content-secondary mt-0.5">
                    {reportType === 'stock_22' ? '22-Column CFS Stock Report' : '17-Column CFS Carting Gate-In Report'}
                  </p>
                </div>

                {/* Report Type Switcher + Export Buttons */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="bg-surface-secondary border border-divider p-0.5 rounded-lg flex items-center space-x-0.5 font-semibold">
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
                    title="Print active report"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-700" />
                    <span>Print / PDF</span>
                  </button>
                </div>
              </div>

              {/* Month Selector Pills & Custom Date Range */}
              <div className="pt-2 border-t border-divider/60 flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs">
                {/* Month Pills */}
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

                {/* Custom Date Range */}
                <div className="flex items-center space-x-1.5 font-mono text-xs">
                  <span className="text-content-secondary font-sans text-xs mr-1 shrink-0 font-medium">Date Range:</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="px-2 py-1 rounded bg-surface border border-divider text-xs text-content-primary focus:outline-none focus:border-brand-primary"
                    title="From Date"
                  />
                  <span className="text-content-muted">–</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="px-2 py-1 rounded bg-surface border border-divider text-xs text-content-primary focus:outline-none focus:border-brand-primary"
                    title="To Date"
                  />
                  {(dateFrom || dateTo) && (
                    <button
                      onClick={() => {
                        setDateFrom('');
                        setDateTo('');
                      }}
                      className="text-xs text-rose-600 hover:underline cursor-pointer ml-1"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* REPORT VIEW 1: 22-COLUMN STOCK REPORT */}
            {reportType === 'stock_22' && (
              <div className="bg-surface border border-divider rounded-xl shadow-xs overflow-hidden">
                <div className="overflow-x-auto max-h-[700px]">
                  <table className="w-full text-xs font-mono border-collapse select-text">
                    {/* Color-coded Group Headers */}
                    <thead className="bg-surface-secondary sticky top-0 z-10 border-b border-divider">
                      <tr className="text-[10px] uppercase font-bold text-content-secondary text-center tracking-wider">
                        <th colSpan={4} className="py-1 border-r border-divider bg-slate-100">
                          Shipment Details
                        </th>
                        <th colSpan={2} className="py-1 border-r border-divider bg-blue-50 text-blue-900">
                          As Received (Invoice)
                        </th>
                        <th colSpan={3} className="py-1 border-r border-divider bg-emerald-50 text-emerald-900">
                          Actual Received
                        </th>
                        <th colSpan={2} className="py-1 border-r border-divider bg-rose-50 text-rose-900">
                          Short Fall
                        </th>
                        <th colSpan={2} className="py-1 border-r border-divider bg-purple-50 text-purple-900">
                          Actual Stuffed
                        </th>
                        <th colSpan={2} className="py-1 border-r border-divider bg-amber-50 text-amber-900">
                          Balance
                        </th>
                        <th colSpan={2} className="py-1 border-r border-divider bg-indigo-50 text-indigo-900">
                          Shipping Bill
                        </th>
                        <th colSpan={4} className="py-1 border-r border-divider bg-slate-100">
                          Container &amp; Gate-In
                        </th>
                        <th className="py-1 bg-slate-200 text-slate-800">
                          CFS
                        </th>
                      </tr>

                      {/* 22 Column Sub-headers */}
                      <tr className="text-[11px] font-semibold text-content-primary border-b border-divider bg-surface text-left">
                        <th className="p-2 border-r border-divider whitespace-nowrap">Month</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap min-w-[140px]">Customer</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap">Invoice No</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap">POD</th>

                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-blue-50/40">Plt</th>
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-blue-50/40">Units</th>

                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-emerald-50/40">Plt</th>
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-emerald-50/40">Units</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap bg-emerald-50/40">Recd Date</th>

                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-rose-50/40">Plt</th>
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-rose-50/40">Units</th>

                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-purple-50/40">Plt</th>
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-purple-50/40">Units</th>

                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-amber-50/40 font-bold text-emerald-700">Plt</th>
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-amber-50/40 font-bold text-indigo-700">Units</th>

                        <th className="p-2 border-r border-divider whitespace-nowrap bg-indigo-50/40">SB No</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap bg-indigo-50/40">SB Date</th>

                        <th className="p-2 border-r border-divider whitespace-nowrap">Container No</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap">Stuffing Date</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap">Pickup Date</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap">Port Gate-In</th>

                        <th className="p-2 text-center whitespace-nowrap bg-slate-50">Days</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-divider/60">
                      {filteredEntries.length === 0 ? (
                        <tr>
                          <td colSpan={22} className="p-12 text-center text-content-muted">
                            No stock records found matching filters.
                          </td>
                        </tr>
                      ) : (
                        filteredEntries.map((e) => (
                          <tr key={e.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-2 border-r border-divider whitespace-nowrap text-content-secondary font-medium">
                              {e.month}
                            </td>
                            <td className="p-2 border-r border-divider whitespace-nowrap text-content-primary font-sans font-medium max-w-[160px] truncate" title={e.customer}>
                              {e.customer}
                            </td>
                            <td className="p-2 border-r border-divider whitespace-nowrap font-bold text-brand-primary">
                              {e.customInvoiceNo}
                            </td>
                            <td className="p-2 border-r border-divider whitespace-nowrap text-content-secondary">
                              {e.pod || '-'}
                            </td>

                            {/* Invoiced */}
                            <td className="p-2 border-r border-divider text-right bg-blue-50/20">
                              {e.invoicedPallets}
                            </td>
                            <td className="p-2 border-r border-divider text-right bg-blue-50/20">
                              {e.invoicedBatteries.toLocaleString()}
                            </td>

                            {/* Actual Received */}
                            <td className="p-2 border-r border-divider text-right bg-emerald-50/20">
                              <InlineCell
                                value={e.actualReceivedPallets}
                                type="number"
                                align="right"
                                onChange={(val) => {
                                  const v = parseInt(val, 10) || 0;
                                  addOrUpdateCFSEntry({ ...e, actualReceivedPallets: v });
                                  reloadEntries();
                                }}
                              />
                            </td>
                            <td className="p-2 border-r border-divider text-right bg-emerald-50/20">
                              <InlineCell
                                value={e.actualReceivedBatteries}
                                type="number"
                                align="right"
                                onChange={(val) => {
                                  const v = parseInt(val, 10) || 0;
                                  addOrUpdateCFSEntry({ ...e, actualReceivedBatteries: v });
                                  reloadEntries();
                                }}
                              />
                            </td>
                            <td className="p-2 border-r border-divider whitespace-nowrap bg-emerald-50/20">
                              <InlineCell
                                value={e.lastPltRecdDate || e.cartingInDate}
                                onChange={(val) => {
                                  addOrUpdateCFSEntry({ ...e, lastPltRecdDate: val });
                                  reloadEntries();
                                }}
                              />
                            </td>

                            {/* Short Fall */}
                            <td className="p-2 border-r border-divider text-right bg-rose-50/20 font-bold text-rose-700">
                              {e.shortfallPallets || 0}
                            </td>
                            <td className="p-2 border-r border-divider text-right bg-rose-50/20 text-rose-700">
                              {e.shortfallBatteries || 0}
                            </td>

                            {/* Actual Stuffed */}
                            <td className="p-2 border-r border-divider text-right bg-purple-50/20 font-semibold">
                              {e.actualStuffedPallets || 0}
                            </td>
                            <td className="p-2 border-r border-divider text-right bg-purple-50/20">
                              {(e.actualStuffedBatteries || 0).toLocaleString()}
                            </td>

                            {/* Balance */}
                            <td className="p-2 border-r border-divider text-right bg-amber-50/30 font-bold text-emerald-700">
                              {e.balancePallets}
                            </td>
                            <td className="p-2 border-r border-divider text-right bg-amber-50/30 font-bold text-indigo-700">
                              {e.balanceBatteries.toLocaleString()}
                            </td>

                            {/* Shipping Bill */}
                            <td className="p-2 border-r border-divider whitespace-nowrap bg-indigo-50/20">
                              <InlineCell
                                value={e.shippingBillNo}
                                onChange={(val) => {
                                  addOrUpdateCFSEntry({ ...e, shippingBillNo: val });
                                  reloadEntries();
                                }}
                              />
                            </td>
                            <td className="p-2 border-r border-divider whitespace-nowrap bg-indigo-50/20">
                              <InlineCell
                                value={e.shippingBillDate}
                                onChange={(val) => {
                                  addOrUpdateCFSEntry({ ...e, shippingBillDate: val });
                                  reloadEntries();
                                }}
                              />
                            </td>

                            {/* Container & Logistics */}
                            <td className="p-2 border-r border-divider whitespace-nowrap font-bold text-blue-700">
                              <InlineCell
                                value={e.containerNo}
                                onChange={(val) => {
                                  addOrUpdateCFSEntry({ ...e, containerNo: val.toUpperCase() });
                                  reloadEntries();
                                }}
                              />
                            </td>
                            <td className="p-2 border-r border-divider whitespace-nowrap">
                              <InlineCell
                                value={e.stuffingDate}
                                onChange={(val) => {
                                  addOrUpdateCFSEntry({ ...e, stuffingDate: val });
                                  reloadEntries();
                                }}
                              />
                            </td>
                            <td className="p-2 border-r border-divider whitespace-nowrap">
                              <InlineCell
                                value={e.pickupDate}
                                onChange={(val) => {
                                  addOrUpdateCFSEntry({ ...e, pickupDate: val });
                                  reloadEntries();
                                }}
                              />
                            </td>
                            <td className="p-2 border-r border-divider whitespace-nowrap">
                              <InlineCell
                                value={e.portGateInDate}
                                onChange={(val) => {
                                  addOrUpdateCFSEntry({ ...e, portGateInDate: val });
                                  reloadEntries();
                                }}
                              />
                            </td>

                            {/* Days in CFS */}
                            <td className="p-2 text-center whitespace-nowrap font-bold bg-slate-50">
                              {e.daysInCFS || 0}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* REPORT VIEW 2: 17-COLUMN CARTING GATE-IN REPORT */}
            {reportType === 'carting_17' && (
              <div className="bg-surface border border-divider rounded-xl shadow-xs overflow-hidden">
                <div className="overflow-x-auto max-h-[700px]">
                  <table className="w-full text-xs font-mono border-collapse select-text">
                    <thead className="bg-surface-secondary sticky top-0 z-10 border-b border-divider">
                      <tr className="text-[11px] font-semibold text-content-primary border-b border-divider text-left">
                        <th className="p-2 border-r border-divider whitespace-nowrap">Month</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap">Carting In Date</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap">Vehicle No</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap min-w-[140px]">Customer</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap">Invoice No</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap">Invoice Date</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap">POD</th>
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap">Inv Plt</th>
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap">Inv Qty</th>
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap">Gross Wt (kg)</th>
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-emerald-50 text-emerald-900 font-bold">Recd Plt</th>
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-emerald-50 text-emerald-900 font-bold">Recd Qty</th>
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-rose-50 text-rose-900">Short Plt</th>
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-rose-50 text-rose-900">Short Qty</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap">Last Plt Recd</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap">Model Breakdown</th>
                        <th className="p-2 text-center whitespace-nowrap">Pallet Details</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-divider/60">
                      {filteredEntries.length === 0 ? (
                        <tr>
                          <td colSpan={17} className="p-12 text-center text-content-muted">
                            No carting records found matching filters.
                          </td>
                        </tr>
                      ) : (
                        filteredEntries.map((e) => {
                          const isExpanded = expandedCartingInvoiceIds.has(e.id);
                          return (
                            <React.Fragment key={e.id}>
                              <tr className="hover:bg-slate-50/80 transition-colors">
                                <td className="p-2 border-r border-divider whitespace-nowrap">{e.month}</td>
                                <td className="p-2 border-r border-divider whitespace-nowrap font-bold">
                                  <InlineCell
                                    value={e.cartingInDate}
                                    onChange={(val) => {
                                      addOrUpdateCFSEntry({ ...e, cartingInDate: val });
                                      reloadEntries();
                                    }}
                                  />
                                </td>
                                <td className="p-2 border-r border-divider whitespace-nowrap">
                                  <InlineCell
                                    value={e.vehicleNo}
                                    onChange={(val) => {
                                      addOrUpdateCFSEntry({ ...e, vehicleNo: val });
                                      reloadEntries();
                                    }}
                                  />
                                </td>
                                <td className="p-2 border-r border-divider whitespace-nowrap font-sans font-medium text-content-primary">
                                  {e.customer}
                                </td>
                                <td className="p-2 border-r border-divider whitespace-nowrap font-bold text-brand-primary">
                                  {e.customInvoiceNo}
                                </td>
                                <td className="p-2 border-r border-divider whitespace-nowrap">{e.createdAt ? formatToDDMMYYYY(new Date(e.createdAt)) : '-'}</td>
                                <td className="p-2 border-r border-divider whitespace-nowrap">{e.pod || '-'}</td>

                                <td className="p-2 border-r border-divider text-right">{e.invoicedPallets}</td>
                                <td className="p-2 border-r border-divider text-right">{e.invoicedBatteries.toLocaleString()}</td>
                                <td className="p-2 border-r border-divider text-right">{e.invoicedGrossWeightKg.toLocaleString()}</td>

                                <td className="p-2 border-r border-divider text-right bg-emerald-50/30 font-bold text-emerald-800">
                                  <InlineCell
                                    value={e.actualReceivedPallets}
                                    type="number"
                                    align="right"
                                    onChange={(val) => {
                                      const v = parseInt(val, 10) || 0;
                                      addOrUpdateCFSEntry({ ...e, actualReceivedPallets: v });
                                      reloadEntries();
                                    }}
                                  />
                                </td>
                                <td className="p-2 border-r border-divider text-right bg-emerald-50/30 font-bold text-emerald-800">
                                  <InlineCell
                                    value={e.actualReceivedBatteries}
                                    type="number"
                                    align="right"
                                    onChange={(val) => {
                                      const v = parseInt(val, 10) || 0;
                                      addOrUpdateCFSEntry({ ...e, actualReceivedBatteries: v });
                                      reloadEntries();
                                    }}
                                  />
                                </td>

                                <td className="p-2 border-r border-divider text-right bg-rose-50/30 font-bold text-rose-700">
                                  {e.shortfallPallets || 0}
                                </td>
                                <td className="p-2 border-r border-divider text-right bg-rose-50/30 font-bold text-rose-700">
                                  {e.shortfallBatteries || 0}
                                </td>

                                <td className="p-2 border-r border-divider whitespace-nowrap">
                                  <InlineCell
                                    value={e.lastPltRecdDate || e.cartingInDate}
                                    onChange={(val) => {
                                      addOrUpdateCFSEntry({ ...e, lastPltRecdDate: val });
                                      reloadEntries();
                                    }}
                                  />
                                </td>

                                <td className="p-2 border-r border-divider text-[10px] max-w-[200px] truncate" title={Array.from(new Set((e.pallets || []).map((p) => p.model))).filter(Boolean).join(', ')}>
                                  {Array.from(new Set((e.pallets || []).map((p) => p.model))).filter(Boolean).join(', ') || '-'}
                                </td>

                                <td className="p-2 text-center whitespace-nowrap">
                                  <button
                                    onClick={() => {
                                      setExpandedCartingInvoiceIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(e.id)) next.delete(e.id);
                                        else next.add(e.id);
                                        return next;
                                      });
                                    }}
                                    className="px-2 py-0.5 rounded bg-surface hover:bg-surface-secondary border border-divider text-brand-primary font-semibold text-[11px] cursor-pointer"
                                  >
                                    {isExpanded ? 'Hide' : `View (${e.pallets?.length || 0})`}
                                  </button>
                                </td>
                              </tr>

                              {isExpanded && (
                                <tr>
                                  <td colSpan={17} className="p-3 bg-surface-secondary/50 border-b border-divider">
                                    <div className="space-y-2">
                                      <div className="text-xs font-semibold text-content-primary flex items-center justify-between">
                                        <span>Gate-In Pallets for {e.customInvoiceNo}:</span>
                                        <span className="text-content-muted text-[11px]">Click quantity to edit received counts</span>
                                      </div>

                                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                                        {(e.pallets || []).map((p) => {
                                          return (
                                            <div
                                              key={p.id}
                                              className="p-2 rounded-lg bg-surface border border-divider shadow-xs space-y-1 text-xs"
                                            >
                                              <div className="flex items-center justify-between">
                                                <span className="font-bold text-brand-primary">PLT #{p.palletNumber}</span>
                                                <span className="text-[10px] px-1 py-0.2 rounded bg-surface-secondary text-content-secondary truncate max-w-[60px]">{p.model}</span>
                                              </div>
                                              <div className="flex items-center justify-between text-[11px]">
                                                <span className="text-content-secondary">INVOICED:</span>
                                                <strong className="text-content-primary">{p.invoicedBatteries}u</strong>
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
            SECTION 3: INVENTORY LOGS (CUSTOMER-WISE AUDIT TRAIL)
            ===================================================================== */}
        {activeSection === 'logs' && (
          <div className="space-y-4 pb-20">
            {/* Logs Header Strip */}
            <div className="bg-surface border border-divider rounded-xl p-3 sm:p-4 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xs font-bold text-content-primary uppercase tracking-wide">
                    Inventory Movement Logs
                  </h2>
                  <p className="text-xs text-content-secondary mt-0.5">
                    Chronological audit trail of outgoing dispatches (Stock-Out) and factory receipts (Stock-In)
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => exportCFSMovementLogsXlsx(filteredMovementRecords)}
                    className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary border border-divider text-xs font-medium flex items-center space-x-1.5 transition-colors shadow-xs cursor-pointer"
                    title="Export movement logs to Excel"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-600" />
                    <span>Export Logs (.xlsx)</span>
                  </button>
                </div>
              </div>

              {/* Customer Outgoing Summary Strip */}
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

              {/* Direction Filter Buttons */}
              <div className="pt-2 border-t border-divider/60 flex items-center space-x-1.5 text-xs font-mono">
                <span className="text-content-secondary font-sans mr-1 font-medium">Movement:</span>
                {(['ALL', 'STOCK_OUT', 'STOCK_IN'] as const).map((dir) => (
                  <button
                    key={dir}
                    onClick={() => setLogDirectionFilter(dir)}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer font-sans text-xs ${
                      logDirectionFilter === dir
                        ? 'bg-brand-primary text-white font-semibold'
                        : 'bg-surface hover:bg-surface-secondary text-content-secondary border border-divider'
                    }`}
                  >
                    {dir === 'ALL' ? 'All Movements' : dir === 'STOCK_OUT' ? 'Stock-Out (Dispatched)' : 'Stock-In (Gate-In)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Movement Logs Table */}
            <div className="bg-surface border border-divider rounded-xl shadow-xs overflow-hidden">
              <div className="overflow-x-auto max-h-[700px]">
                <table className="w-full text-xs font-mono border-collapse select-text">
                  <thead className="bg-surface-secondary sticky top-0 z-10 border-b border-divider">
                    <tr className="text-[11px] font-semibold text-content-primary border-b border-divider text-left">
                      <th className="p-2.5 border-r border-divider whitespace-nowrap">Date</th>
                      <th className="p-2.5 border-r border-divider whitespace-nowrap">Direction</th>
                      <th className="p-2.5 border-r border-divider whitespace-nowrap min-w-[140px]">Customer</th>
                      <th className="p-2.5 border-r border-divider whitespace-nowrap">Invoice No</th>
                      <th className="p-2.5 border-r border-divider whitespace-nowrap">Battery / Model</th>
                      <th className="p-2.5 border-r border-divider text-right whitespace-nowrap">Pallets</th>
                      <th className="p-2.5 border-r border-divider text-right whitespace-nowrap">Units</th>
                      <th className="p-2.5 border-r border-divider text-right whitespace-nowrap">Gross kg</th>
                      <th className="p-2.5 border-r border-divider whitespace-nowrap">Container No</th>
                      <th className="p-2.5 border-r border-divider whitespace-nowrap">Seal No</th>
                      <th className="p-2.5 border-r border-divider whitespace-nowrap">Shipping Bill</th>
                      <th className="p-2.5 border-r border-divider whitespace-nowrap">Vehicle No</th>
                      <th className="p-2.5 text-right whitespace-nowrap">Remaining Balance</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-divider/60">
                    {filteredMovementRecords.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="p-12 text-center text-content-muted">
                          <History className="w-8 h-8 mx-auto mb-1 opacity-50" />
                          <p>No inventory movements recorded matching criteria.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredMovementRecords.map((r) => {
                        const isStockOut = r.direction === 'STOCK_OUT';
                        return (
                          <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-2.5 border-r border-divider whitespace-nowrap font-medium text-content-primary">
                              {r.movementDate}
                            </td>
                            <td className="p-2.5 border-r border-divider whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider ${
                                  isStockOut
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                                }`}
                              >
                                {isStockOut ? 'STOCK-OUT' : 'STOCK-IN'}
                              </span>
                            </td>
                            <td className="p-2.5 border-r border-divider whitespace-nowrap font-sans font-medium text-content-primary max-w-[150px] truncate" title={r.customer}>
                              {r.customer}
                            </td>
                            <td className="p-2.5 border-r border-divider whitespace-nowrap font-bold text-brand-primary">
                              {r.customInvoiceNo}
                            </td>
                            <td className="p-2.5 border-r border-divider whitespace-nowrap text-content-secondary max-w-[160px] truncate" title={r.modelDescription}>
                              {r.modelDescription || '-'}
                            </td>
                            <td className="p-2.5 border-r border-divider text-right font-bold text-content-primary">
                              {r.pallets}
                            </td>
                            <td className="p-2.5 border-r border-divider text-right text-content-primary">
                              {r.batteries.toLocaleString()}
                            </td>
                            <td className="p-2.5 border-r border-divider text-right text-content-secondary">
                              {(r.grossWeightKg || 0).toLocaleString()}
                            </td>
                            <td className="p-2.5 border-r border-divider whitespace-nowrap font-bold text-blue-700">
                              {r.containerNo || '-'}
                            </td>
                            <td className="p-2.5 border-r border-divider whitespace-nowrap text-content-secondary">
                              {r.sealNo || '-'}
                            </td>
                            <td className="p-2.5 border-r border-divider whitespace-nowrap text-content-secondary">
                              {r.shippingBillNo ? `${r.shippingBillNo} (${r.shippingBillDate || '-'})` : '-'}
                            </td>
                            <td className="p-2.5 border-r border-divider whitespace-nowrap text-content-secondary">
                              {r.vehicleNo || '-'}
                            </td>
                            <td className="p-2.5 text-right whitespace-nowrap font-bold text-emerald-700">
                              {r.remainingBalancePallets} Plt / {r.remainingBalanceBatteries}u
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
      </main>

      {/* Stuffing & Dispatch Modal */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-divider rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-divider">
              <div className="flex items-center space-x-2 text-sm font-bold text-content-primary">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Confirm Dispatch (Stock-Out)</span>
              </div>
              <button
                onClick={() => setShowDispatchModal(false)}
                className="text-content-muted hover:text-content-primary cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-content-secondary leading-relaxed">
              Deduct <strong className="font-mono text-content-primary font-bold">{selectedPalletsStats.count} pallets</strong> ({selectedPalletsStats.batteries} units) from warehouse balance for <strong className="text-content-primary">{selectedDispatchCustomer}</strong>.
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
                <label className="block text-content-secondary mb-1">Port Gate-In Date</label>
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

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface border border-divider rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-2 rounded-lg bg-rose-50 border border-rose-200">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <h3 className="text-sm font-bold text-content-primary">
                {itemToDelete.title}
              </h3>
            </div>

            <p className="text-xs text-content-secondary leading-relaxed">
              {itemToDelete.description}
            </p>

            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <span>This action will permanently delete these items from warehouse inventory and cannot be undone.</span>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-divider">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary border border-divider text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
