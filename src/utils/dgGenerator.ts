// Official 22-Box IMO Multimodal Dangerous Goods Declaration Generator
// Compliant with SOLAS 74 Chapter VII Regulation 5, MARPOL 73/78 Annex III Regulation 4, and IMDG Code Chapter 5.4

import type { ConvertedInvoice, DocumentOutput, MasterFormat } from '../types';
import { DOCUMENT_TEMPLATES } from '../data/templates';
import { PRESEEDED_MASTER_FORMATS } from '../data/masterFormats';

// Helper to format pallet serial ranges cleanly (e.g. 4956 TO 4963, 4964, 4533 TO 4546)
export function formatSequentialPalletRanges(palletNumbers: string[]): string[] {
  if (palletNumbers.length === 0) return [];

  const ranges: string[] = [];
  let currentRange: { prefix: string; start: number; end: number; rawPrefix: string } | null = null;
  const nonNumeric: string[] = [];

  for (const p of palletNumbers) {
    const trimmed = p.trim();
    // Pattern: optional prefix + number, e.g., "4956" or "TAL/1703/2026"
    const talMatch = trimmed.match(/^(TAL\/)(\d+)(\/2026)$/i);
    const numMatch = trimmed.match(/^(\d+)$/);

    if (talMatch) {
      const num = parseInt(talMatch[2], 10);
      if (currentRange && currentRange.prefix === 'TAL' && currentRange.end + 1 === num) {
        currentRange.end = num;
      } else {
        if (currentRange) {
          ranges.push(
            currentRange.prefix === 'TAL'
              ? (currentRange.start === currentRange.end ? `TAL/${currentRange.start}/2026` : `TAL/${currentRange.start}/2026 TO TAL/${currentRange.end}/2026`)
              : (currentRange.start === currentRange.end ? `${currentRange.start}` : `${currentRange.start} TO ${currentRange.end}`)
          );
        }
        currentRange = { prefix: 'TAL', start: num, end: num, rawPrefix: 'TAL/' };
      }
    } else if (numMatch) {
      const num = parseInt(numMatch[1], 10);
      if (currentRange && currentRange.prefix === 'NUM' && currentRange.end + 1 === num) {
        currentRange.end = num;
      } else {
        if (currentRange) {
          ranges.push(
            currentRange.prefix === 'TAL'
              ? (currentRange.start === currentRange.end ? `TAL/${currentRange.start}/2026` : `TAL/${currentRange.start}/2026 TO TAL/${currentRange.end}/2026`)
              : (currentRange.start === currentRange.end ? `${currentRange.start}` : `${currentRange.start} TO ${currentRange.end}`)
          );
        }
        currentRange = { prefix: 'NUM', start: num, end: num, rawPrefix: '' };
      }
    } else {
      if (currentRange) {
        ranges.push(
          currentRange.prefix === 'TAL'
            ? (currentRange.start === currentRange.end ? `TAL/${currentRange.start}/2026` : `TAL/${currentRange.start}/2026 TO TAL/${currentRange.end}/2026`)
            : (currentRange.start === currentRange.end ? `${currentRange.start}` : `${currentRange.start} TO ${currentRange.end}`)
        );
        currentRange = null;
      }
      nonNumeric.push(trimmed);
    }
  }

  if (currentRange) {
    ranges.push(
      currentRange.prefix === 'TAL'
        ? (currentRange.start === currentRange.end ? `TAL/${currentRange.start}/2026` : `TAL/${currentRange.start}/2026 TO TAL/${currentRange.end}/2026`)
        : (currentRange.start === currentRange.end ? `${currentRange.start}` : `${currentRange.start} TO ${currentRange.end}`)
    );
  }

  return [...ranges, ...nonNumeric];
}

export function generateDgDeclaration(
  invoice: ConvertedInvoice,
  templateId: string = 'dg-imo-standard',
  formats: MasterFormat[] = PRESEEDED_MASTER_FORMATS
): DocumentOutput {
  const template = DOCUMENT_TEMPLATES.find(t => t.id === templateId) || DOCUMENT_TEMPLATES[4];
  
  // Resolve active format dynamically without falling back to hardcoded carrier defaults
  const activeFormat: Partial<MasterFormat> = (templateId && formats.find(f => f.id === templateId)) ||
                       (invoice.carrierName && formats.find(f => f.carrierName?.toLowerCase() === invoice.carrierName?.toLowerCase())) ||
                       {};

  const bookingRef = invoice.bookingNumber || activeFormat.bookingNumber || '';
  const cleanInvNo = (invoice.invoiceNumber || 'BATCH').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  const docNumber = bookingRef ? `DG-BKG-${bookingRef}` : `DG-DECL-${cleanInvNo}`;
  const now = new Date();
  const dateStr = invoice.dgDeclarationPlaceAndDate || activeFormat.dgDeclarationPlaceAndDate || `${invoice.portOfLoading ? invoice.portOfLoading.split(',')[0].trim() : 'PORT'} / ${now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;

  const totalGrossKg = invoice.grossWeightKg || invoice.containers.reduce((s, c) => s + c.totalGrossWeightKg, 0) || 0;
  const totalNetKg = invoice.netWeightKg || invoice.containers.reduce((s, c) => s + c.totalNetWeightKg, 0) || 0;
  const totalPallets = invoice.totalPallets || invoice.pallets?.length || 0;
  const totalPackages = invoice.totalPackages || 0;

  // Primary container (preferring format-defined equipment if synthetic/absent)
  const primaryCont = invoice.containers[0];
  const containerNo = activeFormat.containerNumber || invoice.containers[0]?.containerNumber || '____________________';
  const sealNo = activeFormat.sealNumber || invoice.containers[0]?.sealNumber || '__________';
  const tareKg = primaryCont?.tareWeightKg || activeFormat.tareWeightKg || 2150;
  const totalVgmKg = Number((totalGrossKg + tareKg).toFixed(2));

  // Shared attributes strictly from ConvertedInvoice Single Source of Truth & Format Defaults
  const carrierName = invoice.carrierName || activeFormat.carrierName || '____________________';
  const vesselVoy = [
    activeFormat.vesselName || (invoice.vesselName && invoice.vesselName !== 'Port of Discharge' && invoice.vesselName !== '---' ? invoice.vesselName : ''),
    activeFormat.voyageNumber || invoice.voyageNumber || ''
  ].filter(Boolean).join(' / ') || '____________________';

  const pol = invoice.portOfLoading || activeFormat.portOfLoading || '____________________';
  const pod = activeFormat.portOfDischargeDg || invoice.portOfDischargeDg || invoice.portOfDischarge || '____________________';
  const dest = activeFormat.finalDestination || invoice.placeOfDelivery || invoice.finalDestination || '____________________';

  const declarantName = invoice.dgDeclarantName || activeFormat.dgDeclarantName || '____________________';
  const declarantStatus = invoice.dgDeclarantStatus || activeFormat.dgDeclarantStatus || '____________________';
  const emgName = invoice.emergencyContactName || activeFormat.emergencyContactName || invoice.emergencyContact || '____________________';
  const emgPhone = invoice.emergencyContactPhone || activeFormat.emergencyContactPhone || '';
  const unPackingCode = invoice.unPackingCode || activeFormat.unPackingCode || '—';
  const emsNo = invoice.emsNumber || activeFormat.emsNumber || '—';
  const segrGroup = invoice.segregationGroup || activeFormat.segregationGroup || '—';
  const pkGroup = invoice.dgPackingGroupOverride || 'NA';

  const marksText = invoice.shippingMarks || activeFormat.shippingMarks || '';

  // Pallet serial ranges breakdown
  const palletNumbers = invoice.pallets?.map(p => p.palletNumber) || [];
  const palletRanges = invoice.palletRanges && invoice.palletRanges.length > 0
    ? invoice.palletRanges
    : formatSequentialPalletRanges(palletNumbers);
  const palletRangesStr = palletRanges.length > 0 ? palletRanges.join(', ') : '';

  const containersSummary = `${containerNo} (Seal: ${sealNo}) - ${totalPallets} Pallets [${palletRangesStr}] (${totalGrossKg.toLocaleString()} kg)`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>IMO Multimodal Dangerous Goods Form - ${docNumber}</title>
  <style>
    @media print {
      body { margin: 0; padding: 0; background: #fff; }
      .no-print { display: none !important; }
    }
    body { font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif; background: #f4f4f5; color: #000; margin: 0; padding: 16px; font-size: 10px; line-height: 1.25; }
    .imo-form { max-width: 920px; margin: 0 auto; background: #fff; border: 2px solid #000; padding: 0; box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
    .top-header { border-bottom: 2px solid #000; padding: 8px 12px; background: #fff; }
    .top-title { font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
    .top-sub { font-size: 8.5px; margin-top: 3px; color: #222; }
    .box-grid { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #000; }
    .cell { border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 6px 8px; vertical-align: top; min-height: 48px; position: relative; }
    .cell:nth-child(2n) { border-right: none; }
    .box-num { font-size: 9px; font-weight: 900; color: #000; display: inline-block; margin-right: 4px; }
    .box-title { font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: #333; }
    .box-content { margin-top: 4px; font-size: 10px; font-weight: 600; line-height: 1.35; color: #000; }
    .dg-table { width: 100%; border-collapse: collapse; border-bottom: 2px solid #000; font-size: 9.5px; }
    .dg-table th { border: 1px solid #000; padding: 6px; background: #f4f4f5; font-size: 8.5px; font-weight: 800; text-transform: uppercase; text-align: left; }
    .dg-table td { border: 1px solid #000; padding: 6px 8px; vertical-align: top; }
    .legal-text { font-size: 7.5px; line-height: 1.25; color: #222; text-align: justify; }
    .cert-row { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #000; }
    .signature-font { font-family: 'Brush Script MT', cursive, sans-serif; font-size: 20px; color: #000; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="imo-form">
    <!-- Top Header -->
    <div class="top-header">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div class="top-title">MULTIMODAL DANGEROUS GOODS FORM</div>
          <div class="top-sub">
            This form may be used as a dangerous goods declaration as it meets the requirements of SOLAS 74, Chapter VII, Regulation 5; MARPOL 73/78, Annex III, Regulation 4.
          </div>
        </div>
        <div style="text-align: right; font-family: monospace; font-size: 11px; font-weight: 700;">
          DOC NO: ${docNumber}
        </div>
      </div>
    </div>

    <!-- Boxes 1 to 7 -->
    <div class="box-grid">
      <!-- Box 1: Shipper / Consignor -->
      <div class="cell" style="grid-row: span 2;">
        <span class="box-num">1</span><span class="box-title">Shipper / Consignor / Sender</span>
        <div class="box-content">
          <strong>${invoice.exporterName}</strong><br/>
          ${invoice.shipperAddress ? `${invoice.shipperAddress}<br/>` : ''}
          ${[invoice.gstin ? `GSTIN: ${invoice.gstin}` : '', invoice.iec ? `IEC: ${invoice.iec}` : ''].filter(Boolean).join(' | ')}
        </div>
      </div>

      <!-- Box 2: Transport Document Number -->
      <div class="cell">
        <span class="box-num">2</span><span class="box-title">Transport Document Number</span>
        <div class="box-content" style="font-family: monospace; font-size: 11px; font-weight: 700; color: #1e3a8a;">
          BKG.NO.: ${bookingRef}
        </div>
      </div>

      <!-- Box 3, 4, 5: Page & References -->
      <div class="cell" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; padding: 4px 6px;">
        <div>
          <span class="box-num">3</span><span class="box-title">Page</span>
          <div style="font-weight: 700; margin-top: 2px;">1 of 1</div>
        </div>
        <div>
          <span class="box-num">4</span><span class="box-title">Shipper's Ref</span>
          <div style="font-family: monospace; font-size: 8.5px; margin-top: 2px;">${invoice.invoiceNumber.includes('+') ? `INVOICES: ${invoice.invoiceNumber}` : invoice.invoiceNumber}</div>
        </div>
        <div>
          <span class="box-num">5</span><span class="box-title">Freight Fwd Ref</span>
          <div style="font-family: monospace; font-size: 9px; margin-top: 2px;">${bookingRef ? `EKD-${bookingRef}` : 'EKD-REF'}</div>
        </div>
      </div>

      <!-- Box 6: Consignee -->
      <div class="cell">
        <span class="box-num">6</span><span class="box-title">Consignee</span>
        <div class="box-content">
          <strong>${invoice.consigneeName}</strong><br/>
          ${(invoice.consigneeAddress || '').replace(/,\s*,/g, ',').replace(/\s*,\s*/g, ', ').trim()}
        </div>
      </div>

      <!-- Box 7: Carrier -->
      <div class="cell">
        <span class="box-num">7</span><span class="box-title">Carrier</span>
        <div class="box-content">
          <strong>${carrierName}</strong>
          <div style="font-size: 9px; color: #555; margin-top: 2px;">OCEAN VESSEL SERVICE</div>
        </div>
      </div>
    </div>

    <!-- Box 8: Shipper's Declaration Notice -->
    <div style="padding: 6px 10px; border-bottom: 1px solid #000; background: #fff;">
      <span class="box-num">8</span><strong style="text-transform: uppercase; font-size: 8.5px;">Shipper's Declaration:</strong>
      <span class="legal-text" style="display: inline; margin-left: 4px;">
        I hereby declare that the contents of this consignment are fully and accurately described below by the proper shipping name, and are classified, packaged, marked and labeled/placarded and are in all respects in proper condition for transport according to the applicable international and national government regulations.
      </span>
    </div>

    <!-- Boxes 9 to 13: Handling, Vessel, Ports -->
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; border-bottom: 2px solid #000;">
      <!-- Box 9: Additional Handling Information -->
      <div style="border-right: 1px solid #000; padding: 6px 8px;">
        <span class="box-num">9</span><span class="box-title">Additional Handling Information</span>
        <div class="box-content" style="font-size: 8.5px; line-height: 1.35;">
          <strong>24-HR EMERGENCY CONTACT:</strong><br/>
          <span style="font-family: monospace; font-size: 9.5px; color: #1e3a8a; font-weight: 700;">${emgName} (${emgPhone})</span>
        </div>
      </div>

      <!-- Box 10: Vessel and Voyage -->
      <div style="border-right: 1px solid #000; padding: 6px 8px;">
        <span class="box-num">10</span><span class="box-title">Vessel and Voyage</span>
        <div class="box-content" style="font-family: monospace; font-weight: 700;">
          ${vesselVoy}
        </div>
      </div>

      <!-- Box 11: Port of Loading -->
      <div style="border-right: 1px solid #000; padding: 6px 8px;">
        <span class="box-num">11</span><span class="box-title">Port of Loading</span>
        <div class="box-content">
          <strong>${pol}</strong>
        </div>
      </div>

      <!-- Box 12 & 13 -->
      <div style="padding: 6px 8px;">
        <div>
          <span class="box-num">12</span><span class="box-title">Port of Discharge</span>
          <div class="box-content" style="font-size: 9.5px;">
            <strong>${pod}</strong>
          </div>
        </div>
        <div style="margin-top: 4px; border-top: 1px dashed #ccc; pt-1;">
          <span class="box-num">13</span><span class="box-title">Destination</span>
          <div class="box-content" style="font-size: 9.5px;">
            <strong>${dest}</strong>
          </div>
        </div>
      </div>
    </div>

    <!-- Box 14: Dangerous Goods Description Table -->
    <div style="padding: 4px 8px; background: #fcfcfc; border-bottom: 1px solid #000;">
      <span class="box-num">14</span><span class="box-title">Shipping Marks, Number & Kind of Packages, Description of Goods</span>
    </div>

    <table class="dg-table">
      <thead>
        <tr>
          <th style="width: 28%;">Shipping Marks</th>
          <th style="width: 44%;">*Number and Kind of Packages; Description of Goods</th>
          <th style="width: 14%; text-align: right;">Gross Mass (kg)</th>
          <th style="width: 14%; text-align: right;">Net Mass (kgs)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="font-family: monospace; font-size: 10px; line-height: 1.45;">
            ${marksText.replace(/\n/g, '<br/>')}<br/><br/>
            <strong>SHIPPING MARKS & NUMBERS (AS PER REFERENCE):</strong><br/>
            <span style="font-size: 9px; color: #1e3a8a;">
              ${Array.from(new Set(palletRanges.map(r => r.trim()).filter(Boolean))).map(r => `• ${r}`).join('<br/>')}
            </span>
          </td>
          <td>
            <div style="font-family: monospace; font-size: 10px; line-height: 1.45;">
              <strong>PROPER SHIPPING NAME(PSN):</strong> BATTERIES, WET, FILLED WITH ACID<br/>
              <strong>TECHNICAL NAME:</strong> LEAD ACID STORAGE BATTERIES<br/>
              <strong>CLASS:</strong> 8 &nbsp;&nbsp;|&nbsp;&nbsp; <strong>SUB CLASS:</strong> NA &nbsp;&nbsp;|&nbsp;&nbsp; <strong>UN NO:</strong> 2794<br/>
              <strong>PKG GROUP:</strong> ${pkGroup} &nbsp;&nbsp;|&nbsp;&nbsp; <strong>EMS:</strong> ${emsNo}<br/>
              <strong>MARINE POLLUTANT:</strong> NA &nbsp;&nbsp;|&nbsp;&nbsp; <strong>SEGREGATION GROUP:</strong> ${segrGroup}<br/>
              <strong>UN PACKING CODE:</strong> ${unPackingCode}<br/>
              <strong>NO & KIND OF PACKAGING:</strong> ${totalPallets} PALLETS<br/>
              &nbsp;&nbsp;• <strong>OUTER:</strong> ${totalPallets} PALLETS<br/>
              &nbsp;&nbsp;• <strong>INNER:</strong> ${totalPackages} CORRUGATED BOXES<br/>
              <strong>*FLASH POINT:</strong> N.A &nbsp;&nbsp;|&nbsp;&nbsp; <strong>*LTD QTY:</strong> N.A<br/>
              <strong>EMERGENCY CONTACT NO. & NAME:</strong> ${emgName} (MOB: ${emgPhone})
            </div>
          </td>
          <td style="text-align: right; font-family: monospace; font-size: 11px; font-weight: 700;">
            ${totalGrossKg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KGS
          </td>
          <td style="text-align: right; font-family: monospace; font-size: 11px; font-weight: 700;">
            ${totalNetKg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KGS
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Boxes 15 to 19: Container Details & VGM -->
    <div style="display: grid; grid-template-columns: 2fr 1.5fr 1fr 1.2fr 1.5fr; border-bottom: 2px solid #000; background: #fff;">
      <div style="border-right: 1px solid #000; padding: 6px 8px;">
        <span class="box-num">15</span><span class="box-title">Container Identification</span>
        <div class="box-content" style="font-family: monospace; font-size: 11px; font-weight: 700;">
          ${containerNo}
        </div>
      </div>

      <div style="border-right: 1px solid #000; padding: 6px 8px;">
        <span class="box-num">16</span><span class="box-title">Seal Number(s)</span>
        <div class="box-content" style="font-family: monospace; font-size: 11px; font-weight: 700;">
          ${sealNo}
        </div>
      </div>

      <div style="border-right: 1px solid #000; padding: 6px 8px;">
        <span class="box-num">17</span><span class="box-title">Size & Type</span>
        <div class="box-content" style="font-weight: 700;">
          1 x 20'
        </div>
      </div>

      <div style="border-right: 1px solid #000; padding: 6px 8px;">
        <span class="box-num">18</span><span class="box-title">Tare Mass (kg)</span>
        <div class="box-content" style="font-family: monospace; font-weight: 700;">
          ${tareKg.toLocaleString()}
        </div>
      </div>

      <div style="padding: 6px 8px;">
        <span class="box-num">19</span><span class="box-title">Total Gross (incl. tare)</span>
        <div class="box-content" style="font-family: monospace; font-size: 11px; font-weight: 900; color: #047857;">
          ${totalVgmKg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KGS
        </div>
      </div>
    </div>

    <!-- Boxes 20, 21, 22: Declarations & Certifications -->
    <div class="cert-row">
      <!-- Box 20: Container Packing Certificate -->
      <div style="border-right: 1px solid #000; padding: 8px;">
        <span class="box-num">20</span><span class="box-title">Container Packing Certificate</span>
        <div class="legal-text" style="margin-top: 3px;">
          I hereby declare that the goods described above have been placed/loaded into the container/vehicle identified above in accordance with the applicable provisions.
        </div>
        <div style="margin-top: 8px; font-size: 9px; line-height: 1.4;">
          <strong>Company:</strong> ${invoice.exporterName}<br/>
          <strong>Name/Status of Declarant:</strong> ${declarantName} / ${declarantStatus}<br/>
          <strong>Place and Date:</strong> ${dateStr}
        </div>
        <div style="margin-top: 10px;">
          <div style="height: 24px; border-bottom: 1px solid #000; width: 65%;"></div>
          <span style="font-size: 8px; color: #444; padding-top: 2px; display: block;">Signature of Declarant</span>
        </div>
      </div>

      <!-- Box 21 & Box 22 -->
      <div style="display: flex; flex-direction: column;">
        <!-- Box 21: Receiving Organization -->
        <div style="border-bottom: 1px solid #000; padding: 6px 8px; flex: 1;">
          <span class="box-num">21</span><span class="box-title">Receiving Organization Receipt</span>
          <div class="legal-text" style="margin-top: 2px;">
            Received the above number of packages/containers/trailers in apparent good order and condition, unless stated hereon:
          </div>
          <div style="margin-top: 6px; font-size: 8.5px; color: #333;">
            Haulier's Name: ${invoice.haulierName ? `<strong>${invoice.haulierName}</strong>` : '________________________'} &nbsp;&nbsp;|&nbsp;&nbsp; Vehicle Reg: ${invoice.vehicleRegNo ? `<strong>${invoice.vehicleRegNo}</strong>` : '____________________'}
          </div>
        </div>

        <!-- Box 22: Shipper's Declaration / Certification -->
        <div style="padding: 6px 8px; flex: 1.2;">
          <span class="box-num">22</span><span class="box-title">Shipper's Declaration & Signature</span>
          <div style="font-size: 9px; line-height: 1.35; margin-top: 2px;">
            <strong>${invoice.exporterName}</strong><br/>
            <span>Name/Status: <strong>${declarantName} / ${declarantStatus}</strong></span><br/>
            <span>Place & Date: <strong>${dateStr}</strong></span>
          </div>
          <div style="margin-top: 10px;">
            <div style="height: 24px; border-bottom: 1px solid #000; width: 65%;"></div>
            <span style="font-size: 8px; color: #444; padding-top: 2px; display: block;">Authorized HazMat Shipper Signature</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`;

  return {
    id: `doc-dg-${Date.now()}`,
    shipmentId: invoice.id,
    documentType: 'DG',
    documentNumber: docNumber,
    templateName: template.name,
    title: `IMO Multimodal Dangerous Goods Declaration — ${docNumber}`,
    generatedAt: `${now.toLocaleDateString('en-GB')}, ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    containersSummary,
    formattedHtml: htmlContent
  };
}
