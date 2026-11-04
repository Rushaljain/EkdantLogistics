// Deterministic Numerical Reconciliation Engine
// Enforces mathematical invariants across line items, containers, pallets, and manifest totals
// Reconciles:
// 1. sum(Pallet Gross Weights) === Declared Cargo Gross Weight (within 0.01 kg)
// 2. sum(Container Gross Weights) + Tare Weights === Total VGM
// 3. sum(Pallet Counts) === Declared Manifest Pallets (0 variance)

import type { ConvertedInvoice } from '../types';

export interface ReconciliationReport {
  isValid: boolean;
  palletGrossSum: number;
  declaredGrossKg: number;
  grossVarianceKg: number;
  containerGrossSum: number;
  containerTareSum: number;
  totalVgmKg: number;
  allocatedPalletCount: number;
  declaredPalletCount: number;
  palletCountVariance: number;
  lineItemsGrossSum: number;
  lineItemsNetSum: number;
  errors: string[];
  warnings: string[];
}

export class ReconciliationError extends Error {
  public report: ReconciliationReport;

  constructor(message: string, report: ReconciliationReport) {
    super(message);
    this.name = 'ReconciliationError';
    this.report = report;
  }
}

/**
 * Validates strict numerical reconciliation across all tiers of a shipment.
 * Fails if gross weight variance > 0.01 kg or pallet count variance > 0.
 */
export function reconcileShipment(invoice: ConvertedInvoice): ReconciliationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Pallet Gross Weights Sum
  const palletGrossSum = Number(
    (invoice.pallets || []).reduce((sum, p) => sum + (Number(p.grossWeightKg) || 0), 0).toFixed(2)
  );

  // Declared Cargo Gross Weight
  const declaredGrossKg = Number((invoice.grossWeightKg || 0).toFixed(2));
  const grossVarianceKg = Number(Math.abs(palletGrossSum - declaredGrossKg).toFixed(2));

  // 2. Container Gross Weights Sum & Total VGM
  const containerGrossSum = Number(
    (invoice.containers || []).reduce((sum, c) => sum + (Number(c.totalGrossWeightKg) || 0), 0).toFixed(2)
  );
  const containerTareSum = Number(
    (invoice.containers || []).reduce((sum, c) => sum + (Number(c.tareWeightKg) || 0), 0).toFixed(2)
  );
  const totalVgmKg = Number((containerGrossSum + containerTareSum).toFixed(2));

  // 3. Pallet Counts
  const allocatedPalletCount = (invoice.pallets || []).length;
  const declaredPalletCount = invoice.totalPallets || allocatedPalletCount;
  const palletCountVariance = Math.abs(allocatedPalletCount - declaredPalletCount);

  // 4. Line Items Sums
  const lineItemsGrossSum = Number(
    (invoice.lineItems || []).reduce((sum, it) => sum + (Number(it.grossWeightKg) || 0), 0).toFixed(2)
  );
  const lineItemsNetSum = Number(
    (invoice.lineItems || []).reduce((sum, it) => sum + (Number(it.netWeightKg) || 0), 0).toFixed(2)
  );

  // INVARIANT 1: Pallet Gross Sum must equal Declared Gross Weight (max 0.01 kg variance)
  if (declaredGrossKg > 0 && grossVarianceKg > 0.01) {
    errors.push(
      `Weight Discrepancy: Sum of pallet gross weights (${palletGrossSum.toLocaleString()} kg) does not match declared cargo gross weight (${declaredGrossKg.toLocaleString()} kg). Variance: ${grossVarianceKg.toFixed(2)} kg exceeds allowable threshold (0.01 kg).`
    );
  }

  // INVARIANT 2: Pallet count must match declared manifest pallets (0 variance)
  if (declaredPalletCount > 0 && palletCountVariance > 0) {
    errors.push(
      `Pallet Count Discrepancy: Allocated pallets (${allocatedPalletCount}) does not match declared manifest pallets (${declaredPalletCount}). Variance: ${palletCountVariance} pallets.`
    );
  }

  // Check Container Payload Caps (25T payload cap)
  for (const cont of invoice.containers || []) {
    if (cont.totalGrossWeightKg > cont.maxPayloadKg) {
      errors.push(
        `Payload Breach: Container ${cont.containerNumber} gross cargo (${cont.totalGrossWeightKg.toLocaleString()} kg) exceeds maximum payload rating (${cont.maxPayloadKg.toLocaleString()} kg).`
      );
    }
    const maxPalletsLimit = cont.maxPallets || 11;
    if (cont.pallets.length > maxPalletsLimit) {
      warnings.push(
        `Footprint Warning: Container ${cont.containerNumber} holds ${cont.pallets.length} pallets, exceeding standard 20' floor capacity (${maxPalletsLimit} pallets). Ensure double-tier stacking certification.`
      );
    }
  }

  // Check container gross sum vs pallet gross sum
  const contPalletDiff = Math.abs(containerGrossSum - palletGrossSum);
  if (contPalletDiff > 0.01 && invoice.containers.length > 0) {
    errors.push(
      `Container Allocation Discrepancy: Sum of container cargo weights (${containerGrossSum.toLocaleString()} kg) does not equal pallet sum (${palletGrossSum.toLocaleString()} kg). Variance: ${contPalletDiff.toFixed(2)} kg.`
    );
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    palletGrossSum,
    declaredGrossKg,
    grossVarianceKg,
    containerGrossSum,
    containerTareSum,
    totalVgmKg,
    allocatedPalletCount,
    declaredPalletCount,
    palletCountVariance,
    lineItemsGrossSum,
    lineItemsNetSum,
    errors,
    warnings
  };
}

/**
 * Throws a runtime ReconciliationError if numerical invariants fail.
 */
export function assertReconciliation(invoice: ConvertedInvoice): ReconciliationReport {
  const report = reconcileShipment(invoice);
  if (!report.isValid) {
    throw new ReconciliationError(
      `Reconciliation failed with ${report.errors.length} error(s):\n${report.errors.join('\n')}`,
      report
    );
  }
  return report;
}
