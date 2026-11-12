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
 * Synthesizes pallet identifier ranges from pallet entries, grouped deterministically by sourceFile
 * (in order of appearance) and prefix pattern.
 * Within each per-file/prefix group, collapses the first and last pallet into "FIRST TO LAST"
 * (or single "FIRST" if count === 1).
 * E.g.
 * 4533..4546 in File 1 => "4533 TO 4546"
 * 4956..4963 in File 2 => "4956 TO 4963"
 * 4964 in File 3 => "4964"
 * TAL/1703/2026..TAL/1705/2026 in File 4 => "TAL/1703/2026 TO TAL/1705/2026"
 */
export function synthesizePalletRanges(pallets: ExtractedPallet[]): string[] {
  if (!pallets || pallets.length === 0) return [];

  // Group pallets by sourceFile while preserving file appearance order
  const fileGroups: Map<string, ExtractedPallet[]> = new Map();
  pallets.forEach((p, idx) => {
    const fileKey = p.sourceFile ? p.sourceFile.trim() : `file_group_${idx}`;
    if (!fileGroups.has(fileKey)) {
      fileGroups.set(fileKey, []);
    }
    fileGroups.get(fileKey)!.push(p);
  });

  const extractPrefixAndNum = (id: string): { prefix: string; num: number | null; suffix: string } => {
    const trimmed = (id || '').trim();
    // Match prefix, number, and optional suffix (e.g. TAL/1703/2026 or 4533)
    const slashMatch = trimmed.match(/^(.*?\/)?(\d+)(\/[^/]+)?$/);
    if (slashMatch) {
      return {
        prefix: slashMatch[1] || '',
        num: parseInt(slashMatch[2], 10),
        suffix: slashMatch[3] || ''
      };
    }
    const endMatch = trimmed.match(/^(.*?)(\d+)$/);
    if (endMatch) {
      return { prefix: endMatch[1], num: parseInt(endMatch[2], 10), suffix: '' };
    }
    return { prefix: trimmed, num: null, suffix: '' };
  };

  const allRanges: string[] = [];

  for (const group of fileGroups.values()) {
    const validPallets = group.filter(p => (p.palletNumber || '').trim() !== '');
    if (validPallets.length === 0) continue;

    // Subgroup within this file by prefix + suffix pattern
    const prefixBuckets: ExtractedPallet[][] = [];
    let currentBucket: ExtractedPallet[] = [validPallets[0]];
    const firstInfo = extractPrefixAndNum(validPallets[0].palletNumber);
    let currentKey = `${firstInfo.prefix}__${firstInfo.suffix}`;

    for (let i = 1; i < validPallets.length; i++) {
      const p = validPallets[i];
      const info = extractPrefixAndNum(p.palletNumber);
      const key = `${info.prefix}__${info.suffix}`;
      if (key === currentKey) {
        currentBucket.push(p);
      } else {
        prefixBuckets.push(currentBucket);
        currentBucket = [p];
        currentKey = key;
      }
    }
    if (currentBucket.length > 0) {
      prefixBuckets.push(currentBucket);
    }

    // For each bucket, collapse first to last
    for (const b of prefixBuckets) {
      const firstId = (b[0].palletNumber || '').trim();
      const lastId = (b[b.length - 1].palletNumber || '').trim();
      if (b.length === 1 || firstId === lastId) {
        allRanges.push(firstId);
      } else {
        allRanges.push(`${firstId} TO ${lastId}`);
      }
    }
  }

  return allRanges;
}

/**
 * Deterministically normalizes and enriches shipment state:
 * 1. OCR / typo sanitization across corporate names and declarant
 * 2. Boilerplate stripping from marks and description
 * 3. Regulatory IMDG UN enrichment (Proper Shipping Name, EMS, Segregation)
 * 4. Pallet range synthesis appended to shippingMarks
 * 5. Routing and declaration fallback cascades
 */
export function normalizeShipmentState(raw: ExtractedShipmentJSON): ExtractedShipmentJSON {
  const clean: ExtractedShipmentJSON = { ...raw };

  // 1. OCR / Header Typo & Whitespace Sanitization
  const sanitizeSuffix = (name: string): string => {
    if (!name) return '';
    return name
      .replace(/\bLIMITESD\b/gi, 'LIMITED')
      .replace(/\bPVTD\b/gi, 'PVT')
      .trim();
  };

  clean.shipperName = sanitizeSuffix(clean.shipperName);
  clean.consigneeName = sanitizeSuffix(clean.consigneeName);
  clean.notifyPartyName = sanitizeSuffix(clean.notifyPartyName);
  clean.dgDeclarantName = sanitizeSuffix(clean.dgDeclarantName);

  // Strip empty form boilerplate lines (e.g. "Brand :", "B/L NO :", "B/L Date :")
  const stripBoilerplate = (text: string): string => {
    if (!text) return '';
    return text
      .split('\n')
      .filter(line => !/^(brand|b\/l\s*no|b\/l\s*date|invoice\s*no|date)\s*:\s*$/i.test(line.trim()))
      .join('\n')
      .trim();
  };

  clean.shippingMarks = stripBoilerplate(clean.shippingMarks);
  clean.productDescription = stripBoilerplate(clean.productDescription);

  // 2. Standard IMDG Code UN-Number Regulatory Enrichment & Prefix Sanitization
  if (clean.unNumber && clean.unNumber.trim()) {
    // Strip redundant leading "UN" or "UN NO" prefix so raw code is clean
    clean.unNumber = clean.unNumber.replace(/^(?:UN\s*(?:NO\.?)?\s*[:.-]?\s*)+/i, '').trim();
    const unDigits = clean.unNumber.replace(/\D/g, '');
    if (unDigits.length === 4) {
      clean.unNumber = unDigits;
    }
    const imdgRef = IMDG_UN_LOOKUP[unDigits];

    if (imdgRef) {
      // If properShippingName is empty, or equals/contains the commercial productDescription,
      // override with official IMDG PSN and keep commercial description in productDescription
      const currentPsn = (clean.properShippingName || '').trim();
      const currentDesc = (clean.productDescription || '').trim();

      const isPsnCommercial =
        !currentPsn ||
        (currentDesc && currentPsn.toLowerCase().includes(currentDesc.toLowerCase())) ||
        (currentDesc && currentDesc.toLowerCase().includes(currentPsn.toLowerCase())) ||
        currentPsn.toLowerCase() !== imdgRef.properShippingName.toLowerCase();

      if (isPsnCommercial) {
        clean.properShippingName = imdgRef.properShippingName;
      }
      if (!clean.imoClass || clean.imoClass.trim() === '') {
        clean.imoClass = imdgRef.imoClass;
      }
      if (!clean.packingGroup || clean.packingGroup.trim() === '') {
        clean.packingGroup = imdgRef.packingGroup;
      }
      if (!clean.emsNumber || clean.emsNumber.trim() === '') {
        clean.emsNumber = imdgRef.emsNumber;
      }
      if (!clean.segregationGroup || clean.segregationGroup.trim() === '') {
        clean.segregationGroup = imdgRef.segregationGroup;
      }
      clean.isDangerousGoods = true;
    }
  }

  // 3. Guarantee shipment.pallets Hydration & Fallback Synthesis
  let primaryBrand = (clean.brandName || '').trim();
  if (!primaryBrand) {
    const marksAndDesc = `${clean.shippingMarks || ''}\n${clean.productDescription || ''}`;
    const brandMatch = marksAndDesc.match(/BRAND\s*[:.-]?\s*([A-Za-z0-9\s_-]+?)(?=\n|;|\/|\[|\(|$)/i);
    if (brandMatch && brandMatch[1].trim()) {
      primaryBrand = brandMatch[1].trim();
      clean.brandName = primaryBrand;
    }
  }

  if (!clean.pallets || clean.pallets.length === 0) {
    const marksAndDesc = `${clean.shippingMarks || ''}\n${clean.productDescription || ''}`;
    const synthesizedIds: string[] = [];

    // Parse pallet ranges in shippingMarks/productDescription: e.g. "5644 - 5655", "P-01 TO P-22", "PLT-1 - 12"
    const rangeMatch = marksAndDesc.match(/(?:PALLET(?:S|\s*NOS?\.?)?[:.\s]*)?([A-Z0-9_-]*\d+)\s*(?:-|TO|\.\.\.)\s*([A-Z0-9_-]*\d+)/i);
    if (rangeMatch) {
      const startStr = rangeMatch[1].trim();
      const endStr = rangeMatch[2].trim();
      const startDigitsMatch = startStr.match(/\d+$/);
      const endDigitsMatch = endStr.match(/\d+$/);

      if (startDigitsMatch && endDigitsMatch) {
        const prefix = startStr.slice(0, startDigitsMatch.index);
        const startNum = parseInt(startDigitsMatch[0], 10);
        const endNum = parseInt(endDigitsMatch[0], 10);
        const padLen = startDigitsMatch[0].length;

        if (endNum >= startNum && endNum - startNum + 1 <= 100) {
          for (let n = startNum; n <= endNum; n++) {
            synthesizedIds.push(`${prefix}${n.toString().padStart(padLen, '0')}`);
          }
        }
      }
    }

    // Fallback if no valid range parsed: check totalPallets or outerPackagingCount
    const countFallback = clean.totalPallets || clean.outerPackagingCount || 0;
    if (synthesizedIds.length === 0 && countFallback > 0 && countFallback <= 100) {
      for (let i = 1; i <= countFallback; i++) {
        synthesizedIds.push(`PLT-${i.toString().padStart(2, '0')}`);
      }
    }

    if (synthesizedIds.length > 0) {
      const palletCount = synthesizedIds.length;
      const totalBoxes = clean.totalBoxes || clean.totalPackages || clean.innerPackageCount || 0;
      const totalGross = clean.grossWeightKg || 0;
      const totalNet = clean.netWeightKg || 0;
      const baseBoxes = palletCount > 0 ? Math.floor(totalBoxes / palletCount) : 0;
      const remainderBoxes = palletCount > 0 ? totalBoxes % palletCount : 0;
      const baseGross = palletCount > 0 ? Number((totalGross / palletCount).toFixed(2)) : 0;
      const baseNet = palletCount > 0 ? Number((totalNet / palletCount).toFixed(2)) : 0;

      const model = clean.productDescription ? clean.productDescription.split('\n')[0].slice(0, 30).trim() : (clean.brandName || '');

      clean.pallets = synthesizedIds.map((pId, idx) => ({
        palletNumber: pId,
        modelCode: model,
        brand: primaryBrand || undefined,
        invoiceNumber: (clean.invoiceNumbers && clean.invoiceNumbers.length === 1) ? clean.invoiceNumbers[0] : undefined,
        boxCount: baseBoxes + (idx < remainderBoxes ? 1 : 0),
        grossWeightKg: baseGross,
        netWeightKg: baseNet,
        sourceFile: 'Synthesized from Shipment Manifest'
      }));

      if (!clean.totalPallets || clean.totalPallets === 0) {
        clean.totalPallets = palletCount;
      }
      if (!clean.outerPackagingCount || clean.outerPackagingCount === 0) {
        clean.outerPackagingCount = palletCount;
      }
    }
  }

  // Row-level fallback hydration for brand and source invoice on all pallets
  if (clean.pallets && clean.pallets.length > 0) {
    clean.pallets = clean.pallets.map((p) => {
      let pBrand = (p.brand || '').trim();
      if (!pBrand && primaryBrand) {
        pBrand = primaryBrand;
      }

      let pInv = (p.invoiceNumber || '').trim();
      if (!pInv) {
        if (clean.invoiceNumbers && clean.invoiceNumbers.length === 1) {
          pInv = clean.invoiceNumbers[0];
        } else if (clean.invoiceNumbers && clean.invoiceNumbers.length > 1 && p.sourceFile) {
          const matchingInv = clean.invoiceNumbers.find(inv =>
            p.sourceFile.toLowerCase().includes(inv.toLowerCase())
          );
          if (matchingInv) {
            pInv = matchingInv;
          }
        }
      }

      return {
        ...p,
        brand: pBrand || undefined,
        invoiceNumber: pInv || undefined
      };
    });
  }

  // 4. Deterministic Pallet Range Synthesis into shippingMarks
  if (clean.pallets && clean.pallets.length > 0) {
    const synthesizedRanges = synthesizePalletRanges(clean.pallets);
    if (synthesizedRanges.length > 0) {
      // Strip any existing PALLET NOS line before appending synthesized range to prevent duplicates
      const currentMarks = (clean.shippingMarks || '')
        .replace(/(?:\r?\n)?PALLET\s*NOS?:\s*[^\r\n]*/gi, '')
        .trim();
      const palletBlock = `PALLET NOS: ${synthesizedRanges.join(', ')}`;
      clean.shippingMarks = currentMarks ? `${currentMarks}\n${palletBlock}` : palletBlock;
    }
  }

  // 5. Smart Equipment Constraint Auto-Selection (Container Type & Tare Weight)
  const currentPalletCount = (clean.pallets && clean.pallets.length) || clean.totalPallets || 0;
  const currentGrossWt = clean.grossWeightKg || 0;
  if (!clean.containerType || clean.containerType === '20GP') {
    if (currentPalletCount > 22 || currentGrossWt > 25000) {
      clean.containerType = '40GP';
      if (!clean.tareWeightKg || clean.tareWeightKg === 0 || clean.tareWeightKg === 2150) {
        clean.tareWeightKg = 3750;
      }
    } else {
      clean.containerType = '20GP';
      if (!clean.tareWeightKg || clean.tareWeightKg === 0) {
        clean.tareWeightKg = 2150;
      }
    }
  }

  // 4. Routing, declarant, and declaration date fallbacks
  if (!clean.placeOfReceipt || clean.placeOfReceipt.trim() === '') {
    clean.placeOfReceipt = clean.portOfLoading || '';
  }
  if (!clean.placeOfDelivery || clean.placeOfDelivery.trim() === '') {
    clean.placeOfDelivery = clean.finalDestination || clean.portOfDischarge || '';
  }
  if (!clean.dgDeclarantName || clean.dgDeclarantName.trim() === '') {
    clean.dgDeclarantName = clean.shipperName || '';
  }
  if (!clean.dgDeclarationPlaceAndDate || clean.dgDeclarationPlaceAndDate.trim() === '') {
    const loc = clean.portOfLoading || clean.placeOfReceipt || '';
    const dateStr = clean.invoiceDates?.[clean.invoiceDates.length - 1] || clean.invoiceDates?.[0] || '';
    if (loc && dateStr) {
      clean.dgDeclarationPlaceAndDate = `${loc} / ${dateStr}`;
    } else if (loc || dateStr) {
      clean.dgDeclarationPlaceAndDate = loc || dateStr;
    }
  }

  return clean;
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
    let marksText = (shipment.shippingMarks || '')
      .replace(/(?:\r?\n)?PALLET\s*NOS?:\s*[^\r\n]*/gi, '')
      .trim();
    if (shipment.pallets && shipment.pallets.length > 0) {
      const palletRanges = synthesizePalletRanges(shipment.pallets);
      const palletStr = palletRanges.join(', ');
      if (palletStr) {
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
 * Builds the official 1-page IMO Box 14 DG Cargo Description block.
 * Vertical line-by-line standard: PSN, Technical Name, Class, UN No, Pkg Group, EMS, Marine Pollutant,
 * Segregation Group, UN Packing Code, No & Kind of Packaging, Flash Point, Marks & Pallet Nos, Emergency Contact.
 */
export function buildImoBox14CargoBlock(shipment: ExtractedShipmentJSON): string {
  const lines: string[] = [];
  const unDigits = (shipment.unNumber || '').replace(/\D/g, '');
  const imdgRef = IMDG_UN_LOOKUP[unDigits];

  // 1. PROPER SHIPPING NAME
  const psn = (shipment.properShippingName || imdgRef?.properShippingName || '').trim();
  if (psn) {
    lines.push(`PROPER SHIPPING NAME (PSN): ${psn}`);
  }

  // 2. TECHNICAL NAME / COMMERCIAL DESCRIPTION
  const techDesc = (shipment.productDescription || '').trim();
  if (techDesc && techDesc.toLowerCase() !== psn.toLowerCase()) {
    lines.push(`TECHNICAL NAME: ${techDesc}`);
  }

  // 3. CLASS & SUB CLASS
  const imoClass = (shipment.imoClass || imdgRef?.imoClass || '').trim();
  if (imoClass) {
    lines.push(`CLASS: ${imoClass}`);
  }

  // 4. UN NO
  if (shipment.unNumber && shipment.unNumber.trim()) {
    lines.push(`UN NO: ${shipment.unNumber.trim()}`);
  }

  // 5. PKG GROUP
  const pg = (shipment.packingGroup || imdgRef?.packingGroup || '').trim();
  if (pg) {
    lines.push(`PKG GROUP: ${pg}`);
  }

  // 6. EMS
  const ems = (shipment.emsNumber || imdgRef?.emsNumber || '').trim();
  if (ems) {
    lines.push(`EMS: ${ems}`);
  }

  // 7. MARINE POLLUTANT
  if (shipment.isDangerousGoods || shipment.unNumber) {
    lines.push(`MARINE POLLUTANT: ${shipment.marinePollutant ? 'YES' : 'NO'}`);
  }

  // 8. SEGREGATION GROUP
  const sgg = (shipment.segregationGroup || imdgRef?.segregationGroup || '').trim();
  if (sgg) {
    lines.push(`SEGREGATION GROUP: ${sgg}`);
  }

  // 9. UN PACKING CODE
  if (shipment.unPackingCode && shipment.unPackingCode.trim()) {
    lines.push(`UN PACKING CODE: ${shipment.unPackingCode.trim()}`);
  }

  // 10. NO & KIND OF PACKAGING (Outer & Inner)
  const outerCount = shipment.outerPackagingCount || shipment.totalPallets || (shipment.pallets && shipment.pallets.length) || 0;
  const outerType = shipment.outerPackagingType || 'PALLETS';
  const innerCount = shipment.innerPackageCount || shipment.totalBoxes || shipment.totalPackages || 0;
  const innerType = shipment.innerPackageType || 'BOXES';

  if (outerCount > 0 || innerCount > 0) {
    const pkgParts: string[] = [];
    if (outerCount > 0) pkgParts.push(`${outerCount} ${outerType}`);
    if (innerCount > 0) pkgParts.push(`${innerCount} ${innerType}`);
    lines.push(`NO & KIND OF PACKAGING: ${pkgParts.join(' / ')}`);
  }

  // 11. FLASH POINT
  if (shipment.flashPoint && shipment.flashPoint.trim()) {
    lines.push(`FLASH POINT: ${shipment.flashPoint.trim()}`);
  }

  // 12. MARKS & PALLET NOS
  const marks = (shipment.shippingMarks || '')
    .replace(/(?:\r?\n)?PALLET\s*NOS?:\s*[^\r\n]*/gi, '')
    .trim();
  let palletStr = '';
  if (shipment.pallets && shipment.pallets.length > 0) {
    const ranges = synthesizePalletRanges(shipment.pallets);
    if (ranges.length > 0) {
      palletStr = ranges.join(', ');
    }
  }
  if (marks || palletStr) {
    const markParts: string[] = [];
    if (marks) markParts.push(marks);
    if (palletStr) markParts.push(`PALLET NOS: ${palletStr}`);
    lines.push(`MARKS & PALLET NOS:\n${markParts.join('\n')}`);
  }

  // 13. EMERGENCY CONTACT
  if (shipment.emergencyContactPhone || shipment.emergencyContactName) {
    const contactParts = [shipment.emergencyContactPhone, shipment.emergencyContactName].filter(Boolean).join(' - ');
    lines.push(`EMERGENCY CONTACT NO. & NAME: ${contactParts}`);
  }

  return lines.join('\n');
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
