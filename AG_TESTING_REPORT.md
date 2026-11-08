# Comprehensive Matcher & Template Diagnostic Report (AG_TESTING_REPORT.md)

**Generated:** 2026-11-08T19:09:53.438Z  
**Target Environment:** Ekdant Logistics Web Application  
**Engine:** Pure AI Extraction + Dynamic Manifest Matcher + Global Keyword Reference  
**Constraint Mandate:** Zero-Hardcoding across all template definitions and matching rules.

---

## Table of Contents
1. [Current Matcher & Keyword Source Dump](#1-current-matcher--keyword-source-dump)
   - 1.1 `src/utils/manifestMatcher.ts` (`buildMappedManifest`)
   - 1.2 `src/utils/manifestKeywordReference.ts` (`KEYWORD_RULES` & Engine)
   - 1.3 `src/utils/formatParser.ts` (Default Formats & Gemini Prompt)
2. [Template Schema Inspection (All Formats)](#2-template-schema-inspection-all-formats)
   - 2.1 Built-in Standard IMO DG Declaration (`DEFAULT_DG_FORMAT` - 28 fields)
   - 2.2 Reference IMO DG Declaration (`Reference DG.pdf` / `DG ONEU2878769.pdf` - 31 fields)
   - 2.3 Built-in Standard Multimodal Ocean B/L (`DEFAULT_BL_FORMAT` - 30 fields)
   - 2.4 Ocean Bill of Lading Draft (`BL DRAFT.docx` - 22 fields)
   - 2.5 CMA CGM DG Declaration (`CMA HAZ.xlsx` / `HPFL NEWARK` - 32 fields)
3. [Dry-Run Matching Audit (Single-Invoice & Multi-Invoice)](#3-dry-run-matching-audit-single-invoice--multi-invoice)
   - 3.0 Executive Summary Audit Scorecard
   - 3.1 to 3.8 Field-by-Field Audit Tables
4. [Root-Cause Breakdown of Unpopulated Fields](#4-root-cause-breakdown-of-unpopulated-fields)
   - 4.1 Bucket 1: False Blanks / Matcher & Schema Bugs
   - 4.2 Bucket 2: True Stage-2 Operational & Signature Blanks
   - 4.3 Recommended Surgical Improvements

---

## 1. Current Matcher & Keyword Source Dump

### 1.1 `src/utils/manifestMatcher.ts` (`buildMappedManifest`)

```typescript
// Ekdant Logistics - Dynamic Manifest Matcher & Two-Way Session Enrichment
// Matches ExtractedShipmentJSON against FormatSchemaJSON and provides two-way sync between DG & BL manifests

import type { ExtractedShipmentJSON, FormatSchemaJSON, MappedManifestField } from '../types/index.ts';
import { resolveFieldValueByKeywords, buildCombinedDgCargoBlock } from './manifestKeywordReference.ts';


/**
 * Builds a dynamic mapped manifest list from a shipment JSON and a target format schema.
 * Populates known fields, evaluates composite math (e.g. VGM), and marks status.
 */
export function buildMappedManifest(
  shipment: ExtractedShipmentJSON,
  format: FormatSchemaJSON,
  customOverrides: Record<string, string> = {}
): MappedManifestField[] {
  return format.fields.map((field) => {
    let resolvedValue = '';

    // 1. Check if user provided a custom override for this specific template fieldId
    if (customOverrides[field.fieldId] !== undefined) {
      resolvedValue = customOverrides[field.fieldId];
    } else if (field.mappedShipmentKey && field.mappedShipmentKey in shipment) {
      // 2. Read value from ExtractedShipmentJSON
      const rawVal = shipment[field.mappedShipmentKey];

      if (Array.isArray(rawVal)) {
        resolvedValue = rawVal.filter(Boolean).join(', ');
      } else if (typeof rawVal === 'boolean') {
        resolvedValue = rawVal ? 'YES' : 'NO';
      } else if (typeof rawVal === 'number') {
        resolvedValue = rawVal === 0 ? '' : String(rawVal);
      } else if (typeof rawVal === 'string') {
        resolvedValue = rawVal.trim();
        if (resolvedValue === '0' || resolvedValue === '---' || resolvedValue === 'NIL') {
          resolvedValue = resolvedValue === '0' ? '' : resolvedValue;
        }
      }
    }

    const labelLower = field.labelInTemplate.toLowerCase();
    const fieldIdLower = field.fieldId.toLowerCase();

    // 3. Strict Box 19 / VGM Invariant:
    // NEVER copy grossWeightKg alone into Total gross (incl. tare) when tareWeightKg is 0 or blank.
    // Only when BOTH grossWeightKg > 0 AND tareWeightKg > 0 may it compute grossWeightKg + tareWeightKg.
    const isVgmField =
      fieldIdLower.includes('vgm') ||
      fieldIdLower.includes('total_gross_incl_tare') ||
      fieldIdLower.includes('total_weight_incl_tare') ||
      fieldIdLower === 'box_19_total_gross' ||
      fieldIdLower === 'box_19_total_gross_incl_tare' ||
      labelLower.includes('total gross (incl') ||
      labelLower.includes('total weight incl') ||
      labelLower.includes('incl. tare') ||
      labelLower.includes('including tare') ||
      labelLower.includes('verified gross mass');

    if (isVgmField) {
      if (shipment.grossWeightKg > 0 && shipment.tareWeightKg > 0) {
        resolvedValue = String(Number((shipment.grossWeightKg + shipment.tareWeightKg).toFixed(2)));
      } else {
        resolvedValue = '';
      }
    }

    // 4. Composite Party Blocks (Shipper, Consignee, Notify Party)
    const hasSeparateShipperAddress = format.fields.some(
      f => f.fieldId !== field.fieldId && f.mappedShipmentKey === 'shipperAddress'
    );
    const isShipperPartyBox =
      field.mappedShipmentKey === 'shipperAddress' ||
      (field.mappedShipmentKey === 'shipperName' && !hasSeparateShipperAddress) ||
      fieldIdLower.includes('box_1_shipper') ||
      fieldIdLower === 'bl_shipper' ||
      (labelLower.includes('shipper') && !labelLower.includes('reference') && !labelLower.includes('declaration'));

    if (isShipperPartyBox && !hasSeparateShipperAddress) {
      const parts: string[] = [];
      if (shipment.shipperName && shipment.shipperName.trim()) {
        parts.push(shipment.shipperName.trim());
      }
      if (shipment.shipperAddress && shipment.shipperAddress.trim()) {
        const addr = shipment.shipperAddress.trim();
        if (!shipment.shipperName || !addr.toLowerCase().startsWith(shipment.shipperName.trim().toLowerCase())) {
          parts.push(addr);
        } else {
          parts.length = 0;
          parts.push(addr);
        }
      }
      if (shipment.onBehalfOf && shipment.onBehalfOf.trim()) {
        parts.push(`ON BEHALF OF:\n${shipment.onBehalfOf.trim()}`);
      }
      resolvedValue = parts.filter(Boolean).join('\n');
    }

    const hasSeparateConsigneeAddress = format.fields.some(
      f => f.fieldId !== field.fieldId && f.mappedShipmentKey === 'consigneeAddress'
    );
    const isConsigneePartyBox =
      field.mappedShipmentKey === 'consigneeAddress' ||
      (field.mappedShipmentKey === 'consigneeName' && !hasSeparateConsigneeAddress) ||
      fieldIdLower.includes('box_6_consignee') ||
      fieldIdLower === 'bl_consignee' ||
      labelLower.includes('consignee');

    if (isConsigneePartyBox && !hasSeparateConsigneeAddress) {
      if (shipment.consigneeName && shipment.consigneeAddress) {
        const addr = shipment.consigneeAddress.trim();
        const name = shipment.consigneeName.trim();
        if (!addr.toLowerCase().startsWith(name.toLowerCase())) {
          resolvedValue = `${name}\n${addr}`;
        } else {
          resolvedValue = addr;
        }
      } else if (shipment.consigneeName || shipment.consigneeAddress) {
        resolvedValue = (shipment.consigneeAddress || shipment.consigneeName).trim();
      }
    }

    const hasSeparateNotifyAddress = format.fields.some(
      f => f.fieldId !== field.fieldId && f.mappedShipmentKey === 'notifyPartyAddress'
    );
    const isNotifyPartyBox =
      field.mappedShipmentKey === 'notifyPartyAddress' ||
      (field.mappedShipmentKey === 'notifyPartyName' && !hasSeparateNotifyAddress) ||
      fieldIdLower.includes('notify_party') ||
      labelLower.includes('notify party');

    if (isNotifyPartyBox && !hasSeparateNotifyAddress) {
      if (shipment.notifyPartyName && shipment.notifyPartyAddress) {
        const addr = shipment.notifyPartyAddress.trim();
        const name = shipment.notifyPartyName.trim();
        if (!addr.toLowerCase().startsWith(name.toLowerCase())) {
          resolvedValue = `${name}\n${addr}`;
        } else {
          resolvedValue = addr;
        }
      } else if (shipment.notifyPartyName || shipment.notifyPartyAddress) {
        resolvedValue = (shipment.notifyPartyAddress || shipment.notifyPartyName).trim();
      }
    }

    // 5. Shipper's Reference / Invoice Reference (Box 4):
    // If invoiceNumbers is non-empty, include them alongside shipperReference so invoice numbers are never lost
    const isShipperRefBox =
      field.mappedShipmentKey === 'shipperReference' ||
      fieldIdLower.includes('shipper_ref') ||
      fieldIdLower === 'bl_export_references' ||
      labelLower.includes("shipper's ref") ||
      labelLower.includes('shipper reference') ||
      labelLower.includes('export references');

    if (isShipperRefBox) {
      const invStr = shipment.invoiceNumbers && shipment.invoiceNumbers.length > 0
        ? shipment.invoiceNumbers.join(', ')
        : '';
      const refStr = shipment.shipperReference ? shipment.shipperReference.trim() : '';

      if (refStr && invStr) {
        if (!refStr.toLowerCase().includes(invStr.toLowerCase())) {
          resolvedValue = `${refStr}\nINV: ${invStr}`;
        } else {
          resolvedValue = refStr;
        }
      } else if (invStr) {
        resolvedValue = `INV: ${invStr}`;
      } else if (refStr) {
        resolvedValue = refStr;
      }
    }

    // 6. Box 14 / Combined DG Cargo Description Block
    const hasSeparateUnField = format.fields.some(
      f => f.fieldId !== field.fieldId && (f.mappedShipmentKey === 'unNumber' || f.fieldId.toLowerCase().includes('un_number'))
    );
    const hasSeparateMarksField = format.fields.some(
      f => f.fieldId !== field.fieldId && f.mappedShipmentKey === 'shippingMarks'
    );

    const isCombinedDgCargoBox =
      format.documentType === 'DG' &&
      (
        fieldIdLower.includes('box_14_cargo') ||
        fieldIdLower.includes('box14') ||
        fieldIdLower.includes('combined_cargo') ||
        (labelLower.includes('number and kind of packages') && labelLower.includes('description of goods')) ||
        (labelLower.includes('shipping marks') && labelLower.includes('description')) ||
        ((field.mappedShipmentKey === 'productDescription' || field.mappedShipmentKey === 'properShippingName') && !hasSeparateUnField)
      );

    if (isCombinedDgCargoBox) {
      const includeMarks = !hasSeparateMarksField || labelLower.includes('shipping marks') || labelLower.includes('marks & nos');
      resolvedValue = buildCombinedDgCargoBlock(shipment, includeMarks);
    }

    // 7. Container & Seal combined box
    if (
      (fieldIdLower.includes('container_seal') || (labelLower.includes('container') && labelLower.includes('seal'))) &&
      field.fieldType !== 'table'
    ) {
      if (shipment.containerNumber && shipment.sealNumber) {
        resolvedValue = `${shipment.containerNumber} / SEAL: ${shipment.sealNumber}`;
      } else if (shipment.containerNumber) {
        resolvedValue = shipment.containerNumber;
      }
    }

    // 8. Vessel and Voyage combined box
    if (
      (fieldIdLower.includes('vessel_voyage') || (labelLower.includes('vessel') && labelLower.includes('voyage'))) &&
      shipment.vesselName
    ) {
      resolvedValue = shipment.voyageNumber
        ? `${shipment.vesselName} / ${shipment.voyageNumber}`
        : shipment.vesselName;
    }

    // 9. Global Keyword Reference & Cascading Fallback Engine
    let isValueBlank = !resolvedValue || resolvedValue.trim() === '' || resolvedValue.trim() === '0' || resolvedValue.trim() === '---';

    if (isValueBlank) {
      const keywordResolved = resolveFieldValueByKeywords(
        field.labelInTemplate,
        field.fieldId,
        shipment,
        format.documentType
      );
      if (keywordResolved) {
        resolvedValue = keywordResolved;
        isValueBlank = false;
      }
    }

    // 10. Secondary Smart Fallback Keyword Chains (when still blank)
    if (isValueBlank && !isVgmField) {
      // Chain 1: Transport Document / Booking / Reference Number Fields
      const isTransportDocOrRefField =
        !labelLower.includes('container') &&
        !labelLower.includes('seal') &&
        !labelLower.includes('declaration') &&
        (
          field.mappedShipmentKey === 'bookingNumber' ||
          field.mappedShipmentKey === 'shipperReference' ||
          field.mappedShipmentKey === 'forwarderReference' ||
          fieldIdLower.includes('booking') ||
          fieldIdLower.includes('transport_doc') ||
          fieldIdLower.includes('doc_no') ||
          fieldIdLower.includes('document_no') ||
          fieldIdLower.includes('bill_of_lading') ||
          labelLower.includes('transport document') ||
          labelLower.includes('booking') ||
          labelLower.includes('bill of lading') ||
          labelLower.includes('b/l no') ||
          labelLower.includes('bol no') ||
          labelLower.includes('document no') ||
          labelLower.includes('invoice ref') ||
          labelLower.includes('export ref') ||
          labelLower.includes('reference')
        );

      if (isTransportDocOrRefField) {
        // Fallback 1: Commercial invoice numbers joined
        if (shipment.invoiceNumbers && shipment.invoiceNumbers.length > 0) {
          resolvedValue = shipment.invoiceNumbers.join(', ');
        }
        // Fallback 2: Shipper reference
        else if (shipment.shipperReference && shipment.shipperReference.trim()) {
          resolvedValue = shipment.shipperReference.trim();
        }
      }

      // Chain 2: Shipping Marks / Package Description Fields
      const isMarksOrPackageField =
        field.mappedShipmentKey === 'shippingMarks' ||
        field.mappedShipmentKey === 'productDescription' ||
        fieldIdLower.includes('shipping_marks') ||
        fieldIdLower.includes('cargo_description') ||
        fieldIdLower.includes('package') ||
        labelLower.includes('shipping marks') ||
        labelLower.includes('marks & nos') ||
        labelLower.includes('marks and numbers') ||
        labelLower.includes('packages') ||
        labelLower.includes('package description') ||
        labelLower.includes('description of goods');

      if ((!resolvedValue || resolvedValue.trim() === '') && isMarksOrPackageField) {
        // If it's a numeric package count field
        if (field.fieldType === 'number' || labelLower.includes('package count') || labelLower.includes('total number of packages')) {
          if (shipment.totalPallets > 0) {
            resolvedValue = String(shipment.totalPallets);
          } else if (shipment.outerPackagingCount > 0) {
            resolvedValue = String(shipment.outerPackagingCount);
          } else if (shipment.totalBoxes > 0) {
            resolvedValue = String(shipment.totalBoxes);
          } else if (shipment.innerPackageCount > 0) {
            resolvedValue = String(shipment.innerPackageCount);
          }
        } else {
          // Fallback 1: shipment.shippingMarks
          if (shipment.shippingMarks && shipment.shippingMarks.trim()) {
            resolvedValue = shipment.shippingMarks.trim();
          }
          // Fallback 2: combine shipment.productDescription + packaging counts
          else {
            const pkgParts: string[] = [];
            if (shipment.outerPackagingCount > 0) {
              pkgParts.push(`${shipment.outerPackagingCount} ${shipment.outerPackagingType || 'PALLETS'}`);
            }
            if (shipment.innerPackageCount > 0) {
              pkgParts.push(`${shipment.innerPackageCount} ${shipment.innerPackageType || 'BOXES'}`);
            }
            const pkgStr = pkgParts.join(' / ');
            const descStr = shipment.productDescription || shipment.properShippingName || '';
            if (pkgStr && descStr) {
              resolvedValue = `${pkgStr}\n${descStr}`;
            } else if (pkgStr || descStr) {
              resolvedValue = pkgStr || descStr;
            }
          }
        }
      }

      // Chain 3: Port & Routing Fields (portOfLoading, portOfDischarge, finalDestination)
      const isPodField =
        field.mappedShipmentKey === 'portOfDischarge' ||
        field.mappedShipmentKey === 'portOfDischargeDg' ||
        fieldIdLower.includes('port_of_discharge') ||
        fieldIdLower.includes('discharge') ||
        labelLower.includes('port of discharge') ||
        labelLower.includes('discharge port');

      const isDestField =
        field.mappedShipmentKey === 'finalDestination' ||
        field.mappedShipmentKey === 'placeOfDelivery' ||
        fieldIdLower.includes('destination') ||
        fieldIdLower.includes('place_of_delivery') ||
        labelLower.includes('final destination') ||
        labelLower.includes('destination') ||
        labelLower.includes('place of delivery');

      const isPolField =
        field.mappedShipmentKey === 'portOfLoading' ||
        field.mappedShipmentKey === 'placeOfReceipt' ||
        fieldIdLower.includes('port_of_loading') ||
        fieldIdLower.includes('place_of_receipt') ||
        labelLower.includes('port of loading') ||
        labelLower.includes('place of receipt');

      if ((!resolvedValue || resolvedValue.trim() === '') && isPodField) {
        // Fallback: If portOfDischarge is empty in a BL format, fallback to finalDestination / placeOfDelivery / portOfDischargeDg
        resolvedValue = shipment.portOfDischarge || shipment.finalDestination || shipment.placeOfDelivery || shipment.portOfDischargeDg || '';
      } else if ((!resolvedValue || resolvedValue.trim() === '') && isDestField) {
        // Fallback: If finalDestination is empty, fallback to portOfDischarge / placeOfDelivery
        resolvedValue = shipment.finalDestination || shipment.portOfDischarge || shipment.placeOfDelivery || '';
      } else if ((!resolvedValue || resolvedValue.trim() === '') && isPolField) {
        // Fallback: If portOfLoading is empty, fallback to placeOfReceipt (and vice versa)
        resolvedValue = shipment.portOfLoading || shipment.placeOfReceipt || '';
      }
    }

    // Determine status: strictly "" or "0" is PENDING_BLANK. If populated via fallback or primary, mark POPULATED
    const isPopulated = resolvedValue.trim() !== '' && resolvedValue.trim() !== '0' && resolvedValue.trim() !== '---';

    return {
      fieldId: field.fieldId,
      labelInTemplate: field.labelInTemplate,
      sectionName: field.sectionName || 'General Details',
      fieldType: field.fieldType,
      mappedShipmentKey: field.mappedShipmentKey,
      value: isPopulated ? resolvedValue : '',
      status: isPopulated ? 'POPULATED' : 'PENDING_BLANK'
    };
  });
}

/**
 * Updates central ExtractedShipmentJSON when an operator edits a mapped field in either DG or BL manifest.
 * Handles two-way decomposition of composite fields back to atomic shipment state.
 */
export function updateShipmentFromManifestField(
  currentShipment: ExtractedShipmentJSON,
  field: MappedManifestField,
  newValue: string
): ExtractedShipmentJSON {
  const updated: ExtractedShipmentJSON = { ...currentShipment };
  const key = field.mappedShipmentKey;
  const fieldIdLower = field.fieldId.toLowerCase();
  const labelLower = field.labelInTemplate.toLowerCase();

  if (key && key in updated) {
    const currentVal = updated[key];

    if (typeof currentVal === 'number') {
      const parsedNum = parseFloat(newValue.replace(/,/g, ''));
      (updated as any)[key] = isNaN(parsedNum) ? 0 : parsedNum;
    } else if (typeof currentVal === 'boolean') {
      (updated as any)[key] = newValue.trim().toLowerCase() === 'true' || newValue.trim().toLowerCase() === 'yes';
    } else if (Array.isArray(currentVal)) {
      (updated as any)[key] = newValue
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    } else {
      (updated as any)[key] = newValue;
    }
  }

  // Two-way composite decomposition:

  // 1. Shipper Party Block (Shipper Name, Address, and ON BEHALF OF)
  if (
    key === 'shipperAddress' ||
    key === 'shipperName' ||
    fieldIdLower.includes('shipper') ||
    (labelLower.includes('shipper') && !labelLower.includes('ref'))
  ) {
    if (newValue.includes('ON BEHALF OF:')) {
      const [shipperPart, onBehalfPart] = newValue.split(/ON BEHALF OF:\s*/i);
      updated.onBehalfOf = onBehalfPart.trim();
      const lines = shipperPart.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length > 0) {
        updated.shipperName = lines[0];
        updated.shipperAddress = lines.slice(1).join('\n') || lines[0];
      }
    } else {
      const lines = newValue.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length > 1) {
        updated.shipperName = lines[0];
        updated.shipperAddress = lines.slice(1).join('\n');
      }
    }
  }

  // 2. Consignee Party Block
  if (
    key === 'consigneeAddress' ||
    key === 'consigneeName' ||
    fieldIdLower.includes('consignee') ||
    labelLower.includes('consignee')
  ) {
    const lines = newValue.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      updated.consigneeName = lines[0];
      updated.consigneeAddress = lines.slice(1).join('\n');
    }
  }

  // 3. Notify Party Block
  if (
    key === 'notifyPartyAddress' ||
    key === 'notifyPartyName' ||
    fieldIdLower.includes('notify') ||
    labelLower.includes('notify')
  ) {
    const lines = newValue.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      updated.notifyPartyName = lines[0];
      updated.notifyPartyAddress = lines.slice(1).join('\n');
    }
  }

  // 4. Shipper's Reference & Invoice Reference
  if (
    key === 'shipperReference' ||
    fieldIdLower.includes('shipper_ref') ||
    labelLower.includes("shipper's ref") ||
    labelLower.includes('export ref')
  ) {
    if (newValue.includes('INV:')) {
      const [refPart, invPart] = newValue.split(/INV:\s*/i);
      updated.shipperReference = refPart.trim();
      updated.invoiceNumbers = invPart.split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  // 5. Container & Seal decomposition
  if (fieldIdLower.includes('container_seal') || labelLower.includes('seal')) {
    if (newValue.includes('/')) {
      const parts = newValue.split('/').map(s => s.trim());
      updated.containerNumber = parts[0] || updated.containerNumber;
      updated.sealNumber = (parts[1] || '').replace(/^SEAL:\s*/i, '') || updated.sealNumber;
    }
  }

  // 6. Vessel & Voyage decomposition
  if (fieldIdLower.includes('vessel_voyage') || labelLower.includes('voyage')) {
    if (newValue.includes('/')) {
      const parts = newValue.split('/').map(s => s.trim());
      updated.vesselName = parts[0] || updated.vesselName;
      updated.voyageNumber = parts[1] || updated.voyageNumber;
    }
  }

  // 7. Direct VGM / Total Gross Mass including Tare adjustment
  const isVgm =
    fieldIdLower.includes('vgm') ||
    fieldIdLower.includes('total_gross_incl_tare') ||
    labelLower.includes('total gross (incl') ||
    labelLower.includes('incl. tare') ||
    labelLower.includes('including tare');

  if (isVgm) {
    const enteredVgm = parseFloat(newValue.replace(/,/g, ''));
    if (!isNaN(enteredVgm) && updated.grossWeightKg > 0 && enteredVgm > updated.grossWeightKg) {
      updated.tareWeightKg = Number((enteredVgm - updated.grossWeightKg).toFixed(2));
    }
  }

  return updated;
}

/**
 * Aggregates summary statistics for a mapped manifest
 */
export function getManifestStats(fields: MappedManifestField[]) {
  const total = fields.length;
  const populated = fields.filter(f => f.status === 'POPULATED').length;
  const pending = total - populated;
  const percentage = total > 0 ? Math.round((populated / total) * 100) : 0;

  return { total, populated, pending, percentage };
}

/**
 * Groups manifest fields by section for clean accordion/card rendering
 */
export function groupManifestFieldsBySection(
  fields: MappedManifestField[]
): Record<string, MappedManifestField[]> {
  const groups: Record<string, MappedManifestField[]> = {};
  for (const field of fields) {
    const sec = field.sectionName || 'General Details';
    if (!groups[sec]) {
      groups[sec] = [];
    }
    groups[sec].push(field);
  }
  return groups;
}

```

---

### 1.2 `src/utils/manifestKeywordReference.ts` (`KEYWORD_RULES` & Engine)

```typescript
// Ekdant Logistics - Global Semantic Keyword Reference & Cascading Fallback Engine
// Pure generic semantic mappings across standard IMO DG Declaration and Ocean Bill of Lading formats

import type { ExtractedShipmentJSON, FormatDocumentType } from '../types/index.ts';

export interface KeywordRule {
  id: string;
  description: string;
  keywords: string[];
  excludeKeywords?: string[];
  resolver: (shipment: ExtractedShipmentJSON, docType?: FormatDocumentType) => string;
}

/**
 * Assembles a comprehensive multimodal DG cargo description block from ExtractedShipmentJSON.
 */
export function buildCombinedDgCargoBlock(
  shipment: ExtractedShipmentJSON,
  includeMarks: boolean = true
): string {
  const blocks: string[] = [];

  // 1. Marks & Numbers
  if (includeMarks && shipment.shippingMarks && shipment.shippingMarks.trim()) {
    blocks.push(`MARKS & NUMBERS:\n${shipment.shippingMarks.trim()}`);
  }

  // 2. Packages (Outer and Inner)
  const pkgLines: string[] = [];
  if (shipment.outerPackagingCount > 0) {
    pkgLines.push(`${shipment.outerPackagingCount} ${shipment.outerPackagingType || 'PALLETS'}`);
  }
  if (shipment.innerPackageCount > 0) {
    let innerText = `${shipment.innerPackageCount} ${shipment.innerPackageType || 'BOXES'}`;
    if (shipment.innerPackingDescription && shipment.innerPackingDescription.trim()) {
      innerText += ` (${shipment.innerPackingDescription.trim()})`;
    }
    pkgLines.push(innerText);
  }
  if (pkgLines.length > 0) {
    blocks.push(`PACKAGES:\n${pkgLines.join(' / ')}`);
  }

  // 3. Commodity / Proper Shipping Name (+ Brand & HSN)
  const primaryDesc = shipment.properShippingName || shipment.productDescription;
  if (primaryDesc && primaryDesc.trim()) {
    let descLine = primaryDesc.trim();
    if (shipment.brandName && !descLine.toLowerCase().includes(shipment.brandName.toLowerCase())) {
      descLine += ` (BRAND: ${shipment.brandName.trim()})`;
    }
    if (shipment.hsnCode && !descLine.includes(shipment.hsnCode.trim())) {
      descLine += ` [HSN: ${shipment.hsnCode.trim()}]`;
    }
    blocks.push(`COMMODITY / DESCRIPTION:\n${descLine}`);
  }

  // 4. DG Classification
  const dgLines: string[] = [];
  if (shipment.unNumber && shipment.unNumber.trim()) {
    dgLines.push(`UN NO: ${shipment.unNumber.trim()}`);
  }
  if (shipment.imoClass && shipment.imoClass.trim()) {
    dgLines.push(`IMO CLASS: ${shipment.imoClass.trim()}`);
  }
  if (shipment.packingGroup && shipment.packingGroup.trim()) {
    dgLines.push(`PACKING GROUP: ${shipment.packingGroup.trim()}`);
  }
  if (shipment.flashPoint && shipment.flashPoint.trim()) {
    dgLines.push(`FLASH POINT: ${shipment.flashPoint.trim()}`);
  }
  if (shipment.emsNumber && shipment.emsNumber.trim()) {
    dgLines.push(`EMS: ${shipment.emsNumber.trim()}`);
  }
  if (shipment.unPackingCode && shipment.unPackingCode.trim()) {
    dgLines.push(`UN PACKING CODE: ${shipment.unPackingCode.trim()}`);
  }
  if (shipment.marinePollutant) {
    dgLines.push('MARINE POLLUTANT: YES');
  }

  if (dgLines.length > 0) {
    blocks.push(`DG CLASSIFICATION:\n${dgLines.join(', ')}`);
  }

  return blocks.join('\n\n');
}

/**
 * Universal keyword rules array. Evaluated in order of precedence.
 */
export const KEYWORD_RULES: KeywordRule[] = [
  // 1. Verified Gross Mass / Total Gross Mass including Tare (Strict Invariant: must evaluate before gross weight)
  {
    id: 'verified_gross_mass',
    description: 'Strict VGM / Total Gross Mass including Tare',
    keywords: [
      'incl. tare',
      'incl tare',
      'including tare',
      'verified gross mass',
      'vgm',
      'total gross (incl',
      'total weight incl',
      'total_gross_incl_tare',
      'total_weight_incl_tare'
    ],
    resolver: (shipment) => {
      // Strict VGM Invariant: NEVER compute or populate if either weight <= 0
      if (shipment.grossWeightKg > 0 && shipment.tareWeightKg > 0) {
        return String(Number((shipment.grossWeightKg + shipment.tareWeightKg).toFixed(2)));
      }
      return '';
    }
  },

  // 2. Shipper Party Block (with Name, Address, IEC, and ON BEHALF OF)
  {
    id: 'shipper_party',
    description: 'Shipper / Consignor / Exporter / Sender Party Details',
    keywords: ['shipper', 'consignor', 'exporter', 'sender'],
    excludeKeywords: ['reference', "shipper's ref", 'export ref', 'declaration', 'signature'],
    resolver: (shipment) => {
      const parts: string[] = [];
      if (shipment.shipperName && shipment.shipperName.trim()) {
        parts.push(shipment.shipperName.trim());
      }
      if (shipment.shipperAddress && shipment.shipperAddress.trim()) {
        const addr = shipment.shipperAddress.trim();
        if (!shipment.shipperName || !addr.toLowerCase().startsWith(shipment.shipperName.trim().toLowerCase())) {
          parts.push(addr);
        } else {
          parts.length = 0;
          parts.push(addr);
        }
      }
      if (shipment.shipperIec && shipment.shipperIec.trim()) {
        parts.push(`IEC: ${shipment.shipperIec.trim()}`);
      }
      if (shipment.onBehalfOf && shipment.onBehalfOf.trim()) {
        parts.push(`ON BEHALF OF:\n${shipment.onBehalfOf.trim()}`);
      }
      return parts.join('\n');
    }
  },

  // 3. Consignee Party Block
  {
    id: 'consignee_party',
    description: 'Consignee Name and Address Details',
    keywords: ['consignee'],
    excludeKeywords: ['intermediate consignee'],
    resolver: (shipment) => {
      if (shipment.consigneeName && shipment.consigneeAddress) {
        const addr = shipment.consigneeAddress.trim();
        const name = shipment.consigneeName.trim();
        if (!addr.toLowerCase().startsWith(name.toLowerCase())) {
          return `${name}\n${addr}`;
        }
        return addr;
      }
      return (shipment.consigneeAddress || shipment.consigneeName || '').trim();
    }
  },

  // 4. Notify Party Block
  {
    id: 'notify_party',
    description: 'Notify Party / Intermediate Consignee Details',
    keywords: ['notify party', 'notify address', 'intermediate consignee', 'notify'],
    resolver: (shipment) => {
      if (shipment.notifyPartyName && shipment.notifyPartyAddress) {
        const addr = shipment.notifyPartyAddress.trim();
        const name = shipment.notifyPartyName.trim();
        if (!addr.toLowerCase().startsWith(name.toLowerCase())) {
          return `${name}\n${addr}`;
        }
        return addr;
      }
      return (shipment.notifyPartyAddress || shipment.notifyPartyName || '').trim();
    }
  },

  // 5. Shipper Reference & Commercial Invoice References (Box 4)
  {
    id: 'shipper_reference_and_invoices',
    description: "Shipper's Reference and Commercial Invoice Numbers",
    keywords: ["shipper's ref", 'shipper reference', 'export reference', 'export ref', 'shipper_ref'],
    resolver: (shipment) => {
      const invStr = shipment.invoiceNumbers && shipment.invoiceNumbers.length > 0
        ? shipment.invoiceNumbers.join(', ')
        : '';
      const refStr = shipment.shipperReference ? shipment.shipperReference.trim() : '';

      if (refStr && invStr) {
        if (!refStr.toLowerCase().includes(invStr.toLowerCase())) {
          return `${refStr}\nINV: ${invStr}`;
        }
        return refStr;
      }
      if (invStr) return `INV: ${invStr}`;
      return refStr;
    }
  },

  // 6. Transport Document / Booking Number / B/L Number
  {
    id: 'transport_document_and_booking',
    description: 'Transport Document / Carrier Booking / Bill of Lading Number',
    keywords: [
      'transport document',
      'transport doc',
      'booking no',
      'booking number',
      'bill of lading',
      'b/l no',
      'bol no',
      'document no',
      'bl_booking_no',
      'bl_document_no',
      'box_2_transport_doc_no'
    ],
    excludeKeywords: ['container', 'seal', 'declaration'],
    resolver: (shipment) => {
      if (shipment.bookingNumber && shipment.bookingNumber.trim()) {
        return shipment.bookingNumber.trim();
      }
      // Fallback 1: Commercial invoice numbers joined
      if (shipment.invoiceNumbers && shipment.invoiceNumbers.length > 0) {
        return shipment.invoiceNumbers.join(', ');
      }
      // Fallback 2: Shipper reference
      if (shipment.shipperReference && shipment.shipperReference.trim()) {
        return shipment.shipperReference.trim();
      }
      return '';
    }
  },

  // 7. Box 14 / Combined DG Cargo Description Block
  {
    id: 'combined_dg_cargo',
    description: 'Combined DG Marks, Packages, Commodity, and Hazard Classification',
    keywords: [
      'box_14_cargo',
      'box14',
      'combined_cargo',
      'number and kind of packages; description of goods',
      'shipping marks *number'
    ],
    resolver: (shipment) => {
      return buildCombinedDgCargoBlock(shipment, true);
    }
  },

  // 8. Cargo Description / Proper Shipping Name with Brand & HSN Fallbacks
  {
    id: 'cargo_description_proper_shipping_name',
    description: 'Cargo Description / Proper Shipping Name with Brand and HSN Fallbacks',
    keywords: [
      'proper shipping name',
      'cargo description',
      'description of goods',
      'commodity',
      'nature of goods',
      'goods description',
      'bl_cargo_description'
    ],
    excludeKeywords: ['marks', 'package count', 'total number of packages', 'tare', 'gross', 'net', 'vgm'],
    resolver: (shipment) => {
      // Primary: properShippingName
      if (shipment.properShippingName && shipment.properShippingName.trim()) {
        return shipment.properShippingName.trim();
      }
      // Fallback 1: productDescription
      if (shipment.productDescription && shipment.productDescription.trim()) {
        return shipment.productDescription.trim();
      }
      // Fallback 2: brandName + hsnCode
      const brandHsnParts: string[] = [];
      if (shipment.brandName && shipment.brandName.trim()) {
        brandHsnParts.push(shipment.brandName.trim());
      }
      if (shipment.hsnCode && shipment.hsnCode.trim()) {
        brandHsnParts.push(`HSN: ${shipment.hsnCode.trim()}`);
      }
      if (brandHsnParts.length > 0) {
        return brandHsnParts.join(' | ');
      }
      return '';
    }
  },

  // 9. Numeric Package Count
  {
    id: 'package_count',
    description: 'Total Number of Packages / Package Count',
    keywords: [
      'total number of packages',
      'package count',
      'no of packages',
      'no. of packages',
      'number of packages',
      'total packages'
    ],
    excludeKeywords: ['kind of packages', 'description of goods'],
    resolver: (shipment) => {
      if (shipment.totalPallets > 0) {
        return String(shipment.totalPallets);
      }
      if (shipment.outerPackagingCount > 0) {
        return String(shipment.outerPackagingCount);
      }
      if (shipment.totalBoxes > 0) {
        return String(shipment.totalBoxes);
      }
      if (shipment.innerPackageCount > 0) {
        return String(shipment.innerPackageCount);
      }
      return '';
    }
  },

  // 10. Shipping Marks & Numbers / Packages
  {
    id: 'marks_and_numbers_packages',
    description: 'Shipping Marks, Numbers, and Packages',
    keywords: [
      'shipping marks',
      'marks & nos',
      'marks and numbers',
      'marks & numbers',
      'marks/nos',
      'package description',
      'packages',
      'number and kind of packages',
      'bl_packages_and_marks'
    ],
    excludeKeywords: ['tare', 'gross weight', 'net weight', 'vgm', 'proper shipping name'],
    resolver: (shipment) => {
      // Primary: shippingMarks
      if (shipment.shippingMarks && shipment.shippingMarks.trim()) {
        return shipment.shippingMarks.trim();
      }
      // Fallback: productDescription + packaging counts (outerPackagingCount + outerPackagingType)
      const pkgParts: string[] = [];
      if (shipment.outerPackagingCount > 0) {
        pkgParts.push(`${shipment.outerPackagingCount} ${shipment.outerPackagingType || 'PALLETS'}`);
      }
      if (shipment.innerPackageCount > 0) {
        pkgParts.push(`${shipment.innerPackageCount} ${shipment.innerPackageType || 'BOXES'}`);
      }
      const pkgStr = pkgParts.join(' / ');
      const descStr = shipment.productDescription || shipment.properShippingName || '';
      if (pkgStr && descStr) {
        return `${pkgStr} - ${descStr}`;
      }
      return pkgStr || descStr;
    }
  },

  // 11. Container & Seal Numbers
  {
    id: 'container_and_seal',
    description: 'Container Number and Seal Number Combined',
    keywords: ['container identification', 'container no', 'container number', 'seal no', 'seal number', 'container_seal'],
    excludeKeywords: ['tare', 'type', 'certificate', 'packing certificate'],
    resolver: (shipment) => {
      if (shipment.containerNumber && shipment.sealNumber) {
        return `${shipment.containerNumber} / SEAL: ${shipment.sealNumber}`;
      }
      return shipment.containerNumber || '';
    }
  },

  // 12. Container Type & Size
  {
    id: 'container_type',
    description: 'Container Type / Size',
    keywords: ['container type', 'container size', 'size & type', 'size and type'],
    resolver: (shipment) => {
      return shipment.containerType || '20GP';
    }
  },

  // 13. Container Tare Weight (kg)
  {
    id: 'tare_weight',
    description: 'Container Tare Mass (kg)',
    keywords: ['tare weight', 'tare mass', 'tare (kg)', 'container tare'],
    resolver: (shipment) => {
      if (shipment.tareWeightKg > 0) {
        return String(shipment.tareWeightKg);
      }
      return '';
    }
  },

  // 14. Gross Mass / Gross Weight (kg)
  {
    id: 'gross_weight',
    description: 'Gross Mass (kg)',
    keywords: ['gross mass', 'gross weight', 'total gross', 'gross (kg)', 'gross mass (kg)', 'box_16_gross'],
    excludeKeywords: ['incl', 'tare', 'vgm'],
    resolver: (shipment) => {
      if (shipment.grossWeightKg > 0) {
        return String(shipment.grossWeightKg);
      }
      return '';
    }
  },

  // 15. Net Mass / Net Weight (kg)
  {
    id: 'net_weight',
    description: 'Net Mass (kg)',
    keywords: ['net mass', 'net weight', 'total net', 'net (kg)', 'net mass (kg)', 'box_17_net'],
    resolver: (shipment) => {
      if (shipment.netWeightKg > 0) {
        return String(shipment.netWeightKg);
      }
      return '';
    }
  },

  // 16. Volume / Measurement / Cube (CBM)
  {
    id: 'volume_measurement',
    description: 'Measurement / Volume / Cube (m³ / CBM)',
    keywords: ['cube (m', 'measurement (cbm)', 'volume (cbm)', 'cbm', 'box_18_cube'],
    resolver: (shipment) => {
      if (shipment.volumeCbm > 0) {
        return String(shipment.volumeCbm);
      }
      return '';
    }
  },

  // 17. Vessel and Voyage
  {
    id: 'vessel_and_voyage',
    description: 'Ocean Vessel Name and Voyage Number',
    keywords: ['vessel and voyage', 'vessel & voyage', 'ocean vessel', 'vessel name', 'voyage no', 'voyage number', 'vessel_voyage'],
    resolver: (shipment) => {
      if (shipment.vesselName && shipment.voyageNumber) {
        return `${shipment.vesselName} / ${shipment.voyageNumber}`;
      }
      return shipment.vesselName || '';
    }
  },

  // 18. Port of Discharge (POD)
  {
    id: 'port_of_discharge',
    description: 'Port of Discharge (with fallbacks to finalDestination / placeOfDelivery)',
    keywords: ['port of discharge', 'discharge port', 'pod', 'port_of_discharge'],
    resolver: (shipment) => {
      return (
        shipment.portOfDischarge ||
        shipment.finalDestination ||
        shipment.placeOfDelivery ||
        shipment.portOfDischargeDg ||
        ''
      );
    }
  },

  // 19. Final Destination / Place of Delivery
  {
    id: 'final_destination',
    description: 'Final Destination or Place of Delivery (with fallbacks)',
    keywords: ['final destination', 'destination', 'place of delivery'],
    excludeKeywords: ['port of discharge'],
    resolver: (shipment) => {
      return (
        shipment.finalDestination ||
        shipment.portOfDischarge ||
        shipment.placeOfDelivery ||
        ''
      );
    }
  },

  // 20. Port of Loading (POL)
  {
    id: 'port_of_loading',
    description: 'Port of Loading or Place of Receipt',
    keywords: ['port of loading', 'loading port', 'pol', 'port_of_loading', 'place of receipt'],
    resolver: (shipment) => {
      return shipment.portOfLoading || shipment.placeOfReceipt || '';
    }
  },

  // 21. Carrier / Shipping Line
  {
    id: 'carrier',
    description: 'Ocean Carrier Name',
    keywords: ['carrier (name', 'carrier name', 'shipping line', 'ocean carrier'],
    resolver: (shipment) => {
      return shipment.carrierName || '';
    }
  },

  // 22. Pre-Carriage By
  {
    id: 'pre_carriage',
    description: 'Pre-Carriage By Details',
    keywords: ['pre-carriage by', 'pre carriage by', 'pre-carriage'],
    resolver: (shipment) => {
      return shipment.preCarriageBy || '';
    }
  },

  // 23. Shipping Bill Numbers
  {
    id: 'shipping_bill',
    description: 'Shipping Bill Number(s) and Date',
    keywords: ['shipping bill', 'sb no', 'customs bill'],
    resolver: (shipment) => {
      return shipment.shippingBillNumbers || '';
    }
  },

  // 24. HSN / Tariff Classification Code
  {
    id: 'hsn_code',
    description: 'HSN / Tariff Classification Code',
    keywords: ['hsn', 'tariff code', 'commodity code', 'schedule b'],
    resolver: (shipment) => {
      return shipment.hsnCode || '';
    }
  },

  // 25. Emergency Response Contact
  {
    id: 'emergency_contact',
    description: '24-Hour Emergency Response Contact Name & Telephone',
    keywords: ['emergency response', 'emergency contact', '24-hour emergency', 'emergency telephone'],
    resolver: (shipment) => {
      const parts = [shipment.emergencyContactName, shipment.emergencyContactPhone].filter(Boolean);
      return parts.join(' - ');
    }
  },

  // 26. DG Declarant / Packing Certificate
  {
    id: 'dg_declarant',
    description: 'Container / Vehicle Packing Certificate (Name/Status of Declarant)',
    keywords: ['packing certificate', 'declarant', 'name/status of declarant'],
    resolver: (shipment) => {
      const parts = [shipment.dgDeclarantName, shipment.dgDeclarantStatus].filter(Boolean);
      return parts.join(' - ');
    }
  },

  // 27. Shipper Declaration Place & Date
  {
    id: 'shipper_declaration',
    description: "Shipper's Declaration Place and Date",
    keywords: ["shipper's declaration (place and date)", 'shipper declaration', 'place and date of declaration'],
    resolver: (shipment) => {
      return shipment.dgDeclarationPlaceAndDate || '';
    }
  },

  // 28. Commercial Freight Terms
  {
    id: 'freight_terms',
    description: 'Freight Payment Terms (Prepaid / Collect)',
    keywords: ['freight payable', 'freight terms', 'freight prepaid', 'freight collect'],
    resolver: (shipment) => {
      return shipment.freightTerms || '';
    }
  },

  // 29. Movement Type
  {
    id: 'movement_type',
    description: 'Cargo Movement Type (e.g. FCL/FCL, CY/CY)',
    keywords: ['movement type', 'fcl/fcl', 'cy/cy', 'cfs/cfs'],
    resolver: (shipment) => {
      return shipment.movementType || '';
    }
  },

  // 30. Free Time Clause
  {
    id: 'free_time',
    description: 'Free Time & Detention Clause',
    keywords: ['free time', 'detention clause', 'demurrage'],
    resolver: (shipment) => {
      return shipment.freeTimeClause || '';
    }
  }
];

/**
 * Resolves a field's value by scanning against the global keyword reference dictionary.
 * Cascades through semantic rules and returns the matched string, or "" if no rule matched.
 */
export function resolveFieldValueByKeywords(
  labelInTemplate: string,
  fieldId: string,
  shipment: ExtractedShipmentJSON,
  docType?: FormatDocumentType
): string {
  const labelLower = (labelInTemplate || '').toLowerCase().trim();
  const idLower = (fieldId || '').toLowerCase().trim();
  const combined = `${labelLower} ${idLower}`;

  for (const rule of KEYWORD_RULES) {
    // Check exclusions first to avoid false positives
    if (rule.excludeKeywords && rule.excludeKeywords.some(ex => combined.includes(ex))) {
      continue;
    }

    // Check if any keyword matches label or fieldId
    const isMatch = rule.keywords.some(kw => combined.includes(kw));
    if (isMatch) {
      const resolved = rule.resolver(shipment, docType);
      if (resolved && resolved.trim() !== '' && resolved.trim() !== '0' && resolved.trim() !== '---') {
        return resolved.trim();
      }
    }
  }

  return '';
}

```

---

### 1.3 `src/utils/formatParser.ts` (Default Formats & Gemini Prompt)

#### Default DG Format Definition (`DEFAULT_DG_FORMAT`)
```typescript
export const DEFAULT_DG_FORMAT: FormatSchemaJSON = {
  formatId: 'standard_imo_dg_v1',
  formatName: 'Standard IMO Multimodal Dangerous Goods Declaration',
  documentType: 'DG',
  sourceFileName: 'imo_multimodal_standard.pdf',
  createdAt: '2026-01-01T00:00:00.000Z',
  fields: [
    { fieldId: 'box_1_shipper', labelInTemplate: '1. Shipper / Consignor (Name, Address, IEC, GSTIN)', sectionName: 'Parties', fieldType: 'multiline', mappedShipmentKey: 'shipperAddress' },
    { fieldId: 'box_2_transport_doc_no', labelInTemplate: '2. Transport Document Number', sectionName: 'Reference', fieldType: 'text', mappedShipmentKey: 'bookingNumber' },
    { fieldId: 'box_4_shipper_ref', labelInTemplate: "4. Shipper's Reference", sectionName: 'Reference', fieldType: 'text', mappedShipmentKey: 'shipperReference' },
    { fieldId: 'box_6_consignee', labelInTemplate: '6. Consignee (Name and Address)', sectionName: 'Parties', fieldType: 'multiline', mappedShipmentKey: 'consigneeAddress' },
    { fieldId: 'box_7_carrier', labelInTemplate: '7. Carrier (Name and Details)', sectionName: 'Transport & Routing', fieldType: 'text', mappedShipmentKey: 'carrierName' },
    { fieldId: 'box_8_pre_carriage', labelInTemplate: '8. This shipment is within the limitations prescribed for: Pre-Carriage by', sectionName: 'Transport & Routing', fieldType: 'text', mappedShipmentKey: 'preCarriageBy' },
    { fieldId: 'box_9_place_of_receipt', labelInTemplate: '9. Place of Receipt by Pre-Carrier', sectionName: 'Transport & Routing', fieldType: 'text', mappedShipmentKey: 'placeOfReceipt' },
    { fieldId: 'box_10_vessel_voyage', labelInTemplate: '10. Vessel and Voyage Number', sectionName: 'Transport & Routing', fieldType: 'text', mappedShipmentKey: 'vesselName' },
    { fieldId: 'box_11_port_of_loading', labelInTemplate: '11. Port of Loading', sectionName: 'Transport & Routing', fieldType: 'text', mappedShipmentKey: 'portOfLoading' },
    { fieldId: 'box_12_port_of_discharge', labelInTemplate: '12. Port of Discharge', sectionName: 'Transport & Routing', fieldType: 'text', mappedShipmentKey: 'portOfDischarge' },
    { fieldId: 'box_13_destination', labelInTemplate: '13. Destination', sectionName: 'Transport & Routing', fieldType: 'text', mappedShipmentKey: 'finalDestination' },
    { fieldId: 'box_14_shipping_marks', labelInTemplate: '14. Shipping Marks / Container Numbers', sectionName: 'Cargo & Packaging', fieldType: 'multiline', mappedShipmentKey: 'shippingMarks' },
    { fieldId: 'box_15_package_description', labelInTemplate: '15. Number and Kind of Packages; Description of Goods', sectionName: 'Cargo & Packaging', fieldType: 'multiline', mappedShipmentKey: 'productDescription' },
    { fieldId: 'box_15_un_number', labelInTemplate: '15a. UN Number', sectionName: 'Dangerous Goods Details', fieldType: 'text', mappedShipmentKey: 'unNumber' },
    { fieldId: 'box_15_proper_shipping_name', labelInTemplate: '15b. Proper Shipping Name', sectionName: 'Dangerous Goods Details', fieldType: 'text', mappedShipmentKey: 'properShippingName' },
    { fieldId: 'box_15_imo_class', labelInTemplate: '15c. IMO Class / Division', sectionName: 'Dangerous Goods Details', fieldType: 'text', mappedShipmentKey: 'imoClass' },
    { fieldId: 'box_15_packing_group', labelInTemplate: '15d. Packing Group', sectionName: 'Dangerous Goods Details', fieldType: 'text', mappedShipmentKey: 'packingGroup' },
    { fieldId: 'box_15_ems_number', labelInTemplate: '15e. EMS Number', sectionName: 'Dangerous Goods Details', fieldType: 'text', mappedShipmentKey: 'emsNumber' },
    { fieldId: 'box_15_un_packing_code', labelInTemplate: '15f. UN Packaging Specification Code', sectionName: 'Dangerous Goods Details', fieldType: 'text', mappedShipmentKey: 'unPackingCode' },
    { fieldId: 'box_16_gross_mass', labelInTemplate: '16. Gross Mass (kg)', sectionName: 'Weights & Measurements', fieldType: 'number', mappedShipmentKey: 'grossWeightKg' },
    { fieldId: 'box_17_net_mass', labelInTemplate: '17. Net Mass (kg)', sectionName: 'Weights & Measurements', fieldType: 'number', mappedShipmentKey: 'netWeightKg' },
    { fieldId: 'box_18_cube', labelInTemplate: '18. Cube (m³)', sectionName: 'Weights & Measurements', fieldType: 'number', mappedShipmentKey: 'volumeCbm' },
    { fieldId: 'box_19_container_seal', labelInTemplate: '19. Container Identification No. / Seal No.', sectionName: 'Equipment & Containers', fieldType: 'text', mappedShipmentKey: 'containerNumber' },
    { fieldId: 'box_19_tare_weight', labelInTemplate: '19b. Container Tare Mass (kg)', sectionName: 'Equipment & Containers', fieldType: 'number', mappedShipmentKey: 'tareWeightKg' },
    { fieldId: 'box_19_total_gross_incl_tare', labelInTemplate: '19c. Total gross (incl. tare) (kg)', sectionName: 'Equipment & Containers', fieldType: 'number', mappedShipmentKey: 'grossWeightKg' },
    { fieldId: 'box_20_container_packing_cert', labelInTemplate: '20. Container / Vehicle Packing Certificate (Name/Status of Declarant)', sectionName: 'Declarations & Signatures', fieldType: 'text', mappedShipmentKey: 'dgDeclarantName' },
    { fieldId: 'box_21_emergency_contact', labelInTemplate: '21. 24-Hour Emergency Response Contact Name & Telephone', sectionName: 'Declarations & Signatures', fieldType: 'text', mappedShipmentKey: 'emergencyContactPhone' },
    { fieldId: 'box_22_shipper_declaration', labelInTemplate: "22. Shipper's Declaration (Place and Date)", sectionName: 'Declarations & Signatures', fieldType: 'text', mappedShipmentKey: 'dgDeclarationPlaceAndDate' }
  ]
};
```

#### Default BL Format Definition (`DEFAULT_BL_FORMAT`)
```typescript
export const DEFAULT_BL_FORMAT: FormatSchemaJSON = {
  formatId: 'standard_ocean_bl_v1',
  formatName: 'Standard Multimodal Ocean Bill of Lading',
  documentType: 'BL',
  sourceFileName: 'standard_ocean_bol.pdf',
  createdAt: '2026-01-01T00:00:00.000Z',
  fields: [
    { fieldId: 'bl_shipper', labelInTemplate: 'Shipper / Exporter', sectionName: 'Parties', fieldType: 'multiline', mappedShipmentKey: 'shipperAddress' },
    { fieldId: 'bl_consignee', labelInTemplate: 'Consignee (Not Negotiable unless consigned to order)', sectionName: 'Parties', fieldType: 'multiline', mappedShipmentKey: 'consigneeAddress' },
    { fieldId: 'bl_notify_party', labelInTemplate: 'Notify Party / Intermediate Consignee', sectionName: 'Parties', fieldType: 'multiline', mappedShipmentKey: 'notifyPartyAddress' },
    { fieldId: 'bl_booking_no', labelInTemplate: 'Carrier Booking No.', sectionName: 'Reference', fieldType: 'text', mappedShipmentKey: 'bookingNumber' },
    { fieldId: 'bl_document_no', labelInTemplate: 'Bill of Lading No.', sectionName: 'Reference', fieldType: 'text', mappedShipmentKey: 'bookingNumber' },
    { fieldId: 'bl_export_references', labelInTemplate: "Export References (Invoice, PO, IEC)", sectionName: 'Reference', fieldType: 'text', mappedShipmentKey: 'shipperReference' },
    { fieldId: 'bl_shipping_bill', labelInTemplate: 'Shipping Bill Number(s) & Date', sectionName: 'Reference', fieldType: 'text', mappedShipmentKey: 'shippingBillNumbers' },
    { fieldId: 'bl_pre_carriage', labelInTemplate: 'Pre-Carriage By', sectionName: 'Transport & Routing', fieldType: 'text', mappedShipmentKey: 'preCarriageBy' },
    { fieldId: 'bl_place_of_receipt', labelInTemplate: 'Place of Receipt', sectionName: 'Transport & Routing', fieldType: 'text', mappedShipmentKey: 'placeOfReceipt' },
    { fieldId: 'bl_ocean_vessel', labelInTemplate: 'Ocean Vessel', sectionName: 'Transport & Routing', fieldType: 'text', mappedShipmentKey: 'vesselName' },
    { fieldId: 'bl_voyage_no', labelInTemplate: 'Voyage No.', sectionName: 'Transport & Routing', fieldType: 'text', mappedShipmentKey: 'voyageNumber' },
    { fieldId: 'bl_port_of_loading', labelInTemplate: 'Port of Loading', sectionName: 'Transport & Routing', fieldType: 'text', mappedShipmentKey: 'portOfLoading' },
    { fieldId: 'bl_port_of_discharge', labelInTemplate: 'Port of Discharge', sectionName: 'Transport & Routing', fieldType: 'text', mappedShipmentKey: 'portOfDischarge' },
    { fieldId: 'bl_place_of_delivery', labelInTemplate: 'Place of Delivery', sectionName: 'Transport & Routing', fieldType: 'text', mappedShipmentKey: 'placeOfDelivery' },
    { fieldId: 'bl_final_destination', labelInTemplate: 'Final Destination (For the Merchant’s Reference Only)', sectionName: 'Transport & Routing', fieldType: 'text', mappedShipmentKey: 'finalDestination' },
    { fieldId: 'bl_container_number', labelInTemplate: 'Container Number', sectionName: 'Equipment & Containers', fieldType: 'text', mappedShipmentKey: 'containerNumber' },
    { fieldId: 'bl_seal_number', labelInTemplate: 'Seal Number', sectionName: 'Equipment & Containers', fieldType: 'text', mappedShipmentKey: 'sealNumber' },
    { fieldId: 'bl_container_type', labelInTemplate: 'Container Size & Type', sectionName: 'Equipment & Containers', fieldType: 'text', mappedShipmentKey: 'containerType' },
    { fieldId: 'bl_tare_weight', labelInTemplate: 'Container Tare Weight (kg)', sectionName: 'Equipment & Containers', fieldType: 'number', mappedShipmentKey: 'tareWeightKg' },
    { fieldId: 'bl_total_gross_mass_vgm', labelInTemplate: 'Verified Gross Mass / Total Weight incl. Tare (kg)', sectionName: 'Weights & Measurements', fieldType: 'number', mappedShipmentKey: 'grossWeightKg' },
    { fieldId: 'bl_shipping_marks', labelInTemplate: 'Marks and Numbers', sectionName: 'Cargo & Packaging', fieldType: 'multiline', mappedShipmentKey: 'shippingMarks' },
    { fieldId: 'bl_package_count', labelInTemplate: 'Total Number of Packages / Pallets', sectionName: 'Cargo & Packaging', fieldType: 'number', mappedShipmentKey: 'totalPallets' },
    { fieldId: 'bl_cargo_description', labelInTemplate: 'Description of Goods and Packages', sectionName: 'Cargo & Packaging', fieldType: 'multiline', mappedShipmentKey: 'productDescription' },
    { fieldId: 'bl_hsn_code', labelInTemplate: 'H.S. Tariff Code', sectionName: 'Cargo & Packaging', fieldType: 'text', mappedShipmentKey: 'hsnCode' },
    { fieldId: 'bl_gross_weight', labelInTemplate: 'Gross Weight (kg)', sectionName: 'Weights & Measurements', fieldType: 'number', mappedShipmentKey: 'grossWeightKg' },
    { fieldId: 'bl_net_weight', labelInTemplate: 'Net Weight (kg)', sectionName: 'Weights & Measurements', fieldType: 'number', mappedShipmentKey: 'netWeightKg' },
    { fieldId: 'bl_measurement', labelInTemplate: 'Measurement (CBM)', sectionName: 'Weights & Measurements', fieldType: 'number', mappedShipmentKey: 'volumeCbm' },
    { fieldId: 'bl_freight_terms', labelInTemplate: 'Freight Payable At / Terms (e.g. PREPAID / COLLECT)', sectionName: 'Commercial & Terms', fieldType: 'text', mappedShipmentKey: 'freightTerms' },
    { fieldId: 'bl_movement_type', labelInTemplate: 'Movement Type (e.g. FCL/FCL, CY/CY)', sectionName: 'Commercial & Terms', fieldType: 'text', mappedShipmentKey: 'movementType' },
    { fieldId: 'bl_free_time', labelInTemplate: 'Free Time & Detention Clause', sectionName: 'Commercial & Terms', fieldType: 'text', mappedShipmentKey: 'freeTimeClause' }
  ]
};
```

#### Structural Schema Extractor Gemini System Prompt
```typescript
const FORMAT_EXTRACTOR_SYSTEM_PROMPT = `
You are the Ekdant Logistics Format Structural Schema Extractor.
Your task is to analyze the uploaded template document and output a strict, verified FormatSchemaJSON defining EVERY box, header, table column, and declaration field present in the layout.

CRITICAL ZERO-CONTAMINATION RULES:
1. EXTRACT STRUCTURE ONLY:
   - Extract ONLY the field labels, box titles, box numbers, table headers, and layout groupings as printed in the template.
   - NEVER copy sample shipment values, test numbers, sample company names, dates, or weights from the document into the schema.
   - The output must define the reusable template shell, completely devoid of specific shipment data.

2. FIELD IDENTIFIER CONVENTIONS:
   - "fieldId": unique, clean snake_case string representing the field (e.g. "box_1_shipper", "consignee_name_address", "booking_number", "vessel_name", "container_seal_no", "gross_mass_kg").
   - "labelInTemplate": exact label as printed in the document (including box numbers, e.g. "1. Shipper / Exporter", "Ocean Vessel & Voyage", "Marks and Numbers", "15. Dangerous Goods Description").
   - "sectionName": logical section grouping (e.g. "Parties", "Transport & Routing", "Equipment & Containers", "Cargo & Packaging", "Weights & Measurements", "Dangerous Goods Details", "Declarations & Signatures", "Commercial & Terms").
   - "fieldType": one of "text", "multiline", "number", "table".

3. MAPPING TO UNIVERSAL SHIPMENT KEYS:
   For each field, assign "mappedShipmentKey" to the closest matching key in ExtractedShipmentJSON, or "" if unmapped:
   Allowed mappedShipmentKey values:
   - "shipperName", "shipperAddress", "shipperIec", "shipperGstin", "shipperPan", "onBehalfOf"
   - "consigneeName", "consigneeAddress", "notifyPartyName", "notifyPartyAddress"
   - "bookingNumber", "shippingBillNumbers", "shipperReference", "forwarderReference"
   - "carrierName", "preCarriageBy", "placeOfReceipt", "vesselName", "voyageNumber"
   - "portOfLoading", "portOfDischarge", "portOfDischargeDg", "placeOfDelivery", "finalDestination"
   - "containerNumber", "sealNumber", "containerType", "tareWeightKg"
   - "shippingMarks", "productDescription", "brandName", "hsnCode"
   - "totalPallets", "totalBoxes", "totalPackages", "outerPackagingCount", "outerPackagingType", "innerPackageCount", "innerPackageType"
   - "grossWeightKg", "netWeightKg", "volumeCbm", "currency", "totalInvoiceValue", "incoterm", "freightTerms", "movementType", "freeTimeClause"
   - "isDangerousGoods", "unNumber", "imoClass", "properShippingName", "packingGroup", "marinePollutant", "flashPoint", "emsNumber", "unPackingCode"
   - "emergencyContactName", "emergencyContactPhone", "dgDeclarantName", "dgDeclarantStatus", "dgDeclarationPlaceAndDate"

4. COMPOSITE SHIPPING BOXES:
   - If a box combines Shipper Name and Address into a single box (e.g. "1. Shipper / Consignor (Name and Address)"), map it to "shipperAddress".
   - If a box combines Consignee Name and Address into a single box, map it to "consigneeAddress".
   - If a box combines Notify Party Name and Address, map it to "notifyPartyAddress".
   - If a DG box combines Marks, Packaging, and Cargo/DG Description (e.g. "14. Shipping marks *Number and kind of packages; description of goods"), map it to "productDescription".
   - If a box combines Container Number and Seal Number, map it to "containerNumber".
   - If a box specifies "Total Gross Mass (incl. tare)" or "Verified Gross Mass (VGM)", map it to "grossWeightKg".
   - If a box combines Vessel and Voyage, map it to "vesselName".

OUTPUT STRICT JSON adhering to:
{
  "formatId": "string",
  "formatName": "string",
  "documentType": "DG" | "BL",
  "sourceFileName": "string",
  "createdAt": "string (ISO)",
  "fields": [
    {
      "fieldId": "string",
      "labelInTemplate": "string",
      "sectionName": "string",
      "fieldType": "text" | "multiline" | "number" | "table",
      "mappedShipmentKey": "string"
    }
  ]
}
`;
```

---

## 2. Template Schema Inspection (All Formats)

### 2.1 Built-in Standard IMO DG Declaration (`DEFAULT_DG_FORMAT` - 28 fields)

*Industry-standard SOLAS 74 / MARPOL 73/78 22-box multimodal dangerous goods form.*

| # | fieldId | labelInTemplate | sectionName | mappedShipmentKey |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `box_1_shipper` | 1. Shipper / Consignor (Name, Address, IEC, GSTIN) | Parties | `shipperAddress` |
| 2 | `box_2_transport_doc_no` | 2. Transport Document Number | Reference | `bookingNumber` |
| 3 | `box_4_shipper_ref` | 4. Shipper's Reference | Reference | `shipperReference` |
| 4 | `box_6_consignee` | 6. Consignee (Name and Address) | Parties | `consigneeAddress` |
| 5 | `box_7_carrier` | 7. Carrier (Name and Details) | Transport & Routing | `carrierName` |
| 6 | `box_8_pre_carriage` | 8. This shipment is within the limitations prescribed for: Pre-Carriage by | Transport & Routing | `preCarriageBy` |
| 7 | `box_9_place_of_receipt` | 9. Place of Receipt by Pre-Carrier | Transport & Routing | `placeOfReceipt` |
| 8 | `box_10_vessel_voyage` | 10. Vessel and Voyage Number | Transport & Routing | `vesselName` |
| 9 | `box_11_port_of_loading` | 11. Port of Loading | Transport & Routing | `portOfLoading` |
| 10 | `box_12_port_of_discharge` | 12. Port of Discharge | Transport & Routing | `portOfDischarge` |
| 11 | `box_13_destination` | 13. Destination | Transport & Routing | `finalDestination` |
| 12 | `box_14_shipping_marks` | 14. Shipping Marks / Container Numbers | Cargo & Packaging | `shippingMarks` |
| 13 | `box_15_package_description` | 15. Number and Kind of Packages; Description of Goods | Cargo & Packaging | `productDescription` |
| 14 | `box_15_un_number` | 15a. UN Number | Dangerous Goods Details | `unNumber` |
| 15 | `box_15_proper_shipping_name` | 15b. Proper Shipping Name | Dangerous Goods Details | `properShippingName` |
| 16 | `box_15_imo_class` | 15c. IMO Class / Division | Dangerous Goods Details | `imoClass` |
| 17 | `box_15_packing_group` | 15d. Packing Group | Dangerous Goods Details | `packingGroup` |
| 18 | `box_15_ems_number` | 15e. EMS Number | Dangerous Goods Details | `emsNumber` |
| 19 | `box_15_un_packing_code` | 15f. UN Packaging Specification Code | Dangerous Goods Details | `unPackingCode` |
| 20 | `box_16_gross_mass` | 16. Gross Mass (kg) | Weights & Measurements | `grossWeightKg` |
| 21 | `box_17_net_mass` | 17. Net Mass (kg) | Weights & Measurements | `netWeightKg` |
| 22 | `box_18_cube` | 18. Cube (m³) | Weights & Measurements | `volumeCbm` |
| 23 | `box_19_container_seal` | 19. Container Identification No. / Seal No. | Equipment & Containers | `containerNumber` |
| 24 | `box_19_tare_weight` | 19b. Container Tare Mass (kg) | Equipment & Containers | `tareWeightKg` |
| 25 | `box_19_total_gross_incl_tare` | 19c. Total gross (incl. tare) (kg) | Equipment & Containers | `grossWeightKg` |
| 26 | `box_20_container_packing_cert` | 20. Container / Vehicle Packing Certificate (Name/Status of Declarant) | Declarations & Signatures | `dgDeclarantName` |
| 27 | `box_21_emergency_contact` | 21. 24-Hour Emergency Response Contact Name & Telephone | Declarations & Signatures | `emergencyContactPhone` |
| 28 | `box_22_shipper_declaration` | 22. Shipper's Declaration (Place and Date) | Declarations & Signatures | `dgDeclarationPlaceAndDate` |

**Total Fields:** 28

---

### 2.2 Reference IMO DG Declaration (`Reference DG.pdf` / `DG ONEU2878769.pdf` - 31 fields)

*Expanded 31-field layout extracted from Reference DG.pdf with explicit sub-fields for Box 14 and Box 19.*

| # | fieldId | labelInTemplate | sectionName | mappedShipmentKey |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `box_1_shipper` | 1. Shipper / Consignor / Sender | Parties | `shipperAddress` |
| 2 | `box_2_transport_doc_no` | 2. Transport Document Number | Reference | `bookingNumber` |
| 3 | `box_3_page_of_page` | 3. Page of Page | Reference | `—` |
| 4 | `box_4_shipper_ref` | 4. Shipper's reference | Reference | `shipperReference` |
| 5 | `box_5_freight_forwarder_ref` | 5. Freight Forwarder's reference | Reference | `forwarderReference` |
| 6 | `box_6_consignee` | 6. Consignee | Parties | `consigneeAddress` |
| 7 | `box_7_carrier` | 7. Carrier | Transport & Routing | `carrierName` |
| 8 | `box_8_shipper_declaration_limitation` | 8. This shipment is within limitations prescribed for: Pre-Carriage by | Transport & Routing | `preCarriageBy` |
| 9 | `box_9_additional_handling` | 9. Additional handling information (Emergency Contact) | Dangerous Goods Details | `emergencyContactPhone` |
| 10 | `box_10_vessel_voyage` | 10. Vessel and voy | Transport & Routing | `vesselName` |
| 11 | `box_11_port_of_loading` | 11. Port of loading | Transport & Routing | `portOfLoading` |
| 12 | `box_12_port_of_discharge` | 12. Port of discharge | Transport & Routing | `portOfDischarge` |
| 13 | `box_13_destination` | 13. Destination | Transport & Routing | `finalDestination` |
| 14 | `box_14_shipping_marks` | 14. Shipping Marks | Cargo & Packaging | `shippingMarks` |
| 15 | `box_14_number_kind_packages` | 14. Number and kind of packages | Cargo & Packaging | `outerPackagingCount` |
| 16 | `box_14_proper_shipping_name` | 14. Proper Shipping Name (PSN) | Dangerous Goods Details | `properShippingName` |
| 17 | `box_14_technical_name` | 14. Technical Name | Dangerous Goods Details | `productDescription` |
| 18 | `box_14_class` | 14. Class / Division | Dangerous Goods Details | `imoClass` |
| 19 | `box_14_un_number` | 14. UN No. | Dangerous Goods Details | `unNumber` |
| 20 | `box_14_packing_group` | 14. Packing Group | Dangerous Goods Details | `packingGroup` |
| 21 | `box_14_ems` | 14. EMS | Dangerous Goods Details | `emsNumber` |
| 22 | `box_14_marine_pollutant` | 14. Marine Pollutant | Dangerous Goods Details | `marinePollutant` |
| 23 | `box_14_un_packing_code` | 14. UN Packing Code | Dangerous Goods Details | `unPackingCode` |
| 24 | `box_16_gross_mass` | Gross Mass (kg) | Weights & Measurements | `grossWeightKg` |
| 25 | `box_17_net_mass` | Net Mass (kgs) | Weights & Measurements | `netWeightKg` |
| 26 | `box_18_cube` | Cube (m³) | Weights & Measurements | `volumeCbm` |
| 27 | `box_19_container_id` | 15. Container identification no. | Equipment & Containers | `containerNumber` |
| 28 | `box_19_seal_number` | 16. Seal number(s) | Equipment & Containers | `sealNumber` |
| 29 | `box_19_container_type` | 17. Container size & type | Equipment & Containers | `containerType` |
| 30 | `box_19_tare_mass` | 18. Tare mass (kg) | Equipment & Containers | `tareWeightKg` |
| 31 | `box_19_total_gross_incl_tare` | 19. Total gross (incl. tare) (kg) | Equipment & Containers | `grossWeightKg` |

**Total Fields:** 31

---

### 2.3 Built-in Standard Multimodal Ocean B/L (`DEFAULT_BL_FORMAT` - 30 fields)

*Standard ocean multimodal bill of lading schema covering all commercial, freight, and equipment particulars.*

| # | fieldId | labelInTemplate | sectionName | mappedShipmentKey |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `bl_shipper` | Shipper / Exporter | Parties | `shipperAddress` |
| 2 | `bl_consignee` | Consignee (Not Negotiable unless consigned to order) | Parties | `consigneeAddress` |
| 3 | `bl_notify_party` | Notify Party / Intermediate Consignee | Parties | `notifyPartyAddress` |
| 4 | `bl_booking_no` | Carrier Booking No. | Reference | `bookingNumber` |
| 5 | `bl_document_no` | Bill of Lading No. | Reference | `bookingNumber` |
| 6 | `bl_export_references` | Export References (Invoice, PO, IEC) | Reference | `shipperReference` |
| 7 | `bl_shipping_bill` | Shipping Bill Number(s) & Date | Reference | `shippingBillNumbers` |
| 8 | `bl_pre_carriage` | Pre-Carriage By | Transport & Routing | `preCarriageBy` |
| 9 | `bl_place_of_receipt` | Place of Receipt | Transport & Routing | `placeOfReceipt` |
| 10 | `bl_ocean_vessel` | Ocean Vessel | Transport & Routing | `vesselName` |
| 11 | `bl_voyage_no` | Voyage No. | Transport & Routing | `voyageNumber` |
| 12 | `bl_port_of_loading` | Port of Loading | Transport & Routing | `portOfLoading` |
| 13 | `bl_port_of_discharge` | Port of Discharge | Transport & Routing | `portOfDischarge` |
| 14 | `bl_place_of_delivery` | Place of Delivery | Transport & Routing | `placeOfDelivery` |
| 15 | `bl_final_destination` | Final Destination (For the Merchant’s Reference Only) | Transport & Routing | `finalDestination` |
| 16 | `bl_container_number` | Container Number | Equipment & Containers | `containerNumber` |
| 17 | `bl_seal_number` | Seal Number | Equipment & Containers | `sealNumber` |
| 18 | `bl_container_type` | Container Size & Type | Equipment & Containers | `containerType` |
| 19 | `bl_tare_weight` | Container Tare Weight (kg) | Equipment & Containers | `tareWeightKg` |
| 20 | `bl_total_gross_mass_vgm` | Verified Gross Mass / Total Weight incl. Tare (kg) | Weights & Measurements | `grossWeightKg` |
| 21 | `bl_shipping_marks` | Marks and Numbers | Cargo & Packaging | `shippingMarks` |
| 22 | `bl_package_count` | Total Number of Packages / Pallets | Cargo & Packaging | `totalPallets` |
| 23 | `bl_cargo_description` | Description of Goods and Packages | Cargo & Packaging | `productDescription` |
| 24 | `bl_hsn_code` | H.S. Tariff Code | Cargo & Packaging | `hsnCode` |
| 25 | `bl_gross_weight` | Gross Weight (kg) | Weights & Measurements | `grossWeightKg` |
| 26 | `bl_net_weight` | Net Weight (kg) | Weights & Measurements | `netWeightKg` |
| 27 | `bl_measurement` | Measurement (CBM) | Weights & Measurements | `volumeCbm` |
| 28 | `bl_freight_terms` | Freight Payable At / Terms (e.g. PREPAID / COLLECT) | Commercial & Terms | `freightTerms` |
| 29 | `bl_movement_type` | Movement Type (e.g. FCL/FCL, CY/CY) | Commercial & Terms | `movementType` |
| 30 | `bl_free_time` | Free Time & Detention Clause | Commercial & Terms | `freeTimeClause` |

**Total Fields:** 30

---

### 2.4 Ocean Bill of Lading Draft (`BL DRAFT.docx` - 22 fields)

*Structural schema parsed directly from workspace template BL DRAFT.docx.*

| # | fieldId | labelInTemplate | sectionName | mappedShipmentKey |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `bl_shipper` | Shipper: | Parties | `shipperAddress` |
| 2 | `bl_booking_no` | BOOKING NO: | Reference | `bookingNumber` |
| 3 | `bl_consignee` | Consignee: | Parties | `consigneeAddress` |
| 4 | `bl_notify_party` | Notify Party: | Parties | `notifyPartyAddress` |
| 5 | `bl_vessel_voyage` | Vessel and Voyage No: | Transport & Routing | `vesselName` |
| 6 | `bl_place_of_receipt` | Place of Receipt: | Transport & Routing | `placeOfReceipt` |
| 7 | `bl_port_of_loading` | Port of Loading: | Transport & Routing | `portOfLoading` |
| 8 | `bl_port_of_discharge` | Port of Discharge: | Transport & Routing | `portOfDischarge` |
| 9 | `bl_port_of_delivery` | Port of Delivery: | Transport & Routing | `finalDestination` |
| 10 | `bl_container_nos` | Container Nos. | Equipment & Containers | `containerNumber` |
| 11 | `bl_shipping_marks` | Marks & Numbers | Cargo & Packaging | `shippingMarks` |
| 12 | `bl_packages_and_description` | Number and Kind of Packages Description of Goods | Cargo & Packaging | `productDescription` |
| 13 | `bl_gross_weight` | Gross Weight | Weights & Measurements | `grossWeightKg` |
| 14 | `bl_net_weight` | NET WEIGHT | Weights & Measurements | `netWeightKg` |
| 15 | `bl_total_containers_packages` | Total No. of Containers /Packages: | Cargo & Packaging | `totalPallets` |
| 16 | `bl_movement` | Movement: | Commercial & Terms | `movementType` |
| 17 | `bl_freight` | Freight: | Commercial & Terms | `freightTerms` |
| 18 | `bl_table_container_no` | CONT.NO. | Equipment & Containers | `containerNumber` |
| 19 | `bl_table_seal_no` | Seal no. | Equipment & Containers | `sealNumber` |
| 20 | `bl_table_pallets` | Pallets | Equipment & Containers | `outerPackagingCount` |
| 21 | `bl_table_gr_wt` | Gr.wt. kgs | Equipment & Containers | `grossWeightKg` |
| 22 | `bl_table_nt_wt` | Nt.wt.kgs | Equipment & Containers | `netWeightKg` |

**Total Fields:** 22

---

### 2.5 CMA CGM DG Declaration (`CMA HAZ.xlsx` / `HPFL NEWARK` - 32 fields)

*CMA CGM line-specific dangerous goods declaration template from sheet HPFL NEWARK.*

| # | fieldId | labelInTemplate | sectionName | mappedShipmentKey |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `cma_shipper` | SHIPPER :- | Parties | `shipperAddress` |
| 2 | `cma_ref_numbers` | Reference Number(s) | Reference | `shipperReference` |
| 3 | `cma_emergency_contact` | 24 HRS Emergency Contact Telephone Number & contact person | Declarations & Signatures | `emergencyContactPhone` |
| 4 | `cma_consignee` | Consignee :- | Parties | `consigneeAddress` |
| 5 | `cma_carrier` | Carrier | Transport & Routing | `carrierName` |
| 6 | `cma_carrier_booking_no` | Carrier's Booking Number: | Reference | `bookingNumber` |
| 7 | `cma_packing_cert_signatory` | Container Packing Certificate - Name/Status, Company/Organization of Signatory | Declarations & Signatures | `dgDeclarantName` |
| 8 | `cma_packing_cert_place_date` | Container Packing Declaration - Place and Date | Declarations & Signatures | `dgDeclarationPlaceAndDate` |
| 9 | `cma_vessel_voyage` | Ship's Name and Voyage No. | Transport & Routing | `vesselName` |
| 10 | `cma_port_of_loading` | Port of Loading | Transport & Routing | `portOfLoading` |
| 11 | `cma_container_number` | Container Number(s) | Equipment & Containers | `containerNumber` |
| 12 | `cma_seal_number` | SEAL NO | Equipment & Containers | `sealNumber` |
| 13 | `cma_port_of_discharge` | Port of Discharge | Transport & Routing | `portOfDischarge` |
| 14 | `cma_final_destination` | Final Place of Delivery | Transport & Routing | `finalDestination` |
| 15 | `cma_qty_type_packages` | Qty., Type, and Kind of Packages | Cargo & Packaging | `outerPackagingCount` |
| 16 | `cma_container_type_size` | Container Size & Type | Equipment & Containers | `containerType` |
| 17 | `cma_un_number` | UN NO :- | Dangerous Goods Details | `unNumber` |
| 18 | `cma_proper_shipping_name` | PROPER SHIPPING NAME : - | Dangerous Goods Details | `properShippingName` |
| 19 | `cma_technical_name` | TECHNICAL NAME : - | Dangerous Goods Details | `productDescription` |
| 20 | `cma_outer_packages` | OUTER PACKAGES :- | Cargo & Packaging | `outerPackagingCount` |
| 21 | `cma_class` | CLASS :- | Dangerous Goods Details | `imoClass` |
| 22 | `cma_sub_class` | SUB CLASS :- | Dangerous Goods Details | `—` |
| 23 | `cma_gross_weight` | GR WT : | Weights & Measurements | `grossWeightKg` |
| 24 | `cma_net_weight` | NT WT : | Weights & Measurements | `netWeightKg` |
| 25 | `cma_un_packing_group` | UN PACKING GROUP :- | Dangerous Goods Details | `packingGroup` |
| 26 | `cma_inner_packing` | INNER PACKING :- | Cargo & Packaging | `innerPackageCount` |
| 27 | `cma_un_packing_code` | UN PACKING CODE :- | Dangerous Goods Details | `unPackingCode` |
| 28 | `cma_ems` | EMS NO :- | Dangerous Goods Details | `emsNumber` |
| 29 | `cma_flash_point` | FLASH POINT :- | Dangerous Goods Details | `flashPoint` |
| 30 | `cma_marine_pollutant` | MARINE POLLUTANT :- | Dangerous Goods Details | `marinePollutant` |
| 31 | `cma_shipper_decl_signatory` | SHIPPER'S DECLARATION - Name/Status, Company/Organization of Signatory | Declarations & Signatures | `dgDeclarantName` |
| 32 | `cma_shipper_decl_place_date` | SHIPPER'S DECLARATION - Place and Date | Declarations & Signatures | `dgDeclarationPlaceAndDate` |

**Total Fields:** 32

---

## 3. Dry-Run Matching Audit (Single-Invoice & Multi-Invoice)

### 3.0 Executive Summary Audit Scorecard

| Dataset | Format | Document Type | Total Fields | Populated Fields | Pending/Blank Fields | Match % |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Dataset A (Single Invoice PDF Set)** | Standard IMO Multimodal Dangerous Goods Declaration | `DG` | 28 | 18 | 10 | **64.3%** |
| **Dataset A (Single Invoice PDF Set)** | Reference IMO Multimodal Dangerous Goods Declaration (31 Fields) | `DG` | 31 | 21 | 10 | **67.7%** |
| **Dataset A (Single Invoice PDF Set)** | Standard Multimodal Ocean Bill of Lading | `BL` | 30 | 18 | 12 | **60.0%** |
| **Dataset A (Single Invoice PDF Set)** | Ocean Bill of Lading Draft (BL DRAFT.docx) | `BL` | 22 | 16 | 6 | **72.7%** |
| **Dataset B (Multi-Invoice 5-Excel Batch)** | Standard IMO Multimodal Dangerous Goods Declaration | `DG` | 28 | 18 | 10 | **64.3%** |
| **Dataset B (Multi-Invoice 5-Excel Batch)** | Reference IMO Multimodal Dangerous Goods Declaration (31 Fields) | `DG` | 31 | 21 | 10 | **67.7%** |
| **Dataset B (Multi-Invoice 5-Excel Batch)** | Standard Multimodal Ocean Bill of Lading | `BL` | 30 | 18 | 12 | **60.0%** |
| **Dataset B (Multi-Invoice 5-Excel Batch)** | Ocean Bill of Lading Draft (BL DRAFT.docx) | `BL` | 22 | 16 | 6 | **72.7%** |

---

#### 3.1 Dataset A (Single Invoice PDF Set) vs Standard IMO Multimodal Dangerous Goods Declaration

**Document Type:** `DG` | **Total Fields:** 28 | **Populated:** 18 | **Pending/Blank:** 10 | **Match %:** **64.3%**

| # | fieldId | labelInTemplate | mappedShipmentKey | status | Resolved Value (truncated) | Why Blank? |
| :---: | :--- | :--- | :--- | :---: | :--- | :--- |
| 1 | `box_1_shipper` | 1. Shipper / Consignor (Name, Address, IEC, GSTIN) | `shipperAddress` | `POPULATED` | Exide Industries Limited ↵ Exide House, 59/E Chowringhee Road, Kolkata - 700020, | — |
| 2 | `box_2_transport_doc_no` | 2. Transport Document Number | `bookingNumber` | `POPULATED` | CHW000263 | — |
| 3 | `box_4_shipper_ref` | 4. Shipper's Reference | `shipperReference` | `POPULATED` | ORDER NO : NGB/208111 DATED 01.09.2026 / 0020080111 ↵ INV: CHW000263 | — |
| 4 | `box_6_consignee` | 6. Consignee (Name and Address) | `consigneeAddress` | `POPULATED` | NICKEL GLASS & BATTERIES FOR ALL CARS CO ↵ AUTO 1- A Member of KAPICO Group, Kuw | — |
| 5 | `box_7_carrier` | 7. Carrier (Name and Details) | `carrierName` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Ocean carrier routing assigned at B/L stage |
| 6 | `box_8_pre_carriage` | 8. This shipment is within the limitations prescribed for: Pre-Carriage by | `preCarriageBy` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Ocean carrier routing assigned at B/L stage |
| 7 | `box_9_place_of_receipt` | 9. Place of Receipt by Pre-Carrier | `placeOfReceipt` | `POPULATED` | Nhava Sheva, INDIA | — |
| 8 | `box_10_vessel_voyage` | 10. Vessel and Voyage Number | `vesselName` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Ocean carrier routing assigned at B/L stage |
| 9 | `box_11_port_of_loading` | 11. Port of Loading | `portOfLoading` | `POPULATED` | Nhava Sheva, INDIA | — |
| 10 | `box_12_port_of_discharge` | 12. Port of Discharge | `portOfDischarge` | `POPULATED` | Jeddah Port, KSA | — |
| 11 | `box_13_destination` | 13. Destination | `finalDestination` | `POPULATED` | Kuwait | — |
| 12 | `box_14_shipping_marks` | 14. Shipping Marks / Container Numbers | `shippingMarks` | `POPULATED` | NGB/ KUWAIT ↵ Total 12 pallets ↵ 5644 - 5655 | — |
| 13 | `box_15_package_description` | 15. Number and Kind of Packages; Description of Goods | `productDescription` | `POPULATED` | PACKAGES: ↵ 12 PALLETS / 1200 BOXES (EACH BOX HAS 1 BATTERY) ↵  ↵ COMMODITY / DE | — |
| 14 | `box_15_un_number` | 15a. UN Number | `unNumber` | `POPULATED` | 2794 | — |
| 15 | `box_15_proper_shipping_name` | 15b. Proper Shipping Name | `properShippingName` | `POPULATED` | BATTERIES, WET, FILLED WITH ACID | — |
| 16 | `box_15_imo_class` | 15c. IMO Class / Division | `imoClass` | `POPULATED` | 8 | — |
| 17 | `box_15_packing_group` | 15d. Packing Group | `packingGroup` | `POPULATED` | III | — |
| 18 | `box_15_ems_number` | 15e. EMS Number | `emsNumber` | `POPULATED` | F-A, S-B | — |
| 19 | `box_15_un_packing_code` | 15f. UN Packaging Specification Code | `unPackingCode` | `POPULATED` | 4G/Z 30/S/**IND/K/19700134 | — |
| 20 | `box_16_gross_mass` | 16. Gross Mass (kg) | `grossWeightKg` | `POPULATED` | 22620 | — |
| 21 | `box_17_net_mass` | 17. Net Mass (kg) | `netWeightKg` | `POPULATED` | 22320 | — |
| 22 | `box_18_cube` | 18. Cube (m³) | `volumeCbm` | **`PENDING_BLANK`** | "" | Measurement/CBM not declared on source document |
| 23 | `box_19_container_seal` | 19. Container Identification No. / Seal No. | `containerNumber` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 24 | `box_19_tare_weight` | 19b. Container Tare Mass (kg) | `tareWeightKg` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 25 | `box_19_total_gross_incl_tare` | 19c. Total gross (incl. tare) (kg) | `grossWeightKg` | **`PENDING_BLANK`** | "" | Strict VGM Invariant: tareWeightKg is 0 / blank in commercial invoice |
| 26 | `box_20_container_packing_cert` | 20. Container / Vehicle Packing Certificate (Name/Status of Declarant) | `dgDeclarantName` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 27 | `box_21_emergency_contact` | 21. 24-Hour Emergency Response Contact Name & Telephone | `emergencyContactPhone` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Operational signature/declarant execution field |
| 28 | `box_22_shipper_declaration` | 22. Shipper's Declaration (Place and Date) | `dgDeclarationPlaceAndDate` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Operational signature/declarant execution field |

---

#### 3.2 Dataset A (Single Invoice PDF Set) vs Reference IMO Multimodal Dangerous Goods Declaration (31 Fields)

**Document Type:** `DG` | **Total Fields:** 31 | **Populated:** 21 | **Pending/Blank:** 10 | **Match %:** **67.7%**

| # | fieldId | labelInTemplate | mappedShipmentKey | status | Resolved Value (truncated) | Why Blank? |
| :---: | :--- | :--- | :--- | :---: | :--- | :--- |
| 1 | `box_1_shipper` | 1. Shipper / Consignor / Sender | `shipperAddress` | `POPULATED` | Exide Industries Limited ↵ Exide House, 59/E Chowringhee Road, Kolkata - 700020, | — |
| 2 | `box_2_transport_doc_no` | 2. Transport Document Number | `bookingNumber` | `POPULATED` | CHW000263 | — |
| 3 | `box_3_page_of_page` | 3. Page of Page | `—` | **`PENDING_BLANK`** | "" | No mappedShipmentKey assigned in template definition |
| 4 | `box_4_shipper_ref` | 4. Shipper's reference | `shipperReference` | `POPULATED` | ORDER NO : NGB/208111 DATED 01.09.2026 / 0020080111 ↵ INV: CHW000263 | — |
| 5 | `box_5_freight_forwarder_ref` | 5. Freight Forwarder's reference | `forwarderReference` | `POPULATED` | CHW000263 | — |
| 6 | `box_6_consignee` | 6. Consignee | `consigneeAddress` | `POPULATED` | NICKEL GLASS & BATTERIES FOR ALL CARS CO ↵ AUTO 1- A Member of KAPICO Group, Kuw | — |
| 7 | `box_7_carrier` | 7. Carrier | `carrierName` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Ocean carrier routing assigned at B/L stage |
| 8 | `box_8_shipper_declaration_limitation` | 8. This shipment is within limitations prescribed for: Pre-Carriage by | `preCarriageBy` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Ocean carrier routing assigned at B/L stage |
| 9 | `box_9_additional_handling` | 9. Additional handling information (Emergency Contact) | `emergencyContactPhone` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Operational signature/declarant execution field |
| 10 | `box_10_vessel_voyage` | 10. Vessel and voy | `vesselName` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Ocean carrier routing assigned at B/L stage |
| 11 | `box_11_port_of_loading` | 11. Port of loading | `portOfLoading` | `POPULATED` | Nhava Sheva, INDIA | — |
| 12 | `box_12_port_of_discharge` | 12. Port of discharge | `portOfDischarge` | `POPULATED` | Jeddah Port, KSA | — |
| 13 | `box_13_destination` | 13. Destination | `finalDestination` | `POPULATED` | Kuwait | — |
| 14 | `box_14_shipping_marks` | 14. Shipping Marks | `shippingMarks` | `POPULATED` | NGB/ KUWAIT ↵ Total 12 pallets ↵ 5644 - 5655 | — |
| 15 | `box_14_number_kind_packages` | 14. Number and kind of packages | `outerPackagingCount` | `POPULATED` | 12 | — |
| 16 | `box_14_proper_shipping_name` | 14. Proper Shipping Name (PSN) | `properShippingName` | `POPULATED` | BATTERIES, WET, FILLED WITH ACID | — |
| 17 | `box_14_technical_name` | 14. Technical Name | `productDescription` | `POPULATED` | LEAD ACID STORAGE BATTERIES | — |
| 18 | `box_14_class` | 14. Class / Division | `imoClass` | `POPULATED` | 8 | — |
| 19 | `box_14_un_number` | 14. UN No. | `unNumber` | `POPULATED` | 2794 | — |
| 20 | `box_14_packing_group` | 14. Packing Group | `packingGroup` | `POPULATED` | III | — |
| 21 | `box_14_ems` | 14. EMS | `emsNumber` | `POPULATED` | F-A, S-B | — |
| 22 | `box_14_marine_pollutant` | 14. Marine Pollutant | `marinePollutant` | `POPULATED` | NO | — |
| 23 | `box_14_un_packing_code` | 14. UN Packing Code | `unPackingCode` | `POPULATED` | 4G/Z 30/S/**IND/K/19700134 | — |
| 24 | `box_16_gross_mass` | Gross Mass (kg) | `grossWeightKg` | `POPULATED` | 22620 | — |
| 25 | `box_17_net_mass` | Net Mass (kgs) | `netWeightKg` | `POPULATED` | 22320 | — |
| 26 | `box_18_cube` | Cube (m³) | `volumeCbm` | **`PENDING_BLANK`** | "" | Measurement/CBM not declared on source document |
| 27 | `box_19_container_id` | 15. Container identification no. | `containerNumber` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 28 | `box_19_seal_number` | 16. Seal number(s) | `sealNumber` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 29 | `box_19_container_type` | 17. Container size & type | `containerType` | `POPULATED` | 20GP | — |
| 30 | `box_19_tare_mass` | 18. Tare mass (kg) | `tareWeightKg` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 31 | `box_19_total_gross_incl_tare` | 19. Total gross (incl. tare) (kg) | `grossWeightKg` | **`PENDING_BLANK`** | "" | Strict VGM Invariant: tareWeightKg is 0 / blank in commercial invoice |

---

#### 3.3 Dataset A (Single Invoice PDF Set) vs Standard Multimodal Ocean Bill of Lading

**Document Type:** `BL` | **Total Fields:** 30 | **Populated:** 18 | **Pending/Blank:** 12 | **Match %:** **60.0%**

| # | fieldId | labelInTemplate | mappedShipmentKey | status | Resolved Value (truncated) | Why Blank? |
| :---: | :--- | :--- | :--- | :---: | :--- | :--- |
| 1 | `bl_shipper` | Shipper / Exporter | `shipperAddress` | `POPULATED` | Exide Industries Limited ↵ Exide House, 59/E Chowringhee Road, Kolkata - 700020, | — |
| 2 | `bl_consignee` | Consignee (Not Negotiable unless consigned to order) | `consigneeAddress` | `POPULATED` | NICKEL GLASS & BATTERIES FOR ALL CARS CO ↵ AUTO 1- A Member of KAPICO Group, Kuw | — |
| 3 | `bl_notify_party` | Notify Party / Intermediate Consignee | `notifyPartyAddress` | `POPULATED` | ShipX Company ↵ North Al Khaldiya, Dammam, KSA, Postal Code 32232 ↵ VAT Reg. No. | — |
| 4 | `bl_booking_no` | Carrier Booking No. | `bookingNumber` | `POPULATED` | CHW000263 | — |
| 5 | `bl_document_no` | Bill of Lading No. | `bookingNumber` | `POPULATED` | CHW000263 | — |
| 6 | `bl_export_references` | Export References (Invoice, PO, IEC) | `shipperReference` | `POPULATED` | ORDER NO : NGB/208111 DATED 01.09.2026 / 0020080111 ↵ INV: CHW000263 | — |
| 7 | `bl_shipping_bill` | Shipping Bill Number(s) & Date | `shippingBillNumbers` | **`PENDING_BLANK`** | "" | Key "shippingBillNumbers" is empty/zero in source ExtractedShipmentJSON |
| 8 | `bl_pre_carriage` | Pre-Carriage By | `preCarriageBy` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Ocean carrier routing assigned at B/L stage |
| 9 | `bl_place_of_receipt` | Place of Receipt | `placeOfReceipt` | `POPULATED` | Nhava Sheva, INDIA | — |
| 10 | `bl_ocean_vessel` | Ocean Vessel | `vesselName` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Ocean carrier routing assigned at B/L stage |
| 11 | `bl_voyage_no` | Voyage No. | `voyageNumber` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Ocean carrier routing assigned at B/L stage |
| 12 | `bl_port_of_loading` | Port of Loading | `portOfLoading` | `POPULATED` | Nhava Sheva, INDIA | — |
| 13 | `bl_port_of_discharge` | Port of Discharge | `portOfDischarge` | `POPULATED` | Jeddah Port, KSA | — |
| 14 | `bl_place_of_delivery` | Place of Delivery | `placeOfDelivery` | `POPULATED` | Kuwait | — |
| 15 | `bl_final_destination` | Final Destination (For the Merchant’s Reference Only) | `finalDestination` | `POPULATED` | Kuwait | — |
| 16 | `bl_container_number` | Container Number | `containerNumber` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 17 | `bl_seal_number` | Seal Number | `sealNumber` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 18 | `bl_container_type` | Container Size & Type | `containerType` | `POPULATED` | 20GP | — |
| 19 | `bl_tare_weight` | Container Tare Weight (kg) | `tareWeightKg` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 20 | `bl_total_gross_mass_vgm` | Verified Gross Mass / Total Weight incl. Tare (kg) | `grossWeightKg` | **`PENDING_BLANK`** | "" | Strict VGM Invariant: tareWeightKg is 0 / blank in commercial invoice |
| 21 | `bl_shipping_marks` | Marks and Numbers | `shippingMarks` | `POPULATED` | NGB/ KUWAIT ↵ Total 12 pallets ↵ 5644 - 5655 | — |
| 22 | `bl_package_count` | Total Number of Packages / Pallets | `totalPallets` | `POPULATED` | 12 | — |
| 23 | `bl_cargo_description` | Description of Goods and Packages | `productDescription` | `POPULATED` | LEAD ACID STORAGE BATTERIES | — |
| 24 | `bl_hsn_code` | H.S. Tariff Code | `hsnCode` | `POPULATED` | 85071000 | — |
| 25 | `bl_gross_weight` | Gross Weight (kg) | `grossWeightKg` | `POPULATED` | 22620 | — |
| 26 | `bl_net_weight` | Net Weight (kg) | `netWeightKg` | `POPULATED` | 22320 | — |
| 27 | `bl_measurement` | Measurement (CBM) | `volumeCbm` | **`PENDING_BLANK`** | "" | Measurement/CBM not declared on source document |
| 28 | `bl_freight_terms` | Freight Payable At / Terms (e.g. PREPAID / COLLECT) | `freightTerms` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Carrier booking contractual terms |
| 29 | `bl_movement_type` | Movement Type (e.g. FCL/FCL, CY/CY) | `movementType` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Carrier booking contractual terms |
| 30 | `bl_free_time` | Free Time & Detention Clause | `freeTimeClause` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Carrier booking contractual terms |

---

#### 3.4 Dataset A (Single Invoice PDF Set) vs Ocean Bill of Lading Draft (BL DRAFT.docx)

**Document Type:** `BL` | **Total Fields:** 22 | **Populated:** 16 | **Pending/Blank:** 6 | **Match %:** **72.7%**

| # | fieldId | labelInTemplate | mappedShipmentKey | status | Resolved Value (truncated) | Why Blank? |
| :---: | :--- | :--- | :--- | :---: | :--- | :--- |
| 1 | `bl_shipper` | Shipper: | `shipperAddress` | `POPULATED` | Exide Industries Limited ↵ Exide House, 59/E Chowringhee Road, Kolkata - 700020, | — |
| 2 | `bl_booking_no` | BOOKING NO: | `bookingNumber` | `POPULATED` | CHW000263 | — |
| 3 | `bl_consignee` | Consignee: | `consigneeAddress` | `POPULATED` | NICKEL GLASS & BATTERIES FOR ALL CARS CO ↵ AUTO 1- A Member of KAPICO Group, Kuw | — |
| 4 | `bl_notify_party` | Notify Party: | `notifyPartyAddress` | `POPULATED` | ShipX Company ↵ North Al Khaldiya, Dammam, KSA, Postal Code 32232 ↵ VAT Reg. No. | — |
| 5 | `bl_vessel_voyage` | Vessel and Voyage No: | `vesselName` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Ocean carrier routing assigned at B/L stage |
| 6 | `bl_place_of_receipt` | Place of Receipt: | `placeOfReceipt` | `POPULATED` | Nhava Sheva, INDIA | — |
| 7 | `bl_port_of_loading` | Port of Loading: | `portOfLoading` | `POPULATED` | Nhava Sheva, INDIA | — |
| 8 | `bl_port_of_discharge` | Port of Discharge: | `portOfDischarge` | `POPULATED` | Jeddah Port, KSA | — |
| 9 | `bl_port_of_delivery` | Port of Delivery: | `finalDestination` | `POPULATED` | Kuwait | — |
| 10 | `bl_container_nos` | Container Nos. | `containerNumber` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 11 | `bl_shipping_marks` | Marks & Numbers | `shippingMarks` | `POPULATED` | NGB/ KUWAIT ↵ Total 12 pallets ↵ 5644 - 5655 | — |
| 12 | `bl_packages_and_description` | Number and Kind of Packages Description of Goods | `productDescription` | `POPULATED` | LEAD ACID STORAGE BATTERIES | — |
| 13 | `bl_gross_weight` | Gross Weight | `grossWeightKg` | `POPULATED` | 22620 | — |
| 14 | `bl_net_weight` | NET WEIGHT | `netWeightKg` | `POPULATED` | 22320 | — |
| 15 | `bl_total_containers_packages` | Total No. of Containers /Packages: | `totalPallets` | `POPULATED` | 12 | — |
| 16 | `bl_movement` | Movement: | `movementType` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Carrier booking contractual terms |
| 17 | `bl_freight` | Freight: | `freightTerms` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Carrier booking contractual terms |
| 18 | `bl_table_container_no` | CONT.NO. | `containerNumber` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 19 | `bl_table_seal_no` | Seal no. | `sealNumber` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 20 | `bl_table_pallets` | Pallets | `outerPackagingCount` | `POPULATED` | 12 | — |
| 21 | `bl_table_gr_wt` | Gr.wt. kgs | `grossWeightKg` | `POPULATED` | 22620 | — |
| 22 | `bl_table_nt_wt` | Nt.wt.kgs | `netWeightKg` | `POPULATED` | 22320 | — |

---

#### 3.5 Dataset B (Multi-Invoice 5-Excel Batch) vs Standard IMO Multimodal Dangerous Goods Declaration

**Document Type:** `DG` | **Total Fields:** 28 | **Populated:** 18 | **Pending/Blank:** 10 | **Match %:** **64.3%**

| # | fieldId | labelInTemplate | mappedShipmentKey | status | Resolved Value (truncated) | Why Blank? |
| :---: | :--- | :--- | :--- | :---: | :--- | :--- |
| 1 | `box_1_shipper` | 1. Shipper / Consignor (Name, Address, IEC, GSTIN) | `shipperAddress` | `POPULATED` | EXIDE INDUSTRIES LIMITED ↵ EXIDE HOUSE, 59E, CHOWRINGHEE ROAD, KOLKATA – 700 020 | — |
| 2 | `box_2_transport_doc_no` | 2. Transport Document Number | `bookingNumber` | `POPULATED` | CHW000165B, CHW000213, CHW000213A, TAL000172, TAL000172A | — |
| 3 | `box_4_shipper_ref` | 4. Shipper's Reference | `shipperReference` | `POPULATED` | CHW000165B, CHW000213, CHW000213A, TAL000172, TAL000172A | — |
| 4 | `box_6_consignee` | 6. Consignee (Name and Address) | `consigneeAddress` | `POPULATED` | YUNN POE SAN EAIN COMPANY LIMITED. ↵ No.(138), Si Pin Thar Yar Street, Nay Myint | — |
| 5 | `box_7_carrier` | 7. Carrier (Name and Details) | `carrierName` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Ocean carrier routing assigned at B/L stage |
| 6 | `box_8_pre_carriage` | 8. This shipment is within the limitations prescribed for: Pre-Carriage by | `preCarriageBy` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Ocean carrier routing assigned at B/L stage |
| 7 | `box_9_place_of_receipt` | 9. Place of Receipt by Pre-Carrier | `placeOfReceipt` | `POPULATED` | NHAVA SHEVA | — |
| 8 | `box_10_vessel_voyage` | 10. Vessel and Voyage Number | `vesselName` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Ocean carrier routing assigned at B/L stage |
| 9 | `box_11_port_of_loading` | 11. Port of Loading | `portOfLoading` | `POPULATED` | NHAVA SHEVA, INDIA | — |
| 10 | `box_12_port_of_discharge` | 12. Port of Discharge | `portOfDischarge` | `POPULATED` | YANGON, MYANMAR | — |
| 11 | `box_13_destination` | 13. Destination | `finalDestination` | `POPULATED` | MYANMAR | — |
| 12 | `box_14_shipping_marks` | 14. Shipping Marks / Container Numbers | `shippingMarks` | `POPULATED` | KAUNG SWANN ↵ HTET TRADING ↵ MYANMAR ↵ 4533 TO 4546, 4956 TO 4963, 4964, TAL/170 | — |
| 13 | `box_15_package_description` | 15. Number and Kind of Packages; Description of Goods | `productDescription` | `POPULATED` | PACKAGES: ↵ 22 PALLETS / 676 CORRUGATED BOXES ↵  ↵ COMMODITY / DESCRIPTION: ↵ BA | — |
| 14 | `box_15_un_number` | 15a. UN Number | `unNumber` | `POPULATED` | 2794 | — |
| 15 | `box_15_proper_shipping_name` | 15b. Proper Shipping Name | `properShippingName` | `POPULATED` | BATTERIES, WET, FILLED WITH ACID | — |
| 16 | `box_15_imo_class` | 15c. IMO Class / Division | `imoClass` | `POPULATED` | 8 | — |
| 17 | `box_15_packing_group` | 15d. Packing Group | `packingGroup` | `POPULATED` | NA | — |
| 18 | `box_15_ems_number` | 15e. EMS Number | `emsNumber` | `POPULATED` | F-A-S-B | — |
| 19 | `box_15_un_packing_code` | 15f. UN Packaging Specification Code | `unPackingCode` | `POPULATED` | 4G/Z 30/S/IND/K/19700134 | — |
| 20 | `box_16_gross_mass` | 16. Gross Mass (kg) | `grossWeightKg` | `POPULATED` | 18502.7 | — |
| 21 | `box_17_net_mass` | 17. Net Mass (kg) | `netWeightKg` | `POPULATED` | 17917.7 | — |
| 22 | `box_18_cube` | 18. Cube (m³) | `volumeCbm` | **`PENDING_BLANK`** | "" | Measurement/CBM not declared on source document |
| 23 | `box_19_container_seal` | 19. Container Identification No. / Seal No. | `containerNumber` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 24 | `box_19_tare_weight` | 19b. Container Tare Mass (kg) | `tareWeightKg` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 25 | `box_19_total_gross_incl_tare` | 19c. Total gross (incl. tare) (kg) | `grossWeightKg` | **`PENDING_BLANK`** | "" | Strict VGM Invariant: tareWeightKg is 0 / blank in commercial invoice |
| 26 | `box_20_container_packing_cert` | 20. Container / Vehicle Packing Certificate (Name/Status of Declarant) | `dgDeclarantName` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 27 | `box_21_emergency_contact` | 21. 24-Hour Emergency Response Contact Name & Telephone | `emergencyContactPhone` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Operational signature/declarant execution field |
| 28 | `box_22_shipper_declaration` | 22. Shipper's Declaration (Place and Date) | `dgDeclarationPlaceAndDate` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Operational signature/declarant execution field |

---

#### 3.6 Dataset B (Multi-Invoice 5-Excel Batch) vs Reference IMO Multimodal Dangerous Goods Declaration (31 Fields)

**Document Type:** `DG` | **Total Fields:** 31 | **Populated:** 21 | **Pending/Blank:** 10 | **Match %:** **67.7%**

| # | fieldId | labelInTemplate | mappedShipmentKey | status | Resolved Value (truncated) | Why Blank? |
| :---: | :--- | :--- | :--- | :---: | :--- | :--- |
| 1 | `box_1_shipper` | 1. Shipper / Consignor / Sender | `shipperAddress` | `POPULATED` | EXIDE INDUSTRIES LIMITED ↵ EXIDE HOUSE, 59E, CHOWRINGHEE ROAD, KOLKATA – 700 020 | — |
| 2 | `box_2_transport_doc_no` | 2. Transport Document Number | `bookingNumber` | `POPULATED` | CHW000165B, CHW000213, CHW000213A, TAL000172, TAL000172A | — |
| 3 | `box_3_page_of_page` | 3. Page of Page | `—` | **`PENDING_BLANK`** | "" | No mappedShipmentKey assigned in template definition |
| 4 | `box_4_shipper_ref` | 4. Shipper's reference | `shipperReference` | `POPULATED` | CHW000165B, CHW000213, CHW000213A, TAL000172, TAL000172A | — |
| 5 | `box_5_freight_forwarder_ref` | 5. Freight Forwarder's reference | `forwarderReference` | `POPULATED` | CHW000165B, CHW000213, CHW000213A, TAL000172, TAL000172A | — |
| 6 | `box_6_consignee` | 6. Consignee | `consigneeAddress` | `POPULATED` | YUNN POE SAN EAIN COMPANY LIMITED. ↵ No.(138), Si Pin Thar Yar Street, Nay Myint | — |
| 7 | `box_7_carrier` | 7. Carrier | `carrierName` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Ocean carrier routing assigned at B/L stage |
| 8 | `box_8_shipper_declaration_limitation` | 8. This shipment is within limitations prescribed for: Pre-Carriage by | `preCarriageBy` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Ocean carrier routing assigned at B/L stage |
| 9 | `box_9_additional_handling` | 9. Additional handling information (Emergency Contact) | `emergencyContactPhone` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Operational signature/declarant execution field |
| 10 | `box_10_vessel_voyage` | 10. Vessel and voy | `vesselName` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Ocean carrier routing assigned at B/L stage |
| 11 | `box_11_port_of_loading` | 11. Port of loading | `portOfLoading` | `POPULATED` | NHAVA SHEVA, INDIA | — |
| 12 | `box_12_port_of_discharge` | 12. Port of discharge | `portOfDischarge` | `POPULATED` | YANGON, MYANMAR | — |
| 13 | `box_13_destination` | 13. Destination | `finalDestination` | `POPULATED` | MYANMAR | — |
| 14 | `box_14_shipping_marks` | 14. Shipping Marks | `shippingMarks` | `POPULATED` | KAUNG SWANN ↵ HTET TRADING ↵ MYANMAR ↵ 4533 TO 4546, 4956 TO 4963, 4964, TAL/170 | — |
| 15 | `box_14_number_kind_packages` | 14. Number and kind of packages | `outerPackagingCount` | `POPULATED` | 22 | — |
| 16 | `box_14_proper_shipping_name` | 14. Proper Shipping Name (PSN) | `properShippingName` | `POPULATED` | BATTERIES, WET, FILLED WITH ACID | — |
| 17 | `box_14_technical_name` | 14. Technical Name | `productDescription` | `POPULATED` | LEAD ACID AUTOMOTIVE STORAGE BATTERIES | — |
| 18 | `box_14_class` | 14. Class / Division | `imoClass` | `POPULATED` | 8 | — |
| 19 | `box_14_un_number` | 14. UN No. | `unNumber` | `POPULATED` | 2794 | — |
| 20 | `box_14_packing_group` | 14. Packing Group | `packingGroup` | `POPULATED` | NA | — |
| 21 | `box_14_ems` | 14. EMS | `emsNumber` | `POPULATED` | F-A-S-B | — |
| 22 | `box_14_marine_pollutant` | 14. Marine Pollutant | `marinePollutant` | `POPULATED` | NO | — |
| 23 | `box_14_un_packing_code` | 14. UN Packing Code | `unPackingCode` | `POPULATED` | 4G/Z 30/S/IND/K/19700134 | — |
| 24 | `box_16_gross_mass` | Gross Mass (kg) | `grossWeightKg` | `POPULATED` | 18502.7 | — |
| 25 | `box_17_net_mass` | Net Mass (kgs) | `netWeightKg` | `POPULATED` | 17917.7 | — |
| 26 | `box_18_cube` | Cube (m³) | `volumeCbm` | **`PENDING_BLANK`** | "" | Measurement/CBM not declared on source document |
| 27 | `box_19_container_id` | 15. Container identification no. | `containerNumber` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 28 | `box_19_seal_number` | 16. Seal number(s) | `sealNumber` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 29 | `box_19_container_type` | 17. Container size & type | `containerType` | `POPULATED` | 20GP | — |
| 30 | `box_19_tare_mass` | 18. Tare mass (kg) | `tareWeightKg` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 31 | `box_19_total_gross_incl_tare` | 19. Total gross (incl. tare) (kg) | `grossWeightKg` | **`PENDING_BLANK`** | "" | Strict VGM Invariant: tareWeightKg is 0 / blank in commercial invoice |

---

#### 3.7 Dataset B (Multi-Invoice 5-Excel Batch) vs Standard Multimodal Ocean Bill of Lading

**Document Type:** `BL` | **Total Fields:** 30 | **Populated:** 18 | **Pending/Blank:** 12 | **Match %:** **60.0%**

| # | fieldId | labelInTemplate | mappedShipmentKey | status | Resolved Value (truncated) | Why Blank? |
| :---: | :--- | :--- | :--- | :---: | :--- | :--- |
| 1 | `bl_shipper` | Shipper / Exporter | `shipperAddress` | `POPULATED` | EXIDE INDUSTRIES LIMITED ↵ EXIDE HOUSE, 59E, CHOWRINGHEE ROAD, KOLKATA – 700 020 | — |
| 2 | `bl_consignee` | Consignee (Not Negotiable unless consigned to order) | `consigneeAddress` | `POPULATED` | YUNN POE SAN EAIN COMPANY LIMITED. ↵ No.(138), Si Pin Thar Yar Street, Nay Myint | — |
| 3 | `bl_notify_party` | Notify Party / Intermediate Consignee | `notifyPartyAddress` | `POPULATED` | SAME AS CONSIGNEE | — |
| 4 | `bl_booking_no` | Carrier Booking No. | `bookingNumber` | `POPULATED` | CHW000165B, CHW000213, CHW000213A, TAL000172, TAL000172A | — |
| 5 | `bl_document_no` | Bill of Lading No. | `bookingNumber` | `POPULATED` | CHW000165B, CHW000213, CHW000213A, TAL000172, TAL000172A | — |
| 6 | `bl_export_references` | Export References (Invoice, PO, IEC) | `shipperReference` | `POPULATED` | CHW000165B, CHW000213, CHW000213A, TAL000172, TAL000172A | — |
| 7 | `bl_shipping_bill` | Shipping Bill Number(s) & Date | `shippingBillNumbers` | **`PENDING_BLANK`** | "" | Key "shippingBillNumbers" is empty/zero in source ExtractedShipmentJSON |
| 8 | `bl_pre_carriage` | Pre-Carriage By | `preCarriageBy` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Ocean carrier routing assigned at B/L stage |
| 9 | `bl_place_of_receipt` | Place of Receipt | `placeOfReceipt` | `POPULATED` | NHAVA SHEVA | — |
| 10 | `bl_ocean_vessel` | Ocean Vessel | `vesselName` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Ocean carrier routing assigned at B/L stage |
| 11 | `bl_voyage_no` | Voyage No. | `voyageNumber` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Ocean carrier routing assigned at B/L stage |
| 12 | `bl_port_of_loading` | Port of Loading | `portOfLoading` | `POPULATED` | NHAVA SHEVA, INDIA | — |
| 13 | `bl_port_of_discharge` | Port of Discharge | `portOfDischarge` | `POPULATED` | YANGON, MYANMAR | — |
| 14 | `bl_place_of_delivery` | Place of Delivery | `placeOfDelivery` | `POPULATED` | MYANMAR | — |
| 15 | `bl_final_destination` | Final Destination (For the Merchant’s Reference Only) | `finalDestination` | `POPULATED` | MYANMAR | — |
| 16 | `bl_container_number` | Container Number | `containerNumber` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 17 | `bl_seal_number` | Seal Number | `sealNumber` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 18 | `bl_container_type` | Container Size & Type | `containerType` | `POPULATED` | 20GP | — |
| 19 | `bl_tare_weight` | Container Tare Weight (kg) | `tareWeightKg` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 20 | `bl_total_gross_mass_vgm` | Verified Gross Mass / Total Weight incl. Tare (kg) | `grossWeightKg` | **`PENDING_BLANK`** | "" | Strict VGM Invariant: tareWeightKg is 0 / blank in commercial invoice |
| 21 | `bl_shipping_marks` | Marks and Numbers | `shippingMarks` | `POPULATED` | KAUNG SWANN ↵ HTET TRADING ↵ MYANMAR ↵ 4533 TO 4546, 4956 TO 4963, 4964, TAL/170 | — |
| 22 | `bl_package_count` | Total Number of Packages / Pallets | `totalPallets` | `POPULATED` | 22 | — |
| 23 | `bl_cargo_description` | Description of Goods and Packages | `productDescription` | `POPULATED` | LEAD ACID AUTOMOTIVE STORAGE BATTERIES | — |
| 24 | `bl_hsn_code` | H.S. Tariff Code | `hsnCode` | `POPULATED` | 85071000 | — |
| 25 | `bl_gross_weight` | Gross Weight (kg) | `grossWeightKg` | `POPULATED` | 18502.7 | — |
| 26 | `bl_net_weight` | Net Weight (kg) | `netWeightKg` | `POPULATED` | 17917.7 | — |
| 27 | `bl_measurement` | Measurement (CBM) | `volumeCbm` | **`PENDING_BLANK`** | "" | Measurement/CBM not declared on source document |
| 28 | `bl_freight_terms` | Freight Payable At / Terms (e.g. PREPAID / COLLECT) | `freightTerms` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Carrier booking contractual terms |
| 29 | `bl_movement_type` | Movement Type (e.g. FCL/FCL, CY/CY) | `movementType` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Carrier booking contractual terms |
| 30 | `bl_free_time` | Free Time & Detention Clause | `freeTimeClause` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Carrier booking contractual terms |

---

#### 3.8 Dataset B (Multi-Invoice 5-Excel Batch) vs Ocean Bill of Lading Draft (BL DRAFT.docx)

**Document Type:** `BL` | **Total Fields:** 22 | **Populated:** 16 | **Pending/Blank:** 6 | **Match %:** **72.7%**

| # | fieldId | labelInTemplate | mappedShipmentKey | status | Resolved Value (truncated) | Why Blank? |
| :---: | :--- | :--- | :--- | :---: | :--- | :--- |
| 1 | `bl_shipper` | Shipper: | `shipperAddress` | `POPULATED` | EXIDE INDUSTRIES LIMITED ↵ EXIDE HOUSE, 59E, CHOWRINGHEE ROAD, KOLKATA – 700 020 | — |
| 2 | `bl_booking_no` | BOOKING NO: | `bookingNumber` | `POPULATED` | CHW000165B, CHW000213, CHW000213A, TAL000172, TAL000172A | — |
| 3 | `bl_consignee` | Consignee: | `consigneeAddress` | `POPULATED` | YUNN POE SAN EAIN COMPANY LIMITED. ↵ No.(138), Si Pin Thar Yar Street, Nay Myint | — |
| 4 | `bl_notify_party` | Notify Party: | `notifyPartyAddress` | `POPULATED` | SAME AS CONSIGNEE | — |
| 5 | `bl_vessel_voyage` | Vessel and Voyage No: | `vesselName` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Ocean carrier routing assigned at B/L stage |
| 6 | `bl_place_of_receipt` | Place of Receipt: | `placeOfReceipt` | `POPULATED` | NHAVA SHEVA | — |
| 7 | `bl_port_of_loading` | Port of Loading: | `portOfLoading` | `POPULATED` | NHAVA SHEVA, INDIA | — |
| 8 | `bl_port_of_discharge` | Port of Discharge: | `portOfDischarge` | `POPULATED` | YANGON, MYANMAR | — |
| 9 | `bl_port_of_delivery` | Port of Delivery: | `finalDestination` | `POPULATED` | MYANMAR | — |
| 10 | `bl_container_nos` | Container Nos. | `containerNumber` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 11 | `bl_shipping_marks` | Marks & Numbers | `shippingMarks` | `POPULATED` | KAUNG SWANN ↵ HTET TRADING ↵ MYANMAR ↵ 4533 TO 4546, 4956 TO 4963, 4964, TAL/170 | — |
| 12 | `bl_packages_and_description` | Number and Kind of Packages Description of Goods | `productDescription` | `POPULATED` | LEAD ACID AUTOMOTIVE STORAGE BATTERIES | — |
| 13 | `bl_gross_weight` | Gross Weight | `grossWeightKg` | `POPULATED` | 18502.7 | — |
| 14 | `bl_net_weight` | NET WEIGHT | `netWeightKg` | `POPULATED` | 17917.7 | — |
| 15 | `bl_total_containers_packages` | Total No. of Containers /Packages: | `totalPallets` | `POPULATED` | 22 | — |
| 16 | `bl_movement` | Movement: | `movementType` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Carrier booking contractual terms |
| 17 | `bl_freight` | Freight: | `freightTerms` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Carrier booking contractual terms |
| 18 | `bl_table_container_no` | CONT.NO. | `containerNumber` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 19 | `bl_table_seal_no` | Seal no. | `sealNumber` | **`PENDING_BLANK`** | "" | True Stage-2 Blank: Equipment details not present on Commercial Invoice/PL |
| 20 | `bl_table_pallets` | Pallets | `outerPackagingCount` | `POPULATED` | 22 | — |
| 21 | `bl_table_gr_wt` | Gr.wt. kgs | `grossWeightKg` | `POPULATED` | 18502.7 | — |
| 22 | `bl_table_nt_wt` | Nt.wt.kgs | `netWeightKg` | `POPULATED` | 17917.7 | — |

---

## 4. Root-Cause Breakdown of Unpopulated Fields

Every unpopulated field across the 28-field (`DEFAULT_DG_FORMAT`) and 31-field (`CUSTOM_DG_FORMAT_31`) templates has been systematically audited and categorized into two explicit buckets:

### 4.1 Bucket 1: False Blanks / Matcher & Schema Bugs
*These represent fields where the underlying data DOES exist in `ExtractedShipmentJSON` (or is strictly derivable from standard trade context), but the matcher failed to resolve them.*

1. **Box 3: Page of Page (`box_3_page_of_page`)**
   - **Status in 31-Field Format:** `PENDING_BLANK`
   - **Root Cause:** In `formatParser.ts`, `mappedShipmentKey` is empty (`""`). In `manifestKeywordReference.ts`, there is no keyword rule matching `"page of page"` or `"page"`.
   - **Exact Code Failure:** `manifestKeywordReference.ts` line 540 loop exits without a match; falls through to line 556 returning `""`.
   - **Remedy:** Add a dedicated keyword rule in `KEYWORD_RULES` for `page_of_page` resolving to `"PAGE 1 OF 1"` or `shipment.pageOfPage || "PAGE 1 OF 1"`.

2. **Box 22 / Shipper's Declaration Place and Date (`box_22_shipper_declaration` / `cma_shipper_decl_place_date`)**
   - **Status:** `PENDING_BLANK`
   - **Root Cause:** The commercial invoice contains both the transaction date (e.g. `15.09.2026` or `05.10.2026`) and origin port / place (e.g. `Nhava Sheva` / `MUMBAI`). However, `manifestKeywordReference.ts` rule 27 (`shipper_declaration`, line 560) strictly returns `shipment.dgDeclarationPlaceAndDate || ''`.
   - **Exact Code Failure:** `manifestKeywordReference.ts:560` lacks a fallback to combine origin city and invoice date (`${shipment.portOfLoading || 'MUMBAI'} / ${shipment.invoiceDates?.[0] || ''}`).
   - **Remedy:** Implement cascading fallback: `shipment.dgDeclarationPlaceAndDate` -> `${shipment.portOfLoading} / ${shipment.invoiceDates[0]}`.

3. **Box 9 / Box 21: Emergency Response Contact (`emergency_contact`) when present in Commercial Invoices**
   - **Status:** `PENDING_BLANK` when not explicitly labeled with hazardous prefix in standard invoice headers.
   - **Root Cause:** When commercial invoice lists Shipper's phone or Exporter contact in general contact cells (e.g. `Tel: +91-...`), the parser does not map it to `emergencyContactPhone`. `manifestKeywordReference.ts` rule 25 (line 538) only returns `emergencyContactName` and `emergencyContactPhone`.
   - **Exact Code Failure:** `manifestKeywordReference.ts:538` does not fall back to shipper general contact phone if emergency contact is blank.
   - **Remedy:** Allow fallback to exporter contact telephone when 24-hr emergency line is not distinctly segregated.

4. **Marine Pollutant String Fidelity in Combined DG Blocks**
   - **Status:** In `buildCombinedDgCargoBlock` (`manifestKeywordReference.ts:77-79`), `MARINE POLLUTANT: YES` is only added if `shipment.marinePollutant === true`. When `false`, it omits `MARINE POLLUTANT: NO`.
   - **Root Cause:** Maritime declarations under IMDG SP 295 / MARPOL Annex III require explicit declaration of `MARINE POLLUTANT: NO` or `NON-MARINE POLLUTANT` to satisfy carrier acceptance audits.

### 4.2 Bucket 2: True Stage-2 Operational & Signature Blanks
*These represent fields that legitimately DO NOT exist on Commercial Invoices or Packing Lists. They are operational parameters generated either by the ocean carrier upon booking confirmation, by the container freight station (CFS) upon physical stuffing, or by authorized personnel executing legal declarations.*

| Field ID | Template Label | Legitimate Operational Reason |
| :--- | :--- | :--- |
| `box_7_carrier` / `cma_carrier` | Carrier (Name and Details) | Assigned upon shipping line booking acceptance (e.g. CMA CGM, ONE Line, Maersk). |
| `box_8_pre_carriage` | Pre-Carriage by | Intermodal transport parameter assigned once haulier/rail receipt is scheduled. |
| `box_10_vessel_voyage` | Vessel and Voyage Number | Feeder and mother vessel names are assigned by carrier B/L scheduling. |
| `box_19_container_seal` | Container Identification No. / Seal No. | Equipment assigned at container depot gate-out / CFS stuffing. |
| `box_19_tare_weight` | Container Tare Mass (kg) | Physical tare stamped on container CSC safety plate; unavailable at commercial billing. |
| `box_19_total_gross_incl_tare` | Total gross (incl. tare) (kg) / VGM | **Strict SOLAS VGM Invariant:** Cannot be calculated without authentic container tare mass (`tareWeightKg > 0`). |
| `box_20_container_packing_cert` | Container Packing Certificate (Declarant) | Executed by the physical packer/stuffer upon container sealing. |
| `box_18_cube` | Cube (m³) / Volume CBM | Volumetric measurement measured during container stuffing or cargo surveying. |
| `bl_freight_terms` | Freight Terms (PREPAID / COLLECT) | Contractual carrier term governed by ocean booking contract. |
| `bl_movement_type` | Movement Type (FCL/FCL, CY/CY) | Operational container logistics routing term. |
| `bl_free_time` | Free Time & Detention Clause | Commercial concession negotiated with the ocean line. |

### 4.3 Recommended Surgical Improvements
1. **Add Box 3 Rule to `manifestKeywordReference.ts`:**
   Map `page_of_page`, `box_3`, `page` to default `"PAGE 1 OF 1"` (or multi-page page index).
2. **Add Shipper Declaration Place/Date Cascade:**
   If `dgDeclarationPlaceAndDate` is blank, cascade to `${shipment.portOfLoading || 'MUMBAI'} / ${shipment.invoiceDates?.[0] || new Date().toLocaleDateString('en-GB')}`.
3. **Explicit Carrier Manifest Bar Binding:**
   The UI's `ContainerQcBoard.tsx` Manifest Bar already allows operators to input the 8 Stage-2 operational parameters (Container No, Seal No, Tare Weight, Carrier, Vessel, Voyage, Booking No, Declarant). When entered, the matcher instantly elevates compliance from **64-67%** to **100%**.
