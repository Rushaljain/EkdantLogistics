import React, { useState } from 'react';
import { 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Building2, 
  Scale, 
  Plus, 
  Trash2, 
  Columns, 
  Eye, 
  FileCheck, 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Save,
  Sparkles,
  Loader2,
  RefreshCw,
  AlertCircle,
  Key
} from 'lucide-react';
import type { ConvertedInvoice, LineItem, CustomsPort, AppDocument } from '../types';
import { EXPORTER_PROFILES } from '../data/profiles';

interface PreviewPaneProps {
  document: AppDocument | null;
  onSave: (updated: ConvertedInvoice) => void;
  onPortChange: (docId: string, port: CustomsPort) => void;
  onConvert?: (docId: string) => void;
  onOpenKeyModal?: () => void;
}

type ViewMode = 'data' | 'pdf';

export const PreviewPane: React.FC<PreviewPaneProps> = ({
  document,
  onSave,
  onPortChange,
  onConvert,
  onOpenKeyModal
}) => {
  // If no document is selected
  if (!document) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center p-8 bg-slate-50/40 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-center text-slate-400 mb-4">
          <Columns className="w-8 h-8 text-indigo-500/80" />
        </div>
        <h3 className="text-sm font-bold text-slate-800 tracking-tight">
          Document Preview & Extraction Pane
        </h3>
        <p className="text-xs text-slate-500 mt-1.5 max-w-sm leading-relaxed">
          Select an uploaded document from the list on the left or drop a new PDF to inspect extracted statutory data and compare side-by-side with the source document.
        </p>
      </div>
    );
  }

  // If document is processed and has converted invoice
  if (document.status === 'processed' && document.invoice) {
    return (
      <ActivePreviewPaneContent
        key={document.invoice.id}
        invoice={document.invoice}
        onSave={onSave}
        onPortChange={(_id, port) => onPortChange(document.id, port)}
      />
    );
  }

  // If document is pending, processing, or failed
  return (
    <PendingPreviewPaneContent
      document={document}
      onConvert={onConvert}
      onOpenKeyModal={onOpenKeyModal}
    />
  );
};

interface PendingContentProps {
  document: AppDocument;
  onConvert?: (docId: string) => void;
  onOpenKeyModal?: () => void;
}

const PendingPreviewPaneContent: React.FC<PendingContentProps> = ({
  document,
  onConvert,
  onOpenKeyModal
}) => {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages] = useState<number>(2);
  const [zoom, setZoom] = useState<number>(100);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isProcessing = document.status === 'processing';
  const isFailed = document.status === 'failed';

  return (
    <div className="flex-1 h-full flex flex-col bg-white overflow-hidden select-none">
      {/* Top Header */}
      <div className="h-16 px-6 border-b border-slate-200/80 flex items-center justify-between shrink-0 bg-white">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 truncate">
              {document.fileName}
            </h2>
            <div className="flex items-center space-x-2 text-[11px] text-slate-400 font-mono">
              <span>{formatFileSize(document.fileSize)}</span>
              <span>•</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                isProcessing
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  : isFailed
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {isProcessing ? 'Processing' : isFailed ? 'Failed' : 'Pending Processing'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        {onConvert && (
          <button
            type="button"
            onClick={() => onConvert(document.id)}
            disabled={isProcessing}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Converting...</span>
              </>
            ) : isFailed ? (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Conversion</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                <span>Convert Invoice</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Main Workspace (Split: Left Info Card, Right PDF Viewer) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Conversion Status & Instructions */}
        <div className="w-1/2 h-full p-8 flex flex-col justify-center items-center text-center bg-slate-50/50 border-r border-slate-200/80 overflow-y-auto">
          {isProcessing ? (
            <div className="max-w-md space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-100/80 text-indigo-600 flex items-center justify-center mx-auto shadow-xs">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                Processing Document
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Gemini AI is analyzing document tables, extracting statutory exporter & consignee details, validating 8-digit HSN codes, and calculating GST totals.
              </p>
            </div>
          ) : isFailed ? (
            <div className="max-w-md space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                Extraction Failed
              </h3>
              <p className="text-xs text-rose-600 leading-relaxed bg-rose-50 p-3 rounded-xl border border-rose-200">
                {document.errorMessage || 'Unable to extract data from this PDF.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {onOpenKeyModal && (
                  <button
                    type="button"
                    onClick={onOpenKeyModal}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-2xs transition-colors cursor-pointer"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>Enter Gemini API Key</span>
                  </button>
                )}
                {onConvert && (
                  <button
                    type="button"
                    onClick={() => onConvert(document.id)}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200/80 text-slate-700 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Conversion</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-md space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-xs">
                <Sparkles className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Ready to Convert
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                This document is uploaded and ready for extraction. Click <strong>Convert Invoice</strong> to extract vendor information, line items, and generate Indian Customs ICES 1.5 EDI output.
              </p>
              {onConvert && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => onConvert(document.id)}
                    className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-xs transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-indigo-200" />
                    <span>Convert Invoice Now</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: PDF Viewer */}
        <div className="w-1/2 h-full flex flex-col bg-slate-900 select-none overflow-hidden">
          <div className="h-11 bg-slate-800 px-4 flex items-center justify-between text-xs text-slate-300 shrink-0">
            <div className="flex items-center space-x-2 truncate">
              <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="font-medium truncate max-w-[180px]" title={document.fileName}>
                {document.fileName}
              </span>
              <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-mono">
                PDF
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1 bg-slate-700/80 px-1.5 py-0.5 rounded">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                  disabled={currentPage <= 1}
                  className="p-1 text-slate-300 hover:text-white disabled:opacity-30 transition-colors"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono px-1 text-white">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                  disabled={currentPage >= totalPages}
                  className="p-1 text-slate-300 hover:text-white disabled:opacity-30 transition-colors"
                  title="Next Page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center space-x-1 bg-slate-700/80 px-1.5 py-0.5 rounded">
                <button
                  type="button"
                  onClick={() => setZoom(z => Math.max(z - 15, 60))}
                  className="p-1 text-slate-300 hover:text-white transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono px-1 text-white">
                  {zoom}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom(z => Math.min(z + 15, 180))}
                  className="p-1 text-slate-300 hover:text-white transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 bg-slate-900 overflow-auto p-4 flex items-center justify-center">
            {document.pdfUrl ? (
              <iframe
                src={`${document.pdfUrl}#toolbar=0&navpanes=0`}
                className="w-full h-full rounded shadow-md border-0 bg-white"
                style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
                title={document.fileName}
              />
            ) : (
              <div className="text-center text-slate-400 p-8 space-y-2">
                <FileText className="w-12 h-12 mx-auto text-slate-600" />
                <p className="text-xs">PDF preview not available for this session.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface ActiveContentProps {
  invoice: ConvertedInvoice;
  onSave: (updated: ConvertedInvoice) => void;
  onPortChange: (invoiceId: string, port: CustomsPort) => void;
}

const ActivePreviewPaneContent: React.FC<ActiveContentProps> = ({
  invoice,
  onSave,
  onPortChange
}) => {
  const [formData, setFormData] = useState<ConvertedInvoice>(() => ({
    ...invoice,
    lineItems: invoice.lineItems.map(it => ({ ...it }))
  }));

  const [viewMode, setViewMode] = useState<ViewMode>('data');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages] = useState<number>(2);
  const [zoom, setZoom] = useState<number>(100);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  // Profile Autofill
  const handleSelectExporter = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const profile = EXPORTER_PROFILES.find(p => p.id === e.target.value);
    if (profile) {
      setFormData(prev => ({
        ...prev,
        exporterName: profile.companyName,
        iec: profile.iec,
        gstin: profile.gstin,
        adCode: profile.adCode,
        portOfLoading: profile.defaultPort
      }));
    }
  };

  // Line item updates
  const handleItemChange = (index: number, field: keyof LineItem, value: any) => {
    setFormData(prev => {
      const updated = [...prev.lineItems];
      const target = { ...updated[index], [field]: value };

      if (field === 'quantity' || field === 'unitPrice') {
        const qty = field === 'quantity' ? Number(value) || 0 : target.quantity;
        const rate = field === 'unitPrice' ? Number(value) || 0 : target.unitPrice;
        target.total = Number((qty * rate).toFixed(2));
      }

      updated[index] = target;
      return { ...prev, lineItems: updated };
    });
  };

  const handleAddItem = () => {
    const newItem: LineItem = {
      id: `item-${Date.now()}`,
      itemNumber: formData.lineItems.length + 1,
      description: 'NEW COMMERCIAL ITEM LINE',
      hsnCode: '84818090',
      quantity: 1,
      uqc: 'NOS',
      unitPrice: 100.0,
      total: 100.0
    };
    setFormData(prev => ({
      ...prev,
      lineItems: [...prev.lineItems, newItem]
    }));
  };

  const handleDeleteItem = (index: number) => {
    if (formData.lineItems.length <= 1) return;
    setFormData(prev => ({
      ...prev,
      lineItems: prev.lineItems.filter((_, idx) => idx !== index)
    }));
  };

  // Live Math calculations
  const itemsSum = Number(
    formData.lineItems.reduce((acc, it) => acc + (it.total || 0), 0).toFixed(2)
  );
  const gstAmount = Number((formData.gstAmount || 0).toFixed(2));
  const effectiveTotal = Number((itemsSum + gstAmount).toFixed(2));
  const headerTotal = Number(formData.invoiceTotal.toFixed(2));

  const isDirectMatch = Math.abs(itemsSum - headerTotal) <= 0.5;
  const isGstMatch = Math.abs(effectiveTotal - headerTotal) <= 0.5;
  const isBalanced = isDirectMatch || isGstMatch;
  const mathDiff = isGstMatch ? 0 : (isDirectMatch ? 0 : Number(Math.abs(effectiveTotal - headerTotal).toFixed(2)));
  const unallocatedGst = (!formData.gstAmount || formData.gstAmount === 0) && headerTotal > itemsSum 
    ? Number((headerTotal - itemsSum).toFixed(2)) 
    : 0;

  const handleSave = () => {
    const updated: ConvertedInvoice = {
      ...formData,
      status: isBalanced && formData.lineItems.every(i => i.hsnCode.length === 8) ? 'converted' : 'review_suggested'
    };
    onSave(updated);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-slate-50/50 overflow-hidden">
      {/* =========================================================================
          TOP ACTION BAR OF PREVIEW PANE (Clean, well-spaced layout)
         ========================================================================= */}
      <div className="h-16 px-6 bg-white border-b border-slate-200/80 flex items-center justify-between shrink-0 gap-4">
        {/* Left: View Mode Toggle (Extracted Data / PDF Carousel) */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setViewMode('data')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
              viewMode === 'data'
                ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>Extracted Data</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('pdf')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
              viewMode === 'pdf'
                ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>PDF Carousel</span>
          </button>
        </div>

        {/* Right: Actions (Save to Files) */}
        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={handleSave}
            title="Save converted invoice to Files and clear board for next document"
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer ${
              isSaved
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800'
            }`}
          >
            {isSaved ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Saved to Files!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save to Files</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* =========================================================================
          MAIN WORKSPACE: SPLIT VIEW / DATA VIEW / PDF CAROUSEL VIEW
         ========================================================================= */}
      <div className="flex-1 overflow-hidden flex">
        {/* PANEL A: EXTRACTED TEXT ("Preview & Edit Invoice" Section) */}
        {viewMode === 'data' && (
          <div className="w-full h-full flex flex-col bg-white overflow-y-auto p-6 space-y-6 text-xs">
            {/* Section 1: Shipment & Statutory Grid */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  Shipment & Statutory Information
                </h3>

                {/* Filing Type Toggle: Export vs Import */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/60 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setFormData(p => ({ ...p, filingType: 'EXPORT' }))}
                    className={`px-2 py-0.5 rounded font-semibold transition-all ${
                      formData.filingType === 'EXPORT'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Export (.sb)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(p => ({ ...p, filingType: 'IMPORT' }))}
                    className={`px-2 py-0.5 rounded font-semibold transition-all ${
                      formData.filingType === 'IMPORT'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Import (.be)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Invoice Number */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1.5">
                    Invoice Number
                  </label>
                  <input
                    type="text"
                    value={formData.invoiceNumber}
                    onChange={(e) => setFormData(p => ({ ...p, invoiceNumber: e.target.value }))}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-semibold transition-colors"
                    required
                  />
                </div>

                {/* Invoice Date */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1.5">
                    Invoice Date
                  </label>
                  <input
                    type="date"
                    value={formData.invoiceDate}
                    onChange={(e) => setFormData(p => ({ ...p, invoiceDate: e.target.value }))}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                    required
                  />
                </div>

                {/* e-Sanchit IRN */}
                <div className="md:col-span-2">
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1.5">
                    16-Digit e-Sanchit IRN
                  </label>
                  <input
                    type="text"
                    maxLength={16}
                    value={formData.esanchitIrn}
                    onChange={(e) => setFormData(p => ({ ...p, esanchitIrn: e.target.value.toUpperCase() }))}
                    placeholder="e.g. 2026102700948215"
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                  />
                </div>

                {/* Exporter Name with Profile Dropdown */}
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-semibold text-slate-700">
                      Exporter / Consignor Name
                    </label>
                    <select
                      onChange={handleSelectExporter}
                      className="text-[10px] bg-slate-100 hover:bg-slate-200/70 text-slate-700 font-medium rounded-md px-2 py-0.5 border border-slate-200 outline-none cursor-pointer transition-colors"
                      defaultValue=""
                    >
                      <option value="" disabled>Auto-fill Profile...</option>
                      {EXPORTER_PROFILES.map(p => (
                        <option key={p.id} value={p.id}>{p.companyName.slice(0, 28)}...</option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="text"
                    value={formData.exporterName}
                    onChange={(e) => setFormData(p => ({ ...p, exporterName: e.target.value }))}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-semibold transition-colors"
                    required
                  />
                </div>

                {/* 10-Digit IEC */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1.5">
                    10-Digit IEC
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    value={formData.iec}
                    onChange={(e) => setFormData(p => ({ ...p, iec: e.target.value.toUpperCase() }))}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                  />
                </div>

                {/* 15-Digit GSTIN */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1.5">
                    15-Digit GSTIN
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    value={formData.gstin}
                    onChange={(e) => setFormData(p => ({ ...p, gstin: e.target.value.toUpperCase() }))}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-semibold transition-colors"
                  />
                </div>

                {/* Bank AD Code */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1.5">
                    Bank AD Code (7 Digits)
                  </label>
                  <input
                    type="text"
                    maxLength={7}
                    value={formData.adCode}
                    onChange={(e) => setFormData(p => ({ ...p, adCode: e.target.value }))}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                  />
                </div>

                {/* Consignee Name */}
                <div className="md:col-span-2">
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1.5">
                    Consignee / Buyer (Overseas)
                  </label>
                  <input
                    type="text"
                    value={formData.consigneeName}
                    onChange={(e) => setFormData(p => ({ ...p, consigneeName: e.target.value }))}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-semibold transition-colors"
                  />
                </div>

                {/* Port of Loading */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1.5">
                    Port of Loading
                  </label>
                  <select
                    value={formData.portOfLoading}
                    onChange={(e) => onPortChange(formData.id, e.target.value as CustomsPort)}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-semibold transition-colors cursor-pointer"
                  >
                    <option value="INNSA1">Nhava Sheva (INNSA1)</option>
                    <option value="INBOM4">Mumbai Air (INBOM4)</option>
                  </select>
                </div>

                {/* Discharge Port & Country */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1.5">
                      Discharge Port
                    </label>
                    <input
                      type="text"
                      value={formData.portOfDischarge}
                      onChange={(e) => setFormData(p => ({ ...p, portOfDischarge: e.target.value.toUpperCase() }))}
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1.5">
                      Country
                    </label>
                    <input
                      type="text"
                      maxLength={2}
                      value={formData.destinationCountry}
                      onChange={(e) => setFormData(p => ({ ...p, destinationCountry: e.target.value.toUpperCase() }))}
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* Currency, Exch Rate, Incoterm */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1.5">
                    Currency
                  </label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData(p => ({ ...p, currency: e.target.value }))}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-semibold transition-colors cursor-pointer"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="AED">AED</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1.5">
                    Exchange Rate (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.exchangeRate}
                    onChange={(e) => setFormData(p => ({ ...p, exchangeRate: parseFloat(e.target.value) || 1 }))}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1.5">
                    Incoterm
                  </label>
                  <select
                    value={formData.incoterm}
                    onChange={(e) => setFormData(p => ({ ...p, incoterm: e.target.value as any }))}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-semibold transition-colors cursor-pointer"
                  >
                    <option value="FOB">FOB</option>
                    <option value="CIF">CIF</option>
                    <option value="CFR">CFR</option>
                    <option value="EXW">EXW</option>
                  </select>
                </div>

                {/* GST / Taxes Amount */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-semibold text-slate-700">
                      GST / Taxes ({formData.currency})
                    </label>
                    {itemsSum > 0 && formData.invoiceTotal > itemsSum && (!formData.gstAmount || formData.gstAmount === 0) && (
                      <button
                        type="button"
                        onClick={() => setFormData(p => ({ ...p, gstAmount: Number((p.invoiceTotal - itemsSum).toFixed(2)) }))}
                        className="text-[10px] text-indigo-600 font-semibold hover:underline cursor-pointer"
                      >
                        Auto-Fill
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.gstAmount ?? ''}
                    placeholder="0.00"
                    onChange={(e) => setFormData(p => ({ ...p, gstAmount: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                  />
                </div>

                {/* Total Invoice Value */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1.5">
                    Header Invoice Total
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.invoiceTotal}
                    onChange={(e) => setFormData(p => ({ ...p, invoiceTotal: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Line Items & Tariff Codes */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Scale className="w-3.5 h-3.5 text-indigo-600" />
                    Line Items & Tariff Codes ({formData.lineItems.length} items)
                  </h3>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 active:bg-slate-200 border border-slate-200/60 shadow-2xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-slate-600" />
                    <span>Add Item</span>
                  </button>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/90 text-slate-600 text-[11px] font-semibold border-b border-slate-200 uppercase tracking-wider">
                      <th className="py-2.5 px-3 w-10 text-center">#</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3 w-32">HSN (8-Digit)</th>
                      <th className="py-2.5 px-3 w-20 text-right">Qty</th>
                      <th className="py-2.5 px-3 w-24">Unit</th>
                      <th className="py-2.5 px-3 w-28 text-right">Price</th>
                      <th className="py-2.5 px-3 w-32 text-right">Total</th>
                      <th className="py-2.5 px-2 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {formData.lineItems.map((item, idx) => {
                      const isHsnValid = item.hsnCode && item.hsnCode.length === 8 && /^\d+$/.test(item.hsnCode);
                      const calculated = Number((item.quantity * item.unitPrice).toFixed(2));
                      const isMathValid = Math.abs(calculated - item.total) < 0.05;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>

                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                              className="w-full bg-slate-50/50 border border-slate-200/60 hover:border-slate-300 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 outline-none transition-colors"
                            />
                          </td>

                          <td className="py-2.5 px-3">
                            <div className="relative">
                              <input
                                type="text"
                                maxLength={8}
                                value={item.hsnCode}
                                onChange={(e) => handleItemChange(idx, 'hsnCode', e.target.value.replace(/[^0-9]/g, ''))}
                                className={`w-full font-mono text-xs px-2.5 py-1.5 rounded-lg border outline-none transition-colors ${
                                  isHsnValid
                                    ? 'border-slate-200/80 bg-slate-50/50 text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                                    : 'border-amber-400 bg-amber-50/60 text-amber-900 focus:border-amber-500'
                                }`}
                              />
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-right">
                            <input
                              type="number"
                              step="any"
                              value={item.quantity}
                              onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                              className="w-full text-right font-mono bg-slate-50/50 border border-slate-200/60 hover:border-slate-300 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg px-2 py-1.5 text-xs text-slate-900 outline-none transition-colors"
                            />
                          </td>

                          <td className="py-2.5 px-3">
                            <select
                              value={item.uqc}
                              onChange={(e) => handleItemChange(idx, 'uqc', e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-mono text-xs text-slate-700 outline-none cursor-pointer transition-colors"
                            >
                              <option value="NOS">NOS</option>
                              <option value="PCS">PCS</option>
                              <option value="KGS">KGS</option>
                              <option value="MTR">MTR</option>
                              <option value="BOX">BOX</option>
                              <option value="SET">SET</option>
                              <option value="CTN">CTN</option>
                            </select>
                          </td>

                          <td className="py-2.5 px-3 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={(e) => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                              className="w-full text-right font-mono bg-slate-50/50 border border-slate-200/60 hover:border-slate-300 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg px-2 py-1.5 text-xs text-slate-900 outline-none transition-colors"
                            />
                          </td>

                          <td className="py-2.5 px-3 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={item.total}
                              onChange={(e) => handleItemChange(idx, 'total', parseFloat(e.target.value) || 0)}
                              className={`w-full font-mono font-bold text-right px-2.5 py-1.5 rounded-lg border outline-none transition-colors ${
                                isMathValid
                                  ? 'border-slate-200/60 bg-slate-50/50 hover:border-slate-300 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-900'
                                  : 'border-rose-400 bg-rose-50/60 text-rose-900'
                              }`}
                            />
                          </td>

                          <td className="py-2.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(idx)}
                              disabled={formData.lineItems.length <= 1}
                              className="p-1.5 text-slate-300 hover:text-rose-600 rounded-lg disabled:opacity-30 transition-colors cursor-pointer"
                              title="Delete Item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 3: Math Audit Footer Indicator */}
            <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                  isBalanced
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}>
                  {isBalanced ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>
                        Totals Reconciled
                        {gstAmount > 0 ? ` (Items: ${itemsSum.toFixed(2)} + GST: ${gstAmount.toFixed(2)})` : ''}
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>Variance: {mathDiff.toFixed(2)} {formData.currency}</span>
                      {unallocatedGst > 0 && (
                        <button
                          type="button"
                          onClick={() => setFormData(p => ({ ...p, gstAmount: unallocatedGst }))}
                          className="ml-2 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-2xs"
                        >
                          + Add GST ({unallocatedGst.toFixed(2)} {formData.currency})
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div className="text-xs text-slate-500 font-mono">
                  Items Sum: <strong className="text-slate-800">{itemsSum.toFixed(2)}</strong>
                  {gstAmount > 0 && (
                    <> + GST: <strong className="text-indigo-600">{gstAmount.toFixed(2)}</strong></>
                  )}
                  {' '}| Header Total: <strong className="text-slate-800">{headerTotal.toFixed(2)}</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PANEL B: PDF DOCUMENT VIEWER & CAROUSEL */}
        {viewMode === 'pdf' && (
          <div className="w-full h-full flex flex-col bg-slate-900 select-none overflow-hidden">
            {/* Carousel Toolbar */}
            <div className="h-11 bg-slate-800 px-4 flex items-center justify-between text-xs text-slate-300 shrink-0">
              <div className="flex items-center space-x-2 truncate">
                <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="font-medium truncate max-w-[180px]" title={formData.fileName}>
                  {formData.fileName}
                </span>
                <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-mono">
                  PDF
                </span>
              </div>

              {/* Carousel Page Controls */}
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1 bg-slate-700/80 px-1.5 py-0.5 rounded">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                    disabled={currentPage <= 1}
                    className="p-1 text-slate-300 hover:text-white disabled:opacity-30 transition-colors"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-mono px-1 text-white">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                    disabled={currentPage >= totalPages}
                    className="p-1 text-slate-300 hover:text-white disabled:opacity-30 transition-colors"
                    title="Next Page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center space-x-1 bg-slate-700/80 px-1 py-0.5 rounded">
                  <button
                    type="button"
                    onClick={() => setZoom(z => Math.max(z - 15, 60))}
                    className="p-1 text-slate-300 hover:text-white transition-colors"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-mono px-1 text-slate-300">
                    {zoom}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoom(z => Math.min(z + 15, 160))}
                    className="p-1 text-slate-300 hover:text-white transition-colors"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Document Display Canvas */}
            <div className="flex-1 overflow-auto p-4 flex justify-center items-start bg-slate-950/60">
              {formData.pdfUrl ? (
                <div 
                  className="w-full h-full min-h-[500px] bg-white rounded-lg shadow-2xl overflow-hidden transition-transform origin-top"
                  style={{ transform: `scale(${zoom / 100})` }}
                >
                  <iframe
                    src={`${formData.pdfUrl}#page=${currentPage}&toolbar=0&navpanes=0`}
                    title="Document PDF Preview"
                    className="w-full h-full min-h-[650px] border-none"
                  />
                </div>
              ) : (
                /* High-Fidelity Mock PDF Visualizer if direct Blob URL expired across reload */
                <div 
                  className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-xl text-slate-900 font-sans text-xs transition-transform origin-top select-text"
                  style={{ transform: `scale(${zoom / 100})` }}
                >
                  {/* Document Header */}
                  <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4 mb-4">
                    <div>
                      <h4 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                        {formData.exporterName}
                      </h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        GSTIN: {formData.gstin || '27AABCS8891D1Z1'} | IEC: {formData.iec || '0399003418'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold font-mono text-indigo-700 block">
                        COMMERCIAL INVOICE
                      </span>
                      <span className="font-mono text-[11px] font-bold text-slate-800">
                        #{formData.invoiceNumber}
                      </span>
                      <p className="text-[10px] text-slate-500 font-mono">
                        Date: {formData.invoiceDate}
                      </p>
                    </div>
                  </div>

                  {/* Consignee */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4 text-[11px]">
                    <span className="font-bold uppercase tracking-wider text-slate-400 block text-[9px]">
                      Buyer / Consignee:
                    </span>
                    <span className="font-semibold text-slate-800 block mt-0.5">
                      {formData.consigneeName}
                    </span>
                    <span className="text-slate-500 block">
                      Destination: {formData.portOfDischarge} ({formData.destinationCountry}) | Terms: {formData.incoterm}
                    </span>
                  </div>

                  {/* Document Items Table */}
                  <div className="mb-4">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-300 text-slate-600 font-semibold">
                          <th className="py-1">Description</th>
                          <th className="py-1 text-center">HSN</th>
                          <th className="py-1 text-right">Qty</th>
                          <th className="py-1 text-right">Rate</th>
                          <th className="py-1 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {formData.lineItems.map((it, i) => (
                          <tr key={i}>
                            <td className="py-1.5 font-medium text-slate-800">{it.description}</td>
                            <td className="py-1.5 text-center font-mono text-slate-600">{it.hsnCode}</td>
                            <td className="py-1.5 text-right font-mono">{it.quantity} {it.uqc}</td>
                            <td className="py-1.5 text-right font-mono">{it.unitPrice.toFixed(2)}</td>
                            <td className="py-1.5 text-right font-mono font-semibold">{it.total.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Document Totals */}
                  <div className="border-t-2 border-slate-800 pt-3 flex justify-between items-center text-xs">
                    <div className="text-[10px] text-slate-400 font-mono">
                      <span>Source File: {formData.fileName}</span>
                    </div>
                    <div className="text-right space-y-0.5 font-mono">
                      {formData.gstAmount && formData.gstAmount > 0 ? (
                        <>
                          <div className="text-[10px] text-slate-500">
                            Subtotal: {formData.currency} {itemsSum.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-indigo-600">
                            GST (18%): {formData.currency} {formData.gstAmount.toFixed(2)}
                          </div>
                        </>
                      ) : null}
                      <div className="text-sm font-bold text-slate-900">
                        Grand Total: {formData.currency} {formData.invoiceTotal.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
