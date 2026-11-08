// Ekdant Logistics - Target Format Parser (FormatSchemaJSON) & Persistent Format Library
// Extracts structural field labels and layout from uploaded .pdf, .docx, .xlsx templates
// Enforces strict zero-hardcoding: strips out sample shipment values and extracts ONLY field definitions

import JSZip from 'jszip';
import type { FormatDocumentType, FormatFieldDefinition, FormatSchemaJSON } from '../types/index.ts';
import { fileToBase64 } from './documentParser.ts';
import { preFilterWorkbook } from './spreadsheetPreFilter.ts';

const FORMAT_LIBRARY_KEY = 'ekdant_format_library_v1';

// =========================================================================
// Default Industry-Standard Formats (Available Out-of-the-Box)
// =========================================================================

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

// =========================================================================
// Format Library Persistence (localStorage)
// =========================================================================

export function getSavedFormats(): FormatSchemaJSON[] {
  if (typeof window === 'undefined') {
    return [DEFAULT_DG_FORMAT, DEFAULT_BL_FORMAT];
  }

  try {
    const raw = window.localStorage.getItem(FORMAT_LIBRARY_KEY);
    if (!raw) {
      return [DEFAULT_DG_FORMAT, DEFAULT_BL_FORMAT];
    }
    const list: FormatSchemaJSON[] = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) {
      return [DEFAULT_DG_FORMAT, DEFAULT_BL_FORMAT];
    }

    // Ensure built-in defaults are present if not in user list
    const hasDefaultDg = list.some(f => f.formatId === DEFAULT_DG_FORMAT.formatId);
    const hasDefaultBl = list.some(f => f.formatId === DEFAULT_BL_FORMAT.formatId);

    const merged = [...list];
    if (!hasDefaultDg) merged.unshift(DEFAULT_DG_FORMAT);
    if (!hasDefaultBl) merged.unshift(DEFAULT_BL_FORMAT);

    return merged;
  } catch (err) {
    console.warn('[FormatParser] Failed to load saved formats from localStorage:', err);
    return [DEFAULT_DG_FORMAT, DEFAULT_BL_FORMAT];
  }
}

export function saveFormatToLibrary(schema: FormatSchemaJSON): void {
  if (typeof window === 'undefined') return;

  const current = getSavedFormats();
  const existingIdx = current.findIndex(f => f.formatId === schema.formatId);

  if (existingIdx >= 0) {
    current[existingIdx] = schema;
  } else {
    current.push(schema);
  }

  window.localStorage.setItem(FORMAT_LIBRARY_KEY, JSON.stringify(current));
}

export function deleteFormatFromLibrary(formatId: string): void {
  if (typeof window === 'undefined') return;

  const current = getSavedFormats().filter(f => f.formatId !== formatId);
  window.localStorage.setItem(FORMAT_LIBRARY_KEY, JSON.stringify(current));
}

export function clearFormatLibrary(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(FORMAT_LIBRARY_KEY);
}

// =========================================================================
// Multi-Format Ingestion (Word .docx, Excel, PDF)
// =========================================================================

/**
 * Extracts raw structured table and paragraph text from a Word (.docx) document
 */
export async function extractDocxStructure(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const docXmlFile = zip.file('word/document.xml');

  if (!docXmlFile) {
    throw new Error('Invalid Word document: word/document.xml missing inside .docx file.');
  }

  const docXml = await docXmlFile.async('text');

  // Convert table cells into structured row blocks and paragraphs into lines
  const text = docXml
    .replace(/<w:tr[^>]*>/g, '\n[TABLE_ROW] ')
    .replace(/<w:tc[^>]*>/g, ' | [CELL] ')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  const cleanedLines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  return cleanedLines.join('\n');
}

// =========================================================================
// AI Structural Schema Extraction
// =========================================================================

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

export interface ParseFormatProgress {
  stage: 'reading' | 'ai_extracting' | 'validating' | 'done';
  message: string;
}

/**
 * Parses any uploaded template (.pdf, .docx, .xlsx, .xls) using Gemini Multimodal
 * to extract a pristine FormatSchemaJSON without contaminating shipment values.
 */
export async function parseTargetFormat(
  file: File,
  formatName: string,
  documentType: FormatDocumentType,
  apiKeyOverride?: string,
  onProgress?: (progress: ParseFormatProgress) => void
): Promise<FormatSchemaJSON> {
  const globalProc = (globalThis as unknown as { process?: { env?: Record<string, string> } }).process;
  const envKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) ||
                 globalProc?.env?.VITE_GEMINI_API_KEY ||
                 '';
  const apiKey = (apiKeyOverride || envKey).trim();

  if (!apiKey) {
    throw new Error('Missing Gemini API Key. Please configure VITE_GEMINI_API_KEY or enter your key in the header.');
  }

  onProgress?.({
    stage: 'reading',
    message: `Reading format template: ${file.name}...`
  });

  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const multimodalParts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];

  if (ext === 'pdf') {
    const base64Data = await fileToBase64(file);
    multimodalParts.push({ text: `--- START OF PDF TEMPLATE: ${file.name} ---` });
    multimodalParts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: base64Data
      }
    });
    multimodalParts.push({ text: `--- END OF PDF TEMPLATE: ${file.name} ---` });
  } else if (ext === 'docx') {
    const docxText = await extractDocxStructure(file);
    multimodalParts.push({ text: `--- START OF WORD DOCX TEMPLATE: ${file.name} ---\n${docxText}\n--- END OF WORD DOCX TEMPLATE: ${file.name} ---` });
  } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    const buffer = await file.arrayBuffer();
    const filterRes = preFilterWorkbook(buffer, file.name);
    multimodalParts.push({ text: `--- START OF SPREADSHEET TEMPLATE: ${file.name} ---\n${filterRes.combinedText}\n--- END OF SPREADSHEET TEMPLATE: ${file.name} ---` });
  } else {
    const text = await file.text();
    multimodalParts.push({ text: `--- START OF TEMPLATE: ${file.name} ---\n${text}\n--- END OF TEMPLATE: ${file.name} ---` });
  }

  onProgress?.({
    stage: 'ai_extracting',
    message: `Extracting structural field schema via Gemini AI (${documentType})...`
  });

  const userInstruction = `
Target Format Name: "${formatName}"
Document Type: "${documentType}"
Source File: "${file.name}"

Analyze the layout and extract every single box, field, and column into FormatSchemaJSON with fields in top-to-bottom order.
Strictly ensure NO sample or draft shipment values are stored in the schema.
`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: FORMAT_EXTRACTOR_SYSTEM_PROMPT },
          ...multimodalParts,
          { text: userInstruction }
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
    'gemini-flash-latest'
  ];
  let lastError: Error | null = null;
  let rawJson: any = null;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey
  };
  if (apiKey.startsWith('ya29.')) {
    requestHeaders['Authorization'] = `Bearer ${apiKey}`;
  }

  for (const model of models) {
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
        const errText = await res.text();
        if ((res.status === 404 || res.status === 503) && models.indexOf(model) < models.length - 1) {
          console.warn(`Format parser: model ${model} returned HTTP ${res.status}, retrying next candidate...`);
          lastError = new Error(`Format extraction failed on ${model}: ${errText}`);
          continue;
        }
        throw new Error(`Gemini Format Parser Error (HTTP ${res.status} on ${model}): ${errText}`);
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new Error(`Gemini format extraction returned empty parts (model: ${model}).`);
      }

      rawJson = JSON.parse(rawText);
      lastError = null;
      break;
    } catch (err: any) {
      lastError = err;
      if (models.indexOf(model) === models.length - 1) {
        break;
      }
    }
  }

  if (!rawJson) {
    throw lastError || new Error('All model attempts failed during format schema extraction.');
  }

  onProgress?.({
    stage: 'validating',
    message: 'Validating and normalizing extracted FormatSchemaJSON...'
  });

  // Validate and normalize fields
  const slugId = formatName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || `format_${Date.now()}`;

  const normalizedFields: FormatFieldDefinition[] = Array.isArray(rawJson.fields)
    ? rawJson.fields.map((f: any, idx: number) => ({
        fieldId: String(f.fieldId || `field_${idx + 1}`).toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        labelInTemplate: String(f.labelInTemplate || f.fieldId || `Field ${idx + 1}`),
        sectionName: String(f.sectionName || 'General Details'),
        fieldType: ['text', 'multiline', 'number', 'table'].includes(f.fieldType) ? f.fieldType : 'text',
        mappedShipmentKey: typeof f.mappedShipmentKey === 'string' ? f.mappedShipmentKey : ''
      }))
    : [];

  const finalSchema: FormatSchemaJSON = {
    formatId: String(rawJson.formatId || slugId),
    formatName: String(rawJson.formatName || formatName),
    documentType: documentType,
    sourceFileName: file.name,
    createdAt: new Date().toISOString(),
    fields: normalizedFields
  };

  onProgress?.({
    stage: 'done',
    message: `Extracted ${finalSchema.fields.length} structural fields for ${formatName}.`
  });

  return finalSchema;
}
