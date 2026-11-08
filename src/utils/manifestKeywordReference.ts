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
    description: 'Shipper / Consignor / Exporter Party Details',
    keywords: ['shipper', 'consignor', 'exporter'],
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

  // 8. Shipping Marks & Numbers / Packages
  {
    id: 'shipping_marks_and_packages',
    description: 'Shipping Marks, Numbers, and Packages',
    keywords: [
      'shipping marks',
      'marks & nos',
      'marks and numbers',
      'package description',
      'packages',
      'description of goods',
      'cargo description'
    ],
    excludeKeywords: ['tare', 'gross weight', 'net weight', 'vgm'],
    resolver: (shipment) => {
      // Primary: shippingMarks
      if (shipment.shippingMarks && shipment.shippingMarks.trim()) {
        return shipment.shippingMarks.trim();
      }
      // Fallback: productDescription + packaging counts
      const pkgParts: string[] = [];
      if (shipment.outerPackagingCount > 0) {
        pkgParts.push(`${shipment.outerPackagingCount} ${shipment.outerPackagingType || 'PALLETS'}`);
      }
      if (shipment.innerPackageCount > 0) {
        pkgParts.push(`${shipment.innerPackageCount} ${shipment.innerPackageType || 'BOXES'}`);
      }
      const pkgStr = pkgParts.join(' / ');
      const descStr = shipment.properShippingName || shipment.productDescription || '';
      if (pkgStr && descStr) {
        return `${pkgStr}\n${descStr}`;
      }
      return pkgStr || descStr;
    }
  },

  // 9. Container & Seal Numbers
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

  // 10. Container Type & Size
  {
    id: 'container_type',
    description: 'Container Type / Size',
    keywords: ['container type', 'container size', 'size & type', 'size and type'],
    resolver: (shipment) => {
      return shipment.containerType || '20GP';
    }
  },

  // 11. Container Tare Weight (kg)
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

  // 12. Gross Mass / Gross Weight (kg)
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

  // 13. Net Mass / Net Weight (kg)
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

  // 14. Volume / Measurement / Cube (CBM)
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

  // 15. Vessel and Voyage
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

  // 16. Port of Discharge (POD)
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

  // 17. Final Destination / Place of Delivery
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

  // 18. Port of Loading (POL)
  {
    id: 'port_of_loading',
    description: 'Port of Loading or Place of Receipt',
    keywords: ['port of loading', 'loading port', 'pol', 'port_of_loading', 'place of receipt'],
    resolver: (shipment) => {
      return shipment.portOfLoading || shipment.placeOfReceipt || '';
    }
  },

  // 19. Carrier / Shipping Line
  {
    id: 'carrier',
    description: 'Ocean Carrier Name',
    keywords: ['carrier (name', 'carrier name', 'shipping line', 'ocean carrier'],
    resolver: (shipment) => {
      return shipment.carrierName || '';
    }
  },

  // 20. Pre-Carriage By
  {
    id: 'pre_carriage',
    description: 'Pre-Carriage By Details',
    keywords: ['pre-carriage by', 'pre carriage by', 'pre-carriage'],
    resolver: (shipment) => {
      return shipment.preCarriageBy || '';
    }
  },

  // 21. Shipping Bill Numbers
  {
    id: 'shipping_bill',
    description: 'Shipping Bill Number(s) and Date',
    keywords: ['shipping bill', 'sb no', 'customs bill'],
    resolver: (shipment) => {
      return shipment.shippingBillNumbers || '';
    }
  },

  // 22. HSN / Tariff Classification Code
  {
    id: 'hsn_code',
    description: 'HSN / Tariff Classification Code',
    keywords: ['hsn', 'tariff code', 'commodity code', 'schedule b'],
    resolver: (shipment) => {
      return shipment.hsnCode || '';
    }
  },

  // 23. Emergency Response Contact
  {
    id: 'emergency_contact',
    description: '24-Hour Emergency Response Contact Name & Telephone',
    keywords: ['emergency response', 'emergency contact', '24-hour emergency', 'emergency telephone'],
    resolver: (shipment) => {
      const parts = [shipment.emergencyContactName, shipment.emergencyContactPhone].filter(Boolean);
      return parts.join(' - ');
    }
  },

  // 24. DG Declarant / Packing Certificate
  {
    id: 'dg_declarant',
    description: 'Container / Vehicle Packing Certificate (Name/Status of Declarant)',
    keywords: ['packing certificate', 'declarant', 'name/status of declarant'],
    resolver: (shipment) => {
      const parts = [shipment.dgDeclarantName, shipment.dgDeclarantStatus].filter(Boolean);
      return parts.join(' - ');
    }
  },

  // 25. Shipper Declaration Place & Date
  {
    id: 'shipper_declaration',
    description: "Shipper's Declaration Place and Date",
    keywords: ["shipper's declaration (place and date)", 'shipper declaration', 'place and date of declaration'],
    resolver: (shipment) => {
      return shipment.dgDeclarationPlaceAndDate || '';
    }
  },

  // 26. Commercial Freight Terms
  {
    id: 'freight_terms',
    description: 'Freight Payment Terms (Prepaid / Collect)',
    keywords: ['freight payable', 'freight terms', 'freight prepaid', 'freight collect'],
    resolver: (shipment) => {
      return shipment.freightTerms || '';
    }
  },

  // 27. Movement Type
  {
    id: 'movement_type',
    description: 'Cargo Movement Type (e.g. FCL/FCL, CY/CY)',
    keywords: ['movement type', 'fcl/fcl', 'cy/cy', 'cfs/cfs'],
    resolver: (shipment) => {
      return shipment.movementType || '';
    }
  },

  // 28. Free Time Clause
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
