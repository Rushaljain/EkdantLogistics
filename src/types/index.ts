// Ekdant Logistics - Customs Document Converter Domain Types

export type FilingType = 'EXPORT' | 'IMPORT';

export type CustomsPort = 'INNSA1' | 'INBOM4';

export interface LineItem {
  id: string;
  itemNumber: number;
  description: string;
  hsnCode: string; // Strictly 8-digits for ICEGATE
  quantity: number;
  uqc: string;     // Standard 3-letter ICEGATE Unit Quantity Code (NOS, PCS, KGS, etc.)
  unitPrice: number;
  total: number;
}

export interface ConvertedInvoice {
  id: string;
  fileName: string;
  fileSize: number;
  convertedAt: string; // Human-friendly display string, e.g., "Today, 01:05 PM"
  rawTimestamp: number;
  status: 'converted' | 'review_suggested';
  filingType: FilingType;
  
  // Header / Statutory Details
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  esanchitIrn: string; // 16-digit e-Sanchit Image Reference Number
  
  // Exporter Master
  exporterName: string;
  iec: string;        // 10-digit statutory IEC
  gstin: string;      // 15-digit statutory GSTIN
  adCode: string;     // 7-digit RBI Authorized Dealer Code
  
  // Consignee & Shipping Route
  consigneeName: string;
  portOfLoading: CustomsPort;
  portOfDischarge: string;
  destinationCountry: string; // 2-letter ISO (US, DE, AE, etc.)
  
  // Financial & Commercial Terms
  currency: string;    // USD, EUR, GBP, INR, AED, etc.
  exchangeRate: number;
  incoterm: 'FOB' | 'CIF' | 'CFR' | 'EXW';
  invoiceTotal: number;
  
  // Physical Manifest
  grossWeightKg: number;
  netWeightKg: number;
  totalPackages: number;
  packageType: string; // BOX, CTN, CRATE, PLT
  
  // Line Items
  lineItems: LineItem[];
}

export interface QueueFile {
  id: string;
  name: string;
  size: number;
  status: 'processing' | 'converted' | 'failed';
  errorMessage?: string;
  file?: File;
}

export interface ExporterProfile {
  id: string;
  companyName: string;
  iec: string;
  gstin: string;
  adCode: string;
  defaultPort: CustomsPort;
}
