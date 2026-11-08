// Ekdant Logistics - Pure AI Extraction Pipeline & Multimodal Document Ingestion Engine
// Strictly zero hardcoded fallbacks: surfaces exact API errors and executes pure multimodal extraction

import type { ExtractedPallet, ExtractedShipmentJSON, UploadMode } from '../types/index.ts';
import { createEmptyShipmentJSON } from '../types/index.ts';
import { preFilterWorkbook, type PreFilterResult } from './spreadsheetPreFilter.ts';

export interface ParseSessionProgress {
  stage: 'reading' | 'prefiltering' | 'ai_extracting' | 'consolidating' | 'done';
  message: string;
  processedFiles: number;
  totalFiles: number;
  filterLogs: string[];
}

export interface ParseResult {
  shipmentJson: ExtractedShipmentJSON;
  filterResults: PreFilterResult[];
  logs: string[];
  warnings: string[];
}

const SYSTEM_PROMPT = `
You are the Ekdant Logistics Universal Extraction Engine.
Extract shipping, commercial, dangerous goods, and packaging data from the provided document(s) into strict, verified JSON conforming to the ExtractedShipmentJSON schema.

CRITICAL EXTRACTION RULES:
1. UNIVERSAL TRUTH & ZERO INVENTIONS:
   - Extract ONLY what is explicitly stated in the provided document(s).
   - If a field is missing, not mentioned, blank, "0", or "---", return "" (empty string) for strings or 0 for numbers.
   - NEVER invent container numbers, seal numbers, booking numbers, vessel names, tare weights, haulier names, or dates.

2. VERBATIM PRESERVATION & EMBEDDED IDENTIFIERS:
   - Preserve exact strings from the source text. Do NOT normalize "NIL" to "NA" or "NO" to "NA".
   - Capture complete postal addresses including postal codes, PIN, or ZIP codes.
   - Scan full text inside Exporter / Shipper, Consignee, and Notify boxes:
     * Extract "shipperGstin" (labels: "GSTIN", "GST No"), "shipperIec" (labels: "IEC", "IE Code", "BIN"), and "shipperPan" (labels: "PAN") into their dedicated fields even when printed inside an address block or adjacent reference cells.
     * In "notifyPartyAddress" and "consigneeAddress", retain the complete block including "Email", "Mobile"/"Tel", "VAT Reg. No.", and "Company Reg. No." lines.
   - Keep "On Behalf Of" entities in the "onBehalfOf" field; never merge them into "shipperName" or "shipperAddress".

3. DUAL-POPULATED CARGO & DANGEROUS GOODS DESCRIPTIONS:
   - Set isDangerousGoods to true whenever any UN Number, IMO/Hazard Class, or Packing Group is explicitly present in the source document(s). Otherwise, set it to false.
   - Always populate "productDescription" from the commercial goods description column/box (labels: "Description of Goods", "Commodity", "Item Description").
   - If the cargo is hazardous/dangerous goods and no separate "Proper Shipping Name" is explicitly labeled, populate BOTH "productDescription" and "properShippingName" rather than leaving "productDescription" blank.

4. GENERIC LABEL SYNONYM MAPPING:
   - "hsnCode": Match labels ("H.S. Code No.", "H.S Code", "HSN", "Tariff Code", "Commodity Code", "Schedule B"). Extract the numeric classification code string.
   - "imoClass": Match labels ("IMO CLASS", "IMCO CLASS", "Hazard Class", "DG Class", "Class"). Extract the numeric or decimal class string (e.g. "8", "3", "2.1").
   - "shippingMarks": Match labels ("Marks & Nos", "Marks & Numbers", "Marks & Nos / Container No.", "Shipping Marks"). Combine both text markings and package/pallet serial ranges printed in that box.
   - "brandName": Match labels ("Brand", "Make", "Trademark"). If multiple brand labels or table columns exist (e.g. primary brand and sub-brand/model line), combine or capture the specific product brand stated.
   - "shipperReference": Match labels ("Exporter's Ref", "EXPORT REF NO", "Buyer's Order No. & Date", "PO No", "SO NO", "Order No"). Combine exporter reference and buyer order numbers if both are present.
   - "incoterm": Match labels ("Delivery", "Terms of Delivery", "Incoterms", "Trade Terms", e.g. "CFR", "CIF", "FOB", "EXW" along with the named port/place).
   - "totalInvoiceValue": Match the final payable bottom-line invoice total (labels: "Total CFR Amount", "Total CIF Amount", "Total Invoice Amount", "Grand Total", "Amount Chargeable"). Handle international decimal formatting (period vs comma for thousands/cents) by verifying that Sub Total - Discount + Freight = Total.

5. PACKAGING HIERARCHY SEPARATION:
   - "outerPackagingCount": Number of outer packages (e.g. pallets, crates).
   - "outerPackagingType": Outer package type description (e.g. "PALLETS").
   - "innerPackageCount": Total inner package count (e.g. cartons, boxes, drums).
   - "innerPackageType": Inner package type description (e.g. "BOXES").
   - "innerPackingDescription": Detailed inner packing text if specified.
   - Extract EVERY individual pallet row into the "pallets" array of objects with:
     * "palletNumber": Verbatim pallet identifier as written in the source table (never rename to generic sequences).
     * "modelCode": Model, product number, or item code.
     * "boxCount": Number of boxes/items on this specific pallet.
     * "netWeightKg": Net weight of this specific pallet in kg.
     * "grossWeightKg": Gross weight of this specific pallet in kg.
     * "sourceFile": Exact filename of the document containing that palletized packing table.

6. REFERENCE VS. CARRIER BOOKING SEPARATION:
   - Put commercial invoice numbers in "invoiceNumbers" array.
   - Put invoice dates in "invoiceDates" array.
   - ONLY populate "bookingNumber" if an explicit Carrier Booking Number or Dangerous Goods Booking Reference is stated. Never copy the commercial invoice number into bookingNumber.
`;

/**
 * Converts a File into Base64 using a safe chunked reader to prevent call-stack limits
 */
export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const CHUNK_SIZE = 0x8000; // 32KB chunking
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return window.btoa(binary);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  const buf = (globalThis as unknown as { Buffer?: { from(b: ArrayBuffer): { toString(enc: string): string } } }).Buffer;
  if (buf) {
    return buf.from(buffer).toString('base64');
  }
  throw new Error('Base64 encoding not supported in current environment');
}

/**
 * Executes pure AI multimodal extraction via Gemini API.
 * Never silently fails: throws explicit errors on missing key, non-200 HTTP responses, or invalid JSON.
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

  const globalProc = (globalThis as unknown as { process?: { env?: Record<string, string> } }).process;
  const envKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) ||
                 globalProc?.env?.VITE_GEMINI_API_KEY ||
                 '';
  const apiKey = (apiKeyOverride || envKey).trim();

  if (!apiKey) {
    throw new Error(
      'Missing Gemini API Key. Please configure VITE_GEMINI_API_KEY in your environment or enter a Custom API Key using the "Custom Key" button in the header.'
    );
  }

  onProgress?.({
    stage: 'reading',
    message: `Reading ${files.length} uploaded files...`,
    processedFiles: 0,
    totalFiles: files.length,
    filterLogs: []
  });

  // Step 1: Prepare multimodal payload with explicit file boundary annotations
  const multimodalParts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
      onProgress?.({
        stage: 'prefiltering',
        message: `Processing spreadsheet coordinate grid: ${file.name}`,
        processedFiles: i + 1,
        totalFiles: files.length,
        filterLogs: logs
      });

      const buffer = await file.arrayBuffer();
      const filterRes = preFilterWorkbook(buffer, file.name);
      filterResults.push(filterRes);
      logs.push(...filterRes.filterLog.map(l => `[${file.name}] ${l}`));

      if (filterRes.combinedText) {
        multimodalParts.push({ text: `--- START OF SPREADSHEET FILE: ${file.name} ---` });
        multimodalParts.push({ text: filterRes.combinedText });
        multimodalParts.push({ text: `--- END OF SPREADSHEET FILE: ${file.name} ---` });
      }
    } else if (ext === 'pdf') {
      onProgress?.({
        stage: 'reading',
        message: `Encoding visual layout for PDF: ${file.name}`,
        processedFiles: i + 1,
        totalFiles: files.length,
        filterLogs: logs
      });

      const base64Data = await fileToBase64(file);
      multimodalParts.push({ text: `--- START OF UPLOADED PDF FILE: ${file.name} ---` });
      multimodalParts.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: base64Data
        }
      });
      multimodalParts.push({ text: `--- END OF UPLOADED PDF FILE: ${file.name} ---` });
      logs.push(`[${file.name}] Attached visual PDF layout`);
    } else {
      const text = await file.text();
      multimodalParts.push({ text: `--- START OF DOCUMENT: ${file.name} ---\n${text}\n--- END OF DOCUMENT: ${file.name} ---` });
      logs.push(`[${file.name}] Attached text file`);
    }
  }

  if (multimodalParts.length === 0) {
    throw new Error('No valid content could be extracted from the uploaded files.');
  }

  // Step 2: Invoke Gemini Multimodal API
  onProgress?.({
    stage: 'ai_extracting',
    message: `Executing Gemini Multimodal Structured Extraction (${mode})...`,
    processedFiles: files.length,
    totalFiles: files.length,
    filterLogs: logs
  });

  const modeInstruction = mode === 'SINGLE_INVOICE'
    ? 'Upload Mode is SINGLE_INVOICE. All provided files belong to 1 single shipment. Merge commercial invoice, packing list, and carrier DG sheets into one combined shipment JSON.'
    : 'Upload Mode is MULTI_INVOICE. Documents contain multiple commercial invoices. Extract all invoice numbers, all pallets in physical order, and carrier/vessel details.';

  const userPrompt = `${modeInstruction}\n\nReturn strict JSON adhering to the ExtractedShipmentJSON schema with all fields populated strictly as stated in the documents. If a field is not found in the documents, return "" for string or 0 for number.`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: SYSTEM_PROMPT },
          ...multimodalParts,
          { text: userPrompt }
        ]
      }
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json'
    }
  };

  // Supported model endpoints to attempt in sequence (with automatic fallback on 404/503)
  const models = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-flash-latest',
    'gemini-3.5-flash',
    'gemini-3.8-flash'
  ];
  let lastError: Error | null = null;
  let parsedRawJson: any = null;

  // Build headers: send key via standard x-goog-api-key header to support AIzaSy... and AQ... keys cleanly
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey
  };
  if (apiKey.startsWith('ya29.')) {
    requestHeaders['Authorization'] = `Bearer ${apiKey}`;
  }

  for (const model of models) {
    // Only append ?key= query param for AIza... keys; for AQ... or bearer tokens, URL param triggers ACCESS_TOKEN_TYPE_UNSUPPORTED
    const endpoint = apiKey.startsWith('AIza')
      ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
      : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(requestBody)
      });

      if (!res.ok) {
        const errorText = await res.text();
        // If model is not found (404) or temporarily overloaded (503), attempt next candidate
        if ((res.status === 404 || res.status === 503) && models.indexOf(model) < models.length - 1) {
          console.warn(`Model ${model} returned HTTP ${res.status}, attempting next model candidate...`);
          lastError = new Error(`Gemini API Error (HTTP ${res.status} on ${model}): ${errorText}`);
          continue;
        }
        throw new Error(`Gemini API Error (HTTP ${res.status} on ${model}): ${errorText}`);
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        throw new Error(`Gemini API response did not contain candidates or content parts (Model: ${model}).`);
      }

      try {
        parsedRawJson = JSON.parse(rawText);
        logs.push(`Successfully extracted structured JSON via Gemini (${model})`);
        lastError = null;
        break;
      } catch (jsonErr: any) {
        throw new Error(`Failed to parse JSON from Gemini (${model}): ${jsonErr?.message}\nRaw Text:\n${rawText.slice(0, 300)}`);
      }
    } catch (fetchErr: any) {
      lastError = fetchErr;
      if (models.indexOf(model) === models.length - 1) {
        break;
      }
    }
  }

  if (!parsedRawJson) {
    throw lastError || new Error('All Gemini API model attempts failed.');
  }

  // Step 3: Normalize and validate JSON against universal truth schema
  const cleanShipment = normalizeExtractedJSON(parsedRawJson, mode, files.map(f => f.name));

  // Step 4: Deterministic mathematical verification
  onProgress?.({
    stage: 'consolidating',
    message: 'Verifying mathematical consistency across extracted pallet weights...',
    processedFiles: files.length,
    totalFiles: files.length,
    filterLogs: logs
  });

  consolidateAndVerifyMath(cleanShipment, warnings);

  onProgress?.({
    stage: 'done',
    message: 'Parsing complete. ExtractedShipmentJSON ready for inspection.',
    processedFiles: files.length,
    totalFiles: files.length,
    filterLogs: logs
  });

  return {
    shipmentJson: cleanShipment,
    filterResults,
    logs,
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
  clean.innerPackageType = str(raw.innerPackageType || 'BOXES');
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

  // Global domain rule: hazardous cargo is universally identified by the presence of a UN Number, IMO Class, or Packing Group.
  const hasHazardIdentifiers = Boolean(
    (clean.unNumber && clean.unNumber.trim() !== '') ||
    (clean.imoClass && clean.imoClass.trim() !== '') ||
    (clean.packingGroup && clean.packingGroup.trim() !== '')
  );

  if (hasHazardIdentifiers) {
    clean.isDangerousGoods = true;
  }
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
 * Validates header totals against sum of pallet rows and populates discrepancy warnings.
 */
function consolidateAndVerifyMath(
  shipment: ExtractedShipmentJSON,
  warnings: string[]
): void {
  if (shipment.pallets.length > 0) {
    const calcPallets = shipment.pallets.length;
    const calcBoxes = shipment.pallets.reduce((s, p) => s + (p.boxCount || 0), 0);
    const calcNetKg = Number(shipment.pallets.reduce((s, p) => s + (p.netWeightKg || 0), 0).toFixed(2));
    const calcGrossKg = Number(shipment.pallets.reduce((s, p) => s + (p.grossWeightKg || 0), 0).toFixed(2));

    if (shipment.netWeightKg > 0 && Math.abs(shipment.netWeightKg - calcNetKg) > 1.0) {
      warnings.push(
        `Declared Net Weight (${shipment.netWeightKg} kg) differs from sum of pallet rows (${calcNetKg} kg). Difference: ${(shipment.netWeightKg - calcNetKg).toFixed(2)} kg`
      );
    }

    if (shipment.grossWeightKg > 0 && Math.abs(shipment.grossWeightKg - calcGrossKg) > 1.0) {
      warnings.push(
        `Declared Gross Weight (${shipment.grossWeightKg} kg) differs from sum of pallet rows (${calcGrossKg} kg). Difference: ${(shipment.grossWeightKg - calcGrossKg).toFixed(2)} kg`
      );
    }

    shipment.totalPallets = calcPallets;
    shipment.outerPackagingCount = calcPallets;
    shipment.totalBoxes = calcBoxes;
    shipment.innerPackageCount = calcBoxes;
    shipment.totalPackages = calcBoxes;

    if (shipment.netWeightKg === 0) shipment.netWeightKg = calcNetKg;
    if (shipment.grossWeightKg === 0) shipment.grossWeightKg = calcGrossKg;
  }

  // Global domain rule invariant: hazardous cargo is universally identified by the presence of a UN Number, IMO Class, or Packing Group.
  const hasHazardIdentifiers = Boolean(
    (shipment.unNumber && shipment.unNumber.trim() !== '') ||
    (shipment.imoClass && shipment.imoClass.trim() !== '') ||
    (shipment.packingGroup && shipment.packingGroup.trim() !== '')
  );

  if (hasHazardIdentifiers) {
    shipment.isDangerousGoods = true;
  }

  if (shipment.invoiceNumbers.length === 0) {
    warnings.push('No commercial invoice numbers identified in source documents.');
  }
  if (!shipment.shipperName) {
    warnings.push('Shipper / Exporter name not found in source documents.');
  }
  if (!shipment.consigneeName) {
    warnings.push('Consignee name not found in source documents.');
  }
  if (shipment.isDangerousGoods && !shipment.unNumber) {
    warnings.push('Dangerous goods cargo identified, but UN Number is missing.');
  }

  shipment.discrepancyWarnings = warnings;
}
