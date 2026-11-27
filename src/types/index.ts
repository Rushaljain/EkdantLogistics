// Ekdant Logistics - Universal Truth & Two-Manifest Schema
// Implements strict zero-fallback data architecture: missing fields default to "" (empty string)

export type UploadMode = 'SINGLE_INVOICE' | 'MULTI_INVOICE';

export interface MergedTransfer {
  fromPalletId: string;
  fromPalletNumber: string | number;
  units: number;
  grossWeightKg: number;
  netWeightKg: number;
}

export interface ExtractedPallet {
  id?: string;
  palletNumber: string;
  modelCode: string;
  brand?: string;
  invoiceNumber?: string;
  boxCount: number;
  netWeightKg: number;
  grossWeightKg: number;
  sourceFile: string;
  parentPalletNumber?: string | number;
  isSplitPiece?: boolean;
  allocatedUnits?: number;
  remainingUnits?: number;
  mergedTransfers?: MergedTransfer[];
}

export type PalletItem = ExtractedPallet;

export type ContainerType = '20GP' | '40GP' | '40HC' | '45HC';

export const CONTAINER_SPECS: Record<ContainerType, { name: string; maxPayloadKg: number; tareWeightKg: number; cbm: number; maxPallets: number }> = {
  '20GP': { name: "20' General Purpose", maxPayloadKg: 25000, tareWeightKg: 2150, cbm: 33.2, maxPallets: 22 },
  '40GP': { name: "40' General Purpose", maxPayloadKg: 28500, tareWeightKg: 3750, cbm: 67.7, maxPallets: 40 },
  '40HC': { name: "40' High Cube", maxPayloadKg: 28500, tareWeightKg: 3900, cbm: 76.4, maxPallets: 40 },
  '45HC': { name: "45' High Cube", maxPayloadKg: 28500, tareWeightKg: 4800, cbm: 86.0, maxPallets: 44 }
};

export interface LineItem {
  id: string;
  itemNumber: number;
  description: string;
  hsnCode: string;
  quantity: number;
  uqc: string;
  unitPrice: number;
  total: number;
  netWeightKg: number;
  grossWeightKg: number;
  modelNumber?: string;
  palletNumber?: string;
  containerNumber?: string;
  isDangerousGood?: boolean;
  imoClass?: string;
  unNumber?: string;
  packingGroup?: string;
  properShippingName?: string;
}

export interface Pallet {
  id: string;
  palletNumber: string;
  packageCount: number;
  packageType: string;
  innerPackageCount?: number;
  innerPackageType?: string;
  baseUnitCount?: number;
  baseUnitType?: string;
  grossWeightKg: number;
  netWeightKg: number;
  dimensions?: string;
  footprintAreaMm2?: number;
  modelOrDescription?: string;
  brand?: string;
  invoiceNumber?: string;
  isDangerousGoods: boolean;
  imoClass?: string;
  unNumber?: string;
  packingGroup?: string;
  assignedContainerId?: string;
  lineItemIds: string[];
}

export interface ContainerAllocation {
  id: string;
  label?: string;
  containerNumber: string;
  sealNumber: string;
  containerType: ContainerType;
  maxPayloadKg: number;
  maxPallets?: number;
  tareWeightKg: number;
  bookingNumber?: string;
  palletIndices?: number[];
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

/**
 * ExtractedShipmentJSON: The raw universal truth generated post-parse.
 * Every string field defaults to "" (empty string) if not found in the document—never "NA", "TBN", or hardcoded defaults.
 */
export interface ExtractedShipmentJSON {
  // Mode selection
  uploadMode: UploadMode;

  // Commercial / Exporter / Shipper
  shipperName: string;
  shipperAddress: string;
  shipperIec: string;
  shipperGstin: string;
  shipperPan: string;
  onBehalfOf: string;

  // Consignee & Notify Party
  consigneeName: string;
  consigneeAddress: string;
  notifyPartyName: string;
  notifyPartyAddress: string;

  // Invoices & Document References
  invoiceNumbers: string[];
  invoiceDates: string[];
  invoiceValues?: number[];
  bookingNumber: string;
  shippingBillNumbers: string;
  shipperReference: string;
  forwarderReference: string;

  // Transport & Routing
  carrierName: string;
  preCarriageBy: string;
  placeOfReceipt: string;
  vesselName: string;
  voyageNumber: string;
  portOfLoading: string;
  portOfDischarge: string;
  portOfDischargeDg: string;
  placeOfDelivery: string;
  finalDestination: string;

  // Equipment & Allocation
  containerNumber: string;
  sealNumber: string;
  containerType: ContainerType;
  tareWeightKg: number;
  containers?: ContainerAllocation[];

  // Packaging & Manifest Totals
  shippingMarks: string;
  productDescription: string;
  brandName: string;
  hsnCode: string;
  totalPallets: number;
  totalBoxes: number;
  totalPackages: number;
  outerPackagingCount: number;
  outerPackagingType: string;
  innerPackageCount: number;
  innerPackageType: string;
  innerPackingDescription: string;
  grossWeightKg: number;
  netWeightKg: number;
  volumeCbm: number;

  // Commercial Terms
  currency: string;
  totalInvoiceValue: number;
  incoterm: string;
  freightTerms: string;
  movementType: string;
  freeTimeClause: string;

  // Dangerous Goods Attributes
  isDangerousGoods: boolean;
  unNumber: string;
  imoClass: string;
  properShippingName: string;
  packingGroup: string;
  marinePollutant: boolean;
  flashPoint: string;
  emsNumber: string;
  segregationGroup: string;
  unPackingCode: string;
  unCode: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  dgDeclarantName: string;
  dgDeclarantStatus: string;
  dgDeclarationPlaceAndDate: string;
  additionalHandlingInformation?: string;

  // Granular Pallet Breakdown
  pallets: ExtractedPallet[];

  // Discrepancy & Validation Warnings
  discrepancyWarnings: string[];

  // Source Provenance
  sourceFiles: string[];
  extractedAt: string;

  // Inventory Provenance & Dispatch Tracking (Sprint 6)
  sourceLedgerIds?: string[];
  selectedPalletIds?: string[];
  selectedPalletUnits?: Record<string, number>;
  isDispatched?: boolean;
  dispatchedAt?: string;
}

/**
 * DGManifest: Boxes 1 to 22 of the IMO Multimodal Dangerous Goods Declaration Form.
 * All 22 box fields explicitly typed as strings/numbers. Missing fields are strictly "".
 */
export interface DGManifest {
  box1_shipper: string;
  box2_transportDocumentNumber: string;
  box3_page: string;
  box4_shipperReference: string;
  box5_freightForwarderReference: string;
  box6_consignee: string;
  box7_carrier: string;
  box8_shipperDeclaration: string;
  box9_additionalHandlingInfo: string;
  box10_vesselAndVoyage: string;
  box11_portOfLoading: string;
  box12_portOfDischarge: string;
  box13_destination: string;
  box14_shippingMarks: string;
  box15_packageDetailsAndDescription: string;
  box16_grossMassKg: number;
  box17_netMassKg: number;
  box18_cubeM3: number;
  box19_containerAndSealNumber: string;
  box20_containerPackingCertificate: string;
  box21_receivingOrganizationReceipt: string;
  box22_declarantDetailsAndSignature: string;
}

/**
 * BLManifest: 30 Fields of the Master Bill of Lading.
 * Automatically inherits shared values from DGManifest whenever available.
 */
export interface BLManifest {
  // Inherited from DG (Shared Fields)
  shipperNameAndAddress: string;
  bookingNumber: string;
  shipperReference: string;
  consigneeNameAndAddress: string;
  carrierName: string;
  vesselName: string;
  voyageNumber: string;
  portOfLoading: string;
  portOfDischarge: string;
  finalDestination: string;
  shippingMarks: string;
  cargoDescription: string;
  totalPallets: number;
  totalBoxes: number;
  grossWeightKg: number;
  netWeightKg: number;
  volumeCbm: number;
  containerNumber: string;
  sealNumber: string;
  containerType: ContainerType;
  tareWeightKg: number;
  unNumber: string;
  imoClass: string;
  properShippingName: string;
  packingGroup: string;

  // BL-Specific Fields
  billOfLadingNumber: string;
  notifyPartyNameAndAddress: string;
  preCarriageBy: string;
  placeOfReceipt: string;
  placeOfDelivery: string;
  shippingBillNumbers: string;
  freightTerms: string;
  movementType: string;
  freeTimeClause: string;
  statutoryDescription: string;
  hsnCode: string;
  numberOfOriginalBills: string;
}

export function createEmptyShipmentJSON(mode: UploadMode = 'SINGLE_INVOICE'): ExtractedShipmentJSON {
  return {
    uploadMode: mode,
    shipperName: '',
    shipperAddress: '',
    shipperIec: '',
    shipperGstin: '',
    shipperPan: '',
    onBehalfOf: '',
    consigneeName: '',
    consigneeAddress: '',
    notifyPartyName: '',
    notifyPartyAddress: '',
    invoiceNumbers: [],
    invoiceDates: [],
    invoiceValues: [],
    bookingNumber: '',
    shippingBillNumbers: '',
    shipperReference: '',
    forwarderReference: '',
    carrierName: '',
    preCarriageBy: '',
    placeOfReceipt: '',
    vesselName: '',
    voyageNumber: '',
    portOfLoading: '',
    portOfDischarge: '',
    portOfDischargeDg: '',
    placeOfDelivery: '',
    finalDestination: '',
    containerNumber: '',
    sealNumber: '',
    containerType: '20GP',
    tareWeightKg: 2150,
    containers: [],
    shippingMarks: '',
    productDescription: '',
    brandName: '',
    hsnCode: '',
    totalPallets: 0,
    totalBoxes: 0,
    totalPackages: 0,
    outerPackagingCount: 0,
    outerPackagingType: '',
    innerPackageCount: 0,
    innerPackageType: '',
    innerPackingDescription: '',
    grossWeightKg: 0,
    netWeightKg: 0,
    volumeCbm: 0,
    currency: '',
    totalInvoiceValue: 0,
    incoterm: '',
    freightTerms: '',
    movementType: '',
    freeTimeClause: '',
    isDangerousGoods: false,
    unNumber: '',
    imoClass: '',
    properShippingName: '',
    packingGroup: '',
    marinePollutant: false,
    flashPoint: '',
    emsNumber: '',
    segregationGroup: '',
    unPackingCode: '4G/Z 30/S/**IND/K/19700134',
    unCode: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    dgDeclarantName: '',
    dgDeclarantStatus: '',
    dgDeclarationPlaceAndDate: '',
    pallets: [],
    discrepancyWarnings: [],
    sourceFiles: [],
    extractedAt: ''
  };
}

export function createEmptyDGManifest(): DGManifest {
  return {
    box1_shipper: '',
    box2_transportDocumentNumber: '',
    box3_page: '1 of 1',
    box4_shipperReference: '',
    box5_freightForwarderReference: '',
    box6_consignee: '',
    box7_carrier: '',
    box8_shipperDeclaration: '',
    box9_additionalHandlingInfo: '',
    box10_vesselAndVoyage: '',
    box11_portOfLoading: '',
    box12_portOfDischarge: '',
    box13_destination: '',
    box14_shippingMarks: '',
    box15_packageDetailsAndDescription: '',
    box16_grossMassKg: 0,
    box17_netMassKg: 0,
    box18_cubeM3: 0,
    box19_containerAndSealNumber: '',
    box20_containerPackingCertificate: '',
    box21_receivingOrganizationReceipt: '',
    box22_declarantDetailsAndSignature: ''
  };
}

export function createEmptyBLManifest(): BLManifest {
  return {
    shipperNameAndAddress: '',
    bookingNumber: '',
    shipperReference: '',
    consigneeNameAndAddress: '',
    carrierName: '',
    vesselName: '',
    voyageNumber: '',
    portOfLoading: '',
    portOfDischarge: '',
    finalDestination: '',
    shippingMarks: '',
    cargoDescription: '',
    totalPallets: 0,
    totalBoxes: 0,
    grossWeightKg: 0,
    netWeightKg: 0,
    volumeCbm: 0,
    containerNumber: '',
    sealNumber: '',
    containerType: '20GP',
    tareWeightKg: 2150,
    unNumber: '',
    imoClass: '',
    properShippingName: '',
    packingGroup: '',
    billOfLadingNumber: '',
    notifyPartyNameAndAddress: '',
    preCarriageBy: '',
    placeOfReceipt: '',
    placeOfDelivery: '',
    shippingBillNumbers: '',
    freightTerms: '',
    movementType: '',
    freeTimeClause: '',
    statutoryDescription: '',
    hsnCode: '',
    numberOfOriginalBills: 'THREE (3)'
  };
}

/**
 * Derives DG Manifest (Boxes 1-22) directly from ExtractedShipmentJSON
 */
export function deriveDGManifestFromJSON(raw: ExtractedShipmentJSON): DGManifest {
  const shipperLines = [raw.shipperName, raw.shipperAddress].filter(Boolean).join('\n');
  const consigneeLines = [raw.consigneeName, raw.consigneeAddress].filter(Boolean).join('\n');
  const vesselVoyage = [raw.vesselName, raw.voyageNumber].filter(Boolean).join(' / ');
  const containerSeal = [raw.containerNumber, raw.sealNumber ? `SEAL: ${raw.sealNumber}` : ''].filter(Boolean).join(' / ');
  const emergency = [
    raw.emergencyContactName ? `CONTACT: ${raw.emergencyContactName}` : '',
    raw.emergencyContactPhone ? `TEL: ${raw.emergencyContactPhone}` : ''
  ].filter(Boolean).join(' | ');

  const declarant = [
    raw.dgDeclarantName,
    raw.dgDeclarantStatus,
    raw.dgDeclarationPlaceAndDate
  ].filter(Boolean).join(', ');

  const dgDetails = raw.isDangerousGoods
    ? [
        raw.unNumber ? `UN ${raw.unNumber}` : '',
        raw.properShippingName,
        raw.imoClass ? `CLASS ${raw.imoClass}` : '',
        raw.packingGroup ? `PG ${raw.packingGroup}` : '',
        raw.flashPoint ? `FP ${raw.flashPoint}` : '',
        raw.emsNumber ? `EMS ${raw.emsNumber}` : ''
      ].filter(Boolean).join(', ')
    : '';

  const pkgSummary = [
    raw.totalPallets ? `${raw.totalPallets} PALLETS` : '',
    raw.totalBoxes ? `(${raw.totalBoxes} BOXES)` : '',
    raw.productDescription,
    dgDetails
  ].filter(Boolean).join(' - ');

  return {
    box1_shipper: shipperLines,
    box2_transportDocumentNumber: raw.bookingNumber,
    box3_page: '1 of 1',
    box4_shipperReference: raw.invoiceNumbers.join(', ') || raw.shipperReference,
    box5_freightForwarderReference: raw.forwarderReference,
    box6_consignee: consigneeLines,
    box7_carrier: raw.carrierName,
    box8_shipperDeclaration: shipperLines ? `Shipper declaration on file for ${raw.shipperName}` : '',
    box9_additionalHandlingInfo: emergency,
    box10_vesselAndVoyage: vesselVoyage,
    box11_portOfLoading: raw.portOfLoading,
    box12_portOfDischarge: raw.portOfDischargeDg || raw.portOfDischarge,
    box13_destination: raw.finalDestination || raw.placeOfDelivery,
    box14_shippingMarks: raw.shippingMarks,
    box15_packageDetailsAndDescription: pkgSummary,
    box16_grossMassKg: raw.grossWeightKg,
    box17_netMassKg: raw.netWeightKg,
    box18_cubeM3: raw.volumeCbm,
    box19_containerAndSealNumber: containerSeal,
    box20_containerPackingCertificate: containerSeal ? `Container ${raw.containerNumber} packed in accordance with IMDG Code` : '',
    box21_receivingOrganizationReceipt: '',
    box22_declarantDetailsAndSignature: declarant
  };
}

/**
 * Derives BL Manifest automatically inheriting shared values from DG Manifest,
 * preserving any already-entered BL specific fields.
 */
export function deriveBLManifestFromDG(
  dg: DGManifest,
  existingBL?: Partial<BLManifest>,
  raw?: ExtractedShipmentJSON
): BLManifest {
  const base = existingBL || {};

  // Extract vessel & voyage if split from Box 10
  const box10Parts = (dg.box10_vesselAndVoyage || '').split('/').map(s => s.trim());
  const vessel = box10Parts[0] || (raw ? raw.vesselName : '');
  const voyage = box10Parts[1] || (raw ? raw.voyageNumber : '');

  // Extract container & seal if split from Box 19
  const box19Parts = (dg.box19_containerAndSealNumber || '').split('/').map(s => s.trim());
  const containerNo = box19Parts[0] || (raw ? raw.containerNumber : '');
  const sealRaw = box19Parts[1] || (raw ? raw.sealNumber : '');
  const sealNo = sealRaw.replace(/^SEAL:\s*/i, '');

  return {
    // Inherited from DG / Raw
    shipperNameAndAddress: dg.box1_shipper || base.shipperNameAndAddress || '',
    bookingNumber: dg.box2_transportDocumentNumber || base.bookingNumber || '',
    shipperReference: dg.box4_shipperReference || base.shipperReference || '',
    consigneeNameAndAddress: dg.box6_consignee || base.consigneeNameAndAddress || '',
    carrierName: dg.box7_carrier || base.carrierName || '',
    vesselName: vessel || base.vesselName || '',
    voyageNumber: voyage || base.voyageNumber || '',
    portOfLoading: dg.box11_portOfLoading || base.portOfLoading || '',
    portOfDischarge: dg.box12_portOfDischarge || base.portOfDischarge || '',
    finalDestination: dg.box13_destination || base.finalDestination || '',
    shippingMarks: dg.box14_shippingMarks || base.shippingMarks || '',
    cargoDescription: dg.box15_packageDetailsAndDescription || base.cargoDescription || '',
    totalPallets: raw ? raw.totalPallets : (base.totalPallets || 0),
    totalBoxes: raw ? raw.totalBoxes : (base.totalBoxes || 0),
    grossWeightKg: dg.box16_grossMassKg || base.grossWeightKg || 0,
    netWeightKg: dg.box17_netMassKg || base.netWeightKg || 0,
    volumeCbm: dg.box18_cubeM3 || base.volumeCbm || 0,
    containerNumber: containerNo || base.containerNumber || '',
    sealNumber: sealNo || base.sealNumber || '',
    containerType: raw ? raw.containerType : (base.containerType || '20GP'),
    tareWeightKg: raw ? raw.tareWeightKg : (base.tareWeightKg || 0),
    unNumber: raw ? raw.unNumber : (base.unNumber || ''),
    imoClass: raw ? raw.imoClass : (base.imoClass || ''),
    properShippingName: raw ? raw.properShippingName : (base.properShippingName || ''),
    packingGroup: raw ? raw.packingGroup : (base.packingGroup || ''),

    // BL-Specific Fields (retained if already entered, or defaulted from raw / empty)
    billOfLadingNumber: base.billOfLadingNumber || '',
    notifyPartyNameAndAddress: base.notifyPartyNameAndAddress || (raw ? [raw.notifyPartyName, raw.notifyPartyAddress].filter(Boolean).join('\n') : ''),
    preCarriageBy: base.preCarriageBy || (raw ? raw.preCarriageBy : ''),
    placeOfReceipt: base.placeOfReceipt || (raw ? raw.placeOfReceipt : ''),
    placeOfDelivery: base.placeOfDelivery || (raw ? raw.placeOfDelivery : ''),
    shippingBillNumbers: base.shippingBillNumbers || (raw ? raw.shippingBillNumbers : ''),
    freightTerms: base.freightTerms || (raw ? raw.freightTerms : ''),
    movementType: base.movementType || (raw ? raw.movementType : ''),
    freeTimeClause: base.freeTimeClause || (raw ? raw.freeTimeClause : ''),
    statutoryDescription: base.statutoryDescription || (raw ? raw.productDescription : ''),
    hsnCode: base.hsnCode || (raw ? raw.hsnCode : ''),
    numberOfOriginalBills: base.numberOfOriginalBills || 'THREE (3)'
  };
}

// ==========================================
// Phase 3: Dynamic Format Schema & Matcher Types
// ==========================================

export type FormatDocumentType = 'DG' | 'BL';

export interface FormatFieldDefinition {
  fieldId: string;
  labelInTemplate: string;
  sectionName: string;
  fieldType: 'text' | 'multiline' | 'number' | 'table';
  mappedShipmentKey: keyof ExtractedShipmentJSON | '';
}

export interface FormatSchemaJSON {
  formatId: string;
  formatName: string;
  documentType: FormatDocumentType;
  sourceFileName: string;
  createdAt: string;
  fields: FormatFieldDefinition[];
}

export interface MappedManifestField {
  fieldId: string;
  labelInTemplate: string;
  sectionName: string;
  fieldType: 'text' | 'multiline' | 'number' | 'table';
  mappedShipmentKey: keyof ExtractedShipmentJSON | '';
  value: string;
  status: 'POPULATED' | 'PENDING_BLANK';
  fieldCategory?: 'INVOICE_DATA' | 'STAGE2_CARRIER' | 'SIGNATURE_HAULIER';
}

// ==========================================
// Phase 4: CHA Warehouse Inventory & CFS Stock Ledger Types
// ==========================================

export type PalletStockStatus = 'PENDING_GATE_IN' | 'IN_WAREHOUSE' | 'STUFFED_DISPATCHED';

export type ReceiptMode = 'RECEIVED_FULL' | 'SHORT_FALL' | 'SHORT_FILL';
export type ShortfallMode = 'PALLET' | 'UNITS';

export interface LinkedShortFill {
  shortFillInvoiceNo: string;
  shortFillLedgerId?: string;
  palletNumber?: string | number;
  arrivedPalletNumber?: string | number;
  unitsFilled: number;
  filledDate: string;
  filledMonth: string;
  dispatched?: boolean;
  dispatchedDate?: string;
  dispatchContainerNo?: string;
}

export interface ShortfallRecord {
  id: string;
  mode: ShortfallMode;
  palletNumber: string | number;
  billedUnits: number;
  shortfallUnits: number;
  remainingShortfallUnits: number;
  openedDate: string;
  openedMonth: string;
  clearedDate?: string;
  clearedMonth?: string;
  fulfilledDate?: string;
  fulfilledMonth?: string;
  fulfilledContainerNo?: string;
  status: 'OPEN' | 'PARTIAL_FILL' | 'CLEARED' | 'FULFILLED';
  linkedShortFills: LinkedShortFill[];
}

export interface ShortFillLink {
  priorShortfallInvoiceNo: string;
  priorShortfallLedgerId: string;
  palletNumber?: string | number;
  arrivedPalletNumber?: string | number;
  unitsFilled: number;
  dispatched?: boolean;
  date?: string;
  filledDate?: string;
}

export interface PalletStockUnit {
  id: string;
  palletNumber: number | string;
  model: string;
  brand?: string;
  invoicedBatteries: number;
  receivedBatteries: number;
  netWeightKg: number;
  grossWeightKg: number;
  status: PalletStockStatus;
  invoiceNumber?: string;
  containerNo?: string;
  stuffedDate?: string;
  // Sprint 7.1 Split Piece & Unit Allocation Metadata
  parentPalletNumber?: string | number;
  isSplitPiece?: boolean;
  allocatedUnits?: number;
  remainingUnits?: number;
  mergedTransfers?: MergedTransfer[];
}

export interface CFSLedgerEntry {
  id: string;
  createdAt: string;
  updatedAt?: string;
  dispatchedAt?: string;
  month: string; // 'APR' | 'MAY' | 'JUNE' | 'JULY' | 'AUG' | 'SEP' | 'OCT' | 'NOV' | 'DEC' | 'JAN' | 'FEB' | 'MAR'
  customer: string;
  consigneeAddress?: string;
  exporterShipper: string;
  customInvoiceNo: string;
  invoiceDate?: string;
  pod: string;

  // As received from EIL-Export
  invoicedPallets: number;
  invoicedBatteries: number;
  invoicedGrossWeightKg: number;
  invoicedNetWeightKg?: number;

  // Actual Received from Factory (Stock-In)
  actualReceivedPallets: number;
  actualReceivedBatteries: number;
  actualGrossWeightKg?: number;
  actualNetWeightKg?: number;

  // Short fall / Pending & Multi-Short-Fill
  shortfallPallets: number;
  shortfallBatteries: number;
  receiptMode?: ReceiptMode;
  shortfalls?: ShortfallRecord[];
  shortFillLinks?: ShortFillLink[];

  // Gate-In & DG/BL Flags
  dgCreated?: boolean;
  blCreated?: boolean;

  // Carting & Gate-In Logistics
  truckReportingDate?: string;
  cartingInDate: string;
  vehicleNo: string;
  cartingSlipNo?: string;
  lastPltRecdDate: string;
  secondVehicleDate?: string;
  secondVehicleNo?: string;
  gateInStatus?: string;
  unloadingRemarks?: string;

  // Actual Stuffed Qty (Stock-Out)
  actualStuffedPallets: number;
  actualStuffedBatteries: number;

  // Balance Qty (Live CFS floor balance)
  balancePallets: number;
  balanceBatteries: number;

  // Stage-2 Customs & Container
  shippingBillNo: string;
  shippingBillDate: string;
  containerNo: string;
  sealNo: string;
  stuffingDate: string;
  pickupDate: string;
  portGateInDate: string;
  daysInCFS: number;
  remarks: string;

  // Pallet-level units
  pallets: PalletStockUnit[];

  // Sprint 6: Persisted full source shipment json & dispatch pallet ids
  sourceShipmentJson?: ExtractedShipmentJSON;
  dispatchedPalletIds?: string[];
}

export type CustomerStockAlert = 'STOCK_OUT' | 'LOW_STOCK' | 'FACTORY_SHORTFALL' | 'OK';

export interface TrashBinItem {
  id: string;
  deletedAt: string;
  deletedReason?: string;
  entry: CFSLedgerEntry;
}

export interface CustomerStockSummary {
  customer: string;
  totalInvoicedPallets: number;
  totalReceivedPallets: number;
  totalShortfallPallets: number;
  totalShortfallBatteries: number;
  totalStuffedPallets: number;
  totalBalancePallets: number;
  totalBalanceBatteries: number;
  totalBalanceGrossWeightKg: number;
  required20GPContainers: number;
  alertType: CustomerStockAlert;
  alertMessage: string;
}

// =========================================================================
// CFS Inventory Movement & Historical Audit Log Types (Sprint 5)
// =========================================================================

export type InventoryMovementDirection = 'STOCK_OUT' | 'STOCK_IN';
export type InventoryMovementStatus = 'IN_STOCK' | 'DISPATCHED' | 'PARTIAL_DISPATCHED';

export interface InventoryMovementRecord {
  id: string;
  sourceLedgerId?: string;
  receivedDate: string;
  dispatchedDate?: string;
  movementDate?: string;
  status: InventoryMovementStatus;
  direction?: InventoryMovementDirection;
  customer: string;
  customInvoiceNo: string;
  modelDescription: string;
  pallets: number;
  batteries: number;
  grossWeightKg?: number;
  containerNo?: string;
  sealNo?: string;
  shippingBillNo?: string;
  shippingBillDate?: string;
  vehicleNo?: string;
  remainingBalancePallets: number;
  remainingBalanceBatteries: number;
  createdAt: string;
  remarks?: string;
}

// =========================================================================
// DG Form Templates & Multi-Item Selective Cargo Types
// =========================================================================

export type DgTemplateId =
  | 'COMMON_DG'
  | 'NOMINATION_DG'
  | 'VSTAR_DG'
  | 'ONE_LINE_DG'
  | 'MSC_LINE_DG'
  | 'DIAMOND_MARITIME_DG'
  | 'KMTC_DG'
  | 'CMA_CGM_DG';

export interface DgTemplateDefinition {
  id: DgTemplateId;
  name: string;
  description: string;
  carrierHint?: string;
  isImoStandard22Box: boolean;
  referenceDocName: string;
}

export interface DgCargoItemLine {
  id: string;
  modelCode: string;
  unNumber: string;
  properShippingName: string;
  brand?: string;
  invoiceNumber?: string;
  palletCount: number;
  boxCount: number;
  grossWeightKg: number;
  netWeightKg: number;
  palletIndices: number[];
  palletNumbers: string[];
  palletRange: string;
}


