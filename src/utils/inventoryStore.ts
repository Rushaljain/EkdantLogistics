// Ekdant Logistics - CHA Warehouse Inventory, Carting Gate-In & Monthly Stock Ledger Engine
// 1:1 Alignment with Client's CFS Stock Report (22 Columns) & CFS Carting Report (17 Columns)

import * as XLSX from 'xlsx';
import type {
  CFSLedgerEntry,
  CustomerStockAlert,
  CustomerStockSummary,
  ExtractedShipmentJSON,
  InventoryMovementRecord,
  InventoryMovementStatus,
  PalletItem,
  PalletStockUnit,
  ReceiptMode,
  ShortfallMode,
  ShortfallRecord,
  LinkedShortFill,
  MergedTransfer
} from '../types/index.ts';
import { createEmptyShipmentJSON } from '../types/index.ts';
import { autoAllocate20GPContainers } from './manifestKeywordReference.ts';
import { supabase, isSupabaseConfigured } from './supabaseClient.ts';

/**
 * Preserves exact decimal weight precision with 0.00 kg drift
 */
export function toExactWeight(val?: number | null): number {
  if (val === undefined || val === null || isNaN(val)) return 0;
  return Number(val.toFixed(3));
}

export const CFS_LEDGER_STORAGE_KEY = 'ekdant_cha_cfs_ledger_v1';
export const CFS_MOVEMENT_LOGS_STORAGE_KEY = 'ekdant_cha_cfs_movement_logs_v1';
export const LEGACY_CFS_MOVEMENT_LOGS_KEY = 'ekdant_cha_movement_logs_v1';

// =========================================================================
// Sprint 7: Supabase Cloud Persistence & Cache Synchronization Engine
// =========================================================================

export type CloudSyncStatus = 'synced' | 'syncing' | 'local' | 'error';

let currentCloudSyncStatus: CloudSyncStatus = isSupabaseConfigured() ? 'synced' : 'local';
const syncListeners = new Set<(status: CloudSyncStatus) => void>();

export function getCloudSyncStatus(): CloudSyncStatus {
  return currentCloudSyncStatus;
}

export function subscribeToSyncStatus(listener: (status: CloudSyncStatus) => void): () => void {
  syncListeners.add(listener);
  listener(currentCloudSyncStatus);
  return () => {
    syncListeners.delete(listener);
  };
}

function updateSyncStatus(status: CloudSyncStatus): void {
  currentCloudSyncStatus = status;
  syncListeners.forEach((l) => {
    try {
      l(status);
    } catch (e) {
      console.warn('[SyncStatus] Listener callback failed:', e);
    }
  });
}

// Cloud write-through mutation helpers
export async function syncEntryToCloud(entry: CFSLedgerEntry): Promise<void> {
  if (!supabase || !isSupabaseConfigured()) return;
  try {
    updateSyncStatus('syncing');
    const { error } = await supabase.from('cfs_inventory_ledger').upsert({
      id: entry.id,
      custom_invoice_no: entry.customInvoiceNo || '',
      consignee_name: entry.customer || '',
      status: entry.remarks || 'IN_WAREHOUSE',
      payload: entry,
      updated_at: new Date().toISOString()
    });
    if (error) {
      console.warn('[Supabase] Failed to upsert ledger entry:', error.message);
      updateSyncStatus('error');
    } else {
      updateSyncStatus('synced');
    }
  } catch (err) {
    console.warn('[Supabase] Error syncing ledger entry:', err);
    updateSyncStatus('error');
  }
}

export async function deleteEntryFromCloud(id: string): Promise<void> {
  if (!supabase || !isSupabaseConfigured()) return;
  try {
    updateSyncStatus('syncing');
    const { error } = await supabase.from('cfs_inventory_ledger').delete().eq('id', id);
    if (error) {
      console.warn('[Supabase] Failed to delete ledger entry:', error.message);
      updateSyncStatus('error');
    } else {
      updateSyncStatus('synced');
    }
  } catch (err) {
    console.warn('[Supabase] Error deleting ledger entry:', err);
    updateSyncStatus('error');
  }
}

export async function syncMovementLogToCloud(log: InventoryMovementRecord): Promise<void> {
  if (!supabase || !isSupabaseConfigured()) return;
  try {
    updateSyncStatus('syncing');
    const { error } = await supabase.from('cfs_movement_logs').upsert({
      id: log.id,
      ledger_id: log.sourceLedgerId || null,
      direction: log.direction || 'STOCK_IN',
      customer_name: log.customer || '',
      payload: log,
      created_at: log.createdAt || new Date().toISOString()
    });
    if (error) {
      console.warn('[Supabase] Failed to upsert movement log:', error.message);
      updateSyncStatus('error');
    } else {
      updateSyncStatus('synced');
    }
  } catch (err) {
    console.warn('[Supabase] Error syncing movement log:', err);
    updateSyncStatus('error');
  }
}

export async function deleteMovementLogFromCloud(logId: string): Promise<void> {
  if (!supabase || !isSupabaseConfigured()) return;
  try {
    updateSyncStatus('syncing');
    const { error } = await supabase.from('cfs_movement_logs').delete().eq('id', logId);
    if (error) {
      console.warn('[Supabase] Failed to delete movement log:', error.message);
      updateSyncStatus('error');
    } else {
      updateSyncStatus('synced');
    }
  } catch (err) {
    console.warn('[Supabase] Error deleting movement log:', err);
    updateSyncStatus('error');
  }
}

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
    invoicedGrossWeightKg: toExactWeight(entry.invoicedGrossWeightKg),
    invoicedNetWeightKg: entry.invoicedNetWeightKg !== undefined ? toExactWeight(entry.invoicedNetWeightKg) : undefined,
    actualGrossWeightKg: entry.actualGrossWeightKg !== undefined ? toExactWeight(entry.actualGrossWeightKg) : undefined,
    actualNetWeightKg: entry.actualNetWeightKg !== undefined ? toExactWeight(entry.actualNetWeightKg) : undefined,
    actualReceivedPallets: recPallets,
    actualReceivedBatteries: recBatteries,
    shortfallPallets,
    shortfallBatteries,
    actualStuffedPallets: stfPallets,
    actualStuffedBatteries: stfBatteries,
    balancePallets,
    balanceBatteries,
    daysInCFS,
    remarks,
    receiptMode: entry.receiptMode || 'RECEIVED_FULL',
    shortfalls: entry.shortfalls || [],
    shortFillLinks: entry.shortFillLinks || [],
    dgCreated: Boolean(entry.dgCreated),
    blCreated: Boolean(entry.blCreated)
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
  syncEntryToCloud(recomputed);
  return recomputed;
}

/**
 * Deletes an entry by ID
 */
export function deleteCFSEntry(id: string): void {
  const existing = getCFSLedgerEntries();
  const filtered = existing.filter((e) => e.id !== id);
  saveCFSLedgerEntries(filtered);
  deleteEntryFromCloud(id);
}

/**
 * Deletes multiple entries by IDs
 */
export function deleteCFSEntries(ids: string[]): void {
  const idSet = new Set(ids);
  const existing = getCFSLedgerEntries();
  const filtered = existing.filter((e) => !idSet.has(e.id));
  saveCFSLedgerEntries(filtered);
  ids.forEach((id) => deleteEntryFromCloud(id));
}

/**
 * Deletes a specific pallet from an entry and updates the entry's counts
 */
export function deletePalletFromCFSEntry(entryId: string, palletId: string): CFSLedgerEntry | null {
  const existing = getCFSLedgerEntries();
  const entryIndex = existing.findIndex((e) => e.id === entryId);
  if (entryIndex === -1) return null;

  const entry = existing[entryIndex];
  const targetPallet = (entry.pallets || []).find((p) => p.id === palletId);
  const updatedPallets = (entry.pallets || []).filter((p) => p.id !== palletId);

  const removedUnits = targetPallet?.receivedBatteries || targetPallet?.invoicedBatteries || 0;
  const removedGrossKg = targetPallet?.grossWeightKg || 0;
  const removedNetKg = targetPallet?.netWeightKg || 0;

  const updatedEntry: CFSLedgerEntry = {
    ...entry,
    pallets: updatedPallets,
    invoicedPallets: Math.max(0, (entry.invoicedPallets || 0) - 1),
    actualReceivedPallets: Math.max(0, (entry.actualReceivedPallets || 0) - 1),
    invoicedBatteries: Math.max(0, (entry.invoicedBatteries || 0) - removedUnits),
    actualReceivedBatteries: Math.max(0, (entry.actualReceivedBatteries || 0) - removedUnits),
    invoicedGrossWeightKg: Math.max(0, toExactWeight((entry.invoicedGrossWeightKg || 0) - removedGrossKg)),
    invoicedNetWeightKg: entry.invoicedNetWeightKg !== undefined ? Math.max(0, toExactWeight(entry.invoicedNetWeightKg - removedNetKg)) : undefined,
    actualGrossWeightKg: entry.actualGrossWeightKg !== undefined ? Math.max(0, toExactWeight(entry.actualGrossWeightKg - removedGrossKg)) : undefined,
    actualNetWeightKg: entry.actualNetWeightKg !== undefined ? Math.max(0, toExactWeight(entry.actualNetWeightKg - removedNetKg)) : undefined,
    updatedAt: new Date().toISOString()
  };

  const recomputed = recomputeCFSDerivedFields(updatedEntry);
  existing[entryIndex] = recomputed;
  saveCFSLedgerEntries(existing);
  syncEntryToCloud(recomputed);
  return recomputed;
}

/**
 * Deletes multiple pallets across entries
 */
export function deletePalletsFromCFS(palletIds: string[]): void {
  const palletIdSet = new Set(palletIds);
  const existing = getCFSLedgerEntries();

  const updatedList = existing.map((entry) => {
    const hasPalletsToRemove = (entry.pallets || []).some((p) => palletIdSet.has(p.id));
    if (!hasPalletsToRemove) return entry;

    let removedPalletsCount = 0;
    let removedUnits = 0;
    let removedGrossKg = 0;
    let removedNetKg = 0;

    const remainingPallets = (entry.pallets || []).filter((p) => {
      if (palletIdSet.has(p.id)) {
        removedPalletsCount++;
        removedUnits += p.receivedBatteries || p.invoicedBatteries || 0;
        removedGrossKg += p.grossWeightKg || 0;
        removedNetKg += p.netWeightKg || 0;
        return false;
      }
      return true;
    });

    const updatedEntry: CFSLedgerEntry = {
      ...entry,
      pallets: remainingPallets,
      invoicedPallets: Math.max(0, (entry.invoicedPallets || 0) - removedPalletsCount),
      actualReceivedPallets: Math.max(0, (entry.actualReceivedPallets || 0) - removedPalletsCount),
      invoicedBatteries: Math.max(0, (entry.invoicedBatteries || 0) - removedUnits),
      actualReceivedBatteries: Math.max(0, (entry.actualReceivedBatteries || 0) - removedUnits),
      invoicedGrossWeightKg: Math.max(0, toExactWeight((entry.invoicedGrossWeightKg || 0) - removedGrossKg)),
      invoicedNetWeightKg: entry.invoicedNetWeightKg !== undefined ? Math.max(0, toExactWeight(entry.invoicedNetWeightKg - removedNetKg)) : undefined,
      actualGrossWeightKg: entry.actualGrossWeightKg !== undefined ? Math.max(0, toExactWeight(entry.actualGrossWeightKg - removedGrossKg)) : undefined,
      actualNetWeightKg: entry.actualNetWeightKg !== undefined ? Math.max(0, toExactWeight(entry.actualNetWeightKg - removedNetKg)) : undefined,
      updatedAt: new Date().toISOString()
    };

    return recomputeCFSDerivedFields(updatedEntry);
  });

  saveCFSLedgerEntries(updatedList);
  updatedList.forEach((e) => syncEntryToCloud(e));
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
      ? toExactWeight(groupPallets.reduce((sum, p) => sum + (p.grossWeightKg || 0), 0))
      : toExactWeight(shipment.grossWeightKg || 0);
    const invoicedNetKg = groupPallets.length > 0
      ? toExactWeight(groupPallets.reduce((sum, p) => sum + (p.netWeightKg || 0), 0))
      : toExactWeight(shipment.netWeightKg || 0);

    const palletUnits: PalletStockUnit[] = groupPallets.map((p, idx) => ({
      id: `plt-${invoiceNo}-${p.palletNumber || idx + 1}-${Date.now()}`,
      palletNumber: p.palletNumber || idx + 1,
      model: p.modelCode || 'STANDARD',
      brand: p.brand || shipment.brandName || '',
      invoicedBatteries: p.boxCount || 0,
      receivedBatteries: p.boxCount || 0, // Defaults to 100% received on upload
      remainingUnits: p.boxCount || 0,
      netWeightKg: toExactWeight(p.netWeightKg || 0),
      grossWeightKg: toExactWeight(p.grossWeightKg || 0),
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
        pallets: preservedPallets.length > 0 ? preservedPallets : (existing.pallets || []),
        sourceShipmentJson: shipment
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
        invoicedNetWeightKg: invoicedNetKg,
        actualGrossWeightKg: invoicedGrossKg,
        actualNetWeightKg: invoicedNetKg,
        actualReceivedPallets: invoicedPallets, // Defaults to 100% received on upload
        actualReceivedBatteries: invoicedBatteries,
        shortfallPallets: 0,
        shortfallBatteries: 0,
        receiptMode: 'RECEIVED_FULL',
        shortfalls: [],
        shortFillLinks: [],
        dgCreated: false,
        blCreated: false,
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
        pallets: palletUnits,
        sourceShipmentJson: shipment
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
      updatedAt: new Date().toISOString(),
      dispatchedAt: new Date().toISOString(),
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

  // Closed-loop shortfall lifecycle fulfillment:
  // If any newly dispatched entry arrived as a SHORT_FILL, mark the corresponding prior shortfall as FULFILLED
  affectedEntries.forEach((entry) => {
    if (entry.shortFillLinks && entry.shortFillLinks.length > 0) {
      entry.shortFillLinks.forEach((link) => {
        const priorIdx = updatedEntries.findIndex(
          (e) => (link.priorShortfallLedgerId && e.id === link.priorShortfallLedgerId) ||
                 (e.customInvoiceNo && e.customInvoiceNo.trim().toUpperCase() === link.priorShortfallInvoiceNo.trim().toUpperCase())
        );

        if (priorIdx !== -1) {
          const prior = updatedEntries[priorIdx];
          const updatedShortfalls = (prior.shortfalls || []).map((sf) => {
            const matchesPallet = !link.palletNumber || String(sf.palletNumber).trim() === String(link.palletNumber).trim();
            if (matchesPallet) {
              const updatedLinks = (sf.linkedShortFills || []).map((lsf) => {
                if (lsf.shortFillInvoiceNo.trim().toUpperCase() === entry.customInvoiceNo.trim().toUpperCase()) {
                  return {
                    ...lsf,
                    dispatched: true,
                    dispatchedDate: dispatchDetails.stuffingDate || today,
                    dispatchContainerNo: dispatchDetails.containerNo
                  };
                }
                return lsf;
              });

              return {
                ...sf,
                status: 'FULFILLED' as const,
                fulfilledDate: dispatchDetails.stuffingDate || today,
                fulfilledMonth: entry.month || today,
                fulfilledContainerNo: dispatchDetails.containerNo,
                linkedShortFills: updatedLinks
              };
            }
            return sf;
          });

          const priorUpdated = {
            ...prior,
            shortfalls: updatedShortfalls,
            updatedAt: new Date().toISOString()
          };
          updatedEntries[priorIdx] = priorUpdated;
          if (!affectedEntries.some((e) => e.id === priorUpdated.id)) {
            affectedEntries.push(priorUpdated);
          }
        }
      });
    }
  });

  saveCFSLedgerEntries(updatedEntries);
  affectedEntries.forEach((e) => syncEntryToCloud(e));
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
    updatedEntries.forEach((entry) => {
      const matchesInvoice = invoiceSet.has(entry.customInvoiceNo.trim().toUpperCase());
      const matchesContainer = Boolean(containerNo && entry.containerNo && entry.containerNo.trim().toUpperCase() === containerNo.toUpperCase());
      if (matchesInvoice || matchesContainer) {
        syncEntryToCloud(entry);
      }
    });
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
      // Sum actual floor pallets if available
      const floorPallets = (e.pallets || []).filter((p) => p.status === 'IN_WAREHOUSE');
      if (floorPallets.length > 0) {
        return s + floorPallets.reduce((ps, p) => ps + (p.grossWeightKg || 0), 0);
      }
      const weightBase = e.actualGrossWeightKg || e.invoicedGrossWeightKg || 0;
      const ratio = e.invoicedPallets > 0 ? (e.balancePallets || 0) / e.invoicedPallets : 0;
      return s + weightBase * ratio;
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
      totalBalanceGrossWeightKg: toExactWeight(totalBalanceGrossWeightKg),
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
  const grossWeightKg = toExactWeight(palletItems.reduce((s, p) => s + (p.grossWeightKg || 0), 0));
  const netWeightKg = toExactWeight(palletItems.reduce((s, p) => s + (p.netWeightKg || 0), 0));

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
 * Builds unified ExtractedShipmentJSON from one or more selected inventory invoices (Sprint 6).
 * Scoped strictly to remaining available pallets, populates autoAllocate20GPContainers,
 * and attaches sourceLedgerIds & selectedPalletIds for closed-loop dispatch tracking.
 */
export function buildShipmentFromInventoryInvoices(
  selections: { entry: CFSLedgerEntry; palletIds?: string[] }[]
): ExtractedShipmentJSON {
  if (selections.length === 0) {
    return createEmptyShipmentJSON('SINGLE_INVOICE');
  }

  // If single selection and it has sourceShipmentJson
  if (selections.length === 1 && selections[0].entry.sourceShipmentJson) {
    const { entry, palletIds } = selections[0];
    const source = JSON.parse(JSON.stringify(selections[0].entry.sourceShipmentJson)) as ExtractedShipmentJSON;

    // Filter to selected pallet IDs or available pallets
    const palletIdSet = palletIds && palletIds.length > 0 ? new Set(palletIds) : null;
    const availableStockPallets = (entry.pallets || []).filter((p) =>
      palletIdSet ? palletIdSet.has(p.id) : p.status === 'IN_WAREHOUSE'
    );
    const selectedPalletNumbers = new Set(availableStockPallets.map((p) => String(p.palletNumber).trim()));

    const filteredPallets = source.pallets.filter((p) =>
      selectedPalletNumbers.has(String(p.palletNumber).trim())
    );

    if (filteredPallets.length > 0) {
      source.pallets = filteredPallets;
      source.totalPallets = filteredPallets.length;
      source.totalBoxes = filteredPallets.reduce((s, p) => s + (p.boxCount || 0), 0);
      source.totalPackages = source.totalBoxes;
      source.outerPackagingCount = filteredPallets.length;
      source.innerPackageCount = source.totalBoxes;
      source.grossWeightKg = toExactWeight(filteredPallets.reduce((s, p) => s + (p.grossWeightKg || 0), 0));
      source.netWeightKg = toExactWeight(filteredPallets.reduce((s, p) => s + (p.netWeightKg || 0), 0));
      source.containers = autoAllocate20GPContainers(filteredPallets, [], '', '');
      source.tareWeightKg = source.containers.reduce((sum, c) => sum + (c.tareWeightKg || 2150), 0);
      source.volumeCbm = Number((filteredPallets.length * 1.15).toFixed(2));
    }

    source.sourceLedgerIds = [entry.id];
    source.selectedPalletIds = availableStockPallets.map((p) => p.id);
    source.isDispatched = false;
    return source;
  }

  // Multi-invoice or synthesized fallback:
  const allPallets: PalletStockUnit[] = [];
  const sourceLedgerIds: string[] = [];
  const selectedPalletIds: string[] = [];

  selections.forEach(({ entry, palletIds }) => {
    sourceLedgerIds.push(entry.id);
    const availableUnits = (entry.pallets || []).filter((p) => p.status === 'IN_WAREHOUSE');
    const toInclude = palletIds && palletIds.length > 0
      ? availableUnits.filter((p) => palletIds.includes(p.id))
      : availableUnits;
    toInclude.forEach((p) => {
      allPallets.push(p);
      selectedPalletIds.push(p.id);
    });
  });

  const firstEntry = selections[0].entry;
  const customerName = firstEntry.customer || 'Consignee';
  const destinationPort = firstEntry.pod || '';
  const exporterShipper = firstEntry.exporterShipper || '';

  const shipment = buildShipmentFromStockPallets(allPallets, customerName, destinationPort, exporterShipper);

  const invoiceNumbers = Array.from(new Set(selections.map((s) => s.entry.customInvoiceNo).filter(Boolean)));
  if (invoiceNumbers.length > 0) {
    shipment.invoiceNumbers = invoiceNumbers;
    shipment.shipperReference = invoiceNumbers.join(', ');
  }
  shipment.uploadMode = invoiceNumbers.length > 1 ? 'MULTI_INVOICE' : 'SINGLE_INVOICE';
  shipment.sourceLedgerIds = sourceLedgerIds;
  shipment.selectedPalletIds = selectedPalletIds;
  shipment.isDispatched = false;

  return shipment;
}

/**
 * Closed-Loop Workspace Dispatch Execution (Sprint 6):
 * Deducts dispatched pallets/batteries from linked CFS Ledger rows,
 * updates balance counters, marks entries DONE/PARTIAL, and records STOCK-OUT movement logs.
 */
export function executeWorkspaceDispatch(
  shipment: ExtractedShipmentJSON,
  dispatchDetails: {
    containerNo: string;
    sealNo: string;
    shippingBillNo?: string;
    shippingBillDate?: string;
    stuffingDate?: string;
    portGateInDate?: string;
    vehicleNo?: string;
  }
): { updatedEntries: CFSLedgerEntry[]; stuffedCount: number } {
  const existing = getCFSLedgerEntries();
  const today = formatToDDMMYYYY(new Date());

  const targetPalletIds = new Set(shipment.selectedPalletIds || []);
  const targetInvoiceSet = new Set((shipment.invoiceNumbers || []).map((i) => i.trim().toUpperCase()));
  const targetLedgerIdSet = new Set(shipment.sourceLedgerIds || []);

  const affectedEntries: CFSLedgerEntry[] = [];
  let totalStuffedCount = 0;

  const updatedEntries = existing.map((entry) => {
    const isTargetLedger = targetLedgerIdSet.has(entry.id);
    const isTargetInvoice = targetInvoiceSet.has(entry.customInvoiceNo.trim().toUpperCase());
    if (!isTargetLedger && !isTargetInvoice) return entry;

    let newlyStuffedPallets = 0;
    let newlyStuffedBatteries = 0;
    const newlyStuffedPalletIds: string[] = [];

    const updatedPallets = (entry.pallets || []).map((p) => {
      const isMatch = targetPalletIds.size > 0
        ? targetPalletIds.has(p.id)
        : p.status === 'IN_WAREHOUSE';

      if (isMatch && p.status !== 'STUFFED_DISPATCHED') {
        newlyStuffedPallets += 1;
        newlyStuffedBatteries += (p.receivedBatteries || p.invoicedBatteries || 0);
        newlyStuffedPalletIds.push(p.id);
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

    const currentDispatched = new Set(entry.dispatchedPalletIds || []);
    newlyStuffedPalletIds.forEach((id) => currentDispatched.add(id));

    const updated = recomputeCFSDerivedFields({
      ...entry,
      updatedAt: new Date().toISOString(),
      dispatchedAt: new Date().toISOString(),
      actualStuffedPallets: (entry.actualStuffedPallets || 0) + newlyStuffedPallets,
      actualStuffedBatteries: (entry.actualStuffedBatteries || 0) + newlyStuffedBatteries,
      containerNo: dispatchDetails.containerNo || entry.containerNo,
      sealNo: dispatchDetails.sealNo || entry.sealNo,
      shippingBillNo: dispatchDetails.shippingBillNo || entry.shippingBillNo,
      shippingBillDate: dispatchDetails.shippingBillDate || entry.shippingBillDate,
      stuffingDate: dispatchDetails.stuffingDate || entry.stuffingDate || today,
      portGateInDate: dispatchDetails.portGateInDate || entry.portGateInDate || today,
      vehicleNo: dispatchDetails.vehicleNo || entry.vehicleNo,
      pallets: updatedPallets,
      dispatchedPalletIds: Array.from(currentDispatched)
    });

    // Record movement log
    if (newlyStuffedPallets > 0) {
      const grossKg = newlyStuffedPalletIds.length > 0
        ? toExactWeight(updatedPallets.filter((p) => newlyStuffedPalletIds.includes(p.id)).reduce((s, p) => s + (p.grossWeightKg || 0), 0))
        : (entry.invoicedPallets > 0 ? toExactWeight((entry.invoicedGrossWeightKg / entry.invoicedPallets) * newlyStuffedPallets) : 0);

      recordMovementLog({
        receivedDate: entry.cartingInDate || entry.truckReportingDate || entry.lastPltRecdDate || today,
        dispatchedDate: dispatchDetails.stuffingDate || today,
        status: updated.balancePallets === 0 ? 'DISPATCHED' : 'PARTIAL_DISPATCHED',
        movementDate: dispatchDetails.stuffingDate || today,
        direction: 'STOCK_OUT',
        customer: entry.customer,
        customInvoiceNo: entry.customInvoiceNo,
        modelDescription: (entry.pallets || []).map((p) => p.model).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') || '-',
        pallets: newlyStuffedPallets,
        batteries: newlyStuffedBatteries,
        grossWeightKg: grossKg,
        containerNo: dispatchDetails.containerNo,
        sealNo: dispatchDetails.sealNo,
        shippingBillNo: dispatchDetails.shippingBillNo || entry.shippingBillNo,
        shippingBillDate: dispatchDetails.shippingBillDate || entry.shippingBillDate,
        vehicleNo: dispatchDetails.vehicleNo || entry.vehicleNo,
        remainingBalancePallets: updated.balancePallets,
        remainingBalanceBatteries: updated.balanceBatteries,
        remarks: updated.balancePallets === 0 ? 'Full Dispatch (Stock-Out)' : 'Partial Dispatch'
      });
    }

    affectedEntries.push(updated);
    return updated;
  });

  // Closed-loop shortfall lifecycle fulfillment:
  // If any newly dispatched entry arrived as a SHORT_FILL, mark the corresponding prior shortfall as FULFILLED
  affectedEntries.forEach((entry) => {
    if (entry.shortFillLinks && entry.shortFillLinks.length > 0) {
      entry.shortFillLinks.forEach((link) => {
        const priorIdx = updatedEntries.findIndex(
          (e) => (link.priorShortfallLedgerId && e.id === link.priorShortfallLedgerId) ||
                 (e.customInvoiceNo && e.customInvoiceNo.trim().toUpperCase() === link.priorShortfallInvoiceNo.trim().toUpperCase())
        );

        if (priorIdx !== -1) {
          const prior = updatedEntries[priorIdx];
          const updatedShortfalls = (prior.shortfalls || []).map((sf) => {
            const matchesPallet = !link.palletNumber || String(sf.palletNumber).trim() === String(link.palletNumber).trim();
            if (matchesPallet) {
              const updatedLinks = (sf.linkedShortFills || []).map((lsf) => {
                if (lsf.shortFillInvoiceNo.trim().toUpperCase() === entry.customInvoiceNo.trim().toUpperCase()) {
                  return {
                    ...lsf,
                    dispatched: true,
                    dispatchedDate: dispatchDetails.stuffingDate || today,
                    dispatchContainerNo: dispatchDetails.containerNo
                  };
                }
                return lsf;
              });

              return {
                ...sf,
                status: 'FULFILLED' as const,
                fulfilledDate: dispatchDetails.stuffingDate || today,
                fulfilledMonth: entry.month || today,
                fulfilledContainerNo: dispatchDetails.containerNo,
                linkedShortFills: updatedLinks
              };
            }
            return sf;
          });

          const priorUpdated = {
            ...prior,
            shortfalls: updatedShortfalls,
            updatedAt: new Date().toISOString()
          };
          updatedEntries[priorIdx] = priorUpdated;
          if (!affectedEntries.some((e) => e.id === priorUpdated.id)) {
            affectedEntries.push(priorUpdated);
          }
        }
      });
    }
  });

  saveCFSLedgerEntries(updatedEntries);
  affectedEntries.forEach((e) => syncEntryToCloud(e));
  return { updatedEntries: affectedEntries, stuffedCount: totalStuffedCount };
}

/**
 * 1-Click Multi-Tab Unified 25-Column Master Report Export (.xlsx)
 * Consolidates CFS Stock and Carting into a single master sheet with zero row loss.
 * Includes Grouped 2-Row Headers and Live Excel Formulas (=F3-L3, =G3-M3, =+L3-P3, =+M3-Q3)
 */
export function exportCFSMasterReportXlsx(entries: CFSLedgerEntry[], targetMonth: CFSMonth = 'ALL'): void {
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

    // Row 1: Merged Group Headers (25 Columns)
    wsData.push([
      'Shipment Identity', '', '', '', '', // 1-5 (A-E)
      'EIL Invoiced Qty', '',             // 6-7 (F-G)
      'Gate-In & Carting Details', '', '', '', '', '', // 8-13 (H-M)
      'Factory Shortfall', '',            // 14-15 (N-O)
      'Dispatch & Stuffing', '', '', '', '', '', // 16-21 (P-U)
      'Live Balance & Ageing', '', '', '' // 22-25 (V-Y)
    ]);

    // Row 2: Detailed 25 Columns
    wsData.push([
      'Sr. No.',                      // 1 (A)
      'Custom Invoice No.',           // 2 (B)
      'Invoice Date',                 // 3 (C)
      'Customer / Buyer',             // 4 (D)
      'Destination / POD',            // 5 (E)
      'Invoiced Pallets',             // 6 (F)
      'Invoiced Batteries',           // 7 (G)
      'Truck Reporting Date',         // 8 (H)
      'Carting In Date',              // 9 (I)
      'Vehicle / Truck No.',          // 10 (J)
      'Carting Slip / Gate Pass No.', // 11 (K)
      'Actual Received Pallets',      // 12 (L)
      'Actual Received Batteries',    // 13 (M)
      'Shortfall Pallets',            // 14 (N = F - L)
      'Shortfall Batteries',          // 15 (O = G - M)
      'Stuffed Pallets',              // 16 (P)
      'Stuffed Batteries',            // 17 (Q)
      'Stuffing Date',                // 18 (R)
      'Container No.',                // 19 (S)
      'Seal No.',                     // 20 (T)
      'Shipping Bill No. & Date',     // 21 (U)
      'Balance Pallets',              // 22 (V = L - P)
      'Balance Batteries',            // 23 (W = M - Q)
      'Days in CFS',                  // 24 (X)
      'Remarks'                       // 25 (Y)
    ]);

    // Row 3+: Data Rows with Live Formulas (Every unique row is preserved intact)
    rows.forEach((e, idx) => {
      const r = idx + 3; // 1-based Excel row number
      const invoiceDate = e.invoiceDate || (e.createdAt ? formatToDDMMYYYY(new Date(e.createdAt)) : '');
      const truckDate = e.truckReportingDate || e.lastPltRecdDate || e.cartingInDate || '';
      const slipNo = e.cartingSlipNo || e.gateInStatus || '';
      const sbSummary = [e.shippingBillNo, e.shippingBillDate].filter(Boolean).join(' / ');
      const combinedRemarks = [e.remarks, e.unloadingRemarks].filter(Boolean).join(' | ');

      wsData.push([
        idx + 1,                                       // 1: Sr. No.
        e.customInvoiceNo || '',                       // 2: Custom Invoice No.
        invoiceDate,                                   // 3: Invoice Date
        e.customer || '',                              // 4: Customer / Buyer
        e.pod || '',                                   // 5: Destination / POD
        e.invoicedPallets || 0,                        // 6: Invoiced Pallets
        e.invoicedBatteries || 0,                      // 7: Invoiced Batteries
        truckDate,                                     // 8: Truck Reporting Date
        e.cartingInDate || '',                         // 9: Carting In Date
        e.vehicleNo || '',                             // 10: Vehicle / Truck No.
        slipNo,                                        // 11: Carting Slip / Gate Pass No.
        e.actualReceivedPallets || 0,                  // 12: Actual Received Pallets
        e.actualReceivedBatteries || 0,                // 13: Actual Received Batteries
        { f: `F${r}-L${r}` },                          // 14: Shortfall Pallets formula
        { f: `G${r}-M${r}` },                          // 15: Shortfall Batteries formula
        e.actualStuffedPallets || 0,                   // 16: Stuffed Pallets
        e.actualStuffedBatteries || 0,                 // 17: Stuffed Batteries
        e.stuffingDate || '',                          // 18: Stuffing Date
        e.containerNo || '',                           // 19: Container No.
        e.sealNo || '',                                // 20: Seal No.
        sbSummary,                                     // 21: Shipping Bill No. & Date
        { f: `+L${r}-P${r}` },                         // 22: Balance Pallets formula
        { f: `+M${r}-Q${r}` },                         // 23: Balance Batteries formula
        e.daysInCFS || 0,                              // 24: Days in CFS
        combinedRemarks                                // 25: Remarks
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Apply header merges (25 columns)
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },  // 1-5: Shipment Identity (A-E)
      { s: { r: 0, c: 5 }, e: { r: 0, c: 6 } },  // 6-7: EIL Invoiced Qty (F-G)
      { s: { r: 0, c: 7 }, e: { r: 0, c: 12 } }, // 8-13: Gate-In & Carting Details (H-M)
      { s: { r: 0, c: 13 }, e: { r: 0, c: 14 } },// 14-15: Factory Shortfall (N-O)
      { s: { r: 0, c: 15 }, e: { r: 0, c: 20 } },// 16-21: Dispatch & Stuffing (P-U)
      { s: { r: 0, c: 21 }, e: { r: 0, c: 24 } } // 22-25: Live Balance & Ageing (V-Y)
    ];

    // Set 25 column widths
    ws['!cols'] = [
      { wch: 8 },  // 1: Sr. No.
      { wch: 20 }, // 2: Custom Invoice No.
      { wch: 14 }, // 3: Invoice Date
      { wch: 26 }, // 4: Customer / Buyer
      { wch: 16 }, // 5: Destination / POD
      { wch: 14 }, // 6: Invoiced Pallets
      { wch: 16 }, // 7: Invoiced Batteries
      { wch: 16 }, // 8: Truck Reporting Date
      { wch: 16 }, // 9: Carting In Date
      { wch: 18 }, // 10: Vehicle / Truck No.
      { wch: 22 }, // 11: Carting Slip / Gate Pass No.
      { wch: 16 }, // 12: Actual Received Pallets
      { wch: 16 }, // 13: Actual Received Batteries
      { wch: 15 }, // 14: Shortfall Pallets
      { wch: 15 }, // 15: Shortfall Batteries
      { wch: 14 }, // 16: Stuffed Pallets
      { wch: 16 }, // 17: Stuffed Batteries
      { wch: 14 }, // 18: Stuffing Date
      { wch: 16 }, // 19: Container No.
      { wch: 14 }, // 20: Seal No.
      { wch: 24 }, // 21: Shipping Bill No. & Date
      { wch: 15 }, // 22: Balance Pallets
      { wch: 16 }, // 23: Balance Batteries
      { wch: 12 }, // 24: Days in CFS
      { wch: 24 }  // 25: Remarks
    ];

    return ws;
  };

  // If ALL selected, prepend Master All sheet
  if (targetMonth === 'ALL') {
    const masterWs = buildSheetForRows(entries);
    XLSX.utils.book_append_sheet(wb, masterWs, 'MASTER REPORT ALL');
  }

  // Add individual month sheets
  monthsToExport.forEach((month) => {
    const monthRows = entries.filter((e) => (e.month || '').toUpperCase() === month.toUpperCase());
    const sheetTitle = `CFS ${month}`;
    const ws = buildSheetForRows(monthRows.length > 0 ? monthRows : entries);
    XLSX.utils.book_append_sheet(wb, ws, sheetTitle.slice(0, 31));
  });

  const timestamp = formatToDDMMYYYY(new Date()).replace(/\./g, '-');
  XLSX.writeFile(wb, `CFS_Unified_Master_Report_${targetMonth}_${timestamp}.xlsx`);
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
    const raw = localStorage.getItem(CFS_MOVEMENT_LOGS_STORAGE_KEY) || localStorage.getItem(LEGACY_CFS_MOVEMENT_LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export const getCFSMovementLogs = getPersistedMovementLogs;

export function savePersistedMovementLogs(records: InventoryMovementRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    const json = JSON.stringify(records);
    localStorage.setItem(CFS_MOVEMENT_LOGS_STORAGE_KEY, json);
    localStorage.setItem(LEGACY_CFS_MOVEMENT_LOGS_KEY, json);
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
  syncMovementLogToCloud(newRecord);
  return newRecord;
}

export const CFS_DELETED_LOGS_STORAGE_KEY = 'ekdant_cfs_deleted_logs_v1';

export function getDeletedMovementLogIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CFS_DELETED_LOGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveDeletedMovementLogIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CFS_DELETED_LOGS_STORAGE_KEY, JSON.stringify(ids));
  } catch (err) {
    console.error('Failed to save deleted log ids to localStorage:', err);
  }
}

export function deleteMovementLog(logId: string): void {
  // 1. Delete from persisted logs if present
  const persisted = getPersistedMovementLogs();
  const filteredPersisted = persisted.filter((l) => l.id !== logId);
  savePersistedMovementLogs(filteredPersisted);
  deleteMovementLogFromCloud(logId);

  // 2. Add to deleted log IDs set
  const deleted = getDeletedMovementLogIds();
  if (!deleted.includes(logId)) {
    saveDeletedMovementLogIds([...deleted, logId]);
  }

  // 3. If it is a derived log (id starts with 'log_'), delete the underlying CFS ledger entry
  if (logId.startsWith('log_')) {
    const entryId = logId.replace(/^log_/, '');
    deleteCFSEntry(entryId);
  }
}

export function getDerivedInventoryMovements(entries: CFSLedgerEntry[]): InventoryMovementRecord[] {
  const derived: InventoryMovementRecord[] = [];
  const deletedIds = new Set(getDeletedMovementLogIds());

  entries.forEach((e) => {
    const logId = `log_${e.id}`;
    if (deletedIds.has(logId)) return;

    const modelDesc = (e.pallets || [])
      .map((p) => p.model)
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(', ') || '-';

    const recPallets = e.actualReceivedPallets || e.invoicedPallets || 0;
    const recBatteries = e.actualReceivedBatteries || e.invoicedBatteries || 0;
    const isDispatched = (e.actualStuffedPallets || 0) > 0 || Boolean(e.containerNo && e.containerNo.trim() !== '');
    const isFullyDispatched = isDispatched && (e.balancePallets === 0);
    const isPartialDispatched = isDispatched && (e.balancePallets > 0);

    const status: InventoryMovementStatus = isFullyDispatched
      ? 'DISPATCHED'
      : isPartialDispatched
      ? 'PARTIAL_DISPATCHED'
      : 'IN_STOCK';

    const receivedDate = e.cartingInDate || e.truckReportingDate || e.lastPltRecdDate || formatToDDMMYYYY(e.createdAt);
    const dispatchedDate = isDispatched
      ? (e.stuffingDate || e.portGateInDate || e.pickupDate || receivedDate)
      : '-';

    derived.push({
      id: logId,
      sourceLedgerId: e.id,
      receivedDate,
      dispatchedDate,
      movementDate: receivedDate,
      status,
      direction: isDispatched ? 'STOCK_OUT' : 'STOCK_IN',
      customer: e.customer || 'Customer',
      customInvoiceNo: e.customInvoiceNo,
      modelDescription: modelDesc,
      pallets: recPallets,
      batteries: recBatteries,
      grossWeightKg: e.invoicedGrossWeightKg || 0,
      containerNo: e.containerNo || '-',
      sealNo: e.sealNo || '-',
      shippingBillNo: e.shippingBillNo || '-',
      shippingBillDate: e.shippingBillDate || '-',
      vehicleNo: e.vehicleNo || '-',
      remainingBalancePallets: e.balancePallets ?? 0,
      remainingBalanceBatteries: e.balanceBatteries ?? 0,
      createdAt: e.updatedAt || e.dispatchedAt || e.createdAt || new Date().toISOString(),
      remarks: e.remarks || (isFullyDispatched ? 'Dispatched' : isPartialDispatched ? 'Partial Dispatched' : 'In Stock')
    });
  });

  const persisted = getPersistedMovementLogs().filter((r) => !deletedIds.has(r.id));
  
  // Deduplicate: If an invoice is live in derived, avoid duplicate records from persisted
  const derivedInvoiceSet = new Set(derived.map((d) => d.customInvoiceNo.trim().toUpperCase()));
  const extraPersisted = persisted.filter(
    (p) => !derivedInvoiceSet.has(p.customInvoiceNo.trim().toUpperCase())
  );
  const combined = [...derived, ...extraPersisted];

  function parseLogTimestamp(record: InventoryMovementRecord): number {
    if (record.createdAt) {
      const t = new Date(record.createdAt).getTime();
      if (!isNaN(t) && t > 100000) return t;
    }
    const dateStr = (record.dispatchedDate && record.dispatchedDate !== '-')
      ? record.dispatchedDate
      : (record.receivedDate || record.movementDate || '');
    if (dateStr) {
      const parts = dateStr.split(/[./-]/);
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
          return new Date(year, month - 1, day).getTime();
        }
      }
    }
    return 0;
  }

  // Sort latest on top, oldest at the bottom
  const sorted = combined.sort((a, b) => {
    const tA = parseLogTimestamp(a);
    const tB = parseLogTimestamp(b);
    if (tB !== tA) return tB - tA;
    // Dispatched transactions have precedence
    if (a.status === 'DISPATCHED' && b.status !== 'DISPATCHED') return -1;
    if (b.status === 'DISPATCHED' && a.status !== 'DISPATCHED') return 1;
    return 0;
  });

  // Secondary deduplication guard by invoice number and container number
  const seenKeys = new Set<string>();
  const deduplicated: InventoryMovementRecord[] = [];
  for (const record of sorted) {
    const key = `${record.customInvoiceNo.trim().toUpperCase()}__${(record.containerNo || '-').trim().toUpperCase()}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      deduplicated.push(record);
    }
  }

  return deduplicated;
}

export function exportCFSMovementLogsXlsx(records: InventoryMovementRecord[]): void {
  const rows = records.map((r) => ({
    'Received Date': r.receivedDate || r.movementDate || '-',
    'Dispatched Date': r.dispatchedDate || '-',
    'Status': r.status === 'DISPATCHED' ? 'Dispatched' : r.status === 'PARTIAL_DISPATCHED' ? 'Partial Dispatched' : 'In Stock',
    'Customer / Consignee': r.customer,
    'Custom Invoice No.': r.customInvoiceNo,
    'Model / Description': r.modelDescription,
    'Pallets': r.pallets,
    'Units': r.batteries,
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
    { wch: 15 },
    { wch: 15 },
    { wch: 16 },
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
  XLSX.writeFile(wb, `CFS_Inventory_Logs_${today}.xlsx`);
}

// =========================================================================
// Sprint 7: Stale-While-Revalidate Cloud Hydration & Backup / Restore Engine
// =========================================================================

export async function hydrateInventoryFromSupabase(): Promise<{
  entries: CFSLedgerEntry[];
  logs: InventoryMovementRecord[];
}> {
  if (!supabase || !isSupabaseConfigured()) {
    updateSyncStatus('local');
    return {
      entries: getCFSLedgerEntries(),
      logs: getPersistedMovementLogs()
    };
  }

  try {
    updateSyncStatus('syncing');

    // 1. Fetch cloud ledger entries & movement logs concurrently
    const [ledgerRes, logsRes] = await Promise.all([
      supabase.from('cfs_inventory_ledger').select('*'),
      supabase.from('cfs_movement_logs').select('*')
    ]);

    if (ledgerRes.error || logsRes.error) {
      console.warn('[Supabase] Hydration fetch error:', ledgerRes.error || logsRes.error);
      updateSyncStatus('error');
      return {
        entries: getCFSLedgerEntries(),
        logs: getPersistedMovementLogs()
      };
    }

    const localEntries = getCFSLedgerEntries();
    const localMap = new Map<string, CFSLedgerEntry>();
    localEntries.forEach((e) => localMap.set(e.id, e));

    // Merge cloud entries: if present in cloud, merge with payload
    if (Array.isArray(ledgerRes.data)) {
      ledgerRes.data.forEach((row: any) => {
        if (!row.id || !row.payload) return;
        const cloudEntry = row.payload as CFSLedgerEntry;
        const local = localMap.get(row.id);
        if (!local) {
          localMap.set(row.id, recomputeCFSDerivedFields(cloudEntry));
        } else {
          const cloudTime = new Date(row.updated_at || cloudEntry.updatedAt || cloudEntry.createdAt || 0).getTime();
          const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
          if (cloudTime > localTime) {
            localMap.set(row.id, recomputeCFSDerivedFields({ ...local, ...cloudEntry }));
          }
        }
      });
    }

    const mergedEntries = Array.from(localMap.values());
    saveCFSLedgerEntries(mergedEntries);

    // Merge movement logs
    const localLogs = getPersistedMovementLogs();
    const logMap = new Map<string, InventoryMovementRecord>();
    localLogs.forEach((l) => logMap.set(l.id, l));

    if (Array.isArray(logsRes.data)) {
      logsRes.data.forEach((row: any) => {
        if (!row.id || !row.payload) return;
        const cloudLog = row.payload as InventoryMovementRecord;
        if (!logMap.has(row.id)) {
          logMap.set(row.id, cloudLog);
        }
      });
    }

    const mergedLogs = Array.from(logMap.values());
    savePersistedMovementLogs(mergedLogs);

    updateSyncStatus('synced');
    return {
      entries: mergedEntries,
      logs: mergedLogs
    };
  } catch (err) {
    console.warn('[Supabase] Hydration caught error:', err);
    updateSyncStatus('error');
    return {
      entries: getCFSLedgerEntries(),
      logs: getPersistedMovementLogs()
    };
  }
}

export function exportInventoryBackupJson(): void {
  if (typeof window === 'undefined') return;
  const data = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    ledgerEntries: getCFSLedgerEntries(),
    movementLogs: getPersistedMovementLogs(),
    deletedLogIds: getDeletedMovementLogIds()
  };
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ekdant_warehouse_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importInventoryBackupJson(jsonString: string): Promise<{
  success: boolean;
  entriesCount?: number;
  logsCount?: number;
  error?: string;
}> {
  try {
    const data = JSON.parse(jsonString);
    if (!data || (!Array.isArray(data.ledgerEntries) && !Array.isArray(data.movementLogs))) {
      return { success: false, error: 'Invalid backup format. Expected ledgerEntries or movementLogs.' };
    }

    let entriesCount = 0;
    if (Array.isArray(data.ledgerEntries)) {
      const validEntries: CFSLedgerEntry[] = data.ledgerEntries.map((e: any) => recomputeCFSDerivedFields(e));
      saveCFSLedgerEntries(validEntries);
      entriesCount = validEntries.length;
      validEntries.forEach((entry) => syncEntryToCloud(entry));
    }

    let logsCount = 0;
    if (Array.isArray(data.movementLogs)) {
      savePersistedMovementLogs(data.movementLogs);
      logsCount = data.movementLogs.length;
      data.movementLogs.forEach((log: any) => syncMovementLogToCloud(log));
    }

    if (Array.isArray(data.deletedLogIds)) {
      saveDeletedMovementLogIds(data.deletedLogIds);
    }

    return { success: true, entriesCount, logsCount };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to parse JSON backup' };
  }
}

// Alias for closed-loop workspace dispatch deduction
export const deductInventoryOnDispatch = executeWorkspaceDispatch;

// =========================================================================
// Sprint 7.1: Manual Inward, Shortfall (PALLET vs UNITS) & Multi-Short-Fill
// =========================================================================

export interface ManualInwardShortfallInput {
  mode: ShortfallMode; // 'PALLET' | 'UNITS'
  palletNumber: string | number;
  billedUnits: number;
  shortfallUnits: number;
}

export interface ManualInwardShortFillInput {
  priorShortfallInvoiceNo: string;
  priorShortfallLedgerId?: string;
  palletNumber?: string | number;
  arrivedPalletNumber?: string | number;
  unitsFilled: number;
  regularUnits?: number;
}

export interface RecordManualInwardParams {
  customer: string;
  exporterShipper?: string;
  customInvoiceNo: string;
  invoiceDate?: string;
  pod?: string;
  receiptMode: ReceiptMode; // 'RECEIVED_FULL' | 'SHORT_FALL' | 'SHORT_FILL'
  invoicedPallets: number;
  invoicedBatteries: number;
  invoicedGrossWeightKg: number;
  invoicedNetWeightKg?: number;
  actualGrossWeightKg?: number;
  actualNetWeightKg?: number;
  cartingInDate?: string;
  vehicleNo?: string;
  truckReportingDate?: string;
  pallets?: {
    palletNumber: number | string;
    model: string;
    brand?: string;
    invoicedBatteries: number;
    receivedBatteries?: number;
    grossWeightKg?: number;
    netWeightKg?: number;
  }[];
  shortfallInputs?: ManualInwardShortfallInput[];
  shortFillInputs?: ManualInwardShortFillInput[];
  month?: string;
  remarks?: string;
}

/**
 * Records a manual stock-inward with exact weights, shortfall handling, or short-fill reconciliation.
 */
export function recordManualInward(params: RecordManualInwardParams): CFSLedgerEntry {
  const today = formatToDDMMYYYY(new Date());
  const entryMonth = params.month || getMonthFromDate(params.cartingInDate || params.truckReportingDate || new Date());
  const entryId = `cfs_inw_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const invoicedGrossKg = toExactWeight(params.invoicedGrossWeightKg);
  const invoicedNetKg = params.invoicedNetWeightKg !== undefined ? toExactWeight(params.invoicedNetWeightKg) : undefined;
  const actualGrossKg = params.actualGrossWeightKg !== undefined ? toExactWeight(params.actualGrossWeightKg) : invoicedGrossKg;
  const actualNetKg = params.actualNetWeightKg !== undefined ? toExactWeight(params.actualNetWeightKg) : invoicedNetKg;

  // Synthesize or map pallets
  let rawPallets = params.pallets && params.pallets.length > 0 ? params.pallets : [];
  if (rawPallets.length === 0 && params.invoicedPallets > 0) {
    const avgUnits = Math.floor(params.invoicedBatteries / params.invoicedPallets);
    const unitRemainder = params.invoicedBatteries - (avgUnits * params.invoicedPallets);
    const avgGross = invoicedGrossKg > 0 ? invoicedGrossKg / params.invoicedPallets : 0;
    const avgNet = (invoicedNetKg || 0) > 0 ? (invoicedNetKg! / params.invoicedPallets) : 0;

    for (let i = 1; i <= params.invoicedPallets; i++) {
      const units = i === params.invoicedPallets ? avgUnits + unitRemainder : avgUnits;
      rawPallets.push({
        palletNumber: i,
        model: 'STANDARD',
        invoicedBatteries: units,
        receivedBatteries: units,
        grossWeightKg: toExactWeight(avgGross),
        netWeightKg: toExactWeight(avgNet)
      });
    }
  }

  // Pre-resolve proportional decimal weights across raw pallets with exact remainder balancing (0.00 kg drift)
  const totalPalletUnits = rawPallets.reduce((sum, p) => sum + (p.invoicedBatteries || 0), 0);
  let accumulatedGross = 0;
  let accumulatedNet = 0;

  const resolvedRawPallets = rawPallets.map((p, idx) => {
    const isLast = idx === rawPallets.length - 1;
    let palletGross: number;
    let palletNet: number;

    if (p.grossWeightKg !== undefined) {
      palletGross = toExactWeight(p.grossWeightKg);
    } else {
      if (isLast) {
        palletGross = toExactWeight(Math.max(0, invoicedGrossKg - accumulatedGross));
      } else {
        const ratio = totalPalletUnits > 0 ? (p.invoicedBatteries || 0) / totalPalletUnits : (1 / (rawPallets.length || 1));
        palletGross = toExactWeight(invoicedGrossKg * ratio);
        accumulatedGross = toExactWeight(accumulatedGross + palletGross);
      }
    }

    if (p.netWeightKg !== undefined) {
      palletNet = toExactWeight(p.netWeightKg);
    } else if (invoicedNetKg !== undefined) {
      if (isLast) {
        palletNet = toExactWeight(Math.max(0, invoicedNetKg - accumulatedNet));
      } else {
        const ratio = totalPalletUnits > 0 ? (p.invoicedBatteries || 0) / totalPalletUnits : (1 / (rawPallets.length || 1));
        palletNet = toExactWeight(invoicedNetKg * ratio);
        accumulatedNet = toExactWeight(accumulatedNet + palletNet);
      }
    } else {
      palletNet = 0;
    }

    return {
      ...p,
      grossWeightKg: palletGross,
      netWeightKg: palletNet
    };
  });

  let finalPalletUnits: PalletStockUnit[] = [];
  const shortfallRecords: ShortfallRecord[] = [];
  let totalShortfallPallets = 0;
  let totalShortfallBatteries = 0;

  if (params.receiptMode === 'RECEIVED_FULL') {
    finalPalletUnits = resolvedRawPallets.map((p, idx) => ({
      id: `plt-${params.customInvoiceNo}-${p.palletNumber || idx + 1}-${Date.now()}-${idx}`,
      palletNumber: p.palletNumber || idx + 1,
      model: p.model || 'STANDARD',
      brand: p.brand || '',
      invoicedBatteries: p.invoicedBatteries,
      receivedBatteries: p.receivedBatteries ?? p.invoicedBatteries,
      remainingUnits: p.receivedBatteries ?? p.invoicedBatteries,
      grossWeightKg: p.grossWeightKg,
      netWeightKg: p.netWeightKg,
      status: 'IN_WAREHOUSE' as const,
      invoiceNumber: params.customInvoiceNo
    }));
  } else if (params.receiptMode === 'SHORT_FALL') {
    const shortfallInputs = params.shortfallInputs || [];
    const shortfallByPallet = new Map<string, ManualInwardShortfallInput>();
    shortfallInputs.forEach((sf) => shortfallByPallet.set(String(sf.palletNumber).trim(), sf));

    finalPalletUnits = resolvedRawPallets.map((p, idx) => {
      const pNumStr = String(p.palletNumber || idx + 1).trim();
      const sf = shortfallByPallet.get(pNumStr);
      const palletId = `plt-${params.customInvoiceNo}-${pNumStr}-${Date.now()}-${idx}`;
      const origGross = p.grossWeightKg;
      const origNet = p.netWeightKg;

      if (!sf) {
        // Pallet arrived in full
        return {
          id: palletId,
          palletNumber: p.palletNumber || idx + 1,
          model: p.model || 'STANDARD',
          brand: p.brand || '',
          invoicedBatteries: p.invoicedBatteries,
          receivedBatteries: p.invoicedBatteries,
          remainingUnits: p.invoicedBatteries,
          grossWeightKg: origGross,
          netWeightKg: origNet,
          status: 'IN_WAREHOUSE' as const,
          invoiceNumber: params.customInvoiceNo
        };
      }

      if (sf.mode === 'PALLET') {
        // Entire pallet missing: 0 units, 0 weight on floor
        // Use exact shortfallUnits entered on the row (zero hardcoded defaults)
        const sfUnits = sf.shortfallUnits || sf.billedUnits || p.invoicedBatteries;
        totalShortfallPallets += 1;
        totalShortfallBatteries += sfUnits;
        shortfallRecords.push({
          id: `sf-${params.customInvoiceNo}-${pNumStr}-${Date.now()}`,
          mode: 'PALLET',
          palletNumber: p.palletNumber || idx + 1,
          billedUnits: sfUnits,
          shortfallUnits: sfUnits,
          remainingShortfallUnits: sfUnits,
          openedDate: today,
          openedMonth: entryMonth,
          status: 'OPEN',
          linkedShortFills: []
        });

        return {
          id: palletId,
          palletNumber: p.palletNumber || idx + 1,
          model: p.model || 'STANDARD',
          brand: p.brand || '',
          invoicedBatteries: sfUnits,
          receivedBatteries: 0,
          remainingUnits: 0,
          grossWeightKg: 0,
          netWeightKg: 0,
          status: 'PENDING_GATE_IN' as const,
          invoiceNumber: params.customInvoiceNo
        };
      } else {
        // UNITS shortfall: partial units arrived
        const sfUnits = Math.min(sf.shortfallUnits, p.invoicedBatteries);
        const recUnits = Math.max(0, p.invoicedBatteries - sfUnits);
        totalShortfallBatteries += sfUnits;

        const pGross = recUnits > 0 && p.invoicedBatteries > 0 ? toExactWeight((origGross / p.invoicedBatteries) * recUnits) : 0;
        const pNet = recUnits > 0 && p.invoicedBatteries > 0 ? toExactWeight((origNet / p.invoicedBatteries) * recUnits) : 0;

        shortfallRecords.push({
          id: `sf-${params.customInvoiceNo}-${pNumStr}-${Date.now()}`,
          mode: 'UNITS',
          palletNumber: p.palletNumber || idx + 1,
          billedUnits: sf.billedUnits || p.invoicedBatteries,
          shortfallUnits: sfUnits,
          remainingShortfallUnits: sfUnits,
          openedDate: today,
          openedMonth: entryMonth,
          status: 'OPEN',
          linkedShortFills: []
        });

        return {
          id: palletId,
          palletNumber: p.palletNumber || idx + 1,
          model: p.model || 'STANDARD',
          brand: p.brand || '',
          invoicedBatteries: p.invoicedBatteries,
          receivedBatteries: recUnits,
          remainingUnits: recUnits,
          grossWeightKg: pGross,
          netWeightKg: pNet,
          status: recUnits > 0 ? ('IN_WAREHOUSE' as const) : ('PENDING_GATE_IN' as const),
          invoiceNumber: params.customInvoiceNo
        };
      }
    });
  } else if (params.receiptMode === 'SHORT_FILL') {
    // Process short fill links against prior shortfall entries (multi-row sequential safe)
    const shortFillInputs = params.shortFillInputs || [];

    shortFillInputs.forEach((sfi) => {
      const allLedger = getCFSLedgerEntries();
      const priorEntry = allLedger.find(
        (e) => (sfi.priorShortfallLedgerId && e.id === sfi.priorShortfallLedgerId) ||
               (e.customInvoiceNo && e.customInvoiceNo.trim().toUpperCase() === sfi.priorShortfallInvoiceNo.trim().toUpperCase())
      );

      if (priorEntry && priorEntry.shortfalls && priorEntry.shortfalls.length > 0) {
        let unitsToAllocate = sfi.unitsFilled;
        const updatedShortfalls = priorEntry.shortfalls.map((sf) => {
          if (unitsToAllocate <= 0 || sf.status === 'CLEARED') return sf;
          const matchPallet = !sfi.palletNumber || String(sf.palletNumber).trim() === String(sfi.palletNumber).trim();
          if (!matchPallet) return sf;

          const fillAmt = Math.min(unitsToAllocate, sf.remainingShortfallUnits);
          unitsToAllocate -= fillAmt;
          const newRemaining = Math.max(0, sf.remainingShortfallUnits - fillAmt);
          const isCleared = newRemaining === 0;

          const linked: LinkedShortFill = {
            shortFillInvoiceNo: params.customInvoiceNo,
            shortFillLedgerId: entryId,
            palletNumber: sf.palletNumber,
            arrivedPalletNumber: sfi.arrivedPalletNumber,
            unitsFilled: fillAmt,
            filledDate: today,
            filledMonth: entryMonth
          };

          return {
            ...sf,
            remainingShortfallUnits: newRemaining,
            status: isCleared ? ('CLEARED' as const) : ('PARTIAL_FILL' as const),
            clearedDate: isCleared ? today : sf.clearedDate,
            clearedMonth: isCleared ? entryMonth : sf.clearedMonth,
            linkedShortFills: [...(sf.linkedShortFills || []), linked]
          };
        });

        const remainingShortfallBatteries = updatedShortfalls.reduce((sum, sf) => sum + sf.remainingShortfallUnits, 0);
        const remainingShortfallPallets = updatedShortfalls.filter((sf) => sf.mode === 'PALLET' && sf.status !== 'CLEARED').length;

        const updatedPriorEntry = recomputeCFSDerivedFields({
          ...priorEntry,
          shortfalls: updatedShortfalls,
          shortfallBatteries: remainingShortfallBatteries,
          shortfallPallets: remainingShortfallPallets,
          updatedAt: new Date().toISOString()
        });

        addOrUpdateCFSEntry(updatedPriorEntry);
      }
    });

    finalPalletUnits = resolvedRawPallets.map((p, idx) => ({
      id: `plt-${params.customInvoiceNo}-${p.palletNumber || idx + 1}-${Date.now()}-${idx}`,
      palletNumber: p.palletNumber || idx + 1,
      model: p.model || 'STANDARD',
      brand: p.brand || '',
      invoicedBatteries: p.invoicedBatteries,
      receivedBatteries: p.receivedBatteries ?? p.invoicedBatteries,
      remainingUnits: p.receivedBatteries ?? p.invoicedBatteries,
      grossWeightKg: p.grossWeightKg,
      netWeightKg: p.netWeightKg,
      status: 'IN_WAREHOUSE' as const,
      invoiceNumber: params.customInvoiceNo
    }));
  }

  const actualRecPallets = finalPalletUnits.filter((p) => p.status === 'IN_WAREHOUSE').length;
  const actualRecBatteries = finalPalletUnits.reduce((sum, p) => sum + (p.receivedBatteries || 0), 0);
  const actualRecGross = toExactWeight(
    finalPalletUnits.filter((p) => p.status === 'IN_WAREHOUSE').reduce((sum, p) => sum + p.grossWeightKg, 0)
  );
  const actualRecNet = invoicedNetKg !== undefined
    ? toExactWeight(finalPalletUnits.filter((p) => p.status === 'IN_WAREHOUSE').reduce((sum, p) => sum + p.netWeightKg, 0))
    : undefined;

  const newEntry: CFSLedgerEntry = recomputeCFSDerivedFields({
    id: entryId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    month: entryMonth,
    customer: params.customer,
    exporterShipper: params.exporterShipper || 'EXIDE INDUSTRIES LIMITED',
    customInvoiceNo: params.customInvoiceNo,
    invoiceDate: params.invoiceDate || today,
    pod: params.pod || '',
    invoicedPallets: params.invoicedPallets,
    invoicedBatteries: params.invoicedBatteries,
    invoicedGrossWeightKg: invoicedGrossKg,
    invoicedNetWeightKg: invoicedNetKg,
    actualGrossWeightKg: params.receiptMode === 'SHORT_FALL' ? actualRecGross : actualGrossKg,
    actualNetWeightKg: params.receiptMode === 'SHORT_FALL' ? actualRecNet : actualNetKg,
    actualReceivedPallets: actualRecPallets,
    actualReceivedBatteries: actualRecBatteries,
    shortfallPallets: totalShortfallPallets,
    shortfallBatteries: totalShortfallBatteries,
    receiptMode: params.receiptMode,
    shortfalls: shortfallRecords,
    shortFillLinks: params.shortFillInputs?.map((sfi) => ({
      priorShortfallInvoiceNo: sfi.priorShortfallInvoiceNo,
      priorShortfallLedgerId: sfi.priorShortfallLedgerId || '',
      palletNumber: sfi.palletNumber,
      arrivedPalletNumber: sfi.arrivedPalletNumber,
      unitsFilled: sfi.unitsFilled
    })),
    dgCreated: false,
    blCreated: false,
    cartingInDate: params.cartingInDate || today,
    vehicleNo: params.vehicleNo || '',
    truckReportingDate: params.truckReportingDate || today,
    lastPltRecdDate: actualRecPallets === params.invoicedPallets ? today : '',
    actualStuffedPallets: 0,
    actualStuffedBatteries: 0,
    balancePallets: actualRecPallets,
    balanceBatteries: actualRecBatteries,
    shippingBillNo: '',
    shippingBillDate: '',
    containerNo: '',
    sealNo: '',
    stuffingDate: '',
    pickupDate: '',
    portGateInDate: '',
    daysInCFS: 0,
    remarks: params.remarks || (totalShortfallBatteries > 0 ? 'FACTORY SHORTFALL' : 'IN CFS - READY'),
    pallets: finalPalletUnits
  });

  addOrUpdateCFSEntry(newEntry);
  return newEntry;
}

// =========================================================================
// Sprint 7.1: Pallet Unit Split Helper (Capped by Available Floor Stock)
// =========================================================================

/**
 * Splits N units from an existing warehouse pallet, creating a split piece
 * with proportional decimal weights and exact remainder balancing (0.00 kg drift).
 */
export function splitPalletUnits(
  entryId: string,
  palletId: string,
  unitsToSplit: number
): { updatedEntry: CFSLedgerEntry; splitPallet: PalletStockUnit; sourcePallet: PalletStockUnit } | null {
  const existing = getCFSLedgerEntries();
  const entryIndex = existing.findIndex((e) => e.id === entryId);
  if (entryIndex === -1) return null;

  const entry = existing[entryIndex];
  const targetPalletIndex = (entry.pallets || []).findIndex((p) => p.id === palletId);
  if (targetPalletIndex === -1) return null;

  const sourcePallet = entry.pallets[targetPalletIndex];
  const availableUnits = sourcePallet.receivedBatteries || sourcePallet.invoicedBatteries || 0;

  if (unitsToSplit <= 0 || unitsToSplit >= availableUnits) {
    console.warn(`[splitPalletUnits] Invalid unitsToSplit: ${unitsToSplit}. Must be between 1 and ${availableUnits - 1}.`);
    return null;
  }

  const remainingUnits = availableUnits - unitsToSplit;
  const origGross = sourcePallet.grossWeightKg || 0;
  const origNet = sourcePallet.netWeightKg || 0;

  // Proportional weight distribution with exact remainder balancing (0.00 kg drift)
  const splitGross = toExactWeight((origGross / availableUnits) * unitsToSplit);
  const splitNet = toExactWeight((origNet / availableUnits) * unitsToSplit);
  const remainingGross = toExactWeight(origGross - splitGross);
  const remainingNet = toExactWeight(origNet - splitNet);

  const basePalletNumber = String(sourcePallet.parentPalletNumber || sourcePallet.palletNumber)
    .replace(/-S\d+$/i, '')
    .replace(/-[A-Z]$/i, '');
  const existingSplits = (entry.pallets || []).filter((p) => {
    const pBase = String(p.parentPalletNumber || p.palletNumber)
      .replace(/-S\d+$/i, '')
      .replace(/-[A-Z]$/i, '');
    return pBase === basePalletNumber && p.isSplitPiece;
  });
  const splitSuffix = `-S${existingSplits.length + 1}`;
  const splitPalletNumber = `${basePalletNumber}${splitSuffix}`;

  const updatedSourcePallet: PalletStockUnit = {
    ...sourcePallet,
    parentPalletNumber: sourcePallet.parentPalletNumber || basePalletNumber,
    isSplitPiece: true,
    invoicedBatteries: remainingUnits,
    receivedBatteries: remainingUnits,
    remainingUnits: remainingUnits,
    grossWeightKg: remainingGross,
    netWeightKg: remainingNet
  };

  const splitPallet: PalletStockUnit = {
    id: `${sourcePallet.id}_split_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    palletNumber: splitPalletNumber,
    parentPalletNumber: basePalletNumber,
    isSplitPiece: true,
    model: sourcePallet.model,
    brand: sourcePallet.brand,
    invoiceNumber: sourcePallet.invoiceNumber || entry.customInvoiceNo,
    invoicedBatteries: unitsToSplit,
    receivedBatteries: unitsToSplit,
    allocatedUnits: unitsToSplit,
    remainingUnits: unitsToSplit,
    grossWeightKg: splitGross,
    netWeightKg: splitNet,
    status: sourcePallet.status
  };

  const updatedPallets = [...entry.pallets];
  updatedPallets[targetPalletIndex] = updatedSourcePallet;
  updatedPallets.splice(targetPalletIndex + 1, 0, splitPallet);

  const updatedEntry: CFSLedgerEntry = recomputeCFSDerivedFields({
    ...entry,
    invoicedPallets: entry.invoicedPallets + 1,
    actualReceivedPallets: entry.actualReceivedPallets + 1,
    pallets: updatedPallets,
    updatedAt: new Date().toISOString()
  });

  existing[entryIndex] = updatedEntry;
  saveCFSLedgerEntries(existing);
  syncEntryToCloud(updatedEntry);

  return {
    updatedEntry,
    splitPallet,
    sourcePallet: updatedSourcePallet
  };
}

/**
 * Merges / tops-up units from a source pallet onto an existing target pallet
 * without creating a new physical pallet (preserving pallet count and 22-pallet container limits).
 * Applies exact decimal delta weights (0.00 kg drift) and attaches a MergedTransfer record.
 */
export function mergeUnitsOntoPallet(
  entryId: string,
  sourcePalletId: string,
  targetPalletId: string,
  unitsToMove: number
): {
  success: boolean;
  error?: string;
  updatedEntry?: CFSLedgerEntry;
  sourcePallet?: PalletStockUnit;
  targetPallet?: PalletStockUnit;
} {
  const existing = getCFSLedgerEntries();
  const entryIndex = existing.findIndex((e) => e.id === entryId);
  if (entryIndex === -1) return { success: false, error: 'Ledger entry not found' };

  const entry = existing[entryIndex];
  const sourceIndex = (entry.pallets || []).findIndex((p) => p.id === sourcePalletId);
  const targetIndex = (entry.pallets || []).findIndex((p) => p.id === targetPalletId);

  if (sourceIndex === -1 || targetIndex === -1) {
    return { success: false, error: 'Source or target pallet not found in entry' };
  }
  if (sourcePalletId === targetPalletId) {
    return { success: false, error: 'Cannot merge a pallet onto itself' };
  }

  const sourcePallet = entry.pallets[sourceIndex];
  const targetPallet = entry.pallets[targetIndex];

  const sourceAvailableUnits = sourcePallet.receivedBatteries || sourcePallet.invoicedBatteries || 0;
  if (unitsToMove <= 0 || unitsToMove > sourceAvailableUnits) {
    return { success: false, error: `Invalid unitsToMove: ${unitsToMove}. Max available: ${sourceAvailableUnits}.` };
  }

  // Exact proportional decimal weights
  const origSourceGross = sourcePallet.grossWeightKg || 0;
  const origSourceNet = sourcePallet.netWeightKg || 0;

  const deltaGross = toExactWeight((origSourceGross / sourceAvailableUnits) * unitsToMove);
  const deltaNet = toExactWeight((origSourceNet / sourceAvailableUnits) * unitsToMove);

  const newSourceUnits = sourceAvailableUnits - unitsToMove;
  const newSourceGross = toExactWeight(origSourceGross - deltaGross);
  const newSourceNet = toExactWeight(origSourceNet - deltaNet);

  const targetAvailableUnits = targetPallet.receivedBatteries || targetPallet.invoicedBatteries || 0;
  const origTargetGross = targetPallet.grossWeightKg || 0;
  const origTargetNet = targetPallet.netWeightKg || 0;

  const newTargetUnits = targetAvailableUnits + unitsToMove;
  const newTargetGross = toExactWeight(origTargetGross + deltaGross);
  const newTargetNet = toExactWeight(origTargetNet + deltaNet);

  const transferRecord: MergedTransfer = {
    fromPalletId: sourcePallet.id,
    fromPalletNumber: sourcePallet.palletNumber,
    units: unitsToMove,
    grossWeightKg: deltaGross,
    netWeightKg: deltaNet
  };

  const updatedSourcePallet: PalletStockUnit = {
    ...sourcePallet,
    invoicedBatteries: newSourceUnits,
    receivedBatteries: newSourceUnits,
    remainingUnits: newSourceUnits,
    grossWeightKg: newSourceGross,
    netWeightKg: newSourceNet
  };

  const updatedTargetPallet: PalletStockUnit = {
    ...targetPallet,
    invoicedBatteries: newTargetUnits,
    receivedBatteries: newTargetUnits,
    remainingUnits: newTargetUnits,
    grossWeightKg: newTargetGross,
    netWeightKg: newTargetNet,
    mergedTransfers: [...(targetPallet.mergedTransfers || []), transferRecord]
  };

  const updatedPallets = [...entry.pallets];
  updatedPallets[sourceIndex] = updatedSourcePallet;
  updatedPallets[targetIndex] = updatedTargetPallet;

  const updatedEntry: CFSLedgerEntry = recomputeCFSDerivedFields({
    ...entry,
    pallets: updatedPallets,
    updatedAt: new Date().toISOString()
  });

  existing[entryIndex] = updatedEntry;
  saveCFSLedgerEntries(existing);
  syncEntryToCloud(updatedEntry);

  return {
    success: true,
    updatedEntry,
    sourcePallet: updatedSourcePallet,
    targetPallet: updatedTargetPallet
  };
}

// =========================================================================
// Sprint 7.1: DG/BL Document Gate & Dispatch Restore Actions
// =========================================================================

/**
 * Stamps DG or BL generation completion flags onto target ledger rows
 */
export function markLedgerDocumentCreated(ledgerIds: string[], docType: 'DG' | 'BL'): void {
  if (!ledgerIds || ledgerIds.length === 0) return;
  const ledgerIdSet = new Set(ledgerIds);
  const existing = getCFSLedgerEntries();

  const updatedEntries = existing.map((entry) => {
    if (!ledgerIdSet.has(entry.id)) return entry;
    const updated: CFSLedgerEntry = {
      ...entry,
      dgCreated: docType === 'DG' ? true : entry.dgCreated,
      blCreated: docType === 'BL' ? true : entry.blCreated,
      updatedAt: new Date().toISOString()
    };
    syncEntryToCloud(updated);
    return updated;
  });

  saveCFSLedgerEntries(updatedEntries);
}

/**
 * Restores all pallets and units from a completed dispatch back into active floor stock.
 * Recomputes balances and cleans up movement logs in local cache and Supabase.
 */
export function restoreDispatchedRecord(dispatchOrLogId: string): {
  success: boolean;
  error?: string;
  restoredEntry?: CFSLedgerEntry;
  restoredPallets?: number;
  restoredBatteries?: number;
} {
  const allLogs = getPersistedMovementLogs();
  const targetLog = allLogs.find((l) => l.id === dispatchOrLogId || l.sourceLedgerId === dispatchOrLogId);

  if (!targetLog) {
    return { success: false, error: 'Movement log record not found.' };
  }

  const existingEntries = getCFSLedgerEntries();
  const entryIndex = existingEntries.findIndex(
    (e) => (targetLog.sourceLedgerId && e.id === targetLog.sourceLedgerId) ||
           (e.customInvoiceNo && e.customInvoiceNo.trim().toUpperCase() === targetLog.customInvoiceNo.trim().toUpperCase())
  );

  if (entryIndex === -1) {
    deleteMovementLog(targetLog.id);
    return { success: true, restoredPallets: targetLog.pallets, restoredBatteries: targetLog.batteries };
  }

  const entry = existingEntries[entryIndex];
  const containerNo = targetLog.containerNo?.trim().toUpperCase() || '';
  const dispatchedIds = new Set(entry.dispatchedPalletIds || []);

  let restoredPalletsCount = 0;
  let restoredBatteriesCount = 0;

  const updatedPallets = (entry.pallets || []).map((p) => {
    const isMatchingContainer = Boolean(containerNo && p.containerNo && p.containerNo.trim().toUpperCase() === containerNo);
    const isDispatched = p.status === 'STUFFED_DISPATCHED';

    if (isDispatched && (isMatchingContainer || !containerNo || dispatchedIds.has(p.id))) {
      restoredPalletsCount += 1;
      restoredBatteriesCount += p.receivedBatteries || p.invoicedBatteries || 0;
      dispatchedIds.delete(p.id);
      return {
        ...p,
        status: 'IN_WAREHOUSE' as const,
        containerNo: undefined,
        stuffedDate: undefined
      };
    }
    return p;
  });

  const effectiveRestoredPallets = restoredPalletsCount > 0 ? restoredPalletsCount : (targetLog.pallets || 0);
  const effectiveRestoredBatteries = restoredBatteriesCount > 0 ? restoredBatteriesCount : (targetLog.batteries || 0);

  const updatedStuffedPallets = Math.max(0, (entry.actualStuffedPallets || 0) - effectiveRestoredPallets);
  const updatedStuffedBatteries = Math.max(0, (entry.actualStuffedBatteries || 0) - effectiveRestoredBatteries);
  const updatedBalancePallets = Math.max(0, (entry.actualReceivedPallets || 0) - updatedStuffedPallets);
  const updatedBalanceBatteries = Math.max(0, (entry.actualReceivedBatteries || 0) - updatedStuffedBatteries);

  const isFullyOnFloor = updatedStuffedPallets === 0;

  const updatedShortfalls = (entry.shortfalls || []).map((sf) => {
    if (sf.status === 'CLEARED' && (sf.remainingShortfallUnits > 0 || isFullyOnFloor)) {
      return {
        ...sf,
        status: sf.remainingShortfallUnits === 0 ? ('CLEARED' as const) : ('OPEN' as const),
        clearedDate: sf.remainingShortfallUnits === 0 ? sf.clearedDate : undefined,
        clearedMonth: sf.remainingShortfallUnits === 0 ? sf.clearedMonth : undefined
      };
    }
    return sf;
  });

  const updatedEntry: CFSLedgerEntry = recomputeCFSDerivedFields({
    ...entry,
    pallets: updatedPallets,
    shortfalls: updatedShortfalls,
    dispatchedPalletIds: Array.from(dispatchedIds),
    actualStuffedPallets: updatedStuffedPallets,
    actualStuffedBatteries: updatedStuffedBatteries,
    balancePallets: updatedBalancePallets,
    balanceBatteries: updatedBalanceBatteries,
    containerNo: isFullyOnFloor ? '' : entry.containerNo,
    sealNo: isFullyOnFloor ? '' : entry.sealNo,
    shippingBillNo: isFullyOnFloor ? '' : entry.shippingBillNo,
    stuffingDate: isFullyOnFloor ? '' : entry.stuffingDate,
    updatedAt: new Date().toISOString()
  });

  existingEntries[entryIndex] = updatedEntry;
  saveCFSLedgerEntries(existingEntries);
  syncEntryToCloud(updatedEntry);

  // Revert prior shortfall status from FULFILLED back to CLEARED if this was a short-fill entry
  if (entry.shortFillLinks && entry.shortFillLinks.length > 0) {
    entry.shortFillLinks.forEach((link) => {
      const priorIdx = existingEntries.findIndex(
        (e) => (link.priorShortfallLedgerId && e.id === link.priorShortfallLedgerId) ||
               (e.customInvoiceNo && e.customInvoiceNo.trim().toUpperCase() === link.priorShortfallInvoiceNo.trim().toUpperCase())
      );
      if (priorIdx !== -1) {
        const prior = existingEntries[priorIdx];
        const updatedShortfalls = (prior.shortfalls || []).map((sf) => {
          if (!link.palletNumber || String(sf.palletNumber).trim() === String(link.palletNumber).trim()) {
            return {
              ...sf,
              status: 'CLEARED' as const,
              fulfilledDate: undefined,
              fulfilledMonth: undefined,
              fulfilledContainerNo: undefined,
              linkedShortFills: (sf.linkedShortFills || []).map((lsf) =>
                lsf.shortFillInvoiceNo.trim().toUpperCase() === entry.customInvoiceNo.trim().toUpperCase()
                  ? { ...lsf, dispatched: false, dispatchedDate: undefined, dispatchContainerNo: undefined }
                  : lsf
              )
            };
          }
          return sf;
        });

        const updatedPrior = {
          ...prior,
          shortfalls: updatedShortfalls,
          updatedAt: new Date().toISOString()
        };
        existingEntries[priorIdx] = updatedPrior;
        saveCFSLedgerEntries(existingEntries);
        syncEntryToCloud(updatedPrior);
      }
    });
  }

  // Remove movement log locally and in cloud
  deleteMovementLog(targetLog.id);

  return {
    success: true,
    restoredEntry: updatedEntry,
    restoredPallets: effectiveRestoredPallets,
    restoredBatteries: effectiveRestoredBatteries
  };
}

// =========================================================================
// Sprint 7.1: Financial-Year Monthly Shortfall Status Engine
// =========================================================================

const FY_MONTH_ORDER = ['APR', 'MAY', 'JUNE', 'JULY', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR'];

/**
 * Returns the operational status of a shortfall record for a given financial year month
 */
export function getShortfallStatusForMonth(
  shortfall: ShortfallRecord,
  targetMonth: string
): 'OPEN' | 'PARTIAL_FILL' | 'CLEARED' | 'FULFILLED' | 'NOT_OPEN' {
  if (!targetMonth || targetMonth === 'ALL') {
    return shortfall.status;
  }

  const upperTarget = targetMonth.toUpperCase();
  const openedMonthUpper = (shortfall.openedMonth || '').toUpperCase();
  const clearedMonthUpper = (shortfall.clearedMonth || '').toUpperCase();
  const fulfilledMonthUpper = (shortfall.fulfilledMonth || '').toUpperCase();

  const targetIdx = FY_MONTH_ORDER.indexOf(upperTarget);
  const openedIdx = FY_MONTH_ORDER.indexOf(openedMonthUpper);
  const clearedIdx = clearedMonthUpper ? FY_MONTH_ORDER.indexOf(clearedMonthUpper) : -1;
  const fulfilledIdx = fulfilledMonthUpper ? FY_MONTH_ORDER.indexOf(fulfilledMonthUpper) : -1;

  // If targetMonth is prior to openedMonth in financial year cycle
  if (openedIdx !== -1 && targetIdx !== -1 && targetIdx < openedIdx) {
    return 'NOT_OPEN';
  }

  // If fulfilled in or before targetMonth
  if (fulfilledIdx !== -1 && targetIdx !== -1 && targetIdx >= fulfilledIdx) {
    return 'FULFILLED';
  }

  // If already cleared in or before targetMonth
  if (clearedIdx !== -1 && targetIdx !== -1 && targetIdx >= clearedIdx) {
    if (shortfall.status === 'FULFILLED') {
      return 'FULFILLED';
    }
    return 'CLEARED';
  }

  // Check fills that occurred on or before targetMonth
  if (shortfall.linkedShortFills && shortfall.linkedShortFills.length > 0) {
    const fillsUpToMonth = shortfall.linkedShortFills.filter((fill) => {
      const fillMonthIdx = FY_MONTH_ORDER.indexOf((fill.filledMonth || '').toUpperCase());
      return fillMonthIdx !== -1 && targetIdx !== -1 && fillMonthIdx <= targetIdx;
    });

    const unitsFilledUpToMonth = fillsUpToMonth.reduce((sum, f) => sum + (f.unitsFilled || 0), 0);
    if (unitsFilledUpToMonth >= shortfall.shortfallUnits) {
      const allDispatched = fillsUpToMonth.every((f) => f.dispatched);
      if (allDispatched || shortfall.status === 'FULFILLED') {
        return 'FULFILLED';
      }
      return 'CLEARED';
    }
    if (unitsFilledUpToMonth > 0) {
      return 'PARTIAL_FILL';
    }
  }

  return 'OPEN';
}



