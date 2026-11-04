import React from 'react';
import { 
  Inbox, 
  Trash2, 
  ChevronDown, 
  Sparkles, 
  Loader2, 
  CheckCircle2, 
  RefreshCw, 
  AlertCircle,
  Layers
} from 'lucide-react';
import { UploadZone } from './UploadZone';
import type { AppDocument, CustomsPort, ConvertedInvoice } from '../types';
import { generateMasterBol, downloadDocumentHtml } from '../utils/bolGenerator';
import { generateDgDeclaration } from '../utils/dgGenerator';

interface CenterColumnProps {
  documents: AppDocument[];
  selectedDocumentId: string | null;
  consolidatedInvoice?: ConvertedInvoice | null;
  conversionMode?: 'single' | 'multiple' | '';
  onConversionModeChange?: (mode: 'single' | 'multiple' | '') => void;
  onSelectDocument: (docId: string) => void;
  onFilesSelected: (files: File[]) => void;
  onConvertDocument: (docId: string) => void;
  onConvertAll: () => void;
  isBulkConverting?: boolean;
  onDeleteDocument: (docId: string) => void;
  onClearAllDocuments: () => void;
  onPortChange: (docId: string, port: CustomsPort) => void;
  onSaveAllToFiles?: () => void;
  onConsolidateBatch?: () => void;
}

export const CenterColumn: React.FC<CenterColumnProps> = ({
  documents,
  selectedDocumentId: _selectedDocumentId,
  consolidatedInvoice,
  conversionMode = '',
  onConversionModeChange,
  onSelectDocument: _onSelectDocument,
  onFilesSelected,
  onConvertDocument,
  onConvertAll,
  isBulkConverting = false,
  onDeleteDocument,
  onClearAllDocuments,
  onPortChange: _onPortChange,
  onSaveAllToFiles: _onSaveAllToFiles,
  onConsolidateBatch: _onConsolidateBatch
}) => {

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-[360px] lg:w-[380px] xl:w-[400px] h-full border-r border-zinc-200 bg-zinc-50/40 flex flex-col shrink-0 select-none overflow-hidden">
      {/* =========================================================================
          TOP: COMPACT UPLOAD DOCUMENTS DROPZONE
         ========================================================================= */}
      <div className="shrink-0 p-3.5 border-b border-zinc-200 space-y-2.5">
        <div className="flex items-center justify-between pb-0.5">
          <h2 className="text-xs font-semibold text-zinc-900 tracking-tight uppercase flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-zinc-700" />
            <span>Multi-Invoice Ingestion</span>
          </h2>
        </div>

        {/* Upload Drop Zone */}
        <UploadZone onFilesSelected={onFilesSelected} />
      </div>

      {/* =========================================================================
          BOTTOM: UPLOADED DOCUMENTS QUEUE & CONVERTED LIST
         ========================================================================= */}
      <div className="flex-1 flex flex-col p-3.5 overflow-hidden">
        {/* Header: Title + Convert All Button + Clear */}
        <div className="flex items-center justify-between pb-2.5 shrink-0">
          <div className="flex items-center space-x-2">
            <h2 className="text-xs font-semibold text-zinc-900 tracking-tight uppercase">
              Shipment Invoices
            </h2>
          </div>

          <div className="flex items-center space-x-1.5">
            {documents.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (!conversionMode) {
                    alert('Please select whether this is a Single Invoice or Multiple Invoices conversion.');
                    return;
                  }
                  onConvertAll();
                }}
                disabled={isBulkConverting}
                className="px-2.5 py-1 text-[11px] font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded-md shadow-2xs transition-colors flex items-center space-x-1.5 disabled:opacity-40 cursor-pointer"
                title="Process staged invoices and generate Container Plan, DG & BL"
              >
                {isBulkConverting ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-white" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 text-zinc-300" />
                    <span>Process Invoices</span>
                  </>
                )}
              </button>
            )}

            {documents.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm('Clear all uploaded documents and queue?')) {
                    onClearAllDocuments();
                  }
                }}
                className="text-[11px] text-zinc-400 hover:text-zinc-600 transition-colors flex items-center space-x-1 p-1 cursor-pointer"
                title="Clear all documents"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Conversion Mode Dropdown (Single Invoice vs Multiple Invoices) */}
        {documents.length > 0 && (
          <div className="mb-2.5 shrink-0">
            <div className="relative">
              <select
                value={conversionMode}
                onChange={(e) => onConversionModeChange?.(e.target.value as 'single' | 'multiple' | '')}
                className={`w-full appearance-none rounded-lg px-3 py-2 text-xs font-medium border transition-colors outline-none cursor-pointer pr-8 shadow-2xs ${
                  conversionMode === ''
                    ? 'bg-zinc-50/80 text-zinc-500 border-zinc-300 hover:border-zinc-400'
                    : 'bg-white text-zinc-900 border-zinc-900'
                }`}
              >
                <option value="" disabled>Select Type</option>
                <option value="multiple">Multiple Invoices</option>
                <option value="single">Single Invoice</option>
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        )}

        {/* Scrollable Document List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {conversionMode === 'multiple' && consolidatedInvoice && documents.length > 1 && (
            <div className="p-2.5 rounded-lg border border-zinc-900 bg-zinc-900 text-white shadow-xs">
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center space-x-1.5 min-w-0">
                  <span className="font-semibold text-xs font-mono truncate text-white">
                    Consolidated Master ({documents.filter(d => d.status === 'processed').length} Invoices)
                  </span>
                  <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.2 rounded text-[10px] font-medium shrink-0 bg-zinc-800 text-zinc-200 border border-zinc-700">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <span>1 DG & 1 BL</span>
                  </span>
                </div>
                <span className="text-[10px] font-mono font-medium shrink-0 text-zinc-400">
                  MASTER
                </span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-1.5 text-[11px] gap-2 border-t border-zinc-800 text-zinc-300">
                <div className="truncate min-w-0">
                  <span className="font-mono text-[10px]">
                    {consolidatedInvoice.containers?.length || 1} Cont • {Math.round(consolidatedInvoice.grossWeightKg || 0).toLocaleString()} kg • {consolidatedInvoice.totalPallets} Plts
                  </span>
                </div>
                <div className="flex items-center space-x-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const bol = generateMasterBol(consolidatedInvoice);
                      downloadDocumentHtml(bol);
                    }}
                    className="px-2 py-0.5 text-[10px] font-medium rounded transition-colors bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 cursor-pointer"
                    title="Download Master BOL"
                  >
                    BOL
                  </button>
                  {consolidatedInvoice.hasDangerousGoods && (
                    <button
                      type="button"
                      onClick={() => {
                        const dg = generateDgDeclaration(consolidatedInvoice);
                        downloadDocumentHtml(dg);
                      }}
                      className="px-2 py-0.5 text-[10px] font-medium rounded transition-colors bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 cursor-pointer"
                      title="Download Consolidated #DG Declaration"
                    >
                      #DG
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {documents.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-400 mb-2 border border-zinc-200">
                <Inbox className="w-5 h-5" />
              </div>
              <h3 className="text-xs font-medium text-zinc-600">
                No invoices in workspace
              </h3>
            </div>
          ) : (
            documents.map(doc => {
              const isProcessing = doc.status === 'processing';
              const isProcessed = doc.status === 'processed' && Boolean(doc.invoice);
              const isFailed = doc.status === 'failed';
              const inv = doc.invoice;

              return (
                <div
                  key={doc.id}
                  className="p-2.5 rounded-lg border border-zinc-200 bg-white shadow-2xs"
                >
                  {isProcessed && inv ? (
                    <>
                      {/* Top Line: Invoice Number + Delete Action */}
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-semibold text-zinc-900 text-xs font-mono truncate min-w-0" title={inv.invoiceNumber}>
                          {inv.invoiceNumber}
                        </span>
                        <div className="flex items-center space-x-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => onDeleteDocument(doc.id)}
                            className="p-1 text-zinc-300 hover:text-rose-600 rounded transition-colors cursor-pointer"
                            title="Remove invoice"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Row 2: Shipper / Exporter Name */}
                      <div className="mt-1 pt-1 border-t border-zinc-100 text-[11px]">
                        <span className="font-normal text-zinc-600 block truncate" title={inv.exporterName}>
                          {inv.exporterName || 'Shipper / Exporter'}
                        </span>
                      </div>
                    </>
                  ) : isProcessing ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-zinc-900 text-xs truncate" title={doc.fileName}>
                          {doc.fileName}
                        </span>
                        <span className="inline-flex items-center space-x-1 px-1.5 py-0.2 rounded text-[10px] font-medium bg-zinc-100 text-zinc-700 border border-zinc-200 shrink-0">
                          <Loader2 className="w-2.5 h-2.5 animate-spin text-zinc-600" />
                          <span>Processing Invoices...</span>
                        </span>
                      </div>

                      <div className="mt-2 pt-1.5 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-400">
                        <span className="font-mono">{formatFileSize(doc.fileSize)}</span>
                        <span className="text-zinc-500 text-[10px]">Parsing weights & pallets...</span>
                      </div>
                    </>
                  ) : isFailed ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-1.5 min-w-0">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span className="font-medium text-zinc-900 text-xs truncate" title={doc.fileName}>
                            {doc.fileName}
                          </span>
                        </div>
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200/60 shrink-0">
                          Failed
                        </span>
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-zinc-100 text-[11px]">
                        <span className="text-zinc-400 font-mono">{formatFileSize(doc.fileSize)}</span>
                        <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => onConvertDocument(doc.id)}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:text-zinc-900 border border-zinc-200 bg-white hover:bg-zinc-100 rounded transition-colors"
                            title="Retry extraction"
                          >
                            <RefreshCw className="w-3 h-3 text-zinc-500" />
                            <span>Retry</span>
                          </button>
                          <button
                            onClick={() => onDeleteDocument(doc.id)}
                            className="p-1 text-zinc-300 hover:text-rose-600 rounded transition-colors"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-zinc-800 text-xs truncate min-w-0" title={doc.fileName}>
                          {doc.fileName}
                        </span>
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600 border border-zinc-200 shrink-0">
                          Pending
                        </span>
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-zinc-100 text-[11px]">
                        <span className="text-zinc-400 font-mono text-[11px]">
                          {formatFileSize(doc.fileSize)}
                        </span>

                        <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>


                          <button
                            onClick={() => onDeleteDocument(doc.id)}
                            className="p-1 text-zinc-300 hover:text-rose-600 rounded transition-colors"
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
