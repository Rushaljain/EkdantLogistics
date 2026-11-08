// Ekdant Logistics - Multi-Format Output Exporter Engine
// Generates Maritime Print-Ready HTML, Direct Vector PDF Printing, and Editable OpenXML Word (.docx) files
// Strictly zero hardcoded sample tokens: dynamically adapts to FormatSchemaJSON, MappedManifestField[], and ExtractedShipmentJSON

import JSZip from 'jszip';
import type { ExtractedShipmentJSON, FormatSchemaJSON, MappedManifestField } from '../types/index.ts';
import { groupManifestFieldsBySection } from './manifestMatcher.ts';

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
 * Generates standalone, maritime print-ready HTML with A4 @page CSS and standard maritime box styling
 */
export function generateManifestHtml(
  shipment: ExtractedShipmentJSON,
  format: FormatSchemaJSON,
  mappedFields: MappedManifestField[],
  options: ManifestExportOptions = {}
): string {
  const isDg = format.documentType === 'DG';
  const docTitle = isDg
    ? 'MULTIMODAL DANGEROUS GOODS DECLARATION'
    : 'BILL OF LADING FOR OCEAN TRANSPORT';
  const subTitle = format.formatName;

  const grouped = groupManifestFieldsBySection(mappedFields);
  const includePallets = options.includePalletAnnex !== false && shipment.pallets && shipment.pallets.length > 0;

  // Compute reference code for document header
  const refCode = shipment.bookingNumber ||
    (shipment.invoiceNumbers && shipment.invoiceNumbers[0]) ||
    shipment.shipperReference ||
    'DRAFT';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(docTitle)} - ${escapeHtml(refCode)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm 12mm 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
      margin: 0;
      padding: 16px;
      color: #0f172a;
      background: #ffffff;
      font-size: 11px;
      line-height: 1.35;
    }
    .document-container {
      max-width: 820px;
      margin: 0 auto;
      border: 2px solid #0f172a;
      padding: 0;
      background: #ffffff;
    }
    .header-bar {
      background: #0f172a;
      color: #ffffff;
      padding: 10px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #0f172a;
    }
    .header-bar h1 {
      margin: 0;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .header-bar .sub-meta {
      font-size: 9px;
      font-family: Consolas, monospace;
      color: #94a3b8;
    }
    .doc-meta-strip {
      background: #f1f5f9;
      border-bottom: 1px solid #cbd5e1;
      padding: 6px 14px;
      display: flex;
      justify-content: space-between;
      font-size: 9.5px;
      color: #334155;
    }
    .section-block {
      border-bottom: 1.5px solid #0f172a;
    }
    .section-title {
      background: #e2e8f0;
      color: #1e293b;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 3px 10px;
      border-bottom: 1px solid #cbd5e1;
    }
    .fields-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
    }
    .field-box {
      border-right: 1px solid #cbd5e1;
      border-bottom: 1px solid #cbd5e1;
      padding: 6px 8px;
      min-height: 48px;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
    }
    .field-box.full-width {
      grid-column: span 2;
      border-right: none;
    }
    .field-box:nth-child(2n) {
      border-right: none;
    }
    .field-label {
      font-size: 8.5px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      margin-bottom: 3px;
      letter-spacing: 0.2px;
    }
    .field-value {
      font-size: 10.5px;
      font-weight: 600;
      color: #0f172a;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: inherit;
    }
    .field-value.empty {
      color: #94a3b8;
      font-style: italic;
      font-weight: normal;
    }
    .annex-section {
      page-break-before: auto;
      border-top: 2px solid #0f172a;
      margin-top: 14px;
      padding: 10px 14px;
    }
    .annex-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      margin: 0 0 8px 0;
      color: #0f172a;
    }
    .annex-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5px;
    }
    .annex-table th {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 5px 6px;
      text-align: left;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 8.5px;
    }
    .annex-table td {
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
      color: #1e293b;
    }
    .annex-table tr:nth-child(even) {
      background: #f8fafc;
    }
    .text-right {
      text-align: right;
    }
    .footer-bar {
      background: #f8fafc;
      border-top: 1px solid #cbd5e1;
      padding: 8px 14px;
      font-size: 8.5px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      body {
        padding: 0;
        background: #ffffff;
      }
      .document-container {
        border: 1.5px solid #000000;
        max-width: 100%;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="document-container">
    <div class="header-bar">
      <div>
        <h1>${escapeHtml(docTitle)}</h1>
        <div class="sub-meta">${escapeHtml(subTitle)}</div>
      </div>
      <div style="text-align: right;">
        <div style="font-weight: 700; font-size: 11px; letter-spacing: 0.5px;">EKDANT LOGISTICS</div>
        <div class="sub-meta">REF: ${escapeHtml(refCode)}</div>
      </div>
    </div>

    <div class="doc-meta-strip">
      <div><strong>Date Issued:</strong> ${new Date().toLocaleDateString('en-GB')}</div>
      <div><strong>Invoices:</strong> ${escapeHtml(shipment.invoiceNumbers?.join(', ') || '---')}</div>
      <div><strong>Container:</strong> ${escapeHtml(shipment.containerNumber || '---')} (${escapeHtml(shipment.containerType)})</div>
      <div><strong>VGM:</strong> ${shipment.grossWeightKg > 0 && shipment.tareWeightKg > 0 ? Number((shipment.grossWeightKg + shipment.tareWeightKg).toFixed(2)) + ' kg' : 'PENDING'}</div>
    </div>

    ${Object.entries(grouped).map(([sectionName, fields]) => `
      <div class="section-block">
        <div class="section-title">${escapeHtml(sectionName)}</div>
        <div class="fields-grid">
          ${fields.map(field => {
            const isFullWidth = field.fieldType === 'multiline' ||
              field.fieldType === 'table' ||
              field.labelInTemplate.toLowerCase().includes('declaration') ||
              field.labelInTemplate.toLowerCase().includes('description') ||
              field.labelInTemplate.toLowerCase().includes('certificate') ||
              field.labelInTemplate.toLowerCase().includes('particulars');
            const hasVal = field.value && field.value.trim() !== '';

            return `
              <div class="field-box ${isFullWidth ? 'full-width' : ''}">
                <div class="field-label">${escapeHtml(field.labelInTemplate)}</div>
                <div class="field-value ${!hasVal ? 'empty' : ''}">${hasVal ? escapeHtml(field.value) : '---'}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `).join('')}

    ${includePallets ? `
      <div class="annex-section">
        <h3 class="annex-title">Annex: Pallet-Level Packaging & Weight Breakdown (${shipment.pallets.length} Pallets)</h3>
        <table class="annex-table">
          <thead>
            <tr>
              <th style="width: 35px;">#</th>
              <th>Pallet No.</th>
              <th>Model / Description</th>
              <th class="text-right">Boxes</th>
              <th class="text-right">Net Wt (kg)</th>
              <th class="text-right">Gross Wt (kg)</th>
            </tr>
          </thead>
          <tbody>
            ${shipment.pallets.map((p, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><strong>${escapeHtml(p.palletNumber)}</strong></td>
                <td>${escapeHtml(p.modelCode || '---')}</td>
                <td class="text-right">${p.boxCount}</td>
                <td class="text-right">${p.netWeightKg.toFixed(2)}</td>
                <td class="text-right">${p.grossWeightKg.toFixed(2)}</td>
              </tr>
            `).join('')}
            <tr style="font-weight: 700; background: #e2e8f0;">
              <td colspan="3">TOTALS:</td>
              <td class="text-right">${shipment.totalBoxes || shipment.pallets.reduce((s, p) => s + p.boxCount, 0)}</td>
              <td class="text-right">${shipment.netWeightKg.toFixed(2)}</td>
              <td class="text-right">${shipment.grossWeightKg.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    ` : ''}

    <div class="footer-bar">
      <div>Issued via Ekdant Logistics Multimodal Dispatch System</div>
      <div>Format: ${escapeHtml(format.formatName)}</div>
      <div>System Verified: ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC</div>
    </div>
  </div>
</body>
</html>`;
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
  const htmlContent = generateManifestHtml(shipment, format, mappedFields, options);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const refCode = (shipment.bookingNumber || shipment.invoiceNumbers?.[0] || 'DRAFT').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${format.documentType}_Manifest_${refCode}_${Date.now()}.html`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Opens a print dialog in a new browser popup window configured for vector-sharp PDF export
 */
export function printManifestToPdf(
  shipment: ExtractedShipmentJSON,
  format: FormatSchemaJSON,
  mappedFields: MappedManifestField[],
  options: ManifestExportOptions = {}
): void {
  const htmlContent = generateManifestHtml(shipment, format, mappedFields, options);
  const printWindow = window.open('', '_blank', 'width=900,height=900');
  if (!printWindow) {
    alert('Popup blocked. Please allow popups for this site to print PDF.');
    return;
  }

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();

  printWindow.onload = () => {
    printWindow.focus();
    setTimeout(() => {
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
  const zip = new JSZip();
  const isDg = format.documentType === 'DG';
  const docTitle = isDg
    ? 'MULTIMODAL DANGEROUS GOODS DECLARATION'
    : 'BILL OF LADING FOR OCEAN TRANSPORT';
  const refCode = shipment.bookingNumber || shipment.invoiceNumbers?.[0] || shipment.shipperReference || 'DRAFT';

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
      const isFull = field.fieldType === 'multiline' ||
        field.fieldType === 'table' ||
        field.labelInTemplate.toLowerCase().includes('declaration') ||
        field.labelInTemplate.toLowerCase().includes('description');

      tableRowsXml += `
        <w:tr>
          <w:trPr>
            <w:cantSplit/>
          </w:trPr>
          <w:tc>
            <w:tcPr>
              ${isFull ? '<w:gridSpan w:val="2"/>' : ''}
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
  if (options.includePalletAnnex !== false && shipment.pallets && shipment.pallets.length > 0) {
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

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <!-- Document Title Header -->
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:after="60" w:before="0"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="28"/>
          <w:color w:val="0F172A"/>
        </w:rPr>
        <w:t>${escapeXml(docTitle)}</w:t>
      </w:r>
    </w:p>

    <!-- Subtitle & Reference -->
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:after="160" w:before="0"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:sz w:val="18"/>
          <w:color w:val="475569"/>
        </w:rPr>
        <w:t>Target Template: ${escapeXml(format.formatName)} | Ref: ${escapeXml(refCode)}</w:t>
      </w:r>
    </w:p>

    <!-- Main Manifest Table -->
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="0" w:type="auto"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="8" w:color="0F172A"/>
          <w:bottom w:val="single" w:sz="8" w:color="0F172A"/>
          <w:left w:val="single" w:sz="8" w:color="0F172A"/>
          <w:right w:val="single" w:sz="8" w:color="0F172A"/>
          <w:insideH w:val="single" w:sz="4" w:color="CBD5E1"/>
          <w:insideV w:val="single" w:sz="4" w:color="CBD5E1"/>
        </w:tblBorders>
      </w:tblPr>
      ${tableRowsXml}
    </w:tbl>

    ${palletAnnexXml}

    <!-- Footer Note -->
    <w:p>
      <w:pPr>
        <w:spacing w:before="240" w:after="0"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:i/>
          <w:sz w:val="16"/>
          <w:color w:val="94A3B8"/>
        </w:rPr>
        <w:t>Generated via Ekdant Logistics Manifest Engine. Verified Document Issuance.</w:t>
      </w:r>
    </w:p>

    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  zip.file('word/document.xml', documentXml);

  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
}

/**
 * Downloads the manifest as an editable Word .docx file
 */
export async function downloadManifestDocx(
  shipment: ExtractedShipmentJSON,
  format: FormatSchemaJSON,
  mappedFields: MappedManifestField[],
  options: ManifestExportOptions = {}
): Promise<void> {
  const blob = await exportManifestToDocx(shipment, format, mappedFields, options);
  const refCode = (shipment.bookingNumber || shipment.invoiceNumbers?.[0] || 'DRAFT').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${format.documentType}_Declaration_${refCode}_${Date.now()}.docx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
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
