// Cross-Document Conflict Exception Handling Engine
// Detects inconsistencies across commercial invoices, packing lists, and BL/DG reference drafts
// Prompts operator verification before document locking and final export

import type { ConvertedInvoice } from '../types';

export interface CrossDocumentConflict {
  id: string;
  field: string;
  label: string;
  sourceA: string;
  valueA: string;
  sourceB: string;
  valueB: string;
  description: string;
  severity: 'critical' | 'warning';
  recommendedValue?: string;
  resolvedValue?: string;
}

/**
 * Evaluates active invoice, line items, and raw draft text for conflicting attributes.
 */
export function detectCrossDocumentConflicts(
  invoice: ConvertedInvoice,
  rawDocumentText: string = ''
): CrossDocumentConflict[] {
  const conflicts: CrossDocumentConflict[] = [];

  // 1. Dangerous Goods Packing Group Conflict (e.g. DG draft states NIL / NA vs IMDG code PG III)
  const isBattery = invoice.lineItems.some(it => 
    /(battery|batteries|lead[\s-]*acid|electric storage)/i.test(it.description || '') ||
    it.unNumber === 'UN 2794'
  );

  const rawPackingGroupMatch = rawDocumentText.match(/(?:PACKING\s*GROUP|UN\s*PACKING\s*GROUP)\s*[:.]*\s*([A-Za-z0-9/-]+)/i);
  const rawPg = rawPackingGroupMatch ? rawPackingGroupMatch[1].trim().toUpperCase() : null;

  if (isBattery) {
    if (rawPg && (rawPg === 'NIL' || rawPg === 'NA' || rawPg === 'NONE' || rawPg === 'N/A')) {
      conflicts.push({
        id: 'conflict-pg-nil',
        field: 'packingGroup',
        label: 'Dangerous Goods Packing Group',
        sourceA: 'DG Reference Draft (Outer Package)',
        valueA: rawPg,
        sourceB: 'IMDG Code / BOL Specification',
        valueB: 'PG III',
        description: `Draft specifies Packing Group as '${rawPg}', while standard UN 2794 (Lead Acid Wet Batteries) mandates Packing Group III under IMDG Code 2.8.`,
        severity: 'critical',
        recommendedValue: 'III'
      });
    }
  }

  // 2. Line Item Packing Group Inconsistency
  const distinctPgs = Array.from(
    new Set(
      invoice.lineItems
        .filter(it => it.isDangerousGood && it.packingGroup)
        .map(it => it.packingGroup!)
    )
  );
  if (distinctPgs.length > 1) {
    conflicts.push({
      id: 'conflict-pg-mixed',
      field: 'packingGroup',
      label: 'Mixed Hazardous Packing Groups',
      sourceA: 'Line Item Group 1',
      valueA: `PG ${distinctPgs[0]}`,
      sourceB: 'Line Item Group 2',
      valueB: `PG ${distinctPgs[1]}`,
      description: `Consignment contains mixed hazardous packing groups (${distinctPgs.join(', ')}). Verify segregation requirements.`,
      severity: 'warning',
      recommendedValue: distinctPgs[0]
    });
  }

  // 3. UN Number Inconsistency
  const distinctUns = Array.from(
    new Set(
      invoice.lineItems
        .filter(it => it.isDangerousGood && it.unNumber)
        .map(it => it.unNumber!)
    )
  );
  if (distinctUns.length > 1) {
    conflicts.push({
      id: 'conflict-un-mixed',
      field: 'unNumber',
      label: 'Multiple UN Identification Numbers',
      sourceA: 'Cargo Item 1',
      valueA: distinctUns[0],
      sourceB: 'Cargo Item 2',
      valueB: distinctUns[1],
      description: `Shipment combines multiple UN numbers (${distinctUns.join(', ')}). Ensure separate IMDG documentation entries.`,
      severity: 'warning',
      recommendedValue: distinctUns[0]
    });
  }

  // 4. Weight Discrepancy between Line Items Sum vs Summary Header
  const itemsGrossSum = Number(
    invoice.lineItems.reduce((acc, it) => acc + (Number(it.grossWeightKg) || 0), 0).toFixed(2)
  );
  const declaredGross = Number((invoice.grossWeightKg || 0).toFixed(2));
  const weightDiff = Math.abs(itemsGrossSum - declaredGross);

  if (itemsGrossSum > 0 && declaredGross > 0 && weightDiff > 0.5) {
    conflicts.push({
      id: 'conflict-weight-items-manifest',
      field: 'grossWeightKg',
      label: 'Itemized Weight vs Declared Total',
      sourceA: 'Line Items Sum',
      valueA: `${itemsGrossSum.toLocaleString()} kg`,
      sourceB: 'Declared Manifest Total',
      valueB: `${declaredGross.toLocaleString()} kg`,
      description: `Cumulative line item gross weight (${itemsGrossSum.toLocaleString()} kg) differs from declared header gross weight (${declaredGross.toLocaleString()} kg) by ${weightDiff.toFixed(2)} kg.`,
      severity: 'critical',
      recommendedValue: `${declaredGross} kg`
    });
  }

  // 5. Port of Discharge Routing Conflict across merged invoices
  if (invoice.invoiceNumber.includes(' + ')) {
    // Multi-invoice batch: verify all line items share consistent routing
    const distinctDischargePorts = Array.from(
      new Set(
        invoice.lineItems
          .map(it => (it as any).portOfDischarge)
          .filter(Boolean)
      )
    );
    if (distinctDischargePorts.length > 1) {
      conflicts.push({
        id: 'conflict-pod-multi',
        field: 'portOfDischarge',
        label: 'Conflicting Discharge Ports in Batch',
        sourceA: 'Invoice A',
        valueA: String(distinctDischargePorts[0]),
        sourceB: 'Invoice B',
        valueB: String(distinctDischargePorts[1]),
        description: `Consolidated invoices specify different discharge ports (${distinctDischargePorts.join(' vs ')}).`,
        severity: 'critical',
        recommendedValue: invoice.portOfDischarge
      });
    }
  }

  return conflicts;
}
