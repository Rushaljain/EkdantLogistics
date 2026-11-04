// Ekdant Logistics - Multi-Container & HazMat Document System Types
// Supports Multi-Invoice Ingestion, Weight/Pallet Segregation, #DG & Master BOL Generation

export type ContainerType = '20GP' | '40GP' | '40HC' | '45HC';

export const CONTAINER_SPECS: Record<ContainerType, { name: string; maxPayloadKg: number; tareWeightKg: number; cbm: number; maxPallets: number }> = {
  '20GP': { name: "20' General Purpose", maxPayloadKg: 25000, tareWeightKg: 2300, cbm: 33.2, maxPallets: 11 },
  '40GP': { name: "40' General Purpose", maxPayloadKg: 26500, tareWeightKg: 3750, cbm: 67.7, maxPallets: 24 },
  '40HC': { name: "40' High Cube", maxPayloadKg: 26500, tareWeightKg: 3900, cbm: 76.4, maxPallets: 24 },
  '45HC': { name: "45' High Cube", maxPayloadKg: 27800, tareWeightKg: 4800, cbm: 86.0, maxPallets: 26 }
};

export interface DangerousGoodsInfo {
  isDangerousGood: boolean;
  imoClass?: string;          // e.g. "Class 3 - Flammable Liquid", "Class 8 - Corrosives"
  unNumber?: string;          // e.g. "UN 1993", "UN 1263", "UN 3082"
  packingGroup?: 'I' | 'II' | 'III';
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
  palletNumber?: string;      // e.g. "PLT-5644"
  containerNumber?: string;   // e.g. "MSCU7829104"
}

export interface Pallet {
  id: string;
  palletNumber: string;       // e.g. "PLT-5644"
  packageCount: number;
  packageType: string;        // BOX, DRUM, CARTON, CRATE
  grossWeightKg: number;
  netWeightKg: number;
  dimensions?: string;        // e.g. "1200 x 1000 x 1650 mm"
  footprintAreaMm2?: number;  // Footprint tier area (e.g. 1200 * 1000)
  modelOrDescription?: string;// e.g. "EFB70-S95-D26L - Lead Acid Batteries"
  isDangerousGoods: boolean;
  imoClass?: string;
  unNumber?: string;
  packingGroup?: 'I' | 'II' | 'III';
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
  iec?: string;
  gstin?: string;
  adCode?: string;
  consigneeName: string;
  consigneeAddress?: string;
  notifyParty?: string;
  
  // Routing
  portOfLoading: string;      // e.g. "Nhava Sheva (INNSA1)"
  portOfDischarge: string;    // e.g. "Rotterdam (NLRTM)"
  destinationCountry: string; // 2-letter ISO (DE, US, NL, etc.)
  vesselName?: string;
  voyageNumber?: string;
  
  // Financial
  currency: string;
  exchangeRate: number;
  incoterm: 'FOB' | 'CIF' | 'CFR' | 'EXW';
  subtotal?: number;
  gstAmount?: number;
  invoiceTotal: number;
  
  // Manifest Totals
  grossWeightKg: number;
  netWeightKg: number;
  totalPackages: number;
  packageType: string;
  totalPallets: number;
  hasDangerousGoods: boolean;
  
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
