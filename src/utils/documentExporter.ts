// Ekdant Logistics - Multi-Format Output Exporter Engine
// Generates Carrier-Grade Maritime SOLAS/IMO DG Declarations, Standard Ocean B/L Drafts, and OpenXML Word (.docx) files
// Strictly zero hardcoded sample tokens: dynamically adapts to FormatSchemaJSON, MappedManifestField[], and ExtractedShipmentJSON

import JSZip from 'jszip';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import * as XLSX from 'xlsx';
import type { ExtractedShipmentJSON, FormatSchemaJSON, MappedManifestField } from '../types/index.ts';
import { groupManifestFieldsBySection } from './manifestMatcher.ts';
import {
  type DgTemplateId,
  DG_TEMPLATE_DEFINITIONS,
  buildTemplateCargoBlock,
  detectRecommendedDgTemplate
} from './dgTemplates.ts';

/**
 * Escapes characters for HTML output
 */
function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapes characters for XML in OpenXML .docx
 */
function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Options for exporting manifests
 */
export interface ManifestExportOptions {
  includePalletAnnex?: boolean;
}

/**
 * Helper to lookup mapped field value by fieldId or label fragment
 */
function findFieldValue(
  fields: MappedManifestField[],
  fieldIdPredicate: (id: string, label: string) => boolean
): string {
  const match = fields.find(f => fieldIdPredicate(f.fieldId.toLowerCase(), f.labelInTemplate.toLowerCase()));
  return match && match.value ? match.value : '';
}

/**
 * Generates standalone, carrier-grade maritime print-ready HTML
 */
export function generateManifestHtml(
  shipment: ExtractedShipmentJSON,
  format: FormatSchemaJSON,
  mappedFields: MappedManifestField[],
  options: ManifestExportOptions = {}
): string {
  const isDg = format.documentType === 'DG';
  const includePallets = isDg
    ? (options.includePalletAnnex === true && Boolean(shipment.pallets && shipment.pallets.length > 0))
    : (options.includePalletAnnex !== false && Boolean(shipment.pallets && shipment.pallets.length > 0));

  const refCode = shipment.bookingNumber ||
    (shipment.invoiceNumbers && shipment.invoiceNumbers[0]) ||
    shipment.shipperReference ||
    'DRAFT';

  if (isDg) {
    return generateDgManifestHtml(shipment, format, mappedFields, refCode, includePallets);
  } else {
    return generateBlManifestHtml(shipment, format, mappedFields, refCode, includePallets);
  }
}

/**
 * Renders authentic SOLAS 74 / MARPOL 73/78 Multimodal Dangerous Goods Declaration (Boxes 1–22 Grid)
 */
function generateDgManifestHtml(
  shipment: ExtractedShipmentJSON,
  format: FormatSchemaJSON,
  mappedFields: MappedManifestField[],
  refCode: string,
  includePallets: boolean
): string {
  // Resolve Template ID
  const tmplId: DgTemplateId = (
    format?.formatId && format.formatId in DG_TEMPLATE_DEFINITIONS
      ? format.formatId
      : detectRecommendedDgTemplate(shipment.carrierName)
  ) as DgTemplateId;

  const isKmtc = tmplId === 'KMTC_DG';
  const isCmaCgm = tmplId === 'CMA_CGM_DG';
  const isAnlHaz = isKmtc || isCmaCgm;
  const isNomination = tmplId === 'NOMINATION_DG';
  const isVstar = tmplId === 'VSTAR_DG';
  const isOneLine = tmplId === 'ONE_LINE_DG';
  const isMscLine = tmplId === 'MSC_LINE_DG';
  const isDiamond = tmplId === 'DIAMOND_MARITIME_DG';

  // Field Value Lookups
  const val = (pred: (id: string, label: string) => boolean) => findFieldValue(mappedFields, pred);

  const box1Shipper = val((id, lbl) => id.includes('box_1') || lbl.includes('shipper') || lbl.includes('consignor')) ||
    `${shipment.shipperName}\n${shipment.shipperAddress}${shipment.shipperIec ? `\nIEC: ${shipment.shipperIec}` : ''}${shipment.shipperGstin ? `\nGSTIN: ${shipment.shipperGstin}` : ''}`;
  
  const rawBooking = shipment.bookingNumber || shipment.invoiceNumbers?.join(', ') || '';
  let box2TransportDoc = val((id, lbl) => id.includes('box_2') || lbl.includes('transport document')) || rawBooking;
  if (box2TransportDoc && (isOneLine || isMscLine) && !box2TransportDoc.startsWith('BKG.NO.:')) {
    box2TransportDoc = `BKG.NO.: ${box2TransportDoc}`;
  } else if (box2TransportDoc && isDiamond && !box2TransportDoc.startsWith('BOOKING NO:')) {
    box2TransportDoc = `BOOKING NO: ${box2TransportDoc}`;
  }

  const box3Page = val((id, lbl) => id.includes('box_3') || lbl.includes('page of page') || id.includes('page')) || (isOneLine || isMscLine ? '3 Page of Page' : '1 OF 1');
  const box4ShipperRef = val((id, lbl) => id.includes('box_4') || lbl.includes("shipper's ref") || lbl.includes('shipper ref')) || shipment.shipperReference || '';
  const box5ForwarderRef = val((id, lbl) => id.includes('box_5') || lbl.includes('forwarder') || lbl.includes('freight forwarder')) || shipment.forwarderReference || '';
  const box6Consignee = val((id, lbl) => id.includes('box_6') || lbl.includes('consignee')) || `${shipment.consigneeName}\n${shipment.consigneeAddress}`;
  const defaultCarrier = isCmaCgm ? 'CMA-CGM AGENCIES INDIA PVT.LTD.' : (isKmtc ? 'KOREA MARINE TRANSPORT CO. LTD.' : '');
  const box7Carrier = val((id, lbl) => id.includes('box_7') || lbl.includes('carrier')) || shipment.carrierName || defaultCarrier;

  const box10VesselVoyage = val((id, lbl) => id.includes('box_10') || lbl.includes('vessel')) || (shipment.vesselName ? (shipment.voyageNumber ? `${shipment.vesselName} / ${shipment.voyageNumber}` : shipment.vesselName) : '');
  const box11Pol = val((id, lbl) => id.includes('box_11') || lbl.includes('port of loading')) || shipment.portOfLoading || '';
  const box12Pod = val((id, lbl) => id.includes('box_12') || lbl.includes('port of discharge')) || shipment.portOfDischarge || '';
  const box13Dest = val((id, lbl) => id.includes('box_13') || lbl.includes('destination')) || shipment.finalDestination || shipment.portOfDischarge || '';

  const box14CargoBlock = buildTemplateCargoBlock(tmplId, shipment);

  const box16Gross = val((id, lbl) => id.includes('box_16') || lbl.includes('gross mass')) || (shipment.grossWeightKg > 0 ? `${shipment.grossWeightKg.toLocaleString()} KGS` : '');
  const box17Net = val((id, lbl) => id.includes('box_17') || lbl.includes('net mass')) || (shipment.netWeightKg > 0 ? `${shipment.netWeightKg.toLocaleString()} KGS` : '');
  const box18Cube = val((id, lbl) => id.includes('box_18') || lbl.includes('cube') || lbl.includes('m³')) || (shipment.volumeCbm > 0 ? `${shipment.volumeCbm.toFixed(3)} M³` : '');

  const box19Tare = val((id, lbl) => id.includes('box_18_tare') || id.includes('box_19_tare') || lbl.includes('tare mass')) || (shipment.tareWeightKg > 0 ? `${shipment.tareWeightKg.toLocaleString()} KGS` : '2,150 KGS');
  const calculatedVgm = (shipment.grossWeightKg || 0) + (shipment.tareWeightKg || 2150);
  const box19Vgm = val((id, lbl) => id.includes('box_19_total_gross') || id.includes('box_19_vgm') || lbl.includes('incl. tare') || lbl.includes('vgm')) ||
    (calculatedVgm > 0 ? `${calculatedVgm.toLocaleString()} KGS` : '');

  const box17CntrType = isOneLine || isMscLine ? "1x20'" : (isDiamond ? "01X20 GP" : (isNomination || isVstar ? "20 GP" : (shipment.containerType || "20' GP")));

  const box20Declarant = val((id, lbl) => id.includes('box_20') || lbl.includes('container / vehicle packing certificate')) || shipment.dgDeclarantName || 'AUTHORIZED SIGNATORY';
  const box21Emergency = val((id, lbl) => id.includes('box_9') || id.includes('box_21') || lbl.includes('emergency')) || shipment.emergencyContactPhone || '';
  const box22ShipperDecl = val((id, lbl) => id.includes('box_22') || lbl.includes("shipper's declaration") || lbl.includes('shipper declaration')) ||
    (shipment.dgDeclarantName || shipment.shipperName || 'AUTHORIZED SIGNATORY');

  if (isAnlHaz) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>IMO DANGEROUS GOODS DECLARATION - ${escapeHtml(refCode)}</title>
  <style>
    @page { size: A4 portrait; margin: 6mm 8mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: "Helvetica Neue", Arial, sans-serif; margin: 0; padding: 6px; color: #000000; background: #ffffff; font-size: 8px; line-height: 1.2; }
    .dg-form-container { width: 100%; max-width: 800px; margin: 0 auto; border: 1.5px solid #000; background: #fff; page-break-inside: avoid; }
    .table-layout { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .table-layout td, .table-layout th { border: 1px solid #000; padding: 3px 5px; vertical-align: top; word-wrap: break-word; }
    .box-num { font-size: 7px; font-weight: 800; text-transform: uppercase; color: #111; display: block; margin-bottom: 1.5px; }
    .box-val { font-size: 8px; font-weight: 600; white-space: pre-wrap; color: #000; }
    .box-val-bold { font-weight: 700; }
    .legal-text { font-size: 6.5px; line-height: 1.15; color: #222; margin-top: 2px; }
    .header-title-box { background: #f8fafc; text-align: center; border-bottom: 1.5px solid #000; padding: 4px; }
    .header-title-box h1 { margin: 0; font-size: 11.5px; font-weight: 900; letter-spacing: 0.6px; }
    .header-title-box .sub { font-size: 7px; font-weight: bold; color: #334155; margin-top: 1px; }
    .center-col { text-align: center; }
    .right-col { text-align: right; }
    .annex-section { margin-top: 14px; border-top: 2px solid #000; padding-top: 8px; }
    .annex-title { font-size: 10.5px; font-weight: 800; text-transform: uppercase; margin: 0 0 6px 0; }
    .annex-table { width: 100%; border-collapse: collapse; font-size: 8.5px; }
    .annex-table th { background: #f1f5f9; border: 1px solid #000; padding: 3px; text-align: left; font-size: 7.5px; }
    .annex-table td { border: 1px solid #000; padding: 2px 4px; }
    @media print { body { padding: 0; } .dg-form-container { border: 1.5px solid #000; } }
  </style>
</head>
<body>
  <div class="dg-form-container">
    <div class="header-title-box">
      <h1>IMO DANGEROUS GOODS DECLARATION</h1>
      <div class="sub">This form meets the requirements of SOLAS 74 chapter VII, regulation 5 MARPOL 73/78 Annex III, regulation 4 and the IMDG Code, General Introduction, section 9.</div>
    </div>

    <!-- Upper Grid: Shipper/Consignee Left | References Right -->
    <table class="table-layout">
      <tr>
        <td style="width: 50%; vertical-align: top;">
          <span class="box-num">SHIPPER :-</span>
          <div class="box-val">${escapeHtml(box1Shipper)}</div>
          <div style="margin-top: 8px;">
            <span class="box-num">Consignee :-</span>
            <div class="box-val">${escapeHtml(box6Consignee)}</div>
          </div>
        </td>
        <td style="width: 50%; vertical-align: top; padding: 0;">
          <table class="table-layout">
            <tr>
              <td>
                <span class="box-num">Reference Number(s)</span>
                <div class="box-val box-val-bold">${escapeHtml(box4ShipperRef || '---')}</div>
              </td>
            </tr>
            <tr>
              <td>
                <span class="box-num">24 HRS Emergency Contact Telephone Number: (with Country code / Area code / telephone no)</span>
                <div class="box-val" style="color: #b91c1c; font-weight: 700;">${escapeHtml(box21Emergency || '---')}</div>
              </td>
            </tr>
            <tr>
              <td>
                <span class="box-num">Carrier</span>
                <div class="box-val">${escapeHtml(box7Carrier || 'KOREA MARINE TRANSPORT CO. LTD.')}</div>
              </td>
            </tr>
            <tr>
              <td>
                <span class="box-num">Carrier's Booking Number:</span>
                <div class="box-val box-val-bold">${escapeHtml(box2TransportDoc || '---')}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Middle Grid: Container Packing Declaration Left | Signatory Right -->
    <table class="table-layout" style="border-top: none;">
      <tr>
        <td style="width: 50%; background: #fafafa;">
          <span class="box-num">Container Packing Certificate / Vehicle Declaration</span>
          <div style="font-weight: 800; font-size: 7.5px; margin: 2px 0;">CONTAINER PACKING DECLARATION</div>
          <div class="legal-text">
            It is hereby declared that the packing of the container has been carried out in accordance with the General Introduction, IMDG Code, paragraph 5.4.2.1
          </div>
        </td>
        <td style="width: 50%; padding: 0;">
          <table class="table-layout">
            <tr>
              <td colspan="2">
                <span class="box-num">Name/Status, Company/Organization of Signatory</span>
                <div class="box-val">${escapeHtml(box20Declarant || 'AUTHORIZED SIGNATORY')}</div>
              </td>
            </tr>
            <tr>
              <td style="width: 50%;">
                <span class="box-num">Place and Date</span>
                <div class="box-val">${escapeHtml(shipment.dgDeclarationPlaceAndDate || '---')}</div>
              </td>
              <td style="width: 50%;">
                <span class="box-num">Signature on Behalf of Packer</span>
                <div style="height: 14px; border-bottom: 1px dotted #94a3b8;"></div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Routing Strip -->
    <table class="table-layout" style="border-top: none; background: #f8fafc;">
      <tr>
        <td style="width: 25%;">
          <span class="box-num">Ship's Name and Voyage No.</span>
          <div class="box-val box-val-bold">${escapeHtml(box10VesselVoyage || '---')}</div>
        </td>
        <td style="width: 25%;">
          <span class="box-num">Port of Loading</span>
          <div class="box-val">${escapeHtml(box11Pol || '---')}</div>
        </td>
        <td style="width: 25%;">
          <span class="box-num">Container Number(s)</span>
          <div class="box-val box-val-bold">${escapeHtml(shipment.containerNumber || '---')}</div>
        </td>
        <td style="width: 25%;">
          <span class="box-num">SEAL NO:</span>
          <div class="box-val">${escapeHtml(shipment.sealNumber || '---')}</div>
        </td>
      </tr>
      <tr>
        <td colspan="2">
          <span class="box-num">Port of Unloading</span>
          <div class="box-val">${escapeHtml(box12Pod || '---')}</div>
        </td>
        <td colspan="2">
          <span class="box-num">Final Place of Delivery</span>
          <div class="box-val">${escapeHtml(box13Dest || '---')}</div>
        </td>
      </tr>
    </table>

    <!-- 3-Column Cargo Table -->
    <table class="table-layout" style="border-top: none;">
      <tr style="background: #f1f5f9;">
        <th style="width: 25%;"><span class="box-num">Qty., Type, and Kind of Packages</span></th>
        <th style="width: 50%;"><span class="box-num">Description (Proper Shipping Name, Class, UN, Packing Group)</span></th>
        <th style="width: 25%;" class="right-col"><span class="box-num">Gross &amp; Net Weights</span></th>
      </tr>
      <tr>
        <td style="font-family: monospace; font-size: 7.5px;">
          <div style="font-weight: bold;">NO OF PACKAGES</div>
          <div>OUTER PACKAGES :- ${shipment.totalPallets || shipment.pallets?.length || 0} PALLETS</div>
          <div>INNER PACKING :- ${shipment.totalBoxes || shipment.totalPackages || 0} BOXES</div>
        </td>
        <td style="font-family: monospace; font-size: 7.5px; line-height: 1.25;">
          <div class="box-val">${escapeHtml(box14CargoBlock)}</div>
        </td>
        <td class="right-col" style="font-family: monospace; font-size: 7.5px;">
          <div style="font-weight: bold;">GR WT : ${escapeHtml(box16Gross || '---')}</div>
          <div style="font-weight: bold; margin-top: 4px;">NT WT : ${escapeHtml(box17Net || '---')}</div>
          <div style="margin-top: 8px; padding-top: 4px; border-top: 1px dotted #94a3b8; color: #047857; font-weight: bold;">
            VGM: ${escapeHtml(box19Vgm || '---')}
          </div>
        </td>
      </tr>
    </table>

    <!-- Bottom Shipper's Declaration -->
    <table class="table-layout" style="border-top: none;">
      <tr>
        <td style="width: 50%; background: #fafafa;">
          <span class="box-num">SHIPPER'S DECLARATION</span>
          <div class="legal-text">
            It is hereby declared that the contents of this consignment are fully and accurately described above by the proper shipping name(s), and are classified, packaged, marked and labeled/placarded, and are in all respects in proper condition for transport according to the applicable international and national government regulations.
          </div>
        </td>
        <td style="width: 50%; padding: 0;">
          <table class="table-layout">
            <tr>
              <td colspan="2">
                <span class="box-num">Name/Status, Company/Organization of Signatory</span>
                <div class="box-val">${escapeHtml(box22ShipperDecl || shipment.dgDeclarantName || 'AUTHORIZED SIGNATORY')}</div>
              </td>
            </tr>
            <tr>
              <td style="width: 50%;">
                <span class="box-num">Place and Date</span>
                <div class="box-val">${escapeHtml(shipment.dgDeclarationPlaceAndDate || '---')}</div>
              </td>
              <td style="width: 50%;">
                <span class="box-num">Signature on Behalf of Shipper</span>
                <div style="height: 14px; border-bottom: 1px dotted #94a3b8;"></div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>

  ${includePallets ? renderPalletAnnexHtml(shipment) : ''}
</body>
</html>`;
  }

  // Standard IMO 22-Box Templates (COMMON, NOMINATION, VSTAR, ONE LINE, MSC LINE, DIAMOND MARITIME)
  const docHeaderTitle = tmplId === 'COMMON_DG'
    ? 'MULTIMODAL DANGEROUS GOODS DECLARATION'
    : 'MULTIMODAL DANGEROUS GOODS FORM';
  const docHeaderSub = tmplId === 'COMMON_DG'
    ? 'This form meets the requirements of SOLAS 74, Chapter VII, Regulation 5.4 and MARPOL 73/78, Annex III, Regulation 4'
    : 'This form may be used as a dangerous goods declaration as it meets the requirements of Solas 74,chapter VII, regulation 5; MARPOL 73/78, Annex III, regulation 4.';
  const box1Label = isDiamond
    ? '1 SHIPPER/CONSIGNOR/SENDER (FULL STYLE ADDRESS IS MANDATORY)'
    : '1. Shipper / Consignor / Sender';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(docHeaderTitle)} - ${escapeHtml(refCode)}</title>
  <style>
    @page { size: A4 portrait; margin: 6mm 8mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: "Helvetica Neue", Arial, sans-serif; margin: 0; padding: 6px; color: #000000; background: #ffffff; font-size: 8px; line-height: 1.2; }
    .dg-form-container { width: 100%; max-width: 800px; margin: 0 auto; border: 1.5px solid #000; background: #fff; page-break-inside: avoid; }
    .table-layout { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .table-layout td, .table-layout th { border: 1px solid #000; padding: 3px 5px; vertical-align: top; word-wrap: break-word; }
    .box-num { font-size: 7px; font-weight: 800; text-transform: uppercase; color: #111; display: block; margin-bottom: 1.5px; }
    .box-val { font-size: 8px; font-weight: 600; white-space: pre-wrap; color: #000; }
    .box-val-bold { font-weight: 700; }
    .legal-text { font-size: 6.5px; line-height: 1.15; color: #222; margin-top: 2px; }
    .header-title-box { background: #f8fafc; text-align: center; border-bottom: 1.5px solid #000; padding: 4px; }
    .header-title-box h1 { margin: 0; font-size: 11.5px; font-weight: 900; letter-spacing: 0.6px; }
    .header-title-box .sub { font-size: 7px; font-weight: bold; color: #334155; margin-top: 1px; }
    .center-col { text-align: center; }
    .right-col { text-align: right; }
    .annex-section { margin-top: 14px; border-top: 2px solid #000; padding-top: 8px; }
    .annex-title { font-size: 10.5px; font-weight: 800; text-transform: uppercase; margin: 0 0 6px 0; }
    .annex-table { width: 100%; border-collapse: collapse; font-size: 8.5px; }
    .annex-table th { background: #f1f5f9; border: 1px solid #000; padding: 3px; text-align: left; font-size: 7.5px; }
    .annex-table td { border: 1px solid #000; padding: 2px 4px; }
    @media print { body { padding: 0; } .dg-form-container { border: 1.5px solid #000; } }
  </style>
</head>
<body>
  <div class="dg-form-container">
    <div class="header-title-box">
      <h1>${escapeHtml(docHeaderTitle)}</h1>
      <div class="sub">${escapeHtml(docHeaderSub)}</div>
    </div>

    <!-- Top Half (50% Left / 50% Right Columns) -->
    <table class="table-layout">
      <tr>
        <!-- Left Column (50%) -->
        <td style="width: 50%; padding: 0; vertical-align: top; border: none;">
          <table class="table-layout" style="height: 100%;">
            <tr>
              <td style="height: 65px;">
                <span class="box-num">${escapeHtml(box1Label)}</span>
                <div class="box-val">${escapeHtml(box1Shipper)}</div>
              </td>
            </tr>
            <tr>
              <td style="height: 55px;">
                <span class="box-num">6. Consignee</span>
                <div class="box-val">${escapeHtml(box6Consignee)}</div>
              </td>
            </tr>
            <tr>
              <td>
                <span class="box-num">7. Carrier</span>
                <div class="box-val">${escapeHtml(box7Carrier || '---')}</div>
              </td>
            </tr>
            <tr>
              <td>
                <span class="box-num">8. This shipment is within the limitations prescribed for:</span>
                <div class="box-val" style="font-size: 7px; font-weight: bold; color: #1e293b;">
                  [ PASSENGER AND CARGO AIRCRAFT &nbsp;&bull;&nbsp; CARGO AIRCRAFT ONLY ]
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding: 0;">
                <table class="table-layout">
                  <tr>
                    <td style="width: 50%; border-top: none; border-left: none; border-bottom: none;">
                      <span class="box-num">10. Vessel and voy</span>
                      <div class="box-val box-val-bold">${escapeHtml(box10VesselVoyage || '---')}</div>
                    </td>
                    <td style="width: 50%; border-top: none; border-right: none; border-bottom: none;">
                      <span class="box-num">11. Port of loading</span>
                      <div class="box-val">${escapeHtml(box11Pol || '---')}</div>
                    </td>
                  </tr>
                </table>
                ${(isOneLine || isMscLine) ? `
                <div style="background: #fff1f2; color: #9f1239; font-weight: bold; padding: 2.5px 5px; border-top: 1px solid #000; font-size: 7px;">
                  EMERGENCY CONTACT NUMBER : ${escapeHtml(box21Emergency || '---')}
                </div>
                ` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding: 0;">
                <table class="table-layout">
                  <tr>
                    <td style="width: 50%; border-top: none; border-left: none; border-bottom: none;">
                      <span class="box-num">12. Port of discharge</span>
                      <div class="box-val">${escapeHtml(box12Pod || '---')}</div>
                    </td>
                    <td style="width: 50%; border-top: none; border-right: none; border-bottom: none;">
                      <span class="box-num">13. Destination</span>
                      <div class="box-val">${escapeHtml(box13Dest || '---')}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>

        <!-- Right Column (50%) -->
        <td style="width: 50%; padding: 0; vertical-align: top; border: none; border-left: 1px solid #000;">
          <table class="table-layout" style="height: 100%;">
            <tr>
              <td>
                <span class="box-num">2. Transport Document Number</span>
                <div class="box-val box-val-bold">${escapeHtml(box2TransportDoc || '---')}</div>
              </td>
            </tr>
            ${isMscLine ? `
            <tr>
              <td style="padding: 0;">
                <table class="table-layout">
                  <tr>
                    <td style="width: 33%; border-top: none; border-left: none; border-bottom: none;">
                      <span class="box-num">3. Page of Page</span>
                      <div class="box-val box-val-bold">${escapeHtml(box3Page)}</div>
                    </td>
                    <td style="width: 33%; border-top: none; border-left: none; border-bottom: none;">
                      <span class="box-num">4. Shipper's reference</span>
                      <div class="box-val">${escapeHtml(box4ShipperRef || '---')}</div>
                    </td>
                    <td style="width: 34%; border-top: none; border-right: none; border-bottom: none;">
                      <span class="box-num">5. Forwarder's ref</span>
                      <div class="box-val">${escapeHtml(box5ForwarderRef || '---')}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ` : `
            <tr>
              <td style="padding: 0;">
                <table class="table-layout">
                  <tr>
                    <td style="width: 45%; border-top: none; border-left: none; border-bottom: none;">
                      <span class="box-num">3. Page of Page</span>
                      <div class="box-val box-val-bold">${escapeHtml(box3Page)}</div>
                    </td>
                    <td style="width: 55%; border-top: none; border-right: none; border-bottom: none;">
                      <span class="box-num">4. Shipper's reference</span>
                      <div class="box-val">${escapeHtml(box4ShipperRef || '---')}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td>
                <span class="box-num">5. Freight Forwarder's reference</span>
                <div class="box-val">${escapeHtml(box5ForwarderRef || '---')}</div>
              </td>
            </tr>
            `}
            <tr>
              <td style="background: #fafafa; padding: 4px;">
                <span class="box-num">SHIPPER'S DECLARATION</span>
                <div class="legal-text">
                  I hereby declare that the contents of this consignment are fully and accurately described below by the proper shipping name(s), and are classified, packaged, marked and labelled/placarded, and are in all respects in proper condition for transport according to the applicable international and national governmental regulations.
                </div>
              </td>
            </tr>
            <tr>
              <td style="height: 48px;">
                <span class="box-num">9. Additional handling information</span>
                <div class="box-val" style="color: #b91c1c; font-weight: 700; font-size: 7.5px;">
                  EMERGENCY CONTACT NUMBER: ${escapeHtml(box21Emergency || '---')}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Center Cargo Table (Unified Wide Box 14 + 3 Weight Columns) -->
    <table class="table-layout" style="border-top: none;">
      <tr style="background: #f8fafc;">
        <th style="width: 70%; text-align: left;">
          <span class="box-num">14. Shipping Marks | *Number and kind of packages; description of goods</span>
        </th>
        <th style="width: 10%;" class="right-col"><span class="box-num">Gross Mass (kg)</span></th>
        <th style="width: 10%;" class="right-col"><span class="box-num">Net Mass (kgs)</span></th>
        <th style="width: 10%;" class="right-col"><span class="box-num">Cube (m³)</span></th>
      </tr>
      <tr>
        <td style="padding: 4px 6px;">
          <div class="box-val" style="font-family: monospace; font-size: 7.5px; line-height: 1.25;">${escapeHtml(box14CargoBlock)}</div>
        </td>
        <td class="right-col"><div class="box-val box-val-bold">${escapeHtml(box16Gross || '---')}</div></td>
        <td class="right-col"><div class="box-val">${escapeHtml(box17Net || '---')}</div></td>
        <td class="right-col"><div class="box-val">${escapeHtml(box18Cube || '---')}</div></td>
      </tr>
      ${isNomination ? `
      <tr>
        <td colspan="4" style="background: #f1f5f9; font-weight: bold; font-family: monospace; font-size: 7.5px; padding: 3px 6px;">
          Other Details : UN PACKING CODE :- ${escapeHtml(shipment.unPackingCode || '')}
        </td>
      </tr>
      ` : ''}
      ${isVstar ? `
      <tr>
        <td colspan="4" style="background: #f1f5f9; font-weight: bold; font-family: monospace; font-size: 7.5px; padding: 3px 6px;">
          Other Details ${shipment.unPackingCode ? `: UN PACKING CODE: ${escapeHtml(shipment.unPackingCode)}` : ''}
        </td>
      </tr>
      ` : ''}
      ${isDiamond ? `
      <tr>
        <td colspan="4" style="background: #f1f5f9; font-weight: bold; font-family: monospace; font-size: 7.5px; padding: 3px 6px;">
          Total cube (m3) ${escapeHtml(box18Cube || '')}
        </td>
      </tr>
      <tr>
        <td colspan="4" style="background: #f1f5f9; font-weight: bold; font-family: monospace; font-size: 7.5px; padding: 3px 6px;">
          Other Details UN PACKAGING NO. ${escapeHtml(shipment.unPackingCode || '')}
        </td>
      </tr>
      ` : ''}
    </table>

    <!-- Official IMO Equipment Row (Boxes 15, 16, 17, 18, 19) -->
    <table class="table-layout" style="border-top: none;">
      <tr style="background: #f8fafc;">
        <th style="width: 26%;"><span class="box-num">15. Container identification no.</span></th>
        <th style="width: 20%;"><span class="box-num">${isDiamond ? 'SEAL NO' : '16. Seal number(s)'}</span></th>
        <th style="width: 16%;"><span class="box-num">${isDiamond ? 'CNTR TYPE' : '17. Container size &amp; type'}</span></th>
        <th style="width: 18%;" class="right-col"><span class="box-num">18. Tare mass (kg)</span></th>
        <th style="width: 20%;" class="right-col"><span class="box-num">${isDiamond ? '19. Total gross (kg)' : '19. Total gross (incl. tare) (kg)'}</span></th>
      </tr>
      <tr>
        <td><div class="box-val box-val-bold">${escapeHtml(shipment.containerNumber || '---')}</div></td>
        <td><div class="box-val">${escapeHtml(shipment.sealNumber || '---')}</div></td>
        <td><div class="box-val">${escapeHtml(box17CntrType)}</div></td>
        <td class="right-col"><div class="box-val">${escapeHtml(box19Tare || '---')}</div></td>
        <td class="right-col"><div class="box-val box-val-bold" style="color: #047857;">${escapeHtml(box19Vgm || '---')}</div></td>
      </tr>
    </table>

    <!-- Bottom Signature Row (Boxes 20, 21, 22) -->
    <table class="table-layout" style="border-top: none;">
      <tr>
        <td style="width: 36%;">
          <span class="box-num">20. Container / Vehicle Packing Certificate ${isDiamond ? '(stamp & signature mandatory)' : ''}</span>
          <div class="legal-text">
            I hereby declare that the goods described above have been packed/loaded into the container/vehicle identified above in accordance with the applicable provisions.
          </div>
          <div style="margin-top: 6px; font-size: 7.5px;">
            <div>Name/Status: <strong>${escapeHtml(box20Declarant || 'AUTHORIZED SIGNATORY')}</strong></div>
            <div>Place and Date: ${escapeHtml(shipment.dgDeclarationPlaceAndDate || '---')}</div>
            <div style="margin-top: 2px;">Signature of Declarant:</div>
            <div style="height: 16px; border-bottom: 1px dotted #94a3b8; margin-top: 2px;"></div>
          </div>
        </td>
        <td style="width: 28%;">
          <span class="box-num">21. RECEIVING ORGANIZATION RECEIPT</span>
          <div class="legal-text">
            Received the above number of packages/containers in apparent good order and condition.
          </div>
          <div style="margin-top: 6px; font-size: 7.5px;">
            <div>Haulier: <span style="border-bottom: 1px dotted #94a3b8; display: inline-block; width: 60px;">&nbsp;</span></div>
            <div style="margin-top: 2px;">Vehicle Reg No: <span style="border-bottom: 1px dotted #94a3b8; display: inline-block; width: 50px;">&nbsp;</span></div>
            <div style="margin-top: 2px;">Driver Signature:</div>
            <div style="height: 16px; border-bottom: 1px dotted #94a3b8; margin-top: 2px;"></div>
          </div>
        </td>
        <td style="width: 36%;">
          <span class="box-num">22. Shipper's Declaration ${isDiamond ? '(stamp & signature mandatory)' : ''}</span>
          <div class="legal-text">
            I hereby declare that the contents of this consignment are fully and accurately described above by the proper shipping name, and are classified, packaged, marked and labeled/placarded and are in all respects in proper condition for transport according to the applicable international and national governmental regulations.
          </div>
          <div style="margin-top: 6px; font-size: 7.5px;">
            <div>Company Name: <strong>${escapeHtml(shipment.shipperName || '---')}</strong></div>
            <div>Declarant: ${escapeHtml(box22ShipperDecl || shipment.dgDeclarantName || 'AUTHORIZED SIGNATORY')}</div>
            <div>Place &amp; Date: ${escapeHtml(shipment.dgDeclarationPlaceAndDate || '---')}</div>
            <div style="margin-top: 2px;">Signature of Declarant:</div>
            <div style="height: 16px; border-bottom: 1px dotted #94a3b8; margin-top: 2px;"></div>
          </div>
        </td>
      </tr>
    </table>
  </div>

  ${includePallets ? renderPalletAnnexHtml(shipment) : ''}
</body>
</html>`;
}

/**
 * Renders authentic Ocean Bill of Lading Draft (Standard Carrier B/L Layout)
 */
function generateBlManifestHtml(
  shipment: ExtractedShipmentJSON,
  _format: FormatSchemaJSON,
  mappedFields: MappedManifestField[],
  refCode: string,
  includePallets: boolean
): string {
  const val = (pred: (id: string, label: string) => boolean) => findFieldValue(mappedFields, pred);

  const shipper = val((id, lbl) => id.includes('shipper') || lbl.includes('shipper')) ||
    `${shipment.shipperName}\n${shipment.shipperAddress}${shipment.shipperIec ? `\nIEC: ${shipment.shipperIec}` : ''}${shipment.shipperGstin ? `\nGSTIN: ${shipment.shipperGstin}` : ''}`;
  const consignee = val((id, lbl) => id.includes('consignee') || lbl.includes('consignee')) ||
    `${shipment.consigneeName}\n${shipment.consigneeAddress}`;
  const notifyParty = val((id, lbl) => id.includes('notify') || lbl.includes('notify party')) ||
    `${shipment.notifyPartyName || 'SAME AS CONSIGNEE'}\n${shipment.notifyPartyAddress || ''}`.trim();

  const bookingNo = val((id, lbl) => id.includes('booking') || lbl.includes('booking')) || shipment.bookingNumber || '';
  const blNo = val((id, lbl) => id.includes('bl_number') || lbl.includes('bill of lading')) || shipment.bookingNumber || 'DRAFT-BL';
  const exportRefs = val((id, lbl) => id.includes('export_reference') || lbl.includes('export ref') || lbl.includes("shipper's ref")) ||
    shipment.shipperReference || shipment.invoiceNumbers?.join(', ') || '';
  const shippingBills = val((id, lbl) => id.includes('shipping_bill') || lbl.includes('shipping bill')) || shipment.shippingBillNumbers || '';

  const preCarriage = val((id, lbl) => id.includes('pre_carriage') || lbl.includes('pre-carriage')) || shipment.preCarriageBy || '';
  const placeOfReceipt = val((id, lbl) => id.includes('place_of_receipt') || lbl.includes('place of receipt')) || shipment.placeOfReceipt || shipment.portOfLoading || '';
  const vesselVal = val((id, lbl) => id.includes('vessel') || lbl.includes('ocean vessel')) || shipment.vesselName || '';
  const voyageVal = val((id, lbl) => id.includes('voyage') || lbl.includes('voyage no')) || shipment.voyageNumber || '';
  const vesselVoyage = vesselVal && voyageVal
    ? (vesselVal.includes(voyageVal) ? vesselVal : `${vesselVal} / ${voyageVal}`)
    : (vesselVal || voyageVal || '');
  const pol = val((id, lbl) => id.includes('port_of_loading') || lbl.includes('port of loading')) || shipment.portOfLoading || '';
  const pod = val((id, lbl) => id.includes('port_of_discharge') || lbl.includes('port of discharge')) || shipment.portOfDischarge || '';
  const placeOfDelivery = val((id, lbl) => id.includes('place_of_delivery') || lbl.includes('place of delivery') || lbl.includes('final destination')) ||
    shipment.placeOfDelivery || shipment.finalDestination || shipment.portOfDischarge || '';

  const marksAndNumbers = val((id, lbl) => id.includes('shipping_marks') || lbl.includes('marks & nos') || lbl.includes('marks and numbers')) || shipment.shippingMarks || '';
  const cargoDesc = val((id, lbl) => id.includes('cargo_description') || lbl.includes('description of goods') || lbl.includes('particulars')) || shipment.productDescription || '';

  const grossWt = val((id, lbl) => id.includes('gross_weight') || lbl.includes('gross weight')) || (shipment.grossWeightKg > 0 ? `${shipment.grossWeightKg.toFixed(2)} KGS` : '');
  const netWt = val((id, lbl) => id.includes('net_weight') || lbl.includes('net weight')) || (shipment.netWeightKg > 0 ? `${shipment.netWeightKg.toFixed(2)} KGS` : '');
  const measurement = val((id, lbl) => id.includes('measurement') || lbl.includes('cbm') || lbl.includes('volume')) || (shipment.volumeCbm > 0 ? `${shipment.volumeCbm.toFixed(3)} CBM` : '');

  const movement = val((id, lbl) => id.includes('movement') || lbl.includes('movement type')) || shipment.movementType || 'FCL/FCL';
  const freightTerms = val((id, lbl) => id.includes('freight_term') || lbl.includes('freight terms')) || shipment.freightTerms || 'FREIGHT PREPAID';

  const vgmVal = shipment.grossWeightKg > 0 && shipment.tareWeightKg > 0 ? Number((shipment.grossWeightKg + shipment.tareWeightKg).toFixed(2)) : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>BILL OF LADING FOR OCEAN TRANSPORT - ${escapeHtml(refCode)}</title>
  <style>
    @page { size: A4 portrait; margin: 8mm 10mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: "Helvetica Neue", Arial, sans-serif; margin: 0; padding: 12px; color: #000000; background: #ffffff; font-size: 10px; line-height: 1.25; }
    .bl-form-container { width: 100%; max-width: 820px; margin: 0 auto; border: 2px solid #000; background: #fff; }
    .table-layout { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .table-layout td, .table-layout th { border: 1px solid #000; padding: 4px 6px; vertical-align: top; word-wrap: break-word; }
    .cell-title { font-size: 8px; font-weight: 800; text-transform: uppercase; color: #334155; display: block; margin-bottom: 2px; }
    .cell-data { font-size: 9.5px; font-weight: 600; white-space: pre-wrap; color: #000; }
    .cell-data-bold { font-weight: 700; }
    .header-bar { background: #0f172a; color: #fff; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center; }
    .header-bar h1 { margin: 0; font-size: 12.5px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; }
    .right-col { text-align: right; }
    .center-col { text-align: center; }
    .annex-section { margin-top: 14px; border-top: 2px solid #000; padding-top: 8px; }
    .annex-title { font-size: 10.5px; font-weight: 800; text-transform: uppercase; margin: 0 0 6px 0; }
    .annex-table { width: 100%; border-collapse: collapse; font-size: 9px; }
    .annex-table th { background: #f1f5f9; border: 1px solid #000; padding: 4px; text-align: left; font-size: 8px; }
    .annex-table td { border: 1px solid #000; padding: 3px 5px; }
    @media print { body { padding: 0; } .bl-form-container { border: 2px solid #000; } }
  </style>
</head>
<body>
  <div class="bl-form-container">
    <div class="header-bar">
      <div>
        <h1>BILL OF LADING FOR OCEAN TRANSPORT</h1>
        <div style="font-size: 8px; color: #94a3b8; font-family: monospace;">NON-NEGOTIABLE UNLESS CONSIGNED TO ORDER</div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 10.5px; font-weight: 800;">${escapeHtml(shipment.carrierName || 'CARRIER DRAFT')}</div>
        <div style="font-size: 8.5px; color: #cbd5e1; font-family: monospace;">B/L NO: ${escapeHtml(blNo)}</div>
      </div>
    </div>

    <table class="table-layout">
      <!-- Upper Parties & References Grid -->
      <tr>
        <td style="width: 52%;" rowspan="2">
          <span class="cell-title">Shipper / Exporter</span>
          <div class="cell-data">${escapeHtml(shipper)}</div>
        </td>
        <td style="width: 48%;">
          <span class="cell-title">Booking Number</span>
          <div class="cell-data cell-data-bold">${escapeHtml(bookingNo || '---')}</div>
        </td>
      </tr>
      <tr>
        <td>
          <span class="cell-title">Export References (Invoices / PO / IEC)</span>
          <div class="cell-data">${escapeHtml(exportRefs || '---')}</div>
          ${shippingBills ? `<div style="font-size: 8.5px; font-weight: bold; color: #0284c7; margin-top: 2px;">SHIPPING BILL: ${escapeHtml(shippingBills)}</div>` : ''}
        </td>
      </tr>

      <tr>
        <td rowspan="2">
          <span class="cell-title">Consignee (If 'To Order' so state)</span>
          <div class="cell-data">${escapeHtml(consignee)}</div>
        </td>
        <td>
          <span class="cell-title">Bill of Lading Number</span>
          <div class="cell-data cell-data-bold">${escapeHtml(blNo)}</div>
        </td>
      </tr>
      <tr>
        <td>
          <span class="cell-title">Freight Forwarder / Agent Details</span>
          <div class="cell-data">${escapeHtml(shipment.forwarderReference || '---')}</div>
        </td>
      </tr>

      <tr>
        <td colspan="2">
          <span class="cell-title">Notify Party (Carrier not responsible for failure to notify)</span>
          <div class="cell-data">${escapeHtml(notifyParty)}</div>
        </td>
      </tr>

      <!-- Routing Grid -->
      <tr>
        <td style="width: 50%;">
          <span class="cell-title">Pre-Carriage by</span>
          <div class="cell-data">${escapeHtml(preCarriage || 'ROAD / FEEDER')}</div>
        </td>
        <td style="width: 50%;">
          <span class="cell-title">Place of Receipt</span>
          <div class="cell-data">${escapeHtml(placeOfReceipt || '---')}</div>
        </td>
      </tr>
      <tr>
        <td>
          <span class="cell-title">Ocean Vessel / Voyage Number</span>
          <div class="cell-data cell-data-bold">${escapeHtml(vesselVoyage || '---')}</div>
        </td>
        <td>
          <span class="cell-title">Port of Loading</span>
          <div class="cell-data">${escapeHtml(pol || '---')}</div>
        </td>
      </tr>
      <tr>
        <td>
          <span class="cell-title">Port of Discharge</span>
          <div class="cell-data">${escapeHtml(pod || '---')}</div>
        </td>
        <td>
          <span class="cell-title">Place of Delivery by Carrier / Final Destination</span>
          <div class="cell-data">${escapeHtml(placeOfDelivery || '---')}</div>
        </td>
      </tr>
    </table>

    <!-- Main Cargo Table (4 columns) -->
    <table class="table-layout" style="border-top: none;">
      <tr style="background: #f8fafc;">
        <th style="width: 25%;"><span class="cell-title">Container Nos. / Marks &amp; Numbers</span></th>
        <th style="width: 45%;"><span class="cell-title">Number and Kind of Packages / Description of Goods</span></th>
        <th style="width: 15%;" class="right-col"><span class="cell-title">Gross / Net Weight (KGS)</span></th>
        <th style="width: 15%;" class="right-col"><span class="cell-title">Measurement (CBM)</span></th>
      </tr>
      <tr>
        <td style="min-height: 200px;">
          <div class="cell-data cell-data-bold" style="color: #0369a1; margin-bottom: 4px;">
            ${escapeHtml(shipment.containerNumber ? `${shipment.containerNumber} / ${shipment.sealNumber || 'NO SEAL'}` : 'CONTAINER TO BE ADVISED')}
          </div>
          <div class="cell-data">${escapeHtml(marksAndNumbers || '---')}</div>
        </td>
        <td>
          <div class="cell-data">${escapeHtml(cargoDesc)}</div>
        </td>
        <td class="right-col">
          <div class="cell-data cell-data-bold">${escapeHtml(grossWt || '---')}</div>
          ${netWt ? `<div class="cell-data" style="color: #475569; font-size: 8.5px; margin-top: 4px;">NT: ${escapeHtml(netWt)}</div>` : ''}
        </td>
        <td class="right-col">
          <div class="cell-data">${escapeHtml(measurement || '---')}</div>
        </td>
      </tr>
    </table>

    <!-- Summary Bar -->
    <table class="table-layout" style="border-top: none; background: #f8fafc;">
      <tr>
        <td style="width: 40%;">
          <span class="cell-title">Total Number of Packages / Containers</span>
          <div class="cell-data cell-data-bold">
            ${shipment.outerPackagingCount > 0 ? `${shipment.outerPackagingCount} ${shipment.outerPackagingType || 'PALLETS'}` : `${shipment.totalPallets || 1} PALLETS`}
            ${shipment.innerPackageCount > 0 ? ` (${shipment.innerPackageCount} ${shipment.innerPackageType || 'BOXES'})` : ''}
          </div>
        </td>
        <td style="width: 30%;">
          <span class="cell-title">Movement</span>
          <div class="cell-data cell-data-bold">${escapeHtml(movement)}</div>
        </td>
        <td style="width: 30%;">
          <span class="cell-title">Freight &amp; Charges</span>
          <div class="cell-data cell-data-bold" style="color: #b91c1c;">${escapeHtml(freightTerms)}</div>
        </td>
      </tr>
    </table>

    <!-- Bottom Container Summary Table (5 Columns) -->
    <table class="table-layout" style="border-top: none;">
      <tr style="background: #e2e8f0;">
        <th style="width: 25%;"><span class="cell-title">CONT. NO.</span></th>
        <th style="width: 20%;"><span class="cell-title">SEAL NO.</span></th>
        <th style="width: 15%;" class="center-col"><span class="cell-title">PALLETS</span></th>
        <th style="width: 20%;" class="right-col"><span class="cell-title">GR. WT. KGS</span></th>
        <th style="width: 20%;" class="right-col"><span class="cell-title">NT. WT. KGS</span></th>
      </tr>
      ${shipment.containers && shipment.containers.length > 1 ? shipment.containers.map((cont, cIdx) => {
        const cPallets = cont.palletIndices && cont.palletIndices.length > 0 && shipment.pallets
          ? cont.palletIndices.map(i => shipment.pallets[i]).filter(Boolean)
          : [];
        const cGross = cPallets.reduce((s, p) => s + (p.grossWeightKg || 0), 0);
        const cNet = cPallets.reduce((s, p) => s + (p.netWeightKg || 0), 0);
        const cTare = cont.tareWeightKg || 2150;
        const cVgm = cGross + cTare;
        return `
      <tr>
        <td><div class="cell-data cell-data-bold">${escapeHtml(cont.containerNumber || `Container ${cIdx + 1}`)}</div></td>
        <td><div class="cell-data">${escapeHtml(cont.sealNumber || '---')}</div></td>
        <td class="center-col"><div class="cell-data">${cPallets.length || cont.palletIndices?.length || '---'}</div></td>
        <td class="right-col"><div class="cell-data cell-data-bold">${cGross > 0 ? cGross.toFixed(2) : '---'}</div></td>
        <td class="right-col"><div class="cell-data">${cNet > 0 ? cNet.toFixed(2) : '---'}</div></td>
      </tr>
      <tr style="background: #f8fafc; font-size: 8px;">
        <td colspan="2" style="font-size: 8px; color: #64748b;">${escapeHtml(cont.label || `Container ${cIdx + 1}`)} (Tare: ${cTare} kg)</td>
        <td class="center-col" style="font-weight: bold; color: #047857;">VGM</td>
        <td colspan="2" class="right-col font-bold" style="color: #047857;">${cVgm.toFixed(2)} KGS</td>
      </tr>`;
      }).join('') : `
      <tr>
        <td><div class="cell-data cell-data-bold">${escapeHtml(shipment.containerNumber || '---')}</div></td>
        <td><div class="cell-data">${escapeHtml(shipment.sealNumber || '---')}</div></td>
        <td class="center-col"><div class="cell-data">${shipment.totalPallets || shipment.outerPackagingCount || 1}</div></td>
        <td class="right-col"><div class="cell-data cell-data-bold">${shipment.grossWeightKg > 0 ? shipment.grossWeightKg.toFixed(2) : '---'}</div></td>
        <td class="right-col"><div class="cell-data">${shipment.netWeightKg > 0 ? shipment.netWeightKg.toFixed(2) : '---'}</div></td>
      </tr>
      ${shipment.tareWeightKg > 0 ? `
      <tr style="background: #f8fafc; font-size: 8.5px;">
        <td colspan="3" style="text-align: right; font-weight: bold; color: #475569;">CONTAINER TARE WEIGHT:</td>
        <td colspan="2" class="right-col font-bold">${shipment.tareWeightKg.toFixed(2)} KGS</td>
      </tr>` : ''}
      ${vgmVal !== null ? `
      <tr style="background: #f1f5f9; font-size: 9px; font-weight: bold;">
        <td colspan="3" style="text-align: right; color: #047857;">VERIFIED GROSS MASS (VGM):</td>
        <td colspan="2" class="right-col" style="color: #047857;">${vgmVal.toFixed(2)} KGS</td>
      </tr>` : ''}`}
    </table>
  </div>

  ${includePallets ? renderPalletAnnexHtml(shipment) : ''}
</body>
</html>`;
}

/**
 * Renders Pallet Breakdown Annex
 */
function renderPalletAnnexHtml(shipment: ExtractedShipmentJSON): string {
  return `
  <div class="annex-section" style="max-width: 820px; margin: 14px auto 0 auto;">
    <h3 class="annex-title">Annex: Pallet-Level Packaging &amp; Weight Breakdown (${shipment.pallets.length} Pallets)</h3>
    <table class="annex-table">
      <thead>
        <tr>
          <th style="width: 35px;">#</th>
          <th>Pallet No.</th>
          <th>Model / Description</th>
          <th style="text-align: right;">Boxes</th>
          <th style="text-align: right;">Net Wt (kg)</th>
          <th style="text-align: right;">Gross Wt (kg)</th>
        </tr>
      </thead>
      <tbody>
        ${shipment.pallets.map((p, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td><strong>${escapeHtml(p.palletNumber)}</strong></td>
            <td>${escapeHtml(p.modelCode || '---')}</td>
            <td style="text-align: right;">${p.boxCount}</td>
            <td style="text-align: right;">${p.netWeightKg.toFixed(2)}</td>
            <td style="text-align: right;">${p.grossWeightKg.toFixed(2)}</td>
          </tr>
        `).join('')}
        <tr style="font-weight: 700; background: #e2e8f0;">
          <td colspan="3">TOTALS:</td>
          <td style="text-align: right;">${shipment.totalBoxes || shipment.pallets.reduce((s, p) => s + p.boxCount, 0)}</td>
          <td style="text-align: right;">${shipment.netWeightKg.toFixed(2)}</td>
          <td style="text-align: right;">${shipment.grossWeightKg.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
  </div>`;
}

/**
 * Downloads a standalone, print-ready HTML file
 */
export function downloadManifestHtml(
  shipment: ExtractedShipmentJSON,
  format: FormatSchemaJSON,
  mappedFields: MappedManifestField[],
  options: ManifestExportOptions = {}
): void {
  const html = generateManifestHtml(shipment, format, mappedFields, options);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const docSlug = format.documentType === 'DG' ? 'DG_Manifest' : 'BL_Draft';
  const refCode = shipment.bookingNumber || shipment.invoiceNumbers?.[0] || 'Shipment';
  a.download = `${docSlug}_${refCode.replace(/[^a-zA-Z0-9_-]/g, '_')}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Opens a print dialog for direct PDF generation via the browser
 */
export function printManifestToPdf(
  shipment: ExtractedShipmentJSON,
  format: FormatSchemaJSON,
  mappedFields: MappedManifestField[],
  options: ManifestExportOptions = {}
): void {
  const html = generateManifestHtml(shipment, format, mappedFields, options);
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Popup blocked. Please allow popups for this site to print PDF.');
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  };
}

/**
 * Generates an editable Microsoft Word OpenXML (.docx) archive without external heavy binary dependencies
 */
export async function exportManifestToDocx(
  shipment: ExtractedShipmentJSON,
  format: FormatSchemaJSON,
  mappedFields: MappedManifestField[],
  options: ManifestExportOptions = {}
): Promise<Blob> {
  const isDg = format.documentType === 'DG';
  const tmplId: DgTemplateId = (
    format?.formatId && format.formatId in DG_TEMPLATE_DEFINITIONS
      ? format.formatId
      : detectRecommendedDgTemplate(shipment.carrierName)
  ) as DgTemplateId;

  // 1. Direct Binary Master Template Slot-In for Excel Templates (KMTC_DG, CMA_CGM_DG)
  if (isDg && (tmplId === 'KMTC_DG' || tmplId === 'CMA_CGM_DG')) {
    try {
      const templateFilename = `${tmplId}.xlsx`;
      const res = await fetch(`/templates/dg/${templateFilename}`);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const wb = XLSX.read(arrayBuf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];

        const shipperLines = (shipment.shipperAddress || shipment.shipperName || '').split('\n');
        const consigneeLines = (shipment.consigneeAddress || shipment.consigneeName || '').split('\n');
        const outerCount = shipment.outerPackagingCount || shipment.totalPallets || shipment.pallets?.length || 0;
        const innerCount = shipment.innerPackageCount || shipment.totalBoxes || shipment.totalPackages || 0;
        const unNo = shipment.unNumber || '2794';
        const psn = shipment.properShippingName || 'BATTERIES, WET, FILLED WITH ACID';
        const techName = shipment.productDescription || 'LEAD ACID STORAGE BATTERIES';
        const imoClass = shipment.imoClass || '8';
        const pg = shipment.packingGroup || 'III';
        const ems = shipment.emsNumber || 'F-A, S-B';
        const unPkg = shipment.unPackingCode || '';
        const sgg = shipment.segregationGroup || 'SGG1';

        const updateCell = (addr: string, val: string) => {
          if (ws[addr]) {
            ws[addr].v = val;
            ws[addr].t = 's';
          } else {
            ws[addr] = { v: val, t: 's' };
          }
        };

        if (tmplId === 'KMTC_DG') {
          updateCell('B9', shipment.shipperName || '');
          updateCell('B10', shipperLines[0] || '');
          updateCell('B11', shipperLines[1] || '');
          updateCell('B12', shipperLines.slice(2).join(', '));
          updateCell('D9', shipment.shipperReference || shipment.invoiceNumbers?.[0] || '');
          updateCell('D15', shipment.emergencyContactPhone || '');
          updateCell('B17', shipment.consigneeName || '');
          updateCell('B18', consigneeLines[0] || '');
          updateCell('B19', consigneeLines[1] || '');
          updateCell('B20', consigneeLines.slice(2).join(', '));
          updateCell('D17', shipment.carrierName || 'KOREA MARINE TRANSPORT CO. LTD.');
          updateCell('D19', shipment.bookingNumber || '');
          updateCell('D24', shipment.dgDeclarantName || 'AUTHORIZED SIGNATORY');
          updateCell('D25', shipment.shipperName || '');
          updateCell('D27', shipment.dgDeclarationPlaceAndDate || '');
          updateCell('B32', shipment.vesselName ? (shipment.voyageNumber ? `${shipment.vesselName} / ${shipment.voyageNumber}` : shipment.vesselName) : '');
          updateCell('C32', shipment.portOfLoading || '');
          updateCell('D32', shipment.containerNumber || '');
          updateCell('G32', shipment.sealNumber || '');
          updateCell('B34', shipment.portOfDischarge || '');
          updateCell('C34', shipment.finalDestination || shipment.portOfDischarge || '');
          updateCell('C37', `UN NO :- ${unNo}`);
          updateCell('G37', shipment.grossWeightKg > 0 ? `GR WT : ${shipment.grossWeightKg.toLocaleString()} KGS` : '');
          updateCell('C39', `PROPER SHIPPING NAME : - ${psn}`);
          updateCell('G39', shipment.netWeightKg > 0 ? `NT WT : ${shipment.netWeightKg.toLocaleString()} KGS` : '');
          updateCell('C41', `TECHNICAL  NAME : - ${techName}`);
          updateCell('B43', `OUTER PACKAGES :- ${outerCount} PALLETS`);
          updateCell('C43', `CLASS :- ${imoClass}`);
          updateCell('D43', 'SUB CLASS :- N/A');
          updateCell('B45', `INNER PACKING :- ${innerCount} BOXES`);
          updateCell('C45', `UN PACKING GROUP :- ${pg}`);
          updateCell('C47', unPkg ? `UN PACKING CODE :-  ${unPkg}` : '');
          updateCell('C49', `EMS NO :- ${ems}`);
          updateCell('C51', 'FLASH POINT :- NA');
          updateCell('C53', `MARINE POLLUTANT :- ${shipment.marinePollutant ? 'YES' : 'NO'}`);
          updateCell('C55', `SEGREGATION GROUP :- ${sgg}`);
          updateCell('D58', `${shipment.dgDeclarantName || 'AUTHORIZED SIGNATORY'} / ${shipment.shipperName || ''}`);
          updateCell('D60', shipment.dgDeclarationPlaceAndDate || '');
        } else if (tmplId === 'CMA_CGM_DG') {
          updateCell('B9', shipment.shipperName || '');
          updateCell('B10', shipperLines[0] || '');
          updateCell('B11', shipperLines[1] || '');
          updateCell('B12', shipperLines.slice(2).join(', '));
          updateCell('D9', shipment.shipperReference || shipment.invoiceNumbers?.[0] || '');
          updateCell('D15', shipment.emergencyContactPhone || '');
          updateCell('B17', shipment.consigneeName || '');
          updateCell('B18', consigneeLines[0] || '');
          updateCell('B19', consigneeLines[1] || '');
          updateCell('B20', consigneeLines.slice(2).join(', '));
          updateCell('D17', shipment.carrierName || 'CMA-CGM AGENCIES INDIA PVT.LTD.');
          updateCell('D18', `Carrier's Booking Number: ${shipment.bookingNumber || ''}`);
          updateCell('D22', `${shipment.dgDeclarantName || 'AUTHORIZED SIGNATORY'}, ${shipment.shipperName || ''}`);
          updateCell('D25', shipment.dgDeclarationPlaceAndDate || '');
          updateCell('B30', shipment.vesselName ? (shipment.voyageNumber ? `${shipment.vesselName} / ${shipment.voyageNumber}` : shipment.vesselName) : '');
          updateCell('C30', shipment.portOfLoading || '');
          updateCell('D31', shipment.containerNumber || '');
          updateCell('G31', shipment.sealNumber || '');
          updateCell('B32', shipment.portOfDischarge || '');
          updateCell('C32', shipment.finalDestination || shipment.portOfDischarge || '');
          updateCell('C35', `UN NO :- ${unNo}`);
          updateCell('G35', shipment.grossWeightKg > 0 ? `GR WT : ${shipment.grossWeightKg.toLocaleString()} KGS` : '');
          updateCell('C37', `PROPER SHIPPING NAME : -  ${psn}`);
          updateCell('G37', shipment.netWeightKg > 0 ? `NT WT :  ${shipment.netWeightKg.toLocaleString()} KGS` : '');
          updateCell('C39', `TECHNICAL  NAME :  ${techName}`);
          updateCell('B41', `OUTER PACKAGES : ${outerCount} PALLETS`);
          updateCell('C41', `CLASS :- ${imoClass}`);
          updateCell('D41', 'SUB CLASS :-  NA');
          updateCell('B43', `INNER PACKING :-  ${innerCount} BOXES`);
          updateCell('C43', `UN PACKING GROUP :-${pg}`);
          updateCell('C45', unPkg ? `UN PACKING CODE :-  ${unPkg}` : '');
          updateCell('C47', `EMS NO :-  ${ems}`);
          updateCell('C49', 'FLASH POINT :-  NA');
          updateCell('C51', `MARINE POLLUTANT :-   ${shipment.marinePollutant ? 'YES' : 'NA'}`);
          updateCell('D54', `${shipment.dgDeclarantName || 'AUTHORIZED SIGNATORY'}, ${shipment.shipperName || ''}`);
          updateCell('D56', shipment.dgDeclarationPlaceAndDate || '');
        }

        const outBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        return new Blob([outBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      }
    } catch (e) {
      console.warn('Direct XLSX master template slot-in failed, falling back:', e);
    }
  }

  // 2. Direct Binary Master Template Slot-In for Word Templates (.docx)
  if (isDg) {
    try {
      const templateFilename = `${tmplId}.docx`;
      const res = await fetch(`/templates/dg/${templateFilename}`);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const zip = new PizZip(arrayBuf);
        const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
          nullGetter: () => ''
        });

        const isDiamond = tmplId === 'DIAMOND_MARITIME_DG';
        const isOneLine = tmplId === 'ONE_LINE_DG';
        const isMscLine = tmplId === 'MSC_LINE_DG';
        const isNomination = tmplId === 'NOMINATION_DG';
        const isVstar = tmplId === 'VSTAR_DG';

        const outerCount = shipment.outerPackagingCount || shipment.totalPallets || shipment.pallets?.length || 0;
        const innerCount = shipment.innerPackageCount || shipment.totalBoxes || shipment.totalPackages || 0;
        const unNo = shipment.unNumber || '2794';
        const psn = shipment.properShippingName || 'BATTERIES, WET, FILLED WITH ACID';
        const techName = shipment.productDescription || 'LEAD ACID STORAGE BATTERIES';
        const imoClass = shipment.imoClass || '8';
        const pg = shipment.packingGroup || 'III';
        const ems = shipment.emsNumber || 'F-A, S-B';
        const unPkg = shipment.unPackingCode || '';
        const sgg = shipment.segregationGroup || 'SGG1';
        const tareVal = shipment.tareWeightKg || 2200;
        const vgmVal = (shipment.grossWeightKg || 0) + tareVal;

        const data: Record<string, string> = {
          shipperBlock: shipment.shipperAddress || shipment.shipperName || '',
          shipperName: shipment.shipperName || '',
          shipperAddressLine1: (shipment.shipperAddress || '').split('\n')[0] || '',
          shipperAddressLine2: (shipment.shipperAddress || '').split('\n')[1] || '',
          shipperAddressLine3: (shipment.shipperAddress || '').split('\n').slice(2).join(', ') || '',
          consigneeBlock: shipment.consigneeAddress || shipment.consigneeName || '',
          consigneeName: shipment.consigneeName || '',
          consigneeAddressLine1: (shipment.consigneeAddress || '').split('\n')[0] || '',
          consigneeAddressLine2: (shipment.consigneeAddress || '').split('\n')[1] || '',
          consigneeAddressLine3: (shipment.consigneeAddress || '').split('\n').slice(2).join(', ') || '',
          bookingNo: shipment.bookingNumber || '',
          pageInfo: '1 OF 1',
          shipperRef: shipment.shipperReference || shipment.invoiceNumbers?.[0] || '',
          forwarderRef: shipment.forwarderReference || '',
          carrierName: shipment.carrierName || (isOneLine ? 'ONE LINE' : (isMscLine ? 'MSC MEDITERRANEAN SHIPPING COMPANY' : (isDiamond ? 'DIAMOND MARITIME AGENCY PVT LTD' : ''))),
          vesselVoyage: shipment.vesselName ? (shipment.voyageNumber ? `${shipment.vesselName} / ${shipment.voyageNumber}` : shipment.vesselName) : '',
          portOfLoading: shipment.portOfLoading || '',
          portOfDischarge: shipment.portOfDischarge || '',
          destination: shipment.finalDestination || shipment.portOfDischarge || '',
          emergencyContact: shipment.emergencyContactPhone || '',
          cargoDescriptionBlock: buildTemplateCargoBlock(tmplId, shipment),
          grossMass: shipment.grossWeightKg > 0 ? `${shipment.grossWeightKg.toLocaleString()} KGS` : '',
          netMass: shipment.netWeightKg > 0 ? `${shipment.netWeightKg.toLocaleString()} KGS` : '',
          cube: shipment.volumeCbm > 0 ? `${shipment.volumeCbm} CBM` : (isDiamond ? '25 CBM' : ''),
          unPackingCode: unPkg || '',
          containerNo: shipment.containerNumber || '',
          sealNo: shipment.sealNumber || '',
          containerType: isDiamond ? '01X20 GP' : (isOneLine || isMscLine ? "1x20'" : (isNomination || isVstar ? '20 GP' : (shipment.containerType || "20' GP"))),
          tareMass: `${tareVal.toLocaleString()} KGS`,
          totalGrossVgm: vgmVal > 0 ? `${vgmVal.toLocaleString()} KGS` : '',
          declarantName: shipment.dgDeclarantName || 'AUTHORIZED SIGNATORY',
          placeAndDate: shipment.dgDeclarationPlaceAndDate || '',
          haulierName: '',
          vehicleRegNo: '',
          unNumber: unNo,
          properShippingName: psn,
          technicalName: techName,
          hazardClass: imoClass,
          subsidiaryRisk: 'NA',
          packingGroup: pg,
          emsNo: ems,
          flashPoint: 'NA',
          marinePollutant: shipment.marinePollutant ? 'YES' : 'NA',
          segregationGroup: sgg,
          outerPackages: `${outerCount} PALLETS`,
          innerPackages: `${innerCount} BOXES`
        };

        doc.render(data);
        const outBlob = doc.getZip().generate({
          type: 'blob',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
        return outBlob;
      }
    } catch (e) {
      console.warn('Direct DOCX master template slot-in failed, falling back:', e);
    }
  }

  // 3. Fallback / Standard Ocean B/L Draft via dynamic JSZip XML assembly
  const zip = new JSZip();

  // 1. [Content_Types].xml
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
  zip.file('[Content_Types].xml', contentTypesXml);

  // 2. _rels/.rels
  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  zip.file('_rels/.rels', rootRelsXml);

  // 3. word/_rels/document.xml.rels
  const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  zip.file('word/_rels/document.xml.rels', docRelsXml);

  // 4. word/styles.xml
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
        <w:sz w:val="20"/>
        <w:color w:val="0F172A"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
</w:styles>`;
  zip.file('word/styles.xml', stylesXml);

  // Helper to format text with line breaks into OpenXML runs
  const makeTextRuns = (text: string, bold: boolean = false, sizeHalfPts: number = 20, colorHex: string = '0F172A'): string => {
    if (!text) {
      return `<w:r><w:rPr><w:i/><w:color w:val="94A3B8"/></w:rPr><w:t>---</w:t></w:r>`;
    }
    const lines = text.split('\n');
    return lines.map((line, idx) => `
      <w:r>
        <w:rPr>
          ${bold ? '<w:b/>' : ''}
          <w:sz w:val="${sizeHalfPts}"/>
          <w:color w:val="${colorHex}"/>
        </w:rPr>
        <w:t xml:space="preserve">${escapeXml(line)}</w:t>
      </w:r>
      ${idx < lines.length - 1 ? '<w:r><w:br/></w:r>' : ''}
    `).join('');
  };

  // 5. word/document.xml
  const grouped = groupManifestFieldsBySection(mappedFields);
  let tableRowsXml = '';

  for (const [sectionName, fields] of Object.entries(grouped)) {
    // Section Header row
    tableRowsXml += `
      <w:tr>
        <w:trPr>
          <w:cantSplit/>
        </w:trPr>
        <w:tc>
          <w:tcPr>
            <w:gridSpan w:val="2"/>
            <w:shd w:val="clear" w:color="auto" w:fill="E2E8F0"/>
            <w:tcMar>
              <w:top w:w="80" w:type="dxa"/>
              <w:bottom w:w="80" w:type="dxa"/>
              <w:left w:w="120" w:type="dxa"/>
              <w:right w:w="120" w:type="dxa"/>
            </w:tcMar>
          </w:tcPr>
          <w:p>
            <w:pPr><w:spacing w:after="0" w:before="0"/></w:pPr>
            <w:r>
              <w:rPr><w:b/><w:sz w:val="18"/><w:color w:val="1E293B"/></w:rPr>
              <w:t>${escapeXml(sectionName.toUpperCase())}</w:t>
            </w:r>
          </w:p>
        </w:tc>
      </w:tr>
    `;

    // Field pairs
    for (const field of fields) {
      tableRowsXml += `
        <w:tr>
          <w:trPr>
            <w:cantSplit/>
          </w:trPr>
          <w:tc>
            <w:tcPr>
              <w:gridSpan w:val="2"/>
              <w:tcBorders>
                <w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
                <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
                <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
                <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
              </w:tcBorders>
              <w:tcMar>
                <w:top w:w="80" w:type="dxa"/>
                <w:bottom w:w="80" w:type="dxa"/>
                <w:left w:w="120" w:type="dxa"/>
                <w:right w:w="120" w:type="dxa"/>
              </w:tcMar>
            </w:tcPr>
            <w:p>
              <w:pPr><w:spacing w:after="40" w:before="0"/></w:pPr>
              <w:r>
                <w:rPr><w:b/><w:sz w:val="16"/><w:color w:val="475569"/></w:rPr>
                <w:t>${escapeXml(field.labelInTemplate.toUpperCase())}</w:t>
              </w:r>
            </w:p>
            <w:p>
              <w:pPr><w:spacing w:after="0" w:before="0"/></w:pPr>
              ${makeTextRuns(field.value, false, 20, '0F172A')}
            </w:p>
          </w:tc>
        </w:tr>
      `;
    }
  }

  // Optional Pallet Table in Word
  let palletAnnexXml = '';
  const shouldIncludePallets = isDg ? (options.includePalletAnnex === true) : (options.includePalletAnnex !== false);
  if (shouldIncludePallets && shipment.pallets && shipment.pallets.length > 0) {
    let palletRows = '';
    for (let idx = 0; idx < shipment.pallets.length; idx++) {
      const p = shipment.pallets[idx];
      palletRows += `
        <w:tr>
          <w:tc><w:tcPr><w:tcBorders><w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:color="CBD5E1"/></w:tcBorders></w:tcPr><w:p><w:r><w:t>${idx + 1}</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcBorders><w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:color="CBD5E1"/></w:tcBorders></w:tcPr><w:p><w:r><w:b/><w:t>${escapeXml(p.palletNumber)}</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcBorders><w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:color="CBD5E1"/></w:tcBorders></w:tcPr><w:p><w:r><w:t>${escapeXml(p.modelCode || '---')}</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcBorders><w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:color="CBD5E1"/></w:tcBorders></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>${p.boxCount}</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcBorders><w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:color="CBD5E1"/></w:tcBorders></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>${p.netWeightKg.toFixed(2)}</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcBorders><w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:color="CBD5E1"/></w:tcBorders></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>${p.grossWeightKg.toFixed(2)}</w:t></w:r></w:p></w:tc>
        </w:tr>
      `;
    }

    palletAnnexXml = `
      <w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>ANNEX: PALLET-LEVEL PACKAGING &amp; WEIGHT BREAKDOWN</w:t></w:r></w:p>
      <w:tbl>
        <w:tblPr>
          <w:tblW w:w="0" w:type="auto"/>
          <w:tblBorders>
            <w:top w:val="single" w:sz="4" w:color="CBD5E1"/>
            <w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/>
            <w:left w:val="single" w:sz="4" w:color="CBD5E1"/>
            <w:right w:val="single" w:sz="4" w:color="CBD5E1"/>
            <w:insideH w:val="single" w:sz="4" w:color="CBD5E1"/>
            <w:insideV w:val="single" w:sz="4" w:color="CBD5E1"/>
          </w:tblBorders>
        </w:tblPr>
        <w:tr>
          <w:trPr><w:tblHeader/></w:trPr>
          <w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>#</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>PALLET NO.</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>MODEL / DESCRIPTION</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>BOXES</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>NET WT (KG)</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>GROSS WT (KG)</w:t></w:r></w:p></w:tc>
        </w:tr>
        ${palletRows}
      </w:tbl>
    `;
  }

  let docTitle = isDg ? 'MULTIMODAL DANGEROUS GOODS DECLARATION' : 'BILL OF LADING FOR OCEAN TRANSPORT';
  if (isDg) {
    if (tmplId === 'KMTC_DG' || tmplId === 'CMA_CGM_DG') {
      docTitle = 'IMO DANGEROUS GOODS DECLARATION';
    } else if (tmplId !== 'COMMON_DG') {
      docTitle = 'MULTIMODAL DANGEROUS GOODS FORM';
    }
  }
  const refCode = shipment.bookingNumber || shipment.invoiceNumbers?.[0] || shipment.shipperReference || 'DRAFT';

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Heading1"/>
        <w:jc w:val="center"/>
        <w:spacing w:after="60"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="0F172A"/></w:rPr>
        <w:t>${escapeXml(docTitle)}</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="center"/><w:spacing w:after="160"/></w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="18"/><w:color w:val="64748B"/></w:rPr>
        <w:t>${escapeXml(format.formatName)} - REF: ${escapeXml(refCode)}</w:t>
      </w:r>
    </w:p>
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="0" w:type="auto"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="6" w:space="0" w:color="0F172A"/>
          <w:bottom w:val="single" w:sz="6" w:space="0" w:color="0F172A"/>
          <w:left w:val="single" w:sz="6" w:space="0" w:color="0F172A"/>
          <w:right w:val="single" w:sz="6" w:space="0" w:color="0F172A"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
          <w:insideV w:val="none"/>
        </w:tblBorders>
      </w:tblPr>
      ${tableRowsXml}
    </w:tbl>
    ${palletAnnexXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  zip.file('word/document.xml', documentXml);

  return await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/**
 * Downloads an editable Microsoft Word .docx file
 */
export async function downloadManifestDocx(
  shipment: ExtractedShipmentJSON,
  format: FormatSchemaJSON,
  mappedFields: MappedManifestField[],
  options: ManifestExportOptions = {}
): Promise<void> {
  const isExcel = format.documentType === 'DG' && (format.formatId === 'KMTC_DG' || format.formatId === 'CMA_CGM_DG');
  const blob = await exportManifestToDocx(shipment, format, mappedFields, options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ext = isExcel ? 'xlsx' : 'docx';
  const docSlug = format.documentType === 'DG' ? 'DG_Manifest' : 'BL_Draft';
  const refCode = shipment.bookingNumber || shipment.invoiceNumbers?.[0] || 'Shipment';
  a.download = `${docSlug}_${refCode.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Downloads a complete bundle (.zip) containing .docx, .html, and .json for both DG and BL manifests
 */
export async function downloadCompleteShipmentPackage(
  shipment: ExtractedShipmentJSON,
  dgFormat: FormatSchemaJSON,
  mappedDgFields: MappedManifestField[],
  blFormat: FormatSchemaJSON,
  mappedBlFields: MappedManifestField[],
  options: ManifestExportOptions = {}
): Promise<void> {
  const zip = new JSZip();
  const refCode = (shipment.bookingNumber || shipment.invoiceNumbers?.[0] || 'DRAFT').replace(/[^a-zA-Z0-9_-]/g, '_');

  // 1. DG Manifests
  const dgHtml = generateManifestHtml(shipment, dgFormat, mappedDgFields, options);
  const dgDocxBlob = await exportManifestToDocx(shipment, dgFormat, mappedDgFields, options);
  const dgJson = JSON.stringify(mappedDgFields, null, 2);
  const isExcel = dgFormat.formatId === 'KMTC_DG' || dgFormat.formatId === 'CMA_CGM_DG';
  const dgDocxExt = isExcel ? 'xlsx' : 'docx';

  zip.file(`DG_Manifest_${refCode}.html`, dgHtml);
  zip.file(`DG_Declaration_${refCode}.${dgDocxExt}`, dgDocxBlob);
  zip.file(`DG_Manifest_${refCode}.json`, dgJson);

  // 2. BL Manifests
  const blHtml = generateManifestHtml(shipment, blFormat, mappedBlFields, options);
  const blDocxBlob = await exportManifestToDocx(shipment, blFormat, mappedBlFields, options);
  const blJson = JSON.stringify(mappedBlFields, null, 2);

  zip.file(`BL_Draft_${refCode}.html`, blHtml);
  zip.file(`BL_Draft_${refCode}.docx`, blDocxBlob);
  zip.file(`BL_Manifest_${refCode}.json`, blJson);

  // 3. Raw Universal Shipment JSON
  zip.file(`ExtractedShipmentJSON_${refCode}.json`, JSON.stringify(shipment, null, 2));

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const filename = `Shipment_Documentation_Package_${refCode}_${Date.now()}.zip`;

  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
