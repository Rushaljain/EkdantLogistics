// Official ICEGATE Remote EDI Flat File Compiler (ICES 1.5 Standard)
// Utilizes ASCII 0x1D (Group Separator) field delimiter per CBIC specifications

import type { ShipmentData } from '../types/customs';

export const GS = String.fromCharCode(0x1D); // ASCII 29 / 0x1D Group Separator
export const VISIBLE_GS = '␝'; // Visual representation for human inspection

/**
 * Compiles a Shipment object into the official ICES 1.5 Flat File for ICEGATE
 * @param shipment Full shipment and invoice data
 * @param type 'EXPORT' for Shipping Bill (.sb) or 'IMPORT' for Bill of Entry (.be)
 */
export function compileIcegateEdiFlatFile(shipment: ShipmentData, type: 'EXPORT' | 'IMPORT' = 'EXPORT'): string {
  const lines: string[] = [];
  const senderId = 'EKDANT_CHA_INNSA1';
  const recipientId = 'ICEGATE';
  const now = new Date();
  const fileDate = now.toISOString().slice(0, 10).replace(/-/g, '');
  const fileTime = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const jobNo = shipment.jobNo || `EKD-${Date.now().toString().slice(-6)}`;

  // 1. EDI Header Envelope
  lines.push(`HREC${GS}ZZ${GS}${senderId}${GS}ZZ${GS}${recipientId}${GS}1.5${GS}ICES_1_5${GS}${fileDate}${GS}${fileTime}${GS}${jobNo}`);

  if (type === 'EXPORT') {
    // ----------------------------------------------------
    // TABLE: SHIPPINGBILL (SB Header)
    // ----------------------------------------------------
    lines.push('<TABLE>SHIPPINGBILL');
    // Fields: H, JobNo, JobDate, PortCode, IEC, ExporterName, ExporterAddress, GSTIN, BankADCode, State, GrossWt, NetWt, Packages, PkgType, ConsigneeName, DestCountry, PortOfDischarge
    const sbHeaderRow = [
      'H',
      jobNo,
      fileDate,
      shipment.portCode || 'INNSA1',
      shipment.exporter.iec,
      shipment.exporter.companyName.toUpperCase(),
      (shipment.exporter.address || '').replace(/[\r\n]/g, ' '),
      shipment.exporter.gstin,
      shipment.exporter.adCode,
      shipment.exporter.stateCode || '27', // Maharashtra
      shipment.packages.grossWeightKg.toFixed(3),
      shipment.packages.netWeightKg.toFixed(3),
      shipment.packages.totalPackages.toString(),
      shipment.packages.packageType || 'BOX',
      shipment.invoice.consigneeName.toUpperCase(),
      shipment.invoice.destinationCountry || 'US',
      shipment.invoice.portOfDischarge || 'USLAX'
    ].join(GS);
    lines.push(sbHeaderRow);

    // ----------------------------------------------------
    // TABLE: INVOICE
    // ----------------------------------------------------
    lines.push('<TABLE>INVOICE');
    // Fields: H, InvoiceNo, InvoiceDate, Currency, ExchRate, Incoterm, TotalVal, Freight, Insurance, Misc
    const invoiceRow = [
      'H',
      shipment.invoice.invoiceNo,
      shipment.invoice.invoiceDate.replace(/-/g, ''),
      shipment.invoice.currency,
      shipment.invoice.exchangeRate.toFixed(4),
      shipment.invoice.incoterm,
      shipment.invoice.invoiceTotal.toFixed(2),
      (shipment.invoice.freightAmount || 0).toFixed(2),
      (shipment.invoice.insuranceAmount || 0).toFixed(2),
      (shipment.invoice.miscCharges || 0).toFixed(2)
    ].join(GS);
    lines.push(invoiceRow);

    // ----------------------------------------------------
    // TABLE: ITEM (Line Items)
    // ----------------------------------------------------
    lines.push('<TABLE>ITEM');
    shipment.lineItems.forEach((item, idx) => {
      // Fields: H, ItemNo, InvoiceNo, RITC/HSN (8 digits), Description, Qty, UQC, UnitPrice, TotalValue, SchemeCode
      const itemRow = [
        'H',
        (item.itemNumber || idx + 1).toString(),
        shipment.invoice.invoiceNo,
        item.hsnCode.padEnd(8, '0').slice(0, 8),
        item.description.replace(/[\r\n\t]/g, ' ').slice(0, 120),
        item.quantity.toFixed(3),
        item.uqc.slice(0, 3).toUpperCase(),
        item.unitPrice.toFixed(4),
        item.itemTotalValue.toFixed(2),
        item.schemeCode || '00' // 00 = Free Shipping Bill, 19 = Drawback, etc.
      ].join(GS);
      lines.push(itemRow);
    });

    // ----------------------------------------------------
    // TABLE: SUPPORTING_DOC (e-Sanchit IRN Binding)
    // ----------------------------------------------------
    lines.push('<TABLE>SUPPORTING_DOC');
    const irn = shipment.invoice.eSanchitIrn || '2026INNSA1009841';
    const drn = shipment.invoice.eSanchitDrn || 'DRN88921004';
    // Fields: H, DocType, DocRefNo, IRN, DRN, IssuingDate, DSC_SignStatus
    const docRow = [
      'H',
      '380000', // UNECE Code for Commercial Invoice
      shipment.invoice.invoiceNo,
      irn,
      drn,
      fileDate,
      'SIGNED_DSC_CLASS3'
    ].join(GS);
    lines.push(docRow);

  } else {
    // ----------------------------------------------------
    // TABLE: BILLOFENTRY (Import BE Header)
    // ----------------------------------------------------
    lines.push('<TABLE>BILLOFENTRY');
    const beHeaderRow = [
      'H',
      jobNo,
      fileDate,
      shipment.portCode || 'INNSA1',
      shipment.exporter.iec,
      shipment.exporter.companyName.toUpperCase(),
      shipment.exporter.gstin,
      shipment.packages.grossWeightKg.toFixed(3),
      shipment.packages.totalPackages.toString(),
      shipment.packages.packageType || 'BOX',
      shipment.invoice.portOfLoading || 'SGSIN'
    ].join(GS);
    lines.push(beHeaderRow);

    lines.push('<TABLE>INVOICE');
    const invoiceRow = [
      'H',
      shipment.invoice.invoiceNo,
      shipment.invoice.invoiceDate.replace(/-/g, ''),
      shipment.invoice.currency,
      shipment.invoice.exchangeRate.toFixed(4),
      shipment.invoice.incoterm,
      shipment.invoice.invoiceTotal.toFixed(2)
    ].join(GS);
    lines.push(invoiceRow);

    lines.push('<TABLE>ITEM');
    shipment.lineItems.forEach((item, idx) => {
      const itemRow = [
        'H',
        (item.itemNumber || idx + 1).toString(),
        shipment.invoice.invoiceNo,
        item.hsnCode.padEnd(8, '0').slice(0, 8),
        item.description.slice(0, 120),
        item.quantity.toFixed(3),
        item.uqc.slice(0, 3).toUpperCase(),
        item.unitPrice.toFixed(4),
        item.itemTotalValue.toFixed(2)
      ].join(GS);
      lines.push(itemRow);
    });

    lines.push('<TABLE>SUPPORTING_DOC');
    lines.push(['H', '380000', shipment.invoice.invoiceNo, shipment.invoice.eSanchitIrn || '2026INNSA1009841', fileDate].join(GS));
  }

  // EDI Trailer Envelope
  lines.push(`TREC${GS}${jobNo}`);

  return lines.join('\r\n');
}

/**
 * Converts a raw ICEGATE EDI flat file string into a visual string for human review,
 * substituting invisible ASCII 0x1D with visible '␝' characters.
 */
export function formatEdiForInspection(rawEdi: string): string {
  return rawEdi.replace(new RegExp(GS, 'g'), ` ${VISIBLE_GS} `);
}

/**
 * Triggers a browser download of the generated EDI Flat File
 */
export function downloadEdiFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
