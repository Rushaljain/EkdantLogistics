// Ekdant Logistics - Indian Customs & ICEGATE EDI Domain Types

export type ShipmentType = 'EXPORT' | 'IMPORT';

export type UserRole = 'OPERATOR' | 'SENIOR_CHA_ADMIN';

export type CustomsPortCode = 'INNSA1' | 'INBOM4' | 'INMAA1' | 'INMUN1' | 'INDEL4';

export interface ExporterMasterData {
  id: string;
  companyName: string;
  iec: string;        // 10-digit Indian statutory IEC
  gstin: string;      // 15-digit statutory GSTIN
  adCode: string;     // 7-digit RBI Authorized Dealer Code
  bankName: string;
  branchCode: string;
  address: string;
  stateCode: string;
  defaultPortCode: CustomsPortCode;
}

export interface LineItemData {
  id: string;
  itemNumber: number;
  description: string;
  hsnCode: string;           // Strict 8-digit Customs Tariff / RITC
  quantity: number;
  uqc: string;               // ICEGATE 3-letter code (PCS, BOX, MTR, NOS, KGS, etc.)
  originalUqc?: string;      // Raw unit from PDF (e.g. "Pieces", "Cartons")
  unitPrice: number;
  itemTotalValue: number;    // Extracted or punched total value
  calculatedTotal: number;   // quantity * unitPrice
  isLineMathValid: boolean;  // |(qty * rate) - total| <= 0.5
  isHsnValid: boolean;       // exactly 8 numeric digits
  schemeCode?: string;       // Drawback / RoDTEP / RoSCTL code (e.g., "19" or "00")
  grossWeightKg?: number;
  netWeightKg?: number;
}

export interface InvoiceHeaderData {
  invoiceNo: string;
  invoiceDate: string; // YYYY-MM-DD
  currency: string;    // USD, EUR, INR, GBP, AED, JPY, SGD
  exchangeRate: number;
  incoterm: 'FOB' | 'CIF' | 'CFR' | 'EXW' | 'FCA' | 'CIP' | 'CPT';
  invoiceTotal: number;
  freightAmount: number;
  insuranceAmount: number;
  miscCharges: number;
  consigneeName: string;
  consigneeAddress: string;
  destinationCountry: string;
  portOfDischarge: string;
  portOfLoading: CustomsPortCode;
  eSanchitIrn: string; // 16-character e-Sanchit Image Reference Number
  eSanchitDrn?: string; // Document Reference Number
}

export interface PackagesAndWeightData {
  totalPackages: number;
  packageType: string;   // BOX, CTN, PLT, CRATE, BAG
  grossWeightKg: number;
  netWeightKg: number;
  weightRulePassed: boolean; // grossWeight >= netWeight
}

export interface CustomsAuditReport {
  isHeaderMathBalanced: boolean;
  headerMathDifference: number;
  itemsSum: number;
  invoiceTotal: number;
  allHsnValid: boolean;
  invalidHsnCount: number;
  allLineMathValid: boolean;
  invalidLineMathCount: number;
  weightRulePassed: boolean;
  hasESanchitIrn: boolean;
  overallAuditPassed: boolean;
  errorMessages: string[];
  warningMessages: string[];
}

export interface ShipmentData {
  id: string;
  jobNo: string; // e.g. EKD-2026-0042
  shipmentType: ShipmentType;
  portCode: CustomsPortCode;
  customsHouse: string;
  status: 'DRAFT' | 'EXTRACTED' | 'AUDIT_PENDING' | 'AUDIT_PASSED' | 'EXPORTED_EDI' | 'FILED_ICEGATE';
  exporter: ExporterMasterData;
  invoice: InvoiceHeaderData;
  packages: PackagesAndWeightData;
  lineItems: LineItemData[];
  auditReport: CustomsAuditReport;
  sourcePdf?: {
    name: string;
    size: number;
    dataUrl?: string;
    totalPages?: number;
  };
}
