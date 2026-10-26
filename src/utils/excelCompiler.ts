// CHA Bulk Excel Exporter
// Formatted for Softlink Logi-Sys and Visual Impex 1-Click Import

import * as XLSX from 'xlsx';
import type { ConvertedInvoice } from '../types';

export function downloadExcel(invoice: ConvertedInvoice): void {
  const wb = XLSX.utils.book_new();

  // ---------------------------------------------------------------------------
  // SHEET 1: Line Items
  // ---------------------------------------------------------------------------
  const itemRows = invoice.lineItems.map((item, idx) => ({
    'Item #': item.itemNumber || idx + 1,
    'HSN Code (8-Digit)': (item.hsnCode || '84818090').padEnd(8, '0').slice(0, 8),
    'Description of Goods': item.description,
    'Quantity': item.quantity,
    'Unit (UQC)': (item.uqc || 'NOS').toUpperCase(),
    'Unit Price': item.unitPrice,
    'Total Value': item.total,
    'Currency': invoice.currency,
    'e-Sanchit IRN': invoice.esanchitIrn || 'Not Linked'
  }));

  const wsItems = XLSX.utils.json_to_sheet(itemRows);
  wsItems['!cols'] = [
    { wch: 8 },  // Item #
    { wch: 20 }, // HSN Code
    { wch: 45 }, // Description
    { wch: 12 }, // Qty
    { wch: 12 }, // Unit
    { wch: 14 }, // Unit Price
    { wch: 16 }, // Total
    { wch: 10 }, // Currency
    { wch: 22 }, // IRN
  ];
  XLSX.utils.book_append_sheet(wb, wsItems, 'Line Items');

  // ---------------------------------------------------------------------------
  // SHEET 2: Invoice Header
  // ---------------------------------------------------------------------------
  const headerRows = [
    {
      'Invoice Number': invoice.invoiceNumber,
      'Invoice Date': invoice.invoiceDate,
      'Filing Type': invoice.filingType,
      'Currency': invoice.currency,
      'Exchange Rate (INR)': invoice.exchangeRate,
      'Incoterm': invoice.incoterm,
      'Invoice Total': invoice.invoiceTotal,
      'Exporter Name': invoice.exporterName,
      'IEC (10-Digit)': invoice.iec,
      'GSTIN (15-Digit)': invoice.gstin,
      'Bank AD Code': invoice.adCode,
      'Consignee Name': invoice.consigneeName,
      'Port of Loading': invoice.portOfLoading,
      'Port of Discharge': invoice.portOfDischarge,
      'Country of Destination': invoice.destinationCountry,
      'e-Sanchit IRN': invoice.esanchitIrn
    }
  ];

  const wsHeader = XLSX.utils.json_to_sheet(headerRows);
  wsHeader['!cols'] = [
    { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 18 },
    { wch: 12 }, { wch: 16 }, { wch: 32 }, { wch: 16 }, { wch: 20 },
    { wch: 16 }, { wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 22 }, { wch: 22 }
  ];
  XLSX.utils.book_append_sheet(wb, wsHeader, 'Invoice Header');

  // ---------------------------------------------------------------------------
  // SHEET 3: Customs & Weights
  // ---------------------------------------------------------------------------
  const customsRows = [
    {
      'Customs House': invoice.portOfLoading === 'INNSA1' ? 'Jawaharlal Nehru Port Trust (INNSA1)' : 'Air Cargo Complex Mumbai (INBOM4)',
      'Total Packages': invoice.totalPackages,
      'Package Type': invoice.packageType || 'BOX',
      'Gross Weight (KG)': invoice.grossWeightKg,
      'Net Weight (KG)': invoice.netWeightKg,
      'Weight Logic Status': invoice.grossWeightKg >= invoice.netWeightKg ? 'Passed (Gross >= Net)' : 'Warning (Net > Gross)',
      'e-Sanchit IRN': invoice.esanchitIrn || 'Pending',
      'CHA Licensee': 'Ekdant Logistics (Lic No: 11/1892)'
    }
  ];

  const wsCustoms = XLSX.utils.json_to_sheet(customsRows);
  wsCustoms['!cols'] = [
    { wch: 35 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 26 }, { wch: 24 }, { wch: 35 }
  ];
  XLSX.utils.book_append_sheet(wb, wsCustoms, 'Customs & Weights');

  // Trigger file download
  const cleanInv = invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Ekdant_${cleanInv}_${invoice.portOfLoading}.xlsx`;
  XLSX.writeFile(wb, filename);
}
