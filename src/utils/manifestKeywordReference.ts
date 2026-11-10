// Ekdant Logistics - Global Semantic Keyword Reference & Cascading Fallback Engine
// Pure generic semantic mappings across standard IMO DG Declaration and Ocean Bill of Lading formats

import type { ExtractedShipmentJSON, FormatDocumentType, ExtractedPallet } from '../types/index.ts';

export interface KeywordRule {
  id: string;
  description: string;
  keywords: string[];
  excludeKeywords?: string[];
  resolver: (shipment: ExtractedShipmentJSON, docType?: FormatDocumentType) => string;
}

/**
 * Standard IMDG Code UN Regulatory Dictionary
 * Provides universal regulatory defaults for common multimodal dangerous goods.
 */
export interface ImdgUnDefinition {
  properShippingName: string;
  imoClass: string;
  packingGroup: string;
  emsNumber: string;
  segregationGroup: string;
}

export const IMDG_UN_LOOKUP: Record<string, ImdgUnDefinition> = {
  '2794': {
    properShippingName: 'BATTERIES, WET, FILLED WITH ACID',
    imoClass: '8',
    packingGroup: 'III',
    emsNumber: 'F-A, S-B',
    segregationGroup: 'SGG1 - Acids'
  },
  '2795': {
    properShippingName: 'BATTERIES, WET, FILLED WITH ALKALI',
    imoClass: '8',
    packingGroup: 'III',
    emsNumber: 'F-A, S-B',
    segregationGroup: 'SGG18 - Alkalis'
  },
  '2800': {
    properShippingName: 'BATTERIES, WET, NON-SPILLABLE',
    imoClass: '8',
    packingGroup: 'III',
    emsNumber: 'F-A, S-B',
    segregationGroup: 'SGG1 - Acids'
  },
  '3090': {
    properShippingName: 'LITHIUM METAL BATTERIES',
    imoClass: '9',
    packingGroup: 'II',
    emsNumber: 'F-A, S-I',
    segregationGroup: ''
  },
  '3091': {
    properShippingName: 'LITHIUM METAL BATTERIES CONTAINED IN EQUIPMENT',
    imoClass: '9',
    packingGroup: 'II',
    emsNumber: 'F-A, S-I',
    segregationGroup: ''
  },
  '3480': {
    properShippingName: 'LITHIUM ION BATTERIES',
    imoClass: '9',
    packingGroup: 'II',
    emsNumber: 'F-A, S-I',
    segregationGroup: ''
  },
  '3481': {
    properShippingName: 'LITHIUM ION BATTERIES CONTAINED IN EQUIPMENT',
    imoClass: '9',
    packingGroup: 'II',
    emsNumber: 'F-A, S-I',
    segregationGroup: ''
  }
};

/**
 * Synthesizes contiguous numeric or per-prefix pallet identifier ranges from pallet entries.
 * E.g. ["4533", "4534", "4535", "4956", "TAL/1703/2026", "TAL/1704/2026"]
 * => ["4533 TO 4535", "4956", "TAL/1703/2026 TO TAL/1704/2026"]
 */
export function synthesizePalletRanges(pallets: ExtractedPallet[]): string[] {
  if (!pallets || pallets.length === 0) return [];

  // Group by sourceFile or prefix
  const rawList = pallets.map(p => (p.palletNumber || '').trim()).filter(Boolean);
  if (rawList.length === 0) return [];

  const ranges: string[] = [];
  let currentStart = rawList[0];
  let currentEnd = rawList[0];

  // Helper to extract numeric suffix and prefix
  const splitId = (id: string): { prefix: string; num: number; width: number } | null => {
    const match = id.match(/^(.*?)(\d+)$/);
    if (!match) return null;
    return {
      prefix: match[1],
      num: parseInt(match[2], 10),
      width: match[2].length
    };
  };

  let prevParsed = splitId(currentStart);

  for (let i = 1; i < rawList.length; i++) {
    const id = rawList[i];
    const parsed = splitId(id);

    if (
      prevParsed &&
      parsed &&
      prevParsed.prefix === parsed.prefix &&
      parsed.num === prevParsed.num + 1
    ) {
      // Contiguous sequence
      currentEnd = id;
      prevParsed = parsed;
    } else {
      // End current range and start new
      if (currentStart === currentEnd) {
        ranges.push(currentStart);
      } else {
        ranges.push(`${currentStart} TO ${currentEnd}`);
      }
      currentStart = id;
      currentEnd = id;
      prevParsed = parsed;
    }
  }

  // Push final range
  if (currentStart === currentEnd) {
    ranges.push(currentStart);
  } else {
    ranges.push(`${currentStart} TO ${currentEnd}`);
  }

  return ranges;
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
  if (includeMarks) {
    let marksText = (shipment.shippingMarks || '').trim();
    if (shipment.pallets && shipment.pallets.length > 0) {
      const palletRanges = synthesizePalletRanges(shipment.pallets);
      const palletStr = palletRanges.join(', ');
      if (palletStr && !marksText.includes(palletRanges[0])) {
        marksText = marksText ? `${marksText}\nPALLET NOS: ${palletStr}` : `PALLET NOS: ${palletStr}`;
      }
    }
    if (marksText) {
      blocks.push(`MARKS & NUMBERS:\n${marksText}`);
    }
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
  const unDigits = (shipment.unNumber || '').replace(/\D/g, '');
  const imdgRef = IMDG_UN_LOOKUP[unDigits];
  const officialPsn = imdgRef ? imdgRef.properShippingName : (shipment.properShippingName || '');
  const commDesc = shipment.productDescription || '';

  const primaryDesc = officialPsn || commDesc;
  if (primaryDesc && primaryDesc.trim()) {
    let descLine = primaryDesc.trim();
    if (commDesc && commDesc.trim() && officialPsn && commDesc.trim() !== officialPsn.trim()) {
      descLine += `\nTECHNICAL NAME: ${commDesc.trim()}`;
    }

    // Deduplicate brand line: only append if not already mentioned in description
    const hasBrandMention = /brand\s*name|brand\s*:/i.test(descLine);
    if (shipment.brandName && !hasBrandMention && !descLine.toLowerCase().includes(shipment.brandName.toLowerCase())) {
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
  const imoClass = shipment.imoClass || imdgRef?.imoClass || '';
  if (imoClass) {
    dgLines.push(`IMO CLASS: ${imoClass}`);
  }
  const pg = shipment.packingGroup || imdgRef?.packingGroup || '';
  if (pg) {
    dgLines.push(`PACKING GROUP: ${pg}`);
  }
  if (shipment.flashPoint && shipment.flashPoint.trim()) {
    dgLines.push(`FLASH POINT: ${shipment.flashPoint.trim()}`);
  }
  const ems = shipment.emsNumber || imdgRef?.emsNumber || '';
  if (ems) {
    dgLines.push(`EMS: ${ems}`);
  }
  const sgg = shipment.segregationGroup || imdgRef?.segregationGroup || '';
  if (sgg) {
    dgLines.push(`SEGREGATION: ${sgg}`);
  }
  if (shipment.unPackingCode && shipment.unPackingCode.trim()) {
    dgLines.push(`UN PACKING CODE: ${shipment.unPackingCode.trim()}`);
  }
  if (shipment.isDangerousGoods || shipment.unNumber) {
    dgLines.push(`MARINE POLLUTANT: ${shipment.marinePollutant ? 'YES' : 'NO'}`);
  } else if (shipment.marinePollutant) {
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

  // 7. Page of Page (Box 3)
  {
    id: 'page_of_page',
    description: 'Document Page Index (Box 3)',
    keywords: ['page of page', 'page_of_page', 'box_3_page', '3 page of page', 'page of', 'page no', 'page number'],
    resolver: () => {
      return '1 OF 1';
    }
  },

  // 8. Box 14 / Combined DG Cargo Description Block
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

  // 8. Cargo Description / Proper Shipping Name with IMDG Defaults, Brand & HSN Fallbacks
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
    resolver: (shipment, docType) => {
      const unDigits = (shipment.unNumber || '').replace(/\D/g, '');
      const imdgRef = IMDG_UN_LOOKUP[unDigits];

      // If document is DG, strictly prefer the official IMDG Proper Shipping Name
      if (docType === 'DG' && imdgRef) {
        return imdgRef.properShippingName;
      }

      // Primary: properShippingName
      if (shipment.properShippingName && shipment.properShippingName.trim()) {
        return shipment.properShippingName.trim();
      }
      if (imdgRef) {
        return imdgRef.properShippingName;
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
      'bl_packages_and_marks',
      'bl_shipping_marks'
    ],
    excludeKeywords: ['tare', 'gross weight', 'net weight', 'vgm', 'proper shipping name'],
    resolver: (shipment) => {
      let marks = (shipment.shippingMarks || '').trim();

      // Automatically append synthesized pallet ranges if available and not yet present
      if (shipment.pallets && shipment.pallets.length > 0) {
        const palletRanges = synthesizePalletRanges(shipment.pallets);
        const palletStr = palletRanges.join(', ');
        if (palletStr && !marks.includes(palletRanges[0])) {
          marks = marks ? `${marks}\nPALLET NOS: ${palletStr}` : `PALLET NOS: ${palletStr}`;
        }
      }

      if (marks) {
        return marks;
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
    keywords: [
      'name/status of declarant',
      'name / status of declarant',
      'packing certificate',
      'declarant',
      'signatory',
      'name and status of declarant',
      'status of declarant'
    ],
    excludeKeywords: ['signature of declarant', 'driver', 'signature on behalf'],
    resolver: (shipment) => {
      const parts = [shipment.dgDeclarantName, shipment.dgDeclarantStatus].filter(Boolean);
      if (parts.length > 0) {
        return parts.join(' - ');
      }
      if (shipment.shipperName && shipment.shipperName.trim()) {
        return shipment.shipperName.trim();
      }
      return '';
    }
  },

  // 27. Shipper Declaration Place & Date
  {
    id: 'shipper_declaration',
    description: "Shipper's Declaration Place and Date",
    keywords: [
      'place and date',
      'place & date',
      'date and place',
      "shipper's declaration (place and date)",
      "shipper's declaration",
      'shipper declaration',
      'place and date of declaration',
      'declaration place'
    ],
    excludeKeywords: ['driver', 'carrier'],
    resolver: (shipment) => {
      if (shipment.dgDeclarationPlaceAndDate && shipment.dgDeclarationPlaceAndDate.trim()) {
        return shipment.dgDeclarationPlaceAndDate.trim();
      }
      const port = shipment.portOfLoading || shipment.placeOfReceipt;
      const date = shipment.invoiceDates && shipment.invoiceDates.length > 0 ? shipment.invoiceDates[0] : '';
      if (port && date) {
        return `${port} / ${date}`;
      }
      return port || date || '';
    }
  },

  // 28. Commercial Freight Terms
  {
    id: 'freight_terms',
    description: 'Freight Payment Terms (Prepaid / Collect)',
    keywords: ['freight payable', 'freight terms', 'freight prepaid', 'freight collect', 'freight:'],
    resolver: (shipment) => {
      if (shipment.freightTerms && shipment.freightTerms.trim()) {
        return shipment.freightTerms.trim();
      }
      const inc = (shipment.incoterm || '').toUpperCase().trim();
      if (/^(CFR|CIF|CPT|CIP|DAP|DPU|DDP)/.test(inc)) {
        return 'FREIGHT PREPAID';
      }
      if (/^(FOB|EXW|FCA|FAS)/.test(inc)) {
        return 'FREIGHT COLLECT';
      }
      return '';
    }
  },

  // 29. Movement Type
  {
    id: 'movement_type',
    description: 'Cargo Movement Type (e.g. FCL/FCL, CY/CY)',
    keywords: ['movement type', 'movement:', 'fcl/fcl', 'cy/cy', 'cfs/cfs'],
    resolver: (shipment) => {
      if (shipment.movementType && shipment.movementType.trim()) {
        return shipment.movementType.trim();
      }
      if (shipment.containerType || shipment.totalPallets > 0 || shipment.outerPackagingCount > 0) {
        return 'FCL/FCL';
      }
      return '';
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
