// Deterministic Indian Customs Pre-Validation and Arithmetic Reconciliation Engine
// Compliant with Central Board of Indirect Taxes and Customs (CBIC) and ICEGATE audit rules

import type { LineItemData, InvoiceHeaderData, PackagesAndWeightData, CustomsAuditReport, ExporterMasterData } from '../types/customs';
import { validateHsnCode } from './hsnValidator';

export const RECONCILIATION_TOLERANCE = 0.50; // INR / foreign currency rounding buffer allowed in ICEGATE

/**
 * Validates a single line item's arithmetic:
 * |(Quantity * Unit Price) - Item Total Value| <= 0.50
 */
export function validateLineItemMath(item: LineItemData): { isValid: boolean; calculatedTotal: number; difference: number } {
  const calculated = Number((item.quantity * item.unitPrice).toFixed(2));
  const diff = Math.abs(calculated - item.itemTotalValue);
  const isValid = diff <= RECONCILIATION_TOLERANCE;

  return {
    isValid,
    calculatedTotal: calculated,
    difference: Number(diff.toFixed(2))
  };
}

/**
 * Comprehensive Customs Pre-flight Audit
 */
export function runCustomsPreflightAudit(
  exporter: ExporterMasterData,
  invoice: InvoiceHeaderData,
  packages: PackagesAndWeightData,
  lineItems: LineItemData[]
): CustomsAuditReport {
  const errorMessages: string[] = [];
  const warningMessages: string[] = [];

  // 1. Line Item Audits
  let itemsSum = 0;
  let invalidHsnCount = 0;
  let invalidLineMathCount = 0;

  lineItems.forEach((item, index) => {
    // Check HSN
    const hsnResult = validateHsnCode(item.hsnCode);
    if (!hsnResult.isValid) {
      invalidHsnCount++;
      errorMessages.push(`Line ${item.itemNumber || index + 1}: ${hsnResult.reason} [Code: ${item.hsnCode || 'EMPTY'}]`);
    }

    // Check Math
    const mathCheck = validateLineItemMath(item);
    if (!mathCheck.isValid) {
      invalidLineMathCount++;
      warningMessages.push(
        `Line ${item.itemNumber || index + 1}: Math Drift | Expected: ${mathCheck.calculatedTotal} vs Stated: ${item.itemTotalValue} (Diff: ${mathCheck.difference})`
      );
    }

    itemsSum += (item.itemTotalValue || 0);
  });

  itemsSum = Number(itemsSum.toFixed(2));
  const invoiceTotal = Number(invoice.invoiceTotal.toFixed(2));
  const headerMathDiff = Number(Math.abs(itemsSum - invoiceTotal).toFixed(2));
  const isHeaderMathBalanced = headerMathDiff <= RECONCILIATION_TOLERANCE;

  if (!isHeaderMathBalanced) {
    errorMessages.push(
      `Header Discrepancy: Sum of Line Items (${itemsSum} ${invoice.currency}) does not balance with Invoice Total (${invoiceTotal} ${invoice.currency}). Variance: ${headerMathDiff} ${invoice.currency}`
    );
  }

  // 2. Physical Weight Logic (ICEGATE rejection trigger: Container tare/gross mismatch)
  const weightRulePassed = packages.grossWeightKg >= packages.netWeightKg && packages.grossWeightKg > 0;
  if (!weightRulePassed) {
    if (packages.grossWeightKg < packages.netWeightKg) {
      errorMessages.push(
        `Critical Customs Rule Violation: Gross Weight (${packages.grossWeightKg} kg) cannot be less than Net Weight (${packages.netWeightKg} kg). Indian Customs rejects physical container loading.`
      );
    } else if (packages.grossWeightKg <= 0) {
      warningMessages.push(`Gross Weight is 0 kg. Indian Customs requires valid manifest weights.`);
    }
  }

  // 3. e-Sanchit IRN Check
  const cleanedIrn = (invoice.eSanchitIrn || '').trim();
  const hasESanchitIrn = cleanedIrn.length >= 16;
  if (!hasESanchitIrn) {
    warningMessages.push(
      `e-Sanchit IRN Missing or Incomplete (${cleanedIrn.length}/16 chars). Required for digital Class-3 DSC supporting documents binding.`
    );
  }

  // 4. Statutory Exporter Details Checks
  if (!exporter.iec || exporter.iec.length !== 10) {
    errorMessages.push(`Exporter IEC must be exactly 10 alphanumeric characters (Current: ${exporter.iec || 'EMPTY'}).`);
  }
  if (!exporter.gstin || exporter.gstin.length !== 15) {
    errorMessages.push(`Exporter GSTIN must be exactly 15 characters (Current: ${exporter.gstin || 'EMPTY'}).`);
  }
  if (!exporter.adCode || exporter.adCode.length !== 7) {
    warningMessages.push(`Bank AD Code should be 7 digits for ICEGATE export incentive routing (Current: ${exporter.adCode || 'EMPTY'}).`);
  }

  const allHsnValid = invalidHsnCount === 0;
  const allLineMathValid = invalidLineMathCount === 0;
  const overallAuditPassed = isHeaderMathBalanced && allHsnValid && weightRulePassed && errorMessages.length === 0;

  return {
    isHeaderMathBalanced,
    headerMathDifference: headerMathDiff,
    itemsSum,
    invoiceTotal,
    allHsnValid,
    invalidHsnCount,
    allLineMathValid,
    invalidLineMathCount,
    weightRulePassed,
    hasESanchitIrn,
    overallAuditPassed,
    errorMessages,
    warningMessages
  };
}

/**
 * 1-Click Auto-Reconciler:
 * Adjusts line total values or updates header total to force exact balance
 */
export function autoReconcileHeaderTotal(lineItems: LineItemData[]): number {
  const sum = lineItems.reduce((acc, curr) => acc + (curr.itemTotalValue || 0), 0);
  return Number(sum.toFixed(2));
}

/**
 * 1-Click Line Item Recalculator:
 * Recomputes itemTotalValue = quantity * unitPrice
 */
export function recalculateLineItemTotal(item: LineItemData): LineItemData {
  const calculatedTotal = Number((item.quantity * item.unitPrice).toFixed(2));
  return {
    ...item,
    itemTotalValue: calculatedTotal,
    calculatedTotal,
    isLineMathValid: true
  };
}
