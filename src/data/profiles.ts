// Pre-saved Exporter / Shipper Profiles & Initial Sample Converted Shipment
// Multi-Container & HazMat Ocean Logistics System

import type { ConvertedInvoice, ExporterProfile } from '../types';

export const EXPORTER_PROFILES: ExporterProfile[] = [
  {
    id: 'exp-1',
    companyName: 'EXIDE INDUSTRIES LIMITED',
    iec: '0288001004',
    gstin: '19AAACE0650J1ZX',
    adCode: '0140029',
    defaultPort: 'Nhava Sheva (INNSA1)'
  },
  {
    id: 'exp-2',
    companyName: 'APEX ENGINEERING EXPORTS PVT LTD',
    iec: '0391048291',
    gstin: '27AAACA9921E1Z8',
    adCode: '0290041',
    defaultPort: 'Nhava Sheva (INNSA1)'
  },
  {
    id: 'exp-3',
    companyName: 'MAHARASHTRA PRECISION VALVES & FLANGES LLP',
    iec: '0385019284',
    gstin: '27AAOFM5512B1ZC',
    adCode: '0340118',
    defaultPort: 'Nhava Sheva (INNSA1)'
  },
  {
    id: 'exp-4',
    companyName: 'SAHYADRI CHEMICALS & LIFE SCIENCES LTD',
    iec: '0399003418',
    gstin: '27AABCS8891D1Z1',
    adCode: '0150092',
    defaultPort: 'Nhava Sheva (INNSA1)'
  }
];

// Helper to generate the 12 individual pallets (PLT-5644 to PLT-5655)
const SAMPLE_BATTERY_PALLETS = Array.from({ length: 12 }, (_, i) => {
  const serial = 5644 + i;
  const isCont1 = i < 11;
  return {
    id: `plt-${serial}`,
    palletNumber: `PLT-${serial}`,
    packageCount: 40,
    packageType: 'BOX' as const,
    grossWeightKg: 1885,
    netWeightKg: 1860,
    dimensions: '1200 x 1000 mm',
    footprintAreaMm2: 1200000,
    modelOrDescription: 'EFB70-S95-D26L - Lead Acid Batteries',
    isDangerousGoods: true,
    imoClass: 'Class 8 (Corrosive)',
    unNumber: 'UN 2794',
    packingGroup: 'III' as const,
    assignedContainerId: isCont1 ? 'cont-exide-1' : 'cont-exide-2',
    lineItemIds: ['item-chw-1']
  };
});

export const INITIAL_SAMPLE_INVOICE: ConvertedInvoice = {
  id: 'inv-sample-chw000263',
  fileName: 'CUSTOM INVOICE NEW(C) CHW000263.pdf',
  fileSize: 312400,
  convertedAt: 'Today, 02:30 PM',
  rawTimestamp: Date.now() - 3600000,
  status: 'converted',
  invoiceNumber: 'CHW000263',
  invoiceDate: '2026-10-28',
  bookingNumber: 'BKG-ONE-882190',
  masterBolNumber: 'BOL-EKD-CHW000263',
  exporterName: 'EXIDE INDUSTRIES LIMITED',
  shipperAddress: 'Plot 44, Bawal Industrial Area, Phase II, Rewari, Haryana / Exide House, Kolkata, India',
  iec: '0288001004',
  gstin: '19AAACE0650J1ZX',
  adCode: '0140029',
  consigneeName: 'SIME DARBY INDUSTRIAL SDN BHD',
  consigneeAddress: '1 Jalan Puchong, Taman Perindustrian Puchong Utama, 47100 Puchong, Selangor, Malaysia',
  notifyParty: 'SIME DARBY LOGISTICS SDN BHD (GLOBAL OCEAN DESK)',
  portOfLoading: 'Nhava Sheva (INNSA1)',
  portOfDischarge: 'Port Klang (MYPKG)',
  destinationCountry: 'MY',
  vesselName: 'ONE CONTINUITY',
  voyageNumber: '062E',
  currency: 'USD',
  exchangeRate: 84.20,
  incoterm: 'FOB',
  subtotal: 42800,
  gstAmount: 0,
  invoiceTotal: 42800,
  grossWeightKg: 22620,
  netWeightKg: 22320,
  totalPackages: 480,
  packageType: 'BOX',
  totalPallets: 12,
  hasDangerousGoods: true,
  selectedBolTemplateId: 'bol-standard',
  selectedDgTemplateId: 'dg-imo-standard',
  containers: [
    {
      id: 'cont-exide-1',
      containerNumber: 'TEMU2523270',
      sealNumber: 'EXD98201',
      containerType: '20GP',
      maxPayloadKg: 25000,
      maxPallets: 11,
      tareWeightKg: 2280,
      pallets: SAMPLE_BATTERY_PALLETS.slice(0, 11),
      assignedPalletIds: SAMPLE_BATTERY_PALLETS.slice(0, 11).map(p => p.id),
      totalGrossWeightKg: 20735,
      totalNetWeightKg: 20460,
      totalPackages: 440,
      weightUtilizationPct: 82.9,
      palletUtilizationPct: 100,
      isOverweight: false,
      isSpillover: false,
      hasDangerousGoods: true
    },
    {
      id: 'cont-exide-2',
      containerNumber: 'TEMU4198205',
      sealNumber: 'EXD98202',
      containerType: '20GP',
      maxPayloadKg: 25000,
      maxPallets: 11,
      tareWeightKg: 2280,
      pallets: SAMPLE_BATTERY_PALLETS.slice(11, 12),
      assignedPalletIds: SAMPLE_BATTERY_PALLETS.slice(11, 12).map(p => p.id),
      totalGrossWeightKg: 1885,
      totalNetWeightKg: 1860,
      totalPackages: 40,
      weightUtilizationPct: 7.5,
      palletUtilizationPct: 9.1,
      isOverweight: false,
      isSpillover: true,
      hasDangerousGoods: true
    }
  ],
  pallets: SAMPLE_BATTERY_PALLETS,
  lineItems: [
    {
      id: 'item-chw-1',
      itemNumber: 1,
      description: 'EFB70-S95-D26L - Lead Acid Storage Batteries (Electric Storage, Wet, Filled with Acid)',
      hsnCode: '85071000',
      quantity: 480,
      uqc: 'BOX',
      unitPrice: 89.17,
      total: 42800,
      grossWeightKg: 22620,
      netWeightKg: 22320,
      palletNumber: 'PLT-5644 to PLT-5655',
      containerNumber: 'TEMU2523270 / TEMU4198205',
      isDangerousGood: true,
      imoClass: 'Class 8 (Corrosive)',
      unNumber: 'UN 2794',
      packingGroup: 'III',
      properShippingName: 'BATTERIES, WET, FILLED WITH ACID, electric storage',
      emergencyContact: '+91 22 2724 8890 (Ekdant 24/7 HazMat Response)'
    }
  ]
};
