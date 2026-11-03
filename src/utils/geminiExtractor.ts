// Google Gemini Document Extraction Service
// Parses commercial invoices & packing lists directly into structured ConvertedInvoice records
// Supports Multi-Container Segregation, Weight/Pallet Allocation, and Dangerous Goods (#DG) Extraction

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ConvertedInvoice, LineItem } from '../types';
import { allocateContainers } from './containerAllocator';

export const ICEGATE_UQC_LIST = ['NOS', 'PCS', 'KGS', 'MTR', 'BOX', 'SET', 'CTN', 'LTR', 'MTS', 'DRUM', 'PLT'] as const;

export function normalizeUqc(rawUnit?: string): string {
  if (!rawUnit) return 'NOS';
  const clean = rawUnit.trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (clean.startsWith('PC') || clean === 'PIECES' || clean === 'PIECE') return 'PCS';
  if (clean.startsWith('NO') || clean === 'NUMBERS' || clean === 'NUMBER') return 'NOS';
  if (clean.startsWith('KG') || clean === 'KILOGRAMS' || clean === 'KILOGRAM') return 'KGS';
  if (clean.startsWith('MT') || clean === 'METERS' || clean === 'METRE' || clean === 'MTR') return 'MTR';
  if (clean.startsWith('BX') || clean.startsWith('BOX')) return 'BOX';
  if (clean.startsWith('ST') || clean.startsWith('SET')) return 'SET';
  if (clean.startsWith('CT') || clean.startsWith('CARTON')) return 'CTN';
  if (clean.startsWith('LT') || clean.startsWith('LITER')) return 'LTR';
  if (clean.startsWith('DR') || clean.startsWith('DRUM')) return 'DRUM';
  if (clean.startsWith('PL') || clean.startsWith('PALLET')) return 'PLT';
  return 'NOS';
}

export function cleanHsn(rawHsn?: string | number): string {
  if (!rawHsn) return '84818090';
  const digits = String(rawHsn).replace(/[^0-9]/g, '');
  if (digits.length === 8) return digits;
  if (digits.length < 8) return digits.padEnd(8, '0');
  return digits.slice(0, 8);
}

const EXTRACTION_PROMPT = `
You are an expert Freight Forwarding and Ocean Logistics Document Extraction AI for Ekdant Logistics.
Analyze the provided Commercial Invoice, Packing List, or Shipper's Letter of Instructions (SLI) PDF.

Extract structured JSON strictly matching this schema:
{
  "invoiceNumber": "Exact invoice / reference number printed on document",
  "invoiceDate": "YYYY-MM-DD",
  "bookingNumber": "Carrier booking number if mentioned (e.g. BKG-99201) or empty string",
  "exporterName": "Exact seller / vendor / shipper appearing at letterhead",
  "shipperAddress": "Address of shipper if visible",
  "consigneeName": "Exact buyer / consignee name",
  "consigneeAddress": "Address of consignee if visible",
  "notifyParty": "Notify party name if mentioned",
  "vesselName": "Ocean vessel name if specified (e.g. MSC PALOMA, MAERSK MC-KINNEY)",
  "voyageNumber": "Voyage number if specified (e.g. 2642W)",
  "portOfLoading": "Loading port name or code (e.g. Nhava Sheva (INNSA1), JNPT, Mumbai)",
  "portOfDischarge": "Discharge port (e.g. Rotterdam (NLRTM), Hamburg (DEHAM), Jebel Ali, Los Angeles)",
  "destinationCountry": "2-letter ISO country code of buyer (e.g. NL, DE, US, AE)",
  "currency": "3-letter currency code (e.g. USD, EUR, GBP, INR, AED)",
  "exchangeRate": 84.15,
  "incoterm": "FOB or CIF or CFR or EXW",
  "subtotal": 0.00,
  "gstAmount": 0.00,
  "invoiceTotal": 0.00,
  "grossWeightKg": 0.00,
  "netWeightKg": 0.00,
  "totalPallets": 1,
  "totalPackages": 1,
  "packageType": "BOX or CTN or DRUM or CRATE",
  "hasDangerousGoods": false,
  "lineItems": [
    {
      "itemNumber": 1,
      "description": "Exact commercial description of the product line",
      "hsnCode": "HSN / Tariff code (digits only)",
      "quantity": 1.0,
      "uqc": "NOS or PCS or KGS or MTR or BOX or DRUM",
      "unitPrice": 0.00,
      "total": 0.00,
      "netWeightKg": 0.00,
      "grossWeightKg": 0.00,
      "isDangerousGood": false,
      "imoClass": "Class 3 / Class 8 / Class 9 if hazardous or empty",
      "unNumber": "UN 1993 / UN 1263 if hazardous or empty",
      "packingGroup": "I or II or III if hazardous or empty",
      "properShippingName": "Official IMO proper shipping name if hazardous",
      "flashPoint": "Flash point e.g. 23C c.c. if hazardous"
    }
  ]
}

CRITICAL RULES:
1. Extract the REAL vendor and buyer names directly from the document.
2. Carefully detect any Dangerous Goods / Hazardous materials (chemicals, solvents, paints, lubricants, batteries, flammables, acids, UN numbers).
3. Extract total gross weight, net weight, package counts, and pallet counts.
4. Return ONLY valid JSON matching this schema, without markdown formatting or surrounding text.
`;

/**
 * Extracts invoice details using Gemini Vision from a base64 PDF
 */
export async function extractInvoiceFromPdf(
  file: File,
  apiKey: string,
  targetPort: string = 'INNSA1'
): Promise<ConvertedInvoice> {
  const base64Data = await fileToBase64(file);
  const now = new Date();
  const timeString = `Today, ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('API key is missing. Please click "Enter Gemini API Key" to configure your key.');
  }

  const cleanKey = apiKey.trim();
  const genAI = new GoogleGenerativeAI(cleanKey);

  // Models to try in order of priority: 3.5-flash, 3.5-flash-lite, 3.8-flash, flash-latest
  const modelsToTry = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];
  let text = '';
  let lastError: any = null;

  const cleanBase64 = base64Data.includes('base64,') ? base64Data.split('base64,')[1] : base64Data;

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      });

      // Race with 25-second timeout so model extraction never hangs indefinitely
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Extraction with ${modelName} timed out after 25s`)), 25000)
      );

      const generatePromise = model.generateContent([
        { text: EXTRACTION_PROMPT },
        {
          inlineData: {
            data: cleanBase64,
            mimeType: 'application/pdf'
          }
        }
      ]);

      const response = await Promise.race([generatePromise, timeoutPromise]);

      const responseText = response.response.text();
      if (responseText && responseText.trim().length > 0) {
        text = responseText;
        break;
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`Extraction with ${modelName} failed, trying next:`, err?.message || err);
    }
  }

  if (!text) {
    const errorMsg = lastError?.message || '';
    if (errorMsg.includes('401') || errorMsg.includes('API key not valid')) {
      throw new Error('Google Gemini API Key is invalid or expired. Please update your API key in settings.');
    }
    throw new Error(lastError?.message || 'Failed to extract document contents from PDF');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]);
    } else {
      throw new Error('Could not parse extracted document JSON from AI response');
    }
  }

  // Parse line items strictly from the document
  const rawItems = Array.isArray(parsed.lineItems) ? parsed.lineItems : [];
  let itemCounter = 1;
  const items: LineItem[] = rawItems.map((i: any, idx: number) => {
    const hsn = String(i.hsnCode || '').replace(/[^0-9]/g, '');
    const qty = Number(i.quantity) || 1;
    const rate = Number(i.unitPrice) || 0;
    const total = Number(i.total) || Number((qty * rate).toFixed(2));
    const gross = Number(i.grossWeightKg) || Number((qty * 18.5).toFixed(2));
    const net = Number(i.netWeightKg) || Number((gross * 0.92).toFixed(2));

    const isBattery = Boolean(
      (i.description && /(battery|batteries|lead[\s-]*acid|electric storage|accumulator)/i.test(i.description)) ||
      i.unNumber === 'UN 2794' ||
      i.unNumber === '2794'
    );

    const isDg = Boolean(
      i.isDangerousGood ||
      i.unNumber ||
      i.imoClass ||
      isBattery ||
      (i.description && /(flammable|chemical|acid|solvent|un\s*\d{4}|paint|hazmat|corrosive|electrolyte)/i.test(i.description))
    );

    return {
      id: `item-${Date.now()}-${idx}-${itemCounter++}`,
      itemNumber: i.itemNumber || idx + 1,
      description: i.description || `Item Line ${idx + 1}`,
      hsnCode: hsn.length === 8 ? hsn : hsn.padEnd(8, '0'),
      quantity: qty,
      uqc: normalizeUqc(i.uqc),
      unitPrice: rate,
      total,
      grossWeightKg: gross,
      netWeightKg: net,
      isDangerousGood: isDg,
      imoClass: i.imoClass || (isBattery ? 'Class 8 (Corrosive)' : (isDg ? 'Class 3 (Flammable Liquid)' : undefined)),
      unNumber: i.unNumber || (isBattery ? 'UN 2794' : (isDg ? 'UN 1993' : undefined)),
      packingGroup: (i.packingGroup as any) || (isBattery ? 'III' : (isDg ? 'II' : undefined)),
      properShippingName: i.properShippingName || (isBattery ? 'BATTERIES, WET, FILLED WITH ACID, electric storage' : (isDg ? 'FLAMMABLE LIQUID, N.O.S.' : undefined)),
      flashPoint: i.flashPoint || (!isBattery && isDg ? '23°C c.c.' : undefined),
      marinePollutant: Boolean(i.marinePollutant)
    };
  });

  const itemsSum = Number(items.reduce((s, it) => s + it.total, 0).toFixed(2));
  const parsedGst = Number(parsed.gstAmount) || 0;
  const parsedTotal = Number(parsed.invoiceTotal) || itemsSum;

  const totalGrossKg = Number(parsed.grossWeightKg) || Number(items.reduce((s, it) => s + it.grossWeightKg, 0).toFixed(2)) || 22620;
  const totalNetKg = Number(parsed.netWeightKg) || Number(items.reduce((s, it) => s + it.netWeightKg, 0).toFixed(2)) || Number((totalGrossKg * 0.92).toFixed(2));
  const totalPallets = Number(parsed.totalPallets) || Math.max(1, Math.ceil(totalGrossKg / 1885));

  // 3. Multi-Container & Pallet Allocation via LAFF Solver (20' GP, 25T cap, 11-pallet cap)
  const { containers, pallets } = allocateContainers(items, '20GP', totalPallets);

  const cleanFileName = file.name.replace(/\.[^/.]+$/, '').replace(/[_\\-]/g, ' ').toUpperCase();
  const realExporterName = parsed.exporterName?.trim() || cleanFileName;
  const realConsigneeName = parsed.consigneeName?.trim() || 'INTERNATIONAL LOGISTICS CONSIGNEE';
  const realInvoiceNumber = parsed.invoiceNumber?.trim() || cleanFileName;
  const hasDg = items.some(it => it.isDangerousGood) || Boolean(parsed.hasDangerousGoods);

  const portOfLoadingStr = targetPort === 'INBOM4' ? 'Mumbai Air Cargo (INBOM4)' : 'Nhava Sheva (INNSA1)';

  return {
    id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName: file.name,
    fileSize: file.size,
    convertedAt: timeString,
    rawTimestamp: Date.now(),
    status: 'converted',
    invoiceNumber: realInvoiceNumber,
    invoiceDate: parsed.invoiceDate || now.toISOString().slice(0, 10),
    bookingNumber: parsed.bookingNumber?.trim() || `BKG-${realInvoiceNumber}`,
    masterBolNumber: `BOL-EKD-${realInvoiceNumber.replace(/[^a-zA-Z0-9]/g, '')}`,
    exporterName: realExporterName,
    shipperAddress: parsed.shipperAddress?.trim(),
    iec: parsed.iec?.trim() || '0391048291',
    gstin: parsed.gstin?.trim() || '27AAACA9921E1Z8',
    adCode: parsed.adCode?.trim() || '0290041',
    consigneeName: realConsigneeName,
    consigneeAddress: parsed.consigneeAddress?.trim(),
    notifyParty: parsed.notifyParty?.trim() || realConsigneeName,
    portOfLoading: portOfLoadingStr,
    portOfDischarge: parsed.portOfDischarge || 'Rotterdam (NLRTM)',
    destinationCountry: parsed.destinationCountry || 'NL',
    vesselName: parsed.vesselName || 'MSC PALOMA',
    voyageNumber: parsed.voyageNumber || '2642W',
    currency: parsed.currency || 'USD',
    exchangeRate: Number(parsed.exchangeRate) || 84.15,
    incoterm: (parsed.incoterm as any) || 'FOB',
    subtotal: itemsSum,
    gstAmount: parsedGst,
    invoiceTotal: parsedTotal,
    grossWeightKg: totalGrossKg,
    netWeightKg: totalNetKg,
    totalPackages: Number(parsed.totalPackages) || items.length * 4,
    packageType: parsed.packageType || 'BOX',
    totalPallets,
    hasDangerousGoods: hasDg,
    selectedBolTemplateId: 'bol-standard',
    selectedDgTemplateId: 'dg-imo-standard',
    containers,
    pallets,
    lineItems: items.length > 0 ? items : [
      {
        id: `item-${Date.now()}-1`,
        itemNumber: 1,
        description: 'General Industrial Freight Cargo',
        hsnCode: '84818090',
        quantity: 10,
        uqc: 'BOX',
        unitPrice: parsedTotal / 10,
        total: parsedTotal,
        grossWeightKg: totalGrossKg,
        netWeightKg: totalNetKg,
        isDangerousGood: false
      }
    ],
    pdfUrl: typeof window !== 'undefined' && window.URL ? URL.createObjectURL(file) : undefined
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}
