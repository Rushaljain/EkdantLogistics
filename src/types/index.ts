// Ekdant Logistics - Multi-Container & HazMat Document System Types
// Supports Multi-Invoice Ingestion, Weight/Pallet Segregation, #DG & Master BOL Generation

export type ContainerType = '20GP' | '40GP' | '40HC' | '45HC';

export const CONTAINER_SPECS: Record<ContainerType, { name: string; maxPayloadKg: number; tareWeightKg: number; cbm: number; maxPallets: number }> = {
  '20GP': { name: "20' General Purpose", maxPayloadKg: 25000, tareWeightKg: 2150, cbm: 33.2, maxPallets: 22 },
  '40GP': { name: "40' General Purpose", maxPayloadKg: 26500, tareWeightKg: 3750, cbm: 67.7, maxPallets: 24 },
  '40HC': { name: "40' High Cube", maxPayloadKg: 26500, tareWeightKg: 3900, cbm: 76.4, maxPallets: 24 },
  '45HC': { name: "45' High Cube", maxPayloadKg: 27800, tareWeightKg: 4800, cbm: 86.0, maxPallets: 26 }
};

export interface DangerousGoodsInfo {
  isDangerousGood: boolean;
  imoClass?: string;          // e.g. "Class 3 - Flammable Liquid", "Class 8 - Corrosives"
  unNumber?: string;          // e.g. "UN 1993", "UN 1263", "UN 3082"
  packingGroup?: 'I' | 'II' | 'III' | 'NIL' | 'NA' | string;
  properShippingName?: string; // e.g. "FLAMMABLE LIQUID, N.O.S."
  flashPoint?: string;        // e.g. "23°C c.c."
  marinePollutant?: boolean;
  emergencyContact?: string;
  emsNumber?: string;         // e.g. "F-E, S-E"
}

export interface LineItem extends DangerousGoodsInfo {
  id: string;
  itemNumber: number;
  description: string;
  hsnCode: string;
  quantity: number;
  uqc: string;                // NOS, PCS, KGS, BOX, etc.
  unitPrice: number;
  total: number;
  netWeightKg: number;
  grossWeightKg: number;
  modelNumber?: string;
  palletNumber?: string;      // e.g. "PLT-5644"
  containerNumber?: string;   // e.g. "MSCU7829104"
}

export interface Pallet {
  id: string;
  palletNumber: string;       // e.g. "PLT-5644"
  packageCount: number;
  packageType: string;        // BOX, DRUM, CARTON, CRATE
  innerPackageCount?: number; // e.g. 29, 75, 357 (Corrugated boxes inside pallet)
  innerPackageType?: string;  // "BOX", "CARTON", "PAIL", "DRUM"
  baseUnitCount?: number;     // e.g. 5, 9 (batteries/units)
  baseUnitType?: string;      // "NOS", "PCS"
  grossWeightKg: number;
  netWeightKg: number;
  dimensions?: string;        // e.g. "1200 x 1000 x 1650 mm"
  footprintAreaMm2?: number;  // Footprint tier area (e.g. 1200 * 1000)
  modelOrDescription?: string;// e.g. "EFB70-S95-D26L - Lead Acid Batteries"
  isDangerousGoods: boolean;
  imoClass?: string;
  unNumber?: string;
  packingGroup?: 'I' | 'II' | 'III' | 'NIL' | 'NA' | string;
  assignedContainerId?: string;
  lineItemIds: string[];
}

export interface ContainerAllocation {
  id: string;
  containerNumber: string;    // e.g. "TEMU2523270"
  sealNumber: string;         // e.g. "EMC883921"
  containerType: ContainerType;
  maxPayloadKg: number;
  maxPallets?: number;
  tareWeightKg: number;
  pallets: Pallet[];
  assignedPalletIds: string[];
  totalGrossWeightKg: number;
  totalNetWeightKg: number;
  totalPackages: number;
  totalPallets?: number;
  isOverweight: boolean;
  isOverCapacity?: boolean;
  isSpillover?: boolean;
  weightUtilizationPct?: number;
  palletUtilizationPct?: number;
  hasDangerousGoods: boolean;
}

export interface MasterFormat {
  id: string;
  name: string;             // e.g. "ONE Line Multimodal (Myanmar/Yangon)", "CMA CGM Standard (Middle East/Jeddah)"
  carrierOrClient: string;  // e.g. "ONE Line", "CMA CGM"
  description: string;
  isPreseeded?: boolean;
  uploadedFileName?: string;
  uploadedAt?: string;
  fileContent?: string;
  fileType?: string;
  
  // Format-Level Carrier & Shipment Defaults
  carrierName?: string;
  bookingNumber?: string;
  vesselName?: string;
  voyageNumber?: string;
  placeOfReceipt?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  portOfDischargeDg?: string;
  finalDestination?: string;
  destinationCountry?: string;
  containerNumber?: string;
  sealNumber?: string;
  containerType?: ContainerType;
  tareWeightKg?: number;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  dgDeclarantName?: string;
  dgDeclarantStatus?: string;
  dgDeclarationPlaceAndDate?: string;
  unPackingCode?: string;
  segregationGroup?: string;
  emsNumber?: string;
  shippingBillNumbers?: string;
  brandName?: string;
  shippingMarks?: string;
  blDeclaredNetWeightKg?: number;
  statutoryDescription?: string;
  hsnCode?: string;
  freeTimeClause?: string;
  freightTerms?: string;
  movementType?: string;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  type: 'BOL' | 'DG';
  carrierOrClient: string;    // "Standard Ocean", "Maersk Style", "MSC Intermodal", "IMO Dangerous Goods"
  isDefault?: boolean;
  description?: string;
}

export interface DocumentOutput {
  id: string;
  shipmentId: string;
  documentType: 'BOL' | 'DG';
  documentNumber: string;     // e.g. "BOL-EKD-2026-089" or "DG-2026-089"
  templateName: string;
  title: string;
  generatedAt: string;
  containersSummary: string;
  formattedHtml: string;
}

export type CustomsPort = 'INNSA1' | 'INBOM4';

export interface ConvertedInvoice {
  id: string;
  fileName: string;
  fileSize: number;
  convertedAt: string;
  rawTimestamp: number;
  status: 'converted' | 'review_suggested';
  
  // Header / Commercial Info
  invoiceNumber: string;
  invoiceDate: string;        // YYYY-MM-DD
  bookingNumber?: string;
  masterBolNumber?: string;
  
  // Parties
  exporterName: string;       // Shipper
  shipperAddress?: string;
  onBehalfOf?: string;
  iec?: string;
  gstin?: string;
  adCode?: string;
  consigneeName: string;
  consigneeAddress?: string;
  notifyParty?: string;
  
  // Routing & Shipping References
  carrierName?: string;       // e.g. "ONE LINE", "CMA CGM"
  portOfLoading: string;      // e.g. "Nhava Sheva (INNSA1)"
  portOfDischarge: string;    // e.g. "Rotterdam (NLRTM)", "YANGON, MYANMAR"
  portOfDischargeDg?: string; // e.g. "SINGAPORE" (if transshipment port on DG differs from BL POD)
  placeOfReceipt?: string;    // e.g. "NHAVA SHEVA"
  placeOfDelivery?: string;   // e.g. "MYANMAR"
  finalDestination?: string;
  destinationCountry: string; // 2-letter ISO (DE, US, NL, etc.)
  vesselName?: string;
  voyageNumber?: string;
  shippingMarks?: string;     // e.g. "KAUNG SWANN\nHTET TRADING\nMYANMAR"
  brandName?: string;         // e.g. "DYNEX MATRIX"
  hsnCode?: string;           // e.g. "85071000"
  shippingBillNumber?: string;// e.g. "7463800"
  shippingBillNumbers?: string; // e.g. "SB NO. 7463800 DT. 05.10.2026, SB NO. 7464015 DT. 05.10.2026..."
  freightTerms?: 'FREIGHT COLLECT' | 'FREIGHT PREPAID';
  movementType?: string;      // e.g. "FCL / CY"
  freeTimeClause?: string;    // e.g. "14 DAYS FREE TIME DETENTION AT DESTINATION"
  palletRanges?: string[];    // e.g. ["4956 TO 4963", "4964", "4533 TO 4546", ...]
  statutoryDescription?: string; // e.g. "LEAD ACID AUTOMOTIVE STORAGE BATTERIES"
  blDeclaredNetWeightKg?: number; // Optional override if BL body net weight differs
  dgPackingGroupOverride?: 'I' | 'II' | 'III' | 'NA';
  dgDeclarantName?: string;   // e.g. "SUJOY DUTTA"
  dgDeclarantStatus?: string; // e.g. "EXPORT MANAGER"
  dgDeclarationPlaceAndDate?: string; // e.g. "MUMBAI / 07.10.2026"
  emergencyContact?: string;
  emergencyContactName?: string; // e.g. "MR. SUJOY"
  emergencyContactPhone?: string;// e.g. "9729899131"
  unPackingCode?: string;     // e.g. "4G/Z 30/S/IND/K/19700134"
  segregationGroup?: string;  // e.g. "SGG1"
  emsNumber?: string;         // e.g. "F-A-S-B"
  haulierName?: string;
  vehicleRegNo?: string;
  signatoryName?: string;
  signatoryTitle?: string;
  
  // Financial
  currency: string;
  exchangeRate: number;
  incoterm: 'FOB' | 'CIF' | 'CFR' | 'EXW';
  subtotal?: number;
  gstAmount?: number;
  invoiceTotal: number;
  
  // Manifest Totals & Multi-Tier Packaging Hierarchy
  grossWeightKg: number;
  netWeightKg: number;
  totalPackages: number;      // Inner package count (e.g. 676 boxes)
  packageType: string;        // "BOX" / "CARTON"
  totalPallets: number;       // Outer packaging count (e.g. 22 pallets)
  totalOuterPackages?: number;// e.g. 22
  outerPackageType?: string;  // "PALLET" / "CRATE"
  totalInnerPackages?: number;// e.g. 676
  innerPackageType?: string;  // "CORRUGATED BOX"
  totalBaseUnits?: number;    // Base pieces count
  hasDangerousGoods: boolean;
  
  // Field-Level Traceability & Provenance (Global SaaS Engine)
  fieldTraceability?: Record<string, FieldTraceability>;
  
  // Template Selections
  selectedBolTemplateId: string;
  selectedDgTemplateId: string;
  
  // Multi-Container & Pallet Allocations
  containers: ContainerAllocation[];
  pallets: Pallet[];
  lineItems: LineItem[];
  
  // Generated Documents Cache
  generatedDocuments?: DocumentOutput[];
  
  // PDF Preview
  pdfUrl?: string;
}

export type DocumentStatus = 'pending' | 'processing' | 'processed' | 'failed';

export interface AppDocument {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  status: DocumentStatus;
  errorMessage?: string;
  file?: File;
  pdfUrl?: string;
  previewHtml?: string;
  invoice?: ConvertedInvoice;
}

export interface ExporterProfile {
  id: string;
  companyName: string;
  iec: string;
  gstin: string;
  adCode: string;
  defaultPort: string;
}

export interface FieldTraceability<T = any> {
  value: T;
  sourceDoc?: string;         // e.g. "CHW000165B.xlsx"
  sourceSheet?: string;       // e.g. "0232_INV", "0232_PKG", "HPFL NEWARK"
  sourceAnchor?: string;      // e.g. "Exporter", "Invoice No", "Pallet Nos"
  confidence: number;         // 0.0 - 1.0 confidence score
  isUserOverride?: boolean;   // true if edited by operator in Manifest Bar
}
