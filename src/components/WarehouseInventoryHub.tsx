// Ekdant Logistics - Warehouse Inventory
// Clean, simplified operator UI: 3 KPI Cards + Section Dropdown (Inventory, Monthly Live Reports, Inventory Logs)

import React, { useState, useMemo, useRef } from 'react';
import {
  Boxes,
  FileSpreadsheet,
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
  AlertTriangle,
  Truck
} from 'lucide-react';
import type {
  CFSLedgerEntry,
  ExtractedShipmentJSON,
  InventoryMovementRecord,
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
  confirmStuffingDispatch,
  buildShipmentFromStockPallets,
  exportCFSMasterReportXlsx,
  importCFSExcel,
  formatToDDMMYYYY,
  getDerivedInventoryMovements,
  exportCFSMovementLogsXlsx,
  ingestShipmentToLedger,
  deleteMovementLog
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
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState<'ALL' | 'PENDING_GATE_IN' | 'IN_WAREHOUSE' | 'DISPATCHED' | 'SHORTFALL'>('ALL');

  // Logs States
  const [logStatusFilter, setLogStatusFilter] = useState<'ALL' | 'IN_STOCK' | 'DISPATCHED'>('ALL');

  // Stuffing & Dispatch Modal State
  const [showDispatchModal, setShowDispatchModal] = useState<boolean>(false);
  const [showVarianceModal, setShowVarianceModal] = useState<boolean>(false);
  const [showLowStockModal, setShowLowStockModal] = useState<boolean>(false);
  const [lowStockModalFilter, setLowStockModalFilter] = useState<'ALL' | 'NIL' | 'LOW'>('ALL');
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

    // Invoices with variance between Invoiced vs Actual Received Quantity
    const varianceEntries = entries.filter((e) => {
      const palletDiff = Math.abs((e.invoicedPallets || 0) - (e.actualReceivedPallets || 0));
      const batteryDiff = Math.abs((e.invoicedBatteries || 0) - (e.actualReceivedBatteries || 0));
      return (palletDiff > 0 || batteryDiff > 0 || e.shortfallPallets > 0 || e.shortfallBatteries > 0);
    });

    const totalShortfallPallets = entries.reduce((s, e) => s + (e.shortfallPallets || 0), 0);
    const totalShortfallBatteries = entries.reduce((s, e) => s + (e.shortfallBatteries || 0), 0);

    // Low Stock (< 22 Pallets or < 100 Units) and Nil Stock (0 Balance)
    const lowStockEntries = entries.filter((e) => (e.balancePallets || 0) > 0 && (e.balancePallets || 0) < 22);
    const nilStockEntries = entries.filter((e) => (e.balancePallets || 0) === 0 && (e.invoicedPallets || 0) > 0);
    const lowNilStockEntries = entries.filter((e) => (e.balancePallets || 0) < 22);

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
      varianceEntries,
      varianceCount: varianceEntries.length,
      totalShortfallPallets,
      totalShortfallBatteries,
      lowStockEntries,
      lowStockCount: lowStockEntries.length,
      nilStockEntries,
      nilStockCount: nilStockEntries.length,
      lowNilStockEntries
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
      if (inventoryStatusFilter === 'DISPATCHED') {
        return (e.actualStuffedPallets || 0) > 0 || (e.pallets || []).some((p) => p.status === 'STUFFED_DISPATCHED');
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
    showToast(`Loaded ${selectedPalletsStats.count} pallets into Dispatch Tool.`);
    onNavigateToWorkspace();
  };

  // Action: Open Dispatch Dialog for a specific Invoice in the List
  const handleOpenDispatchForInvoice = (entry: CFSLedgerEntry) => {
    const availablePallets = (entry.pallets || []).filter((p) => p.status !== 'STUFFED_DISPATCHED');
    if (availablePallets.length === 0) {
      showToast(`Invoice ${entry.customInvoiceNo} has already been fully dispatched.`);
      return;
    }

    const palletIds = new Set(availablePallets.map((p) => p.id));
    setSelectedPalletIds(palletIds);
    setSelectedDispatchCustomer(entry.customer);

    const today = formatToDDMMYYYY(new Date());
    setDispatchDetails({
      containerNo: entry.containerNo || `CONT-${entry.customInvoiceNo}`,
      sealNo: entry.sealNo || `SL-${Date.now().toString().slice(-6)}`,
      shippingBillNo: entry.shippingBillNo || '',
      shippingBillDate: entry.shippingBillDate || today,
      stuffingDate: entry.stuffingDate || today,
      pickupDate: entry.pickupDate || today,
      portGateInDate: entry.portGateInDate || today
    });

    setShowDispatchModal(true);
  };

  // Action: Confirm Stuffing & Stock-Out Dispatch
  const handleExecuteDispatch = () => {
    if (selectedPalletsStats.palletList.length === 0) return;

    const containerNo = dispatchDetails.containerNo.trim() || `CONT-${Date.now().toString().slice(-4)}`;
    const sealNo = dispatchDetails.sealNo.trim() || `SEAL-${Date.now().toString().slice(-4)}`;

    const { stuffedCount } = confirmStuffingDispatch(
      Array.from(selectedPalletIds),
      {
        ...dispatchDetails,
        containerNo,
        sealNo
      }
    );

    showToast(`Dispatched ${stuffedCount} pallets into Container ${containerNo}! Stock deducted from warehouse.`);
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
    type: 'invoice' | 'pallet' | 'selected_pallets' | 'log';
    id?: string;
    palletId?: string;
    logId?: string;
    title: string;
    description: string;
  } | null>(null);

  const promptDeleteLog = (record: InventoryMovementRecord) => {
    setItemToDelete({
      type: 'log',
      id: record.sourceLedgerId || (record.id.startsWith('log_') ? record.id.replace(/^log_/, '') : undefined),
      logId: record.id,
      title: `Delete Log for ${record.customInvoiceNo}?`,
      description: `This will permanently remove the movement log for invoice ${record.customInvoiceNo} (${record.customer}, ${record.pallets} Plt / ${record.batteries} Units).`
    });
  };

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
    } else if (itemToDelete.type === 'log' && itemToDelete.logId) {
      deleteMovementLog(itemToDelete.logId);
      if (itemToDelete.id) {
        setSelectedPalletIds((prev) => {
          const next = new Set(prev);
          const deletedEntry = entries.find((e) => e.id === itemToDelete.id);
          if (deletedEntry?.pallets) {
            deletedEntry.pallets.forEach((p) => next.delete(p.id));
          }
          if (next.size === 0) setSelectedDispatchCustomer('');
          return next;
        });
      }
      showToast('Movement log deleted successfully.');
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
      if (logStatusFilter === 'IN_STOCK' && r.status !== 'IN_STOCK' && r.status !== 'PARTIAL_DISPATCHED') {
        return false;
      }
      if (logStatusFilter === 'DISPATCHED' && r.status !== 'DISPATCHED' && r.status !== 'PARTIAL_DISPATCHED') {
        return false;
      }
      if (customerFilter !== 'ALL' && r.customer.trim().toUpperCase() !== customerFilter.toUpperCase()) {
        return false;
      }
      if (dateFrom || dateTo) {
        const time =
          parseDateStrToTime(r.receivedDate) ||
          parseDateStrToTime(r.dispatchedDate) ||
          parseDateStrToTime(r.movementDate) ||
          parseDateStrToTime(r.createdAt);
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
  }, [allMovementRecords, logStatusFilter, customerFilter, dateFrom, dateTo, searchQuery]);

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
              Warehouse
            </h1>
          </div>

          <div className="flex items-center space-x-2">
            {/* Prominent Upload Invoice to Inventory (Stock-In) Button */}
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
                  : 'Upload Invoice to Inventory (Stock-In)'}
              </span>
            </button>

            <button
              onClick={onNavigateToWorkspace}
              className="px-3 py-1.5 rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
              title="Open Dispatch Tool"
            >
              <span>Dispatch Tool</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 4 CLEAN KPI CARDS: Available Stock, Dispatched, Invoiced vs Actual Variance, Low/Nil Stock */}
        <div className="p-3 sm:p-4 bg-surface-secondary/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono tabular-nums">
            {/* Card 1: Available Stock */}
            <div className="bg-surface border border-divider rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between pb-1.5 border-b border-divider/60">
                <span className="text-xs font-semibold text-content-primary font-sans">
                  Available Stock
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 pt-0.5 text-center">
                <div className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-surface-secondary/50 border border-divider/40">
                  <span className="text-[10px] text-content-secondary font-sans uppercase tracking-wider block mb-0.5">
                    Pallets
                  </span>
                  <span className="text-lg font-bold text-content-primary leading-tight font-mono">
                    {kpis.totalBalancePallets.toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-surface-secondary/50 border border-divider/40">
                  <span className="text-[10px] text-content-secondary font-sans uppercase tracking-wider block mb-0.5">
                    Units
                  </span>
                  <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400 leading-tight font-mono">
                    {kpis.totalBalanceBatteries.toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-surface-secondary/50 border border-divider/40">
                  <span className="text-[10px] text-content-secondary font-sans uppercase tracking-wider block mb-0.5">
                    Weight
                  </span>
                  <span className="text-sm sm:text-base font-bold text-content-primary leading-tight font-mono truncate max-w-full">
                    {kpis.totalBalanceGrossKg.toLocaleString()} <span className="text-[10px] font-normal text-content-muted">kg</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: Dispatched (Stock-Out) */}
            <div className="bg-surface border border-divider rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between pb-1.5 border-b border-divider/60">
                <span className="text-xs font-semibold text-content-primary font-sans">
                  Dispatched
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 pt-0.5 text-center">
                <div className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-surface-secondary/50 border border-divider/40">
                  <span className="text-[10px] text-content-secondary font-sans uppercase tracking-wider block mb-0.5">
                    Pallets
                  </span>
                  <span className="text-lg font-bold text-content-primary leading-tight font-mono">
                    {kpis.totalStuffedPallets.toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-surface-secondary/50 border border-divider/40">
                  <span className="text-[10px] text-content-secondary font-sans uppercase tracking-wider block mb-0.5">
                    Units
                  </span>
                  <span className="text-lg font-bold text-blue-700 dark:text-blue-400 leading-tight font-mono">
                    {kpis.totalStuffedBatteries.toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-surface-secondary/50 border border-divider/40">
                  <span className="text-[10px] text-content-secondary font-sans uppercase tracking-wider block mb-0.5">
                    Containers
                  </span>
                  <span className="text-sm sm:text-base font-bold text-content-primary leading-tight font-mono truncate max-w-full">
                    {kpis.dispatchedContainersCount} <span className="text-[10px] font-normal text-content-muted">cntr</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Card 3: Shortfall (Invoiced vs Actual Received Variance) */}
            <div
              onClick={() => setShowVarianceModal(true)}
              className="bg-surface border border-divider hover:border-amber-500/60 rounded-xl p-3.5 shadow-xs flex flex-col justify-between cursor-pointer transition-all hover:shadow-md group select-none"
              title="Click to view list of invoices with shortfall/variance between Invoiced and Actual Received quantities"
            >
              <div className="flex items-center justify-between pb-1.5 border-b border-divider/60">
                <span className="text-xs font-semibold text-content-primary font-sans flex items-center space-x-1.5">
                  <span>Shortfall</span>
                </span>
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border transition-colors ${
                  kpis.varianceCount > 0
                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 group-hover:bg-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                }`}>
                  {kpis.varianceCount > 0 ? `${kpis.varianceCount} Discrepant` : '100% Match'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 pt-0.5 text-center">
                <div className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-surface-secondary/50 border border-divider/40">
                  <span className="text-[10px] text-content-secondary font-sans uppercase tracking-wider block mb-0.5">
                    Pallet Diff
                  </span>
                  <span className={`text-lg font-bold leading-tight font-mono ${
                    kpis.totalShortfallPallets > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-content-primary'
                  }`}>
                    {kpis.totalShortfallPallets > 0 ? `-${kpis.totalShortfallPallets}` : '0'}
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-surface-secondary/50 border border-divider/40">
                  <span className="text-[10px] text-content-secondary font-sans uppercase tracking-wider block mb-0.5">
                    Units Diff
                  </span>
                  <span className={`text-lg font-bold leading-tight font-mono ${
                    kpis.totalShortfallBatteries > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-content-primary'
                  }`}>
                    {kpis.totalShortfallBatteries > 0 ? `-${kpis.totalShortfallBatteries.toLocaleString()}` : '0'}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 4: Low & Nil Stock Alerts */}
            <div
              onClick={() => setShowLowStockModal(true)}
              className="bg-surface border border-divider hover:border-rose-500/60 rounded-xl p-3.5 shadow-xs flex flex-col justify-between cursor-pointer transition-all hover:shadow-md group select-none"
              title="Click to view units and products with low or nil warehouse stock"
            >
              <div className="flex items-center justify-between pb-1.5 border-b border-divider/60">
                <span className="text-xs font-semibold text-content-primary font-sans flex items-center space-x-1.5">
                  <span>Low / Nil Stock</span>
                </span>
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border transition-colors ${
                  kpis.lowStockCount > 0 || kpis.nilStockCount > 0
                    ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30 group-hover:bg-rose-500/20'
                    : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                }`}>
                  {kpis.lowStockCount + kpis.nilStockCount > 0 ? `${kpis.lowStockCount + kpis.nilStockCount} Alerts` : 'Optimal'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 pt-0.5 text-center">
                <div className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-surface-secondary/50 border border-divider/40">
                  <span className="text-[10px] text-content-secondary font-sans uppercase tracking-wider block mb-0.5">
                    Low Stock
                  </span>
                  <span className={`text-lg font-bold leading-tight font-mono ${
                    kpis.lowStockCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-content-primary'
                  }`}>
                    {kpis.lowStockCount}
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-surface-secondary/50 border border-divider/40">
                  <span className="text-[10px] text-content-secondary font-sans uppercase tracking-wider block mb-0.5">
                    Nil Stock
                  </span>
                  <span className={`text-lg font-bold leading-tight font-mono ${
                    kpis.nilStockCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-content-primary'
                  }`}>
                    {kpis.nilStockCount}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CONTROLS BAR: SECTION DROPDOWN + CUSTOMER DROPDOWN + SEARCH */}
        <div className="px-4 sm:px-6 py-2.5 bg-surface border-t border-divider flex items-center justify-between gap-3 text-xs overflow-x-auto">
          <div className="flex items-center gap-3 shrink-0">
            {/* Section Selector Dropdown (Yellow items placed in clean dropdown) */}
            <div className="flex items-center space-x-1.5 shrink-0">
              <label htmlFor="section-select" className="text-content-secondary font-medium shrink-0">Section:</label>
              <select
                id="section-select"
                value={activeSection}
                onChange={(e) => setActiveSection(e.target.value as 'inventory' | 'reports' | 'logs')}
                className="px-3 py-1.5 bg-surface-secondary border border-divider rounded-lg font-semibold text-content-primary focus:outline-none focus:border-brand-primary cursor-pointer text-xs shrink-0"
              >
                <option value="inventory">Inventory ({availablePalletUnits.length} pallets)</option>
                <option value="reports">Monthly Live Reports</option>
                <option value="logs">Inventory Logs ({allMovementRecords.length})</option>
              </select>
            </div>

            {/* Customer Dropdown */}
            <div className="flex items-center space-x-1.5 shrink-0">
              <label htmlFor="customer-select" className="text-content-secondary font-medium shrink-0">Customer:</label>
              <select
                id="customer-select"
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
                className="px-3 py-1.5 bg-surface-secondary border border-divider rounded-lg font-medium text-content-primary focus:outline-none focus:border-brand-primary cursor-pointer text-xs max-w-[220px] truncate shrink-0"
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
            <div className="relative w-56 sm:w-64 shrink-0">
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

            {/* Status Filter Dropdown for Logs */}
            {activeSection === 'logs' && (
              <div className="flex items-center space-x-1.5 text-xs shrink-0">
                <label htmlFor="log-status-select" className="text-content-secondary font-medium shrink-0">
                  Status:
                </label>
                <select
                  id="log-status-select"
                  value={logStatusFilter}
                  onChange={(e) => setLogStatusFilter(e.target.value as any)}
                  className="px-3 py-1.5 bg-surface-secondary border border-divider rounded-lg font-medium text-content-primary focus:outline-none focus:border-brand-primary cursor-pointer text-xs"
                >
                  <option value="ALL">All Invoices</option>
                  <option value="IN_STOCK">In Stock</option>
                  <option value="DISPATCHED">Dispatched</option>
                </select>
              </div>
            )}

            {/* Export Logs Button (In-line on single row) */}
            {activeSection === 'logs' && (
              <button
                type="button"
                onClick={() => exportCFSMovementLogsXlsx(filteredMovementRecords)}
                className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary border border-divider text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-xs cursor-pointer shrink-0"
                title="Export movement logs to Excel"
              >
                <Download className="w-3.5 h-3.5 text-blue-600" />
                <span>Export Logs (.xlsx)</span>
              </button>
            )}
          </div>

          {/* Right Actions */}
          <div className="flex items-center space-x-2 shrink-0">
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

              {/* Status Filter Dropdown */}
              <div className="flex items-center space-x-2 text-xs">
                <label htmlFor="status-filter-select" className="text-content-secondary font-medium shrink-0">
                  Status:
                </label>
                <select
                  id="status-filter-select"
                  value={inventoryStatusFilter}
                  onChange={(e) => setInventoryStatusFilter(e.target.value as any)}
                  className="px-3 py-1.5 bg-surface-secondary border border-divider rounded-lg font-medium text-content-primary focus:outline-none focus:border-brand-primary cursor-pointer text-xs"
                >
                  <option value="ALL">All Active</option>
                  <option value="PENDING_GATE_IN">Pending Gate-In</option>
                  <option value="IN_WAREHOUSE">Ready in Warehouse</option>
                  <option value="DISPATCHED">Dispatched (Stock-Out)</option>
                  <option value="SHORTFALL">Shortfall</option>
                </select>
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

                  return (
                    <div
                      key={entry.id}
                      className="bg-surface border border-divider/80 rounded-xl overflow-hidden shadow-xs hover:border-divider transition-all"
                    >
                      {/* Modern Enterprise SaaS Data-Row */}
                      <div className="p-4 bg-surface hover:bg-slate-50/50 transition-colors border-b border-divider/60">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          
                          {/* Left: Expand, Invoice ID, Customer, Port & Carting Date */}
                          <div className="flex items-start space-x-3.5 min-w-0 flex-1">
                            <button
                              onClick={() => {
                                setExpandedInventoryInvoiceIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(entry.id)) next.delete(entry.id);
                                  else next.add(entry.id);
                                  return next;
                                });
                              }}
                              className="mt-0.5 p-1 rounded-md text-content-muted hover:text-content-primary hover:bg-surface-secondary border border-divider/60 transition-colors cursor-pointer shrink-0"
                              title={isExpanded ? 'Collapse Pallets' : 'Expand Pallets'}
                            >
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-sm font-bold text-brand-primary tracking-tight">
                                  #{entry.customInvoiceNo}
                                </span>
                                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-md bg-indigo-50/80 text-indigo-700 font-semibold border border-indigo-200/70">
                                  {entry.month}
                                </span>
                                <span className="text-xs font-semibold text-content-primary" title={entry.customer}>
                                  {entry.customer}
                                </span>
                              </div>

                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-secondary">
                                <span className="flex items-center space-x-1">
                                  <span className="text-content-muted">POD:</span>
                                  <strong className="text-content-primary font-medium">{entry.pod || '—'}</strong>
                                </span>
                                <span className="text-divider">•</span>
                                <span className="flex items-center space-x-1">
                                  <span className="text-content-muted">Gross Wt:</span>
                                  <strong className="text-content-primary font-medium">{(entry.invoicedGrossWeightKg || 0).toLocaleString()} kg</strong>
                                </span>
                                {entry.cartingInDate && (
                                  <>
                                    <span className="text-divider">•</span>
                                    <span className="flex items-center space-x-1">
                                      <span className="text-content-muted">Carting:</span>
                                      <span className="font-mono text-content-primary">{entry.cartingInDate}</span>
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Center: Inventory Progress & Live Balance Metrics */}
                          <div className="flex flex-wrap items-center gap-3 shrink-0 py-1 px-3.5 rounded-lg bg-surface-secondary/70 border border-divider/60">
                            {/* Live Floor Balance */}
                            <div className="flex flex-col text-left">
                              <span className="text-[10px] font-medium uppercase tracking-wider text-content-muted">Floor Balance</span>
                              <div className="flex items-baseline space-x-1.5 font-mono">
                                <span className="text-sm font-bold text-emerald-700">{entry.balancePallets} Plt</span>
                                <span className="text-content-muted text-xs">/</span>
                                <span className="text-xs font-bold text-indigo-700">{entry.balanceBatteries} u</span>
                              </div>
                            </div>

                            <div className="h-7 w-px bg-divider/80 mx-1 hidden sm:block" />

                            {/* Invoiced vs Received Ratio */}
                            <div className="flex flex-col text-left">
                              <span className="text-[10px] font-medium uppercase tracking-wider text-content-muted">Invoiced</span>
                              <div className="flex items-baseline space-x-1 text-xs font-mono text-content-secondary">
                                <span>{entry.invoicedPallets} Plt</span>
                                <span>({entry.invoicedBatteries} u)</span>
                              </div>
                            </div>

                            {/* Shortfall Tag if any */}
                            {(entry.shortfallPallets > 0 || entry.shortfallBatteries > 0) && (
                              <div className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold flex items-center space-x-1">
                                <span>-{entry.shortfallBatteries} u Short</span>
                              </div>
                            )}
                          </div>

                          {/* Right: Actions and Status */}
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Gate-in status badge */}
                            {entry.actualReceivedPallets < entry.invoicedPallets ? (
                              <button
                                onClick={() => handleConfirmFullGateIn(entry.id)}
                                className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-medium flex items-center space-x-1 transition-colors cursor-pointer"
                                title="Click to confirm 100% gate-in receipt"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                <span>Pending ({entry.actualReceivedPallets}/{entry.invoicedPallets})</span>
                              </button>
                            ) : (
                              <span className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-medium flex items-center space-x-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>100% Received</span>
                              </span>
                            )}

                            {/* Dispatch Primary Action Button */}
                            {entry.balancePallets > 0 ? (
                              <button
                                type="button"
                                onClick={() => handleOpenDispatchForInvoice(entry)}
                                className="px-3 py-1.5 rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-white font-medium text-xs flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs"
                                title={`Dispatch ${entry.balancePallets} pallets for invoice ${entry.customInvoiceNo} (Stock-Out)`}
                              >
                                <Truck className="w-3.5 h-3.5" />
                                <span>Dispatch ({entry.balancePallets})</span>
                              </button>
                            ) : (
                              <span className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-500 border border-slate-200 text-xs font-medium flex items-center space-x-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                                <span>Dispatched</span>
                              </span>
                            )}

                            {/* Delete Invoice */}
                            <button
                              type="button"
                              onClick={() => promptDeleteInvoice(entry)}
                              className="p-1.5 rounded-lg text-content-muted hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
                              title={`Delete invoice ${entry.customInvoiceNo}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Docked Inline Form: Gate-In Logistics Details */}
                      <div className="px-4 py-2 bg-slate-50/70 border-b border-divider/60 text-xs flex flex-wrap items-center gap-x-6 gap-y-2 text-content-secondary">
                        <div className="flex items-center space-x-2">
                          <span className="text-content-muted font-medium">Carting Date:</span>
                          <InlineCell
                            value={entry.cartingInDate}
                            className="w-28 bg-surface border border-divider/80 rounded px-1.5"
                            onChange={(val) => {
                              addOrUpdateCFSEntry({ ...entry, cartingInDate: val });
                              reloadEntries();
                            }}
                          />
                        </div>

                        <div className="flex items-center space-x-2">
                          <span className="text-content-muted font-medium">Vehicle No:</span>
                          <InlineCell
                            value={entry.vehicleNo}
                            className="w-28 bg-surface border border-divider/80 rounded px-1.5"
                            onChange={(val) => {
                              addOrUpdateCFSEntry({ ...entry, vehicleNo: val });
                              reloadEntries();
                            }}
                          />
                        </div>

                        <div className="flex items-center space-x-2">
                          <span className="text-content-muted font-medium">Received Pallets:</span>
                          <InlineCell
                            value={entry.actualReceivedPallets}
                            type="number"
                            className="w-14 bg-surface border border-divider/80 rounded text-right px-1.5"
                            onChange={(val) => {
                              const num = parseInt(val, 10) || 0;
                              addOrUpdateCFSEntry({ ...entry, actualReceivedPallets: num });
                              reloadEntries();
                            }}
                          />
                        </div>

                        <div className="flex items-center space-x-2">
                          <span className="text-content-muted font-medium">Received Units:</span>
                          <InlineCell
                            value={entry.actualReceivedBatteries}
                            type="number"
                            className="w-16 bg-surface border border-divider/80 rounded text-right px-1.5"
                            onChange={(val) => {
                              const num = parseInt(val, 10) || 0;
                              addOrUpdateCFSEntry({ ...entry, actualReceivedBatteries: num });
                              reloadEntries();
                            }}
                          />
                        </div>

                        {(entry.shortfallPallets > 0 || entry.shortfallBatteries > 0) && (
                          <div className="text-rose-600 font-semibold ml-auto flex items-center space-x-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            <span>Shortfall: {entry.shortfallPallets} Plt / {entry.shortfallBatteries} Units</span>
                          </div>
                        )}
                      </div>

                      {/* Expandable Pallets Grid */}
                      {isExpanded && (
                        <div className="p-3 sm:p-4 bg-surface border-t border-divider/60">
                          <div className="text-xs font-semibold text-content-secondary mb-2">
                            <span>Pallet Units ({entry.pallets?.length || 0} Total • {availableUnits.length} Ready in Warehouse)</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-6 gap-2.5 font-mono">
                            {(entry.pallets || []).map((pallet) => {
                              const isSelected = selectedPalletIds.has(pallet.id);
                              const isStuffed = pallet.status === 'STUFFED_DISPATCHED';
                              const isPending = pallet.status === 'PENDING_GATE_IN';
                              const displayPalletNum = String(pallet.palletNumber || '').replace(/^PLT\s*#?/i, '').replace(/^#/, '');

                              return (
                                <div
                                  key={pallet.id}
                                  onClick={() => {
                                    if (!isStuffed && !isPending) {
                                      togglePalletSelection(pallet.id, entry.customer);
                                    }
                                  }}
                                  className={`p-2.5 rounded-lg border text-xs transition-all flex flex-col justify-between ${
                                    isStuffed
                                      ? 'bg-slate-100 text-content-muted border-slate-200 cursor-not-allowed opacity-75'
                                      : isPending
                                      ? 'bg-amber-50/50 text-amber-900 border-amber-200 cursor-not-allowed'
                                      : isSelected
                                      ? 'bg-brand-primary-soft border-brand-primary ring-1 ring-brand-primary cursor-pointer shadow-xs'
                                      : 'bg-surface border-divider hover:border-brand-primary cursor-pointer shadow-2xs'
                                  }`}
                                >
                                  {/* Top Row: Checkbox + Pallet identifier & Model badge + Delete */}
                                  <div className="flex items-start justify-between gap-1.5 min-w-0">
                                    <div className="flex items-center space-x-1.5 min-w-0 flex-1">
                                      {!isStuffed && !isPending && (
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => {}}
                                          className="rounded border-divider text-brand-primary focus:ring-brand-primary shrink-0"
                                        />
                                      )}
                                      <span className="font-bold text-brand-primary truncate text-[11px]" title={`PLT #${displayPalletNum}`}>
                                        PLT #{displayPalletNum}
                                      </span>
                                    </div>

                                    <div className="flex items-center space-x-1 shrink-0">
                                      <span
                                        className="text-[10px] px-1.5 py-0.5 rounded bg-surface-secondary border border-divider text-content-secondary font-medium truncate max-w-[85px]"
                                        title={pallet.model}
                                      >
                                        {pallet.model}
                                      </span>
                                      {!isStuffed && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            promptDeletePallet(entry, pallet);
                                          }}
                                          className="p-1 rounded text-content-muted hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                          title={`Delete Pallet #${displayPalletNum}`}
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Bottom Row: Qty, Weight, Status */}
                                  <div className="mt-2 pt-1.5 border-t border-divider/40 flex items-center justify-between text-[11px]">
                                    <div className="flex items-center space-x-1 text-content-secondary">
                                      <span>Qty:</span>
                                      <strong className="text-content-primary font-bold">
                                        {pallet.receivedBatteries || pallet.invoicedBatteries} u
                                      </strong>
                                    </div>
                                    <div className="flex items-center space-x-1.5 text-[10px]">
                                      <span className="text-content-muted font-medium">{pallet.grossWeightKg} kg</span>
                                      <span
                                        className={`px-1 py-0.2 rounded font-semibold uppercase text-[9px] ${
                                          isStuffed
                                            ? 'bg-slate-200/70 text-slate-700'
                                            : isPending
                                            ? 'bg-amber-100 text-amber-800'
                                            : 'bg-emerald-50 text-emerald-700'
                                        }`}
                                      >
                                        {isStuffed ? (pallet.containerNo ? `Shipped (${pallet.containerNo})` : 'Shipped') : isPending ? 'Pending' : 'Ready'}
                                      </span>
                                    </div>
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
                    <span>Load into Dispatch Tool</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => {
                      if (!dispatchDetails.containerNo) {
                        const firstPallet = selectedPalletsStats.palletList[0];
                        const inv = firstPallet?.invoiceNumber || '20GP';
                        setDispatchDetails((prev) => ({
                          ...prev,
                          containerNo: prev.containerNo || `CONT-${inv}`,
                          sealNo: prev.sealNo || `SL-${Date.now().toString().slice(-6)}`
                        }));
                      }
                      setShowDispatchModal(true);
                    }}
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
            SECTION 2: UNIFIED 25-COLUMN MASTER REPORT (MERGED STOCK & CARTING)
            ===================================================================== */}
        {activeSection === 'reports' && (
          <div className="space-y-3 pb-20">
            {/* Slim 44px Unified Control Bar */}
            <div className="bg-surface border border-divider rounded-lg px-3 py-2 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
              {/* Left: Fiscal Month & Date Range */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Fiscal Month Selector */}
                <div className="flex items-center space-x-1.5">
                  <span className="text-content-secondary font-medium shrink-0">Month:</span>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value as CFSMonth)}
                    className="px-2.5 py-1 bg-surface-secondary border border-divider rounded-md font-semibold text-content-primary focus:outline-none focus:border-brand-primary cursor-pointer text-xs"
                  >
                    <option value="ALL">All Months</option>
                    {CFS_MONTHS.filter((m) => m !== 'ALL').map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                {/* Date Range with Clear Link */}
                <div className="flex items-center space-x-1.5 font-mono">
                  <span className="text-content-secondary font-sans text-xs shrink-0 font-medium">Dates:</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="px-2 py-0.5 rounded bg-surface border border-divider text-xs text-content-primary focus:outline-none focus:border-brand-primary"
                    title="From Date"
                  />
                  <span className="text-content-muted">–</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="px-2 py-0.5 rounded bg-surface border border-divider text-xs text-content-primary focus:outline-none focus:border-brand-primary"
                    title="To Date"
                  />
                  {(dateFrom || dateTo) && (
                    <button
                      type="button"
                      onClick={() => {
                        setDateFrom('');
                        setDateTo('');
                      }}
                      className="text-xs text-rose-600 hover:underline font-sans font-medium cursor-pointer ml-1"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Right: Export & Print Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Single Primary Export Button: Export Master Report (.xlsx) */}
                <button
                  type="button"
                  onClick={() => exportCFSMasterReportXlsx(filteredEntries, selectedMonth)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer text-xs"
                  title="Export unified 25-column Master Report with live Excel formulas and zero row loss"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export Master Report (.xlsx)</span>
                </button>

                {/* Print / PDF */}
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary border border-divider font-medium flex items-center space-x-1.5 transition-colors shadow-xs cursor-pointer text-xs"
                  title="Print report"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-700" />
                  <span>Print / PDF</span>
                </button>
              </div>
            </div>

            {/* UNIFIED MASTER TABLE CONTAINER */}
            <div className="bg-surface border border-divider rounded-lg shadow-xs overflow-hidden">
              <div className="overflow-x-auto max-h-[720px]">
                {/* FULL REPORT (ALL 25 INDIVIDUAL COLUMNS WITH ZERO ROW LOSS) */}
                <table className="w-full text-xs font-mono border-collapse select-text">
                  <thead className="bg-surface-secondary sticky top-0 z-10 border-b border-divider">
                      {/* Group Header Row */}
                      <tr className="text-[10px] uppercase font-bold text-content-secondary text-center tracking-wider border-b border-divider/60">
                        <th colSpan={5} className="py-1 border-r border-divider bg-slate-100">
                          1. Shipment Identity (5)
                        </th>
                        <th colSpan={2} className="py-1 border-r border-divider bg-blue-50/60 text-blue-900">
                          2. EIL Invoiced Qty (2)
                        </th>
                        <th colSpan={6} className="py-1 border-r border-divider bg-emerald-50/60 text-emerald-900">
                          3. Gate-In &amp; Carting Details (6)
                        </th>
                        <th colSpan={2} className="py-1 border-r border-divider bg-rose-50/60 text-rose-900">
                          4. Factory Shortfall (2)
                        </th>
                        <th colSpan={6} className="py-1 border-r border-divider bg-purple-50/60 text-purple-900">
                          5. Dispatch &amp; Stuffing (6)
                        </th>
                        <th colSpan={4} className="py-1 bg-amber-50/60 text-amber-900">
                          6. Live Balance &amp; Ageing (4)
                        </th>
                      </tr>

                      {/* 25 Individual Column Headers */}
                      <tr className="text-[11px] font-semibold text-content-primary border-b border-divider bg-surface text-left">
                        {/* Group 1 */}
                        <th className="p-2 border-r border-divider whitespace-nowrap text-center">Sr.</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap sticky left-0 bg-surface z-20 shadow-xs font-bold text-brand-primary">
                          Invoice No.
                        </th>
                        <th className="p-2 border-r border-divider whitespace-nowrap">Invoice Date</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap min-w-[150px]">Customer</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap">POD</th>

                        {/* Group 2 */}
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-blue-50/30">Inv Plt</th>
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-blue-50/30">Inv Bat</th>

                        {/* Group 3 */}
                        <th className="p-2 border-r border-divider whitespace-nowrap bg-emerald-50/30">Truck Reporting</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap bg-emerald-50/30">Carting Date</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap bg-emerald-50/30">Vehicle No.</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap bg-emerald-50/30">Carting Slip No.</th>
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-emerald-50/30 font-bold">Recd Plt</th>
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-emerald-50/30 font-bold">Recd Bat</th>

                        {/* Group 4 */}
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-rose-50/30">Short Plt</th>
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-rose-50/30">Short Bat</th>

                        {/* Group 5 */}
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-purple-50/30">Stuffed Plt</th>
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-purple-50/30">Stuffed Bat</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap bg-purple-50/30">Stuffing Date</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap bg-purple-50/30 font-bold text-blue-700">Container No.</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap bg-purple-50/30">Seal No.</th>
                        <th className="p-2 border-r border-divider whitespace-nowrap bg-purple-50/30">SB No. &amp; Date</th>

                        {/* Group 6 */}
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-amber-50/30 font-bold text-emerald-700">Bal Plt</th>
                        <th className="p-2 border-r border-divider text-right whitespace-nowrap bg-amber-50/30 font-bold text-indigo-700">
                          Bal Bat
                        </th>
                        <th className="p-2 border-r border-divider text-center whitespace-nowrap bg-slate-50">Days</th>
                        <th className="p-2 whitespace-nowrap min-w-[120px]">Remarks</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-divider/60 tabular-nums">
                      {filteredEntries.length === 0 ? (
                        <tr>
                          <td colSpan={25} className="p-12 text-center text-content-muted">
                            No ledger records found matching selected filters.
                          </td>
                        </tr>
                      ) : (
                        filteredEntries.map((e, idx) => {
                          const invoiceDate = e.invoiceDate || (e.createdAt ? formatToDDMMYYYY(new Date(e.createdAt)) : '-');
                          const truckDate = e.truckReportingDate || e.lastPltRecdDate || e.cartingInDate || '';
                          const slipNo = e.cartingSlipNo || e.gateInStatus || '';
                          const sbSummary = [e.shippingBillNo, e.shippingBillDate].filter(Boolean).join(' / ') || '-';
                          const combinedRemarks = [e.remarks, e.unloadingRemarks].filter(Boolean).join(' | ');

                          return (
                            <tr key={e.id} className="hover:bg-slate-50/80 transition-colors">
                              {/* 1. Sr. No. */}
                              <td className="p-2 border-r border-divider text-center text-content-muted">
                                {idx + 1}
                              </td>

                              {/* 2. Custom Invoice No (Sticky Left) */}
                              <td className="p-2 border-r border-divider whitespace-nowrap sticky left-0 bg-surface z-10 font-bold text-brand-primary shadow-2xs">
                                {e.customInvoiceNo}
                              </td>

                              {/* 3. Invoice Date */}
                              <td className="p-2 border-r border-divider whitespace-nowrap">
                                <InlineCell
                                  value={invoiceDate}
                                  onChange={(val) => {
                                    addOrUpdateCFSEntry({ ...e, invoiceDate: val });
                                    reloadEntries();
                                  }}
                                />
                              </td>

                              {/* 4. Customer */}
                              <td className="p-2 border-r border-divider whitespace-nowrap font-sans font-medium text-content-primary">
                                {e.customer}
                              </td>

                              {/* 5. Destination / POD */}
                              <td className="p-2 border-r border-divider whitespace-nowrap">
                                <InlineCell
                                  value={e.pod || '-'}
                                  onChange={(val) => {
                                    addOrUpdateCFSEntry({ ...e, pod: val });
                                    reloadEntries();
                                  }}
                                />
                              </td>

                              {/* 6. Invoiced Pallets */}
                              <td className="p-2 border-r border-divider text-right bg-blue-50/10">
                                <InlineCell
                                  value={e.invoicedPallets}
                                  type="number"
                                  align="right"
                                  onChange={(val) => {
                                    const v = parseInt(val, 10) || 0;
                                    addOrUpdateCFSEntry({ ...e, invoicedPallets: v });
                                    reloadEntries();
                                  }}
                                />
                              </td>

                              {/* 7. Invoiced Batteries */}
                              <td className="p-2 border-r border-divider text-right bg-blue-50/10">
                                <InlineCell
                                  value={e.invoicedBatteries}
                                  type="number"
                                  align="right"
                                  onChange={(val) => {
                                    const v = parseInt(val, 10) || 0;
                                    addOrUpdateCFSEntry({ ...e, invoicedBatteries: v });
                                    reloadEntries();
                                  }}
                                />
                              </td>

                              {/* 8. Truck Reporting Date */}
                              <td className="p-2 border-r border-divider whitespace-nowrap bg-emerald-50/10">
                                <InlineCell
                                  value={truckDate}
                                  onChange={(val) => {
                                    addOrUpdateCFSEntry({ ...e, truckReportingDate: val });
                                    reloadEntries();
                                  }}
                                />
                              </td>

                              {/* 9. Carting In Date */}
                              <td className="p-2 border-r border-divider whitespace-nowrap bg-emerald-50/10">
                                <InlineCell
                                  value={e.cartingInDate}
                                  onChange={(val) => {
                                    addOrUpdateCFSEntry({ ...e, cartingInDate: val });
                                    reloadEntries();
                                  }}
                                />
                              </td>

                              {/* 10. Vehicle / Truck No */}
                              <td className="p-2 border-r border-divider whitespace-nowrap bg-emerald-50/10 font-bold">
                                <InlineCell
                                  value={e.vehicleNo}
                                  onChange={(val) => {
                                    addOrUpdateCFSEntry({ ...e, vehicleNo: val });
                                    reloadEntries();
                                  }}
                                />
                              </td>

                              {/* 11. Carting Slip / Gate Pass No */}
                              <td className="p-2 border-r border-divider whitespace-nowrap bg-emerald-50/10">
                                <InlineCell
                                  value={slipNo}
                                  onChange={(val) => {
                                    addOrUpdateCFSEntry({ ...e, cartingSlipNo: val });
                                    reloadEntries();
                                  }}
                                />
                              </td>

                              {/* 12. Actual Received Pallets */}
                              <td className="p-2 border-r border-divider text-right bg-emerald-50/20 font-bold text-emerald-800">
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

                              {/* 13. Actual Received Batteries */}
                              <td className="p-2 border-r border-divider text-right bg-emerald-50/20 font-bold text-emerald-800">
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

                              {/* 14. Shortfall Pallets */}
                              <td className="p-2 border-r border-divider text-right bg-rose-50/10 font-bold text-rose-700">
                                {e.shortfallPallets || 0}
                              </td>

                              {/* 15. Shortfall Batteries */}
                              <td className="p-2 border-r border-divider text-right bg-rose-50/10 font-bold text-rose-700">
                                {e.shortfallBatteries || 0}
                              </td>

                              {/* 16. Stuffed Pallets */}
                              <td className="p-2 border-r border-divider text-right bg-purple-50/10 font-semibold text-blue-800">
                                <InlineCell
                                  value={e.actualStuffedPallets}
                                  type="number"
                                  align="right"
                                  onChange={(val) => {
                                    const v = parseInt(val, 10) || 0;
                                    addOrUpdateCFSEntry({ ...e, actualStuffedPallets: v });
                                    reloadEntries();
                                  }}
                                />
                              </td>

                              {/* 17. Stuffed Batteries */}
                              <td className="p-2 border-r border-divider text-right bg-purple-50/10 font-semibold text-blue-800">
                                <InlineCell
                                  value={e.actualStuffedBatteries}
                                  type="number"
                                  align="right"
                                  onChange={(val) => {
                                    const v = parseInt(val, 10) || 0;
                                    addOrUpdateCFSEntry({ ...e, actualStuffedBatteries: v });
                                    reloadEntries();
                                  }}
                                />
                              </td>

                              {/* 18. Stuffing Date */}
                              <td className="p-2 border-r border-divider whitespace-nowrap bg-purple-50/10">
                                <InlineCell
                                  value={e.stuffingDate}
                                  onChange={(val) => {
                                    addOrUpdateCFSEntry({ ...e, stuffingDate: val });
                                    reloadEntries();
                                  }}
                                />
                              </td>

                              {/* 19. Container No */}
                              <td className="p-2 border-r border-divider whitespace-nowrap bg-purple-50/10 font-bold text-blue-700">
                                <InlineCell
                                  value={e.containerNo}
                                  onChange={(val) => {
                                    addOrUpdateCFSEntry({ ...e, containerNo: val.toUpperCase() });
                                    reloadEntries();
                                  }}
                                />
                              </td>

                              {/* 20. Seal No */}
                              <td className="p-2 border-r border-divider whitespace-nowrap bg-purple-50/10 font-mono">
                                <InlineCell
                                  value={e.sealNo}
                                  onChange={(val) => {
                                    addOrUpdateCFSEntry({ ...e, sealNo: val.toUpperCase() });
                                    reloadEntries();
                                  }}
                                />
                              </td>

                              {/* 21. Shipping Bill No. & Date */}
                              <td className="p-2 border-r border-divider whitespace-nowrap bg-purple-50/10">
                                <InlineCell
                                  value={sbSummary}
                                  onChange={(val) => {
                                    const parts = val.split('/');
                                    addOrUpdateCFSEntry({
                                      ...e,
                                      shippingBillNo: parts[0]?.trim() || '',
                                      shippingBillDate: parts[1]?.trim() || ''
                                    });
                                    reloadEntries();
                                  }}
                                />
                              </td>

                              {/* 22. Balance Pallets */}
                              <td className="p-2 border-r border-divider text-right bg-amber-50/20 font-bold text-emerald-700">
                                {e.balancePallets || 0}
                              </td>

                              {/* 23. Balance Batteries */}
                              <td className="p-2 border-r border-divider text-right bg-amber-50/40 font-bold text-indigo-700">
                                {(e.balanceBatteries || 0).toLocaleString()}
                              </td>

                              {/* 24. Days in CFS */}
                              <td className="p-2 border-r border-divider text-center whitespace-nowrap font-bold bg-slate-50">
                                {e.daysInCFS || 0}
                              </td>

                              {/* 25. Remarks */}
                              <td className="p-2 whitespace-nowrap">
                                <InlineCell
                                  value={combinedRemarks}
                                  onChange={(val) => {
                                    addOrUpdateCFSEntry({ ...e, remarks: val });
                                    reloadEntries();
                                  }}
                                />
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

        {/* =====================================================================
            SECTION 3: INVENTORY LOGS (CUSTOMER-WISE AUDIT TRAIL)
            ===================================================================== */}
        {activeSection === 'logs' && (
          <div className="pb-20">
            {/* Movement Logs Table */}
            <div className="bg-surface border border-divider rounded-xl shadow-xs overflow-hidden">
              <div className="overflow-x-auto max-h-[700px]">
                <table className="w-full text-xs font-mono border-collapse select-text">
                  <thead className="bg-surface-secondary sticky top-0 z-10 border-b border-divider">
                    <tr className="text-[11px] font-semibold text-content-primary border-b border-divider text-left">
                      <th className="p-2.5 border-r border-divider whitespace-nowrap">Received Date</th>
                      <th className="p-2.5 border-r border-divider whitespace-nowrap">Dispatched Date</th>
                      <th className="p-2.5 border-r border-divider whitespace-nowrap">Status</th>
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
                      <th className="p-2.5 border-r border-divider text-right whitespace-nowrap">Remaining Balance</th>
                      <th className="p-2.5 text-center whitespace-nowrap">Action</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-divider/60">
                    {filteredMovementRecords.length === 0 ? (
                      <tr>
                        <td colSpan={15} className="p-12 text-center text-content-muted">
                          <History className="w-8 h-8 mx-auto mb-1 opacity-50" />
                          <p>No inventory movements recorded matching criteria.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredMovementRecords.map((r) => {
                        const isDispatched = r.status === 'DISPATCHED';
                        const isPartial = r.status === 'PARTIAL_DISPATCHED';
                        return (
                          <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                            {/* Received Date */}
                            <td className="p-2.5 border-r border-divider whitespace-nowrap font-medium text-content-primary">
                              {r.receivedDate || '-'}
                            </td>

                            {/* Dispatched Date */}
                            <td className="p-2.5 border-r border-divider whitespace-nowrap font-medium text-content-primary">
                              {r.dispatchedDate && r.dispatchedDate !== '-' ? (
                                <span className="text-emerald-700 font-semibold">{r.dispatchedDate}</span>
                              ) : (
                                <span className="text-content-muted">-</span>
                              )}
                            </td>

                            {/* Status */}
                            <td className="p-2.5 border-r border-divider whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider ${
                                  isDispatched
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : isPartial
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : 'bg-blue-50 text-blue-800 border border-blue-200'
                                }`}
                              >
                                {isDispatched ? 'DISPATCHED' : isPartial ? 'PARTIAL' : 'IN STOCK'}
                              </span>
                            </td>

                            {/* Customer */}
                            <td className="p-2.5 border-r border-divider whitespace-nowrap font-sans font-medium text-content-primary max-w-[150px] truncate" title={r.customer}>
                              {r.customer}
                            </td>

                            {/* Invoice No */}
                            <td className="p-2.5 border-r border-divider whitespace-nowrap font-bold text-brand-primary">
                              {r.customInvoiceNo}
                            </td>

                            {/* Battery / Model */}
                            <td className="p-2.5 border-r border-divider whitespace-nowrap text-content-secondary max-w-[160px] truncate" title={r.modelDescription}>
                              {r.modelDescription || '-'}
                            </td>

                            {/* Pallets */}
                            <td className="p-2.5 border-r border-divider text-right font-bold text-content-primary">
                              {r.pallets}
                            </td>

                            {/* Units */}
                            <td className="p-2.5 border-r border-divider text-right text-content-primary">
                              {r.batteries.toLocaleString()}
                            </td>

                            {/* Gross kg */}
                            <td className="p-2.5 border-r border-divider text-right text-content-secondary">
                              {(r.grossWeightKg || 0).toLocaleString()}
                            </td>

                            {/* Container No */}
                            <td className="p-2.5 border-r border-divider whitespace-nowrap font-bold text-blue-700">
                              {r.containerNo || '-'}
                            </td>

                            {/* Seal No */}
                            <td className="p-2.5 border-r border-divider whitespace-nowrap text-content-secondary">
                              {r.sealNo || '-'}
                            </td>

                            {/* Shipping Bill */}
                            <td className="p-2.5 border-r border-divider whitespace-nowrap text-content-secondary">
                              {r.shippingBillNo && r.shippingBillNo !== '-'
                                ? (r.shippingBillDate && r.shippingBillDate !== '-' ? `${r.shippingBillNo} (${r.shippingBillDate})` : r.shippingBillNo)
                                : '-'}
                            </td>

                            {/* Vehicle No */}
                            <td className="p-2.5 border-r border-divider whitespace-nowrap text-content-secondary">
                              {r.vehicleNo || '-'}
                            </td>

                            {/* Remaining Balance */}
                            <td className="p-2.5 border-r border-divider text-right whitespace-nowrap font-mono font-bold">
                              {r.remainingBalancePallets > 0 ? (
                                <span className="text-emerald-700">
                                  {r.remainingBalancePallets} Plt <span className="text-content-muted">/</span> {r.remainingBalanceBatteries}u
                                </span>
                              ) : (
                                <span className="text-content-muted font-normal">0 (Cleared)</span>
                              )}
                            </td>

                            {/* Action: Delete Log */}
                            <td className="p-2.5 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => promptDeleteLog(r)}
                                className="p-1.5 rounded-lg text-content-muted hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
                                title={`Delete log for invoice ${r.customInvoiceNo}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
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

      {/* Invoiced vs Actual Received Variance Breakdown Modal */}
      {showVarianceModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface border border-divider rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-scale-in overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-divider flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-content-primary">
                    Invoiced vs. Actual Received Discrepancy Breakdown
                  </h3>
                  <p className="text-xs text-content-secondary mt-0.5">
                    {kpis.varianceEntries.length} invoice(s) with differences between invoiced and physically received quantities
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowVarianceModal(false)}
                className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-secondary transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
              {kpis.varianceEntries.length === 0 ? (
                <div className="p-8 text-center bg-surface-secondary/40 border border-dashed border-divider rounded-xl">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-content-primary">Zero Discrepancies</p>
                  <p className="text-xs text-content-muted mt-1">All invoices match 100% between invoiced and actual received factory quantities.</p>
                </div>
              ) : (
                <div className="border border-divider rounded-xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-surface-secondary/80 border-b border-divider font-semibold text-content-secondary uppercase text-[10px] tracking-wider font-mono">
                        <tr>
                          <th className="py-2.5 px-3 border-r border-divider">Customer</th>
                          <th className="py-2.5 px-3 border-r border-divider">Custom Invoice No</th>
                          <th className="py-2.5 px-3 border-r border-divider text-right">Invoiced (Plt / Units)</th>
                          <th className="py-2.5 px-3 border-r border-divider text-right">Actual Received (Plt / Units)</th>
                          <th className="py-2.5 px-3 border-r border-divider text-right text-amber-600 font-bold">Variance / Shortfall</th>
                          <th className="py-2.5 px-3">Status / Vehicle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-divider font-mono">
                        {kpis.varianceEntries.map((e) => {
                          const pltDiff = (e.actualReceivedPallets || 0) - (e.invoicedPallets || 0);
                          const unitDiff = (e.actualReceivedBatteries || 0) - (e.invoicedBatteries || 0);
                          return (
                            <tr key={e.id} className="hover:bg-surface-secondary/40 transition-colors">
                              <td className="py-2.5 px-3 border-r border-divider font-sans font-semibold text-content-primary">
                                {e.customer || '—'}
                              </td>
                              <td className="py-2.5 px-3 border-r border-divider font-bold text-brand-primary">
                                {e.customInvoiceNo}
                              </td>
                              <td className="py-2.5 px-3 border-r border-divider text-right text-content-secondary">
                                {e.invoicedPallets} plt / {e.invoicedBatteries.toLocaleString()} units
                              </td>
                              <td className="py-2.5 px-3 border-r border-divider text-right text-content-primary font-semibold">
                                {e.actualReceivedPallets || 0} plt / {(e.actualReceivedBatteries || 0).toLocaleString()} units
                              </td>
                              <td className="py-2.5 px-3 border-r border-divider text-right">
                                <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                                  pltDiff < 0 || unitDiff < 0
                                    ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                    : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                                }`}>
                                  {pltDiff > 0 ? `+${pltDiff}` : pltDiff} plt / {unitDiff > 0 ? `+${unitDiff}` : unitDiff} units
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-sans text-content-secondary text-[11px]">
                                {e.vehicleNo ? (
                                  <span>Veh: <strong className="font-mono text-content-primary">{e.vehicleNo}</strong></span>
                                ) : (
                                  <span className="italic text-content-muted">Pending Gate-In</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 sm:p-4 bg-surface-secondary/40 border-t border-divider flex items-center justify-between">
              <span className="text-xs text-content-secondary font-mono">
                Total Shortfall: <strong className="text-amber-600 font-bold">{kpis.totalShortfallPallets} pallets</strong> / <strong className="text-amber-600 font-bold">{kpis.totalShortfallBatteries.toLocaleString()} units</strong>
              </span>
              <button
                type="button"
                onClick={() => setShowVarianceModal(false)}
                className="px-4 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary border border-divider text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Low & Nil Stock Breakdown Modal */}
      {showLowStockModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in">
          <div className="bg-surface border border-divider rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-scale-in">
            <div className="p-4 sm:p-5 border-b border-divider flex items-center justify-between bg-surface-secondary/40">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400">
                  <Boxes className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-content-primary">
                    Warehouse Low & Nil Stock Ledger
                  </h3>
                  <p className="text-xs text-content-secondary mt-0.5">
                    Breakdown of items with zero balance (Nil Stock) or under 22 pallets (Low Stock)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLowStockModal(false)}
                className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-secondary transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter Dropdown */}
            <div className="px-4 py-2.5 bg-surface border-b border-divider flex items-center space-x-2 text-xs">
              <label htmlFor="low-nil-filter-select" className="text-content-secondary font-medium shrink-0">
                Filter:
              </label>
              <select
                id="low-nil-filter-select"
                value={lowStockModalFilter}
                onChange={(e) => setLowStockModalFilter(e.target.value as any)}
                className="px-3 py-1.5 bg-surface-secondary border border-divider rounded-lg font-medium text-content-primary focus:outline-none focus:border-brand-primary cursor-pointer text-xs"
              >
                <option value="ALL">All ({kpis.lowStockCount + kpis.nilStockCount})</option>
                <option value="NIL">Nil Stock ({kpis.nilStockCount})</option>
                <option value="LOW">Low Stock ({kpis.lowStockCount})</option>
              </select>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
              {(() => {
                const filtered = entries.filter((e) => {
                  const bal = e.balancePallets || 0;
                  if (lowStockModalFilter === 'NIL') return bal === 0 && (e.invoicedPallets || 0) > 0;
                  if (lowStockModalFilter === 'LOW') return bal > 0 && bal < 22;
                  return bal < 22;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="p-8 text-center bg-surface-secondary/40 border border-dashed border-divider rounded-xl">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-content-primary">No Low or Nil Stock Items</p>
                      <p className="text-xs text-content-muted mt-1">All inventory items are currently above healthy stock thresholds.</p>
                    </div>
                  );
                }

                return (
                  <div className="border border-divider rounded-xl overflow-hidden shadow-xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-surface-secondary/80 border-b border-divider font-semibold text-content-secondary uppercase text-[10px] tracking-wider font-mono">
                          <tr>
                            <th className="py-2.5 px-3 border-r border-divider">Customer</th>
                            <th className="py-2.5 px-3 border-r border-divider">Custom Invoice No</th>
                            <th className="py-2.5 px-3 border-r border-divider">Model / Details</th>
                            <th className="py-2.5 px-3 border-r border-divider text-right">Invoiced (Plt/Units)</th>
                            <th className="py-2.5 px-3 border-r border-divider text-right">Dispatched</th>
                            <th className="py-2.5 px-3 border-r border-divider text-right font-bold">Remaining Balance</th>
                            <th className="py-2.5 px-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-divider font-mono">
                          {filtered.map((e) => {
                            const balPallets = e.balancePallets || 0;
                            const balBatteries = e.balanceBatteries || 0;
                            const isNil = balPallets === 0;

                            return (
                              <tr key={e.id} className="hover:bg-surface-secondary/40 transition-colors">
                                <td className="py-2.5 px-3 border-r border-divider font-sans font-semibold text-content-primary">
                                  {e.customer || '—'}
                                </td>
                                <td className="py-2.5 px-3 border-r border-divider font-bold text-brand-primary">
                                  {e.customInvoiceNo}
                                </td>
                                <td className="py-2.5 px-3 border-r border-divider font-sans text-content-secondary max-w-xs truncate" title={e.remarks || e.unloadingRemarks || ''}>
                                  {e.remarks || e.unloadingRemarks || '—'}
                                </td>
                                <td className="py-2.5 px-3 border-r border-divider text-right text-content-secondary">
                                  {e.invoicedPallets} plt / {e.invoicedBatteries.toLocaleString()} u
                                </td>
                                <td className="py-2.5 px-3 border-r border-divider text-right text-content-secondary">
                                  {e.actualStuffedPallets || 0} plt / {(e.actualStuffedBatteries || 0).toLocaleString()} u
                                </td>
                                <td className="py-2.5 px-3 border-r border-divider text-right font-bold text-content-primary">
                                  <span className={isNil ? 'text-rose-600' : 'text-amber-600'}>
                                    {balPallets} plt / {balBatteries.toLocaleString()} u
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center font-sans">
                                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                    isNil
                                      ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20'
                                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                                  }`}>
                                    {isNil ? 'Nil Stock' : 'Low Stock'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="p-3 sm:p-4 bg-surface-secondary/40 border-t border-divider flex items-center justify-between">
              <span className="text-xs text-content-secondary font-mono">
                Total Low/Nil Stock Items: <strong className="text-content-primary font-bold">{kpis.lowStockCount + kpis.nilStockCount}</strong>
              </span>
              <button
                type="button"
                onClick={() => setShowLowStockModal(false)}
                className="px-4 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary border border-divider text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                Close
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
