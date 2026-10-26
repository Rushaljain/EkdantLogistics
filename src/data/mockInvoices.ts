// Preloaded Authentic Indian Customs Invoices & Sample Datasets
// Modeled after real SAP/Tally exports cleared at JNPT (INNSA1) and Mumbai Air Cargo (INBOM4)

import type { ShipmentData } from '../types/customs';

// Sample 1: Nhava Sheva (INNSA1) Industrial Engineering Export
export const SAMPLE_SHIPMENT_NHAVA_SHEVA: ShipmentData = {
  id: 'shipment-innsa1-001',
  jobNo: 'EKD-2026-4091',
  shipmentType: 'EXPORT',
  portCode: 'INNSA1',
  customsHouse: 'Jawaharlal Nehru Customs House (JNPT / Nhava Sheva)',
  status: 'AUDIT_PENDING',
  exporter: {
    id: 'exp-1',
    companyName: 'APEX ENGINEERING EXPORTS PVT LTD',
    iec: '0391048291',
    gstin: '27AAACA9921E1Z8',
    adCode: '0290041',
    bankName: 'State Bank of India',
    branchCode: 'Commercial Branch Fort Mumbai',
    address: 'Plot 42, MIDC Industrial Area, Turbhe, Navi Mumbai, Maharashtra 400705',
    stateCode: '27',
    defaultPortCode: 'INNSA1'
  },
  invoice: {
    invoiceNo: 'AEE/EXP/2026/089',
    invoiceDate: '2026-10-24',
    currency: 'USD',
    exchangeRate: 86.50,
    incoterm: 'FOB',
    invoiceTotal: 48650.00,
    freightAmount: 0.00,
    insuranceAmount: 0.00,
    miscCharges: 0.00,
    consigneeName: 'PACIFIC OFFSHORE VALVE & PIPING INC',
    consigneeAddress: '8820 Gulf Freeway, Suite 400, Houston, TX 77017, USA',
    destinationCountry: 'US',
    portOfDischarge: 'USHOU',
    portOfLoading: 'INNSA1',
    eSanchitIrn: '2026INNSA1009841',
    eSanchitDrn: 'DRN88921004'
  },
  packages: {
    totalPackages: 18,
    packageType: 'BOX',
    grossWeightKg: 4650.00,
    netWeightKg: 4280.00,
    weightRulePassed: true
  },
  lineItems: [
    {
      id: 'item-101',
      itemNumber: 1,
      description: 'STAINLESS STEEL 316 HIGH PRESSURE GATE VALVES 2 INCH CLASS 800',
      hsnCode: '84818090', // Exact 8 digits
      quantity: 120,
      uqc: 'PCS',
      originalUqc: 'Pieces',
      unitPrice: 145.00,
      itemTotalValue: 17400.00,
      calculatedTotal: 17400.00,
      isLineMathValid: true,
      isHsnValid: true,
      schemeCode: '19' // Drawback scheme
    },
    {
      id: 'item-102',
      itemNumber: 2,
      description: 'FORGED CARBON STEEL WELDED FLANGES ASTM A105 CLASS 300',
      hsnCode: '730791', // Truncated 6 digits to test ICEGATE 8-digit alert!
      quantity: 250,
      uqc: 'PCS',
      originalUqc: 'Numbers',
      unitPrice: 52.00,
      itemTotalValue: 13000.00,
      calculatedTotal: 13000.00,
      isLineMathValid: true,
      isHsnValid: false,
      schemeCode: '19'
    },
    {
      id: 'item-103',
      itemNumber: 3,
      description: 'DUPLEX STAINLESS STEEL 2205 BALL VALVES 1 INCH 1000 WOG',
      hsnCode: '84818030',
      quantity: 85,
      uqc: 'PCS',
      originalUqc: 'Pcs',
      unitPrice: 110.00,
      itemTotalValue: 9350.00,
      calculatedTotal: 9350.00,
      isLineMathValid: true,
      isHsnValid: true,
      schemeCode: '19'
    },
    {
      id: 'item-104',
      itemNumber: 4,
      description: 'HEAVY HEX STRUCTURAL BOLTS AND NUTS GR B7/2H HOT DIP GALVANIZED',
      hsnCode: '73181500',
      quantity: 400,
      uqc: 'KGS',
      originalUqc: 'Kgs',
      unitPrice: 22.25,
      itemTotalValue: 8900.00,
      calculatedTotal: 8900.00,
      isLineMathValid: true,
      isHsnValid: true,
      schemeCode: '00'
    }
  ],
  auditReport: {
    isHeaderMathBalanced: true,
    headerMathDifference: 0.00,
    itemsSum: 48650.00,
    invoiceTotal: 48650.00,
    allHsnValid: false,
    invalidHsnCount: 1,
    allLineMathValid: true,
    invalidLineMathCount: 0,
    weightRulePassed: true,
    hasESanchitIrn: true,
    overallAuditPassed: false, // Fails due to 6-digit HSN on line 2
    errorMessages: ['Line 2: Truncated code (6 digits). ICEGATE mandates exact 8-digit RITC code. [Code: 730791]'],
    warningMessages: []
  },
  sourcePdf: {
    name: 'Apex_Engineering_Invoice_AEE_089.pdf',
    size: 248100,
    totalPages: 2
  }
};

// Sample 2: Mumbai Air Cargo (INBOM4) Pharma Air Shipment
export const SAMPLE_SHIPMENT_MUMBAI_AIR: ShipmentData = {
  id: 'shipment-inbom4-002',
  jobNo: 'EKD-2026-9214',
  shipmentType: 'EXPORT',
  portCode: 'INBOM4',
  customsHouse: 'Air Cargo Complex (Sahar, Mumbai - INBOM4)',
  status: 'AUDIT_PASSED',
  exporter: {
    id: 'exp-3',
    companyName: 'SAHYADRI PHARMACEUTICALS & LIFE SCIENCES LTD',
    iec: '0399003418',
    gstin: '27AABCS8891D1Z1',
    adCode: '0150092',
    bankName: 'HDFC Bank Ltd',
    branchCode: 'Sahar Cargo Complex Andheri',
    address: 'Unit 4-B, Seepz SEZ, Andheri East, Mumbai, Maharashtra 400096',
    stateCode: '27',
    defaultPortCode: 'INBOM4'
  },
  invoice: {
    invoiceNo: 'SPL/AIR/2026/142',
    invoiceDate: '2026-10-25',
    currency: 'EUR',
    exchangeRate: 94.20,
    incoterm: 'CIF',
    invoiceTotal: 84200.00,
    freightAmount: 3200.00,
    insuranceAmount: 450.00,
    miscCharges: 0.00,
    consigneeName: 'BAVARIA BIOTECH GMBH',
    consigneeAddress: 'Ludwig-Maximilians-Platz 14, 80333 Munich, Germany',
    destinationCountry: 'DE',
    portOfDischarge: 'DEMUC',
    portOfLoading: 'INBOM4',
    eSanchitIrn: '2026INBOM4001928',
    eSanchitDrn: 'DRN90014283'
  },
  packages: {
    totalPackages: 12,
    packageType: 'BOX',
    grossWeightKg: 420.50,
    netWeightKg: 385.00,
    weightRulePassed: true
  },
  lineItems: [
    {
      id: 'item-201',
      itemNumber: 1,
      description: 'PARACETAMOL IP/BP 500MG COMPRESSED TABLETS (BLISTER PACKS)',
      hsnCode: '30049060',
      quantity: 50000,
      uqc: 'PAC',
      originalUqc: 'Packs',
      unitPrice: 0.85,
      itemTotalValue: 42500.00,
      calculatedTotal: 42500.00,
      isLineMathValid: true,
      isHsnValid: true,
      schemeCode: '19'
    },
    {
      id: 'item-202',
      itemNumber: 2,
      description: 'AMOXICILLIN AND CLAVULANATE POTASSIUM STERILE ORAL SUSPENSION',
      hsnCode: '30041090',
      quantity: 12000,
      uqc: 'BOT',
      originalUqc: 'Bottles',
      unitPrice: 2.10,
      itemTotalValue: 25200.00,
      calculatedTotal: 25200.00,
      isLineMathValid: true,
      isHsnValid: true,
      schemeCode: '19'
    },
    {
      id: 'item-203',
      itemNumber: 3,
      description: 'AZITHROMYCIN 500MG FILM COATED FORMULATION TABLETS',
      hsnCode: '30042099',
      quantity: 8000,
      uqc: 'PAC',
      originalUqc: 'Packets',
      unitPrice: 1.60,
      itemTotalValue: 12850.00,
      calculatedTotal: 12800.00, // Small math drift to test line-level warning
      isLineMathValid: false,
      isHsnValid: true,
      schemeCode: '19'
    }
  ],
  auditReport: {
    isHeaderMathBalanced: true,
    headerMathDifference: 0.00,
    itemsSum: 80550.00,
    invoiceTotal: 84200.00, // Header total includes freight 3200 + ins 450
    allHsnValid: true,
    invalidHsnCount: 0,
    allLineMathValid: false,
    invalidLineMathCount: 1,
    weightRulePassed: true,
    hasESanchitIrn: true,
    overallAuditPassed: false,
    errorMessages: [],
    warningMessages: ['Line 3: Math Drift | Expected: 12800.00 vs Stated: 12850.00 (Diff: 50.00)']
  },
  sourcePdf: {
    name: 'Sahyadri_Pharma_Air_Invoice_SPL_142.pdf',
    size: 198000,
    totalPages: 1
  }
};

// Sample 3: High-Stress Math Drift & Weight Violation Case
export const SAMPLE_SHIPMENT_UNRECONCILED: ShipmentData = {
  id: 'shipment-drift-003',
  jobNo: 'EKD-2026-6619',
  shipmentType: 'EXPORT',
  portCode: 'INNSA1',
  customsHouse: 'Jawaharlal Nehru Customs House (JNPT / Nhava Sheva)',
  status: 'AUDIT_PENDING',
  exporter: {
    id: 'exp-2',
    companyName: 'MAHARASHTRA PRECISION VALVES & FLANGES LLP',
    iec: '0385019284',
    gstin: '27AAOFM5512B1ZC',
    adCode: '0340118',
    bankName: 'Bank of Baroda',
    branchCode: 'Nhava Sheva Port Branch',
    address: 'Survey No. 108, Uran Road, Dronagiri Node, Navi Mumbai, MH 400707',
    stateCode: '27',
    defaultPortCode: 'INNSA1'
  },
  invoice: {
    invoiceNo: 'MPV/EXP/2026/771',
    invoiceDate: '2026-10-26',
    currency: 'USD',
    exchangeRate: 86.50,
    incoterm: 'FOB',
    invoiceTotal: 29500.00, // Discrepancy with line items sum 29150.00
    freightAmount: 0.00,
    insuranceAmount: 0.00,
    miscCharges: 0.00,
    consigneeName: 'DUBAI INDUSTRIAL SUPPLY LLC',
    consigneeAddress: 'Plot 598-112, Jebel Ali Freezone South, Dubai, UAE',
    destinationCountry: 'AE',
    portOfDischarge: 'AEJEA',
    portOfLoading: 'INNSA1',
    eSanchitIrn: '', // Empty e-Sanchit IRN to test validation
    eSanchitDrn: ''
  },
  packages: {
    totalPackages: 15,
    packageType: 'CRATE',
    grossWeightKg: 1800.00,
    netWeightKg: 1950.00, // Gross < Net! Critical Customs Rule Violation
    weightRulePassed: false
  },
  lineItems: [
    {
      id: 'item-301',
      itemNumber: 1,
      description: 'CAST IRON GLOBE VALVES WITH HANDWHEEL FLANGED ENDS',
      hsnCode: '8481', // Truncated 4 digits!
      quantity: 50,
      uqc: 'BOX',
      originalUqc: 'Boxes',
      unitPrice: 180.00,
      itemTotalValue: 9000.00,
      calculatedTotal: 9000.00,
      isLineMathValid: true,
      isHsnValid: false,
      schemeCode: '00'
    },
    {
      id: 'item-302',
      itemNumber: 2,
      description: 'STAINLESS STEEL CHECK VALVES DUAL PLATE WAFER TYPE',
      hsnCode: '84813000',
      quantity: 75,
      uqc: 'PCS',
      originalUqc: 'Pieces',
      unitPrice: 150.00,
      itemTotalValue: 11250.00,
      calculatedTotal: 11250.00,
      isLineMathValid: true,
      isHsnValid: true,
      schemeCode: '19'
    },
    {
      id: 'item-303',
      itemNumber: 3,
      description: 'PRESSURE RELIEF VALVES BRONZE BODY 1/2 INCH NPT',
      hsnCode: '84814000',
      quantity: 110,
      uqc: 'PCS',
      originalUqc: 'Nos',
      unitPrice: 80.00,
      itemTotalValue: 8900.00, // Stated 8900 vs 110*80 = 8800
      calculatedTotal: 8800.00,
      isLineMathValid: false,
      isHsnValid: true,
      schemeCode: '00'
    }
  ],
  auditReport: {
    isHeaderMathBalanced: false,
    headerMathDifference: 350.00,
    itemsSum: 29150.00,
    invoiceTotal: 29500.00,
    allHsnValid: false,
    invalidHsnCount: 1,
    allLineMathValid: false,
    invalidLineMathCount: 1,
    weightRulePassed: false,
    hasESanchitIrn: false,
    overallAuditPassed: false,
    errorMessages: [
      'Line 1: Truncated code (4 digits). ICEGATE mandates exact 8-digit RITC code. [Code: 8481]',
      'Header Discrepancy: Sum of Line Items (29150.00 USD) does not balance with Invoice Total (29500.00 USD). Variance: 350.00 USD',
      'Critical Customs Rule Violation: Gross Weight (1800 kg) cannot be less than Net Weight (1950 kg). Indian Customs rejects physical container loading.'
    ],
    warningMessages: [
      'Line 3: Math Drift | Expected: 8800.00 vs Stated: 8900.00 (Diff: 100.00)',
      'e-Sanchit IRN Missing or Incomplete (0/16 chars). Required for digital Class-3 DSC supporting documents binding.'
    ]
  },
  sourcePdf: {
    name: 'Maharashtra_Valves_Unreconciled_771.pdf',
    size: 312000,
    totalPages: 1
  }
};

export const ALL_SAMPLE_SHIPMENTS: ShipmentData[] = [
  SAMPLE_SHIPMENT_NHAVA_SHEVA,
  SAMPLE_SHIPMENT_MUMBAI_AIR,
  SAMPLE_SHIPMENT_UNRECONCILED
];
