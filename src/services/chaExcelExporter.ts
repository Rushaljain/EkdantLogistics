// CHA Bulk-Import Spreadsheet Generator
// Mapped for 1-Click Import into Visual Impex and Softlink Logi-Sys customs software

import * as XLSX from 'xlsx';
import type { ShipmentData } from '../types/customs';

export function exportChaExcel(shipment: ShipmentData, targetSoftware: 'VISUAL_IMPEX' | 'SOFTLINK_LOGISYS' = 'SOFTLINK_LOGISYS'): void {
  const wb = XLSX.utils.book_new();

  // ----------------------------------------------------
  // SHEET 1: Line Items (Item Details)
  // ----------------------------------------------------
  const itemRows = shipment.lineItems.map((item, idx) => ({
    'Sr No': item.itemNumber || idx + 1,
    'Item Description': item.description,
    'HSN / RITC Code (8-Digit)': item.hsnCode.padEnd(8, '0').slice(0, 8),
    'Quantity': item.quantity,
    'UQC (ICEGATE)': item.uqc.toUpperCase(),
    'Unit Price': item.unitPrice,
    'Item Total Value': item.itemTotalValue,
    'Calculated Total': Number((item.quantity * item.unitPrice).toFixed(2)),
    'Variance': Number((Math.abs(item.itemTotalValue - (item.quantity * item.unitPrice))).toFixed(2)),
    'Currency': shipment.invoice.currency,
    'Export Scheme': item.schemeCode || '00',
    'e-Sanchit IRN': shipment.invoice.eSanchitIrn || ''
  }));

  const wsItems = XLSX.utils.json_to_sheet(itemRows);

  // Auto-width column calculation
  const colWidths = [
    { wch: 8 },  // Sr No
    { wch: 45 }, // Description
    { wch: 18 }, // HSN
    { wch: 12 }, // Qty
    { wch: 10 }, // UQC
    { wch: 14 }, // Unit Price
    { wch: 18 }, // Item Total
    { wch: 18 }, // Calc Total
    { wch: 12 }, // Variance
    { wch: 10 }, // Currency
    { wch: 14 }, // Scheme
    { wch: 22 }, // IRN
  ];
  wsItems['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, wsItems, 'LINE_ITEMS');

  // ----------------------------------------------------
  // SHEET 2: Invoice Header
  // ----------------------------------------------------
  const invoiceRows = [
    {
      'Invoice No': shipment.invoice.invoiceNo,
      'Invoice Date': shipment.invoice.invoiceDate,
      'Currency': shipment.invoice.currency,
      'Exchange Rate (INR)': shipment.invoice.exchangeRate,
      'Incoterms': shipment.invoice.incoterm,
      'Header Invoice Total': shipment.invoice.invoiceTotal,
      'Calculated Items Sum': Number(shipment.lineItems.reduce((acc, i) => acc + (i.itemTotalValue || 0), 0).toFixed(2)),
      'Freight': shipment.invoice.freightAmount || 0,
      'Insurance': shipment.invoice.insuranceAmount || 0,
      'Port of Loading': shipment.portCode,
      'Port of Discharge': shipment.invoice.portOfDischarge || 'USLAX',
      'Destination Country': shipment.invoice.destinationCountry || 'US',
      'Consignee Name': shipment.invoice.consigneeName,
      'Consignee Address': shipment.invoice.consigneeAddress || '',
      'e-Sanchit IRN': shipment.invoice.eSanchitIrn || '',
      'e-Sanchit DRN': shipment.invoice.eSanchitDrn || ''
    }
  ];

  const wsInvoice = XLSX.utils.json_to_sheet(invoiceRows);
  wsInvoice['!cols'] = [
    { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 18 }, { wch: 12 },
    { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 16 },
    { wch: 18 }, { wch: 18 }, { wch: 30 }, { wch: 40 }, { wch: 24 }, { wch: 20 }
  ];
  XLSX.utils.book_append_sheet(wb, wsInvoice, 'INVOICE_HEADER');

  // ----------------------------------------------------
  // SHEET 3: Exporter Master & Statutory Info
  // ----------------------------------------------------
  const exporterRows = [
    {
      'Company Name': shipment.exporter.companyName,
      'IEC (10-Digit)': shipment.exporter.iec,
      'GSTIN (15-Digit)': shipment.exporter.gstin,
      'Bank AD Code (7-Digit)': shipment.exporter.adCode,
      'Bank Name': shipment.exporter.bankName || 'State Bank of India',
      'Branch': shipment.exporter.branchCode || 'Commercial Branch Fort Mumbai',
      'Customs House': shipment.customsHouse,
      'CHA Licensee': 'EKDANT LOGISTICS (CHA LIC NO: 11/1892)',
      'Total Packages': shipment.packages.totalPackages,
      'Package Type': shipment.packages.packageType,
      'Gross Weight (KG)': shipment.packages.grossWeightKg,
      'Net Weight (KG)': shipment.packages.netWeightKg,
      'Weight Logic Status': shipment.packages.grossWeightKg >= shipment.packages.netWeightKg ? 'PASSED (Gross >= Net)' : 'CRITICAL ERROR'
    }
  ];

  const wsExporter = XLSX.utils.json_to_sheet(exporterRows);
  wsExporter['!cols'] = [
    { wch: 35 }, { wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 24 },
    { wch: 28 }, { wch: 24 }, { wch: 35 }, { wch: 16 }, { wch: 14 },
    { wch: 18 }, { wch: 18 }, { wch: 24 }
  ];
  XLSX.utils.book_append_sheet(wb, wsExporter, 'EXPORTER_&_WEIGHTS');

  // Generate file name
  const safeInv = (shipment.invoice.invoiceNo || 'INV').replace(/[^a-zA-Z0-9_-]/g, '_');
  const softwareTag = targetSoftware === 'SOFTLINK_LOGISYS' ? 'LogiSys' : 'VisualImpex';
  const filename = `Ekdant_${softwareTag}_BulkImport_${safeInv}_${shipment.portCode}.xlsx`;

  XLSX.writeFile(wb, filename);
}
