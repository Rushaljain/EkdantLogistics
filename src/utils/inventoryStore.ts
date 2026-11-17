// Ekdant Logistics - CHA Warehouse Inventory, Carting Gate-In & Monthly Stock Ledger Engine
// 1:1 Alignment with Client's CFS Stock Report (22 Columns) & CFS Carting Report (17 Columns)

import * as XLSX from 'xlsx';
import type {
  CFSLedgerEntry,
  CustomerStockAlert,
  CustomerStockSummary,
  ExtractedShipmentJSON,
  InventoryMovementRecord,
  PalletItem,
  PalletStockUnit
} from '../types/index.ts';
import { createEmptyShipmentJSON } from '../types/index.ts';
import { autoAllocate20GPContainers } from './manifestKeywordReference.ts';

export const CFS_LEDGER_STORAGE_KEY = 'ekdant_cha_cfs_ledger_v1';
export const CFS_MOVEMENT_LOGS_STORAGE_KEY = 'ekdant_cha_movement_logs_v1';

// Month names list (Indian financial year cycle APR to MAR)
export const CFS_MONTHS = [
  'ALL',
  'APR',
  'MAY',
  'JUNE',
  'JULY',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
  'JAN',
  'FEB',
  'MAR'
] as const;

export type CFSMonth = (typeof CFS_MONTHS)[number];

/**
 * Returns formatted date string DD-MM-YYYY or empty string
 */
export function formatToDDMMYYYY(dateInput?: string | Date | number | null): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    // If already string like "26.10.2026" or "2026-10-26"
    return String(dateInput).trim();
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Derives financial year month string (e.g. 'OCT') from a date
 */
export function getMonthFromDate(dateInput?: string | Date | null): string {
  if (!dateInput) {
    const now = new Date();
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUNE', 'JULY', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return months[now.getMonth()];
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    const s = String(dateInput).toUpperCase();
    for (const m of CFS_MONTHS) {
      if (m !== 'ALL' && s.includes(m)) return m;
    }
    return 'OCT';
  }
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUNE', 'JULY', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return months[d.getMonth()];
}

/**
 * Safe day difference calculation avoiding negative serial-date bugs
 */
export function safeDiffDays(startDateStr?: string, endDateStr?: string): number {
  if (!startDateStr || !startDateStr.trim()) return 0;
  const start = new Date(startDateStr);
  if (isNaN(start.getTime())) return 0;

  const end = endDateStr && endDateStr.trim() ? new Date(endDateStr) : new Date();
  if (isNaN(end.getTime())) return 0;

  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) return 0;
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Automatically calculates derived columns:
 * - shortfallPallets = Math.max(0, invoicedPallets - actualReceivedPallets)
 * - shortfallBatteries = Math.max(0, invoicedBatteries - actualReceivedBatteries)
 * - balancePallets = Math.max(0, actualReceivedPallets - actualStuffedPallets)
 * - balanceBatteries = Math.max(0, actualReceivedBatteries - actualStuffedBatteries)
 * - daysInCFS (safe non-negative day difference)
 * - remarks
 */
export function recomputeCFSDerivedFields(entry: CFSLedgerEntry): CFSLedgerEntry {
  const invPallets = Number(entry.invoicedPallets) || 0;
  const invBatteries = Number(entry.invoicedBatteries) || 0;
  const recPallets = Number(entry.actualReceivedPallets) || 0;
  const recBatteries = Number(entry.actualReceivedBatteries) || 0;
  const stfPallets = Number(entry.actualStuffedPallets) || 0;
  const stfBatteries = Number(entry.actualStuffedBatteries) || 0;

  const shortfallPallets = Math.max(0, invPallets - recPallets);
  const shortfallBatteries = Math.max(0, invBatteries - recBatteries);
  const balancePallets = Math.max(0, recPallets - stfPallets);
  const balanceBatteries = Math.max(0, recBatteries - stfBatteries);

  const daysInCFS = safeDiffDays(entry.cartingInDate, entry.portGateInDate);

  let remarks = entry.remarks || '';
  if (!remarks || remarks === 'DONE' || remarks === 'PARTIAL / BALANCE IN CFS' || remarks === 'FACTORY SHORTFALL' || remarks === 'IN CFS - READY' || remarks === 'PENDING GATE-IN') {
    if (balancePallets === 0 && shortfallPallets === 0 && stfPallets > 0) {
      remarks = 'DONE';
    } else if (balancePallets > 0 && stfPallets > 0) {
      remarks = 'PARTIAL / BALANCE IN CFS';
    } else if (shortfallPallets > 0 || shortfallBatteries > 0) {
      remarks = 'FACTORY SHORTFALL';
    } else if (balancePallets > 0 && stfPallets === 0) {
      remarks = 'IN CFS - READY';
    } else {
      remarks = 'PENDING GATE-IN';
    }
  }

  return {
    ...entry,
    invoicedPallets: invPallets,
    invoicedBatteries: invBatteries,
    actualReceivedPallets: recPallets,
    actualReceivedBatteries: recBatteries,
    shortfallPallets,
    shortfallBatteries,
    actualStuffedPallets: stfPallets,
    actualStuffedBatteries: stfBatteries,
    balancePallets,
    balanceBatteries,
    daysInCFS,
    remarks
  };
}

/**
 * Reads all CFS Ledger entries from localStorage
 */
export function getCFSLedgerEntries(): CFSLedgerEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CFS_LEDGER_STORAGE_KEY);
    if (!raw) return [];
    const parsed: CFSLedgerEntry[] = JSON.parse(raw);
    return parsed.map((e) => recomputeCFSDerivedFields(e));
  } catch (err) {
    console.warn('[CFSLedger] Failed to read from localStorage:', err);
    return [];
  }
}

/**
 * Persists all CFS Ledger entries to localStorage
 */
export function saveCFSLedgerEntries(entries: CFSLedgerEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    const cleaned = entries.map((e) => recomputeCFSDerivedFields(e));
    window.localStorage.setItem(CFS_LEDGER_STORAGE_KEY, JSON.stringify(cleaned));
  } catch (err) {
    console.warn('[CFSLedger] Failed to save to localStorage:', err);
  }
}

/**
 * Adds or updates a single entry in the ledger
 */
export function addOrUpdateCFSEntry(entry: CFSLedgerEntry): CFSLedgerEntry {
  const existing = getCFSLedgerEntries();
  const recomputed = recomputeCFSDerivedFields(entry);
  const index = existing.findIndex((e) => e.id === recomputed.id || (e.customInvoiceNo && e.customInvoiceNo.trim() === recomputed.customInvoiceNo.trim()));

  let updatedList: CFSLedgerEntry[];
  if (index >= 0) {
    updatedList = [...existing];
    updatedList[index] = { ...existing[index], ...recomputed };
  } else {
    updatedList = [recomputed, ...existing];
  }
  saveCFSLedgerEntries(updatedList);
  return recomputed;
}

/**
 * Deletes an entry by ID
 */
export function deleteCFSEntry(id: string): void {
  const existing = getCFSLedgerEntries();
  const filtered = existing.filter((e) => e.id !== id);
  saveCFSLedgerEntries(filtered);
}

/**
 * Auto-populates CFS Ledger entries from an extracted shipment JSON (Zero Manual Entry).
 * Splits multi-invoice shipments into invoice-level ledger rows while preserving pallet units.
 */
export function ingestShipmentToLedger(shipment: ExtractedShipmentJSON): CFSLedgerEntry[] {
  if (!shipment) return [];

  const customer = (shipment.consigneeName || 'Consignee').split('\n')[0].trim();
  const exporter = (shipment.shipperName || 'Shipper').split('\n')[0].trim();
  const pod = shipment.portOfDischarge || shipment.placeOfDelivery || '';
  const now = new Date();
  const todayFormatted = formatToDDMMYYYY(now);
  const currentMonth = getMonthFromDate(now);

  const pallets = shipment.pallets || [];

  // Group pallets by invoiceNumber if available, or bundle all under primary invoice
  const invoiceGroups = new Map<string, PalletItem[]>();

  if (pallets.length > 0) {
    pallets.forEach((p) => {
      const inv = p.invoiceNumber?.trim() || shipment.invoiceNumbers?.[0]?.trim() || 'INVOICE-1';
      if (!invoiceGroups.has(inv)) {
        invoiceGroups.set(inv, []);
      }
      invoiceGroups.get(inv)!.push(p);
    });
  } else if (shipment.invoiceNumbers && shipment.invoiceNumbers.length > 0) {
    shipment.invoiceNumbers.forEach((inv) => {
      invoiceGroups.set(inv.trim(), []);
    });
  } else {
    invoiceGroups.set(shipment.invoiceNumbers?.[0]?.trim() || 'INVOICE-1', []);
  }

  const existingEntries = getCFSLedgerEntries();
  const newlyCreated: CFSLedgerEntry[] = [];

  invoiceGroups.forEach((groupPallets, invoiceNo) => {
    const existing = existingEntries.find((e) => e.customInvoiceNo.trim().toUpperCase() === invoiceNo.trim().toUpperCase());

    const invoicedPallets = groupPallets.length > 0 ? groupPallets.length : (shipment.totalPallets || 1);
    const invoicedBatteries = groupPallets.length > 0
      ? groupPallets.reduce((sum, p) => sum + (p.boxCount || 0), 0)
      : (shipment.totalBoxes || 0);
    const invoicedGrossKg = groupPallets.length > 0
      ? groupPallets.reduce((sum, p) => sum + (p.grossWeightKg || 0), 0)
      : (shipment.grossWeightKg || 0);

    const palletUnits: PalletStockUnit[] = groupPallets.map((p, idx) => ({
      id: `plt-${invoiceNo}-${p.palletNumber || idx + 1}-${Date.now()}`,
      palletNumber: p.palletNumber || idx + 1,
      model: p.modelCode || 'STANDARD',
      brand: p.brand || shipment.brandName || '',
      invoicedBatteries: p.boxCount || 0,
      receivedBatteries: p.boxCount || 0, // Defaults to 100% received on upload
      netWeightKg: p.netWeightKg || 0,
      grossWeightKg: p.grossWeightKg || 0,
      status: 'IN_WAREHOUSE' as const,
      invoiceNumber: invoiceNo
    }));

    if (existing) {
      // Idempotent re-upload protection: preserve confirmed physical gate-in, truck, and dispatch progress
      const preservedPallets = palletUnits.map((newUnit) => {
        const found = (existing.pallets || []).find(
          (ep) => String(ep.palletNumber).trim() === String(newUnit.palletNumber).trim()
        );
        if (found) {
          return {
            ...newUnit,
            receivedBatteries: found.receivedBatteries !== undefined ? found.receivedBatteries : newUnit.receivedBatteries,
            status: found.status || newUnit.status,
            containerNo: found.containerNo || newUnit.containerNo,
            stuffedDate: found.stuffedDate || newUnit.stuffedDate
          };
        }
        return newUnit;
      });

      const merged: CFSLedgerEntry = recomputeCFSDerivedFields({
        ...existing,
        customer: existing.customer || customer,
        exporterShipper: existing.exporterShipper || exporter,
        pod: existing.pod || pod,
        invoicedPallets: existing.invoicedPallets || invoicedPallets,
        invoicedBatteries: existing.invoicedBatteries || invoicedBatteries,
        invoicedGrossWeightKg: existing.invoicedGrossWeightKg || invoicedGrossKg,
        actualReceivedPallets: existing.actualReceivedPallets !== undefined ? existing.actualReceivedPallets : invoicedPallets,
        actualReceivedBatteries: existing.actualReceivedBatteries !== undefined ? existing.actualReceivedBatteries : invoicedBatteries,
        actualStuffedPallets: existing.actualStuffedPallets || 0,
        actualStuffedBatteries: existing.actualStuffedBatteries || 0,
        cartingInDate: existing.cartingInDate || todayFormatted,
        vehicleNo: existing.vehicleNo || '',
        lastPltRecdDate: existing.lastPltRecdDate || todayFormatted,
        secondVehicleDate: existing.secondVehicleDate || '',
        secondVehicleNo: existing.secondVehicleNo || '',
        shippingBillNo: existing.shippingBillNo || shipment.shippingBillNumbers || '',
        shippingBillDate: existing.shippingBillDate || '',
        containerNo: existing.containerNo || shipment.containerNumber || '',
        sealNo: existing.sealNo || shipment.sealNumber || '',
        stuffingDate: existing.stuffingDate || '',
        pickupDate: existing.pickupDate || '',
        portGateInDate: existing.portGateInDate || '',
        pallets: preservedPallets.length > 0 ? preservedPallets : (existing.pallets || [])
      });
      newlyCreated.push(merged);
    } else {
      const entry: CFSLedgerEntry = recomputeCFSDerivedFields({
        id: `cfs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: now.toISOString(),
        month: currentMonth,
        customer,
        exporterShipper: exporter,
        customInvoiceNo: invoiceNo,
        pod,
        invoicedPallets,
        invoicedBatteries,
        invoicedGrossWeightKg: invoicedGrossKg,
        actualReceivedPallets: invoicedPallets, // Defaults to 100% received on upload
        actualReceivedBatteries: invoicedBatteries,
        shortfallPallets: 0,
        shortfallBatteries: 0,
        cartingInDate: todayFormatted,
        vehicleNo: '',
        lastPltRecdDate: todayFormatted,
        secondVehicleDate: '',
        secondVehicleNo: '',
        gateInStatus: '1',
        actualStuffedPallets: 0,
        actualStuffedBatteries: 0,
        balancePallets: invoicedPallets,
        balanceBatteries: invoicedBatteries,
        shippingBillNo: shipment.shippingBillNumbers || '',
        shippingBillDate: '',
        containerNo: shipment.containerNumber || '',
        sealNo: shipment.sealNumber || '',
        stuffingDate: '',
        pickupDate: '',
        portGateInDate: '',
        daysInCFS: 0,
        remarks: 'IN CFS - READY',
        pallets: palletUnits
      });
      newlyCreated.push(entry);
    }
  });

  // Save all to localStorage
  newlyCreated.forEach((e) => addOrUpdateCFSEntry(e));
  return newlyCreated;
}

/**
 * Confirms 100% Gate-In for a specific ledger entry in 1-click
 */
export function confirmFullGateIn(entryId: string): CFSLedgerEntry | null {
  const existing = getCFSLedgerEntries();
  const entry = existing.find((e) => e.id === entryId);
  if (!entry) return null;

  const today = formatToDDMMYYYY(new Date());
  const updatedPallets = (entry.pallets || []).map((p) => ({
    ...p,
    receivedBatteries: p.invoicedBatteries,
    status: 'IN_WAREHOUSE' as const
  }));

  const updated = recomputeCFSDerivedFields({
    ...entry,
    actualReceivedPallets: entry.invoicedPallets,
    actualReceivedBatteries: entry.invoicedBatteries,
    shortfallPallets: 0,
    shortfallBatteries: 0,
    lastPltRecdDate: today,
    pallets: updatedPallets
  });

  addOrUpdateCFSEntry(updated);
  return updated;
}

/**
 * Updates an individual pallet's received battery quantity in the warehouse
 */
export function updatePalletReceivedQuantity(entryId: string, palletId: string, receivedQty: number): CFSLedgerEntry | null {
  const existing = getCFSLedgerEntries();
  const entry = existing.find((e) => e.id === entryId);
  if (!entry) return null;

  const validQty = Math.max(0, Number(receivedQty) || 0);
  const updatedPallets = (entry.pallets || []).map((p) => {
    if (p.id === palletId) {
      return {
        ...p,
        receivedBatteries: validQty,
        status: validQty > 0 ? ('IN_WAREHOUSE' as const) : ('PENDING_GATE_IN' as const)
      };
    }
    return p;
  });

  const totalRecBatteries = updatedPallets.reduce((sum, p) => sum + (p.receivedBatteries || 0), 0);
  const totalRecPallets = updatedPallets.filter((p) => (p.receivedBatteries || 0) > 0).length;

  const today = formatToDDMMYYYY(new Date());
  const updated = recomputeCFSDerivedFields({
    ...entry,
    actualReceivedPallets: totalRecPallets,
    actualReceivedBatteries: totalRecBatteries,
    lastPltRecdDate: totalRecPallets === entry.invoicedPallets ? today : entry.lastPltRecdDate,
    pallets: updatedPallets
  });

  addOrUpdateCFSEntry(updated);
  return updated;
}

/**
 * Container Stuffing & Stock-Out Dispatch Execution:
 * Marks selected pallets as STUFFED_DISPATCHED, deducts from Balance Qty,
 * increments Actual Stuffed Qty, and stamps Container, Seal, Shipping Bill details.
 */
export function confirmStuffingDispatch(
  selectedPalletIds: string[],
  dispatchDetails: {
    containerNo: string;
    sealNo: string;
    shippingBillNo?: string;
    shippingBillDate?: string;
    stuffingDate?: string;
    pickupDate?: string;
    portGateInDate?: string;
  }
): { updatedEntries: CFSLedgerEntry[]; stuffedCount: number } {
  if (selectedPalletIds.length === 0) return { updatedEntries: [], stuffedCount: 0 };

  const existing = getCFSLedgerEntries();
  const selectedSet = new Set(selectedPalletIds);
  const affectedEntries: CFSLedgerEntry[] = [];
  let totalStuffedCount = 0;

  const today = formatToDDMMYYYY(new Date());

  const updatedEntries = existing.map((entry) => {
    const entryHasPallets = (entry.pallets || []).some((p) => selectedSet.has(p.id));
    if (!entryHasPallets) return entry;

    let newlyStuffedPallets = 0;
    let newlyStuffedBatteries = 0;

    const updatedPallets = (entry.pallets || []).map((p) => {
      if (selectedSet.has(p.id) && p.status !== 'STUFFED_DISPATCHED') {
        newlyStuffedPallets += 1;
        newlyStuffedBatteries += p.receivedBatteries || p.invoicedBatteries || 0;
        return {
          ...p,
          status: 'STUFFED_DISPATCHED' as const,
          containerNo: dispatchDetails.containerNo,
          stuffedDate: dispatchDetails.stuffingDate || today
        };
      }
      return p;
    });

    totalStuffedCount += newlyStuffedPallets;

    const updated = recomputeCFSDerivedFields({
      ...entry,
      actualStuffedPallets: (entry.actualStuffedPallets || 0) + newlyStuffedPallets,
      actualStuffedBatteries: (entry.actualStuffedBatteries || 0) + newlyStuffedBatteries,
      containerNo: dispatchDetails.containerNo || entry.containerNo,
      sealNo: dispatchDetails.sealNo || entry.sealNo,
      shippingBillNo: dispatchDetails.shippingBillNo || entry.shippingBillNo,
      shippingBillDate: dispatchDetails.shippingBillDate || entry.shippingBillDate,
      stuffingDate: dispatchDetails.stuffingDate || entry.stuffingDate || today,
      pickupDate: dispatchDetails.pickupDate || entry.pickupDate,
      portGateInDate: dispatchDetails.portGateInDate || entry.portGateInDate,
      pallets: updatedPallets
    });

    affectedEntries.push(updated);
    return updated;
  });

  saveCFSLedgerEntries(updatedEntries);
  return { updatedEntries: affectedEntries, stuffedCount: totalStuffedCount };
}

/**
 * Live Two-Way Stage-2 Field Sync:
 * Synchronizes Shipping Bill No, Shipping Bill Date, Container No, and Seal No
 * edited in the Workspace into matching CFS Ledger rows.
 */
export function syncStage2FieldsToLedger(shipment: ExtractedShipmentJSON): void {
  if (!shipment) return;
  const existing = getCFSLedgerEntries();
  if (existing.length === 0) return;

  const invoiceSet = new Set((shipment.invoiceNumbers || []).map((i) => i.trim().toUpperCase()));
  const containerNo = shipment.containerNumber?.trim() || '';
  const sealNo = shipment.sealNumber?.trim() || '';
  const shippingBillNo = shipment.shippingBillNumbers?.trim() || '';
  const shippingBillDate = shipment.invoiceDates?.[0]?.trim() || '';

  let hasChanged = false;

  const updatedEntries = existing.map((entry) => {
    const matchesInvoice = invoiceSet.has(entry.customInvoiceNo.trim().toUpperCase());
    const matchesContainer = Boolean(containerNo && entry.containerNo && entry.containerNo.trim().toUpperCase() === containerNo.toUpperCase());

    if (matchesInvoice || matchesContainer) {
      hasChanged = true;
      return recomputeCFSDerivedFields({
        ...entry,
        shippingBillNo: shippingBillNo || entry.shippingBillNo,
        shippingBillDate: shippingBillDate || entry.shippingBillDate,
        containerNo: containerNo || entry.containerNo,
        sealNo: sealNo || entry.sealNo
      });
    }
    return entry;
  });

  if (hasChanged) {
    saveCFSLedgerEntries(updatedEntries);
  }
}

/**
 * Computes live operational warnings grouped by Customer (Consignee):
 * - STOCK-OUT / DEPLETED (Crimson): Balance pallets === 0
 * - FACTORY SHORTFALL (Rose/Red): Shortfall pallets > 0 or shortfall batteries > 0
 * - LOW-STOCK / PARTIAL CONTAINER (Amber): Balance pallets 1 to 21 (< 1 x 20' GP load)
 * - OK (Emerald): Balance pallets >= 22 with zero shortfall
 */
export function getCustomerStockSummaries(entries: CFSLedgerEntry[]): CustomerStockSummary[] {
  const map = new Map<string, CFSLedgerEntry[]>();

  entries.forEach((e) => {
    const cust = e.customer?.trim() || 'UNKNOWN';
    if (!map.has(cust)) {
      map.set(cust, []);
    }
    map.get(cust)!.push(e);
  });

  const summaries: CustomerStockSummary[] = [];

  map.forEach((customerEntries, customer) => {
    const totalInvoicedPallets = customerEntries.reduce((s, e) => s + (e.invoicedPallets || 0), 0);
    const totalReceivedPallets = customerEntries.reduce((s, e) => s + (e.actualReceivedPallets || 0), 0);
    const totalShortfallPallets = customerEntries.reduce((s, e) => s + (e.shortfallPallets || 0), 0);
    const totalShortfallBatteries = customerEntries.reduce((s, e) => s + (e.shortfallBatteries || 0), 0);
    const totalStuffedPallets = customerEntries.reduce((s, e) => s + (e.actualStuffedPallets || 0), 0);
    const totalBalancePallets = customerEntries.reduce((s, e) => s + (e.balancePallets || 0), 0);
    const totalBalanceBatteries = customerEntries.reduce((s, e) => s + (e.balanceBatteries || 0), 0);
    const totalBalanceGrossWeightKg = customerEntries.reduce((s, e) => {
      // Estimate weight proportional to balance pallets
      const ratio = e.invoicedPallets > 0 ? (e.balancePallets || 0) / e.invoicedPallets : 0;
      return s + (e.invoicedGrossWeightKg || 0) * ratio;
    }, 0);

    const required20GPContainers = Math.ceil(totalBalancePallets / 22);

    let alertType: CustomerStockAlert = 'OK';
    let alertMessage = 'Stock healthy (Ready for 20\' GP dispatch)';

    if (totalBalancePallets === 0) {
      alertType = 'STOCK_OUT';
      alertMessage = 'CFS floor inventory depleted (0 pallets available)';
    } else if (totalShortfallPallets > 0 || totalShortfallBatteries > 0) {
      alertType = 'FACTORY_SHORTFALL';
      alertMessage = `Factory shortfall: ${totalShortfallPallets} pallets (${totalShortfallBatteries} batteries) pending receipt`;
    } else if (totalBalancePallets < 22) {
      alertType = 'LOW_STOCK';
      alertMessage = `Low stock: ${totalBalancePallets}/22 pallets (Partial container; cannot fill full 20' GP)`;
    }

    summaries.push({
      customer,
      totalInvoicedPallets,
      totalReceivedPallets,
      totalShortfallPallets,
      totalShortfallBatteries,
      totalStuffedPallets,
      totalBalancePallets,
      totalBalanceBatteries,
      totalBalanceGrossWeightKg: Math.round(totalBalanceGrossWeightKg),
      required20GPContainers,
      alertType,
      alertMessage
    });
  });

  return summaries;
}

/**
 * Builds a unified ExtractedShipmentJSON from selected warehouse stock pallets,
 * runs autoAllocate20GPContainers, and prepares clean truth JSON for DG/BL generation.
 */
export function buildShipmentFromStockPallets(
  selectedPallets: PalletStockUnit[],
  customerName: string,
  destinationPort?: string,
  exporterShipper?: string
): ExtractedShipmentJSON {
  const palletItems: PalletItem[] = selectedPallets.map((p, idx) => ({
    palletNumber: String(p.palletNumber || idx + 1),
    modelCode: p.model || 'STANDARD',
    brand: p.brand || '',
    invoiceNumber: p.invoiceNumber || '',
    boxCount: p.receivedBatteries || p.invoicedBatteries || 0,
    grossWeightKg: p.grossWeightKg || 0,
    netWeightKg: p.netWeightKg || 0,
    sourceFile: 'CFS_WAREHOUSE'
  }));

  const totalPallets = palletItems.length;
  const totalBoxes = palletItems.reduce((s, p) => s + (p.boxCount || 0), 0);
  const grossWeightKg = Math.round(palletItems.reduce((s, p) => s + (p.grossWeightKg || 0), 0));
  const netWeightKg = Math.round(palletItems.reduce((s, p) => s + (p.netWeightKg || 0), 0));

  const uniqueInvoices: string[] = Array.from(new Set(palletItems.map((p) => p.invoiceNumber).filter((inv): inv is string => Boolean(inv))));
  const primaryInvoice = uniqueInvoices[0] || 'DISPATCH-1';

  // Run deterministic 20' GP multi-container planner
  const allocatedContainers = autoAllocate20GPContainers(palletItems, [], '', '');
  const totalTare = allocatedContainers.reduce((sum, c) => sum + (c.tareWeightKg || 2150), 0);

  const base = createEmptyShipmentJSON(uniqueInvoices.length > 1 ? 'MULTI_INVOICE' : 'SINGLE_INVOICE');

  return {
    ...base,
    shipperName: exporterShipper || '',
    consigneeName: customerName || '',
    invoiceNumbers: uniqueInvoices.length > 0 ? uniqueInvoices : [primaryInvoice],
    invoiceDates: [formatToDDMMYYYY(new Date())],
    shipperReference: primaryInvoice,
    portOfDischarge: destinationPort || '',
    placeOfDelivery: destinationPort || '',
    finalDestination: destinationPort || '',
    productDescription: 'LEAD ACID BATTERIES',
    properShippingName: 'BATTERIES, WET, FILLED WITH ACID',
    unNumber: '2794',
    imoClass: '8',
    packingGroup: 'III',
    totalPallets,
    totalBoxes,
    totalPackages: totalBoxes,
    grossWeightKg,
    netWeightKg,
    volumeCbm: Number((totalPallets * 1.15).toFixed(2)),
    containerType: '20GP',
    tareWeightKg: totalTare || 2150,
    containerNumber: allocatedContainers[0]?.containerNumber || '',
    sealNumber: allocatedContainers[0]?.sealNumber || '',
    containers: allocatedContainers,
    pallets: palletItems,
    shippingMarks: `CONSIGNEE: ${customerName}\nTOTAL PALLETS: ${totalPallets}`,
    freeTimeClause: '14 DAYS DETENTION FREE TIME AT DESTINATION',
    sourceFiles: ['CFS_WAREHOUSE_LEDGER'],
    extractedAt: new Date().toISOString()
  };
}

/**
 * 1-Click Multi-Tab .xlsx Export matching CFS STOCK REPORT 2026-2027 (2).xlsx
 * Includes Grouped 2-Row Headers and Live Excel Formulas (=C3-E3, =D3-F3, =+E3-J3, =+F3-K3, =T3-I3)
 */
export function exportCFSStockReportXlsx(entries: CFSLedgerEntry[], targetMonth: CFSMonth = 'ALL'): void {
  const wb = XLSX.utils.book_new();

  const monthsToExport: string[] = targetMonth === 'ALL'
    ? Array.from(new Set(entries.map((e) => e.month || 'OCT'))).filter(Boolean)
    : [targetMonth];

  if (monthsToExport.length === 0) {
    monthsToExport.push('OCT');
  }

  // Helper to build a sheet for a given set of rows
  const buildSheetForRows = (rows: CFSLedgerEntry[]) => {
    const wsData: any[][] = [];

    // Row 1: Merged Group Headers
    wsData.push([
      '', // Col A (Customer)
      '', // Col B (Custom Invoice No)
      'As received from EIL-Export', // Col C-D
      '',
      'Actual Received from Factory', // Col E-F
      '',
      'Short fall', // Col G-H
      '',
      '', // Col I (Carting in Date)
      'Actual Stuffed Qty', // Col J-K
      '',
      'Balance Qty', // Col L-M
      '',
      '', // Col N (Shipping Bill No.)
      '', // Col O (Date)
      '', // Col P (Container No)
      '', // Col Q (Seal No)
      '', // Col R (Stuffing Date)
      '', // Col S (Pick-up Date)
      '', // Col T (Gate-in Date)
      '', // Col U (No of Days in CFS)
      '' // Col V (Remarks)
    ]);

    // Row 2: Detailed 22 Columns
    wsData.push([
      'Customer', // 1
      'Custom Invoice No', // 2
      'No of Pallets', // 3 (C)
      'No of Batteries', // 4 (D)
      'No of Pallets', // 5 (E)
      'No of Batteries', // 6 (F)
      'No of Pallets', // 7 (G = C - E)
      'No of Batteries', // 8 (H = D - F)
      'Carting in Date', // 9 (I)
      'No of Pallets', // 10 (J)
      'No of Batteries', // 11 (K)
      'No of Pallets', // 12 (L = E - J)
      'No of Batteries', // 13 (M = F - K)
      'Shipping Bill No.', // 14 (N)
      'Date', // 15 (O)
      'Container No', // 16 (P)
      'Seal No', // 17 (Q)
      'Stuffing Date', // 18 (R)
      'Pick-up Date', // 19 (S)
      'Gate-in Date', // 20 (T)
      'No of Days in CFS', // 21 (U = T - I)
      'Remarks' // 22 (V)
    ]);

    // Row 3+: Data Rows with Live Formulas
    rows.forEach((e, idx) => {
      const r = idx + 3; // 1-based Excel row number
      wsData.push([
        e.customer || '',
        e.customInvoiceNo || '',
        e.invoicedPallets || 0,
        e.invoicedBatteries || 0,
        e.actualReceivedPallets || 0,
        e.actualReceivedBatteries || 0,
        { f: `C${r}-E${r}` }, // Shortfall pallets formula
        { f: `D${r}-F${r}` }, // Shortfall batteries formula
        e.cartingInDate || '',
        e.actualStuffedPallets || 0,
        e.actualStuffedBatteries || 0,
        { f: `+E${r}-J${r}` }, // Balance pallets formula
        { f: `+F${r}-K${r}` }, // Balance batteries formula
        e.shippingBillNo || '',
        e.shippingBillDate || '',
        e.containerNo || '',
        e.sealNo || '',
        e.stuffingDate || '',
        e.pickupDate || '',
        e.portGateInDate || '',
        e.portGateInDate ? { f: `T${r}-I${r}` } : (e.daysInCFS || 0), // Days in CFS
        e.remarks || ''
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Apply header merges
    ws['!merges'] = [
      { s: { r: 0, c: 2 }, e: { r: 0, c: 3 } }, // As received from EIL-Export
      { s: { r: 0, c: 4 }, e: { r: 0, c: 5 } }, // Actual Received from Factory
      { s: { r: 0, c: 6 }, e: { r: 0, c: 7 } }, // Short fall
      { s: { r: 0, c: 9 }, e: { r: 0, c: 10 } }, // Actual Stuffed Qty
      { s: { r: 0, c: 11 }, e: { r: 0, c: 12 } } // Balance Qty
    ];

    // Set column widths
    ws['!cols'] = [
      { wch: 18 }, // Customer
      { wch: 18 }, // Custom Invoice No
      { wch: 12 }, // Inv Plt
      { wch: 14 }, // Inv Bat
      { wch: 12 }, // Rec Plt
      { wch: 14 }, // Rec Bat
      { wch: 12 }, // Short Plt
      { wch: 14 }, // Short Bat
      { wch: 14 }, // Carting Date
      { wch: 12 }, // Stf Plt
      { wch: 14 }, // Stf Bat
      { wch: 12 }, // Bal Plt
      { wch: 14 }, // Bal Bat
      { wch: 16 }, // SB No
      { wch: 12 }, // SB Date
      { wch: 16 }, // Cont No
      { wch: 14 }, // Seal No
      { wch: 14 }, // Stuffing Date
      { wch: 14 }, // Pickup Date
      { wch: 14 }, // Gate-in Date
      { wch: 16 }, // Days in CFS
      { wch: 22 } // Remarks
    ];

    return ws;
  };

  // Add individual month sheets
  monthsToExport.forEach((month) => {
    const monthRows = entries.filter((e) => (e.month || '').toUpperCase() === month.toUpperCase());
    const sheetTitle = `CFS STOCK ${month}`;
    const ws = buildSheetForRows(monthRows.length > 0 ? monthRows : entries);
    XLSX.utils.book_append_sheet(wb, ws, sheetTitle.slice(0, 31));
  });

  // If ALL selected, also prepend master ALL sheet
  if (targetMonth === 'ALL') {
    const masterWs = buildSheetForRows(entries);
    XLSX.utils.book_append_sheet(wb, masterWs, 'CFS STOCK MASTER');
  }

  const filename = `CFS_STOCK_REPORT_${targetMonth}_${Date.now()}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * 1-Click 17-Column .xlsx Export matching CFS CARTING REPORT OCT  2026 (1).xlsx
 */
export function exportCFSCartingReportXlsx(entries: CFSLedgerEntry[]): void {
  const wb = XLSX.utils.book_new();

  const wsData: any[][] = [];

  // Title / Blank Row 1
  wsData.push([]);

  // Row 2: Exact 17 Columns from Reference Sheet
  wsData.push([
    'INVOICE NO.', // 1 (A)
    'CONSIGNEE', // 2 (B)
    '', // 3
    '', // 4
    '', // 5
    'POD', // 6 (F)
    'GROSS WEIGHT', // 7 (G)
    'TOTAL BATTERIES', // 8 (H)
    'Total Pallet Quantity', // 9 (I)
    'Received pallets', // 10 (J)
    'pending plt qty', // 11 (K)
    'STATUS', // 12 (L)
    'CARTING DATE ', // 13 (M)
    'VEHICLE NO.', // 14 (N)
    'LAST PLT RECD', // 15 (O)
    'DATE', // 16 (P)
    'VEHICLE NO' // 17 (Q)
  ]);

  // Row 3+: Data Rows
  entries.forEach((e) => {
    wsData.push([
      e.customInvoiceNo || '',
      e.customer || '',
      '',
      '',
      '',
      e.pod || '',
      e.invoicedGrossWeightKg || 0,
      e.invoicedBatteries || 0,
      e.invoicedPallets || 0,
      e.actualReceivedPallets || 0,
      e.shortfallPallets || 0,
      e.gateInStatus || '1',
      e.cartingInDate || '',
      e.vehicleNo || '',
      e.lastPltRecdDate || '',
      e.secondVehicleDate || '',
      e.secondVehicleNo || ''
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 16 }, // Invoice
    { wch: 18 }, // Consignee
    { wch: 4 },
    { wch: 4 },
    { wch: 4 },
    { wch: 14 }, // POD
    { wch: 14 }, // Gross Wt
    { wch: 16 }, // Total Bat
    { wch: 18 }, // Total Plt
    { wch: 16 }, // Rec Plt
    { wch: 16 }, // Pending Plt
    { wch: 10 }, // Status
    { wch: 14 }, // Carting Date
    { wch: 16 }, // Vehicle No
    { wch: 14 }, // Last Plt Recd
    { wch: 14 }, // Date
    { wch: 16 } // Vehicle No 2
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'CFS CARTING REPORT');

  const filename = `CFS_CARTING_REPORT_${Date.now()}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Imports an existing CFS Stock or Carting .xlsx into the persistent ledger
 */
export async function importCFSExcel(file: File): Promise<{ importedCount: number; errors: string[] }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const errors: string[] = [];
    let count = 0;

    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) {
      return { importedCount: 0, errors: ['No sheets found in workbook.'] };
    }

    // Check all sheets or first sheet
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (data.length < 2) continue;

      // Find header row (either row 1 or row 2)
      let headerRowIndex = -1;
      let isStockReport = false;
      let isCartingReport = false;

      for (let r = 0; r < Math.min(5, data.length); r++) {
        const rowStr = data[r].join(' ').toUpperCase();
        if (rowStr.includes('CUSTOM INVOICE') || (rowStr.includes('CUSTOMER') && rowStr.includes('PALLETS'))) {
          headerRowIndex = r;
          isStockReport = true;
          break;
        } else if (rowStr.includes('INVOICE NO') && rowStr.includes('CONSIGNEE')) {
          headerRowIndex = r;
          isCartingReport = true;
          break;
        }
      }

      if (headerRowIndex === -1) continue;

      const headers = data[headerRowIndex].map((h: any) => String(h).trim().toUpperCase());

      // Parse data rows
      for (let r = headerRowIndex + 1; r < data.length; r++) {
        const row = data[r];
        if (!row || row.length === 0 || !row.some((val: any) => Boolean(String(val).trim()))) continue;

        if (isStockReport) {
          const customer = String(row[0] || '').trim();
          const invoiceNo = String(row[1] || '').trim();
          if (!invoiceNo && !customer) continue;

          const invPallets = Number(row[2]) || 0;
          const invBatteries = Number(row[3]) || 0;
          const recPallets = Number(row[4]) || invPallets;
          const recBatteries = Number(row[5]) || invBatteries;
          const cartingDate = formatToDDMMYYYY(row[8]);
          const stfPallets = Number(row[9]) || 0;
          const stfBatteries = Number(row[10]) || 0;
          const sbNo = String(row[13] || '').trim();
          const sbDate = formatToDDMMYYYY(row[14]);
          const contNo = String(row[15] || '').trim();
          const sealNo = String(row[16] || '').trim();
          const stfDate = formatToDDMMYYYY(row[17]);
          const pickDate = formatToDDMMYYYY(row[18]);
          const gateDate = formatToDDMMYYYY(row[19]);
          const remarks = String(row[21] || '').trim();

          const entry: CFSLedgerEntry = recomputeCFSDerivedFields({
            id: `cfs-imp-${Date.now()}-${count}`,
            createdAt: new Date().toISOString(),
            month: getMonthFromDate(cartingDate || sheetName),
            customer: customer || 'Customer',
            exporterShipper: '',
            customInvoiceNo: invoiceNo || `INV-${count + 1}`,
            pod: '',
            invoicedPallets: invPallets,
            invoicedBatteries: invBatteries,
            invoicedGrossWeightKg: invPallets * 1000,
            actualReceivedPallets: recPallets,
            actualReceivedBatteries: recBatteries,
            shortfallPallets: Math.max(0, invPallets - recPallets),
            shortfallBatteries: Math.max(0, invBatteries - recBatteries),
            cartingInDate: cartingDate || formatToDDMMYYYY(new Date()),
            vehicleNo: '',
            lastPltRecdDate: cartingDate || formatToDDMMYYYY(new Date()),
            secondVehicleDate: '',
            secondVehicleNo: '',
            gateInStatus: '1',
            actualStuffedPallets: stfPallets,
            actualStuffedBatteries: stfBatteries,
            balancePallets: Math.max(0, recPallets - stfPallets),
            balanceBatteries: Math.max(0, recBatteries - stfBatteries),
            shippingBillNo: sbNo,
            shippingBillDate: sbDate,
            containerNo: contNo,
            sealNo,
            stuffingDate: stfDate,
            pickupDate: pickDate,
            portGateInDate: gateDate,
            daysInCFS: safeDiffDays(cartingDate, gateDate),
            remarks,
            pallets: []
          });

          addOrUpdateCFSEntry(entry);
          count++;
        } else if (isCartingReport) {
          const invCol = headers.findIndex((h) => h.includes('INVOICE'));
          const consCol = headers.findIndex((h) => h.includes('CONSIGNEE'));
          const podCol = headers.findIndex((h) => h.includes('POD'));
          const grossCol = headers.findIndex((h) => h.includes('GROSS'));
          const batCol = headers.findIndex((h) => h.includes('BATTERIES'));
          const pltCol = headers.findIndex((h) => h.includes('PALLET') && !h.includes('RECEIVED') && !h.includes('PENDING'));
          const recPltCol = headers.findIndex((h) => h.includes('RECEIVED'));
          const dateCol = headers.findIndex((h) => h.includes('CARTING'));
          const vehCol = headers.findIndex((h) => h.includes('VEHICLE'));

          const invoiceNo = String(row[invCol >= 0 ? invCol : 0] || '').trim();
          const customer = String(row[consCol >= 0 ? consCol : 1] || '').trim();
          if (!invoiceNo && !customer) continue;

          const grossKg = Number(row[grossCol >= 0 ? grossCol : 6]) || 0;
          const batteries = Number(row[batCol >= 0 ? batCol : 7]) || 0;
          const pallets = Number(row[pltCol >= 0 ? pltCol : 8]) || 0;
          const recPallets = Number(row[recPltCol >= 0 ? recPltCol : 9]) || pallets;
          const cartingDate = formatToDDMMYYYY(row[dateCol >= 0 ? dateCol : 12]);
          const vehicleNo = String(row[vehCol >= 0 ? vehCol : 13] || '').trim();

          const entry: CFSLedgerEntry = recomputeCFSDerivedFields({
            id: `cfs-imp-crt-${Date.now()}-${count}`,
            createdAt: new Date().toISOString(),
            month: getMonthFromDate(cartingDate),
            customer: customer || 'Consignee',
            exporterShipper: '',
            customInvoiceNo: invoiceNo || `INV-${count + 1}`,
            pod: String(row[podCol >= 0 ? podCol : 5] || '').trim(),
            invoicedPallets: pallets,
            invoicedBatteries: batteries,
            invoicedGrossWeightKg: grossKg,
            actualReceivedPallets: recPallets,
            actualReceivedBatteries: batteries,
            shortfallPallets: Math.max(0, pallets - recPallets),
            shortfallBatteries: 0,
            cartingInDate: cartingDate || formatToDDMMYYYY(new Date()),
            vehicleNo,
            lastPltRecdDate: cartingDate || formatToDDMMYYYY(new Date()),
            secondVehicleDate: '',
            secondVehicleNo: '',
            gateInStatus: '1',
            actualStuffedPallets: 0,
            actualStuffedBatteries: 0,
            balancePallets: recPallets,
            balanceBatteries: batteries,
            shippingBillNo: '',
            shippingBillDate: '',
            containerNo: '',
            sealNo: '',
            stuffingDate: '',
            pickupDate: '',
            portGateInDate: '',
            daysInCFS: 0,
            remarks: 'IN CFS - READY',
            pallets: []
          });

          addOrUpdateCFSEntry(entry);
          count++;
        }
      }
    }

    return { importedCount: count, errors };
  } catch (err: any) {
    return { importedCount: 0, errors: [err.message || 'Failed to parse Excel file'] };
  }
}

// =========================================================================
// Sprint 5: Inventory Movement Logs & Outgoing History Engine
// =========================================================================

export function getPersistedMovementLogs(): InventoryMovementRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CFS_MOVEMENT_LOGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePersistedMovementLogs(records: InventoryMovementRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CFS_MOVEMENT_LOGS_STORAGE_KEY, JSON.stringify(records));
  } catch (err) {
    console.error('Failed to save movement logs to localStorage:', err);
  }
}

export function recordMovementLog(record: Omit<InventoryMovementRecord, 'id' | 'createdAt'>): InventoryMovementRecord {
  const newRecord: InventoryMovementRecord = {
    ...record,
    id: `mov_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString()
  };
  const existing = getPersistedMovementLogs();
  savePersistedMovementLogs([newRecord, ...existing]);
  return newRecord;
}

export function getDerivedInventoryMovements(entries: CFSLedgerEntry[]): InventoryMovementRecord[] {
  const derived: InventoryMovementRecord[] = [];
  const persisted = getPersistedMovementLogs();
  const persistedIds = new Set(persisted.map((p) => p.id));

  entries.forEach((e) => {
    const modelDesc = (e.pallets || [])
      .map((p) => p.model)
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(', ') || '-';

    // 1. Gate-In / Stock-In Record
    const recPallets = e.actualReceivedPallets || e.invoicedPallets || 0;
    const recBatteries = e.actualReceivedBatteries || e.invoicedBatteries || 0;
    if (recPallets > 0) {
      const stockInId = `in_${e.id}`;
      if (!persistedIds.has(stockInId)) {
        derived.push({
          id: stockInId,
          movementDate: e.cartingInDate || e.lastPltRecdDate || formatToDDMMYYYY(e.createdAt),
          direction: 'STOCK_IN',
          customer: e.customer || 'Customer',
          customInvoiceNo: e.customInvoiceNo,
          modelDescription: modelDesc,
          pallets: recPallets,
          batteries: recBatteries,
          grossWeightKg: e.invoicedGrossWeightKg || 0,
          vehicleNo: e.vehicleNo || '-',
          remainingBalancePallets: e.balancePallets,
          remainingBalanceBatteries: e.balanceBatteries,
          createdAt: e.createdAt || new Date().toISOString(),
          remarks: e.shortfallPallets > 0 ? `Shortfall: ${e.shortfallPallets} Plt` : 'Full Gate-In'
        });
      }
    }

    // 2. Dispatch / Stock-Out Record
    if ((e.actualStuffedPallets || 0) > 0 || (e.containerNo && e.containerNo.trim() !== '')) {
      const stockOutId = `out_${e.id}_${e.containerNo || 'disp'}`;
      if (!persistedIds.has(stockOutId)) {
        const stuffedPallets = e.actualStuffedPallets || 0;
        const stuffedBatteries = e.actualStuffedBatteries || 0;
        const stuffedGrossKg = e.invoicedPallets > 0
          ? Math.round((e.invoicedGrossWeightKg / e.invoicedPallets) * stuffedPallets)
          : 0;

        derived.push({
          id: stockOutId,
          movementDate: e.stuffingDate || e.portGateInDate || e.pickupDate || formatToDDMMYYYY(e.createdAt),
          direction: 'STOCK_OUT',
          customer: e.customer || 'Customer',
          customInvoiceNo: e.customInvoiceNo,
          modelDescription: modelDesc,
          pallets: stuffedPallets,
          batteries: stuffedBatteries,
          grossWeightKg: stuffedGrossKg,
          containerNo: e.containerNo || '-',
          sealNo: e.sealNo || '-',
          shippingBillNo: e.shippingBillNo || '-',
          shippingBillDate: e.shippingBillDate || '-',
          vehicleNo: e.vehicleNo || '-',
          remainingBalancePallets: e.balancePallets,
          remainingBalanceBatteries: e.balanceBatteries,
          createdAt: e.createdAt || new Date().toISOString(),
          remarks: e.remarks || 'Stuffed & Dispatched'
        });
      }
    }
  });

  const all = [...persisted, ...derived];
  return all.sort((a, b) => {
    const tA = new Date(a.createdAt || a.movementDate).getTime() || 0;
    const tB = new Date(b.createdAt || b.movementDate).getTime() || 0;
    return tB - tA;
  });
}

export function exportCFSMovementLogsXlsx(records: InventoryMovementRecord[]): void {
  const rows = records.map((r) => ({
    'Movement Date': r.movementDate,
    'Direction': r.direction === 'STOCK_OUT' ? 'STOCK-OUT • DISPATCHED' : 'STOCK-IN • GATE RECEIPT',
    'Customer / Consignee': r.customer,
    'Custom Invoice No.': r.customInvoiceNo,
    'Model / Description': r.modelDescription,
    'Pallets': r.pallets,
    'Batteries': r.batteries,
    'Gross Weight (kg)': r.grossWeightKg || 0,
    'Container No.': r.containerNo || '-',
    'Seal No.': r.sealNo || '-',
    'Shipping Bill No.': r.shippingBillNo || '-',
    'SB Date': r.shippingBillDate || '-',
    'Vehicle / Haulier': r.vehicleNo || '-',
    'Remaining Balance (Plt)': r.remainingBalancePallets,
    'Remaining Balance (Units)': r.remainingBalanceBatteries,
    'Remarks': r.remarks || ''
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 26 },
    { wch: 28 },
    { wch: 18 },
    { wch: 25 },
    { wch: 10 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 22 },
    { wch: 24 },
    { wch: 22 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Movement Logs');
  const today = formatToDDMMYYYY(new Date()).replace(/\./g, '-');
  XLSX.writeFile(wb, `CFS_Inventory_Movement_Logs_${today}.xlsx`);
}

