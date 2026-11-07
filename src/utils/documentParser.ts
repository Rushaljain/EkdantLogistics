// Ekdant Logistics - Universal Hybrid Document Ingestion & Parsing Engine
// Combines Client-Side Pre-Filtering + Gemini Multimodal Structured JSON + Deterministic Consolidation

import type { ExtractedPallet, ExtractedShipmentJSON, UploadMode } from '../types';
import { createEmptyShipmentJSON } from '../types';
import { preFilterWorkbook, type PreFilterResult } from './spreadsheetPreFilter';

export interface ParseSessionProgress {
  stage: 'reading' | 'prefiltering' | 'ai_extracting' | 'consolidating' | 'done' | 'error';
  message: string;
  processedFiles: number;
  totalFiles: number;
  filterLogs: string[];
}

export interface ParseResult {
  shipmentJson: ExtractedShipmentJSON;
  filterResults: PreFilterResult[];
  logs: string[];
  usedAi: boolean;
  warnings: string[];
}

const SYSTEM_PROMPT = `
You are the Ekdant Logistics Universal Extraction Engine.
Extract shipping, commercial, dangerous goods, and packaging data from the provided document(s) into strict, verified JSON.

CRITICAL EXTRACTION RULES:
1. UNIVERSAL TRUTH & ZERO INVENTIONS:
   - Extract ONLY what is explicitly stated in the document(s).
   - If a field is missing, not mentioned, blank, "0", or "---", return "" (empty string) for strings or 0 for numbers.
   - NEVER invent container numbers (e.g. never generate TEMU...), seal numbers (never EMC...), booking numbers, vessel names, tare weights, haulier names, or dates.
2. VERBATIM PRESERVATION:
   - Preserve exact strings. Do NOT change "NIL" to "NA" or "NO" to "NA".
   - Do NOT alter cargo descriptions (e.g. do not change "LEAD ACID BATTERIES" to "LEAD ACID STORAGE BATTERIES" unless the text actually says it).
   - Capture complete addresses including postal / PIN / ZIP codes (e.g. 700 020).
   - Keep "On Behalf Of" entities in the "onBehalfOf" field; never merge them into "shipperName" or "shipperAddress".
3. PACKAGING HIERARCHY SEPARATION:
   - "outerPackagingCount": Number of outer units (e.g. 12 or 22).
   - "outerPackagingType": Outer package type (e.g. "PALLETS").
   - "innerPackageCount": Total inner boxes (e.g. 1200 or 676).
   - "innerPackageType": Inner package type (e.g. "CORRUGATED BOXES" or "FIBREBOARD BOXES").
   - "innerPackingDescription": Detailed description (e.g. "EACH BOX HAS 1 BATTERY").
   - Extract EVERY physical pallet row into "pallets": array of objects with "palletNumber" (verbatim e.g. "4956", "5644", "TAL/1703/2026", never rename to PLT-1), "modelCode", "boxCount", "netWeightKg", "grossWeightKg".
4. REFERENCE VS. CARRIER BOOKING SEPARATION:
   - Put commercial invoice numbers in "invoiceNumbers" (e.g. ["CHW000263"]).
   - ONLY put an explicit Carrier Booking Number or DG Reference Number (e.g. "AMC2652493" or "MUMGA3747500") in "bookingNumber". Never copy the invoice number into bookingNumber.
`;

/**
 * Encodes an ArrayBuffer or File into a base64 string for multimodal payload
 */
export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Universal Parser entry point:
 * Ingests files (PDF, XLSX, XLS, CSV), applies spreadsheet pre-filtering,
 * executes Gemini Multimodal structured extraction, and deterministically consolidates totals.
 */
export async function parseDocumentsToJSON(
  files: File[],
  mode: UploadMode,
  apiKeyOverride?: string,
  onProgress?: (progress: ParseSessionProgress) => void
): Promise<ParseResult> {
  const logs: string[] = [];
  const filterResults: PreFilterResult[] = [];
  const warnings: string[] = [];

  const apiKey = (apiKeyOverride || import.meta.env.VITE_GEMINI_API_KEY || '').trim();

  onProgress?.({
    stage: 'reading',
    message: `Reading ${files.length} uploaded files...`,
    processedFiles: 0,
    totalFiles: files.length,
    filterLogs: []
  });

  // Step 1: Pre-process each file
  const multimodalParts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];
  const deterministicFallbackShipments: ExtractedShipmentJSON[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
      onProgress?.({
        stage: 'prefiltering',
        message: `Filtering tabs in spreadsheet: ${file.name}`,
        processedFiles: i + 1,
        totalFiles: files.length,
        filterLogs: logs
      });

      const buffer = await file.arrayBuffer();
      const filterRes = preFilterWorkbook(buffer, file.name);
      filterResults.push(filterRes);
      logs.push(...filterRes.filterLog.map(l => `[${file.name}] ${l}`));

      // Add pre-filtered structured grid text as Gemini prompt part
      if (filterRes.combinedText) {
        multimodalParts.push({ text: filterRes.combinedText });
      }

      // Prepare deterministic fallback record from preFilter
      const det = filterRes.deterministicData;
      const fallback = createEmptyShipmentJSON(mode);
      fallback.shipperName = det.shipperName || '';
      fallback.shipperAddress = det.shipperAddress || '';
      fallback.onBehalfOf = det.onBehalfOf || '';
      fallback.shipperGstin = det.shipperGstin || '';
      fallback.consigneeName = det.consigneeName || '';
      fallback.consigneeAddress = det.consigneeAddress || '';
      fallback.notifyPartyName = det.notifyPartyName || '';
      fallback.notifyPartyAddress = det.notifyPartyAddress || '';
      fallback.invoiceNumbers = det.invoiceNumbers;
      fallback.invoiceDates = det.invoiceDates;
      fallback.bookingNumber = det.bookingNumber || '';
      fallback.containerNumber = det.containerNumber || '';
      fallback.sealNumber = det.sealNumber || '';
      fallback.portOfLoading = det.portOfLoading || '';
      fallback.portOfDischarge = det.portOfDischarge || '';
      fallback.finalDestination = det.finalDestination || '';
      fallback.productDescription = det.productDescription || '';
      fallback.brandName = det.brandName || '';
      fallback.hsnCode = det.hsnCode || '';
      fallback.totalPallets = det.totalPallets || 0;
      fallback.totalBoxes = det.totalBoxes || 0;
      fallback.totalPackages = det.totalBoxes || 0;
      fallback.grossWeightKg = det.grossWeightKg || 0;
      fallback.netWeightKg = det.netWeightKg || 0;
      fallback.isDangerousGoods = Boolean(det.isDangerousGoods);
      fallback.unNumber = det.unNumber || '';
      fallback.imoClass = det.imoClass || '';
      fallback.packingGroup = det.packingGroup || '';
      fallback.emergencyContactName = det.emergencyContactName || '';
      fallback.emergencyContactPhone = det.emergencyContactPhone || '';
      fallback.pallets = det.pallets;
      fallback.sourceFiles = [file.name];
      deterministicFallbackShipments.push(fallback);
    } else if (ext === 'pdf') {
      onProgress?.({
        stage: 'reading',
        message: `Encoding PDF for visual layout extraction: ${file.name}`,
        processedFiles: i + 1,
        totalFiles: files.length,
        filterLogs: logs
      });

      const base64Data = await fileToBase64(file);
      multimodalParts.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: base64Data
        }
      });
      logs.push(`[${file.name}] Attached PDF layout directly to multimodal parser`);
    } else {
      // Text or unknown files
      const text = await file.text();
      multimodalParts.push({ text: `=== FILE: ${file.name} ===\n${text}` });
      logs.push(`[${file.name}] Attached raw text document`);
    }
  }

  // Step 2: Gemini AI Multimodal Ingestion (if API key available)
  let extractedJson: ExtractedShipmentJSON | null = null;
  let usedAi = false;

  if (apiKey && multimodalParts.length > 0) {
    onProgress?.({
      stage: 'ai_extracting',
      message: `Running Gemini Multimodal structured extraction (${mode})...`,
      processedFiles: files.length,
      totalFiles: files.length,
      filterLogs: logs
    });

    try {
      const modeInstruction = mode === 'SINGLE_INVOICE'
        ? 'Upload Mode is SINGLE_INVOICE. All provided files belong to 1 single shipment. Merge commercial invoice, packing list, and carrier DG sheets into one combined shipment JSON.'
        : 'Upload Mode is MULTI_INVOICE. Documents contain multiple commercial invoices. Extract all invoice numbers, all pallets in physical order, and carrier/vessel details.';

      const userPrompt = `${modeInstruction}\n\nReturn JSON adhering to the ExtractedShipmentJSON schema with all fields populated strictly as stated. If a field is not found in the documents, return "" or 0.`;

      const contents = [
        {
          role: 'user',
          parts: [
            { text: SYSTEM_PROMPT },
            ...multimodalParts,
            { text: userPrompt }
          ]
        }
      ];

      // Try primary model gemini-2.5-flash with fallback to gemini-1.5-flash / gemini-flash-latest
      const modelsToTry = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'];
      let responseJson: any = null;

      for (const model of modelsToTry) {
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents,
              generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0
              }
            })
          });

          if (res.ok) {
            const data = await res.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawText) {
              responseJson = JSON.parse(rawText);
              usedAi = true;
              logs.push(`Successfully extracted structured JSON via Gemini (${model})`);
              break;
            }
          }
        } catch (mErr) {
          console.warn(`Model ${model} attempt failed:`, mErr);
        }
      }

      if (responseJson) {
        extractedJson = normalizeExtractedJSON(responseJson, mode, files.map(f => f.name));
      }
    } catch (aiErr: any) {
      warnings.push(`AI Multimodal call encountered an error: ${aiErr?.message || String(aiErr)}`);
      logs.push(`Falling back to deterministic client-side extraction`);
    }
  } else if (!apiKey) {
    warnings.push('No Gemini API Key provided. Client-side deterministic extraction used.');
    logs.push('Operating in offline / client-side deterministic extraction mode');
  }

  // Step 3: If AI was not used or failed, deterministically consolidate preFilter data
  if (!extractedJson) {
    extractedJson = consolidateDeterministicShipments(deterministicFallbackShipments, mode, files.map(f => f.name));
  }

  // Step 4: Deterministic Post-Parse Consolidation & Math Verification
  onProgress?.({
    stage: 'consolidating',
    message: 'Running deterministic math and cross-document verification...',
    processedFiles: files.length,
    totalFiles: files.length,
    filterLogs: logs
  });

  consolidateAndVerifyMath(extractedJson, warnings);

  onProgress?.({
    stage: 'done',
    message: 'Parsing complete. ExtractedShipmentJSON ready for inspection.',
    processedFiles: files.length,
    totalFiles: files.length,
    filterLogs: logs
  });

  return {
    shipmentJson: extractedJson,
    filterResults,
    logs,
    usedAi,
    warnings
  };
}

/**
 * Normalizes raw Gemini output into a clean, zero-fallback ExtractedShipmentJSON
 */
function normalizeExtractedJSON(
  raw: any,
  mode: UploadMode,
  sourceFiles: string[]
): ExtractedShipmentJSON {
  const clean = createEmptyShipmentJSON(mode);

  // Strings: strictly empty string if missing or undefined
  const str = (v: any): string => (v !== undefined && v !== null ? String(v).trim() : '');
  const num = (v: any): number => {
    const parsed = typeof v === 'number' ? v : parseFloat(String(v || '0').replace(/,/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  };

  clean.uploadMode = mode;
  clean.shipperName = str(raw.shipperName);
  clean.shipperAddress = str(raw.shipperAddress);
  clean.shipperIec = str(raw.shipperIec);
  clean.shipperGstin = str(raw.shipperGstin);
  clean.shipperPan = str(raw.shipperPan);
  clean.onBehalfOf = str(raw.onBehalfOf);

  clean.consigneeName = str(raw.consigneeName);
  clean.consigneeAddress = str(raw.consigneeAddress);
  clean.notifyPartyName = str(raw.notifyPartyName);
  clean.notifyPartyAddress = str(raw.notifyPartyAddress);

  clean.invoiceNumbers = Array.isArray(raw.invoiceNumbers)
    ? raw.invoiceNumbers.map(str).filter(Boolean)
    : (raw.invoiceNumber ? [str(raw.invoiceNumber)] : []);
  clean.invoiceDates = Array.isArray(raw.invoiceDates)
    ? raw.invoiceDates.map(str).filter(Boolean)
    : (raw.invoiceDate ? [str(raw.invoiceDate)] : []);

  clean.bookingNumber = str(raw.bookingNumber);
  clean.shippingBillNumbers = str(raw.shippingBillNumbers);
  clean.shipperReference = str(raw.shipperReference);
  clean.forwarderReference = str(raw.forwarderReference);

  clean.carrierName = str(raw.carrierName);
  clean.preCarriageBy = str(raw.preCarriageBy);
  clean.placeOfReceipt = str(raw.placeOfReceipt);
  clean.vesselName = str(raw.vesselName);
  clean.voyageNumber = str(raw.voyageNumber);
  clean.portOfLoading = str(raw.portOfLoading);
  clean.portOfDischarge = str(raw.portOfDischarge);
  clean.portOfDischargeDg = str(raw.portOfDischargeDg);
  clean.placeOfDelivery = str(raw.placeOfDelivery);
  clean.finalDestination = str(raw.finalDestination);

  clean.containerNumber = str(raw.containerNumber);
  clean.sealNumber = str(raw.sealNumber);
  clean.containerType = (raw.containerType && ['20GP', '40GP', '40HC', '45HC'].includes(raw.containerType))
    ? raw.containerType
    : '20GP';
  clean.tareWeightKg = num(raw.tareWeightKg);

  clean.shippingMarks = str(raw.shippingMarks);
  clean.productDescription = str(raw.productDescription);
  clean.brandName = str(raw.brandName);
  clean.hsnCode = str(raw.hsnCode);

  clean.outerPackagingCount = num(raw.outerPackagingCount || raw.totalPallets);
  clean.outerPackagingType = str(raw.outerPackagingType || 'PALLETS');
  clean.innerPackageCount = num(raw.innerPackageCount || raw.totalBoxes || raw.totalPackages);
  clean.innerPackageType = str(raw.innerPackageType || 'CORRUGATED BOXES');
  clean.innerPackingDescription = str(raw.innerPackingDescription);

  clean.totalPallets = clean.outerPackagingCount;
  clean.totalBoxes = clean.innerPackageCount;
  clean.totalPackages = clean.innerPackageCount;

  clean.grossWeightKg = num(raw.grossWeightKg);
  clean.netWeightKg = num(raw.netWeightKg);
  clean.volumeCbm = num(raw.volumeCbm);

  clean.currency = str(raw.currency);
  clean.totalInvoiceValue = num(raw.totalInvoiceValue);
  clean.incoterm = str(raw.incoterm);
  clean.freightTerms = str(raw.freightTerms);
  clean.movementType = str(raw.movementType);
  clean.freeTimeClause = str(raw.freeTimeClause);

  clean.isDangerousGoods = Boolean(raw.isDangerousGoods);
  clean.unNumber = str(raw.unNumber);
  clean.imoClass = str(raw.imoClass);
  clean.properShippingName = str(raw.properShippingName);
  clean.packingGroup = str(raw.packingGroup);
  clean.marinePollutant = Boolean(raw.marinePollutant);
  clean.flashPoint = str(raw.flashPoint);
  clean.emsNumber = str(raw.emsNumber);
  clean.segregationGroup = str(raw.segregationGroup);
  clean.unPackingCode = str(raw.unPackingCode);
  clean.emergencyContactName = str(raw.emergencyContactName);
  clean.emergencyContactPhone = str(raw.emergencyContactPhone);
  clean.dgDeclarantName = str(raw.dgDeclarantName);
  clean.dgDeclarantStatus = str(raw.dgDeclarantStatus);
  clean.dgDeclarationPlaceAndDate = str(raw.dgDeclarationPlaceAndDate);

  // Pallet lines
  if (Array.isArray(raw.pallets)) {
    clean.pallets = raw.pallets.map((p: any, idx: number): ExtractedPallet => ({
      palletNumber: str(p.palletNumber) || String(idx + 1),
      modelCode: str(p.modelCode),
      boxCount: num(p.boxCount),
      netWeightKg: num(p.netWeightKg),
      grossWeightKg: num(p.grossWeightKg),
      sourceFile: str(p.sourceFile) || sourceFiles[0] || ''
    }));
  }

  clean.sourceFiles = sourceFiles;
  clean.extractedAt = new Date().toISOString();
  return clean;
}

/**
 * Deterministically combines fallback extractions from spreadsheetPreFilter
 */
function consolidateDeterministicShipments(
  shipments: ExtractedShipmentJSON[],
  mode: UploadMode,
  sourceFiles: string[]
): ExtractedShipmentJSON {
  const result = createEmptyShipmentJSON(mode);
  result.sourceFiles = sourceFiles;
  result.extractedAt = new Date().toISOString();

  if (shipments.length === 0) {
    return result;
  }

  // Pick first non-empty primary fields
  for (const s of shipments) {
    if (!result.shipperName && s.shipperName) result.shipperName = s.shipperName;
    if (!result.shipperAddress && s.shipperAddress) result.shipperAddress = s.shipperAddress;
    if (!result.onBehalfOf && s.onBehalfOf) result.onBehalfOf = s.onBehalfOf;
    if (!result.shipperGstin && s.shipperGstin) result.shipperGstin = s.shipperGstin;
    if (!result.consigneeName && s.consigneeName) result.consigneeName = s.consigneeName;
    if (!result.consigneeAddress && s.consigneeAddress) result.consigneeAddress = s.consigneeAddress;
    if (!result.notifyPartyName && s.notifyPartyName) result.notifyPartyName = s.notifyPartyName;
    if (!result.notifyPartyAddress && s.notifyPartyAddress) result.notifyPartyAddress = s.notifyPartyAddress;
    if (!result.bookingNumber && s.bookingNumber) result.bookingNumber = s.bookingNumber;
    if (!result.containerNumber && s.containerNumber) result.containerNumber = s.containerNumber;
    if (!result.sealNumber && s.sealNumber) result.sealNumber = s.sealNumber;
    if (!result.portOfLoading && s.portOfLoading) result.portOfLoading = s.portOfLoading;
    if (!result.portOfDischarge && s.portOfDischarge) result.portOfDischarge = s.portOfDischarge;
    if (!result.finalDestination && s.finalDestination) result.finalDestination = s.finalDestination;
    if (!result.productDescription && s.productDescription) result.productDescription = s.productDescription;
    if (!result.brandName && s.brandName) result.brandName = s.brandName;
    if (!result.hsnCode && s.hsnCode) result.hsnCode = s.hsnCode;
    if (!result.emergencyContactName && s.emergencyContactName) result.emergencyContactName = s.emergencyContactName;
    if (!result.emergencyContactPhone && s.emergencyContactPhone) result.emergencyContactPhone = s.emergencyContactPhone;

    if (s.isDangerousGoods) {
      result.isDangerousGoods = true;
      if (!result.unNumber && s.unNumber) result.unNumber = s.unNumber;
      if (!result.imoClass && s.imoClass) result.imoClass = s.imoClass;
      if (!result.packingGroup && s.packingGroup) result.packingGroup = s.packingGroup;
    }

    // Accumulate invoices
    for (const inv of s.invoiceNumbers) {
      if (!result.invoiceNumbers.includes(inv)) result.invoiceNumbers.push(inv);
    }
    for (const dt of s.invoiceDates) {
      if (!result.invoiceDates.includes(dt)) result.invoiceDates.push(dt);
    }

    // Accumulate pallets
    result.pallets.push(...s.pallets);
  }

  return result;
}

/**
 * Deterministically recalculates and balances packaging totals and weights.
 * Validates header totals against sum of pallet rows and populates discrepancy warnings.
 */
function consolidateAndVerifyMath(
  shipment: ExtractedShipmentJSON,
  warnings: string[]
): void {
  // If we have pallet breakdown, calculate exact sums
  if (shipment.pallets.length > 0) {
    const calcPallets = shipment.pallets.length;
    const calcBoxes = shipment.pallets.reduce((s, p) => s + (p.boxCount || 0), 0);
    const calcNetKg = Number(shipment.pallets.reduce((s, p) => s + (p.netWeightKg || 0), 0).toFixed(2));
    const calcGrossKg = Number(shipment.pallets.reduce((s, p) => s + (p.grossWeightKg || 0), 0).toFixed(2));

    // Check discrepancy with header declared net weight
    if (shipment.netWeightKg > 0 && Math.abs(shipment.netWeightKg - calcNetKg) > 1.0) {
      warnings.push(
        `Header Net Weight (${shipment.netWeightKg} kg) differs from sum of pallet rows (${calcNetKg} kg). Difference: ${(shipment.netWeightKg - calcNetKg).toFixed(2)} kg`
      );
    }

    // Check discrepancy with header declared gross weight
    if (shipment.grossWeightKg > 0 && Math.abs(shipment.grossWeightKg - calcGrossKg) > 1.0) {
      warnings.push(
        `Header Gross Weight (${shipment.grossWeightKg} kg) differs from sum of pallet rows (${calcGrossKg} kg). Difference: ${(shipment.grossWeightKg - calcGrossKg).toFixed(2)} kg`
      );
    }

    // Deterministically enforce calculated totals
    shipment.totalPallets = calcPallets;
    shipment.outerPackagingCount = calcPallets;
    shipment.totalBoxes = calcBoxes;
    shipment.innerPackageCount = calcBoxes;
    shipment.totalPackages = calcBoxes;

    // Default weights to sum of pallets if header was blank
    if (shipment.netWeightKg === 0) shipment.netWeightKg = calcNetKg;
    if (shipment.grossWeightKg === 0) shipment.grossWeightKg = calcGrossKg;
  }

  // Check for missing critical references
  if (shipment.invoiceNumbers.length === 0) {
    warnings.push('No commercial invoice numbers found in uploaded documents.');
  }
  if (!shipment.shipperName) {
    warnings.push('Shipper / Exporter name is not confirmed in source documents.');
  }
  if (!shipment.consigneeName) {
    warnings.push('Consignee name is not confirmed in source documents.');
  }
  if (shipment.isDangerousGoods && !shipment.unNumber) {
    warnings.push('Dangerous goods flagged, but UN Number is missing.');
  }

  shipment.discrepancyWarnings = warnings;
}
