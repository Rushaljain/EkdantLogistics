// Official ICEGATE ICES 1.5 Remote EDI Flat File Compiler (.sb / .be)
// Uses ASCII 29 (0x1D) Group Separator per CBIC Indian Customs standards

import type { ConvertedInvoice } from '../types';

export const GS = String.fromCharCode(0x1D); // ASCII 29 (Group Separator)

/**
 * Compiles a ConvertedInvoice into the official ICES 1.5 Flat File for ICEGATE
 */
export function compileEdiFlatFile(invoice: ConvertedInvoice): string {
  const isExport = invoice.filingType === 'EXPORT';
  const lines: string[] = [];
  const now = new Date();
  const fileDate = now.toISOString().slice(0, 10).replace(/-/g, '');
  const fileTime = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const safeJob = `EKD${now.getFullYear()}${fileDate.slice(4)}${Math.floor(1000 + Math.random() * 9000)}`;

  // Envelope Header Record
  lines.push(`HREC${GS}ZZ${GS}EKDANT_CUSTOMS${GS}ZZ${GS}ICEGATE${GS}1.5${GS}ICES_1_5${GS}${fileDate}${GS}${fileTime}${GS}${safeJob}`);

  if (isExport) {
    // -------------------------------------------------------------------------
    // EXPORT SHIPPING BILL (.sb)
    // -------------------------------------------------------------------------
    lines.push('<TABLE>SB');
    const sbHeader = [
      'H',
      invoice.portOfLoading || 'INNSA1',
      fileDate,
      invoice.iec || '0391048291',
      (invoice.exporterName || 'APEX ENGINEERING EXPORTS PVT LTD').toUpperCase(),
      invoice.gstin || '27AAACA9921E1Z8',
      invoice.adCode || '0290041',
      invoice.portOfDischarge || 'DEHAM',
      invoice.destinationCountry || 'DE',
      Number(invoice.grossWeightKg || 0).toFixed(3),
      Number(invoice.netWeightKg || 0).toFixed(3),
      String(invoice.totalPackages || 1),
      invoice.packageType || 'BOX'
    ].join(GS);
    lines.push(sbHeader);

    lines.push('<TABLE>INVOICE');
    const invRow = [
      'H',
      invoice.invoiceNumber,
      (invoice.invoiceDate || fileDate).replace(/-/g, ''),
      invoice.currency || 'USD',
      invoice.incoterm || 'FOB',
      Number(invoice.invoiceTotal || 0).toFixed(2),
      (invoice.consigneeName || 'CONSIGNEE').toUpperCase()
    ].join(GS);
    lines.push(invRow);

    lines.push('<TABLE>ITEM');
    invoice.lineItems.forEach((item, idx) => {
      const cleanHsn = (item.hsnCode || '84818090').replace(/[^0-9]/g, '').padEnd(8, '0').slice(0, 8);
      const cleanUqc = (item.uqc || 'NOS').toUpperCase().slice(0, 3);
      const cleanDesc = (item.description || 'GOODS').replace(/[\r\n\t]/g, ' ').slice(0, 120);

      const itemRow = [
        'H',
        String(item.itemNumber || idx + 1),
        cleanHsn,
        cleanDesc,
        Number(item.quantity || 1).toFixed(3),
        cleanUqc,
        Number(item.unitPrice || 0).toFixed(4),
        Number(item.total || 0).toFixed(2),
        'LUT',
        'RODTEP'
      ].join(GS);
      lines.push(itemRow);
    });

    lines.push('<TABLE>SUPPORTING_DOC');
    const docRow = [
      'H',
      '380000', // UNECE Code for Commercial Invoice
      invoice.invoiceNumber,
      invoice.esanchitIrn || '2026102700194821',
      fileDate
    ].join(GS);
    lines.push(docRow);

    lines.push('<END-SB>');
  } else {
    // -------------------------------------------------------------------------
    // IMPORT BILL OF ENTRY (.be)
    // -------------------------------------------------------------------------
    lines.push('<TABLE>BE_HEADER');
    const beHeader = [
      'H',
      invoice.portOfLoading || 'INNSA1',
      fileDate,
      invoice.iec || '0391048291',
      (invoice.exporterName || 'IMPORTER NAME').toUpperCase(),
      invoice.gstin || '27AAACA9921E1Z8',
      Number(invoice.grossWeightKg || 0).toFixed(3),
      Number(invoice.netWeightKg || 0).toFixed(3),
      String(invoice.totalPackages || 1),
      invoice.packageType || 'BOX'
    ].join(GS);
    lines.push(beHeader);

    lines.push('<TABLE>BE_INVOICE');
    const invRow = [
      'H',
      invoice.invoiceNumber,
      (invoice.invoiceDate || fileDate).replace(/-/g, ''),
      invoice.currency || 'USD',
      invoice.incoterm || 'CIF',
      Number(invoice.invoiceTotal || 0).toFixed(2)
    ].join(GS);
    lines.push(invRow);

    lines.push('<TABLE>BE_ITEM');
    invoice.lineItems.forEach((item, idx) => {
      const cleanHsn = (item.hsnCode || '84818090').replace(/[^0-9]/g, '').padEnd(8, '0').slice(0, 8);
      const cleanUqc = (item.uqc || 'NOS').toUpperCase().slice(0, 3);
      const cleanDesc = (item.description || 'GOODS').replace(/[\r\n\t]/g, ' ').slice(0, 120);

      const itemRow = [
        'H',
        String(item.itemNumber || idx + 1),
        cleanHsn,
        cleanDesc,
        Number(item.quantity || 1).toFixed(3),
        cleanUqc,
        Number(item.unitPrice || 0).toFixed(4),
        Number(item.total || 0).toFixed(2)
      ].join(GS);
      lines.push(itemRow);
    });

    lines.push('<TABLE>BE_SUPPORTING_DOC');
    const docRow = [
      'H',
      '380000',
      invoice.invoiceNumber,
      invoice.esanchitIrn || '2026102700194821',
      fileDate
    ].join(GS);
    lines.push(docRow);

    lines.push('<END-BE>');
  }

  // Envelope Trailer Record
  lines.push(`TREC${GS}${safeJob}`);

  return lines.join('\r\n');
}

/**
 * Triggers a browser file download of the compiled flat file
 */
export function downloadEdi(invoice: ConvertedInvoice): void {
  const content = compileEdiFlatFile(invoice);
  const ext = invoice.filingType === 'EXPORT' ? 'sb' : 'be';
  const cleanInv = invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${cleanInv}_${invoice.portOfLoading}.${ext}`;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
