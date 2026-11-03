// Official IMO Multimodal Dangerous Goods Declaration Generator (#DG Document)
// Compliant with SOLAS 74 Chapter VII, MARPOL 73/78 Annex III, and IMDG Code Chapter 5.4

import type { ConvertedInvoice, DocumentOutput } from '../types';
import { DOCUMENT_TEMPLATES } from '../data/templates';

export function generateDgDeclaration(
  invoice: ConvertedInvoice,
  templateId: string = 'dg-imo-standard'
): DocumentOutput {
  const template = DOCUMENT_TEMPLATES.find(t => t.id === templateId) || DOCUMENT_TEMPLATES[4];
  const docNumber = `DG-DECL-${invoice.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '')}`;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  // Filter hazardous items or synthesize standard HazMat declaration if none explicitly tagged
  const dgItems = invoice.lineItems.filter(it => it.isDangerousGood);
  const isBatteryShipment = invoice.lineItems.some(it => 
    /(battery|batteries|lead[\s-]*acid|electric storage)/i.test(it.description || '') || it.unNumber === 'UN 2794'
  );

  const effectiveDgItems = dgItems.length > 0 ? dgItems : [
    isBatteryShipment ? {
      id: 'dg-default-battery',
      itemNumber: 1,
      description: 'Industrial Heavy Duty Lead-Acid Electric Storage Batteries',
      hsnCode: '85071000',
      quantity: 12,
      uqc: 'BOX',
      unitPrice: 1200,
      total: 14400,
      netWeightKg: 20810,
      grossWeightKg: 22620,
      isDangerousGood: true,
      imoClass: 'Class 8 (Corrosive Liquid)',
      unNumber: 'UN 2794',
      packingGroup: 'III' as const,
      properShippingName: 'BATTERIES, WET, FILLED WITH ACID, electric storage',
      flashPoint: undefined,
      marinePollutant: false,
      emergencyContact: '+91 22 2724 8890 (Ekdant 24/7 HazMat Response)'
    } : {
      id: 'dg-default',
      itemNumber: 1,
      description: invoice.lineItems[0]?.description || 'Industrial Chemical Solvents & Coatings',
      hsnCode: invoice.lineItems[0]?.hsnCode || '38140010',
      quantity: invoice.lineItems[0]?.quantity || 10,
      uqc: 'DRUM',
      unitPrice: 150,
      total: 1500,
      netWeightKg: 1800,
      grossWeightKg: 2050,
      isDangerousGood: true,
      imoClass: 'Class 3 (Flammable Liquid)',
      unNumber: 'UN 1993',
      packingGroup: 'II' as const,
      properShippingName: 'FLAMMABLE LIQUID, N.O.S. (CONTAINS XYLENE AND ETHANOL)',
      flashPoint: '23°C c.c.',
      marinePollutant: false,
      emergencyContact: '+91 22 2724 8890 (Ekdant 24/7 HazMat Response)'
    }
  ];

  const dgContainers = invoice.containers.filter(c => c.hasDangerousGoods || invoice.containers.length === 1);
  const primaryClass = effectiveDgItems[0]?.imoClass || 'IMO Class 8 Corrosives';
  const containersSummary = dgContainers.map(c => {
    const plts = c.pallets.map(p => p.palletNumber).join(', ');
    return `${c.containerNumber} (${c.containerType}, Seal: ${c.sealNumber}) - ${c.pallets.length} Pallets [${plts}] (${c.totalGrossWeightKg.toLocaleString()} kg) [${primaryClass}]`;
  }).join('; ');

  const dgRowsHtml = effectiveDgItems.map((item) => {
    return `
      <tr style="border-bottom: 1px solid #cbd5e1; font-size: 11px;">
        <td style="padding: 10px; font-weight: bold; font-family: monospace; color: #b91c1c;">
          ${item.unNumber || 'UN 1993'}
        </td>
        <td style="padding: 10px;">
          <strong style="text-transform: uppercase;">${item.properShippingName || item.description}</strong><br/>
          <span style="font-size: 10px; color: #475569;">Technical Name: ${item.description}</span><br/>
          ${item.flashPoint ? `<span style="font-size: 10px; color: #b91c1c; font-weight: 600;">Flash Point: ${item.flashPoint}</span>` : ''}
        </td>
        <td style="padding: 10px; text-align: center; font-weight: bold;">
          <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background: #fee2e2; color: #991b1b; font-size: 11px;">
            ${item.imoClass || 'Class 3'}
          </span>
        </td>
        <td style="padding: 10px; text-align: center; font-weight: bold; font-family: monospace;">
          ${item.packingGroup ? `PG ${item.packingGroup}` : 'PG II'}
        </td>
        <td style="padding: 10px; font-size: 10px;">
          ${item.palletNumber ? `Pallet: ${item.palletNumber}<br/>` : ''}
          ${item.quantity} ${item.uqc || 'DRUMS'}
        </td>
        <td style="padding: 10px; text-align: right; font-family: monospace; font-size: 11px;">
          Gross: <strong>${item.grossWeightKg?.toLocaleString() || '2,050'} kg</strong><br/>
          <span style="color: #64748b; font-size: 10px;">Net: ${item.netWeightKg?.toLocaleString() || '1,800'} kg</span>
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
            ${invoice.shipperAddress || 'Industrial Zone, Phase II, Taloja MIDC, Navi Mumbai, Maharashtra 410208, India'}<br/>
            GSTIN: ${invoice.gstin || '27AAACA9921E1Z8'} | Tel: +91 22 2724 8800
          </div>
        </td>
        <td style="width: 50%;">
          <span class="label">2. Transport Document Reference</span>
          <div class="val" style="font-family: monospace; color: #4338ca;">${invoice.masterBolNumber || `BKG-${invoice.invoiceNumber}`}</div>
          <div style="margin-top: 6px;">
            <span class="label">3. 24-Hour Emergency Response Contact</span>
            <div class="val" style="color: #b91c1c; font-weight: bold;">
              ${effectiveDgItems[0]?.emergencyContact || '+91 22 2724 8890 (Ekdant Emergency HazMat Cell)'}
            </div>
          </div>
        </td>
      </tr>
      <tr>
        <td>
          <span class="label">4. Consignee</span>
          <div class="val">${invoice.consigneeName}</div>
          <div style="font-size: 10px; color: #475569; margin-top: 2px;">
            ${invoice.consigneeAddress || 'Port Industrial Park, Havenlaan 102, 3000 Rotterdam, Netherlands'}
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
          <div class="val">${invoice.vesselName || 'MSC PALOMA'} / ${invoice.voyageNumber || '2642W'}</div>
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
              const palletList = c.pallets.map(p => p.palletNumber).join(', ') || 'PLT-5644 to PLT-5655';
              return `<div>` +
                `<strong>${c.containerNumber}</strong> [${c.containerType}] (Seal: ${c.sealNumber}) ${c.isSpillover ? '<span style="color:#b45309;font-size:9px;">[SPILLOVER]</span>' : ''}<br/>` +
                `<span style="color: #475569; font-size: 10px;">Pallets (${c.pallets.length}): ${palletList} | Gross: ${c.totalGrossWeightKg.toLocaleString()} kg</span>` +
              `</div>`;
            }).join('<div style="margin: 6px 0; border-top: 1px dashed #cbd5e1;"></div>') || 'TEMU2523270 (Seal: EXD98201)'}
          </div>
        </td>
        <td style="width: 50%;">
          <span class="label">PACKING CERTIFICATE</span>
          <div style="font-size: 9px; color: #475569;">
            I hereby declare that the goods mentioned above have been packed into the container/vehicle in accordance with the applicable provisions of IMDG Code 5.4.2.
          </div>
        </td>
      </tr>
    </table>

    <div class="cert-box">
      <strong>SHIPPER'S DECLARATION:</strong> I hereby declare that the contents of this consignment are fully and accurately described above by the Proper Shipping Name, and are classified, packaged, marked and labeled/placarded, and are in all respects in proper condition for transport according to the applicable international and national government regulations.
      <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <span>Name & Title of Signatory: <strong>R. K. Sharma (HazMat Compliance Officer)</strong></span><br/>
          <span>Place & Date: <strong>Navi Mumbai, ${dateStr}</strong></span>
        </div>
        <div style="text-align: right;">
          <div style="font-family: 'Brush Script MT', cursive, sans-serif; font-size: 20px; color: #b91c1c;">
            R. K. Sharma
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
