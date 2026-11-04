// Pre-saved Exporter / Shipper Profiles & Initial Sample Converted Shipment
// Multi-Container & HazMat Ocean Logistics System

import type { ConvertedInvoice, ExporterProfile, Pallet, ContainerAllocation } from '../types';

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

// Exide Industries Export Shipment to Myanmar (Booking MUMGA3747500 / Container ONEU2878769)
// 22 Pallets, 676 Boxes, S/B No. 7463800, UN 2794 Class 8 PG III Corrosive Batteries
export const MUMGA_22_PALLETS: Pallet[] = [
  // Range 4956 TO 4963 (8 pallets) - Invoice CHW000213
  { id: 'plt-4956', palletNumber: 'PLT-4956', packageCount: 51, packageType: 'BOX', grossWeightKg: 1159.75, netWeightKg: 1134.75, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDC7-DMX105D31R-W - Lead Acid Storage Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-chw213'] },
  { id: 'plt-4957', palletNumber: 'PLT-4957', packageCount: 34, packageType: 'BOX', grossWeightKg: 781.50, netWeightKg: 756.50, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDC7-DMX105D31R-W - Lead Acid Storage Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-chw213'] },
  { id: 'plt-4958', palletNumber: 'PLT-4958', packageCount: 51, packageType: 'BOX', grossWeightKg: 1159.75, netWeightKg: 1134.75, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDC7-DMX105D31R-W - Lead Acid Storage Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-chw213'] },
  { id: 'plt-4959', palletNumber: 'PLT-4959', packageCount: 34, packageType: 'BOX', grossWeightKg: 781.50, netWeightKg: 756.50, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDC7-DMX105D31R-W - Lead Acid Storage Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-chw213'] },
  { id: 'plt-4960', palletNumber: 'PLT-4960', packageCount: 51, packageType: 'BOX', grossWeightKg: 1159.75, netWeightKg: 1134.75, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDC7-DMX105D31R-W - Lead Acid Storage Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-chw213'] },
  { id: 'plt-4961', palletNumber: 'PLT-4961', packageCount: 34, packageType: 'BOX', grossWeightKg: 781.50, netWeightKg: 756.50, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDC7-DMX105D31R-W - Lead Acid Storage Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-chw213'] },
  { id: 'plt-4962', palletNumber: 'PLT-4962', packageCount: 51, packageType: 'BOX', grossWeightKg: 1159.75, netWeightKg: 1134.75, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDC7-DMX105D31R-W - Lead Acid Storage Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-chw213'] },
  { id: 'plt-4963', palletNumber: 'PLT-4963', packageCount: 51, packageType: 'BOX', grossWeightKg: 1159.75, netWeightKg: 1134.75, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDC7-DMX105D31R-W - Lead Acid Storage Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-chw213'] },

  // Range 4964 (1 pallet) - Invoice CHW000213A
  { id: 'plt-4964', palletNumber: 'PLT-4964', packageCount: 75, packageType: 'BOX', grossWeightKg: 1000.00, netWeightKg: 975.00, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDM0-DMADIN44L - Lead Acid Storage Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-chw213a'] },

  // Range 4533 TO 4546 (6 pallets) - Invoice CHW000165B
  { id: 'plt-4533', palletNumber: 'PLT-4533', packageCount: 5, packageType: 'BOX', grossWeightKg: 140.00, netWeightKg: 115.00, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDM0-DMA105D31L-BH - Lead Acid Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-chw165b'] },
  { id: 'plt-4535', palletNumber: 'PLT-4535', packageCount: 4, packageType: 'BOX', grossWeightKg: 117.00, netWeightKg: 92.00, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDM0-DMA105D31L-BH - Lead Acid Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-chw165b'] },
  { id: 'plt-4536', palletNumber: 'PLT-4536', packageCount: 5, packageType: 'BOX', grossWeightKg: 140.00, netWeightKg: 115.00, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDM0-DMA105D31L-BH - Lead Acid Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-chw165b'] },
  { id: 'plt-4538', palletNumber: 'PLT-4538', packageCount: 1, packageType: 'BOX', grossWeightKg: 38.00, netWeightKg: 13.00, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDM0-DMADIN44L - Lead Acid Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-chw165b'] },
  { id: 'plt-4540', palletNumber: 'PLT-4540', packageCount: 5, packageType: 'BOX', grossWeightKg: 90.00, netWeightKg: 65.00, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDM0-DMADIN44L - Lead Acid Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-chw165b'] },
  { id: 'plt-4546', palletNumber: 'PLT-4546', packageCount: 9, packageType: 'BOX', grossWeightKg: 177.10, netWeightKg: 152.10, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDM0-DMADIN60L - Lead Acid Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-chw165b'] },

  // Range TAL/1703/2026 TO TAL/1705/2026 (3 pallets) - Invoice TAL000172
  { id: 'plt-tal1703', palletNumber: 'TAL/1703/2026', packageCount: 32, packageType: 'BOX', grossWeightKg: 1287.28, netWeightKg: 1257.28, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDC7-DMXMF150 - Heavy Duty Storage Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-tal172'] },
  { id: 'plt-tal1704', palletNumber: 'TAL/1704/2026', packageCount: 32, packageType: 'BOX', grossWeightKg: 1287.28, netWeightKg: 1257.28, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDC7-DMXMF150 - Heavy Duty Storage Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-tal172'] },
  { id: 'plt-tal1705', palletNumber: 'TAL/1705/2026', packageCount: 31, packageType: 'BOX', grossWeightKg: 1247.99, netWeightKg: 1217.99, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDC7-DMXMF150 - Heavy Duty Storage Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-tal172'] },

  // Range TAL/1706/2026 TO TAL/1709/2026 (4 pallets) - Invoice TAL000172A
  { id: 'plt-tal1706', palletNumber: 'TAL/1706/2026', packageCount: 32, packageType: 'BOX', grossWeightKg: 1287.28, netWeightKg: 1257.28, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDM0-DMAMF150 - Heavy Duty Storage Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-tal172a'] },
  { id: 'plt-tal1707', palletNumber: 'TAL/1707/2026', packageCount: 32, packageType: 'BOX', grossWeightKg: 1287.28, netWeightKg: 1257.28, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDC7-DMXMF150 - Heavy Duty Storage Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-tal172a'] },
  { id: 'plt-tal1708', palletNumber: 'TAL/1708/2026', packageCount: 32, packageType: 'BOX', grossWeightKg: 1287.28, netWeightKg: 1257.28, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDC7-DMXMF150 - Heavy Duty Storage Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-tal172a'] },
  { id: 'plt-tal1709', palletNumber: 'TAL/1709/2026', packageCount: 24, packageType: 'BOX', grossWeightKg: 972.96, netWeightKg: 942.96, dimensions: '1200 x 1000 mm', footprintAreaMm2: 1200000, modelOrDescription: 'FDC7-DMXMF150 - Heavy Duty Storage Batteries', isDangerousGoods: true, imoClass: 'Class 8 (Corrosive)', unNumber: 'UN 2794', packingGroup: 'III', assignedContainerId: 'cont-oneu2878769', lineItemIds: ['item-tal172a'] }
];

const CONTAINER_ONEU2878769: ContainerAllocation = {
  id: 'cont-oneu2878769',
  containerNumber: 'ONEU2878769',
  sealNumber: 'IN2191248',
  containerType: '20GP',
  maxPayloadKg: 25000,
  maxPallets: 22,
  tareWeightKg: 2150,
  pallets: MUMGA_22_PALLETS,
  assignedPalletIds: MUMGA_22_PALLETS.map(p => p.id),
  totalGrossWeightKg: 18502.70,
  totalNetWeightKg: 17917.70,
  totalPackages: 676,
  totalPallets: 22,
  weightUtilizationPct: 74.0,
  palletUtilizationPct: 100,
  isOverweight: false,
  isOverCapacity: false,
  isSpillover: false,
  hasDangerousGoods: true
};

export const SHIPMENT_MUMGA3747500: ConvertedInvoice = {
  id: 'inv-mumga3747500',
  fileName: 'DG ONEU2878769.pdf',
  fileSize: 324500,
  convertedAt: 'Today, 04:30 PM',
  rawTimestamp: Date.now(),
  status: 'converted',
  invoiceNumber: 'CHW000213 / CHW000213A / CHW000165B / TAL000172 / TAL000172A',
  invoiceDate: '2026-10-07',
  bookingNumber: 'MUMGA3747500',
  masterBolNumber: 'BOL-ONE-MUMGA3747500',
  exporterName: 'EXIDE INDUSTRIES LIMITED',
  shipperAddress: 'Exide House, 59/E, Chowringhee Road, Kolkata - 700 020, West Bengal, India',
  iec: '0288001004',
  gstin: '19AAACE0650J1ZX',
  adCode: '0140029',
  consigneeName: 'YUNN POE SAN EAIN COMPANY LIMITED',
  consigneeAddress: 'No.(138), Si Pin Thar Yar Street, Nay Myint Quarter, Myitkyina, Kachin State, Myanmar 1011',
  notifyParty: 'YUNN POE SAN EAIN COMPANY LIMITED (SAME AS CONSIGNEE)',
  portOfLoading: 'Nhava Sheva (INNSA1)',
  portOfDischarge: 'Yangon, Myanmar (MMRGN)',
  destinationCountry: 'MM',
  vesselName: 'ONE HUMBER',
  voyageNumber: '106E',
  currency: 'USD',
  exchangeRate: 84.20,
  incoterm: 'FOB',
  subtotal: 51240.00,
  gstAmount: 0,
  invoiceTotal: 51240.00,
  grossWeightKg: 18502.70,
  netWeightKg: 17917.70,
  totalPackages: 676,
  packageType: 'BOX',
  totalPallets: 22,
  hasDangerousGoods: true,
  selectedBolTemplateId: 'bol-standard',
  selectedDgTemplateId: 'dg-imo-standard',
  containers: [CONTAINER_ONEU2878769],
  pallets: MUMGA_22_PALLETS,
  lineItems: [
    {
      id: 'item-chw213',
      itemNumber: 1,
      description: 'FDC7-DMX105D31R-W - Lead Acid Storage Batteries (S/B No. 7463800)',
      hsnCode: '85071000',
      quantity: 357,
      uqc: 'BOX',
      unitPrice: 78.50,
      total: 28024.50,
      grossWeightKg: 8143.50,
      netWeightKg: 7943.50,
      palletNumber: '4956 TO 4963 (8 Pallets)',
      containerNumber: 'ONEU2878769',
      isDangerousGood: true,
      imoClass: 'Class 8 (Corrosive)',
      unNumber: 'UN 2794',
      packingGroup: 'III',
      properShippingName: 'BATTERIES, WET, FILLED WITH ACID',
      emergencyContact: 'Mr. Sujoy Dutta (+91-9729899131)',
      emsNumber: 'F-A, S-B'
    },
    {
      id: 'item-chw213a',
      itemNumber: 2,
      description: 'FDM0-DMADIN44L - Lead Acid Storage Batteries (S/B No. 7463800)',
      hsnCode: '85071000',
      quantity: 75,
      uqc: 'BOX',
      unitPrice: 52.00,
      total: 3900.00,
      grossWeightKg: 1000.00,
      netWeightKg: 975.00,
      palletNumber: '4964 (1 Pallet)',
      containerNumber: 'ONEU2878769',
      isDangerousGood: true,
      imoClass: 'Class 8 (Corrosive)',
      unNumber: 'UN 2794',
      packingGroup: 'III',
      properShippingName: 'BATTERIES, WET, FILLED WITH ACID',
      emergencyContact: 'Mr. Sujoy Dutta (+91-9729899131)',
      emsNumber: 'F-A, S-B'
    },
    {
      id: 'item-chw165b',
      itemNumber: 3,
      description: 'FDM0-DMA105D31L-BH / DIN44L / DIN60L - Lead Acid Batteries (S/B No. 7463800)',
      hsnCode: '85071000',
      quantity: 29,
      uqc: 'BOX',
      unitPrice: 65.00,
      total: 1885.00,
      grossWeightKg: 702.10,
      netWeightKg: 552.10,
      palletNumber: '4533 TO 4546 (6 Pallets)',
      containerNumber: 'ONEU2878769',
      isDangerousGood: true,
      imoClass: 'Class 8 (Corrosive)',
      unNumber: 'UN 2794',
      packingGroup: 'III',
      properShippingName: 'BATTERIES, WET, FILLED WITH ACID',
      emergencyContact: 'Mr. Sujoy Dutta (+91-9729899131)',
      emsNumber: 'F-A, S-B'
    },
    {
      id: 'item-tal172',
      itemNumber: 4,
      description: 'FDC7-DMXMF150 - Heavy Duty Lead Acid Batteries (S/B No. 7463800)',
      hsnCode: '85071000',
      quantity: 95,
      uqc: 'BOX',
      unitPrice: 92.00,
      total: 8740.00,
      grossWeightKg: 3822.55,
      netWeightKg: 3732.55,
      palletNumber: 'TAL/1703/2026 TO TAL/1705/2026 (3 Pallets)',
      containerNumber: 'ONEU2878769',
      isDangerousGood: true,
      imoClass: 'Class 8 (Corrosive)',
      unNumber: 'UN 2794',
      packingGroup: 'III',
      properShippingName: 'BATTERIES, WET, FILLED WITH ACID',
      emergencyContact: 'Mr. Sujoy Dutta (+91-9729899131)',
      emsNumber: 'F-A, S-B'
    },
    {
      id: 'item-tal172a',
      itemNumber: 5,
      description: 'FDM0-DMAMF150 / FDC7-DMXMF150 - Heavy Duty Batteries (S/B No. 7463800)',
      hsnCode: '85071000',
      quantity: 120,
      uqc: 'BOX',
      unitPrice: 72.42,
      total: 8690.50,
      grossWeightKg: 4834.80,
      netWeightKg: 4714.80,
      palletNumber: 'TAL/1706/2026 TO TAL/1709/2026 (4 Pallets)',
      containerNumber: 'ONEU2878769',
      isDangerousGood: true,
      imoClass: 'Class 8 (Corrosive)',
      unNumber: 'UN 2794',
      packingGroup: 'III',
      properShippingName: 'BATTERIES, WET, FILLED WITH ACID',
      emergencyContact: 'Mr. Sujoy Dutta (+91-9729899131)',
      emsNumber: 'F-A, S-B'
    }
  ]
};

// Set INITIAL_SAMPLE_INVOICE to SHIPMENT_MUMGA3747500
export const INITIAL_SAMPLE_INVOICE: ConvertedInvoice = SHIPMENT_MUMGA3747500;
