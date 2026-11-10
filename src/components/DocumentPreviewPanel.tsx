import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  FileSpreadsheet,
  File,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  ExternalLink,
  Layers
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface DocumentPreviewPanelProps {
  file: File | null;
  onClose?: () => void;
}

interface SheetPreviewData {
  sheetNames: string[];
  activeSheet: string;
  rows: (string | number | null)[][];
}

export function DocumentPreviewPanel({ file }: DocumentPreviewPanelProps): React.JSX.Element {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [sheetData, setSheetData] = useState<SheetPreviewData | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);

  // Determine file type
  const isPdf = file?.type === 'application/pdf' || file?.name.toLowerCase().endsWith('.pdf');
  const isSpreadsheet =
    file?.name.toLowerCase().endsWith('.xlsx') ||
    file?.name.toLowerCase().endsWith('.xls') ||
    file?.name.toLowerCase().endsWith('.csv');

  const isReadingSheet = isSpreadsheet && !sheetData && !sheetError;

  // Blob URL for PDF preview
  const blobUrl = useMemo(() => {
    if (!file || !isPdf) return null;
    try {
      return URL.createObjectURL(file);
    } catch {
      return null;
    }
  }, [file, isPdf]);

  // Clean up object URL when file changes or unmounts
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  // Read spreadsheet data when file changes
  useEffect(() => {
    if (!file || !isSpreadsheet) return;

    let isMounted = true;

    const reader = new FileReader();
    reader.onload = (e) => {
      if (!isMounted) return;
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetNames = workbook.SheetNames;
        if (sheetNames.length === 0) {
          setSheetError('Workbook contains no sheets.');
          return;
        }

        const firstSheetName = sheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(worksheet, {
          header: 1,
          defval: ''
        });

        setSheetData({
          sheetNames,
          activeSheet: firstSheetName,
          rows: rows.slice(0, 100) // Cap at first 100 rows for high-performance preview
        });
      } catch (err: any) {
        console.error('Spreadsheet preview failed:', err);
        setSheetError(err?.message || 'Failed to render spreadsheet preview.');
      }
    };

    reader.onerror = () => {
      if (isMounted) {
        setSheetError('Failed to read file contents.');
      }
    };

    reader.readAsArrayBuffer(file);

    return () => {
      isMounted = false;
    };
  }, [file, isSpreadsheet]);

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 15, 200));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 15, 60));
  const handleResetZoom = () => setZoomLevel(100);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div
      className={`h-full flex flex-col bg-slate-900 border-x border-slate-800/80 overflow-hidden ${
        isFullscreen ? 'fixed inset-4 z-50 rounded-xl shadow-2xl border border-cyan-500/40 bg-slate-950' : ''
      }`}
    >
      {/* Top Preview Toolbar */}
      <div className="h-10 border-b border-slate-800/80 bg-slate-950/70 px-3 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2 truncate">
          {isPdf ? (
            <FileText className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          ) : isSpreadsheet ? (
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <File className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          )}

          <span className="text-xs font-medium text-slate-200 truncate" title={file?.name || 'No file selected'}>
            {file ? file.name : 'Document Preview'}
          </span>

          {file && (
            <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.2 bg-slate-800 rounded">
              {formatFileSize(file.size)}
            </span>
          )}
        </div>

        {file && (
          <div className="flex items-center space-x-1 shrink-0">
            <button
              onClick={handleZoomOut}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono text-slate-400 w-9 text-center">
              {zoomLevel}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetZoom}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Reset zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {blobUrl && (
              <a
                href={blobUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors ml-1"
                title="Open in new browser tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            <button
              onClick={() => setIsFullscreen((prev) => !prev)}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen preview'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>

      {/* Main Preview Canvas */}
      <div className="flex-1 bg-slate-950 relative overflow-auto">
        {!file ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-3">
              <Layers className="w-6 h-6 text-slate-600" />
            </div>
            <p className="text-xs font-medium text-slate-300">No document selected</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-xs leading-relaxed">
              Select any document from the files panel to view its rendered PDF or spreadsheet grid here.
            </p>
          </div>
        ) : isPdf && blobUrl ? (
          <div
            className="w-full h-full flex items-center justify-center transition-transform origin-top"
            style={{ transform: `scale(${zoomLevel / 100})` }}
          >
            <iframe
              src={blobUrl}
              className="w-full h-full border-0 bg-white"
              title={`Preview of ${file.name}`}
            />
          </div>
        ) : isSpreadsheet ? (
          <div
            className="p-3 transition-transform origin-top-left"
            style={{ transform: `scale(${zoomLevel / 100})` }}
          >
            {isReadingSheet ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Reading spreadsheet grid...
              </div>
            ) : sheetError ? (
              <div className="p-4 rounded border border-rose-900/50 bg-rose-950/20 text-rose-300 text-xs">
                {sheetError}
              </div>
            ) : sheetData && sheetData.rows.length > 0 ? (
              <div className="border border-slate-800 rounded overflow-x-auto bg-slate-900/90 shadow-sm">
                <table className="w-full text-left text-[11px] border-collapse font-mono">
                  <tbody>
                    {sheetData.rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className={
                          rIdx === 0
                            ? 'bg-slate-800/90 text-cyan-300 font-semibold sticky top-0 border-b border-slate-700'
                            : 'border-b border-slate-800/50 hover:bg-slate-800/40 text-slate-300'
                        }
                      >
                        <td className="px-2 py-1 bg-slate-950/60 text-slate-500 border-r border-slate-800 text-[10px] w-8 select-none text-right">
                          {rIdx + 1}
                        </td>
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="px-2.5 py-1 border-r border-slate-800/40 whitespace-pre truncate max-w-xs"
                          >
                            {cell !== null && cell !== undefined ? String(cell) : ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-500">
                Spreadsheet is empty.
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <File className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-xs text-slate-300">{file.name}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Preview is not available for this file format ({file.type || 'unknown'}).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
