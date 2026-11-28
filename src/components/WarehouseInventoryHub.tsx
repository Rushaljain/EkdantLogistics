// Ekdant Logistics - Warehouse Inventory
// Clean, simplified operator UI: 3 KPI Cards + Section Dropdown (Inventory, Monthly Live Reports, Inventory Logs)

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Boxes,
  CheckCircle2,
  ArrowRight,
  Search,
  X,
  History,
  Plus,
  Trash2,
  AlertTriangle,
  Package,
  Pencil,
  ChevronDown,
  RotateCcw,
  Layers,
  FileSpreadsheet,
  Eye
} from 'lucide-react';
import type {
  CFSLedgerEntry,
  ExtractedShipmentJSON,
  PalletStockUnit,
  ShortfallRecord,
  TrashBinItem
} from '../types/index.ts';
import {
  type CFSMonth,
  CFS_MONTHS,
  getCFSLedgerEntries,
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
  deleteMovementLog,
  hydrateInventoryFromSupabase,
  toExactWeight,
  getShortfallStatusForMonth,
  markLedgerDocumentCreated,
  getCFSTrashBinEntries,
  restoreDeletedCFSEntry,
  permanentlyDeleteCFSEntry,
  emptyCFSTrashBin,
  restoreDispatchedRecord,
  getSuppliedShortFillsForInvoice,
  convertPendingInwardToShortfall
} from '../utils/inventoryStore.ts';
import { ManualInwardModal } from './ManualInwardModal.tsx';
import { CompactInvoiceBlock } from './CompactInvoiceBlock.tsx';
import { DateInput } from './DateInput.tsx';

interface WarehouseInventoryHubProps {
  onLoadShipmentIntoWorkspace: (shipment: ExtractedShipmentJSON) => void;
  onNavigateToWorkspace: () => void;
  activeShipmentJson?: ExtractedShipmentJSON;
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

/**
 * Computes exact shortfall metrics directly from entry.shortfalls (created in SHORT_FALL mode),
 * evaluated via getShortfallStatusForMonth when a targetMonth is active.
 * Falls back to legacy entry.shortfallPallets / entry.shortfallBatteries if shortfalls array is missing.
 */
function getEntryShortfallStats(entry: CFSLedgerEntry, targetMonth?: string) {
  if (entry.shortfalls && entry.shortfalls.length > 0) {
    const list = entry.shortfalls.filter((sf) => {
      if (targetMonth && targetMonth !== 'ALL') {
        const monthStatus = getShortfallStatusForMonth(sf, targetMonth);
        return monthStatus !== 'NOT_OPEN';
      }
      return true;
    });

    const shortPlt = list.filter((sf) => sf.mode === 'PALLET').length;
    const remainingPlt = list.filter((sf) => sf.mode === 'PALLET' && sf.status !== 'CLEARED' && sf.status !== 'FULFILLED' && (sf.remainingShortfallUnits ?? sf.shortfallUnits) > 0).length;
    const shortBat = list.reduce((sum, sf) => sum + (sf.shortfallUnits || 0), 0);
    const remainingBat = list.reduce((sum, sf) => sum + (sf.remainingShortfallUnits ?? sf.shortfallUnits), 0);

    return {
      shortPlt,
      remainingPlt,
      shortBat,
      remainingBat,
      records: list
    };
  }

  // If entry is actively carting in (pending inward), unreceived units are NOT a shortfall until explicitly shifted
  const isPendingCarting = entry.inwardStatus === 'PENDING_INWARD' ||
    (entry.pendingInwardBatteries || 0) > 0 ||
    Boolean(entry.pallets && entry.pallets.some((p) => p.receiptStatus === 'NOT_RECEIVED' || p.receiptStatus === 'PARTIALLY_RECEIVED'));

  if (isPendingCarting) {
    return {
      shortPlt: 0,
      remainingPlt: 0,
      shortBat: 0,
      remainingBat: 0,
      records: []
    };
  }

  // Fallback for legacy records without `shortfalls` array
  const legacyPlt = entry.shortfallPallets || 0;
  const legacyBat = entry.shortfallBatteries || 0;
  return {
    shortPlt: legacyPlt,
    remainingPlt: legacyPlt,
    shortBat: legacyBat,
    remainingBat: legacyBat,
    records: []
  };
}

// 4 Operator Sections:
// 1. inventory (Strictly available floor stock)
// 2. status_logs (Consolidated Status Logs with Expandable Chronological Timeline & Reconciliation)
// 3. stock_ledgers (Shortfall & Shortfill Lifecycle & Part tracking)
// 4. reports (Monthly Live Reports & 25-Col Master Export)
export type HubSection = 'inventory' | 'status_logs' | 'stock_ledgers' | 'reports';

export function WarehouseInventoryHub({
  onLoadShipmentIntoWorkspace,
  onNavigateToWorkspace,
  activeShipmentJson: _activeShipmentJson
}: WarehouseInventoryHubProps): React.JSX.Element {
  const [entries, setEntries] = useState<CFSLedgerEntry[]>(() => getCFSLedgerEntries());

  useEffect(() => {
    // Stale-While-Revalidate Cloud Hydration on mount
    hydrateInventoryFromSupabase().then(() => {
      setEntries(getCFSLedgerEntries());
    });
  }, []);

  const [activeSection, setActiveSection] = useState<HubSection>('inventory');

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [customerFilter, setCustomerFilter] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<CFSMonth>('ALL');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // 1. Inventory States (Strictly Available Stock)
  const [selectedPalletIds, setSelectedPalletIds] = useState<Set<string>>(new Set());
  const [selectedDispatchCustomer, setSelectedDispatchCustomer] = useState<string>('');
  const [expandedInventoryInvoiceIds, setExpandedInventoryInvoiceIds] = useState<Set<string>>(new Set());
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState<'ALL' | 'IN_WAREHOUSE' | 'SHORTFILL' | 'DISPATCHED' | 'SHORTFALL'>('ALL');

  // 2. Status Logs States (Consolidated Status Tracker + Chronological Activity Tracks)
  const [statusLogFilter, setStatusLogFilter] = useState<
    'ALL' | 'IN_WAREHOUSE' | 'PARTIAL_DISPATCH' | 'DISPATCHED' | 'SHORTFALL' | 'SHORTFILL'
  >('ALL');
  const [expandedStatusLogInvoiceIds, setExpandedStatusLogInvoiceIds] = useState<Set<string>>(new Set());

  const toggleStatusLogExpand = (invId: string) => {
    setExpandedStatusLogInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(invId)) next.delete(invId);
      else next.add(invId);
      return next;
    });
  };

  // 3. Stock Ledgers (Shortfall & Shortfill Tracking) States
  const [shortfallLedgerFilter, setShortfallLedgerFilter] = useState<'ALL' | 'OPEN' | 'CLEARED'>('ALL');

  // Stuffing & Dispatch Modal State
  const [showManualInwardModal, setShowManualInwardModal] = useState<boolean>(false);
  const [editingInwardEntry, setEditingInwardEntry] = useState<CFSLedgerEntry | null>(null);
  const [shortfallTargetInvoiceNo, setShortfallTargetInvoiceNo] = useState<string | undefined>(undefined);
  const [showDispatchModal, setShowDispatchModal] = useState<boolean>(false);
  const [showVarianceModal, setShowVarianceModal] = useState<boolean>(false);
  const [showShortfillsModal, setShowShortfillsModal] = useState<boolean>(false);
  const [pendingInwardActionPrompt, setPendingInwardActionPrompt] = useState<{
    entry: CFSLedgerEntry;
    pallets: PalletStockUnit[];
    actionType: 'DG_BL' | 'DISPATCH_TOOL' | 'DISPATCH_MODAL';
  } | null>(null);
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
    setTrashBinItems(getCFSTrashBinEntries());
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

  // ALL Shortfall & Shortfill Incidents (both open and fulfilled) for Section 3: Stock Ledgers
  const allShortfallIncidents = useMemo(() => {
    const list: {
      invoiceId: string;
      customInvoiceNo: string;
      customer: string;
      month: string;
      invoiceDate: string;
      shortfall: ShortfallRecord;
    }[] = [];

    entries.forEach((entry) => {
      if (entry.shortfalls && entry.shortfalls.length > 0) {
        entry.shortfalls.forEach((sf) => {
          list.push({
            invoiceId: entry.id,
            customInvoiceNo: entry.customInvoiceNo,
            customer: entry.customer,
            invoiceDate: entry.invoiceDate || entry.cartingInDate || '',
            month: entry.month || sf.openedMonth || 'OCT',
            shortfall: sf
          });
        });
      } else if ((entry.shortfallBatteries || 0) > 0 || (entry.shortfallPallets || 0) > 0) {
        list.push({
          invoiceId: entry.id,
          customInvoiceNo: entry.customInvoiceNo,
          customer: entry.customer,
          invoiceDate: entry.invoiceDate || entry.cartingInDate || '',
          month: entry.month || 'OCT',
          shortfall: {
            id: `legacy_${entry.id}`,
            mode: (entry.shortfallPallets || 0) > 0 ? 'PALLET' : 'UNITS',
            palletNumber: (entry.shortfallPallets || 0) > 0 ? 'ALL' : '1',
            billedUnits: entry.invoicedBatteries,
            shortfallUnits: entry.shortfallBatteries || 0,
            remainingShortfallUnits: entry.shortfallBatteries || 0,
            openedDate: entry.cartingInDate || entry.invoiceDate || '',
            openedMonth: entry.month || 'OCT',
            status: 'OPEN',
            linkedShortFills: []
          }
        });
      }
    });

    return list;
  }, [entries]);

  const filteredShortfallIncidents = useMemo(() => {
    return allShortfallIncidents.filter((item) => {
      const sf = item.shortfall;
      const isCleared = sf.status === 'CLEARED' || sf.status === 'FULFILLED' || sf.remainingShortfallUnits === 0;
      if (shortfallLedgerFilter === 'OPEN' && isCleared) return false;
      if (shortfallLedgerFilter === 'CLEARED' && !isCleared) return false;
      if (customerFilter !== 'ALL' && item.customer.trim().toUpperCase() !== customerFilter.toUpperCase()) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          item.customInvoiceNo.toLowerCase().includes(q) ||
          item.customer.toLowerCase().includes(q) ||
          String(sf.palletNumber).toLowerCase().includes(q) ||
          (sf.linkedShortFills || []).some((lsf) => (lsf.shortFillInvoiceNo || '').toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [allShortfallIncidents, shortfallLedgerFilter, customerFilter, searchQuery]);

  // Clean KPI Totals
  const kpis = useMemo(() => {
    const totalBalancePallets = entries.reduce((s, e) => s + (e.balancePallets || 0), 0);
    const totalBalanceBatteries = entries.reduce((s, e) => s + (e.balanceBatteries || 0), 0);
    const totalBalanceGrossKg = entries.reduce((s, e) => {
      if (e.invoicedPallets > 0 && e.balancePallets > 0) {
        const gross = e.actualGrossWeightKg ?? e.invoicedGrossWeightKg;
        return toExactWeight(s + (gross / e.invoicedPallets) * e.balancePallets);
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

    // Invoices with variance between Invoiced vs Actual Received Quantity or recorded shortfalls
    const varianceEntries = entries.filter((e) => {
      const isPendingCarting = e.inwardStatus === 'PENDING_INWARD' ||
        (e.pendingInwardBatteries || 0) > 0 ||
        Boolean(e.pallets && e.pallets.some((p) => p.receiptStatus === 'NOT_RECEIVED' || p.receiptStatus === 'PARTIALLY_RECEIVED'));
      const sfStats = getEntryShortfallStats(e);
      if (isPendingCarting) {
        return sfStats.shortPlt > 0 || sfStats.shortBat > 0;
      }
      const palletDiff = Math.abs((e.invoicedPallets || 0) - (e.actualReceivedPallets || 0));
      const batteryDiff = Math.abs((e.invoicedBatteries || 0) - (e.actualReceivedBatteries || 0));
      return (palletDiff > 0 || batteryDiff > 0 || sfStats.shortPlt > 0 || sfStats.shortBat > 0);
    });

    const totalShortfallPallets = entries.reduce((s, e) => s + getEntryShortfallStats(e).remainingPlt, 0);
    const totalShortfallBatteries = entries.reduce((s, e) => s + getEntryShortfallStats(e).remainingBat, 0);

    // Carting Multi-Part Inward Tracking
    const pendingInwardInvoices = entries.filter((e) => {
      const pendingBat = (e.pendingInwardBatteries !== undefined)
        ? e.pendingInwardBatteries
        : (e.pallets?.reduce((sum, p) => sum + (p.pendingUnits || 0), 0) || 0);
      return e.inwardStatus === 'PENDING_INWARD' || pendingBat > 0;
    });
    const cartingPendingInvoicesCount = pendingInwardInvoices.length;
    const cartingPendingPalletsCount = pendingInwardInvoices.reduce((s, e) => {
      if (e.pendingInwardPallets !== undefined) return s + e.pendingInwardPallets;
      return s + (e.pallets?.filter((p) => (p.pendingUnits || 0) > 0 || p.status === 'PENDING_GATE_IN').length || 0);
    }, 0);
    const cartingPendingUnitsCount = pendingInwardInvoices.reduce((s, e) => {
      if (e.pendingInwardBatteries !== undefined) return s + e.pendingInwardBatteries;
      return s + (e.pallets?.reduce((sum, p) => sum + (p.pendingUnits || 0), 0) || 0);
    }, 0);

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
      cartingPendingInvoicesCount,
      cartingPendingPalletsCount,
      cartingPendingUnitsCount,
      lowStockEntries,
      lowStockCount: lowStockEntries.length,
      nilStockEntries,
      nilStockCount: nilStockEntries.length,
      lowNilStockEntries
    };
  }, [entries]);

  // 4. Shortfill Availability Metrics & Inventory in Warehouse
  const shortfillAvailability = useMemo(() => {
    interface AvailableShortfillItem {
      id: string;
      targetInvoiceNo: string;
      targetCustomer: string;
      targetPalletNumber: string | number;
      shortfallUnits: number;
      remainingShortfallUnits: number;
      shortFillInvoiceNo: string;
      shortFillLedgerId?: string;
      arrivedPalletNumber: string | number;
      unitsAvailable: number;
      date: string;
      isFullyAvailable: boolean;
      status: string;
    }

    const items: AvailableShortfillItem[] = [];
    const fullyAvailableInvoices = new Set<string>();

    entries.forEach((targetEntry) => {
      const sfs = targetEntry.shortfalls || [];

      // Check explicit shortfalls
      sfs.forEach((sf) => {
        const linked = sf.linkedShortFills || [];
        const unitsFromWarehouse = linked.reduce((sum, lsf) => {
          if (lsf.dispatched) return sum;
          const supplierEntry = entries.find(
            (e) => e.id === lsf.shortFillLedgerId || e.customInvoiceNo === lsf.shortFillInvoiceNo
          );
          const inWarehouse = supplierEntry
            ? (supplierEntry.balancePallets || 0) > 0 || (supplierEntry.balanceBatteries || 0) > 0
            : true;
          return inWarehouse ? sum + (lsf.unitsFilled || 0) : sum;
        }, 0);

        const isFully = sf.shortfallUnits > 0 && (unitsFromWarehouse >= sf.shortfallUnits || sf.remainingShortfallUnits === 0);
        if (isFully && unitsFromWarehouse > 0) {
          fullyAvailableInvoices.add(targetEntry.customInvoiceNo);
        }

        linked.forEach((lsf, idx) => {
          if (lsf.dispatched) return;
          const supplierEntry = entries.find(
            (e) => e.id === lsf.shortFillLedgerId || e.customInvoiceNo === lsf.shortFillInvoiceNo
          );
          const inWarehouse = supplierEntry
            ? (supplierEntry.balancePallets || 0) > 0 || (supplierEntry.balanceBatteries || 0) > 0
            : true;

          if (inWarehouse) {
            items.push({
              id: `${targetEntry.id}_${sf.id}_${idx}`,
              targetInvoiceNo: targetEntry.customInvoiceNo,
              targetCustomer: targetEntry.customer,
              targetPalletNumber: sf.palletNumber,
              shortfallUnits: sf.shortfallUnits,
              remainingShortfallUnits: sf.remainingShortfallUnits,
              shortFillInvoiceNo: lsf.shortFillInvoiceNo,
              shortFillLedgerId: lsf.shortFillLedgerId,
              arrivedPalletNumber: lsf.arrivedPalletNumber || sf.palletNumber,
              unitsAvailable: lsf.unitsFilled,
              date: lsf.filledDate || targetEntry.invoiceDate || '',
              isFullyAvailable: isFully,
              status: isFully ? 'Fully Available in Warehouse' : 'Partially Available on Floor'
            });
          }
        });
      });

      // Also scan if any supplier entry has shortFillLinks referencing this target entry
      entries.forEach((supplierEntry) => {
        (supplierEntry.shortFillLinks || []).forEach((link, lIdx) => {
          const isMatch =
            link.priorShortfallInvoiceNo?.toUpperCase() === targetEntry.customInvoiceNo?.toUpperCase() ||
            link.priorShortfallLedgerId === targetEntry.id;

          if (isMatch) {
            const alreadyAdded = items.some(
              (it) => it.shortFillInvoiceNo === supplierEntry.customInvoiceNo && it.targetInvoiceNo === targetEntry.customInvoiceNo
            );
            if (!alreadyAdded) {
              const inWarehouse = (supplierEntry.balancePallets || 0) > 0 || (supplierEntry.balanceBatteries || 0) > 0;
              if (inWarehouse) {
                const origUnits = targetEntry.shortfallBatteries || link.unitsFilled;
                const isFully = (link.unitsFilled || 0) >= origUnits;
                if (isFully) fullyAvailableInvoices.add(targetEntry.customInvoiceNo);

                items.push({
                  id: `supp_${supplierEntry.id}_${lIdx}`,
                  targetInvoiceNo: targetEntry.customInvoiceNo,
                  targetCustomer: targetEntry.customer,
                  targetPalletNumber: link.palletNumber || '1',
                  shortfallUnits: origUnits,
                  remainingShortfallUnits: Math.max(0, origUnits - link.unitsFilled),
                  shortFillInvoiceNo: supplierEntry.customInvoiceNo,
                  shortFillLedgerId: supplierEntry.id,
                  arrivedPalletNumber: link.arrivedPalletNumber || link.palletNumber || '1',
                  unitsAvailable: link.unitsFilled,
                  date: supplierEntry.invoiceDate || supplierEntry.cartingInDate || '',
                  isFullyAvailable: isFully,
                  status: isFully ? 'Fully Available in Warehouse' : 'Partially Available on Floor'
                });
              }
            }
          }
        });
      });
    });

    const totalAvailableUnits = items.reduce((s, it) => s + (it.unitsAvailable || 0), 0);
    const fullyAvailableCount = fullyAvailableInvoices.size;

    return {
      items,
      totalAvailableUnits,
      fullyAvailableCount,
      fullyAvailableInvoices: Array.from(fullyAvailableInvoices)
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

  // Active Floor Stock Invoices (Strictly showing what is available on floor)
  const activeStockInvoices = useMemo(() => {
    return filteredEntries.filter((e) => {
      // If actively searching for an invoice or viewing reference, always show match
      if (searchQuery.trim()) {
        return true;
      }
      if (inventoryStatusFilter === 'ALL') {
        const sfStats = getEntryShortfallStats(e, selectedMonth);
        const hasOpenShortfall = sfStats.remainingPlt > 0 || sfStats.remainingBat > 0;
        return (e.balancePallets || 0) > 0 || hasOpenShortfall;
      }
      if (inventoryStatusFilter === 'IN_WAREHOUSE') {
        const sfStats = getEntryShortfallStats(e, selectedMonth);
        const hasOpenShortfall = sfStats.remainingPlt > 0 || sfStats.remainingBat > 0;
        return (e.balancePallets || 0) > 0 && e.actualReceivedPallets >= e.invoicedPallets && !hasOpenShortfall;
      }
      if (inventoryStatusFilter === 'SHORTFILL') {
        const hasLinkedShortFill = getSuppliedShortFillsForInvoice(e, entries).length > 0;
        const hasShortfallWithShortFill = (e.shortfalls || []).some(
          (sf) => (sf.linkedShortFills || []).length > 0
        );
        return hasLinkedShortFill || hasShortfallWithShortFill;
      }
      if (inventoryStatusFilter === 'DISPATCHED') {
        return (e.actualStuffedPallets || 0) > 0 || (e.pallets || []).some((p) => p.status === 'STUFFED_DISPATCHED');
      }
      if (inventoryStatusFilter === 'SHORTFALL') {
        const sfStats = getEntryShortfallStats(e, selectedMonth);
        return sfStats.remainingPlt > 0 || sfStats.remainingBat > 0;
      }
      return true;
    });
  }, [filteredEntries, inventoryStatusFilter, selectedMonth, searchQuery, entries]);

  // Master Invoices Status Logs Tracking for Section 2: Status Logs
  const filteredStatusLogInvoices = useMemo(() => {
    return filteredEntries.filter((inv) => {
      const balPlt = inv.balancePallets || 0;
      const isFullyDispatched = balPlt === 0 && (inv.actualStuffedPallets || 0) > 0;
      const isPartialDispatch = balPlt > 0 && (inv.actualStuffedPallets || 0) > 0;
      const hasShortfall = (inv.shortfallBatteries || 0) > 0 || (inv.shortfallPallets || 0) > 0;
      const hasShortfill = getSuppliedShortFillsForInvoice(inv, entries).length > 0;

      if (statusLogFilter === 'IN_WAREHOUSE') return balPlt > 0;
      if (statusLogFilter === 'PARTIAL_DISPATCH') return isPartialDispatch;
      if (statusLogFilter === 'DISPATCHED') return isFullyDispatched;
      if (statusLogFilter === 'SHORTFALL') return hasShortfall;
      if (statusLogFilter === 'SHORTFILL') return hasShortfill;
      return true;
    });
  }, [filteredEntries, statusLogFilter, entries]);

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
    return { count, batteries, grossKg: toExactWeight(grossKg), required20GP, palletList };
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

    // Intercept if any selected pallet belongs to an invoice with pending inward
    const pendingEntry = entries.find((e) => {
      const hasSelected = (e.pallets || []).some((p) => selectedPalletIds.has(p.id));
      if (!hasSelected) return false;
      const pendingBat = (e.pendingInwardBatteries !== undefined)
        ? e.pendingInwardBatteries
        : (e.pallets?.reduce((sum, p) => sum + (p.pendingUnits || 0), 0) || 0);
      return e.inwardStatus === 'PENDING_INWARD' || pendingBat > 0;
    });

    if (pendingEntry) {
      setPendingInwardActionPrompt({
        entry: pendingEntry,
        pallets: selectedPalletsStats.palletList,
        actionType: 'DISPATCH_TOOL'
      });
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
    const pendingBat = (entry.pendingInwardBatteries !== undefined)
      ? entry.pendingInwardBatteries
      : (entry.pallets?.reduce((sum, p) => sum + (p.pendingUnits || 0), 0) || 0);
    const isPendingInward = entry.inwardStatus === 'PENDING_INWARD' || pendingBat > 0;

    if (isPendingInward) {
      setPendingInwardActionPrompt({
        entry,
        pallets: [],
        actionType: 'DISPATCH_MODAL'
      });
      return;
    }

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
      containerNo: entry.containerNo || '',
      sealNo: entry.sealNo || '',
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

    const containerNo = dispatchDetails.containerNo.trim();
    const sealNo = dispatchDetails.sealNo.trim();

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

  // Action: Open and navigate directly to an invoice row in the inventory section
  const handleViewInvoiceInInventory = (invoiceNo: string) => {
    setShowShortfillsModal(false);
    setShowVarianceModal(false);
    setActiveSection('inventory');

    const cleanNo = (invoiceNo || '').trim().replace(/^#/, '');
    setSearchQuery(cleanNo);

    const target = entries.find(
      (e) => (e.customInvoiceNo || '').trim().toLowerCase() === cleanNo.toLowerCase()
    );

    if (target) {
      setExpandedInventoryInvoiceIds((prev) => new Set(prev).add(target.id));

      if (selectedMonth !== 'ALL' && target.month && target.month.toUpperCase() !== selectedMonth.toUpperCase()) {
        setSelectedMonth('ALL');
      }
      if (customerFilter !== 'ALL' && target.customer && target.customer.toUpperCase() !== customerFilter.toUpperCase()) {
        setCustomerFilter('ALL');
      }
      setDateFrom('');
      setDateTo('');
      setInventoryStatusFilter('ALL');

      setTimeout(() => {
        const el = document.getElementById(`invoice-row-${target.customInvoiceNo}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
    }
  };

  // Action: Undo Dispatch & Restore Stock to Active Warehouse Floor
  const handleUndoDispatch = (act: {
    id: string;
    customInvoiceNo: string;
    receivedPallets?: number;
    invoicedPallets?: number;
    receivedUnits?: number;
    invoicedUnits?: number;
    ledgerEntry?: CFSLedgerEntry;
    shortfillUnits?: number;
  }) => {
    const invoiceNo = act.customInvoiceNo;
    const plts = act.receivedPallets || act.invoicedPallets || 0;
    const units = act.receivedUnits || act.invoicedUnits || 0;
    const hasShortfill = Boolean(
      (act.ledgerEntry?.shortFillLinks && act.ledgerEntry.shortFillLinks.length > 0) ||
      (act.shortfillUnits && act.shortfillUnits > 0)
    );

    const confirmMsg =
      `Are you sure you want to undo the dispatch for Invoice #${invoiceNo}?\n\n` +
      `• Restores: ${plts} pallet(s) / ${units.toLocaleString()} unit(s) back to active warehouse floor stock.\n` +
      `• Container details: Cleared if fully returned to floor.\n` +
      (hasShortfill
        ? `• Shortfill: Linked shortfall(s) on prior invoices will cleanly fallback to CLEARED/pending dispatch on floor stock.\n`
        : '') +
      `\nClick OK to confirm and restore inventory.`;

    if (!window.confirm(confirmMsg)) return;

    const res = restoreDispatchedRecord(act.id, act.customInvoiceNo, act.ledgerEntry?.id);
    if (res.success) {
      showToast(
        `Dispatch for #${invoiceNo} undone! Restored ${res.restoredPallets ?? plts} pallet(s) (${(res.restoredBatteries ?? units).toLocaleString()} units) to active floor stock.`
      );
      reloadEntries();
    } else {
      showToast(res.error || 'Failed to undo dispatch.');
    }
  };

  // Trash Bin State & Modals
  const [trashBinItems, setTrashBinItems] = useState<TrashBinItem[]>(() => getCFSTrashBinEntries());
  const [showTrashBinModal, setShowTrashBinModal] = useState(false);

  // Deletion Confirmation Modal State & Handlers
  const [itemToDelete, setItemToDelete] = useState<{
    type: 'invoice' | 'pallet' | 'selected_pallets' | 'log';
    id?: string;
    palletId?: string;
    logId?: string;
    title: string;
    description: string;
  } | null>(null);

  const promptDeleteInvoice = (entry: CFSLedgerEntry) => {
    let warningNotes = '';
    const suppliedFills = getSuppliedShortFillsForInvoice(entry, entries);
    if (suppliedFills.length > 0) {
      const summaryList = suppliedFills
        .map((l) => `${l.unitsFilled} units on #${l.priorShortfallInvoiceNo}`)
        .join(', ');
      warningNotes += `\n\n⚠️ SHORTFALL ROLLBACK NOTICE: This inward fulfilled prior shortfalls (${summaryList}). Deleting this inward will automatically roll back those fulfilled units and restore the open shortfall on the original invoice(s).`;
    }
    if (entry.shortfalls && entry.shortfalls.length > 0) {
      const openSf = entry.shortfalls.reduce((sum, s) => sum + s.remainingShortfallUnits, 0);
      if (openSf > 0) {
        warningNotes += `\n\nℹ️ This invoice has ${openSf} open shortfall units recorded.`;
      }
    }

    setItemToDelete({
      type: 'invoice',
      id: entry.id,
      title: `Delete Invoice ${entry.customInvoiceNo}?`,
      description: `This will move invoice ${entry.customInvoiceNo} and its ${entry.pallets?.length || entry.invoicedPallets} pallets for ${entry.customer} into the Recycle Bin.${warningNotes}\n\nYou can recover this inward from the Recycle Bin at any time.`
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
      showToast('Invoice moved to Recycle Bin. Prior shortfalls rolled back.');
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

      {/* TOP HEADER */}
      <header className="bg-surface border-b border-divider shrink-0 z-20 shadow-xs">

        <div className="h-12 px-4 sm:px-6 flex items-center justify-between border-b border-divider/60">
          <div className="flex items-center space-x-3">
            {/* Ekdant Brand */}
            <div className="flex items-center space-x-2 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-brand-primary flex items-center justify-center shadow-xs">
                <Package className="w-4 h-4 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold tracking-tight text-content-primary">EKDANT</span>
                <span className="text-[8px] font-mono tracking-wider text-content-muted -mt-0.5">LOGISTICS</span>
              </div>
            </div>

            <div className="h-4 w-px bg-divider" />

            {/* Navigation Dropdown: Warehouse / Dispatch Tool */}
            <div className="relative">
              <select
                value="inventory"
                onChange={(e) => {
                  if (e.target.value === 'workspace') {
                    onNavigateToWorkspace();
                  }
                }}
                className="pl-3 pr-8 py-1.5 bg-surface border border-divider rounded-lg font-bold text-xs sm:text-sm text-content-primary focus:outline-none focus:border-brand-primary cursor-pointer appearance-none shadow-2xs hover:bg-surface-secondary transition-colors"
                aria-label="Navigation selector"
              >
                <option value="inventory">Warehouse</option>
                <option value="workspace">Dispatch Tool</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-content-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Recycle Bin Button */}
            {trashBinItems.length > 0 && (
              <button
                onClick={() => setShowTrashBinModal(true)}
                className="px-3 py-1.5 rounded-lg border border-divider hover:bg-slate-100 text-content-secondary hover:text-content-primary text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
                title="View and recover deleted invoices"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                <span>Recycle Bin ({trashBinItems.length})</span>
              </button>
            )}

            {/* Primary Manual Inward Button */}
            <button
              onClick={() => setShowManualInwardModal(true)}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
              title="Record direct manual stock-inward with exact weights, shortfall, or short-fill reconciliation"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Inward</span>
            </button>
          </div>
        </div>

        {/* REFINED CLEAN STATS DECK (1:1 with Master Design) */}
        <div className="p-4 sm:p-5 bg-white dark:bg-surface border-b border-divider">
          <div className="flex flex-col lg:flex-row items-stretch divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-divider gap-4 lg:gap-0 font-sans">
            {/* Column 1: Carting (Multi-Part Inward Progress) */}
            <div className="flex-1 lg:pr-5 flex flex-col justify-between">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-content-primary tracking-tight mb-2.5">
                Carting
              </h3>
              <div className="flex items-center divide-x divide-slate-200 dark:divide-divider pt-0.5">
                <div className="pr-3 sm:pr-4">
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider block mb-1">
                    PENDING INVOICES
                  </span>
                  <span className={`text-xl sm:text-2xl font-bold leading-none ${
                    kpis.cartingPendingInvoicesCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-content-primary'
                  }`}>
                    {kpis.cartingPendingInvoicesCount}
                  </span>
                </div>
                <div className="px-3 sm:px-4">
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider block mb-1">
                    PALLETS PENDING
                  </span>
                  <span className={`text-xl sm:text-2xl font-bold leading-none ${
                    kpis.cartingPendingPalletsCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-content-primary'
                  }`}>
                    {kpis.cartingPendingPalletsCount}
                  </span>
                </div>
                <div className="pl-3 sm:pl-4">
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider block mb-1">
                    UNITS PENDING
                  </span>
                  <span className={`text-xl sm:text-2xl font-bold leading-none ${
                    kpis.cartingPendingUnitsCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-content-primary'
                  }`}>
                    {kpis.cartingPendingUnitsCount.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Column 2: Available Stock */}
            <div className="flex-1 pt-4 lg:pt-0 lg:px-5 flex flex-col justify-between">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-content-primary tracking-tight mb-2.5">
                Available Stock
              </h3>
              <div className="flex items-center divide-x divide-slate-200 dark:divide-divider pt-0.5">
                <div className="pr-3 sm:pr-4">
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider block mb-1">
                    PALLETS
                  </span>
                  <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-content-primary leading-none">
                    {kpis.totalBalancePallets.toLocaleString()}
                  </span>
                </div>
                <div className="px-3 sm:px-4">
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider block mb-1">
                    UNITS
                  </span>
                  <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-content-primary leading-none">
                    {kpis.totalBalanceBatteries.toLocaleString()}
                  </span>
                </div>
                <div className="pl-3 sm:pl-4">
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider block mb-1">
                    WEIGHT (KG)
                  </span>
                  <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-content-primary leading-none whitespace-nowrap" title={`${kpis.totalBalanceGrossKg.toLocaleString()} kg`}>
                    {kpis.totalBalanceGrossKg > 0 ? kpis.totalBalanceGrossKg.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '0'}
                  </span>
                </div>
              </div>
            </div>

            {/* Column 3: Dispatched */}
            <div className="flex-1 pt-4 lg:pt-0 lg:px-5 flex flex-col justify-between">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-content-primary tracking-tight mb-2.5">
                Dispatched
              </h3>
              <div className="flex items-center divide-x divide-slate-200 dark:divide-divider pt-0.5">
                <div className="pr-4 sm:pr-5">
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider block mb-1">
                    PALLETS
                  </span>
                  <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-content-primary leading-none">
                    {kpis.totalStuffedPallets.toLocaleString()}
                  </span>
                </div>
                <div className="px-4 sm:px-5">
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider block mb-1">
                    UNITS
                  </span>
                  <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-content-primary leading-none">
                    {kpis.totalStuffedBatteries.toLocaleString()}
                  </span>
                </div>
                <div className="pl-4 sm:pl-5">
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider block mb-1">
                    CONTAINERS
                  </span>
                  <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-content-primary leading-none whitespace-nowrap">
                    {kpis.dispatchedContainersCount} <span className="text-sm font-normal text-slate-500">cntr</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Column 3: Shortfall (Interactive Drilldown) */}
            <div
              onClick={() => setShowVarianceModal(true)}
              className="flex-1 pt-4 lg:pt-0 lg:px-6 flex flex-col justify-between cursor-pointer group select-none"
              title="Click to view list of invoices with shortfall/variance between Invoiced and Actual Received quantities"
            >
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-content-primary tracking-tight mb-2.5 group-hover:text-amber-600 transition-colors">
                Shortfall
              </h3>
              <div className="flex items-center divide-x divide-slate-200 dark:divide-divider pt-0.5">
                <div className="pr-4 sm:pr-5">
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider block mb-1">
                    PALLET DIFF
                  </span>
                  <span className={`text-xl sm:text-2xl font-bold leading-none ${
                    kpis.totalShortfallPallets > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-content-primary'
                  }`}>
                    {kpis.totalShortfallPallets > 0 ? `-${kpis.totalShortfallPallets}` : '0'}
                  </span>
                </div>
                <div className="pl-4 sm:pl-5">
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider block mb-1">
                    UNITS DIFF
                  </span>
                  <span className={`text-xl sm:text-2xl font-bold leading-none ${
                    kpis.totalShortfallBatteries > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-content-primary'
                  }`}>
                    {kpis.totalShortfallBatteries > 0 ? `-${kpis.totalShortfallBatteries.toLocaleString()}` : '0'}
                  </span>
                </div>
              </div>
            </div>

            {/* Column 4: Short Fill (Interactive Drilldown) */}
            <div
              onClick={() => setShowShortfillsModal(true)}
              className="flex-1 pt-4 lg:pt-0 lg:pl-6 flex flex-col justify-between cursor-pointer group select-none"
              title="Click to view all shortfills available in warehouse ready to fulfill customer shortfalls"
            >
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-content-primary tracking-tight mb-2.5 group-hover:text-purple-600 transition-colors">
                Short Fill
              </h3>
              <div className="flex items-center divide-x divide-slate-200 dark:divide-divider pt-0.5">
                <div className="pr-4 sm:pr-5">
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider block mb-1">
                    FULLY AVAILABLE
                  </span>
                  <span className={`text-xl sm:text-2xl font-bold leading-none ${
                    shortfillAvailability.fullyAvailableCount > 0
                      ? 'text-purple-600 dark:text-purple-400'
                      : 'text-slate-900 dark:text-content-primary'
                  }`}>
                    {shortfillAvailability.fullyAvailableCount}
                  </span>
                </div>
                <div className="pl-4 sm:pl-5">
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider block mb-1">
                    FLOOR UNITS
                  </span>
                  <span className={`text-xl sm:text-2xl font-bold leading-none ${
                    shortfillAvailability.totalAvailableUnits > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-900 dark:text-content-primary'
                  }`}>
                    {shortfillAvailability.totalAvailableUnits > 0
                      ? shortfillAvailability.totalAvailableUnits.toLocaleString()
                      : '0'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CONTROLS BAR: SEARCH (FIRST OPTION) + SECTION DROPDOWN + CUSTOMER DROPDOWN + STATUS (FOR INVENTORY / LOGS) */}
        <div className="px-4 sm:px-6 py-2.5 bg-surface border-t border-divider flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            {/* Search Input - FIRST OPTION in row */}
            <div className="relative w-48 sm:w-56 shrink-0">
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

            {/* Section Dropdown (Replaced horizontal 4 tabs with clean dropdown as requested) */}
            <div className="flex items-center space-x-1.5 shrink-0">
              <label htmlFor="section-select" className="text-content-secondary font-medium shrink-0">
                Section:
              </label>
              <div className="relative">
                <select
                  id="section-select"
                  value={activeSection}
                  onChange={(e) => setActiveSection(e.target.value as HubSection)}
                  className="pl-3 pr-8 py-1.5 bg-surface-secondary border border-divider rounded-lg font-medium text-content-primary focus:outline-none focus:border-brand-primary cursor-pointer text-xs appearance-none shadow-2xs"
                >
                  <option value="inventory">1. Inventory ({availablePalletUnits.length}p)</option>
                  <option value="status_logs">2. Status Logs ({filteredStatusLogInvoices.length})</option>
                  <option value="stock_ledgers">3. Stock Ledgers ({allShortfallIncidents.length})</option>
                  <option value="reports">4. Monthly Live ({filteredEntries.length})</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-content-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Customer Dropdown */}
            <div className="flex items-center space-x-1.5 shrink-0">
              <label htmlFor="customer-select" className="text-content-secondary font-medium shrink-0">Customer:</label>
              <div className="relative">
                <select
                  id="customer-select"
                  value={customerFilter}
                  onChange={(e) => setCustomerFilter(e.target.value)}
                  className="pl-3 pr-8 py-1.5 bg-surface-secondary border border-divider rounded-lg font-medium text-content-primary focus:outline-none focus:border-brand-primary cursor-pointer text-xs max-w-[190px] truncate appearance-none shadow-2xs"
                >
                  <option value="ALL">All Customers ({kpis.totalBalancePallets}p)</option>
                  {customerDropdownData.map((c) => (
                    <option key={c.customer} value={c.customer}>
                      {c.customer} ({c.pallets}p)
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-content-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Status Filter for Section 1: Inventory */}
            {activeSection === 'inventory' && (
              <div className="flex items-center space-x-1.5 text-xs shrink-0">
                <label htmlFor="status-filter-select" className="text-content-secondary font-medium shrink-0">
                  Stock Status:
                </label>
                <div className="relative">
                  <select
                    id="status-filter-select"
                    value={inventoryStatusFilter}
                    onChange={(e) => setInventoryStatusFilter(e.target.value as any)}
                    className="pl-3 pr-8 py-1.5 bg-surface-secondary border border-divider rounded-lg font-medium text-content-primary focus:outline-none focus:border-brand-primary cursor-pointer text-xs appearance-none shadow-2xs"
                  >
                    <option value="ALL">All Stocks</option>
                    <option value="IN_WAREHOUSE">Fully Received</option>
                    <option value="SHORTFILL">Shortfill</option>
                    <option value="SHORTFALL">Shortfall</option>
                    <option value="DISPATCHED">Dispatched</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-content-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Status Filter for Section 2: Status Logs */}
            {activeSection === 'status_logs' && (
              <div className="flex items-center space-x-1.5 text-xs shrink-0">
                <label htmlFor="status-logs-filter-select" className="text-content-secondary font-medium shrink-0">
                  Status:
                </label>
                <div className="relative">
                  <select
                    id="status-logs-filter-select"
                    value={statusLogFilter}
                    onChange={(e) => setStatusLogFilter(e.target.value as any)}
                    className="pl-3 pr-8 py-1.5 bg-surface-secondary border border-divider rounded-lg font-medium text-content-primary focus:outline-none focus:border-brand-primary cursor-pointer text-xs appearance-none shadow-2xs"
                  >
                    <option value="ALL">All Invoices ({filteredEntries.length})</option>
                    <option value="IN_WAREHOUSE">In Warehouse ({filteredEntries.filter((e) => (e.balancePallets || 0) > 0).length})</option>
                    <option value="PARTIAL_DISPATCH">Partial Dispatch ({filteredEntries.filter((e) => (e.balancePallets || 0) > 0 && (e.actualStuffedPallets || 0) > 0).length})</option>
                    <option value="DISPATCHED">Fully Dispatched ({filteredEntries.filter((e) => (e.balancePallets || 0) === 0 && (e.actualStuffedPallets || 0) > 0).length})</option>
                    <option value="SHORTFALL">Shortfall Recorded ({filteredEntries.filter((e) => (e.shortfallBatteries || 0) > 0 || (e.shortfallPallets || 0) > 0).length})</option>
                    <option value="SHORTFILL">Shortfill Linked ({filteredEntries.filter((e) => getSuppliedShortFillsForInvoice(e, entries).length > 0).length})</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-content-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}

            {/* In-line Export Action for Section 2: Status Logs */}
            {activeSection === 'status_logs' && (
              <button
                type="button"
                onClick={() => exportCFSMasterReportXlsx(filteredStatusLogInvoices, selectedMonth)}
                className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary border border-divider text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-xs cursor-pointer shrink-0"
                title="Export Status Logs to Excel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Export Status Logs (.xlsx)</span>
              </button>
            )}

            {/* Status Filter for Section 3: Stock Ledgers */}
            {activeSection === 'stock_ledgers' && (
              <div className="flex items-center space-x-1.5 text-xs shrink-0">
                <label htmlFor="sf-ledger-select" className="text-content-secondary font-medium shrink-0">
                  Status:
                </label>
                <div className="relative">
                  <select
                    id="sf-ledger-select"
                    value={shortfallLedgerFilter}
                    onChange={(e) => setShortfallLedgerFilter(e.target.value as any)}
                    className="pl-3 pr-8 py-1.5 bg-surface-secondary border border-divider rounded-lg font-medium text-content-primary focus:outline-none focus:border-brand-primary cursor-pointer text-xs appearance-none shadow-2xs"
                  >
                    <option value="ALL">All Incidents ({allShortfallIncidents.length})</option>
                    <option value="OPEN">Open / Pending Backlog</option>
                    <option value="CLEARED">Cleared / Fulfilled</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-content-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Month Filter for Section 4: Monthly Live Reports */}
            {activeSection === 'reports' && (
              <div className="flex items-center space-x-1.5 text-xs shrink-0">
                <label htmlFor="month-select" className="text-content-secondary font-medium shrink-0">
                  Month:
                </label>
                <div className="relative">
                  <select
                    id="month-select"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value as CFSMonth)}
                    className="pl-3 pr-8 py-1.5 bg-surface-secondary border border-divider rounded-lg font-semibold text-content-primary focus:outline-none focus:border-brand-primary cursor-pointer text-xs appearance-none shadow-2xs"
                  >
                    <option value="ALL">All Months</option>
                    {CFS_MONTHS.filter((m) => m !== 'ALL').map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-content-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}
          </div>

          {/* Right Actions */}
          <div className="flex items-center space-x-2 shrink-0">
            {activeSection === 'inventory' && selectedPalletsStats.count > 0 && (
              <div className="flex items-center space-x-2 shrink-0 animate-in fade-in duration-150">
                <div className="flex items-center px-2.5 py-1.5 rounded-lg bg-transparent border border-divider text-content-secondary text-xs font-mono font-medium shadow-2xs">
                  <span>Selected P - {selectedPalletsStats.count}, U - {selectedPalletsStats.batteries.toLocaleString()}</span>
                </div>
                <button
                  type="button"
                  onClick={handleLoadSelectedIntoWorkspace}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-2xs bg-brand-primary hover:bg-brand-primary-hover text-white cursor-pointer"
                  title="Open Workspace Dispatch Tool with selected pallets"
                >
                  <span>Dispatch Tool</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const pendingEntry = entries.find((e) => {
                      const hasSelected = (e.pallets || []).some((p) => selectedPalletIds.has(p.id));
                      if (!hasSelected) return false;
                      const pendingBat = (e.pendingInwardBatteries !== undefined)
                        ? e.pendingInwardBatteries
                        : (e.pallets?.reduce((sum, p) => sum + (p.pendingUnits || 0), 0) || 0);
                      return e.inwardStatus === 'PENDING_INWARD' || pendingBat > 0;
                    });

                    if (pendingEntry) {
                      setPendingInwardActionPrompt({
                        entry: pendingEntry,
                        pallets: selectedPalletsStats.palletList,
                        actionType: 'DISPATCH_MODAL'
                      });
                      return;
                    }

                    setDispatchDetails((prev) => ({
                      ...prev,
                      containerNo: prev.containerNo || '',
                      sealNo: prev.sealNo || ''
                    }));
                    setShowDispatchModal(true);
                  }}
                  className="px-3.5 py-1.5 rounded-lg text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-2xs bg-emerald-600 hover:bg-emerald-700 cursor-pointer"
                  title="Confirm container stuffing & stock-out dispatch"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Dispatch</span>
                </button>
              </div>
            )}

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
            {/* Invoices List */}
            {activeStockInvoices.length === 0 ? (
              <div className="text-center py-20 bg-surface border border-dashed border-divider rounded-xl p-8">
                <Boxes className="w-10 h-10 text-content-muted mx-auto mb-2 opacity-60" />
                <h3 className="text-xs font-semibold text-content-secondary">No active stock matching selected filters</h3>
                <p className="text-xs text-content-muted mt-1">Try adjusting your customer filter or search query</p>
              </div>
            ) : (
              <div className="bg-surface border border-divider rounded-xl shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono border-collapse select-text">
                    <thead className="bg-surface-secondary/70 border-b border-divider text-left text-[11px] font-semibold text-content-secondary select-none">
                      <tr>
                        <th className="p-3 border-r border-divider/50 whitespace-nowrap">Invoice #</th>
                        <th className="p-3 border-r border-divider/50 whitespace-nowrap min-w-[220px]">Product / Description</th>
                        <th className="p-3 border-r border-divider/50 whitespace-nowrap">POD</th>
                        <th className="p-3 border-r border-divider/50 whitespace-nowrap">Invoice Date</th>
                        <th className="p-3 border-r border-divider/50 whitespace-nowrap">Carting / Gate-In</th>
                        <th className="p-3 border-r border-divider/50 whitespace-nowrap">Ageing</th>
                        <th className="p-3 border-r border-divider/50 whitespace-nowrap min-w-[340px]">Status</th>
                        <th className="p-3 w-10 text-center"></th>
                      </tr>
                    </thead>
                    {activeStockInvoices.map((entry) => {
                      const isExpanded = expandedInventoryInvoiceIds.has(entry.id);
                      return (
                        <CompactInvoiceBlock
                          key={entry.id}
                          entry={entry}
                          isExpanded={isExpanded}
                          onToggleExpand={() => {
                            setExpandedInventoryInvoiceIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(entry.id)) next.delete(entry.id);
                              else next.add(entry.id);
                              return next;
                            });
                          }}
                          selectedPalletIds={selectedPalletIds}
                          onTogglePallet={(palletId, customer) => {
                            togglePalletSelection(palletId, customer);
                          }}
                          onSelectAllPallets={(palletIds, customer) => {
                            if (selectedDispatchCustomer && selectedDispatchCustomer.toUpperCase() !== customer.toUpperCase()) {
                              setSelectedPalletIds(new Set(palletIds));
                              setSelectedDispatchCustomer(customer);
                            } else {
                              setSelectedDispatchCustomer(customer);
                              setSelectedPalletIds((prev) => {
                                const next = new Set(prev);
                                palletIds.forEach((id) => next.add(id));
                                return next;
                              });
                            }
                          }}
                          onDeselectAllPallets={(palletIds) => {
                            setSelectedPalletIds((prev) => {
                              const next = new Set(prev);
                              palletIds.forEach((id) => next.delete(id));
                              if (next.size === 0) setSelectedDispatchCustomer('');
                              return next;
                            });
                          }}
                          onConfirmFullGateIn={(entryId) => handleConfirmFullGateIn(entryId)}
                          onOpenDispatch={(invEntry) => handleOpenDispatchForInvoice(invEntry)}
                          onLoadDispatchTool={(invEntry) => {
                            const pendingBat = (invEntry.pendingInwardBatteries !== undefined)
                              ? invEntry.pendingInwardBatteries
                              : (invEntry.pallets?.reduce((sum, p) => sum + (p.pendingUnits || 0), 0) || 0);
                            const isPendingInward = invEntry.inwardStatus === 'PENDING_INWARD' || pendingBat > 0;

                            if (isPendingInward) {
                              setPendingInwardActionPrompt({
                                entry: invEntry,
                                pallets: [],
                                actionType: 'DISPATCH_TOOL'
                              });
                              return;
                            }

                            const targetPallets = (invEntry.pallets || []).filter((p) => p.status === 'IN_WAREHOUSE');
                            if (targetPallets.length === 0) {
                              showToast('No ready pallets available to load into container planner.');
                              return;
                            }
                            const shipment = buildShipmentFromStockPallets(targetPallets, invEntry.customer, invEntry.pod, invEntry.exporterShipper);
                            onLoadShipmentIntoWorkspace(shipment);
                            onNavigateToWorkspace();
                            showToast(`Loaded ${targetPallets.length} ready pallets from #${invEntry.customInvoiceNo} into Dispatch Tool.`);
                          }}
                          onLoadCheckedIntoWorkspace={(pallets) => {
                            const pendingBat = (entry.pendingInwardBatteries !== undefined)
                              ? entry.pendingInwardBatteries
                              : (entry.pallets?.reduce((sum, p) => sum + (p.pendingUnits || 0), 0) || 0);
                            const isPendingInward = entry.inwardStatus === 'PENDING_INWARD' || pendingBat > 0;

                            if (isPendingInward) {
                              setPendingInwardActionPrompt({
                                entry,
                                pallets,
                                actionType: 'DISPATCH_TOOL'
                              });
                              return;
                            }

                            const targetPallets = pallets.length > 0 ? pallets : (entry.pallets || []).filter((p) => p.status === 'IN_WAREHOUSE');
                            if (targetPallets.length === 0) {
                              showToast('No ready pallets available to load into container planner.');
                              return;
                            }
                            const shipment = buildShipmentFromStockPallets(targetPallets, entry.customer, entry.pod, entry.exporterShipper);
                            onLoadShipmentIntoWorkspace(shipment);
                            onNavigateToWorkspace();
                          }}
                          onGenerateDgBl={(invEntry, pallets) => {
                            const pendingBat = (invEntry.pendingInwardBatteries !== undefined)
                              ? invEntry.pendingInwardBatteries
                              : (invEntry.pallets?.reduce((sum, p) => sum + (p.pendingUnits || 0), 0) || 0);
                            const isPendingInward = invEntry.inwardStatus === 'PENDING_INWARD' || pendingBat > 0;

                            if (isPendingInward) {
                              setPendingInwardActionPrompt({ entry: invEntry, pallets, actionType: 'DG_BL' });
                              return;
                            }

                            const targetPallets = pallets.length > 0 ? pallets : (invEntry.pallets || []).filter((p) => p.status === 'IN_WAREHOUSE');
                            if (targetPallets.length === 0) {
                              showToast('No ready pallets available for document generation.');
                              return;
                            }
                            markLedgerDocumentCreated([invEntry.id], 'DG');
                            markLedgerDocumentCreated([invEntry.id], 'BL');
                            reloadEntries();
                            const shipment = buildShipmentFromStockPallets(targetPallets, invEntry.customer, invEntry.pod, invEntry.exporterShipper);
                            onLoadShipmentIntoWorkspace(shipment);
                            onNavigateToWorkspace();
                            showToast(`DG Manifest & BL generated for #${invEntry.customInvoiceNo}!`);
                          }}
                          onRecordShortFill={(invEntry) => {
                            setEditingInwardEntry(null);
                            setShortfallTargetInvoiceNo(invEntry.customInvoiceNo);
                            setShowManualInwardModal(true);
                          }}
                          onDeleteInvoice={(invEntry) => promptDeleteInvoice(invEntry)}
                          onDeletePallet={(invEntry, pallet) => promptDeletePallet(invEntry, pallet)}
                          onEditInward={(invEntry) => {
                            setEditingInwardEntry(invEntry);
                            setShowManualInwardModal(true);
                          }}
                        />
                      );
                    })}
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            SECTION 3: STOCK LEDGERS (SHORTFALL & SHORTFILL LIFECYCLE & MULTI-PART)
            ===================================================================== */}
        {activeSection === 'stock_ledgers' && (
          <div className="space-y-4 pb-24 font-sans">
            {/* Shortfalls & Shortfills Table */}
            {filteredShortfallIncidents.length === 0 ? (
              <div className="text-center py-20 bg-surface border border-dashed border-divider rounded-xl p-8">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
                <h3 className="text-xs font-semibold text-content-secondary">No Shortfall Incidents Found</h3>
                <p className="text-xs text-content-muted mt-1">All invoices are clean and accounted for matching selected filter</p>
              </div>
            ) : (
              <div className="bg-surface border border-divider rounded-xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono border-collapse select-text">
                    <thead className="bg-surface-secondary/70 border-b border-divider text-left text-[11px] font-semibold text-content-secondary">
                      <tr>
                        <th className="p-3 border-r border-divider">Mode</th>
                        <th className="p-3 border-r border-divider">Shortfall Invoice</th>
                        <th className="p-3 border-r border-divider">Customer</th>
                        <th className="p-3 border-r border-divider text-center">Shortfall Pallet #</th>
                        <th className="p-3 border-r border-divider text-right">Billed Units</th>
                        <th className="p-3 border-r border-divider text-right text-rose-700 font-bold">Short Units</th>
                        <th className="p-3 border-r border-divider text-right text-amber-700 font-bold">Remaining Short</th>
                        <th className="p-3 border-r border-divider">Opened Date</th>
                        <th className="p-3 border-r border-divider min-w-[280px]">Shortfill Recovery History (Multi-Part)</th>
                        <th className="p-3 border-r border-divider text-center">Status</th>
                        <th className="p-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-divider/60 tabular-nums">
                      {filteredShortfallIncidents.map((item) => {
                        const sf = item.shortfall;
                        const isCleared = sf.status === 'CLEARED' || sf.status === 'FULFILLED' || sf.remainingShortfallUnits === 0;

                        return (
                          <tr key={sf.id} className="hover:bg-slate-50/70 transition-colors">
                            {/* Mode */}
                            <td className="p-3 border-r border-divider whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  sf.mode === 'PALLET'
                                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                    : 'bg-blue-100 text-blue-800 border border-blue-200'
                                }`}
                              >
                                {sf.mode === 'PALLET' ? 'Full Pallet' : 'Partial Units'}
                              </span>
                            </td>

                            {/* Shortfall Invoice No */}
                            <td className="p-3 border-r border-divider whitespace-nowrap font-bold text-brand-primary">
                              #{item.customInvoiceNo}
                            </td>

                            {/* Customer */}
                            <td className="p-3 border-r border-divider font-sans font-medium text-content-primary">
                              {item.customer}
                            </td>

                            {/* Pallet # */}
                            <td className="p-3 border-r border-divider text-center font-bold">
                              PLT #{sf.palletNumber}
                            </td>

                            {/* Billed Units */}
                            <td className="p-3 border-r border-divider text-right">
                              {sf.billedUnits} Units
                            </td>

                            {/* Short Units */}
                            <td className="p-3 border-r border-divider text-right font-bold text-rose-600">
                              {sf.shortfallUnits} Units
                            </td>

                            {/* Remaining Short */}
                            <td className="p-3 border-r border-divider text-right font-bold text-amber-600">
                              {sf.remainingShortfallUnits} Units
                            </td>

                            {/* Opened Date */}
                            <td className="p-3 border-r border-divider whitespace-nowrap text-content-secondary">
                              {sf.openedDate || '—'}
                            </td>

                            {/* Multi-Part Shortfill Tracking */}
                            <td className="p-3 border-r border-divider text-[11px] text-content-secondary">
                              {(sf.linkedShortFills || []).length > 0 ? (
                                <div className="space-y-1.5">
                                  {sf.linkedShortFills.map((lsf, i) => {
                                    const partNum = i + 1;
                                    const isRenumbered = lsf.arrivedPalletNumber && String(lsf.arrivedPalletNumber) !== String(sf.palletNumber);

                                    return (
                                      <div
                                        key={i}
                                        className="p-1.5 rounded bg-surface border border-divider/60 text-content-primary text-xs"
                                      >
                                        <div className="flex items-center justify-between font-semibold">
                                          <span className="text-purple-700">Part {partNum}: +{lsf.unitsFilled} units</span>
                                          <span className="text-content-muted font-normal">{lsf.filledDate || '—'}</span>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px]">
                                          <span className="text-content-secondary">
                                            Inward Invoice: <strong className="font-mono text-brand-primary">#{lsf.shortFillInvoiceNo}</strong>
                                          </span>

                                          {isRenumbered ? (
                                            <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 font-mono">
                                              Renumbered to PLT #{lsf.arrivedPalletNumber}
                                            </span>
                                          ) : (
                                            <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                                              On PLT #{lsf.palletNumber}
                                            </span>
                                          )}

                                          {lsf.dispatched ? (
                                            <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold uppercase">
                                              Dispatched {lsf.dispatchContainerNo ? `(${lsf.dispatchContainerNo})` : ''}
                                            </span>
                                          ) : (
                                            <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-800 border border-blue-200 font-medium">
                                              In Warehouse Floor Stock
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="text-content-muted italic">
                                  Awaiting factory shortfill shipment
                                </div>
                              )}
                            </td>

                            {/* Status */}
                            <td className="p-3 border-r border-divider text-center whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  isCleared
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : sf.status === 'PARTIAL_FILL'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : 'bg-rose-100 text-rose-800 border border-rose-200'
                                }`}
                              >
                                {isCleared ? 'CLEARED' : sf.status}
                              </span>
                            </td>

                            {/* Action */}
                            <td className="p-3 text-center whitespace-nowrap">
                              {!isCleared && (
                                <button
                                  type="button"
                                  onClick={() => setShowManualInwardModal(true)}
                                  className="px-2.5 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-semibold transition-colors cursor-pointer"
                                  title="Record incoming shortfill for this item"
                                >
                                  Record Shortfill
                                </button>
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
        )}


        {/* =====================================================================
            SECTION 2: STATUS LOGS (CONSOLIDATED MASTER INVOICES & CHRONOLOGICAL TRACKS)
            ===================================================================== */}
        {activeSection === 'status_logs' && (
          <div className="space-y-4 pb-20 font-sans">
            {/* Status Logs Table */}
            <div className="bg-surface border border-divider rounded-xl shadow-xs overflow-hidden">
              <div className="overflow-x-auto max-h-[720px]">
                <table className="w-full text-xs font-mono border-collapse select-text">
                  <thead className="bg-surface-secondary sticky top-0 z-10 border-b border-divider text-left text-[11px] font-semibold text-content-secondary">
                    {/* Row 1 Headers matching Master Reference */}
                    <tr>
                      <th rowSpan={2} className="p-2.5 border-r border-divider whitespace-nowrap">Invoice No.</th>
                      <th rowSpan={2} className="p-2.5 border-r border-divider whitespace-nowrap">Date</th>
                      <th rowSpan={2} className="p-2.5 border-r border-divider whitespace-nowrap min-w-[140px]">Consignee</th>
                      <th colSpan={2} className="p-2 border-r border-divider text-center font-semibold">Invoiced</th>
                      <th colSpan={2} className="p-2 border-r border-divider text-center font-semibold">Received</th>
                      <th colSpan={2} className="p-2 border-r border-divider text-center font-semibold">Shortfall/ Shortfill</th>
                      <th colSpan={2} className="p-2 border-r border-divider text-center font-semibold">Floor Balance</th>
                      <th colSpan={2} className="p-2 border-r border-divider text-center font-semibold">Dispatched</th>
                      <th rowSpan={2} className="p-2.5 border-r border-divider whitespace-nowrap">References</th>
                      <th rowSpan={2} className="p-2.5 border-r border-divider whitespace-nowrap">Container Nos</th>
                      <th rowSpan={2} className="p-2.5 border-r border-divider text-center whitespace-nowrap">Status</th>
                      <th rowSpan={2} className="p-2.5 text-center whitespace-nowrap">Action</th>
                    </tr>
                    {/* Row 2 Sub-Headers: Plts / Units */}
                    <tr className="border-t border-divider/60 text-[10px]">
                      <th className="px-2 py-1 border-r border-divider text-right font-medium text-content-secondary">Plts</th>
                      <th className="px-2 py-1 border-r border-divider text-right font-medium text-content-secondary">Units</th>
                      <th className="px-2 py-1 border-r border-divider text-right font-medium text-content-secondary">Plts</th>
                      <th className="px-2 py-1 border-r border-divider text-right font-medium text-content-secondary">Units</th>
                      <th className="px-2 py-1 border-r border-divider text-right font-medium text-content-secondary">Plts</th>
                      <th className="px-2 py-1 border-r border-divider text-right font-medium text-content-secondary">Units</th>
                      <th className="px-2 py-1 border-r border-divider text-right font-medium text-content-secondary">Plts</th>
                      <th className="px-2 py-1 border-r border-divider text-right font-medium text-content-secondary">Units</th>
                      <th className="px-2 py-1 border-r border-divider text-right font-medium text-content-secondary">Plts</th>
                      <th className="px-2 py-1 border-r border-divider text-right font-medium text-content-secondary">Units</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider/60 tabular-nums">
                    {filteredStatusLogInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={16} className="p-12 text-center text-content-muted">
                          <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p>No invoices match the selected filter criteria.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredStatusLogInvoices.map((inv) => {
                        const balPlt = inv.balancePallets || 0;
                        const balBat = inv.balanceBatteries || 0;
                        const actualStuffedPlts = inv.actualStuffedPallets || 0;
                        const actualStuffedUnits = inv.actualStuffedBatteries || 0;
                        const isFullyDispatched = balPlt === 0 && actualStuffedPlts > 0;
                        const isPartialDispatch = balPlt > 0 && actualStuffedPlts > 0;

                        const sfPlts = (inv.shortfalls && inv.shortfalls.length > 0)
                          ? inv.shortfalls.filter((s) => s.mode === 'PALLET').length
                          : (inv.shortfallPallets || 0);
                        const sfUnits = (inv.shortfalls && inv.shortfalls.length > 0)
                          ? inv.shortfalls.reduce((sum, s) => sum + (s.shortfallUnits || 0), 0)
                          : (inv.shortfallBatteries || 0);
                        const suppliedFills = getSuppliedShortFillsForInvoice(inv, entries);
                        const sfillUnits = suppliedFills.reduce((sum, s) => sum + (s.unitsFilled || 0), 0);
                        const hasShortfall = sfUnits > 0 || sfPlts > 0;
                        const hasShortfill = sfillUnits > 0;
                        const isPendingInward = inv.inwardStatus === 'PENDING_INWARD' || (inv.pendingInwardBatteries || 0) > 0;
                        const isExpanded = expandedStatusLogInvoiceIds.has(inv.id);

                        // Collect unique containers for this invoice
                        const containerList: string[] = [];
                        if (inv.containerNo && inv.containerNo.trim()) {
                          containerList.push(inv.containerNo.trim());
                        }
                        (inv.pallets || []).forEach((p) => {
                          if (p.containerNo && p.containerNo.trim() && !containerList.includes(p.containerNo.trim())) {
                            containerList.push(p.containerNo.trim());
                          }
                        });

                        return (
                          <React.Fragment key={inv.id}>
                            <tr
                              onDoubleClick={() => toggleStatusLogExpand(inv.id)}
                              className={`cursor-pointer transition-colors ${
                                isExpanded
                                  ? 'bg-surface-secondary/70'
                                  : 'hover:bg-surface-secondary/40'
                              }`}
                              title="Double-click to expand/collapse chronological activity tracks & shortfall reconciliation"
                            >
                              {/* 1. Invoice No. + Expand button */}
                              <td className="p-2.5 border-r border-divider whitespace-nowrap font-bold text-brand-primary">
                                <div className="flex items-center space-x-1.5">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleStatusLogExpand(inv.id);
                                    }}
                                    className="p-1 hover:bg-surface-secondary rounded transition-colors text-content-muted hover:text-content-primary"
                                    title={isExpanded ? 'Collapse activity history' : 'Expand activity history'}
                                  >
                                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-brand-primary' : ''}`} />
                                  </button>
                                  <span>#{inv.customInvoiceNo}</span>
                                </div>
                              </td>

                              {/* 2. Date */}
                              <td className="p-2.5 border-r border-divider whitespace-nowrap text-content-secondary">
                                {inv.invoiceDate || inv.cartingInDate || '—'}
                              </td>

                              {/* 3. Consignee */}
                              <td className="p-2.5 border-r border-divider whitespace-nowrap font-sans font-medium text-content-primary max-w-[150px] truncate" title={inv.customer}>
                                {inv.customer}
                              </td>

                              {/* 4. Invoiced (Plts, Units) */}
                              <td className="p-2.5 border-r border-divider text-right text-content-secondary font-medium">
                                {inv.invoicedPallets}
                              </td>
                              <td className="p-2.5 border-r border-divider text-right text-content-secondary">
                                {inv.invoicedBatteries.toLocaleString()}
                              </td>

                              {/* 5. Received (Plts, Units) */}
                              <td className="p-2.5 border-r border-divider text-right font-semibold text-content-primary">
                                {inv.actualReceivedPallets !== undefined ? inv.actualReceivedPallets : inv.invoicedPallets}
                              </td>
                              <td className="p-2.5 border-r border-divider text-right font-semibold text-content-primary">
                                {(inv.actualReceivedBatteries !== undefined ? inv.actualReceivedBatteries : inv.invoicedBatteries).toLocaleString()}
                              </td>

                              {/* 6. Shortfall / Shortfill (Plts, Units) */}
                              <td className="p-2.5 border-r border-divider text-right">
                                {sfPlts > 0 ? (
                                  <span className="text-rose-600 font-bold">-{sfPlts}</span>
                                ) : (
                                  <span className="text-content-muted">0</span>
                                )}
                              </td>
                              <td className="p-2.5 border-r border-divider text-right">
                                {sfUnits > 0 ? (
                                  <span className="text-rose-600 font-bold">-{sfUnits.toLocaleString()}</span>
                                ) : sfillUnits > 0 ? (
                                  <span className="text-purple-600 font-bold">+{sfillUnits.toLocaleString()}</span>
                                ) : (
                                  <span className="text-content-muted">0</span>
                                )}
                              </td>

                              {/* 7. Floor Balance (Plts, Units) */}
                              <td className="p-2.5 border-r border-divider text-right font-medium">
                                {balPlt > 0 ? (
                                  <span className="text-content-primary font-bold">{balPlt}</span>
                                ) : (
                                  <span className="text-content-muted">0</span>
                                )}
                              </td>
                              <td className="p-2.5 border-r border-divider text-right font-medium">
                                {balBat > 0 ? (
                                  <span className="text-content-primary font-bold">{balBat.toLocaleString()}</span>
                                ) : (
                                  <span className="text-content-muted">0</span>
                                )}
                              </td>

                              {/* 8. Dispatched (Plts, Units) */}
                              <td className="p-2.5 border-r border-divider text-right text-content-secondary font-medium">
                                {actualStuffedPlts > 0 ? (
                                  <span className="text-content-primary font-semibold">{actualStuffedPlts}</span>
                                ) : (
                                  <span className="text-content-muted">0</span>
                                )}
                              </td>
                              <td className="p-2.5 border-r border-divider text-right text-content-secondary">
                                {actualStuffedUnits > 0 ? (
                                  <span className="text-content-primary font-semibold">{actualStuffedUnits.toLocaleString()}</span>
                                ) : (
                                  <span className="text-content-muted">0</span>
                                )}
                              </td>

                              {/* 10. References */}
                              <td className="p-2.5 border-r border-divider whitespace-nowrap font-mono text-[11px] text-content-secondary">
                                {inv.vehicleNo ? (
                                  <div>Truck: {inv.vehicleNo}</div>
                                ) : inv.shippingBillNo ? (
                                  <div>SB: {inv.shippingBillNo}</div>
                                ) : inv.pod ? (
                                  <div>POD: {inv.pod}</div>
                                ) : (
                                  <span className="text-content-muted">—</span>
                                )}
                              </td>

                              {/* 11. Container Nos */}
                              <td className="p-2.5 border-r border-divider whitespace-nowrap font-mono text-[11px]">
                                {containerList.length > 0 ? (
                                  <span className="font-semibold text-content-primary">{containerList.join(', ')}</span>
                                ) : (
                                  <span className="text-content-muted">—</span>
                                )}
                              </td>

                              {/* 12. Status */}
                              <td className="p-2.5 border-r border-divider text-center whitespace-nowrap">
                                <div className="flex flex-col items-center gap-1">
                                  {isPendingInward ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 uppercase tracking-tight" title="Multi-part inward: Remaining pallets/units pending arrival">
                                      PENDING INWARD
                                    </span>
                                  ) : isFullyDispatched ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 uppercase">
                                      DISPATCHED
                                    </span>
                                  ) : isPartialDispatch ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 uppercase">
                                      PARTIAL
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 uppercase">
                                      IN WAREHOUSE
                                    </span>
                                  )}

                                  {hasShortfall && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                      Shortfall
                                    </span>
                                  )}

                                  {hasShortfill && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                      Shortfill
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* 13. Action */}
                              <td className="p-2.5 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center space-x-1.5">
                                  {isFullyDispatched ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingInwardEntry(inv);
                                        setShowManualInwardModal(true);
                                      }}
                                      className="px-2 py-1 rounded bg-surface hover:bg-surface-secondary text-content-primary border border-divider text-xs font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
                                      title={`View Inward Details for Invoice #${inv.customInvoiceNo} (Dispatched - Locked)`}
                                    >
                                      <Eye className="w-3 h-3 text-content-secondary" />
                                      <span>View</span>
                                    </button>
                                  ) : isPendingInward ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingInwardEntry(inv);
                                        setShowManualInwardModal(true);
                                      }}
                                      className="px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-xs font-semibold flex items-center space-x-1 transition-colors cursor-pointer shadow-2xs"
                                      title={`Receive subsequent pending stock for Invoice #${inv.customInvoiceNo}`}
                                    >
                                      <Plus className="w-3 h-3 text-amber-700" />
                                      <span>Receive Pending</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingInwardEntry(inv);
                                        setShowManualInwardModal(true);
                                      }}
                                      className="px-2 py-1 rounded bg-surface hover:bg-surface-secondary text-brand-primary border border-divider text-xs font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
                                      title={`Edit Inward for Invoice #${inv.customInvoiceNo}`}
                                    >
                                      <Pencil className="w-3 h-3" />
                                      <span>Edit</span>
                                    </button>
                                  )}
                                  {balPlt > 0 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenDispatchForInvoice(inv);
                                      }}
                                      className="px-2.5 py-1 rounded-md bg-brand-primary text-white text-xs font-semibold hover:bg-brand-primary-hover transition-colors cursor-pointer shadow-2xs"
                                      title={`Dispatch remaining ${balPlt} pallets`}
                                    >
                                      Dispatch
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* DROPDOWN SUB-TABLE: Chronological Tracks (Latest First) & Shortfall/Shortfill Details */}
                            {isExpanded && (
                              <tr className="bg-surface-secondary/40 border-b border-divider">
                                <td colSpan={16} className="p-4">
                                  {(() => {
                                    // Generate chronological tracks for this invoice
                                    const tracks: {
                                      id: string;
                                      type: 'INWARD' | 'DISPATCH';
                                      date: string;
                                      timestamp: number;
                                      pallets: number;
                                      batteries: number;
                                      containerNo?: string;
                                      sealNo?: string;
                                      vehicleNo?: string;
                                      shippingBillNo?: string;
                                      remainingBalPlt: number;
                                      remainingBalBat: number;
                                      remarks?: string;
                                      rawRecord?: any;
                                    }[] = [];

                                    const invMovements = allMovementRecords.filter(
                                      (m) => m.customInvoiceNo === inv.customInvoiceNo || m.sourceLedgerId === inv.id
                                    );

                                    invMovements.forEach((m) => {
                                      const isDispatch = m.status === 'DISPATCHED' || m.direction === 'STOCK_OUT';
                                      const dateStr = m.dispatchedDate || m.movementDate || m.receivedDate || formatToDDMMYYYY(m.createdAt);
                                      tracks.push({
                                        id: m.id,
                                        type: isDispatch ? 'DISPATCH' : 'INWARD',
                                        date: dateStr,
                                        timestamp: parseDateStrToTime(dateStr) || new Date(m.createdAt).getTime(),
                                        pallets: isDispatch && (inv.actualStuffedPallets || 0) > 0 && m.pallets > (inv.actualStuffedPallets || 0)
                                          ? (inv.actualStuffedPallets || 0)
                                          : m.pallets,
                                        batteries: isDispatch && (inv.actualStuffedBatteries || 0) > 0 && m.batteries > (inv.actualStuffedBatteries || 0)
                                          ? (inv.actualStuffedBatteries || 0)
                                          : m.batteries,
                                        containerNo: m.containerNo,
                                        sealNo: m.sealNo,
                                        vehicleNo: m.vehicleNo,
                                        shippingBillNo: m.shippingBillNo,
                                        remainingBalPlt: m.remainingBalancePallets,
                                        remainingBalBat: m.remainingBalanceBatteries,
                                        remarks: m.remarks,
                                        rawRecord: m
                                      });
                                    });

                                    // If no dispatch record in movements but invoice has stuffed quantity, add synthesized dispatch
                                    const hasDispatchTrack = tracks.some((t) => t.type === 'DISPATCH');
                                    if (!hasDispatchTrack && (inv.actualStuffedPallets || 0) > 0) {
                                      const dispDate = inv.stuffingDate || inv.portGateInDate || inv.pickupDate || formatToDDMMYYYY(inv.updatedAt || inv.createdAt);
                                      tracks.push({
                                        id: `disp_synth_${inv.id}`,
                                        type: 'DISPATCH',
                                        date: dispDate,
                                        timestamp: parseDateStrToTime(dispDate) || new Date(inv.updatedAt || inv.createdAt).getTime(),
                                        pallets: inv.actualStuffedPallets || 0,
                                        batteries: inv.actualStuffedBatteries || 0,
                                        containerNo: inv.containerNo,
                                        sealNo: inv.sealNo,
                                        vehicleNo: inv.vehicleNo,
                                        shippingBillNo: inv.shippingBillNo,
                                        remainingBalPlt: inv.balancePallets || 0,
                                        remainingBalBat: inv.balanceBatteries || 0,
                                        remarks: `Dispatched container stuffing • SB: ${inv.shippingBillNo || '—'}`,
                                        rawRecord: inv
                                      });
                                    }

                                    // Ensure inward track exists
                                    const hasInwardTrack = tracks.some((t) => t.type === 'INWARD');
                                    if (!hasInwardTrack) {
                                      const inwDate = inv.cartingInDate || inv.truckReportingDate || inv.invoiceDate || formatToDDMMYYYY(inv.createdAt);
                                      tracks.push({
                                        id: `inw_synth_${inv.id}`,
                                        type: 'INWARD',
                                        date: inwDate,
                                        timestamp: parseDateStrToTime(inwDate) || new Date(inv.createdAt).getTime(),
                                        pallets: inv.actualReceivedPallets !== undefined ? inv.actualReceivedPallets : inv.invoicedPallets,
                                        batteries: inv.actualReceivedBatteries !== undefined ? inv.actualReceivedBatteries : inv.invoicedBatteries,
                                        vehicleNo: inv.vehicleNo,
                                        remainingBalPlt: inv.actualReceivedPallets !== undefined ? inv.actualReceivedPallets : inv.invoicedPallets,
                                        remainingBalBat: inv.actualReceivedBatteries !== undefined ? inv.actualReceivedBatteries : inv.invoicedBatteries,
                                        remarks: (inv.shortfallBatteries || 0) > 0 ? 'Inward received with recorded shortfall' : 'Initial Inward Gate-In',
                                        rawRecord: inv
                                      });
                                    }

                                    // Sort latest event first
                                    tracks.sort((a, b) => b.timestamp - a.timestamp);

                                    return (
                                      <div className="space-y-4 bg-surface rounded-xl p-4 border border-divider shadow-inner font-sans">
                                        {/* Header bar */}
                                        <div className="flex items-center justify-between pb-2 border-b border-divider">
                                          <div className="flex items-center space-x-2">
                                            <History className="w-4 h-4 text-brand-primary" />
                                            <h4 className="text-xs font-bold text-content-primary">
                                              Activity Tracks & History for Invoice #{inv.customInvoiceNo}
                                            </h4>
                                            <span className="text-[10px] text-content-muted font-mono">
                                              ({tracks.length} recorded {tracks.length === 1 ? 'event' : 'events'}, Latest First)
                                            </span>
                                          </div>
                                          <div className="text-[11px] text-content-secondary font-mono">
                                            Consignee: <span className="font-bold text-content-primary">{inv.customer}</span>
                                          </div>
                                        </div>

                                        {/* 1. Chronological Tracks Table */}
                                        <div className="overflow-x-auto rounded-lg border border-divider">
                                          <table className="w-full text-xs font-mono border-collapse">
                                            <thead className="bg-surface-secondary border-b border-divider text-[10px] text-content-secondary font-semibold">
                                              <tr>
                                                <th className="p-2 border-r border-divider text-left">Event Type</th>
                                                <th className="p-2 border-r border-divider text-left">Date & Time</th>
                                                <th className="p-2 border-r border-divider text-right">Plts Moved</th>
                                                <th className="p-2 border-r border-divider text-right">Units Moved</th>
                                                <th className="p-2 border-r border-divider text-right text-emerald-700">Floor Balance After</th>
                                                <th className="p-2 border-r border-divider text-left">Container / Vehicle</th>
                                                <th className="p-2 border-r border-divider text-left">Shipping Bill / Ref</th>
                                                <th className="p-2 border-r border-divider text-left">Remarks</th>
                                                <th className="p-2 text-center">Action</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-divider/50">
                                              {tracks.map((t) => (
                                                <tr key={t.id} className="hover:bg-surface-secondary/40 transition-colors">
                                                  <td className="p-2 border-r border-divider whitespace-nowrap">
                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono tracking-wider ${
                                                      t.type === 'DISPATCH'
                                                        ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                                    }`}>
                                                      {t.type === 'DISPATCH' ? '→ DISPATCH' : '+ INWARD GATE-IN'}
                                                    </span>
                                                  </td>
                                                  <td className="p-2 border-r border-divider whitespace-nowrap font-medium text-content-primary">
                                                    {t.date}
                                                  </td>
                                                  <td className="p-2 border-r border-divider text-right font-semibold">
                                                    {t.pallets} Plt
                                                  </td>
                                                  <td className="p-2 border-r border-divider text-right font-semibold">
                                                    {t.batteries.toLocaleString()} u
                                                  </td>
                                                  <td className="p-2 border-r border-divider text-right font-bold text-emerald-700">
                                                    {t.remainingBalPlt} Plt / {t.remainingBalBat.toLocaleString()} u
                                                  </td>
                                                  <td className="p-2 border-r border-divider whitespace-nowrap text-[11px]">
                                                    {t.containerNo ? (
                                                      <span className="font-semibold text-content-primary">Cont: {t.containerNo} {t.sealNo ? `(Seal: ${t.sealNo})` : ''}</span>
                                                    ) : t.vehicleNo ? (
                                                      <span>Truck: {t.vehicleNo}</span>
                                                    ) : (
                                                      <span className="text-content-muted">—</span>
                                                    )}
                                                  </td>
                                                  <td className="p-2 border-r border-divider whitespace-nowrap text-[11px] text-content-secondary">
                                                    {t.shippingBillNo ? `SB: ${t.shippingBillNo}` : '—'}
                                                  </td>
                                                  <td className="p-2 border-r border-divider text-[11px] text-content-muted max-w-[200px] truncate" title={t.remarks}>
                                                    {t.remarks || '—'}
                                                  </td>
                                                  <td className="p-2 text-center whitespace-nowrap">
                                                    {t.type === 'DISPATCH' ? (
                                                      <button
                                                        type="button"
                                                        onClick={() => handleUndoDispatch({
                                                          id: t.rawRecord?.id || inv.id,
                                                          customInvoiceNo: inv.customInvoiceNo,
                                                          receivedPallets: t.pallets,
                                                          receivedUnits: t.batteries,
                                                          ledgerEntry: inv
                                                        })}
                                                        className="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-semibold flex items-center space-x-1 mx-auto transition-colors cursor-pointer"
                                                        title="Undo this dispatch and restore stock to floor"
                                                      >
                                                        <RotateCcw className="w-2.5 h-2.5" />
                                                        <span>Undo</span>
                                                      </button>
                                                    ) : (
                                                      <span className="text-content-muted text-[10px]">—</span>
                                                    )}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>

                                        {/* 2. Shortfall & Shortfill Reconciliation Panel */}
                                        <div className="rounded-lg border border-divider p-3 bg-surface-secondary/20 space-y-2">
                                          <div className="flex items-center space-x-2">
                                            <AlertTriangle className={`w-3.5 h-3.5 ${hasShortfall ? 'text-amber-600' : hasShortfill ? 'text-purple-600' : 'text-emerald-600'}`} />
                                            <span className="text-xs font-bold text-content-primary">Shortfall & Shortfill Reconciliation</span>
                                          </div>

                                          {/* Shortfalls Recorded on this Invoice */}
                                          {inv.shortfalls && inv.shortfalls.length > 0 ? (
                                            <div className="space-y-1.5">
                                              <span className="text-[10px] font-semibold text-content-secondary uppercase tracking-wider block">Shortfall Incidents Recorded:</span>
                                              {inv.shortfalls.map((sf, idx) => {
                                                const isCleared = sf.status === 'CLEARED' || sf.status === 'FULFILLED' || sf.remainingShortfallUnits === 0;
                                                return (
                                                  <div key={sf.id || idx} className="p-2 rounded bg-surface border border-divider text-xs flex flex-wrap items-center justify-between gap-2">
                                                    <div className="flex items-center space-x-2">
                                                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                                        isCleared ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                                                      }`}>
                                                        {isCleared ? 'RESOLVED / FULFILLED' : 'OPEN BACKLOG'}
                                                      </span>
                                                      <span className="font-semibold text-content-primary">
                                                        Pallet #{sf.palletNumber}:
                                                      </span>
                                                      <span className="text-content-secondary">
                                                        Billed {sf.billedUnits} u • Shortfall: <span className="font-bold text-rose-600">-{sf.shortfallUnits} u</span>
                                                        {sf.remainingShortfallUnits > 0 && sf.remainingShortfallUnits !== sf.shortfallUnits && (
                                                          <span> (Remaining: <span className="font-bold text-amber-600">{sf.remainingShortfallUnits} u</span>)</span>
                                                        )}
                                                      </span>
                                                    </div>

                                                    {/* Resolution shipment tracking */}
                                                    {sf.linkedShortFills && sf.linkedShortFills.length > 0 ? (
                                                      <div className="text-[11px] font-medium text-purple-700 flex items-center space-x-1">
                                                        <span>✓ Fulfilled via:</span>
                                                        {sf.linkedShortFills.map((lsf, lIdx) => (
                                                          <span key={lIdx} className="bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                                                            +{lsf.unitsFilled}u from Inward #{lsf.shortFillInvoiceNo} (Plt #{lsf.arrivedPalletNumber || lsf.palletNumber}) on {lsf.filledDate || '—'}
                                                          </span>
                                                        ))}
                                                      </div>
                                                    ) : (
                                                      <span className="text-[10px] text-content-muted italic">Awaiting shortfill resolution stock</span>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          ) : (inv.shortfallBatteries || 0) > 0 ? (
                                            <div className="p-2 rounded bg-surface border border-divider text-xs flex items-center justify-between">
                                              <span className="text-rose-700 font-semibold">Legacy Shortfall: -{inv.shortfallBatteries} units</span>
                                              <span className="text-content-muted text-[11px]">Recorded at carting</span>
                                            </div>
                                          ) : null}

                                          {/* Shortfills Supplied from this Invoice to Prior Shipments */}
                                          {(() => {
                                            const suppliedFills = getSuppliedShortFillsForInvoice(inv, entries);
                                            if (suppliedFills.length === 0) return null;
                                            return (
                                              <div className="space-y-1.5 pt-1">
                                                <span className="text-[10px] font-semibold text-content-secondary uppercase tracking-wider block">
                                                  Stock Diverted for Shortfall Fulfillment:
                                                </span>
                                                {suppliedFills.map((link, lIdx) => (
                                                  <div key={lIdx} className="p-2 rounded bg-purple-50/50 border border-purple-200 text-xs flex items-center justify-between">
                                                    <span className="text-purple-800 font-medium">
                                                      → <span className="font-bold">+{link.unitsFilled} units</span> from this inward were allocated to resolve shortfall on <span className="font-bold">Invoice #{link.priorShortfallInvoiceNo}</span> (Pallet #{link.palletNumber})
                                                      {(link.filledDate || link.date) && (
                                                        <span className="text-purple-600 font-normal ml-1.5 text-[11px]">on {link.filledDate || link.date}</span>
                                                      )}
                                                    </span>
                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${link.dispatched ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                                      {link.dispatched ? 'Dispatched with Target' : 'On Active Floor'}
                                                    </span>
                                                  </div>
                                                ))}
                                              </div>
                                            );
                                          })()}

                                          {/* No Shortfall / Shortfill clean notice */}
                                          {!hasShortfall && !hasShortfill && (
                                            <div className="text-[11px] text-emerald-700 font-medium flex items-center space-x-1.5">
                                              <CheckCircle2 className="w-3.5 h-3.5" />
                                              <span>100% Inward Quantity Matched: No shortfalls or stock diversions recorded for this invoice.</span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })()}
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
          </div>
        )}

        {/* =====================================================================
            SECTION 5: MONTHLY LIVE REPORTS & EXPORTS
            ===================================================================== */}
        {activeSection === 'reports' && (
          <div className="space-y-3 pb-20 font-sans">
            {/* Slim Unified Control Bar */}
            <div className="bg-surface border border-divider rounded-xl p-3 sm:p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
              {/* Left: Fiscal Month & Date Range */}
              <div className="flex flex-wrap items-center gap-3">
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

              {/* Right: Export Button */}
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => exportCFSMasterReportXlsx(filteredEntries, selectedMonth)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer text-xs"
                  title="Export unified Master Report with live Excel formulas and zero row loss"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export Master Report (.xlsx)</span>
                </button>
              </div>
            </div>

            {/* Master Report Table (22 Columns) */}
            <div className="bg-surface border border-divider rounded-xl shadow-xs overflow-hidden">
              <div className="overflow-x-auto max-h-[720px]">
                <table className="w-full text-xs font-mono border-collapse select-text">
                  <thead className="bg-surface-secondary sticky top-0 z-10 border-b border-divider text-left text-[11px] font-semibold text-content-secondary">
                    {/* Row 1: Merged Category Headers */}
                    <tr className="border-b border-divider/60">
                      <th rowSpan={2} className="py-2.5 px-2.5 border-r border-divider whitespace-nowrap align-bottom font-semibold text-content-primary">Customer</th>
                      <th rowSpan={2} className="py-2.5 px-2.5 border-r border-divider whitespace-nowrap align-bottom font-semibold text-content-primary">Custom Invoice No</th>
                      <th colSpan={2} className="py-2 px-2.5 border-r border-divider text-center font-semibold bg-slate-100/80 text-content-primary">As received from EIL-</th>
                      <th colSpan={2} className="py-2 px-2.5 border-r border-divider text-center font-semibold bg-slate-100/80 text-content-primary">Actual Received from</th>
                      <th colSpan={2} className="py-2 px-2.5 border-r border-divider text-center font-semibold bg-rose-50 text-rose-800">Short fall</th>
                      <th rowSpan={2} className="py-2.5 px-2.5 border-r border-divider whitespace-nowrap align-bottom font-semibold text-content-primary">Carting in Date</th>
                      <th colSpan={2} className="py-2 px-2.5 border-r border-divider text-center font-semibold bg-slate-100/80 text-content-primary">Actual Stuffed Qty</th>
                      <th colSpan={2} className="py-2 px-2.5 border-r border-divider text-center font-semibold bg-emerald-50 text-emerald-800">Balance Qty</th>
                      <th rowSpan={2} className="py-2.5 px-2.5 border-r border-divider whitespace-nowrap align-bottom font-semibold text-content-primary">Shipping Bill No</th>
                      <th rowSpan={2} className="py-2.5 px-2.5 border-r border-divider whitespace-nowrap align-bottom font-semibold text-content-primary">Date</th>
                      <th rowSpan={2} className="py-2.5 px-2.5 border-r border-divider whitespace-nowrap align-bottom font-semibold text-content-primary">Container No</th>
                      <th rowSpan={2} className="py-2.5 px-2.5 border-r border-divider whitespace-nowrap align-bottom font-semibold text-content-primary">Seal No</th>
                      <th rowSpan={2} className="py-2.5 px-2.5 border-r border-divider whitespace-nowrap align-bottom font-semibold text-content-primary">Stuffing Date</th>
                      <th rowSpan={2} className="py-2.5 px-2.5 border-r border-divider whitespace-nowrap align-bottom font-semibold text-content-primary">Pick-up Date</th>
                      <th rowSpan={2} className="py-2.5 px-2.5 border-r border-divider whitespace-nowrap align-bottom font-semibold text-content-primary">Gate-in Date</th>
                      <th rowSpan={2} className="py-2.5 px-2.5 border-r border-divider text-center whitespace-nowrap align-bottom font-semibold text-content-primary">No of Days in CFS</th>
                      <th rowSpan={2} className="py-2.5 px-2.5 whitespace-nowrap align-bottom font-semibold text-content-primary">Remark</th>
                    </tr>
                    {/* Row 2: Sub-column Headers */}
                    <tr className="border-b border-divider">
                      <th className="py-1.5 px-2.5 border-r border-divider text-right whitespace-nowrap font-medium text-[10px]">No of Pallets</th>
                      <th className="py-1.5 px-2.5 border-r border-divider text-right whitespace-nowrap font-medium text-[10px]">No of Batteries</th>
                      <th className="py-1.5 px-2.5 border-r border-divider text-right whitespace-nowrap font-medium text-[10px]">No of Pallets</th>
                      <th className="py-1.5 px-2.5 border-r border-divider text-right whitespace-nowrap font-medium text-[10px]">No of Batteries</th>
                      <th className="py-1.5 px-2.5 border-r border-divider text-right whitespace-nowrap font-medium text-[10px] text-rose-700">No of Pallets</th>
                      <th className="py-1.5 px-2.5 border-r border-divider text-right whitespace-nowrap font-medium text-[10px] text-rose-700">No of Batteries</th>
                      <th className="py-1.5 px-2.5 border-r border-divider text-right whitespace-nowrap font-medium text-[10px]">No of Pallets</th>
                      <th className="py-1.5 px-2.5 border-r border-divider text-right whitespace-nowrap font-medium text-[10px]">No of Batteries</th>
                      <th className="py-1.5 px-2.5 border-r border-divider text-right whitespace-nowrap font-medium text-[10px] text-emerald-700">No of Pallets</th>
                      <th className="py-1.5 px-2.5 border-r border-divider text-right whitespace-nowrap font-medium text-[10px] text-emerald-700">No of Batteries</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider/60 tabular-nums">
                    {filteredEntries.length === 0 ? (
                      <tr>
                        <td colSpan={22} className="p-12 text-center text-content-muted">
                          <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p>No invoices match the selected monthly report criteria.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredEntries.map((e) => (
                        <tr key={e.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2 px-2.5 border-r border-divider whitespace-nowrap font-sans font-medium text-content-primary">{e.customer}</td>
                          <td className="py-2 px-2.5 border-r border-divider whitespace-nowrap font-bold text-brand-primary">#{e.customInvoiceNo}</td>
                          <td className="py-2 px-2.5 border-r border-divider text-right">{e.invoicedPallets}</td>
                          <td className="py-2 px-2.5 border-r border-divider text-right">{e.invoicedBatteries.toLocaleString()}</td>
                          <td className="py-2 px-2.5 border-r border-divider text-right font-semibold text-emerald-800">{e.actualReceivedPallets || e.invoicedPallets}</td>
                          <td className="py-2 px-2.5 border-r border-divider text-right font-semibold text-emerald-800">{(e.actualReceivedBatteries || e.invoicedBatteries).toLocaleString()}</td>
                          <td className="py-2 px-2.5 border-r border-divider text-right text-rose-700">{e.shortfallPallets || 0}</td>
                          <td className="py-2 px-2.5 border-r border-divider text-right text-rose-700">{e.shortfallBatteries || 0}</td>
                          <td className="py-2 px-2.5 border-r border-divider whitespace-nowrap">{e.cartingInDate || e.invoiceDate || '—'}</td>
                          <td className="py-2 px-2.5 border-r border-divider text-right">{e.actualStuffedPallets || 0}</td>
                          <td className="py-2 px-2.5 border-r border-divider text-right">{(e.actualStuffedBatteries || 0).toLocaleString()}</td>
                          <td className="py-2 px-2.5 border-r border-divider text-right font-bold text-emerald-700">{e.balancePallets || 0}</td>
                          <td className="py-2 px-2.5 border-r border-divider text-right font-medium text-content-primary">{(e.balanceBatteries || 0).toLocaleString()}</td>
                          <td className="py-2 px-2.5 border-r border-divider whitespace-nowrap">{e.shippingBillNo || '—'}</td>
                          <td className="py-2 px-2.5 border-r border-divider whitespace-nowrap">{e.shippingBillDate || '—'}</td>
                          <td className="py-2 px-2.5 border-r border-divider whitespace-nowrap font-medium text-content-primary">{e.containerNo || '—'}</td>
                          <td className="py-2 px-2.5 border-r border-divider whitespace-nowrap">{e.sealNo || '—'}</td>
                          <td className="py-2 px-2.5 border-r border-divider whitespace-nowrap">{e.stuffingDate || '—'}</td>
                          <td className="py-2 px-2.5 border-r border-divider whitespace-nowrap">{e.pickupDate || '—'}</td>
                          <td className="py-2 px-2.5 border-r border-divider whitespace-nowrap">{e.portGateInDate || '—'}</td>
                          <td className="py-2 px-2.5 border-r border-divider text-center">{e.daysInCFS || 0}</td>
                          <td className="py-2 px-2.5 whitespace-nowrap text-content-secondary">{e.remarks || '—'}</td>
                        </tr>
                      ))
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
                <DateInput
                  value={dispatchDetails.shippingBillDate}
                  onChange={(val) => setDispatchDetails({ ...dispatchDetails, shippingBillDate: val })}
                  placeholder="DD/MM/YYYY"
                />
              </div>

              <div>
                <label className="block text-content-secondary mb-1">Stuffing Date</label>
                <DateInput
                  value={dispatchDetails.stuffingDate}
                  onChange={(val) => setDispatchDetails({ ...dispatchDetails, stuffingDate: val })}
                  placeholder="DD/MM/YYYY"
                />
              </div>

              <div>
                <label className="block text-content-secondary mb-1">Port Gate-In Date</label>
                <DateInput
                  value={dispatchDetails.portGateInDate}
                  onChange={(val) => setDispatchDetails({ ...dispatchDetails, portGateInDate: val })}
                  placeholder="DD/MM/YYYY"
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
                          <th className="py-2.5 px-3 border-r border-divider">Status / Vehicle</th>
                          <th className="py-2.5 px-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-divider font-mono">
                        {kpis.varianceEntries.map((e) => {
                          const sfStats = getEntryShortfallStats(e);
                          const rawPltDiff = (e.actualReceivedPallets || 0) - (e.invoicedPallets || 0);
                          const rawUnitDiff = (e.actualReceivedBatteries || 0) - (e.invoicedBatteries || 0);
                          const pltDiff = rawPltDiff !== 0 ? rawPltDiff : (sfStats.shortPlt > 0 ? -sfStats.shortPlt : 0);
                          const unitDiff = rawUnitDiff !== 0 ? rawUnitDiff : (sfStats.shortBat > 0 ? -sfStats.shortBat : 0);
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
                              <td className="py-2.5 px-3 border-r border-divider font-sans text-content-secondary text-[11px]">
                                {e.vehicleNo ? (
                                  <span>Veh: <strong className="font-mono text-content-primary">{e.vehicleNo}</strong></span>
                                ) : (
                                  <span className="italic text-content-muted">Pending Gate-In</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center font-sans">
                                <button
                                  type="button"
                                  onClick={() => handleViewInvoiceInInventory(e.customInvoiceNo)}
                                  className="px-2.5 py-1 text-[11px] font-semibold text-brand-primary hover:text-white hover:bg-brand-primary rounded border border-brand-primary/40 transition-colors cursor-pointer"
                                  title={`View invoice #${e.customInvoiceNo} with shortfall in inventory`}
                                >
                                  View
                                </button>
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

      {/* Shortfills Available in Warehouse Modal */}
      {showShortfillsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in font-sans">
          <div className="bg-surface border border-divider rounded-2xl max-w-5xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-divider flex items-center justify-between bg-surface-secondary/40">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-400">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-content-primary flex items-center space-x-2">
                    <span>Shortfills Available in Warehouse</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-100 text-purple-800 border border-purple-200">
                      {shortfillAvailability.fullyAvailableCount} Fully Covered
                    </span>
                  </h3>
                  <p className="text-xs text-content-secondary mt-0.5">
                    Inbound shortfill stock received and currently in floor warehouse inventory available to fulfill customer shortfalls.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShortfillsModal(false)}
                className="p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-secondary transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Summary Pill Bar */}
            <div className="px-4 py-2.5 bg-surface border-b border-divider flex flex-wrap items-center gap-2 text-xs font-mono">
              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-900 border border-purple-200 font-medium">
                <span>Shortfalls Fully Available:</span>
                <strong className="font-bold">{shortfillAvailability.fullyAvailableCount}</strong>
              </div>
              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200 font-medium">
                <span>Floor Shortfill Units Available:</span>
                <strong className="font-bold">{shortfillAvailability.totalAvailableUnits.toLocaleString()} Units</strong>
              </div>
              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-surface-secondary text-content-secondary border border-divider font-medium">
                <span>Inward Receipts:</span>
                <strong className="font-bold">{shortfillAvailability.items.length}</strong>
              </div>
            </div>

            {/* Content Table / Empty State */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
              {shortfillAvailability.items.length === 0 ? (
                <div className="p-12 text-center bg-surface-secondary/30 border border-dashed border-divider rounded-xl">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
                  <p className="text-xs font-semibold text-content-primary">No Shortfill Floor Stock Currently in Warehouse</p>
                  <p className="text-xs text-content-muted mt-1 max-w-md mx-auto font-sans">
                    When a factory shortfill is recorded through the Inward Entry modal, the received units will be tracked here in real-time as available floor stock.
                  </p>
                </div>
              ) : (
                <div className="border border-divider rounded-xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse select-text">
                      <thead className="bg-surface-secondary/80 border-b border-divider font-semibold text-content-secondary uppercase text-[10px] tracking-wider font-mono">
                        <tr>
                          <th className="py-2.5 px-3 border-r border-divider">Target Shortfall Invoice</th>
                          <th className="py-2.5 px-3 border-r border-divider">Customer</th>
                          <th className="py-2.5 px-3 border-r border-divider text-center">Shortfall Pallet</th>
                          <th className="py-2.5 px-3 border-r border-divider">Shortfill Inward</th>
                          <th className="py-2.5 px-3 border-r border-divider text-center">Floor Pallet</th>
                          <th className="py-2.5 px-3 border-r border-divider text-right font-bold">Available in Warehouse</th>
                          <th className="py-2.5 px-3 border-r border-divider text-center">Coverage</th>
                          <th className="py-2.5 px-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-divider font-mono">
                        {shortfillAvailability.items.map((it) => (
                          <tr key={it.id} className="hover:bg-surface-secondary/40 transition-colors">
                            <td className="py-2.5 px-3 border-r border-divider font-bold text-brand-primary">
                              #{it.targetInvoiceNo}
                              <div className="text-[10px] text-content-muted font-normal">
                                Short: {it.shortfallUnits} Units
                              </div>
                            </td>
                            <td className="py-2.5 px-3 border-r border-divider font-sans font-medium text-content-primary max-w-[160px] truncate" title={it.targetCustomer}>
                              {it.targetCustomer || '—'}
                            </td>
                            <td className="py-2.5 px-3 border-r border-divider text-center font-bold text-rose-600">
                              PLT #{it.targetPalletNumber}
                            </td>
                            <td className="py-2.5 px-3 border-r border-divider">
                              <span className="font-bold text-purple-700">#{it.shortFillInvoiceNo}</span>
                              <div className="text-[10px] text-content-muted font-normal">{it.date || '—'}</div>
                            </td>
                            <td className="py-2.5 px-3 border-r border-divider text-center font-bold text-content-primary">
                              PLT #{it.arrivedPalletNumber}
                            </td>
                            <td className="py-2.5 px-3 border-r border-divider text-right font-bold text-emerald-700">
                              {it.unitsAvailable} Units
                            </td>
                            <td className="py-2.5 px-3 border-r border-divider text-center">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                it.isFullyAvailable
                                  ? 'bg-purple-100 text-purple-800 border border-purple-300'
                                  : 'bg-blue-50 text-blue-800 border border-blue-200'
                              }`}>
                                {it.isFullyAvailable ? '100% Available' : 'Partially Available'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center font-sans">
                              <button
                                type="button"
                                onClick={() => handleViewInvoiceInInventory(it.targetInvoiceNo)}
                                className="px-2.5 py-1 text-[11px] font-semibold text-brand-primary hover:text-white hover:bg-brand-primary rounded border border-brand-primary/40 transition-colors cursor-pointer"
                                title={`Find invoice #${it.targetInvoiceNo} in inventory`}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 bg-surface-secondary/40 border-t border-divider flex items-center justify-between">
              <span className="text-xs text-content-secondary font-mono">
                Total Shortfills in Floor Stock: <strong className="text-content-primary font-bold">{shortfillAvailability.totalAvailableUnits} Units</strong>
              </span>
              <button
                type="button"
                onClick={() => setShowShortfillsModal(false)}
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

            <p className="text-xs text-content-secondary leading-relaxed whitespace-pre-line">
              {itemToDelete.description}
            </p>

            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <span>
                {itemToDelete.type === 'invoice'
                  ? 'Invoices are stored in the Recycle Bin and can be restored at any time. Any fulfilled shortfalls are automatically rolled back.'
                  : 'This action will permanently delete these items from warehouse inventory and cannot be undone.'}
              </span>
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

      {/* Recycle Bin (Soft Delete & Recovery) Modal */}
      {showTrashBinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-surface rounded-2xl shadow-2xl border border-divider max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-divider flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-content-primary">
                    Recycle Bin ({trashBinItems.length})
                  </h3>
                  <p className="text-[11px] text-content-secondary">
                    Recover deleted invoices. Restoring a shortfill automatically re-applies shortfall fulfillment.
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {trashBinItems.length > 0 && (
                  <button
                    onClick={() => {
                      if (window.confirm('Permanently empty all items in the Recycle Bin?')) {
                        emptyCFSTrashBin();
                        setTrashBinItems([]);
                        showToast('Recycle Bin emptied.');
                      }
                    }}
                    className="px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded border border-rose-200 transition-colors cursor-pointer"
                  >
                    Empty Bin
                  </button>
                )}
                <button
                  onClick={() => setShowTrashBinModal(false)}
                  className="p-1.5 text-content-muted hover:text-content-primary rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto space-y-2 flex-1">
              {trashBinItems.length === 0 ? (
                <div className="py-12 text-center text-content-muted text-xs">
                  The Recycle Bin is empty.
                </div>
              ) : (
                trashBinItems.map((item) => {
                  const entry = item.entry;
                  const suppliedFills = getSuppliedShortFillsForInvoice(entry, entries);
                  const hasShortFill = suppliedFills.length > 0;
                  const hasShortfall = (entry.shortfalls || []).length > 0;

                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl border border-divider hover:border-slate-300 bg-surface flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-brand-primary">
                            #{entry.customInvoiceNo}
                          </span>
                          {hasShortFill && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                              Shortfill Inward
                            </span>
                          )}
                          {hasShortfall && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              Has Shortfall
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-content-secondary">
                          <span className="font-medium text-content-primary">{entry.customer}</span> •{' '}
                          {entry.invoicedPallets} Plt ({entry.invoicedBatteries.toLocaleString()} Units) • Deleted on{' '}
                          {new Date(item.deletedAt).toLocaleString()}
                        </div>
                        {hasShortFill && (
                          <div className="text-[10px] text-purple-700 font-mono">
                            Filled: {suppliedFills.map((l) => `${l.unitsFilled} Units on #${l.priorShortfallInvoiceNo}`).join(', ')}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          onClick={() => {
                            const restored = restoreDeletedCFSEntry(item.id);
                            if (restored) {
                              setEntries(getCFSLedgerEntries());
                              setTrashBinItems(getCFSTrashBinEntries());
                              showToast(`Invoice #${restored.customInvoiceNo} restored successfully!`);
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors cursor-pointer flex items-center space-x-1"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restore</span>
                        </button>
                        <button
                          onClick={() => {
                            permanentlyDeleteCFSEntry(item.id);
                            setTrashBinItems(getCFSTrashBinEntries());
                            showToast('Permanently deleted from Recycle Bin.');
                          }}
                          className="p-1.5 text-content-muted hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete permanently"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
      {/* Material Inward Incomplete / Dispatch & DG Interception Modal */}
      {pendingInwardActionPrompt && (() => {
        const pEntry = pendingInwardActionPrompt.entry;
        const actionType = pendingInwardActionPrompt.actionType;
        const pendBat = (pEntry.pendingInwardBatteries !== undefined)
          ? pEntry.pendingInwardBatteries
          : (pEntry.pallets?.reduce((sum, p) => sum + (p.pendingUnits || 0), 0) || 0);
        const pendPlt = (pEntry.pendingInwardPallets !== undefined)
          ? pEntry.pendingInwardPallets
          : (pEntry.pallets?.filter((p) => (p.pendingUnits || 0) > 0 || p.status === 'PENDING_GATE_IN').length || 0);

        const isDgBl = actionType === 'DG_BL';
        const isDispatchModal = actionType === 'DISPATCH_MODAL';
        const isDispatchTool = actionType === 'DISPATCH_TOOL';

        const modalTitle = isDgBl
          ? 'Material Inward Incomplete'
          : 'Material Inward Incomplete — Carting In Progress';

        const modalSubtitle = `Invoice #${pEntry.customInvoiceNo} has ${pendBat} pending units`;

        return (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-surface border border-divider rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
              <div className="flex items-center space-x-3 pb-3 border-b border-divider">
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-300">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-content-primary">{modalTitle}</h3>
                  <p className="text-xs text-content-secondary font-mono">{modalSubtitle}</p>
                </div>
              </div>

              <div className="space-y-2.5 text-xs text-content-secondary leading-relaxed">
                <p>
                  Invoice <strong className="text-brand-primary">#{pEntry.customInvoiceNo}</strong> has{' '}
                  <strong className="text-amber-700 font-mono font-bold">{pendBat} units</strong> ({pendPlt} pallets) that have not yet arrived in the warehouse.
                </p>

                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-1">
                  <div className="font-semibold flex items-center space-x-1.5">
                    <span>⚠️ Operational &amp; Compliance Requirement:</span>
                  </div>
                  <p className="text-[11px] leading-normal">
                    {isDgBl
                      ? 'Container DG & BL documents can only be generated for stock that is fully accounted for. Unreceived goods cannot be dispatched unless officially classified as Shortfall.'
                      : 'The Dispatch Tool cannot load unreceived inward stock. To proceed with dispatching only the arrived cargo, unreceived units must be officially converted to Shortfall - Factory Pending. Otherwise, access to the dispatch tool is disabled until remaining material arrives.'}
                  </p>
                </div>

                <p>
                  Would you like to record these <strong className="font-mono">{pendBat} pending units</strong> as{' '}
                  <strong className="text-content-primary">Shortfall - Factory Pending</strong> in the reconciliation logs and proceed with{' '}
                  {isDgBl ? 'DG & BL generation' : isDispatchModal ? 'container dispatch' : 'Dispatch Tool loading'}?
                </p>
              </div>

              <div className="pt-3 border-t border-divider flex flex-col sm:flex-row items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingInwardActionPrompt(null)}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg border border-divider hover:bg-surface-secondary text-content-secondary text-xs font-semibold transition-colors cursor-pointer"
                >
                  Wait for Inward
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const updated = convertPendingInwardToShortfall(pEntry.id, 'Shortfall - Factory Pending');
                    if (updated) {
                      if (isDgBl) {
                        markLedgerDocumentCreated([updated.id], 'DG');
                        markLedgerDocumentCreated([updated.id], 'BL');
                        reloadEntries();
                        const readyPallets = (updated.pallets || []).filter((p) => p.status === 'IN_WAREHOUSE' && p.receivedBatteries > 0);
                        const shipment = buildShipmentFromStockPallets(readyPallets, updated.customer, updated.pod, updated.exporterShipper);
                        onLoadShipmentIntoWorkspace(shipment);
                        onNavigateToWorkspace();
                        showToast(`Recorded ${pendBat} units as Shortfall - Factory Pending. DG Manifest & BL ready!`);
                      } else if (isDispatchTool) {
                        reloadEntries();
                        const readyPallets = (updated.pallets || []).filter((p) => p.status === 'IN_WAREHOUSE' && p.receivedBatteries > 0);
                        const promptPallets = pendingInwardActionPrompt.pallets;
                        const targetPallets = promptPallets.length > 0
                          ? readyPallets.filter((p) => promptPallets.some((sp) => sp.id === p.id || sp.palletNumber === p.palletNumber))
                          : readyPallets;
                        const palletsToLoad = targetPallets.length > 0 ? targetPallets : readyPallets;
                        if (palletsToLoad.length === 0) {
                          showToast('All remaining units converted to Shortfall. No floor pallets available to dispatch.');
                        } else {
                          const shipment = buildShipmentFromStockPallets(palletsToLoad, updated.customer, updated.pod, updated.exporterShipper);
                          onLoadShipmentIntoWorkspace(shipment);
                          onNavigateToWorkspace();
                          showToast(`Recorded ${pendBat} units as Shortfall. Loaded ${palletsToLoad.length} ready pallets into Dispatch Tool.`);
                        }
                      } else if (isDispatchModal) {
                        reloadEntries();
                        showToast(`Recorded ${pendBat} units as Shortfall - Factory Pending.`);
                        handleOpenDispatchForInvoice(updated);
                      }
                    }
                    setPendingInwardActionPrompt(null);
                  }}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  Add to Shortfall &amp; Proceed
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showManualInwardModal && (
        <ManualInwardModal
          isOpen={showManualInwardModal}
          onClose={() => {
            setShowManualInwardModal(false);
            setEditingInwardEntry(null);
            setShortfallTargetInvoiceNo(undefined);
          }}
          editingEntry={editingInwardEntry}
          initialShortfallInvoiceNo={shortfallTargetInvoiceNo}
          onSuccess={(newEntry) => {
            reloadEntries();
            showToast(
              editingInwardEntry
                ? `Inward updated: #${newEntry.customInvoiceNo} (${newEntry.actualReceivedPallets} Plts, ${newEntry.actualReceivedBatteries} Units)`
                : `Inward recorded: #${newEntry.customInvoiceNo} (${newEntry.actualReceivedPallets} Plts, ${newEntry.actualReceivedBatteries} Units)`
            );
            setEditingInwardEntry(null);
            setShortfallTargetInvoiceNo(undefined);
          }}
        />
      )}
    </div>
  );
}
