// Pre-saved Exporter / Shipper Profiles & Initial Sample Converted Shipment
// Multi-Container & HazMat Ocean Logistics System

import type { ConvertedInvoice, ExporterProfile } from '../types';

export const EXPORTER_PROFILES: ExporterProfile[] = [
  {
    id: 'exp-1',
    companyName: 'APEX ENGINEERING EXPORTS PVT LTD',
    iec: '0391048291',
    gstin: '27AAACA9921E1Z8',
    adCode: '0290041',
    defaultPort: 'Nhava Sheva (INNSA1)'
  },
  {
    id: 'exp-2',
    companyName: 'MAHARASHTRA PRECISION VALVES & FLANGES LLP',
    iec: '0385019284',
    gstin: '27AAOFM5512B1ZC',
    adCode: '0340118',
    defaultPort: 'Nhava Sheva (INNSA1)'
  },
  {
    id: 'exp-3',
    companyName: 'SAHYADRI CHEMICALS & LIFE SCIENCES LTD',
    iec: '0399003418',
    gstin: '27AABCS8891D1Z1',
    adCode: '0150092',
    defaultPort: 'Nhava Sheva (INNSA1)'
  }
];

export const INITIAL_SAMPLE_INVOICE: ConvertedInvoice = {
  id: 'inv-sample-089',
  fileName: 'Commercial_Invoice_AEE_089.pdf',
  fileSize: 248100,
  convertedAt: 'Today, 01:05 PM',
  rawTimestamp: Date.now() - 3600000,
  status: 'converted',
  invoiceNumber: 'EXP/2026/089',
  invoiceDate: '2026-10-26',
  bookingNumber: 'BKG-MSC-992014',
  masterBolNumber: 'BOL-EKD-EXP2026089',
  exporterName: 'APEX ENGINEERING EXPORTS PVT LTD',
  shipperAddress: 'Plot 44, Taloja MIDC, Navi Mumbai, MH 410208, India',
  iec: '0391048291',
  gstin: '27AAACA9921E1Z8',
  adCode: '0290041',
  consigneeName: 'PACIFIC OFFSHORE VALVE & PIPING INC',
  consigneeAddress: 'Havenlaan 102, 3000 Rotterdam, Netherlands',
  notifyParty: 'PACIFIC OFFSHORE LOGISTICS BV',
  portOfLoading: 'Nhava Sheva (INNSA1)',
  portOfDischarge: 'Rotterdam (NLRTM)',
  destinationCountry: 'NL',
  vesselName: 'MSC PALOMA',
  voyageNumber: '2642W',
  currency: 'USD',
  exchangeRate: 84.15,
  incoterm: 'FOB',
  subtotal: 18500,
  gstAmount: 0,
  invoiceTotal: 18500,
  grossWeightKg: 14800,
  netWeightKg: 13600,
  totalPackages: 120,
  packageType: 'BOX',
  totalPallets: 12,
  hasDangerousGoods: true,
  selectedBolTemplateId: 'bol-standard',
  selectedDgTemplateId: 'dg-imo-standard',
  containers: [
    {
      id: 'cont-demo-1',
      containerNumber: 'MSCU7829104',
      sealNumber: 'EMC883921',
      containerType: '40HC',
      maxPayloadKg: 26500,
      tareWeightKg: 3900,
      pallets: [
        {
          id: 'plt-demo-1',
          palletNumber: 'PLT-5644',
          packageCount: 30,
          packageType: 'BOX',
          grossWeightKg: 3700,
          netWeightKg: 3400,
          dimensions: '120 x 80 x 165 cm',
          isDangerousGoods: false,
          assignedContainerId: 'cont-demo-1',
          lineItemIds: ['item-1']
        },
        {
          id: 'plt-demo-2',
          palletNumber: 'PLT-5645',
          packageCount: 30,
          packageType: 'BOX',
          grossWeightKg: 3700,
          netWeightKg: 3400,
          dimensions: '120 x 80 x 165 cm',
          isDangerousGoods: false,
          assignedContainerId: 'cont-demo-1',
          lineItemIds: ['item-1']
        },
        {
          id: 'plt-demo-3',
          palletNumber: 'PLT-5646',
          packageCount: 30,
          packageType: 'DRUM',
          grossWeightKg: 3700,
          netWeightKg: 3400,
          dimensions: '120 x 80 x 165 cm',
          isDangerousGoods: true,
          assignedContainerId: 'cont-demo-1',
          lineItemIds: ['item-2']
        },
        {
          id: 'plt-demo-4',
          palletNumber: 'PLT-5647',
          packageCount: 30,
          packageType: 'DRUM',
          grossWeightKg: 3700,
          netWeightKg: 3400,
          dimensions: '120 x 80 x 165 cm',
          isDangerousGoods: true,
          assignedContainerId: 'cont-demo-1',
          lineItemIds: ['item-2']
        }
      ],
      assignedPalletIds: ['plt-demo-1', 'plt-demo-2', 'plt-demo-3', 'plt-demo-4'],
      totalGrossWeightKg: 14800,
      totalNetWeightKg: 13600,
      totalPackages: 120,
      isOverweight: false,
      hasDangerousGoods: true
    }
  ],
  pallets: [],
  lineItems: [
    {
      id: 'item-1',
      itemNumber: 1,
      description: 'Stainless Steel Flanged Ball Valves 2-Inch Class 150',
      hsnCode: '84818030',
      quantity: 60,
      uqc: 'BOX',
      unitPrice: 150,
      total: 9000,
      grossWeightKg: 7400,
      netWeightKg: 6800,
      palletNumber: 'PLT-5644',
      containerNumber: 'MSCU7829104',
      isDangerousGood: false
    },
    {
      id: 'item-2',
      itemNumber: 2,
      description: 'Industrial Cleaning Solvent & Surface Degreaser (Flammable Liquid)',
      hsnCode: '38140010',
      quantity: 60,
      uqc: 'DRUM',
      unitPrice: 158.33,
      total: 9500,
      grossWeightKg: 7400,
      netWeightKg: 6800,
      palletNumber: 'PLT-5646',
      containerNumber: 'MSCU7829104',
      isDangerousGood: true,
      imoClass: 'Class 3 (Flammable Liquid)',
      unNumber: 'UN 1993',
      packingGroup: 'II',
      properShippingName: 'FLAMMABLE LIQUID, N.O.S. (ETHANOL AND XYLENE SOLUTION)',
      flashPoint: '23°C c.c.',
      marinePollutant: false,
      emergencyContact: '+91 22 2724 8890 (Ekdant 24/7 HazMat)'
    }
  ]
};
