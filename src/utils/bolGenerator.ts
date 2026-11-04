// Master Bill of Lading (BOL) Document Generator
// Formats multi-container & pallet breakdowns with corporate carrier layouts matching BL DRAFT specifications

import type { ConvertedInvoice, DocumentOutput } from '../types';
import { DOCUMENT_TEMPLATES } from '../data/templates';
import { formatSequentialPalletRanges } from './dgGenerator';

function numberToWords(num: number): string {
  const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
  const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
  if (num === 0) return 'ZERO';
  if (num < 20) return ones[num];
  if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? '-' + ones[num % 10] : '');
  return String(num);
}

export function generateMasterBol(
  invoice: ConvertedInvoice,
  templateId: string = 'bol-standard'
): DocumentOutput {
  const template = DOCUMENT_TEMPLATES.find(t => t.id === templateId) || DOCUMENT_TEMPLATES[0];
  const templateTitle = template?.name?.toUpperCase() || 'MASTER BILL OF LADING FOR OCEAN TRANSPORT';

  const docNumber = invoice.masterBolNumber || (invoice.bookingNumber ? `BOL-${invoice.bookingNumber}` : `BOL-EKD-${invoice.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '')}`);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const totalGross = invoice.containers.reduce((s, c) => s + c.totalGrossWeightKg, 0) || invoice.grossWeightKg;
  const totalNet = invoice.containers.reduce((s, c) => s + c.totalNetWeightKg, 0) || invoice.netWeightKg;
  const totalPallets = invoice.containers.reduce((s, c) => s + c.pallets.length, 0) || invoice.totalPallets;

  const displayVessel = invoice.vesselName || 'ONE HUMBER';
  const displayVoyage = invoice.voyageNumber || '106E';
  const displayPol = invoice.portOfLoading || 'NHAVA SHEVA, INDIA';
  const displayPod = invoice.portOfDischarge || 'YANGON';
  const displayDelivery = invoice.placeOfDelivery || invoice.finalDestination || 'MYANMAR';
  const displayReceipt = invoice.placeOfReceipt || 'NHAVA SHEVA';

  // Pallet ranges formatting
  const allPallets = invoice.containers.flatMap(c => c.pallets).length > 0
    ? invoice.containers.flatMap(c => c.pallets)
    : (invoice.pallets || []);
  const palletNumbers = allPallets.map(p => p.palletNumber).filter(Boolean);
  const formattedRanges = invoice.palletRanges && invoice.palletRanges.length > 0
    ? invoice.palletRanges
    : formatSequentialPalletRanges(palletNumbers);

  // Marks and numbers block
  const marksLines = (invoice.shippingMarks || 'KAUNG SWANN\nHTET TRADING\nMYANMAR')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  // Goods description components (Statutory override with secondary model specifications)
  const statutoryDescription = invoice.statutoryDescription || 'LEAD ACID AUTOMOTIVE STORAGE BATTERIES';
  const uniqueModels = Array.from(new Set(
    [
      ...invoice.lineItems.map(it => it.modelNumber),
      ...allPallets.map(p => p.modelOrDescription)
    ].filter(Boolean)
  )) as string[];
  const brandName = invoice.brandName || 'DYNEX MATRIX';
  const hsnCode = invoice.hsnCode || '85071000';
  const shippingBills = invoice.shippingBillNumbers
    ? invoice.shippingBillNumbers.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const hazItem = invoice.lineItems.find(it => it.isDangerousGood) || (invoice.hasDangerousGoods ? { unNumber: '2794', imoClass: '8', packingGroup: 'III' } : null);

  const declaredNetWeight = invoice.blDeclaredNetWeightKg || totalNet;

  // Container summary string for metadata
  const containersSummary = invoice.containers.map(c => 
    `${c.containerNumber} [${c.containerType}] (Seal: ${c.sealNumber}) - ${c.pallets.length} Pallets, ${c.totalGrossWeightKg.toLocaleString()} kg`
  ).join('; ');

  const contType = invoice.containers[0]?.containerType || '20GP';
  const contTypeLabel = contType === '20GP' ? "20' FCL" : contType === '40GP' ? "40' FCL" : `${contType} FCL`;
  const palletsWord = numberToWords(totalPallets);

  const containerTableRows = invoice.containers.map(c => `
    <tr style="border-bottom: 1px solid #cbd5e1; font-family: monospace; font-size: 10.5px;">
      <td style="padding: 6px 10px; font-weight: bold; border-right: 1px solid #cbd5e1;">${c.containerNumber}</td>
      <td style="padding: 6px 10px; border-right: 1px solid #cbd5e1;">${c.sealNumber || '---'}</td>
      <td style="padding: 6px 10px; border-right: 1px solid #cbd5e1;">${c.pallets.length} PALLET</td>
      <td style="padding: 6px 10px; text-align: right; border-right: 1px solid #cbd5e1;">${c.totalGrossWeightKg.toFixed(2)}</td>
      <td style="padding: 6px 10px; text-align: right;">${c.totalNetWeightKg.toFixed(2)}</td>
    </tr>
  `).join('');

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Master Bill of Lading - ${docNumber}</title>
  <style>
    @media print {
      body { margin: 0; padding: 0; background: #fff; font-size: 10px; }
      .no-print { display: none !important; }
      .bol-container { border: 1.5px solid #000 !important; box-shadow: none !important; padding: 16px !important; }
    }
    body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 16px; font-size: 11px; }
    .bol-container { max-width: 920px; margin: 0 auto; background: #fff; border: 2px solid #0f172a; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; border: 1.5px solid #0f172a; }
    .header-table td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; font-size: 10.5px; }
    .label { font-size: 8.5px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 2px; display: block; letter-spacing: 0.5px; }
    .val { font-size: 11px; font-weight: 600; color: #0f172a; line-height: 1.35; }
    .title-banner { background: #0f172a; color: #fff; padding: 8px 12px; font-size: 14px; font-weight: 800; letter-spacing: 1px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .items-table { width: 100%; border-collapse: collapse; border: 1.5px solid #0f172a; margin-top: 6px; }
    .items-table th { background: #f1f5f9; padding: 7px 8px; font-size: 9.5px; text-transform: uppercase; font-weight: 800; border-bottom: 1.5px solid #0f172a; border-right: 1px solid #cbd5e1; text-align: left; }
    .items-table td { vertical-align: top; padding: 8px; border-right: 1px solid #cbd5e1; font-size: 10.5px; line-height: 1.4; }
    .summary-table { width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; margin-top: 10px; font-size: 10.5px; }
    .summary-table th { background: #f8fafc; padding: 5px 8px; font-size: 9px; text-transform: uppercase; font-weight: 700; border: 1px solid #cbd5e1; }
    .footer-terms { font-size: 7.5px; color: #64748b; line-height: 1.3; margin-top: 10px; padding-top: 6px; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="bol-container">
    <div class="title-banner">
      <span>${templateTitle}</span>
      <span style="font-size: 11px; font-family: monospace;">B/L NO: ${docNumber}</span>
    </div>

    <table class="header-table">
      <tr>
        <td style="width: 55%;">
          <span class="label">Shipper / Exporter</span>
          <div class="val" style="font-weight: 700;">${invoice.exporterName}</div>
          <div style="font-size: 10px; color: #334155; margin-top: 2px; white-space: pre-line;">${invoice.shipperAddress}</div>
          ${invoice.onBehalfOf ? `<div style="font-size: 9.5px; color: #475569; margin-top: 3px;"><strong>(ON BEHALF OF):</strong> ${invoice.onBehalfOf}</div>` : ''}
          <div style="font-family: monospace; font-size: 10.5px; font-weight: 700; color: #0f172a; margin-top: 4px;">
            BOOKING NO: ${invoice.bookingNumber || 'MUMGA3747500'}
          </div>
        </td>
        <td style="width: 45%;">
          <span class="label">B/L Number & Booking Reference</span>
          <div class="val" style="font-family: monospace; font-size: 12px; font-weight: 800; color: #0f172a;">${docNumber}</div>
          <div style="margin-top: 4px;">
            <span class="label">Carrier & Service</span>
            <span class="val" style="font-size: 10.5px;">${invoice.carrierName || 'ONE LINE'} (Ocean Container Service)</span>
          </div>
          <div style="margin-top: 4px;">
            <span class="label">Movement Type</span>
            <span class="val" style="font-size: 10.5px; font-weight: 700;">${invoice.movementType || 'FCL / CY'}</span>
          </div>
        </td>
      </tr>
      <tr>
        <td>
          <span class="label">Consignee (or Order of)</span>
          <div class="val" style="font-weight: 700;">${invoice.consigneeName}</div>
          <div style="font-size: 10px; color: #334155; margin-top: 2px; white-space: pre-line;">${invoice.consigneeAddress || ''}</div>
        </td>
        <td>
          <span class="label">Notify Party (Carrier not responsible for failure to notify)</span>
          <div class="val" style="font-weight: 700;">${invoice.notifyParty || invoice.consigneeName}</div>
          <div style="font-size: 10px; color: #334155; margin-top: 2px; white-space: pre-line;">${invoice.notifyParty ? (invoice.consigneeAddress || '') : 'SAME AS CONSIGNEE'}</div>
        </td>
      </tr>
      <tr>
        <td>
          <span class="label">Pre-Carriage By</span>
          <div class="val">Motor Truck / Intermodal Rail</div>
        </td>
        <td>
          <span class="label">Place of Receipt</span>
          <div class="val" style="font-weight: 700;">${displayReceipt}</div>
        </td>
      </tr>
      <tr>
        <td>
          <span class="label">Ocean Vessel & Voyage No.</span>
          <div class="val" style="font-weight: 700;">${displayVessel} / ${displayVoyage}</div>
        </td>
        <td>
          <span class="label">Port of Loading</span>
          <div class="val" style="font-weight: 700;">${displayPol}</div>
        </td>
      </tr>
      <tr>
        <td>
          <span class="label">Port of Discharge</span>
          <div class="val" style="font-weight: 700;">${displayPod}</div>
        </td>
        <td>
          <span class="label">Port of Delivery / Final Destination</span>
          <div class="val" style="font-weight: 700;">${displayDelivery}</div>
        </td>
      </tr>
    </table>

    <!-- Main Cargo Table -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 25%;">Container Nos. Marks & Numbers</th>
          <th style="width: 25%;">Number and Kind of Packages</th>
          <th style="width: 32%;">Description of Goods</th>
          <th style="width: 18%; text-align: right; border-right: none;">Gross Weight / Net Weight</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <!-- Column 1: Marks & Numbers + Sequential Pallet Ranges -->
          <td>
            <div style="font-weight: 700; line-height: 1.4; margin-bottom: 8px;">
              ${marksLines.map(line => `<div>${line}</div>`).join('')}
            </div>
            <div style="font-family: monospace; font-size: 10px; line-height: 1.4; color: #0f172a; margin-top: 6px;">
              ${formattedRanges.map(r => `<div>${r}</div>`).join('')}
            </div>
          </td>

          <!-- Column 2: Number and Kind of Packages -->
          <td>
            <div style="font-weight: 700; line-height: 1.4;">
              ${invoice.containers.length} X ${contTypeLabel} SAID TO CONTAIN<br/>
              TOTAL ${totalPallets} PALLETS<br/>
              <span style="font-size: 9.5px; font-weight: 600;">(TOTAL ${palletsWord} PALLETS ONLY)</span>
            </div>
          </td>

          <!-- Column 3: Description of Goods & Customs / SB details -->
          <td>
            <div style="font-weight: 700; margin-bottom: 3px; font-size: 11px;">
              ${statutoryDescription}
            </div>
            ${uniqueModels.length > 0 ? `
              <div style="font-size: 9.5px; color: #475569; margin-bottom: 4px; line-height: 1.35;">
                ${uniqueModels.join(', ')}
              </div>
            ` : ''}
            <div style="font-size: 10px; margin-bottom: 2px;">
              <strong>${brandName}</strong>
            </div>
            <div style="font-size: 10px; margin-bottom: 6px;">
              <strong>H.S. CODE NO. ${hsnCode}</strong>
            </div>

            <!-- Shipping Bills List -->
            ${shippingBills.length > 0 ? `
              <div style="font-family: monospace; font-size: 9.5px; line-height: 1.35; margin-bottom: 6px;">
                ${shippingBills.map(sb => `<div>${sb}</div>`).join('')}
              </div>
            ` : ''}

            <!-- Dangerous Goods / IMDG Notice -->
            ${hazItem ? `
              <div style="font-family: monospace; font-size: 9.5px; font-weight: 700; color: #b91c1c; margin-bottom: 6px;">
                UN NO. ${hazItem.unNumber || '2794'} &nbsp;&nbsp; IMCO CLASS: ${hazItem.imoClass || '8'}<br/>
                PG: ${invoice.dgPackingGroupOverride || hazItem.packingGroup || 'III'}
              </div>
            ` : ''}

            <!-- Freight Terms & Detention Clause -->
            <div style="font-weight: 700; font-size: 10px; margin-bottom: 2px;">
              ${invoice.freightTerms || 'FREIGHT COLLECT'}
            </div>
            <div style="font-style: italic; font-size: 9.5px; color: #1e293b; font-weight: 600;">
              "${invoice.freeTimeClause || '14 DAYS FREE TIME DETENTION AT DESTINATION'}"
            </div>
          </td>

          <!-- Column 4: Gross & Net Weights -->
          <td style="text-align: right; border-right: none; font-family: monospace;">
            <div style="font-weight: 800; font-size: 11px; margin-bottom: 8px;">
              ${totalGross.toFixed(2)} KGS
            </div>
            <div style="font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase;">
              NET WEIGHT
            </div>
            <div style="font-weight: 700; font-size: 11px;">
              ${declaredNetWeight.toFixed(2)} KGS
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Mid Section: Total Containers & Movement -->
    <div style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: #f8fafc; border: 1px solid #cbd5e1; font-size: 10.5px; font-weight: 600;">
      <div>
        <span>Total No. of Containers / Packages: </span>
        <strong style="font-family: monospace;">0${invoice.containers.length} / ${totalPallets} PLTS</strong>
      </div>
      <div>
        <span>Movement: </span>
        <strong>${invoice.movementType || 'FCL / CY'}</strong>
      </div>
      <div>
        <span>Freight: </span>
        <strong>${invoice.freightTerms || 'FREIGHT COLLECT'}</strong>
      </div>
    </div>

    <!-- Container Breakdown QC Table -->
    <table class="summary-table">
      <thead>
        <tr>
          <th style="width: 25%; text-align: left;">CONT.NO.</th>
          <th style="width: 25%; text-align: left;">Seal no.</th>
          <th style="width: 20%; text-align: left;">Pallets</th>
          <th style="width: 15%; text-align: right;">Gr.wt. kgs</th>
          <th style="width: 15%; text-align: right;">Nt.wt. kgs</th>
        </tr>
      </thead>
      <tbody>
        ${containerTableRows}
      </tbody>
      <tfoot>
        <tr style="background: #f1f5f9; font-weight: bold; font-family: monospace; font-size: 10.5px; border-top: 1.5px solid #0f172a;">
          <td style="padding: 6px 10px; border-right: 1px solid #cbd5e1;">TOTAL (${invoice.containers.length} CONTAINER)</td>
          <td style="padding: 6px 10px; border-right: 1px solid #cbd5e1;">---</td>
          <td style="padding: 6px 10px; border-right: 1px solid #cbd5e1;">${totalPallets} PALLET</td>
          <td style="padding: 6px 10px; text-align: right; border-right: 1px solid #cbd5e1;">${totalGross.toFixed(2)}</td>
          <td style="padding: 6px 10px; text-align: right;">${totalNet.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>

    <!-- Bottom Signoff & Carrier Agent Block -->
    <div style="margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
      <div style="border: 1px solid #cbd5e1; padding: 8px; font-size: 10px;">
        <span class="label">Freight & Charges</span>
        <div class="val" style="font-size: 11px; color: #16a34a; font-weight: bold;">
          ${invoice.freightTerms || (invoice.incoterm === 'CIF' || invoice.incoterm === 'CFR' ? 'FREIGHT PREPAID' : 'FREIGHT COLLECT')}
        </div>
      </div>

      <div style="border: 1px solid #cbd5e1; padding: 8px; font-size: 10px; text-align: right;">
        <span class="label">Signed for the Carrier</span>
        <div style="height: 26px; border-bottom: 1px solid #94a3b8; width: 70%; margin-left: auto; margin-top: 12px;"></div>
        <div style="font-size: 8.5px; color: #64748b; margin-top: 3px;">Authorized Signatory / As Carrier</div>
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
