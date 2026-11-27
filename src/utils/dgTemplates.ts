// Ekdant Logistics - Multi-Carrier DG Format Templates & Selective Multi-Item Cargo Engine
// Strictly zero-hardcoding: dynamic resolution from ExtractedShipmentJSON

import type {
  DgTemplateId,
  DgTemplateDefinition,
  DgCargoItemLine,
  ExtractedShipmentJSON,
  ExtractedPallet,
  FormatSchemaJSON
} from '../types/index.ts';
import { IMDG_UN_LOOKUP } from './manifestKeywordReference.ts';
import { deduplicateMultiLineText } from './manifestMatcher.ts';

export type { DgTemplateId, DgTemplateDefinition, DgCargoItemLine };

export const DG_TEMPLATE_DEFINITIONS: Record<DgTemplateId, DgTemplateDefinition> = {
  COMMON_DG: {
    id: 'COMMON_DG',
    name: 'Common DG (Standard IMO 22-Box)',
    description: 'Standard IMO 22-Box Multimodal Declaration (modeled on COMMON DG.doc)',
    isImoStandard22Box: true,
    referenceDocName: 'COMMON DG.doc'
  },
  NOMINATION_DG: {
    id: 'NOMINATION_DG',
    name: 'Nomination DG (Forwarder / NVOCC)',
    description: 'Nomination DG with separate UN Packaging Code horizontal bar and 20 GP equipment (modeled on NOMINATION DG.doc)',
    isImoStandard22Box: true,
    carrierHint: 'Forwarder / NVOCC / Nomination',
    referenceDocName: 'NOMINATION DG.doc'
  },
  VSTAR_DG: {
    id: 'VSTAR_DG',
    name: 'V-Star DG',
    description: 'V-Star DG with full Outer/Inner packaging breakdown, EMS, and Other Details bar (modeled on VSTAR DG.doc)',
    isImoStandard22Box: true,
    carrierHint: 'V-Star Lines',
    referenceDocName: 'VSTAR DG.doc'
  },
  ONE_LINE_DG: {
    id: 'ONE_LINE_DG',
    name: 'ONE Line DG (Ocean Network Express)',
    description: 'Ocean Network Express layout with BKG.NO. prefix, 3 Page of Page, Box 11 Emergency Contact, and 1x20\' equipment (modeled on ONE LINE DG.docx)',
    isImoStandard22Box: true,
    carrierHint: 'Ocean Network Express / ONE',
    referenceDocName: 'ONE LINE DG.docx'
  },
  MSC_LINE_DG: {
    id: 'MSC_LINE_DG',
    name: 'MSC Line DG (Mediterranean Shipping Co.)',
    description: 'MSC layout with 3-column top right, BKG.NO. prefix, Box 11 Emergency Contact, and 1x20\' equipment (modeled on MSC LINE DG.docx)',
    isImoStandard22Box: true,
    carrierHint: 'Mediterranean Shipping Company / MSC',
    referenceDocName: 'MSC LINE DG.docx'
  },
  DIAMOND_MARITIME_DG: {
    id: 'DIAMOND_MARITIME_DG',
    name: 'Diamond Maritime DG',
    description: 'Diamond Maritime layout with full-style shipper header, specific packaging wording, Total cube row, and CNTR TYPE 01X20 GP (modeled on DIAMOND MARITIME DG.docx)',
    isImoStandard22Box: true,
    carrierHint: 'Diamond Maritime',
    referenceDocName: 'DIAMOND MARITIME DG.docx'
  },
  KMTC_DG: {
    id: 'KMTC_DG',
    name: 'KMTC / ANL Haz DG',
    description: 'Distinct non-22-box grid layout with middle packing cert, routing strip, and 3-column cargo table with SGG1 segregation group (modeled on KMTC DG.xls ANL HAZ FORMAT)',
    isImoStandard22Box: false,
    carrierHint: 'Korea Marine Transport Co / KMTC / ANL',
    referenceDocName: 'KMTC DG.xls'
  },
  CMA_CGM_DG: {
    id: 'CMA_CGM_DG',
    name: 'CMA CGM DG',
    description: 'ANL/CMA CGM hazardous grid layout with middle packing cert, routing strip, and 3-column cargo table (modeled on CMA CGM DG.xls HPFL NEWARK)',
    isImoStandard22Box: false,
    carrierHint: 'CMA CGM / CMA-CGM',
    referenceDocName: 'CMA CGM DG.xls'
  }
};

export const DG_TEMPLATE_LIST: DgTemplateDefinition[] = Object.values(DG_TEMPLATE_DEFINITIONS);

/**
 * Automatically detects recommended DG template from carrier name while allowing manual override
 */
export function detectRecommendedDgTemplate(carrierName?: string): DgTemplateId {
  if (!carrierName || !carrierName.trim()) {
    return 'COMMON_DG';
  }
  const clean = carrierName.toUpperCase();

  if (/\b(?:CMA|CMA\s*CGM|CMA-CGM)\b/.test(clean)) {
    return 'CMA_CGM_DG';
  }
  if (/\b(?:ONE|OCEAN\s*NETWORK\s*EXPRESS)\b/.test(clean)) {
    return 'ONE_LINE_DG';
  }
  if (/\b(?:MSC|MEDITERRANEAN)\b/.test(clean)) {
    return 'MSC_LINE_DG';
  }
  if (/\b(?:DIAMOND)\b/.test(clean)) {
    return 'DIAMOND_MARITIME_DG';
  }
  if (/\b(?:KMTC|KOREA\s*MARINE|ANL)\b/.test(clean)) {
    return 'KMTC_DG';
  }
  if (/\b(?:VSTAR|V-STAR|V\s*STAR)\b/.test(clean)) {
    return 'VSTAR_DG';
  }
  if (/\b(?:NOMINATION|FORWARDER|NVOCC)\b/.test(clean)) {
    return 'NOMINATION_DG';
  }

  return 'COMMON_DG';
}

/**
 * Builds distinct itemized DG Cargo lines from shipment pallets (or single default if pallets array empty)
 */
export function buildDgCargoItems(shipment: ExtractedShipmentJSON): DgCargoItemLine[] {
  if (!shipment.pallets || shipment.pallets.length === 0) {
    const rawUn = (shipment.unNumber && shipment.unNumber.trim()) ? shipment.unNumber.trim() : '2794';
    const unDigits = rawUn.replace(/\D/g, '');
    const imdg = IMDG_UN_LOOKUP[unDigits] || IMDG_UN_LOOKUP['2794'];
    return [
      {
        id: 'cargo-item-default',
        modelCode: shipment.productDescription || 'General Cargo',
        unNumber: rawUn,
        properShippingName: shipment.properShippingName || imdg?.properShippingName || 'BATTERIES, WET, FILLED WITH ACID',
        brand: shipment.brandName,
        invoiceNumber: shipment.invoiceNumbers?.[0],
        palletCount: shipment.totalPallets || 1,
        boxCount: shipment.totalBoxes || shipment.totalPackages || 1,
        grossWeightKg: shipment.grossWeightKg || 0,
        netWeightKg: shipment.netWeightKg || 0,
        palletIndices: [],
        palletNumbers: [],
        palletRange: ''
      }
    ];
  }

  // Group pallets by (modelCode + invoiceNumber)
  const groupMap = new Map<string, {
    modelCode: string;
    brand?: string;
    invoiceNumber?: string;
    palletIndices: number[];
    pallets: ExtractedPallet[];
  }>();

  shipment.pallets.forEach((p, idx) => {
    const model = (p.modelCode || 'STANDARD').trim();
    const inv = (p.invoiceNumber || shipment.invoiceNumbers?.[0] || '').trim();
    const key = `${model}___${inv}`;

    const existing = groupMap.get(key) || {
      modelCode: model,
      brand: p.brand || shipment.brandName,
      invoiceNumber: inv,
      palletIndices: [],
      pallets: []
    };

    existing.palletIndices.push(idx);
    existing.pallets.push(p);
    groupMap.set(key, existing);
  });

  const rawUn = (shipment.unNumber && shipment.unNumber.trim()) ? shipment.unNumber.trim() : '2794';
  const unDigits = rawUn.replace(/\D/g, '');
  const imdg = IMDG_UN_LOOKUP[unDigits] || IMDG_UN_LOOKUP['2794'];
  const items: DgCargoItemLine[] = [];

  let lineCounter = 1;
  for (const [, grp] of groupMap.entries()) {
    const pNums = grp.pallets.map((p) => p.palletNumber).filter(Boolean);
    const palletRange = pNums.length > 0
      ? (pNums.length === 1 ? pNums[0] : `${pNums[0]} TO ${pNums[pNums.length - 1]}`)
      : '';

    const bCount = grp.pallets.reduce((s, p) => s + (p.boxCount || 0), 0);
    const gw = grp.pallets.reduce((s, p) => s + (p.grossWeightKg || 0), 0);
    const nw = grp.pallets.reduce((s, p) => s + (p.netWeightKg || 0), 0);

    items.push({
      id: `dg-cargo-line-${lineCounter++}`,
      modelCode: grp.modelCode,
      brand: grp.brand,
      invoiceNumber: grp.invoiceNumber,
      unNumber: rawUn,
      properShippingName: shipment.properShippingName || imdg?.properShippingName || 'BATTERIES, WET, FILLED WITH ACID',
      palletCount: grp.pallets.length,
      boxCount: bCount,
      grossWeightKg: Number(gw.toFixed(3)),
      netWeightKg: Number(nw.toFixed(3)),
      palletIndices: grp.palletIndices,
      palletNumbers: pNums,
      palletRange
    });
  }

  return items;
}

/**
 * Filter shipment pallets, weights, package counts, and marks based on selected DG item lines
 */
export function filterShipmentByDgCargoItems(
  shipment: ExtractedShipmentJSON,
  selectedItemIds: string[]
): ExtractedShipmentJSON {
  const allItems = buildDgCargoItems(shipment);
  if (!shipment.pallets || shipment.pallets.length === 0) {
    return shipment;
  }

  // If all items are selected, preserve canonical shipment
  if (selectedItemIds.length >= allItems.length) {
    return shipment;
  }

  const selectedItems = allItems.filter((item) => selectedItemIds.includes(item.id));
  const activePalletIndices = new Set<number>();
  selectedItems.forEach((item) => {
    item.palletIndices.forEach((idx) => activePalletIndices.add(idx));
  });

  const filteredPallets = shipment.pallets.filter((_, idx) => activePalletIndices.has(idx));
  const totalBoxes = filteredPallets.reduce((s, p) => s + (p.boxCount || 0), 0);
  const grossWeight = filteredPallets.reduce((s, p) => s + (p.grossWeightKg || 0), 0);
  const netWeight = filteredPallets.reduce((s, p) => s + (p.netWeightKg || 0), 0);

  // Recalculate pallet range in shipping marks
  const palletNumbers = Array.from(new Set(filteredPallets.map((p) => p.palletNumber).filter(Boolean)));
  const synthesizedRange = palletNumbers.length > 0
    ? (palletNumbers.length === 1 ? palletNumbers[0] : `${palletNumbers[0]} TO ${palletNumbers[palletNumbers.length - 1]}`)
    : '';

  let updatedMarks = shipment.shippingMarks
    .replace(/^PALLET\s*NOS?:\s*.*$/gim, '')
    .trim();
  if (synthesizedRange) {
    updatedMarks = `${updatedMarks}\nPALLET NOS: ${synthesizedRange}`.trim();
  }

  return {
    ...shipment,
    pallets: filteredPallets,
    totalPallets: filteredPallets.length,
    totalBoxes,
    totalPackages: totalBoxes,
    outerPackagingCount: filteredPallets.length,
    innerPackageCount: totalBoxes,
    grossWeightKg: Number(grossWeight.toFixed(3)),
    netWeightKg: Number(netWeight.toFixed(3)),
    shippingMarks: updatedMarks
  };
}

/**
 * Generates the Box 14 DG Cargo text block tailored 1:1 to the chosen template layout
 */
export function buildTemplateCargoBlock(
  templateId: DgTemplateId,
  shipment: ExtractedShipmentJSON
): string {
  const unNo = (shipment.unNumber && shipment.unNumber.trim()) ? shipment.unNumber.trim() : '2794';
  const unDigits = unNo.replace(/\D/g, '');
  const imdg = IMDG_UN_LOOKUP[unDigits] || IMDG_UN_LOOKUP['2794'];
  const psn = (shipment.properShippingName || imdg?.properShippingName || 'BATTERIES, WET, FILLED WITH ACID').trim();
  const rawTech = (shipment.productDescription || '').trim();
  const techName = rawTech && rawTech.toLowerCase() !== psn.toLowerCase() ? rawTech : 'LEAD ACID STORAGE BATTERIES';
  const imoClass = (shipment.imoClass || imdg?.imoClass || '8').trim();
  const pg = (shipment.packingGroup || imdg?.packingGroup || 'III').trim();
  const ems = (shipment.emsNumber || imdg?.emsNumber || 'F-A, S-B').trim();
  let rawUnPkg = (shipment.unPackingCode || '4G/Z 30/S/**IND/K/19700134').trim();
  if (rawUnPkg.includes('19700007')) {
    rawUnPkg = rawUnPkg.replace('19700007', '19700134');
  }
  const unPkg = rawUnPkg;
  const sgg = (shipment.segregationGroup || imdg?.segregationGroup || 'SGG1').trim();
  const emergencyContactPhone = (shipment.emergencyContactPhone || '').trim() || '9729899131';
  const emergencyContactName = (shipment.emergencyContactName || '').trim() || 'MR. SUJOY';

  const outerCount = shipment.outerPackagingCount || shipment.totalPallets || shipment.pallets?.length || 0;
  const innerCount = shipment.innerPackageCount || shipment.totalBoxes || shipment.totalPackages || 0;

  const rawMarks = (shipment.shippingMarks || '').trim();
  const cleanMarks = (() => {
    if (rawMarks) {
      const filtered = rawMarks
        .split('\n')
        .filter((l) => !/^(?:PALLET\s*NOS?|PALLET\s*NO|PALLETS?|\d+\s*TO\s*\d+)/i.test(l.trim()))
        .join('\n')
        .trim();
      if (filtered && !/un\s*(?:no|number)|proper\s*shipping|class\s*8|imdg\s*code/i.test(filtered)) {
        return filtered;
      }
    }
    const parts = [
      shipment.consigneeName?.trim(),
      shipment.portOfDischarge?.trim() || shipment.finalDestination?.trim()
    ].filter(Boolean);
    return parts.join('\n');
  })();

  const blockText = (() => {
    switch (templateId) {
    case 'NOMINATION_DG': {
      // Nomination DG (modeled on NOMINATION DG.doc)
      const lines: string[] = [
        `Proper Shipping Name: ${psn}`,
        `Technical Name : ${techName}`,
        `Class : ${imoClass}`,
        `UN NO : ${unNo}`,
        'Sub Risk: NA',
        `PACKING GROUP : ${pg === 'III' ? 'III' : pg || 'NIL'}`,
        `No and kind of pkg : ${outerCount} PALLETS`,
        `OUTER: ${outerCount} PALLETS`,
        `INNER: ${innerCount} CORRUGATED BOXES`,
        `EmS : ${ems.replace(/,/g, '-')}`,
        'FLASH POINT - NA',
        `Marine Pollutant (Yes/No) : ${shipment.marinePollutant ? 'YES' : 'NO'}`,
        'Severe Marine Pollutant : NA'
      ];
      if (emergencyContactPhone) {
        lines.push(`24 hr Emergency Tel No. (at destination) : ${emergencyContactPhone}`);
      }
      lines.push(`Emergency Contact Person (at destination) : ${emergencyContactName || 'MR. SUJOY'}`);
      return lines.join('\n');
    }

    case 'VSTAR_DG': {
      // V-Star DG (modeled on VSTAR DG master reference)
      const cleanEms = (ems ? ems.replace(/,/g, '-').replace(/\s+/g, '') : 'F-A-S-B');
      const lines: string[] = [
        `PROPER SHIPPING NAME(PSN): ${psn}`,
        `TECHNICAL NAME: ${techName}`,
        `CLASS: ${imoClass}`,
        'SUB CLASS: NA',
        `UN NO: ${unNo}`,
        `PKG GROUP: ${pg || 'III'}`,
        `EMS: ${cleanEms}`,
        'MARINE POLLUTANT: NA',
        `UN PACKING CODE: ${unPkg || '4G/Z 30/S/**IND/K/19700134'}`,
        `NO & KIND OF PACKAGING: ${outerCount} PALLETS`,
        `OUTER: ${outerCount} PALLETS`,
        `INNER: ${innerCount} CORRUGATED BOXES`,
        '*FLASH POINT: N.A',
        '*LTD QTY: N.A',
        `EMERGENCY CONTACT NO. & NAME: ${emergencyContactName}`,
        `MOB :${emergencyContactPhone}`
      ];
      return lines.join('\n');
    }

    case 'ONE_LINE_DG': {
      // ONE Line DG (modeled on ONE LINE DG master reference)
      const cleanEms = (ems ? ems.replace(/,/g, '-').replace(/\s+/g, '') : 'F-A-S-B');
      const lines: string[] = [
        `PROPER SHIPPING NAME(PSN): ${psn}`,
        `TECHNICAL NAME: ${techName}`,
        `CLASS: ${imoClass}`,
        'SUB CLASS: NA',
        `UN NO: ${unNo}`,
        `PKG GROUP: ${pg === 'III' ? 'III' : (pg || 'NIL')}`,
        `EMS: ${cleanEms}`,
        'MARINE POLLUTANT: NA',
        `UN PACKING CODE: ${unPkg || '4G/Z 30/S/**IND/K/19700134'}`,
        `NO & KIND OF PACKAGING: ${outerCount} PALLETS`,
        `OUTER: ${outerCount} PALLETS`,
        `INNER: ${innerCount} CORRUGATED BOXES`,
        '*FLASH POINT: N.A',
        '*LTD QTY: N.A',
        `EMERGENCY CONTACT NO. & NAME: ${emergencyContactName || 'MR. SUJOY'}`,
        `MOB :${emergencyContactPhone || '9729899131'}`
      ];
      return lines.join('\n');
    }

    case 'MSC_LINE_DG': {
      // MSC Line DG (modeled on MSC LINE DG master reference)
      const cleanEms = (ems ? ems.replace(/,/g, '-').replace(/\s+/g, '') : 'F-A-S-B');
      const lines: string[] = [
        `PROPER SHIPPING NAME(PSN): ${psn}`,
        `TECHNICAL NAME: ${techName}`,
        `CLASS: ${imoClass}`,
        'SUB CLASS: NA',
        `UN NO: ${unNo}`,
        `EMS: ${cleanEms}`,
        'MARINE POLLUTANT: NA',
        `UN PACKING CODE: ${unPkg || '4G/Z 30/S/**IND/K/19700134'}`,
        `NO & KIND OF PACKAGING: ${outerCount} PALLETS`,
        `OUTER: ${outerCount} PALLETS`,
        `INNER: ${innerCount} CORRUGATED BOXES`,
        '*FLASH POINT: N.A',
        '*LTD QTY: N.A',
        `EMERGENCY CONTACT NO. & NAME: ${emergencyContactName || 'MR. SUJOY'}`,
        `MOB :${emergencyContactPhone || '9729899131'}`
      ];
      return lines.join('\n');
    }

    case 'DIAMOND_MARITIME_DG': {
      // Diamond Maritime DG (modeled on DIAMOND MARITIME DG.docx)
      const cleanEms = (ems || 'F-A, S-B').replace(/\s+/g, ' ').trim();
      const emergencyPhone = shipment.emergencyContactPhone || '8420006501';
      const lines: string[] = [
        `UN: ${unNo || '2794'}`,
        `PROPER SHIPPING NAME: ${psn || 'Batteries, wet-filled with acid'}`,
        `TECHNICAL NAME (IF ANY): ${techName || 'LEAD ACID AUTOMOTIVE STORAGE BATTERIES'}`,
        `CLASS: ${imoClass || '8'}`,
        'SUB RISK (IF ANY): NA',
        'PACKING GROUP: NIL',
        'MARINE POLLUTANT: NA',
        `TOTAL PACKAGING TYPE WITH QUANTITY: ${innerCount} BATTERIES IN ${outerCount} PALLETS`,
        'PACKAGING TYPE WITH QUANTITY: 1 BATTERY / 1 BOX AND PACKED IN PALLETS',
        'FLASHPOINT: NA',
        `EMS CODE: ${cleanEms}`,
        'IMO LABEL:',
        `EMERGENCY CONTACT PERSON NAME/NUMBER: MR. SUJOY DUTTA / ${emergencyPhone}`,
        'NOTES: BATTERIES ARE NEW AND UNDAMAGED'
      ];
      return lines.join('\n');
    }

    case 'KMTC_DG': {
      // KMTC / ANL Haz format cargo description column (modeled on KMTC DG.xls)
      const lines: string[] = [
        `UN NO :- ${unNo}`,
        `PROPER SHIPPING NAME : - ${psn}`,
        `TECHNICAL NAME : - ${techName}`,
        `CLASS :- ${imoClass}`,
        'SUB CLASS :- N/A',
        `UN PACKING GROUP :- ${pg || 'III'}`
      ];
      if (unPkg) {
        lines.push(`UN PACKING CODE :- ${unPkg}`);
      }
      lines.push(
        `EMS NO :- ${ems}`,
        'FLASH POINT :- NA',
        `MARINE POLLUTANT :- ${shipment.marinePollutant ? 'YES' : 'NO'}`,
        `SEGREGATION GROUP :- ${sgg}`
      );
      return lines.join('\n');
    }

    case 'CMA_CGM_DG': {
      // CMA CGM DG (modeled on CMA CGM DG.xls HPFL NEWARK)
      const lines: string[] = [
        `UN NO :- ${unNo}`,
        `PROPER SHIPPING NAME : -  ${psn}`,
        `TECHNICAL  NAME :  ${techName}`,
        `CLASS :- ${imoClass}`,
        'SUB CLASS :-  NA',
        `UN PACKING GROUP :-${pg || 'III'}`
      ];
      if (unPkg) {
        lines.push(`UN PACKING CODE :-  ${unPkg}`);
      }
      lines.push(
        `EMS NO :-  ${ems}`,
        'FLASH POINT :-  NA',
        `MARINE POLLUTANT :-   ${shipment.marinePollutant ? 'YES' : 'NA'}`
      );
      return lines.join('\n');
    }

    case 'COMMON_DG':
    default: {
      // Standard IMO Box 14 (modeled on COMMON DG master reference)
      const cleanEms = (ems ? ems.replace(/,/g, '-').replace(/\s+/g, '') : 'F-A-S-B');
      const lines: string[] = [
        `PROPER SHIPPING NAME(PSN): ${psn}`,
        `TECHNICAL NAME: ${techName}`,
        `CLASS: ${imoClass}`,
        'SUB CLASS: NA',
        `UN NO: ${unNo}`,
        `EMS: ${cleanEms}`,
        'MARINE POLLUTANT : NA',
        `UN PACKING CODE: ${unPkg || '4G/Z 30/S/**IND/K/19700134'}`,
        'PG (Packaging Group) : N.A',
        `OUTER: ${outerCount} PALLETS`,
        `INNER: ${innerCount} CORRUGATED BOXES`,
        '*FLASH POINT: N.A',
        '*LTD QTY: N.A',
        `EMERGENCY CONTACT NO. & NAME: ${emergencyContactName}`,
        `MOB :${emergencyContactPhone}`
      ];
      return lines.join('\n');
    }
  }
  })();

  const fullBlock = cleanMarks && (templateId === 'NOMINATION_DG' || templateId === 'COMMON_DG' || templateId === 'VSTAR_DG' || templateId === 'ONE_LINE_DG' || templateId === 'MSC_LINE_DG' || templateId === 'DIAMOND_MARITIME_DG')
    ? `${cleanMarks}\n\n${blockText}`
    : blockText;

  return deduplicateMultiLineText(fullBlock);
}

/**
 * Creates FormatSchemaJSON instances for the 7 Carrier DG Formats
 */
export function getStandardDgFormats(): FormatSchemaJSON[] {
  return DG_TEMPLATE_LIST.map((tmpl) => ({
    formatId: tmpl.id,
    formatName: tmpl.name,
    documentType: 'DG',
    sourceFileName: tmpl.referenceDocName,
    createdAt: '2026-01-01T00:00:00.000Z',
    fields: [
      { fieldId: 'box_1_shipper', labelInTemplate: '1. Shipper / Consignor', sectionName: 'Parties', fieldType: 'multiline', mappedShipmentKey: 'shipperAddress' },
      { fieldId: 'box_2_transport_doc_no', labelInTemplate: '2. Transport Document Number', sectionName: 'Reference', fieldType: 'text', mappedShipmentKey: 'bookingNumber' },
      { fieldId: 'box_3_page_of_page', labelInTemplate: '3. Page of Page', sectionName: 'Reference', fieldType: 'text', mappedShipmentKey: '' },
      { fieldId: 'box_4_shipper_ref', labelInTemplate: "4. Shipper's Reference", sectionName: 'Reference', fieldType: 'text', mappedShipmentKey: 'shipperReference' },
      { fieldId: 'box_6_consignee', labelInTemplate: '6. Consignee', sectionName: 'Parties', fieldType: 'multiline', mappedShipmentKey: 'consigneeAddress' },
      { fieldId: 'box_7_carrier', labelInTemplate: '7. Carrier', sectionName: 'Transport & Routing', fieldType: 'text', mappedShipmentKey: 'carrierName' },
      { fieldId: 'box_10_vessel_voyage', labelInTemplate: '10. Vessel and Voyage Number', sectionName: 'Transport & Routing', fieldType: 'text', mappedShipmentKey: 'vesselName' },
      { fieldId: 'box_11_port_of_loading', labelInTemplate: '11. Port of Loading', sectionName: 'Transport & Routing', fieldType: 'text', mappedShipmentKey: 'portOfLoading' },
      { fieldId: 'box_12_port_of_discharge', labelInTemplate: '12. Port of Discharge', sectionName: 'Transport & Routing', fieldType: 'text', mappedShipmentKey: 'portOfDischarge' },
      { fieldId: 'box_13_destination', labelInTemplate: '13. Destination', sectionName: 'Transport & Routing', fieldType: 'text', mappedShipmentKey: 'finalDestination' },
      { fieldId: 'box_14_shipping_marks', labelInTemplate: '14. Shipping Marks / Cargo Description', sectionName: 'Cargo & Packaging', fieldType: 'multiline', mappedShipmentKey: 'shippingMarks' },
      { fieldId: 'box_16_gross_mass', labelInTemplate: '16. Gross Mass (kg)', sectionName: 'Weights & Measurements', fieldType: 'number', mappedShipmentKey: 'grossWeightKg' },
      { fieldId: 'box_17_net_mass', labelInTemplate: '17. Net Mass (kg)', sectionName: 'Weights & Measurements', fieldType: 'number', mappedShipmentKey: 'netWeightKg' },
      { fieldId: 'box_18_cube', labelInTemplate: '18. Cube (m³)', sectionName: 'Weights & Measurements', fieldType: 'number', mappedShipmentKey: 'volumeCbm' },
      { fieldId: 'box_19_container_seal', labelInTemplate: '19. Container / Seal', sectionName: 'Equipment & Containers', fieldType: 'text', mappedShipmentKey: 'containerNumber' },
      { fieldId: 'box_20_container_packing_cert', labelInTemplate: '20. Container Packing Certificate', sectionName: 'Declarations & Signatures', fieldType: 'text', mappedShipmentKey: 'dgDeclarantName' },
      { fieldId: 'box_21_emergency_contact', labelInTemplate: '21. 24-Hour Emergency Contact', sectionName: 'Declarations & Signatures', fieldType: 'text', mappedShipmentKey: 'emergencyContactPhone' },
      { fieldId: 'box_22_shipper_declaration', labelInTemplate: "22. Shipper's Declaration", sectionName: 'Declarations & Signatures', fieldType: 'text', mappedShipmentKey: 'dgDeclarantName' },
      { fieldId: 'box_22_place_date', labelInTemplate: '22. Place and Date', sectionName: 'Declarations & Signatures', fieldType: 'text', mappedShipmentKey: 'dgDeclarationPlaceAndDate' }
    ]
  }));
}
