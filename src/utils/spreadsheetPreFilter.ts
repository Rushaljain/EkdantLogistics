// Ekdant Logistics - Spreadsheet Pre-Filter & Stale Tab Scorer
// Automatically filters out stale legacy template tabs (e.g. THB-INV, CHW004, CLP, empty Sheet1)
// Pre-processes active workbook sheets into clean coordinate grids and extracts deterministic ground-truth

import * as XLSX from 'xlsx';
import type { ExtractedPallet } from '../types';

export interface FilteredSheet {
  sheetName: string;
  cleanGridText: string;
  rowCount: number;
  colCount: number;
  isKept: boolean;
  decisionReason: string;
  isLikelyInvoice?: boolean;
  isLikelyPackingList?: boolean;
  isLikelyDg?: boolean;
}

export interface DeterministicExtractedData {
  shipperName?: string;
  shipperAddress?: string;
  onBehalfOf?: string;
  shipperGstin?: string;
  consigneeName?: string;
  consigneeAddress?: string;
  notifyPartyName?: string;
  notifyPartyAddress?: string;
  invoiceNumbers: string[];
  invoiceDates: string[];
  bookingNumber?: string;
  containerNumber?: string;
  sealNumber?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  finalDestination?: string;
  productDescription?: string;
  brandName?: string;
  hsnCode?: string;
  totalPallets?: number;
  totalBoxes?: number;
  grossWeightKg?: number;
  netWeightKg?: number;
  isDangerousGoods?: boolean;
  unNumber?: string;
  imoClass?: string;
  packingGroup?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  pallets: ExtractedPallet[];
}

export interface PreFilterResult {
  fileName: string;
  sheets: FilteredSheet[];
  combinedText: string;
  keptSheets: string[];
  ignoredSheets: string[];
  filterLog: string[];
  deterministicData: DeterministicExtractedData;
}

/**
 * Extracts alphanumeric identifier tokens from filename (e.g. "CHW000213", "TAL000172A", "CHW000263")
 */
function extractFilenameTokens(fileName: string): string[] {
  const base = fileName.replace(/\.[^/.]+$/, '');
  const tokens = base.match(/[A-Za-z]{2,5}\d{4,8}[A-Za-z0-9]*/g) || [];
  return tokens.map(t => t.toUpperCase());
}

/**
 * Converts a 0-indexed column number into Excel column letters (0 -> A, 1 -> B, 26 -> AA)
 */
function colIndexToLetters(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

/**
 * Pre-filters an uploaded Excel/CSV workbook:
 * 1. Excludes stale legacy template tabs (THB-INV, CLP, CHW004 when filename doesn't match, empty Sheet1).
 * 2. Formats kept sheets into clean coordinate grids for Gemini Multimodal.
 * 3. Deterministically parses pallet rows, commercial invoice header, and DG booking lines.
 */
export function preFilterWorkbook(buffer: ArrayBuffer, fileName: string): PreFilterResult {
  const wb = XLSX.read(buffer, { type: 'array' });
  const filenameTokens = extractFilenameTokens(fileName);

  const sheets: FilteredSheet[] = [];
  const keptSheets: string[] = [];
  const ignoredSheets: string[] = [];
  const filterLog: string[] = [];

  const deterministicData: DeterministicExtractedData = {
    invoiceNumbers: [],
    invoiceDates: [],
    pallets: []
  };

  // Step 1: Preliminary inspection of all sheets
  interface SheetInspection {
    name: string;
    nonEmptyRows: any[][];
    rowCount: number;
    colCount: number;
    textSample: string;
    hasFilenameToken: boolean;
    has2025Or2026: boolean;
    hasOld2023Or2024: boolean;
    isStaleNamed: boolean;
  }

  const inspections: SheetInspection[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) {
      continue;
    }

    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
    const nonEmptyRows = rawRows.filter(row => Array.isArray(row) && row.some(cell => String(cell || '').trim() !== ''));

    if (nonEmptyRows.length === 0) {
      continue;
    }

    let maxCols = 0;
    nonEmptyRows.forEach(r => {
      if (r.length > maxCols) maxCols = r.length;
    });

    const textSample = nonEmptyRows.slice(0, 30).map(r => r.join(' ')).join(' ').toUpperCase();
    const hasFilenameToken = filenameTokens.some(tok => textSample.includes(tok) || sheetName.toUpperCase().includes(tok));
    const has2025Or2026 = /202[5-9]/.test(textSample) || /\d{2}\.\d{2}\.202[5-9]/.test(textSample) || /\d{2}\.\d{2}\.26/.test(textSample);
    const hasOld2023Or2024 = (/202[2-4]/.test(textSample) || /\d{2}\.\d{2}\.202[2-4]/.test(textSample)) && !has2025Or2026;
    const isStaleNamed = /^(THB-INV|CLP|CHW004|SHEET\d+|TEMPLATE)$/i.test(sheetName) && !filenameTokens.some(tok => tok.includes(sheetName.toUpperCase()));

    inspections.push({
      name: sheetName,
      nonEmptyRows,
      rowCount: nonEmptyRows.length,
      colCount: maxCols,
      textSample,
      hasFilenameToken,
      has2025Or2026,
      hasOld2023Or2024,
      isStaleNamed
    });
  }

  // Step 2: Tab Scoring & Filter Decision
  const hasMatchingActiveSheet = inspections.some(i => i.hasFilenameToken || (i.has2025Or2026 && !i.isStaleNamed));

  for (const insp of inspections) {
    let isKept = true;
    let decisionReason = '';

    if (inspections.length === 1) {
      isKept = true;
      decisionReason = 'Sole non-empty sheet in workbook';
    } else if (insp.isStaleNamed && hasMatchingActiveSheet) {
      isKept = false;
      decisionReason = `Excluded stale legacy template tab (${insp.name})`;
    } else if (insp.hasOld2023Or2024 && hasMatchingActiveSheet && !insp.hasFilenameToken) {
      isKept = false;
      decisionReason = 'Excluded legacy sheet containing outdated 2023/2024 data';
    } else if (insp.hasFilenameToken) {
      isKept = true;
      decisionReason = `Active sheet matching file reference token (${filenameTokens.join(', ')})`;
    } else if (insp.rowCount < 2) {
      isKept = false;
      decisionReason = 'Excluded dummy sheet with insufficient data rows';
    } else {
      isKept = true;
      decisionReason = 'Relevant shipment data sheet';
    }

    // Convert kept rows into clean coordinate grid
    let cleanGridText = '';
    if (isKept) {
      const gridLines: string[] = [];
      gridLines.push(`--- SHEET: ${insp.name} (${insp.rowCount} rows) ---`);

      insp.nonEmptyRows.forEach((row, rowIdx) => {
        const cellParts: string[] = [];
        row.forEach((cellVal, colIdx) => {
          const valStr = String(cellVal !== undefined && cellVal !== null ? cellVal : '').trim();
          if (valStr) {
            const colLetter = colIndexToLetters(colIdx);
            cellParts.push(`[${colLetter}]: ${valStr}`);
          }
        });
        if (cellParts.length > 0) {
          gridLines.push(`Row ${rowIdx + 1} | ${cellParts.join(' | ')}`);
        }
      });

      cleanGridText = gridLines.join('\n');
      keptSheets.push(insp.name);

      // Perform deterministic parsing on kept sheets
      parseDeterministicSheetData(insp.nonEmptyRows, insp.name, fileName, deterministicData);
    } else {
      ignoredSheets.push(insp.name);
    }

    sheets.push({
      sheetName: insp.name,
      cleanGridText,
      rowCount: insp.rowCount,
      colCount: insp.colCount,
      isKept,
      decisionReason
    });
  }

  // Format filter log
  if (keptSheets.length > 0) {
    filterLog.push(`Kept active sheets: ${keptSheets.join(', ')}`);
  }
  if (ignoredSheets.length > 0) {
    filterLog.push(`Ignored legacy/stale tabs: ${ignoredSheets.join(', ')}`);
  }

  const combinedText = sheets
    .filter(s => s.isKept)
    .map(s => `=== FILE: ${fileName} | SHEET: ${s.sheetName} ===\n${s.cleanGridText}`)
    .join('\n\n');

  return {
    fileName,
    sheets,
    combinedText,
    keptSheets,
    ignoredSheets,
    filterLog,
    deterministicData
  };
}

/**
 * Deterministically parses structured tables from active sheets (e.g. 0232_INV, 0232_PKG, HPFL NEWARK)
 */
function parseDeterministicSheetData(
  rows: any[][],
  _sheetName: string,
  fileName: string,
  out: DeterministicExtractedData
): void {
  // Find pallet table rows (e.g. Pallet Nos, Net Wt, Gross Wt, Model)
  let inPalletTable = false;
  let palletColIdx = -1;
  let modelColIdx = -1;
  let qtyColIdx = -1;
  let netColIdx = -1;
  let grossColIdx = -1;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const rowStr = row.map(c => String(c || '').trim()).join(' | ');

    // 1. Exporter / Shipper
    if (/Exporter/i.test(rowStr) && r + 1 < rows.length) {
      const nextRow = rows[r + 1];
      const name = String(nextRow[0] || '').trim();
      if (name && !out.shipperName) {
        out.shipperName = name;
      }
      // Check (ON BEHALF OF)
      if (rowStr.includes('ON BEHALF OF')) {
        for (let c = 1; c < nextRow.length; c++) {
          const val = String(nextRow[c] || '').trim();
          if (val && !out.onBehalfOf) {
            out.onBehalfOf = val;
            break;
          }
        }
      }
    }

    // 2. Invoice No. & Date
    const invMatch = rowStr.match(/Invoice\s*No\.?\s*(&|\/)?\s*Date\s*[:|]?\s*([A-Za-z0-9_-]+)\s*(?:DTD|DATED)?\s*(\d{2}[./-]\d{2}[./-]\d{2,4})?/i)
      || rowStr.match(/([A-Za-z]{2,5}\d{4,8}[A-Za-z0-9]*)\s*(?:DTD|DATED)\s*(\d{2}[./-]\d{2}[./-]\d{2,4})/i);
    if (invMatch) {
      const invNo = invMatch[1] || invMatch[2];
      const invDt = invMatch[2] || invMatch[3];
      if (invNo && !out.invoiceNumbers.includes(invNo)) {
        out.invoiceNumbers.push(invNo);
      }
      if (invDt && !out.invoiceDates.includes(invDt)) {
        out.invoiceDates.push(invDt);
      }
    }

    // 3. Consignee
    if (/Consignee\s*:/i.test(rowStr) && r + 1 < rows.length) {
      const nextRow = rows[r + 1];
      const cons = String(nextRow[0] || nextRow[1] || '').trim();
      if (cons && !out.consigneeName) {
        out.consigneeName = cons;
      }
    }

    // 4. Reference Number / Booking Number
    const refMatch = rowStr.match(/Reference\s*Number(?:\(s\))?\s*[:|]?\s*([A-Za-z0-9_-]+)/i)
      || rowStr.match(/BKG\.?\s*NO\.?\s*[:|]?\s*([A-Za-z0-9_-]+)/i)
      || rowStr.match(/Booking\s*No\.?\s*[:|]?\s*([A-Za-z0-9_-]+)/i);
    if (refMatch && !out.bookingNumber) {
      out.bookingNumber = refMatch[1].trim();
    }

    // 5. Container & Seal Numbers
    const contMatch = rowStr.match(/([A-Z]{4}\d{7})/);
    if (contMatch && !out.containerNumber) {
      out.containerNumber = contMatch[1];
    }
    const sealMatch = rowStr.match(/(?:SEAL(?:\s*NO\.?)?|BOLT\s*SEAL)\s*[:|]?\s*([A-Za-z0-9_-]+)/i);
    if (sealMatch && !out.sealNumber) {
      out.sealNumber = sealMatch[1].trim();
    }

    // 6. 24-Hr Emergency Contact
    const emgMatch = rowStr.match(/24\s*HRS?\s*Emergency\s*Contact.*?([A-Za-z.\s]+)\s*\/\s*(\+?\d[\d\s-]{7,})/i);
    if (emgMatch) {
      out.emergencyContactName = emgMatch[1].trim();
      out.emergencyContactPhone = emgMatch[2].replace(/\s+/g, '').trim();
    }

    // 7. Dangerous Goods attributes
    if (/UN\s*(?:NO\.?)?\s*[:|]?\s*(2794|2800|1993|1263|3082|3480|3481)/i.test(rowStr)) {
      const m = rowStr.match(/UN\s*(?:NO\.?)?\s*[:|]?\s*(\d{4})/i);
      if (m) {
        out.unNumber = m[1];
        out.isDangerousGoods = true;
      }
    }
    if (/CLASS\s*[:|]?\s*(8|3|9)/i.test(rowStr)) {
      const m = rowStr.match(/CLASS\s*[:|]?\s*(\d)/i);
      if (m) out.imoClass = m[1];
    }
    if (/PKG\s*GROUP\s*[:|]?\s*(I{1,3})/i.test(rowStr)) {
      const m = rowStr.match(/PKG\s*GROUP\s*[:|]?\s*(I{1,3})/i);
      if (m) out.packingGroup = m[1];
    }

    // 8. Pallet table header detection
    if (/Pallet/i.test(rowStr) && (/Nt\.?\s*wt/i.test(rowStr) || /Gross\s*wt/i.test(rowStr) || /Qty/i.test(rowStr))) {
      inPalletTable = true;
      row.forEach((cell, idx) => {
        const cStr = String(cell || '').trim();
        if (/Pallet\s*Nos?/i.test(cStr) || (/Pallet/i.test(cStr) && !/Type/i.test(cStr))) palletColIdx = idx;
        if (/Type|Model|Description/i.test(cStr)) modelColIdx = idx;
        if (/Qty/i.test(cStr)) qtyColIdx = idx;
        if (/Nt\.?\s*wt/i.test(cStr)) netColIdx = idx;
        if (/Gross\s*wt/i.test(cStr)) grossColIdx = idx;
      });
      continue;
    }

    // Parse pallet rows if inside pallet table
    if (inPalletTable) {
      if (/We declare|Total|SIGNATURE/i.test(rowStr) && !/\d{4}/.test(rowStr)) {
        inPalletTable = false;
        continue;
      }

      const palletVal = palletColIdx >= 0 ? String(row[palletColIdx] || '').trim() : '';
      const modelVal = modelColIdx >= 0 ? String(row[modelColIdx] || '').trim() : '';
      const qtyVal = qtyColIdx >= 0 ? parseFloat(String(row[qtyColIdx] || '0').replace(/,/g, '')) : 0;
      const netVal = netColIdx >= 0 ? parseFloat(String(row[netColIdx] || '0').replace(/,/g, '')) : 0;
      const grossVal = grossColIdx >= 0 ? parseFloat(String(row[grossColIdx] || '0').replace(/,/g, '')) : 0;

      // Validate that this row is a genuine pallet row
      if (palletVal && (/^\d{3,6}$/.test(palletVal) || /^[A-Z0-9/-]+$/.test(palletVal)) && (netVal > 0 || grossVal > 0 || qtyVal > 0)) {
        const exists = out.pallets.some(p => p.palletNumber === palletVal && p.sourceFile === fileName);
        if (!exists) {
          out.pallets.push({
            palletNumber: palletVal,
            modelCode: modelVal,
            boxCount: isNaN(qtyVal) ? 0 : qtyVal,
            netWeightKg: isNaN(netVal) ? 0 : netVal,
            grossWeightKg: isNaN(grossVal) ? 0 : grossVal,
            sourceFile: fileName
          });
        }
      }
    }
  }

  // Update totals from pallets
  if (out.pallets.length > 0) {
    out.totalPallets = out.pallets.length;
    out.totalBoxes = out.pallets.reduce((s, p) => s + (p.boxCount || 0), 0);
    out.netWeightKg = Number(out.pallets.reduce((s, p) => s + (p.netWeightKg || 0), 0).toFixed(2));
    out.grossWeightKg = Number(out.pallets.reduce((s, p) => s + (p.grossWeightKg || 0), 0).toFixed(2));
  }
}
