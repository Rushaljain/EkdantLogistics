// Ekdant Logistics - Multi-Format Output Exporter Engine
// Generates Carrier-Grade Maritime SOLAS/IMO DG Declarations, Standard Ocean B/L Drafts, and OpenXML Word (.docx) files
// Strictly zero hardcoded sample tokens: dynamically adapts to FormatSchemaJSON, MappedManifestField[], and ExtractedShipmentJSON

import JSZip from 'jszip';
import type { ExtractedShipmentJSON, FormatSchemaJSON, MappedManifestField } from '../types/index.ts';
import { groupManifestFieldsBySection } from './manifestMatcher.ts';
import { buildImoBox14CargoBlock } from './manifestKeywordReference.ts';

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
  _format: FormatSchemaJSON,
  mappedFields: MappedManifestField[],
  refCode: string,
  includePallets: boolean
): string {
  // Field Value Lookups
  const val = (pred: (id: string, label: string) => boolean) => findFieldValue(mappedFields, pred);

  const box1Shipper = val((id, lbl) => id.includes('box_1') || lbl.includes('shipper') || lbl.includes('consignor')) ||
    `${shipment.shipperName}\n${shipment.shipperAddress}${shipment.shipperIec ? `\nIEC: ${shipment.shipperIec}` : ''}${shipment.shipperGstin ? `\nGSTIN: ${shipment.shipperGstin}` : ''}`;
  const box2TransportDoc = val((id, lbl) => id.includes('box_2') || lbl.includes('transport document')) || shipment.bookingNumber || shipment.invoiceNumbers?.join(', ') || '';
  const box3Page = val((id, lbl) => id.includes('box_3') || lbl.includes('page of page') || id.includes('page')) || '1 OF 1';
  const box4ShipperRef = val((id, lbl) => id.includes('box_4') || lbl.includes("shipper's ref") || lbl.includes('shipper ref')) || shipment.shipperReference || '';
  const box5ForwarderRef = val((id, lbl) => id.includes('box_5') || lbl.includes('forwarder') || lbl.includes('freight forwarder')) || shipment.forwarderReference || '';
  const box6Consignee = val((id, lbl) => id.includes('box_6') || lbl.includes('consignee')) || `${shipment.consigneeName}\n${shipment.consigneeAddress}`;
  const box7Carrier = val((id, lbl) => id.includes('box_7') || lbl.includes('carrier')) || shipment.carrierName || '';

  const box10VesselVoyage = val((id, lbl) => id.includes('box_10') || lbl.includes('vessel')) || (shipment.vesselName ? (shipment.voyageNumber ? `${shipment.vesselName} / ${shipment.voyageNumber}` : shipment.vesselName) : '');
  const box11Pol = val((id, lbl) => id.includes('box_11') || lbl.includes('port of loading')) || shipment.portOfLoading || '';
  const box12Pod = val((id, lbl) => id.includes('box_12') || lbl.includes('port of discharge')) || shipment.portOfDischarge || '';
  const box13Dest = val((id, lbl) => id.includes('box_13') || lbl.includes('destination')) || shipment.finalDestination || shipment.portOfDischarge || '';

  const box14CargoBlock = buildImoBox14CargoBlock(shipment);

  const box16Gross = val((id, lbl) => id.includes('box_16') || lbl.includes('gross mass')) || (shipment.grossWeightKg > 0 ? `${shipment.grossWeightKg.toFixed(2)} KGS` : '');
  const box17Net = val((id, lbl) => id.includes('box_17') || lbl.includes('net mass')) || (shipment.netWeightKg > 0 ? `${shipment.netWeightKg.toFixed(2)} KGS` : '');
  const box18Cube = val((id, lbl) => id.includes('box_18') || lbl.includes('cube') || lbl.includes('m³')) || (shipment.volumeCbm > 0 ? `${shipment.volumeCbm.toFixed(3)} M³` : '');

  const box19Tare = val((id, lbl) => id.includes('box_18_tare') || id.includes('box_19_tare') || lbl.includes('tare mass')) || (shipment.tareWeightKg > 0 ? `${shipment.tareWeightKg.toFixed(0)} KGS` : '');
  const box19Vgm = val((id, lbl) => id.includes('box_19_total_gross') || id.includes('box_19_vgm') || lbl.includes('incl. tare') || lbl.includes('vgm')) ||
    (shipment.grossWeightKg > 0 && shipment.tareWeightKg > 0 ? `${Number((shipment.grossWeightKg + shipment.tareWeightKg).toFixed(2))} KGS` : (shipment.grossWeightKg > 0 ? `${shipment.grossWeightKg.toFixed(2)} KGS` : ''));

  const box20Declarant = val((id, lbl) => id.includes('box_20') || lbl.includes('container / vehicle packing certificate')) || shipment.dgDeclarantName || shipment.shipperName || '';
  const box21Emergency = val((id, lbl) => id.includes('box_9') || id.includes('box_21') || lbl.includes('emergency')) || shipment.emergencyContactPhone || '';
  const box22ShipperDecl = val((id, lbl) => id.includes('box_22') || lbl.includes("shipper's declaration") || lbl.includes('shipper declaration')) ||
    `${shipment.dgDeclarationPlaceAndDate || ''}\n${shipment.dgDeclarantName || shipment.shipperName || ''}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MULTIMODAL DANGEROUS GOODS DECLARATION - ${escapeHtml(refCode)}</title>
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
    .header-title-box .sub { font-size: 7.5px; font-weight: bold; color: #334155; margin-top: 1px; }
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
      <h1>MULTIMODAL DANGEROUS GOODS DECLARATION</h1>
      <div class="sub">This form meets the requirements of SOLAS 74, Chapter VII, Regulation 5.4 and MARPOL 73/78, Annex III, Regulation 4</div>
    </div>

    <!-- Top Half (50% Left / 50% Right Columns) -->
    <table class="table-layout">
      <tr>
        <!-- Left Column (50%) -->
        <td style="width: 50%; padding: 0; vertical-align: top; border: none;">
          <table class="table-layout" style="height: 100%;">
            <tr>
              <td style="height: 65px;">
                <span class="box-num">1. Shipper / Consignor / Sender</span>
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
            <tr>
              <td style="padding: 0;">
                <table class="table-layout">
                  <tr>
                    <td style="width: 45%; border-top: none; border-left: none; border-bottom: none;">
                      <span class="box-num">3. Page 1 of 1</span>
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
    </table>

    <!-- Official IMO Equipment Row (Boxes 15, 16, 17, 18, 19) -->
    <table class="table-layout" style="border-top: none;">
      <tr style="background: #f8fafc;">
        <th style="width: 26%;"><span class="box-num">15. Container identification no.</span></th>
        <th style="width: 20%;"><span class="box-num">16. Seal number(s)</span></th>
        <th style="width: 16%;"><span class="box-num">17. Container size &amp; type</span></th>
        <th style="width: 18%;" class="right-col"><span class="box-num">18. Tare mass (kg)</span></th>
        <th style="width: 20%;" class="right-col"><span class="box-num">19. Total gross (incl. tare) (kg)</span></th>
      </tr>
      <tr>
        <td><div class="box-val box-val-bold">${escapeHtml(shipment.containerNumber || '---')}</div></td>
        <td><div class="box-val">${escapeHtml(shipment.sealNumber || '---')}</div></td>
        <td><div class="box-val">${escapeHtml(shipment.containerType || "20' GP")}</div></td>
        <td class="right-col"><div class="box-val">${escapeHtml(box19Tare || '---')}</div></td>
        <td class="right-col"><div class="box-val box-val-bold" style="color: #047857;">${escapeHtml(box19Vgm || '---')}</div></td>
      </tr>
    </table>

    <!-- Bottom Signature Row (Boxes 20, 21, 22) -->
    <table class="table-layout" style="border-top: none;">
      <tr>
        <td style="width: 36%;">
          <span class="box-num">20. Container / Vehicle Packing Certificate</span>
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
          <span class="box-num">22. Shipper's Declaration</span>
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
      </tr>` : ''}
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

  const docTitle = isDg ? 'MULTIMODAL DANGEROUS GOODS DECLARATION' : 'BILL OF LADING FOR OCEAN TRANSPORT';
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
  const blob = await exportManifestToDocx(shipment, format, mappedFields, options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const docSlug = format.documentType === 'DG' ? 'DG_Manifest' : 'BL_Draft';
  const refCode = shipment.bookingNumber || shipment.invoiceNumbers?.[0] || 'Shipment';
  a.download = `${docSlug}_${refCode.replace(/[^a-zA-Z0-9_-]/g, '_')}.docx`;
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

  zip.file(`DG_Manifest_${refCode}.html`, dgHtml);
  zip.file(`DG_Declaration_${refCode}.docx`, dgDocxBlob);
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
