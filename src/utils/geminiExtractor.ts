// Google Gemini Document Extraction Service
// Parses commercial invoices & packing lists directly into structured ConvertedInvoice records
// NO HARDCODED VENDOR / CONSIGNEE NAMES

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ConvertedInvoice, CustomsPort, LineItem } from '../types';

export const ICEGATE_UQC_LIST = ['NOS', 'PCS', 'KGS', 'MTR', 'BOX', 'SET', 'CTN', 'LTR', 'MTS'] as const;

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
  if (clean.startsWith('TON') || clean === 'MTS') return 'MTS';
  return 'NOS';
}

export function cleanHsn(rawHsn?: string | number): string {
  if (!rawHsn) return '84818090';
  const digits = String(rawHsn).replace(/[^0-9]/g, '');
  if (digits.length === 8) return digits;
  if (digits.length < 8) return digits.padEnd(8, '0');
  return digits.slice(0, 8);
}

export function generateMockIrn(port: CustomsPort = 'INNSA1'): string {
  const year = new Date().getFullYear();
  const randomDigits = Math.floor(1000000000 + Math.random() * 9000000000);
  return `${year}${port.slice(2, 5)}${randomDigits}`.slice(0, 16);
}

const EXTRACTION_PROMPT = `
You are an expert Indian Customs Documentation Extraction AI for Ekdant Logistics (Licensed Customs Broker CHA).
Analyze the provided Commercial Invoice and/or Packing List PDF document.

Extract structured JSON strictly matching this schema:
{
  "invoiceNumber": "Exact invoice number printed on the document",
  "invoiceDate": "YYYY-MM-DD",
  "exporterName": "Exact seller / vendor / shipper / company name appearing at the header or letterhead of the invoice",
  "iec": "10-character alphanumeric IEC code if visible (or empty string)",
  "gstin": "15-character alphanumeric GSTIN if visible (or empty string)",
  "adCode": "7-digit numeric bank AD code if visible (or empty string)",
  "consigneeName": "Exact buyer / consignee / billed-to entity name from the document",
  "portOfDischarge": "Discharge port code if mentioned (e.g. DEHAM, USLAX, AEJEA) or city/country",
  "destinationCountry": "2-letter ISO country code of buyer (e.g. DE, US, AE, GB)",
  "currency": "3-letter currency code (e.g. USD, EUR, GBP, INR, AED)",
  "exchangeRate": 84.15,
  "incoterm": "FOB or CIF or CFR or EXW",
  "subtotal": 0.00,
  "gstAmount": 0.00,
  "gstRate": 18.0,
  "invoiceTotal": 0.00,
  "grossWeightKg": 0.00,
  "netWeightKg": 0.00,
  "totalPackages": 1,
  "packageType": "BOX or CTN or CRATE or PLT",
  "esanchitIrn": "16-digit e-Sanchit IRN if visible",
  "lineItems": [
    {
      "itemNumber": 1,
      "description": "Exact commercial description of the product line",
      "hsnCode": "Exact HSN / RITC / Tariff code (digits only)",
      "quantity": 1.0,
      "uqc": "NOS or PCS or KGS or MTR or BOX or SET or CTN",
      "unitPrice": 0.00,
      "total": 0.00
    }
  ]
}

CRITICAL RULES:
1. Extract the REAL vendor name and REAL buyer name exactly as written in the uploaded PDF.
2. Never invent or hallucinate company names.
3. Extract EVERY line item in the invoice table with its quantity, price, and total.
4. If the invoice has GST (CGST/SGST or IGST) or taxes, capture the total tax in "gstAmount", taxable value in "subtotal", and the final payable grand total in "invoiceTotal".
5. Return ONLY valid JSON matching this schema, without code fences or extra text.
`;

/**
 * Extracts invoice details using Gemini Vision from a base64 PDF
 */
export async function extractInvoiceFromPdf(
  file: File,
  apiKey: string,
  targetPort: CustomsPort = 'INNSA1'
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
  const items: LineItem[] = rawItems.map((i: any, idx: number) => {
    const hsn = String(i.hsnCode || '').replace(/[^0-9]/g, '');
    const qty = Number(i.quantity) || 1;
    const rate = Number(i.unitPrice) || 0;
    const total = Number(i.total) || Number((qty * rate).toFixed(2));
    return {
      id: `item-${Date.now()}-${idx}`,
      itemNumber: i.itemNumber || idx + 1,
      description: i.description || `Item Line ${idx + 1}`,
      hsnCode: hsn.length === 8 ? hsn : hsn.padEnd(8, '0'),
      quantity: qty,
      uqc: normalizeUqc(i.uqc),
      unitPrice: rate,
      total
    };
  });

  const itemsSum = Number(items.reduce((s, it) => s + it.total, 0).toFixed(2));
  const parsedGst = Number(parsed.gstAmount) || 0;
  const parsedTotal = Number(parsed.invoiceTotal) || itemsSum;

  // Auto-detect GST if parsedTotal exceeds itemsSum
  const gstDifference = parsedTotal > itemsSum ? Number((parsedTotal - itemsSum).toFixed(2)) : 0;
  const effectiveGst = parsedGst > 0 ? parsedGst : gstDifference;

  // Reconcile math: itemsSum + effectiveGst vs invoiceTotal
  const effectiveSumWithGst = Number((itemsSum + effectiveGst).toFixed(2));
  const isDirectMatch = Math.abs(itemsSum - parsedTotal) <= 0.5;
  const isGstMatch = Math.abs(effectiveSumWithGst - parsedTotal) <= 0.5;
  const isMathDrift = !isDirectMatch && !isGstMatch;
  const hasInvalidHsn = items.some(it => it.hsnCode.length !== 8);

  // REAL vendor name from PDF without hardcoding
  const cleanFileName = file.name.replace(/\.[^/.]+$/, '').replace(/[_\\-]/g, ' ').toUpperCase();
  const realExporterName = parsed.exporterName?.trim() || cleanFileName;
  const realConsigneeName = parsed.consigneeName?.trim() || 'NOT SPECIFIED IN DOCUMENT';
  const realInvoiceNumber = parsed.invoiceNumber?.trim() || cleanFileName;

  return {
    id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName: file.name,
    fileSize: file.size,
    convertedAt: timeString,
    rawTimestamp: Date.now(),
    status: isMathDrift || hasInvalidHsn ? 'review_suggested' : 'converted',
    filingType: 'EXPORT',
    invoiceNumber: realInvoiceNumber,
    invoiceDate: parsed.invoiceDate || now.toISOString().slice(0, 10),
    esanchitIrn: parsed.esanchitIrn?.trim() || generateMockIrn(targetPort),
    exporterName: realExporterName,
    iec: parsed.iec?.trim() || '',
    gstin: parsed.gstin?.trim() || '',
    adCode: parsed.adCode?.trim() || '',
    consigneeName: realConsigneeName,
    portOfLoading: targetPort,
    portOfDischarge: parsed.portOfDischarge || (targetPort === 'INNSA1' ? 'DEHAM' : 'DEMUC'),
    destinationCountry: parsed.destinationCountry || 'DE',
    currency: parsed.currency || 'USD',
    exchangeRate: Number(parsed.exchangeRate) || 84.15,
    incoterm: (parsed.incoterm as any) || 'FOB',
    subtotal: itemsSum,
    gstAmount: effectiveGst,
    gstRate: Number(parsed.gstRate) || 18,
    invoiceTotal: parsedTotal,
    grossWeightKg: Number(parsed.grossWeightKg) || 0,
    netWeightKg: Number(parsed.netWeightKg) || 0,
    totalPackages: Number(parsed.totalPackages) || 1,
    packageType: parsed.packageType || 'BOX',
    pdfUrl: typeof window !== 'undefined' && window.URL ? URL.createObjectURL(file) : undefined,
    lineItems: items.length > 0 ? items : [
      {
        id: `item-${Date.now()}-1`,
        itemNumber: 1,
        description: 'Goods as per Commercial Invoice',
        hsnCode: '84818090',
        quantity: 1,
        uqc: 'NOS',
        unitPrice: parsedTotal,
        total: parsedTotal
      }
    ]
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
