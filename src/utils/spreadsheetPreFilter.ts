// Ekdant Logistics - Spreadsheet Pre-Filter & Generic Coordinate Grid Formatter
// Converts non-empty workbook sheets into coordinate grids and filters out empty or non-matching tabs

import * as XLSX from 'xlsx';

export interface FilteredSheet {
  sheetName: string;
  cleanGridText: string;
  rowCount: number;
  colCount: number;
  isKept: boolean;
  decisionReason: string;
}

export interface PreFilterResult {
  fileName: string;
  sheets: FilteredSheet[];
  combinedText: string;
  keptSheets: string[];
  ignoredSheets: string[];
  filterLog: string[];
  extractedReferences?: string[];
}

/**
 * Extracts generic alphanumeric reference tokens from filename (e.g. sequence of 4+ alphanumeric chars)
 */
function extractFilenameTokens(fileName: string): string[] {
  const base = fileName.replace(/\.[^/.]+$/, '');
  const tokens = base.match(/[A-Za-z0-9_-]{4,}/g) || [];
  return tokens.map(t => t.toUpperCase()).filter(t => !/^(COPY|DRAFT|FINAL|FILE|DOC|XLSX?|CSV)$/i.test(t));
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
 * Pre-filters an uploaded workbook:
 * Converts non-empty sheets into generic coordinate grids (Row X | [Col A]: val | [Col B]: val)
 * Filters out tabs only if they are empty or do not match the uploaded filename's reference token.
 */
export function preFilterWorkbook(buffer: ArrayBuffer, fileName: string): PreFilterResult {
  const wb = XLSX.read(buffer, { type: 'array' });
  const filenameTokens = extractFilenameTokens(fileName);

  const sheets: FilteredSheet[] = [];
  const keptSheets: string[] = [];
  const ignoredSheets: string[] = [];
  const filterLog: string[] = [];

  interface SheetData {
    name: string;
    rows: any[][];
    rowCount: number;
    colCount: number;
    textSample: string;
    hasTokenMatch: boolean;
  }

  const sheetDataList: SheetData[] = [];

  // Inspect all sheets in workbook
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) {
      continue;
    }

    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
    const nonEmptyRows = rawRows.filter(row => Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== ''));

    if (nonEmptyRows.length === 0) {
      continue;
    }

    let maxCols = 0;
    nonEmptyRows.forEach(r => {
      if (r.length > maxCols) maxCols = r.length;
    });

    const textSample = nonEmptyRows.slice(0, 40).map(r => r.join(' ')).join(' ').toUpperCase();
    const hasTokenMatch = filenameTokens.some(tok => textSample.includes(tok) || sheetName.toUpperCase().includes(tok));

    sheetDataList.push({
      name: sheetName,
      rows: nonEmptyRows,
      rowCount: nonEmptyRows.length,
      colCount: maxCols,
      textSample,
      hasTokenMatch
    });
  }

  // Filter criteria:
  // If only 1 sheet has content, keep it.
  // If multiple sheets exist and at least one matches filename token, keep matching sheets and exclude non-matching.
  // Otherwise, keep all non-empty sheets with sufficient data.
  const anyMatch = sheetDataList.some(s => s.hasTokenMatch);

  for (const sd of sheetDataList) {
    let isKept = true;
    let decisionReason = '';

    if (sheetDataList.length === 1) {
      isKept = true;
      decisionReason = 'Sole populated sheet in workbook';
    } else if (sd.rowCount < 2) {
      isKept = false;
      decisionReason = 'Excluded empty or single-cell dummy sheet';
    } else if (anyMatch) {
      if (sd.hasTokenMatch) {
        isKept = true;
        decisionReason = 'Sheet matches filename reference token';
      } else {
        isKept = false;
        decisionReason = 'Excluded sheet that does not match uploaded filename reference token';
      }
    } else {
      isKept = true;
      decisionReason = 'Populated data sheet';
    }

    let cleanGridText = '';
    if (isKept) {
      const gridLines: string[] = [];
      gridLines.push(`--- SHEET: ${sd.name} (${sd.rowCount} rows) ---`);

      sd.rows.forEach((row, rowIdx) => {
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
      keptSheets.push(sd.name);
    } else {
      ignoredSheets.push(sd.name);
    }

    sheets.push({
      sheetName: sd.name,
      cleanGridText,
      rowCount: sd.rowCount,
      colCount: sd.colCount,
      isKept,
      decisionReason
    });
  }

  if (keptSheets.length > 0) {
    filterLog.push(`Kept active sheets: ${keptSheets.join(', ')}`);
  }
  if (ignoredSheets.length > 0) {
    filterLog.push(`Excluded unreferenced tabs: ${ignoredSheets.join(', ')}`);
  }

  // Scan kept sheets for generic reference patterns (Buyer's Order No, Exporter's Ref, Other Reference(s))
  const extractedReferences: string[] = [];
  const refRegex = /(?:buyer'?s?\s*order\s*(?:no\.?|ref\.?)|exporter'?s?\s*ref\.?|other\s*reference\(?s?\)?|purchase\s*order\s*no\.?)\s*[:\-\s]\s*([A-Za-z0-9_\-()/]{3,30})/gi;

  for (const s of sheets.filter(sh => sh.isKept)) {
    let m: RegExpExecArray | null;
    while ((m = refRegex.exec(s.cleanGridText)) !== null) {
      const val = m[1].trim();
      if (val && !extractedReferences.includes(val) && !/^(DATE|NIL|NA|NO|NONE)$/i.test(val)) {
        extractedReferences.push(val);
      }
    }
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
    extractedReferences
  };
}
