// Master Bill of Lading (BOL) Document Generator
// Formats multi-container & pallet breakdowns with corporate carrier layouts

import type { ConvertedInvoice, DocumentOutput } from '../types';
import { DOCUMENT_TEMPLATES } from '../data/templates';

export function generateMasterBol(
  invoice: ConvertedInvoice,
  templateId: string = 'bol-standard'
): DocumentOutput {
  const template = DOCUMENT_TEMPLATES.find(t => t.id === templateId) || DOCUMENT_TEMPLATES[0];
  const docNumber = invoice.masterBolNumber || `BOL-EKD-${invoice.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '')}`;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const totalGross = invoice.containers.reduce((s, c) => s + c.totalGrossWeightKg, 0) || invoice.grossWeightKg;
  const totalPackages = invoice.containers.reduce((s, c) => s + c.totalPackages, 0) || invoice.totalPackages;
  const totalPallets = invoice.containers.reduce((s, c) => s + c.pallets.length, 0) || invoice.totalPallets;

  // Build containers summary text e.g. "MSCU7829104 (Seal EMC883921) - 4 Pallets (4,800 kg)"
  const containersSummary = invoice.containers.map(c => 
    `${c.containerNumber} [${c.containerType}] (Seal: ${c.sealNumber}) - ${c.pallets.length} Pallets, ${c.totalGrossWeightKg.toLocaleString()} kg`
  ).join('; ');

  const containerRowsHtml = invoice.containers.map((cont) => {
    const isExideMUMGA = invoice.bookingNumber === 'MUMGA3747500' || cont.containerNumber === 'ONEU2878769';
    const palletSerials = isExideMUMGA
      ? `<strong>Pallet Serial Ranges (22 Pallets Total):</strong><br/>` +
        `• 4956 TO 4963 (8 Pallets - 357 Boxes)<br/>` +
        `• 4964 (1 Pallet - 75 Boxes)<br/>` +
        `• 4533 TO 4546 (6 Pallets - 29 Boxes)<br/>` +
        `• TAL/1703/2026 TO TAL/1705/2026 (3 Pallets - 95 Boxes)<br/>` +
        `• TAL/1706/2026 TO TAL/1709/2026 (4 Pallets - 120 Boxes)`
      : (cont.pallets.length > 0
        ? cont.pallets.map(p => p.palletNumber).join(', ')
        : 'PLT-5644 to PLT-5655');
    const cbmEstimate = (cont.totalGrossWeightKg / 300).toFixed(2);
    const shippingBillNote = isExideMUMGA
      ? '<br/><span style="display: inline-block; padding: 2px 6px; border-radius: 4px; background: #e0f2fe; color: #0369a1; font-size: 9px; font-weight: 700; margin-top: 4px;">S/B: 7463800 Dt. 07.10.2026</span>'
      : '';
    const vgmNote = cont.tareWeightKg
      ? `<br/><span style="font-size: 9px; color: #047857; font-weight: 600;">VGM (incl. tare): ${(cont.totalGrossWeightKg + cont.tareWeightKg).toLocaleString()} KGS</span>`
      : '';

    return `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
        <td style="padding: 10px; font-weight: bold; font-family: monospace;">
          ${cont.containerNumber}<br/>
          <span style="font-weight: normal; color: #64748b; font-size: 10px;">Seal: ${cont.sealNumber}</span><br/>
          <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; background: #e0e7ff; color: #3730a3; font-size: 9px; font-weight: 700; margin-top: 4px;">${cont.containerType}</span>
          ${cont.isSpillover ? '<br/><span style="display: inline-block; padding: 1px 5px; border-radius: 3px; background: #fef3c7; color: #b45309; font-size: 8px; font-weight: 700; margin-top: 2px;">SPILLOVER UNIT</span>' : ''}
          ${shippingBillNote}
        </td>
        <td style="padding: 10px; font-family: monospace;">
          <strong>${cont.pallets.length} Pallets</strong><br/>
          <div style="color: #4338ca; font-size: 9.5px; line-height: 1.35; margin-top: 2px; max-width: 250px; word-break: break-word;">
            ${palletSerials}
          </div>
          <span style="color: #475569; font-size: 10px; margin-top: 3px; display: inline-block; font-weight: 600;">${cont.totalPackages} Packages (${cont.totalPackages} Boxes)</span>
        </td>
        <td style="padding: 10px;">
          <strong>STC: ${invoice.lineItems[0]?.description || 'Commercial Merchandise'}</strong><br/>
          <span style="font-size: 10px; color: #64748b;">Invoices: ${invoice.invoiceNumber} | Incoterm: ${invoice.incoterm}</span><br/>
          ${cont.hasDangerousGoods ? '<span style="color: #dc2626; font-weight: bold; font-size: 10px;">⚠ DANGEROUS GOODS (IMO CLASS 8 / UN 2794 / PG III)</span><br/><span style="font-size: 9px; color: #b91c1c;">BATTERIES, WET, FILLED WITH ACID (Technical: Lead Acid Storage Batteries)</span>' : '<span style="color: #16a34a; font-size: 10px;">Non-Hazardous General Cargo</span>'}
        </td>
        <td style="padding: 10px; text-align: right; font-family: monospace; font-weight: bold;">
          ${cont.totalGrossWeightKg.toLocaleString()} KGS<br/>
          <span style="font-weight: normal; color: #64748b; font-size: 10px;">Net: ${cont.totalNetWeightKg.toLocaleString()} KGS</span>
          ${vgmNote}
        </td>
        <td style="padding: 10px; text-align: right; font-family: monospace;">
          ${cbmEstimate} CBM
        </td>
      </tr>
    `;
  }).join('');

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Master Bill of Lading - ${docNumber}</title>
  <style>
    @media print {
      body { margin: 0; padding: 0; background: #fff; }
      .no-print { display: none !important; }
    }
    body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 20px; }
    .bol-container { max-width: 900px; margin: 0 auto; background: #fff; border: 2px solid #0f172a; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .header-table td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; font-size: 11px; }
    .label { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 3px; display: block; }
    .val { font-size: 11px; font-weight: 600; color: #0f172a; }
    .title-banner { background: #0f172a; color: #fff; padding: 8px 12px; font-size: 16px; font-weight: 800; letter-spacing: 1px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .items-table { width: 100%; border-collapse: collapse; margin-top: 10px; border: 1px solid #0f172a; }
    .items-table th { background: #f1f5f9; padding: 8px; font-size: 10px; text-transform: uppercase; font-weight: 800; border-bottom: 2px solid #0f172a; text-align: left; }
    .footer-terms { font-size: 8px; color: #64748b; line-height: 1.3; margin-top: 14px; padding-top: 8px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="bol-container">
    <div class="title-banner">
      <span>EKDANT LOGISTICS — MASTER BILL OF LADING</span>
      <span style="font-size: 11px; font-family: monospace;">B/L NO: ${docNumber}</span>
    </div>

    <table class="header-table">
      <tr>
        <td style="width: 50%;">
          <span class="label">1. Shipper / Exporter</span>
          <div class="val">${invoice.exporterName}</div>
          <div style="font-size: 10px; color: #475569; margin-top: 2px;">
            ${invoice.shipperAddress || 'Industrial Zone, Phase II, Taloja MIDC, Navi Mumbai, Maharashtra 410208, India'}<br/>
            IEC: ${invoice.iec || '0391048291'} | GSTIN: ${invoice.gstin || '27AAACA9921E1Z8'}
          </div>
        </td>
        <td style="width: 50%;">
          <span class="label">B/L Number & Booking Reference</span>
          <div class="val" style="font-family: monospace; font-size: 13px; color: #4338ca;">${docNumber}</div>
          <div style="margin-top: 6px;">
            <span class="label">Booking Number</span>
            <span class="val">${invoice.bookingNumber || `BKG-${invoice.invoiceNumber}`}</span>
          </div>
          <div style="margin-top: 6px;">
            <span class="label">Carrier Template</span>
            <span style="font-size: 10px; font-weight: 600; color: #0284c7;">${template.name}</span>
          </div>
        </td>
      </tr>
      <tr>
        <td>
          <span class="label">2. Consignee (or Order of)</span>
          <div class="val">${invoice.consigneeName}</div>
          <div style="font-size: 10px; color: #475569; margin-top: 2px;">
            ${invoice.consigneeAddress || 'Port Industrial Park, Havenlaan 102, 3000 Rotterdam, Netherlands'}
          </div>
        </td>
        <td>
          <span class="label">3. Notify Party (Carrier not responsible for failure to notify)</span>
          <div class="val">${invoice.notifyParty || invoice.consigneeName}</div>
          <div style="font-size: 10px; color: #475569;">SAME AS CONSIGNEE</div>
        </td>
      </tr>
      <tr>
        <td>
          <span class="label">Pre-Carriage By</span>
          <div class="val">Motor Truck / Intermodal Rail</div>
        </td>
        <td>
          <span class="label">Place of Receipt</span>
          <div class="val">CFS Mulund / JNPT Nhava Sheva, India</div>
        </td>
      </tr>
      <tr>
        <td>
          <span class="label">Ocean Vessel & Voyage No.</span>
          <div class="val">${invoice.vesselName || 'MSC PALOMA'} / ${invoice.voyageNumber || '2642W'}</div>
        </td>
        <td>
          <span class="label">Port of Loading</span>
          <div class="val">${invoice.portOfLoading}</div>
        </td>
      </tr>
      <tr>
        <td>
          <span class="label">Port of Discharge</span>
          <div class="val">${invoice.portOfDischarge}</div>
        </td>
        <td>
          <span class="label">Place of Delivery</span>
          <div class="val">${invoice.portOfDischarge} Container Terminal</div>
        </td>
      </tr>
    </table>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 25%;">Container No. / Seal No.</th>
          <th style="width: 18%;">Pallets / Packages</th>
          <th style="width: 32%;">Description of Goods & Marks</th>
          <th style="width: 15%; text-align: right;">Gross Weight</th>
          <th style="width: 10%; text-align: right;">Measurement</th>
        </tr>
      </thead>
      <tbody>
        ${containerRowsHtml}
      </tbody>
      <tfoot>
        <tr style="background: #f8fafc; font-weight: bold; border-top: 2px solid #0f172a; font-size: 11px;">
          <td style="padding: 8px;">TOTALS: ${invoice.containers.length} CONTAINER(S)</td>
          <td style="padding: 8px;">${totalPallets} PALLETS (${totalPackages} PKGS)</td>
          <td style="padding: 8px;">FCL/FCL SHIPMENT</td>
          <td style="padding: 8px; text-align: right; font-family: monospace;">${totalGross.toLocaleString()} KGS</td>
          <td style="padding: 8px; text-align: right; font-family: monospace;">${(totalGross / 300).toFixed(2)} CBM</td>
        </tr>
      </tfoot>
    </table>

    <div style="margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
      <div style="border: 1px solid #cbd5e1; padding: 10px; font-size: 10px;">
        <span class="label">Freight & Charges</span>
        <div class="val" style="font-size: 12px; color: #16a34a; font-weight: bold;">
          ${invoice.incoterm === 'CIF' || invoice.incoterm === 'CFR' ? 'FREIGHT PREPAID' : 'FREIGHT COLLECT'}
        </div>
        <div style="margin-top: 6px; font-size: 9px; color: #64748b;">
          Payable at: ${invoice.incoterm === 'CIF' ? invoice.portOfLoading : invoice.portOfDischarge}
        </div>
      </div>

      <div style="border: 1px solid #cbd5e1; padding: 10px; font-size: 10px; text-align: right;">
        <span class="label">Dated at & Certified By</span>
        <div class="val">Ekdant Logistics Pvt Ltd</div>
        <div style="font-size: 9px; color: #64748b; margin-top: 4px;">
          As Agents for Carrier | Date of Issue: ${dateStr}
        </div>
        <div style="margin-top: 8px; font-family: 'Brush Script MT', cursive, sans-serif; font-size: 18px; color: #1e293b;">
          Authorized Signature
        </div>
      </div>
    </div>

    <div class="footer-terms">
      RECEIVED by the Carrier in apparent good order and condition unless otherwise indicated herein. In accepting this Bill of Lading, the Merchant agrees to be bound by all the terms, conditions, and exceptions whether written, printed, or stamped on both sides. Verified Gross Mass (VGM) declared in accordance with SOLAS Convention Chapter VI, Part A, Regulation 2.
    </div>
  </div>
</body>
</html>
`;

  return {
    id: `doc-bol-${Date.now()}`,
    shipmentId: invoice.id,
    documentType: 'BOL',
    documentNumber: docNumber,
    templateName: template.name,
    title: `Master Bill of Lading — ${docNumber}`,
    generatedAt: `${dateStr}, ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    containersSummary,
    formattedHtml: htmlContent
  };
}

export function printDocument(htmlContent: string): void {
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  }
}

export function downloadDocumentHtml(doc: DocumentOutput): void {
  const blob = new Blob([doc.formattedHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${doc.documentNumber}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
