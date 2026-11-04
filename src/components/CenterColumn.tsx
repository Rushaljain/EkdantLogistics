import React from 'react';
import { 
  Inbox, 
  Trash2, 
  Ship, 
  Plane, 
  ChevronDown, 
  Sparkles, 
  Loader2, 
  CheckCircle2, 
  RefreshCw, 
  AlertCircle,
  FolderArchive,
  Layers,
  Flame
} from 'lucide-react';
import { UploadZone } from './UploadZone';
import type { AppDocument, CustomsPort } from '../types';
import { generateMasterBol, downloadDocumentHtml } from '../utils/bolGenerator';
import { generateDgDeclaration } from '../utils/dgGenerator';

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
  onConsolidateBatch?: () => void;
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
  onSaveAllToFiles,
  onConsolidateBatch
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
          <h2 className="text-xs font-bold text-slate-900 tracking-tight uppercase flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-600" />
            <span>Multi-Invoice Ingestion</span>
          </h2>
        </div>

        {/* Upload Drop Zone */}
        <UploadZone onFilesSelected={onFilesSelected} />
      </div>

      {/* =========================================================================
          BOTTOM: UPLOADED DOCUMENTS QUEUE & CONVERTED LIST
         ========================================================================= */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        {/* Header: Title + Convert All Button + Clear */}
        <div className="flex items-center justify-between pb-3 shrink-0">
          <div className="flex items-center space-x-2">
            <h2 className="text-xs font-bold text-slate-900 tracking-tight uppercase">
              Shipment Invoices
            </h2>
            {documents.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-200/70 text-slate-700 font-mono">
                {documents.length}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {/* Consolidate Batch Button when multiple processed invoices exist */}
            {processedCount >= 2 && onConsolidateBatch && (
              <button
                type="button"
                onClick={onConsolidateBatch}
                className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 border border-indigo-200 shadow-2xs transition-all cursor-pointer"
                title="Consolidate multiple invoices into a single unified multi-container shipment"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                <span>Consolidate ({processedCount})</span>
              </button>
            )}

            {/* Save All to Files button for converted documents */}
            {processedCount > 0 && onSaveAllToFiles && (
              <button
                type="button"
                onClick={onSaveAllToFiles}
                className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-2xs transition-all cursor-pointer"
                title="Save all allocated shipments to Files archive and clear board"
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
                title="Extract weights, pallets, and HazMat attributes for all documents"
              >
                {isBulkConverting ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-white" />
                    <span>Extracting...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                    <span>Convert All ({pendingCount})</span>
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
                className="text-[11px] text-slate-400 hover:text-rose-600 transition-colors flex items-center space-x-1 p-1"
                title="Clear all documents"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Document List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {documents.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-2.5">
                <Inbox className="w-6 h-6" />
              </div>
              <h3 className="text-xs font-semibold text-slate-700">
                No invoices in workspace
              </h3>
            </div>
          ) : (
            documents.map(doc => {
              const isSelected = doc.id === selectedDocumentId;
              const isProcessing = doc.status === 'processing';
              const isProcessed = doc.status === 'processed' && Boolean(doc.invoice);
              const isFailed = doc.status === 'failed';
              const inv = doc.invoice;

              return (
                <div
                  key={doc.id}
                  onClick={() => onSelectDocument(doc.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white border-indigo-400 shadow-sm ring-1 ring-indigo-400'
                      : 'bg-white/80 hover:bg-white border-slate-200/90 hover:border-slate-300 shadow-2xs'
                  }`}
                >
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
                            <span>Allocated</span>
                          </span>
                          {inv.hasDangerousGoods && (
                            <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shrink-0" title="Contains Dangerous Goods">
                              <Flame className="w-2.5 h-2.5 text-rose-600" />
                              <span>#DG</span>
                            </span>
                          )}
                        </div>

                        {/* Port Selector Dropdown */}
                        <div 
                          className="relative inline-flex items-center shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            value={inv.portOfLoading?.includes('INBOM4') ? 'INBOM4' : 'INNSA1'}
                            onChange={(e) => onPortChange(doc.id, e.target.value as CustomsPort)}
                            className="appearance-none bg-slate-50 hover:bg-slate-100 text-slate-700 text-[10px] font-semibold pl-5 pr-5 py-0.5 rounded-md border border-slate-200 focus:outline-none cursor-pointer"
                          >
                            <option value="INNSA1">INNSA1</option>
                            <option value="INBOM4">INBOM4</option>
                          </select>
                          <div className="absolute left-1 pointer-events-none text-indigo-600">
                            {inv.portOfLoading?.includes('INBOM4') ? (
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

                      {/* Row 2: Shipper / Weights & Pallets Breakdown */}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100/80 text-[11px] gap-2">
                        <div className="truncate min-w-0">
                          <span className="font-semibold text-slate-700 block truncate" title={inv.exporterName}>
                            {inv.exporterName}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {inv.containers?.length || 1} Cont ({inv.containers?.[0]?.containerType || '40HC'}) • {Math.round(inv.grossWeightKg || 0).toLocaleString()} kg
                          </span>
                        </div>

                        {/* Direct Document Generation Actions */}
                        <div 
                          className="flex items-center space-x-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* 1-Click Master BOL Download */}
                          <button
                            type="button"
                            onClick={() => {
                              const bol = generateMasterBol(inv);
                              downloadDocumentHtml(bol);
                            }}
                            className="px-2 py-0.5 text-[10px] font-semibold text-indigo-700 hover:text-white bg-indigo-50 hover:bg-indigo-600 rounded transition-colors"
                            title="Generate & Download Master BOL"
                          >
                            BOL
                          </button>

                          {/* 1-Click #DG Document Download (if hazmat) */}
                          {inv.hasDangerousGoods && (
                            <button
                              type="button"
                              onClick={() => {
                                const dg = generateDgDeclaration(inv);
                                downloadDocumentHtml(dg);
                              }}
                              className="px-2 py-0.5 text-[10px] font-semibold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 rounded transition-colors"
                              title="Generate & Download #DG Document"
                            >
                              #DG
                            </button>
                          )}

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
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-900 text-xs truncate" title={doc.fileName}>
                          {doc.fileName}
                        </span>
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/50 shrink-0">
                          <Loader2 className="w-2.5 h-2.5 animate-spin text-indigo-600" />
                          <span>Extracting...</span>
                        </span>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-100/80 flex items-center justify-between text-[11px] text-slate-400">
                        <span className="font-mono">{formatFileSize(doc.fileSize)}</span>
                        <span className="text-indigo-600 text-[10px] animate-pulse">Parsing weights & pallets...</span>
                      </div>
                    </>
                  ) : isFailed ? (
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
                            title="Retry extraction"
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
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800 text-xs truncate min-w-0" title={doc.fileName}>
                          {doc.fileName}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60 shrink-0">
                          Pending
                        </span>
                      </div>

                      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100/80 text-[11px]">
                        <span className="text-slate-400 font-mono text-[11px]">
                          {formatFileSize(doc.fileSize)}
                        </span>

                        <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => onConvertDocument(doc.id)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-colors cursor-pointer"
                            title="Extract weights, pallets, and HazMat attributes"
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
