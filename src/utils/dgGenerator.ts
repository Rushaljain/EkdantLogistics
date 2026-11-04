// Official IMO Multimodal Dangerous Goods Declaration Generator (#DG Document)
// Compliant with SOLAS 74 Chapter VII, MARPOL 73/78 Annex III, and IMDG Code Chapter 5.4

import type { ConvertedInvoice, DocumentOutput, LineItem } from '../types';
import { DOCUMENT_TEMPLATES } from '../data/templates';

// Helper to format pallet numbers compactly into ranges if sequential
function formatPalletRanges(palletNumbers: string[]): string {
  if (palletNumbers.length === 0) return 'None';
  if (palletNumbers.length <= 4) return palletNumbers.join(', ');

  // Try extracting numeric suffixes e.g. PLT-5644 -> 5644
  const parsed = palletNumbers.map(p => {
    const m = p.match(/^(.*?)(\d+)$/);
    return m ? { prefix: m[1], num: parseInt(m[2], 10), raw: p } : { prefix: p, num: null, raw: p };
  });

  const canRange = parsed.every(p => p.num !== null && p.prefix === parsed[0].prefix);
  if (canRange) {
    const prefix = parsed[0].prefix;
    const nums = parsed.map(p => p.num as number);
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    if (max - min + 1 === nums.length) {
      return `${prefix}${min} to ${prefix}${max} (${nums.length} Pallets)`;
    }
  }

  return `${palletNumbers.slice(0, 3).join(', ')} ... +${palletNumbers.length - 3} more (${palletNumbers.length} Pallets)`;
}

export function generateDgDeclaration(
  invoice: ConvertedInvoice,
  templateId: string = 'dg-imo-standard'
): DocumentOutput {
  const template = DOCUMENT_TEMPLATES.find(t => t.id === templateId) || DOCUMENT_TEMPLATES[4];
  
  // Clean doc number
  const sanitizedInv = (invoice.invoiceNumber || 'EXP').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  const docNumber = `DG-DECL-${sanitizedInv || Date.now()}`;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  // Filter hazardous items or identify DG line items
  const dgItems = invoice.lineItems.filter(it => it.isDangerousGood);
  const isBatteryShipment = invoice.lineItems.some(it => 
    /(battery|batteries|lead[\s-]*acid|electric storage)/i.test(it.description || '') || it.unNumber === 'UN 2794'
  );

  const effectiveDgItems: LineItem[] = dgItems.length > 0 ? dgItems : [
    isBatteryShipment ? {
      id: 'dg-default-battery',
      itemNumber: 1,
      description: invoice.lineItems[0]?.description || 'Industrial Lead-Acid Electric Storage Batteries',
      hsnCode: invoice.lineItems[0]?.hsnCode || '85071000',
      quantity: invoice.totalPackages || invoice.lineItems[0]?.quantity || 1,
      uqc: invoice.packageType || 'BOX',
      unitPrice: invoice.lineItems[0]?.unitPrice || 0,
      total: invoice.invoiceTotal || 0,
      netWeightKg: invoice.netWeightKg || 0,
      grossWeightKg: invoice.grossWeightKg || 0,
      isDangerousGood: true,
      imoClass: 'Class 8 (Corrosive)',
      unNumber: 'UN 2794',
      packingGroup: 'III' as const,
      properShippingName: 'BATTERIES, WET, FILLED WITH ACID',
      flashPoint: undefined,
      marinePollutant: false,
      emergencyContact: invoice.emergencyContact || '+91 22 2724 8890 (24/7 HazMat Response)'
    } : {
      id: 'dg-default',
      itemNumber: 1,
      description: invoice.lineItems[0]?.description || 'Hazardous Chemical Material',
      hsnCode: invoice.lineItems[0]?.hsnCode || '38140010',
      quantity: invoice.lineItems[0]?.quantity || invoice.totalPackages || 1,
      uqc: invoice.packageType || 'PKG',
      unitPrice: invoice.lineItems[0]?.unitPrice || 0,
      total: invoice.invoiceTotal || 0,
      netWeightKg: invoice.netWeightKg || 0,
      grossWeightKg: invoice.grossWeightKg || 0,
      isDangerousGood: true,
      imoClass: 'Class 3 (Flammable Liquid)',
      unNumber: 'UN 1993',
      packingGroup: 'II' as const,
      properShippingName: 'FLAMMABLE LIQUID, N.O.S.',
      flashPoint: '23°C c.c.',
      marinePollutant: false,
      emergencyContact: invoice.emergencyContact || '+91 22 2724 8890 (24/7 HazMat Response)'
    }
  ];

  // Dynamic signatory information - strictly derived from invoice or neutral defaults
  const signatoryName = invoice.signatoryName || 'Authorized Signatory';
  const signatoryTitle = invoice.signatoryTitle || 'Shipper / Authorized HazMat Officer';
  const signatoryPlace = invoice.portOfLoading || invoice.placeOfReceipt || 'Nhava Sheva, India';
  const emergencyPhone = invoice.emergencyContact || effectiveDgItems[0]?.emergencyContact || '+91 22 2724 8890 (24/7 Response)';

  const dgContainers = invoice.containers.filter(c => c.hasDangerousGoods || invoice.containers.length === 1);
  const primaryClass = effectiveDgItems[0]?.imoClass || 'IMO Class 8 Corrosives';
  
  const containersSummary = dgContainers.map(c => {
    const plts = formatPalletRanges(c.pallets.map(p => p.palletNumber));
    return `${c.containerNumber} (${c.containerType}, Seal: ${c.sealNumber}) - ${c.pallets.length} Pallets [${plts}] (${c.totalGrossWeightKg.toLocaleString()} kg) [${primaryClass}]`;
  }).join('; ');

  const dgRowsHtml = effectiveDgItems.map((item) => {
    return `
      <tr style="border-bottom: 1px solid #cbd5e1; font-size: 11px;">
        <td style="padding: 10px; font-weight: bold; font-family: monospace; color: #b91c1c;">
          ${item.unNumber || 'UN 2794'}
        </td>
        <td style="padding: 10px;">
          <strong style="text-transform: uppercase;">${item.properShippingName || item.description}</strong><br/>
          <span style="font-size: 10px; color: #475569;">Technical Name: ${item.description}</span><br/>
          ${item.flashPoint ? `<span style="font-size: 10px; color: #b91c1c; font-weight: 600;">Flash Point: ${item.flashPoint}</span>` : ''}
        </td>
        <td style="padding: 10px; text-align: center; font-weight: bold;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background: #fee2e2; color: #991b1b; font-size: 11px;">
            ${item.imoClass || 'Class 8'}
          </span>
        </td>
        <td style="padding: 10px; text-align: center; font-weight: bold; font-family: monospace;">
          ${item.packingGroup ? (String(item.packingGroup).toUpperCase().includes('PG') ? item.packingGroup : `PG ${item.packingGroup}`) : 'NIL'}
        </td>
        <td style="padding: 10px; font-size: 10px;">
          ${item.palletNumber ? `Pallet: ${item.palletNumber}<br/>` : ''}
          ${item.quantity ? `${item.quantity.toLocaleString()} ${item.uqc || 'BOX'}` : ''}
        </td>
        <td style="padding: 10px; text-align: right; font-family: monospace; font-size: 11px;">
          Gross: <strong>${item.grossWeightKg ? item.grossWeightKg.toLocaleString() : '—'} kg</strong><br/>
          <span style="color: #64748b; font-size: 10px;">Net: ${item.netWeightKg ? item.netWeightKg.toLocaleString() : '—'} kg</span>
        </td>
      </tr>
    `;
  }).join('');

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>IMO Multimodal Dangerous Goods Declaration - ${docNumber}</title>
  <style>
    @media print {
      body { margin: 0; padding: 0; background: #fff; }
      .no-print { display: none !important; }
    }
    body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 20px; }
    .dg-container { max-width: 900px; margin: 0 auto; background: #fff; border: 2px solid #b91c1c; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
    .header-banner { background: #b91c1c; color: #fff; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .header-banner h1 { margin: 0; font-size: 15px; font-weight: 800; letter-spacing: 0.5px; }
    .table-grid { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .table-grid td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; font-size: 11px; }
    .label { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 3px; display: block; }
    .val { font-size: 11px; font-weight: 600; color: #0f172a; }
    .dg-table { width: 100%; border-collapse: collapse; margin-top: 10px; border: 1px solid #b91c1c; }
    .dg-table th { background: #fef2f2; color: #991b1b; padding: 8px; font-size: 10px; text-transform: uppercase; font-weight: 800; border-bottom: 2px solid #b91c1c; text-align: left; }
    .hazmat-badge { border: 2px solid #b91c1c; padding: 8px 12px; background: #fff5f5; border-radius: 6px; margin: 12px 0; font-size: 11px; color: #7f1d1d; line-height: 1.4; }
    .cert-box { border: 1px solid #cbd5e1; padding: 10px; font-size: 9px; color: #475569; line-height: 1.4; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="dg-container">
    <div class="header-banner">
      <div>
        <h1>MULTIMODAL DANGEROUS GOODS DECLARATION</h1>
        <span style="font-size: 10px; opacity: 0.9;">IMO / IMDG CODE COMPLIANT FORM</span>
      </div>
      <div style="text-align: right; font-family: monospace; font-size: 12px; font-weight: bold;">
        DOC NO: ${docNumber}
      </div>
    </div>

    <table class="table-grid">
      <tr>
        <td style="width: 50%;">
          <span class="label">1. Shipper / Consignor (Name, address, contact)</span>
          <div class="val">${invoice.exporterName}</div>
          <div style="font-size: 10px; color: #475569; margin-top: 2px;">
            ${invoice.shipperAddress ? `${invoice.shipperAddress}<br/>` : ''}
            ${[invoice.gstin ? `GSTIN: ${invoice.gstin}` : '', invoice.iec ? `IEC: ${invoice.iec}` : ''].filter(Boolean).join(' | ')}
          </div>
        </td>
        <td style="width: 50%;">
          <span class="label">2. Transport Document Reference</span>
          <div class="val" style="font-family: monospace; color: #4338ca;">
            ${invoice.masterBolNumber || `BOL-${docNumber.replace('DG-DECL-', '')}`}
            ${invoice.bookingNumber ? `<br/><span style="font-size: 10px; color: #0284c7;">Booking Ref: ${invoice.bookingNumber}</span>` : ''}
            ${invoice.shippingBillNumber ? `<br/><span style="font-size: 10px; color: #047857; font-weight: 700;">Shipping Bill No: ${invoice.shippingBillNumber}</span>` : ''}
          </div>
          <div style="margin-top: 6px;">
            <span class="label">3. 24-Hour Emergency Response Contact</span>
            <div class="val" style="color: #b91c1c; font-weight: bold;">
              ${emergencyPhone}
            </div>
          </div>
        </td>
      </tr>
      <tr>
        <td>
          <span class="label">4. Consignee</span>
          <div class="val">${invoice.consigneeName}</div>
          <div style="font-size: 10px; color: #475569; margin-top: 2px;">
            ${invoice.consigneeAddress || ''}
          </div>
        </td>
        <td>
          <span class="label">5. Freight Forwarder / Broker Management</span>
          <div class="val">Ekdant Logistics Pvt Ltd</div>
          <div style="font-size: 10px; color: #475569;">Licensed Customs Broker & Multimodal Transport Operator</div>
        </td>
      </tr>
      <tr>
        <td>
          <span class="label">6. Vessel / Flight No. & Voyage</span>
          <div class="val">${[invoice.vesselName, invoice.voyageNumber].filter(Boolean).join(' / ') || 'TO BE NOMINATED'}</div>
        </td>
        <td>
          <span class="label">7. Port of Loading</span>
          <div class="val">${invoice.portOfLoading}</div>
        </td>
      </tr>
      <tr>
        <td>
          <span class="label">8. Port of Discharge</span>
          <div class="val">${invoice.portOfDischarge}</div>
        </td>
        <td>
          <span class="label">9. Destination Country</span>
          <div class="val">${invoice.destinationCountry}</div>
        </td>
      </tr>
    </table>

    <div class="hazmat-badge">
      <strong>IMDG CODE HAZARDOUS CARGO DECLARATION:</strong> The goods identified below are classified, packaged, marked, and labeled in accordance with the International Maritime Dangerous Goods (IMDG) Code and are in proper condition for carriage by sea.
    </div>

    <table class="dg-table">
      <thead>
        <tr>
          <th style="width: 15%;">UN Number</th>
          <th style="width: 35%;">Proper Shipping Name & Technical Name</th>
          <th style="width: 14%; text-align: center;">Class / Div</th>
          <th style="width: 10%; text-align: center;">Packing Grp</th>
          <th style="width: 14%;">Packages</th>
          <th style="width: 12%; text-align: right;">Mass (Gross/Net)</th>
        </tr>
      </thead>
      <tbody>
        ${dgRowsHtml}
      </tbody>
    </table>

    <table class="table-grid" style="margin-top: 12px;">
      <tr>
        <td style="width: 50%;">
          <span class="label">CONTAINER / VEHICLE IDENTIFICATION & ALLOCATED PALLETS</span>
          <div class="val" style="font-family: monospace; font-size: 11px; color: #0284c7; line-height: 1.5;">
            ${dgContainers.map(c => {
              const palletList = `<div style="color: #475569; font-size: 10px; margin-top: 2px;">` +
                `<strong>Pallets (${c.pallets.length}):</strong> ${formatPalletRanges(c.pallets.map(p => p.palletNumber))}` +
                `</div>`;
              return `<div>` +
                `<strong>${c.containerNumber}</strong> [${c.containerType}] (Seal: ${c.sealNumber || 'N/A'}) ${c.isSpillover ? '<span style="color:#b45309;font-size:9px;">[SPILLOVER]</span>' : ''}<br/>` +
                palletList +
                `<div style="margin-top: 4px; font-size: 10px; color: #334155;">` +
                  `<strong>Cargo Net:</strong> ${c.totalNetWeightKg.toLocaleString()} kg | <strong>Cargo Gross:</strong> ${c.totalGrossWeightKg.toLocaleString()} kg` +
                  (c.tareWeightKg ? ` | <strong>Tare:</strong> ${c.tareWeightKg.toLocaleString()} kg | <strong style="color: #047857;">Total VGM: ${(c.totalGrossWeightKg + c.tareWeightKg).toLocaleString()} kg</strong>` : '') +
                `</div>` +
              `</div>`;
            }).join('<div style="margin: 8px 0; border-top: 1px dashed #cbd5e1;"></div>')}
          </div>
        </td>
        <td style="width: 50%;">
          <span class="label">PACKING CERTIFICATE & DANGEROUS GOODS CONTROL</span>
          <div style="font-size: 9px; color: #475569; line-height: 1.45;">
            I hereby declare that the goods mentioned above have been packed into the container/vehicle in accordance with the applicable provisions of IMDG Code 5.4.2.<br/><br/>
            <strong>Segregation Group:</strong> SGG1 (Acids)<br/>
            <strong>EMS Numbers:</strong> F-A, S-B (Spillage: S-B, Fire: F-A)<br/>
            <strong>Emergency Contact:</strong> ${emergencyPhone}
          </div>
        </td>
      </tr>
    </table>

    <div class="cert-box">
      <strong>SHIPPER'S DECLARATION:</strong> I hereby declare that the contents of this consignment are fully and accurately described above by the Proper Shipping Name, and are classified, packaged, marked and labeled/placarded, and are in all respects in proper condition for transport according to the applicable international and national government regulations.
      <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <span>Name & Title of Signatory: <strong>${signatoryName} (${signatoryTitle})</strong></span><br/>
          <span>Place & Date: <strong>${signatoryPlace}, ${dateStr}</strong></span>
        </div>
        <div style="text-align: right;">
          <div style="font-family: 'Brush Script MT', cursive, sans-serif; font-size: 20px; color: #b91c1c;">
            ${signatoryName}
          </div>
          <span style="font-size: 9px; color: #64748b; border-top: 1px solid #94a3b8; display: inline-block; padding-top: 2px;">
            Authorized HazMat Shipper Signature
          </span>
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
    title: `IMO Dangerous Goods Declaration — ${docNumber}`,
    generatedAt: `${dateStr}, ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    containersSummary,
    formattedHtml: htmlContent
  };
}
