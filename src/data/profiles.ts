// Pre-saved Exporter Profiles & Initial Sample Converted Invoice
// Based on Indian Customs House Agent operational standards

import type { ConvertedInvoice, ExporterProfile } from '../types';

export const EXPORTER_PROFILES: ExporterProfile[] = [
  {
    id: 'exp-1',
    companyName: 'APEX ENGINEERING EXPORTS PVT LTD',
    iec: '0391048291',
    gstin: '27AAACA9921E1Z8',
    adCode: '0290041',
    defaultPort: 'INNSA1'
  },
  {
    id: 'exp-2',
    companyName: 'MAHARASHTRA PRECISION VALVES & FLANGES LLP',
    iec: '0385019284',
    gstin: '27AAOFM5512B1ZC',
    adCode: '0340118',
    defaultPort: 'INNSA1'
  },
  {
    id: 'exp-3',
    companyName: 'SAHYADRI PHARMACEUTICALS & LIFE SCIENCES LTD',
    iec: '0399003418',
    gstin: '27AABCS8891D1Z1',
    adCode: '0150092',
    defaultPort: 'INBOM4'
  }
];

export const INITIAL_SAMPLE_INVOICE: ConvertedInvoice = {
  id: 'inv-sample-089',
  fileName: 'Commercial_Invoice_AEE_089.pdf',
  fileSize: 248100,
  convertedAt: 'Today, 01:05 PM',
  rawTimestamp: Date.now() - 3600000,
  status: 'converted',
  filingType: 'EXPORT',
  invoiceNumber: 'EXP/2026/089',
  invoiceDate: '2026-10-26',
  esanchitIrn: '2026102700948215',
  exporterName: 'APEX ENGINEERING EXPORTS PVT LTD',
  iec: '0391048291',
  gstin: '27AAACA9921E1Z8',
  adCode: '0290041',
  consigneeName: 'PACIFIC OFFSHORE VALVE & PIPING INC',
  portOfLoading: 'INNSA1',
  portOfDischarge: 'DEHAM',
  destinationCountry: 'DE',
  currency: 'USD',
  exchangeRate: 84.15,
  incoterm: 'FOB',
  invoiceTotal: 38450.00,
  grossWeightKg: 4820.00,
  netWeightKg: 4450.00,
  totalPackages: 14,
  packageType: 'BOX',
  lineItems: [
    {
      id: 'item-1',
      itemNumber: 1,
      description: 'STAINLESS STEEL 316 HIGH PRESSURE GATE VALVES 2 INCH CLASS 800',
      hsnCode: '84818090',
      quantity: 120,
      uqc: 'NOS',
      unitPrice: 145.00,
      total: 17400.00
    },
    {
      id: 'item-2',
      itemNumber: 2,
      description: 'FORGED CARBON STEEL WELDED FLANGES ASTM A105 CLASS 300',
      hsnCode: '73079100',
      quantity: 250,
      uqc: 'NOS',
      unitPrice: 52.00,
      total: 13000.00
    },
    {
      id: 'item-3',
      itemNumber: 3,
      description: 'DUPLEX STAINLESS STEEL 2205 BALL VALVES 1 INCH 1000 WOG',
      hsnCode: '84818030',
      quantity: 73,
      uqc: 'NOS',
      unitPrice: 110.00,
      total: 8050.00
    }
  ]
};
