import React from 'react';
import { 
  Inbox, 
  Trash2, 
  FileCode, 
  FileSpreadsheet, 
  Ship, 
  Plane, 
  ChevronDown, 
  Sparkles, 
  Loader2, 
  CheckCircle2, 
  RefreshCw, 
  AlertCircle,
  FolderArchive 
} from 'lucide-react';
import { UploadZone } from './UploadZone';
import type { AppDocument, CustomsPort } from '../types';
import { downloadEdi } from '../utils/ediCompiler';
import { downloadExcel } from '../utils/excelCompiler';

interface CenterColumnProps {
  documents: AppDocument[];
  selectedDocumentId: string | null;
  onSelectDocument: (docId: string) => void;
  onFilesSelected: (files: File[]) => void;
  onConvertDocument: (docId: string) => void;
  onConvertAll: () => void;
  isBulkConverting?: boolean;
  onDeleteDocument: (docId: string) => void;
  onClearAllDocuments: () => void;
  onPortChange: (docId: string, port: CustomsPort) => void;
  onSaveAllToFiles?: () => void;
}

export const CenterColumn: React.FC<CenterColumnProps> = ({
  documents,
  selectedDocumentId,
  onSelectDocument,
  onFilesSelected,
  onConvertDocument,
  onConvertAll,
  isBulkConverting = false,
  onDeleteDocument,
  onClearAllDocuments,
  onPortChange,
  onSaveAllToFiles
}) => {
  const pendingCount = documents.filter(d => d.status === 'pending' || d.status === 'failed').length;
  const processedCount = documents.filter(d => d.status === 'processed' && d.invoice).length;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-[380px] lg:w-[420px] xl:w-[450px] h-full border-r border-slate-200/80 bg-slate-50/60 flex flex-col shrink-0 select-none overflow-hidden">
      {/* =========================================================================
          TOP: COMPACT UPLOAD DOCUMENTS DROPZONE
         ========================================================================= */}
      <div className="shrink-0 p-4 border-b border-slate-200/80 space-y-3">
        <div className="flex items-center justify-between pb-0.5">
          <h2 className="text-xs font-bold text-slate-900 tracking-tight uppercase">
            Upload Documents
          </h2>
        </div>

        {/* Upload Drop Zone */}
        <UploadZone onFilesSelected={onFilesSelected} />
      </div>

      {/* =========================================================================
          BOTTOM: UPLOADED DOCUMENTS QUEUE & CONVERTED LIST (flex-1)
         ========================================================================= */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        {/* Header: Title + Convert All Button + Clear */}
        <div className="flex items-center justify-between pb-3 shrink-0">
          <div className="flex items-center space-x-2">
            <h2 className="text-xs font-bold text-slate-900 tracking-tight uppercase">
              Uploaded Documents
            </h2>
          </div>

          <div className="flex items-center space-x-2">
            {/* Save All to Files button for converted documents */}
            {processedCount > 0 && onSaveAllToFiles && (
              <button
                type="button"
                onClick={onSaveAllToFiles}
                className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-2xs transition-all cursor-pointer"
                title="Save all converted invoices to Files and clear the board"
              >
                <FolderArchive className="w-3.5 h-3.5 text-emerald-100" />
                <span>Save to Files</span>
              </button>
            )}

            {/* Convert All Button for bulk processing */}
            {pendingCount > 0 && (
              <button
                type="button"
                onClick={onConvertAll}
                disabled={isBulkConverting}
                className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                title="Convert all pending documents at once"
              >
                {isBulkConverting ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-white" />
                    <span>Converting...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                    <span>Convert All</span>
                  </>
                )}
              </button>
            )}

            {documents.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm('Clear all uploaded documents and history?')) {
                    onClearAllDocuments();
                  }
                }}
                className="text-[11px] text-slate-400 hover:text-rose-600 transition-colors flex items-center space-x-1 p-1"
                title="Clear all documents"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Document List / Clean Unboxed Empty State */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {documents.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-2.5">
                <Inbox className="w-6 h-6" />
              </div>
              <h3 className="text-xs font-semibold text-slate-700">
                No documents uploaded yet
              </h3>
              <p className="text-[11px] text-slate-400 mt-1 max-w-[220px] leading-relaxed">
                Drop PDF documents above. They will appear here ready to convert individually or in bulk.
              </p>
            </div>
          ) : (
            documents.map(doc => {
              const isSelected = doc.id === selectedDocumentId;
              const isProcessing = doc.status === 'processing';
              const isProcessed = doc.status === 'processed' && Boolean(doc.invoice);
              const isFailed = doc.status === 'failed';

              const inv = doc.invoice;
              const isExport = inv ? inv.filingType === 'EXPORT' : true;
              const ediExt = isExport ? 'sb' : 'be';

              return (
                <div
                  key={doc.id}
                  onClick={() => onSelectDocument(doc.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer text-left relative ${
                    isSelected
                      ? 'bg-white border-indigo-500 shadow-sm ring-2 ring-indigo-500/20'
                      : 'bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-2xs'
                  }`}
                >
                  {/* ========================================================
                      1. PROCESSED INVOICE (Lean 2-Row Layout)
                     ======================================================== */}
                  {isProcessed && inv ? (
                    <>
                      {/* Top Line: Invoice Number + Processed Badge + Port Selector */}
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center space-x-2 min-w-0">
                          <span className="font-bold text-slate-900 text-xs font-mono truncate" title={inv.invoiceNumber}>
                            {inv.invoiceNumber}
                          </span>
                          <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/50 shrink-0">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>Processed</span>
                          </span>
                        </div>

                        {/* Port Selector Dropdown */}
                        <div 
                          className="relative inline-flex items-center shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            value={inv.portOfLoading || 'INNSA1'}
                            onChange={(e) => onPortChange(doc.id, e.target.value as CustomsPort)}
                            className="appearance-none bg-slate-50 hover:bg-slate-100 text-slate-700 text-[10px] font-semibold pl-5 pr-5 py-0.5 rounded-md border border-slate-200 focus:outline-none cursor-pointer"
                          >
                            <option value="INNSA1">INNSA1</option>
                            <option value="INBOM4">INBOM4</option>
                          </select>
                          <div className="absolute left-1 pointer-events-none text-indigo-600">
                            {inv.portOfLoading === 'INBOM4' ? (
                              <Plane className="w-3 h-3" />
                            ) : (
                              <Ship className="w-3 h-3" />
                            )}
                          </div>
                          <div className="absolute right-1 pointer-events-none text-slate-400">
                            <ChevronDown className="w-2.5 h-2.5" />
                          </div>
                        </div>
                      </div>

                      {/* Row 2: Exporter Name on left + Direct Action Buttons on right */}
                      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100/80 text-[11px] gap-2">
                        <span className="font-medium text-slate-700 truncate min-w-0" title={inv.exporterName}>
                          {inv.exporterName}
                        </span>

                        {/* Direct Action Buttons */}
                        <div 
                          className="flex items-center space-x-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => downloadEdi(inv)}
                            className="p-1 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                            title={`Download EDI (.${ediExt})`}
                          >
                            <FileCode className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => downloadExcel(inv)}
                            className="p-1 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                            title="Download Excel (.xlsx)"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => onDeleteDocument(doc.id)}
                            className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </>
                  ) : isProcessing ? (
                    /* ========================================================
                        2. PROCESSING INVOICE
                       ======================================================== */
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-900 text-xs truncate" title={doc.fileName}>
                          {doc.fileName}
                        </span>
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/50 shrink-0">
                          <Loader2 className="w-2.5 h-2.5 animate-spin text-indigo-600" />
                          <span>Processing...</span>
                        </span>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-100/80 flex items-center justify-between text-[11px] text-slate-400">
                        <span className="font-mono">{formatFileSize(doc.fileSize)}</span>
                        <span className="text-indigo-600 text-[10px] animate-pulse">Extracting customs data...</span>
                      </div>
                    </>
                  ) : isFailed ? (
                    /* ========================================================
                        3. FAILED INVOICE
                       ======================================================== */
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-1.5 min-w-0">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span className="font-medium text-slate-900 text-xs truncate" title={doc.fileName}>
                            {doc.fileName}
                          </span>
                        </div>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/50 shrink-0">
                          Failed
                        </span>
                      </div>

                      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100 text-[11px]">
                        <span className="text-slate-400 font-mono">{formatFileSize(doc.fileSize)}</span>
                        <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => onConvertDocument(doc.id)}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors"
                            title="Retry conversion"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Retry</span>
                          </button>
                          <button
                            onClick={() => onDeleteDocument(doc.id)}
                            className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* ========================================================
                        4. PENDING INVOICE (Lean Symmetric 2-Row Layout)
                       ======================================================== */
                    <>
                      {/* Top Line: File Name on left + Pending Badge on right */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800 text-xs truncate min-w-0" title={doc.fileName}>
                          {doc.fileName}
                        </span>

                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60 shrink-0">
                          Pending
                        </span>
                      </div>

                      {/* Row 2: File Size on left + Convert Button & Delete on right */}
                      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100/80 text-[11px]">
                        <span className="text-slate-400 font-mono text-[11px]">
                          {formatFileSize(doc.fileSize)}
                        </span>

                        <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => onConvertDocument(doc.id)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-colors cursor-pointer"
                            title="Convert this document"
                          >
                            <Sparkles className="w-3 h-3 text-indigo-200" />
                            <span>Convert</span>
                          </button>

                          <button
                            onClick={() => onDeleteDocument(doc.id)}
                            className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
