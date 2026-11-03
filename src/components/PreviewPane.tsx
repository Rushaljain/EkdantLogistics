import React, { useState } from 'react';
import { 
  FileText, 
  CheckCircle2, 
  Building2, 
  Columns, 
  Eye, 
  FileCheck, 
  ZoomIn, 
  ZoomOut, 
  Save, 
  Sparkles, 
  Loader2, 
  RefreshCw, 
  AlertCircle, 
  Key, 
  Boxes, 
  Flame, 
  Printer, 
  Download, 
  Ship 
} from 'lucide-react';
import type { 
  ConvertedInvoice, 
  LineItem, 
  CustomsPort, 
  AppDocument, 
  ContainerType, 
  DocumentOutput 
} from '../types';
import { EXPORTER_PROFILES } from '../data/profiles';
import { DOCUMENT_TEMPLATES } from '../data/templates';
import { allocateContainers, createEmptyContainer, recalculateContainer } from '../utils/containerAllocator';
import { optimizeContainerAllocation } from '../utils/containerOptimizer';
import { generateMasterBol, printDocument, downloadDocumentHtml } from '../utils/bolGenerator';
import { generateDgDeclaration } from '../utils/dgGenerator';
import { ContainerQcBoard } from './ContainerQcBoard';

interface PreviewPaneProps {
  document: AppDocument | null;
  onSave: (updated: ConvertedInvoice) => void;
  onPortChange: (docId: string, port: CustomsPort) => void;
  onConvert?: (docId: string) => void;
  onOpenKeyModal?: () => void;
}

type ViewMode = 'allocation' | 'data' | 'documents' | 'pdf';

export const PreviewPane: React.FC<PreviewPaneProps> = ({
  document,
  onSave,
  onPortChange,
  onConvert,
  onOpenKeyModal
}) => {
  if (!document) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center p-8 bg-slate-50/40 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-center text-slate-400 mb-4">
          <Columns className="w-8 h-8 text-indigo-500/80" />
        </div>
        <h3 className="text-sm font-bold text-slate-800 tracking-tight">
          Shipment Workspace & Container Allocator
        </h3>
      </div>
    );
  }

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
                {isProcessing ? 'Processing...' : isFailed ? 'Failed' : 'Ready to Convert'}
              </span>
            </div>
          </div>
        </div>

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
                <span>Extracting...</span>
              </>
            ) : isFailed ? (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Extraction</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                <span>Extract Weights & Pallets</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Main Workspace (Split: Left Info Card, Right PDF Viewer) */}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/2 h-full p-8 flex flex-col justify-center items-center text-center bg-slate-50/50 border-r border-slate-200/80 overflow-y-auto">
          {isProcessing ? (
            <div className="max-w-md space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-100/80 text-indigo-600 flex items-center justify-center mx-auto shadow-xs">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                Extracting Multi-Container Cargo Data
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Gemini Vision AI is scanning multi-page commercial invoice tables, gross/net weights, pallet distributions, and checking hazardous material classes (IMO/UN #).
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
              {onOpenKeyModal && (
                <button
                  type="button"
                  onClick={onOpenKeyModal}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-colors cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Configure Gemini API Key</span>
                </button>
              )}
            </div>
          ) : (
            <div className="max-w-md space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200/80 text-indigo-600 flex items-center justify-center mx-auto shadow-xs">
                <FileText className="w-8 h-8 text-indigo-500" />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                Ready for Extraction
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Click <strong>Extract Weights & Pallets</strong> to parse line items, gross/net weights, auto-segregate pallets into containers, and generate #DG and Master BOL forms.
              </p>
            </div>
          )}
        </div>

        {/* Right Side: PDF Preview */}
        <div className="w-1/2 h-full flex flex-col bg-slate-900 overflow-hidden">
          <div className="h-10 bg-slate-800 px-4 flex items-center justify-between text-xs text-slate-300 shrink-0">
            <span className="truncate">{document.fileName}</span>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setZoom(z => Math.max(z - 15, 60))}
                className="p-1 hover:text-white"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono">{zoom}%</span>
              <button
                type="button"
                onClick={() => setZoom(z => Math.min(z + 15, 180))}
                className="p-1 hover:text-white"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
            {document.pdfUrl ? (
              <iframe
                src={`${document.pdfUrl}#toolbar=0`}
                className="w-full h-full rounded shadow-md border-0 bg-white"
                style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
                title={document.fileName}
              />
            ) : (
              <div className="text-slate-400 text-xs">PDF preview not loaded.</div>
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
  onPortChange?: (invoiceId: string, port: CustomsPort) => void;
}

const ActivePreviewPaneContent: React.FC<ActiveContentProps> = ({
  invoice,
  onSave,
  onPortChange: _onPortChange
}) => {
  const [formData, setFormData] = useState<ConvertedInvoice>(() => ({
    ...invoice,
    containers: invoice.containers && invoice.containers.length > 0 
      ? invoice.containers.map(c => ({ ...c, pallets: c.pallets.map(p => ({ ...p })) }))
      : allocateContainers(invoice.lineItems, '40HC', invoice.totalPallets).containers,
    lineItems: invoice.lineItems.map(it => ({ ...it }))
  }));

  const [viewMode, setViewMode] = useState<ViewMode>('allocation');
  const [zoom, setZoom] = useState<number>(100);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [activeGeneratedDoc, setActiveGeneratedDoc] = useState<DocumentOutput | null>(null);

  // Exporter Profile Autofill
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

  // Container Allocation Handlers
  const handleAddContainer = (type: ContainerType = '40HC') => {
    setFormData(prev => {
      const newCont = createEmptyContainer(type, prev.containers.length);
      return {
        ...prev,
        containers: [...prev.containers, newCont]
      };
    });
  };

  const handleDeleteContainer = (contId: string) => {
    setFormData(prev => {
      if (prev.containers.length <= 1) return prev;
      const target = prev.containers.find(c => c.id === contId);
      const remaining = prev.containers.filter(c => c.id !== contId);

      // Reassign orphan pallets to first remaining container
      if (target && target.pallets.length > 0 && remaining.length > 0) {
        remaining[0].pallets = [...remaining[0].pallets, ...target.pallets];
        remaining[0].assignedPalletIds = remaining[0].pallets.map(p => p.id);
        remaining[0] = recalculateContainer(remaining[0]);
      }

      return {
        ...prev,
        containers: remaining
      };
    });
  };

  const handleContainerTypeChange = (contId: string, newType: ContainerType) => {
    setFormData(prev => ({
      ...prev,
      containers: prev.containers.map(c => {
        if (c.id !== contId) return c;
        const updated = { ...c, containerType: newType };
        return recalculateContainer(updated);
      })
    }));
  };

  const handleContainerFieldChange = (contId: string, field: 'containerNumber' | 'sealNumber', val: string) => {
    setFormData(prev => ({
      ...prev,
      containers: prev.containers.map(c => c.id === contId ? { ...c, [field]: val.toUpperCase() } : c)
    }));
  };

  const handleAutoReallocate = (preferredType: ContainerType = '20GP') => {
    const { containers, pallets } = optimizeContainerAllocation(
      formData.lineItems,
      formData.pallets.length > 0 ? formData.pallets : undefined,
      {
        preferredContainerType: preferredType,
        explicitPalletCount: formData.totalPallets || undefined
      }
    );
    setFormData(prev => ({
      ...prev,
      containers,
      pallets
    }));
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

  const handleSave = () => {
    onSave(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  // Document Generation Triggers
  const handleGenerateBol = () => {
    const bolDoc = generateMasterBol(formData, formData.selectedBolTemplateId);
    setActiveGeneratedDoc(bolDoc);
    setViewMode('documents');
  };

  const handleGenerateDg = () => {
    const dgDoc = generateDgDeclaration(formData, formData.selectedDgTemplateId);
    setActiveGeneratedDoc(dgDoc);
    setViewMode('documents');
  };

  const handleQuickDownloadBol = () => {
    const bolDoc = generateMasterBol(formData, formData.selectedBolTemplateId);
    downloadDocumentHtml(bolDoc);
  };

  const handleQuickDownloadDg = () => {
    const dgDoc = generateDgDeclaration(formData, formData.selectedDgTemplateId);
    downloadDocumentHtml(dgDoc);
  };

  const handleLockAndGenerate = () => {
    onSave(formData);
    const bolDoc = generateMasterBol(formData, formData.selectedBolTemplateId);
    const dgDoc = formData.hasDangerousGoods ? generateDgDeclaration(formData, formData.selectedDgTemplateId) : null;
    setActiveGeneratedDoc(dgDoc || bolDoc);
    setViewMode('documents');
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-slate-50/50 overflow-hidden">
      {/* =========================================================================
          TOP ACTION BAR OF PREVIEW PANE
         ========================================================================= */}
      <div className="h-16 px-6 bg-white border-b border-slate-200/80 flex items-center justify-between shrink-0 gap-4">
        {/* Left: View Mode Toggle */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setViewMode('allocation')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              viewMode === 'allocation'
                ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Containers & Pallets</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-50 text-indigo-700 font-mono">
              {formData.containers.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('data')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              viewMode === 'data'
                ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>Cargo & HazMat</span>
            {formData.hasDangerousGoods && (
              <Flame className="w-3 h-3 text-rose-600" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (!activeGeneratedDoc) {
                setActiveGeneratedDoc(generateMasterBol(formData, formData.selectedBolTemplateId));
              }
              setViewMode('documents');
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              viewMode === 'documents'
                ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>#DG & BOL Forms</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('pdf')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              viewMode === 'pdf'
                ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>PDF Source</span>
          </button>
        </div>

        {/* Right: Fast Generator Actions + Direct Downloads + Save to Files */}
        <div className="flex items-center space-x-2 shrink-0">
          <div className="flex items-center bg-indigo-50 border border-indigo-200 rounded-lg p-0.5">
            <button
              type="button"
              onClick={handleGenerateBol}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-semibold text-indigo-700 hover:bg-white transition-colors cursor-pointer"
              title="View Master Bill of Lading"
            >
              <Ship className="w-3.5 h-3.5 text-indigo-600" />
              <span>Master BOL</span>
            </button>
            <button
              type="button"
              onClick={handleQuickDownloadBol}
              className="p-1.5 text-indigo-600 hover:text-indigo-900 hover:bg-white rounded-md transition-colors"
              title="Direct Download Master BOL (HTML/Print)"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>

          {formData.hasDangerousGoods && (
            <div className="flex items-center bg-rose-50 border border-rose-200 rounded-lg p-0.5">
              <button
                type="button"
                onClick={handleGenerateDg}
                className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-semibold text-rose-700 hover:bg-white transition-colors cursor-pointer"
                title="View IMO Multimodal Dangerous Goods Declaration"
              >
                <Flame className="w-3.5 h-3.5 text-rose-600" />
                <span>#DG Declaration</span>
              </button>
              <button
                type="button"
                onClick={handleQuickDownloadDg}
                className="p-1.5 text-rose-600 hover:text-rose-900 hover:bg-white rounded-md transition-colors"
                title="Direct Download #DG Declaration (HTML/Print)"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer ${
              isSaved
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {isSaved ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Saved to Files!</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save to Files</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* =========================================================================
          PANEL A: VISUAL CONTAINER QC BOARD (KANBAN COLUMNS & DRAG-AND-DROP)
         ========================================================================= */}
      {viewMode === 'allocation' && (
        <ContainerQcBoard
          containers={formData.containers}
          pallets={formData.pallets}
          lineItems={formData.lineItems}
          hasDangerousGoods={formData.hasDangerousGoods}
          onUpdateContainers={(updatedContainers, updatedPallets) => {
            setFormData(prev => ({
              ...prev,
              containers: updatedContainers,
              pallets: updatedPallets
            }));
          }}
          onAutoReallocate={(type) => handleAutoReallocate(type || '20GP')}
          onAddContainer={handleAddContainer}
          onDeleteContainer={handleDeleteContainer}
          onContainerTypeChange={handleContainerTypeChange}
          onContainerFieldChange={handleContainerFieldChange}
          onLockAndGenerate={handleLockAndGenerate}
          onQuickDownloadBol={handleQuickDownloadBol}
          onQuickDownloadDg={handleQuickDownloadDg}
        />
      )}

      {/* =========================================================================
          PANEL B: CARGO & DANGEROUS GOODS (HAZMAT) DATA
         ========================================================================= */}
      {viewMode === 'data' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {/* Section 1: Header / Shipping Information */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Shipment & Booking Information</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Invoice / Reference No
                </label>
                <input
                  type="text"
                  value={formData.invoiceNumber}
                  onChange={(e) => setFormData(p => ({ ...p, invoiceNumber: e.target.value }))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-slate-900 outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Booking Number
                </label>
                <input
                  type="text"
                  value={formData.bookingNumber || ''}
                  onChange={(e) => setFormData(p => ({ ...p, bookingNumber: e.target.value }))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 outline-none"
                  placeholder="e.g. BKG-MSC-99201"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Vessel & Voyage
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={formData.vesselName || ''}
                    onChange={(e) => setFormData(p => ({ ...p, vesselName: e.target.value.toUpperCase() }))}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 outline-none"
                    placeholder="Vessel"
                  />
                  <input
                    type="text"
                    value={formData.voyageNumber || ''}
                    onChange={(e) => setFormData(p => ({ ...p, voyageNumber: e.target.value.toUpperCase() }))}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900 outline-none"
                    placeholder="Voyage"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Port of Loading
                </label>
                <input
                  type="text"
                  value={formData.portOfLoading}
                  onChange={(e) => setFormData(p => ({ ...p, portOfLoading: e.target.value }))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-900 outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-700">
                    Shipper / Exporter
                  </label>
                  <select
                    onChange={handleSelectExporter}
                    className="text-[10px] bg-slate-100 text-slate-700 rounded px-2 py-0.5 border border-slate-200 outline-none cursor-pointer"
                    defaultValue=""
                  >
                    <option value="" disabled>Auto-fill Profile...</option>
                    {EXPORTER_PROFILES.map(p => (
                      <option key={p.id} value={p.id}>{p.companyName}</option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  value={formData.exporterName}
                  onChange={(e) => setFormData(p => ({ ...p, exporterName: e.target.value }))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-900 outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Consignee / Buyer
                </label>
                <input
                  type="text"
                  value={formData.consigneeName}
                  onChange={(e) => setFormData(p => ({ ...p, consigneeName: e.target.value }))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-900 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Line Items & HazMat Flags */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <span>Cargo Line Items & Dangerous Goods Flags</span>
              </h3>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-[11px] font-semibold border-b border-slate-200 uppercase">
                    <th className="py-2.5 px-3 w-8">#</th>
                    <th className="py-2.5 px-3">Description & DG Attributes</th>
                    <th className="py-2.5 px-3 w-28">HSN Code</th>
                    <th className="py-2.5 px-3 w-20 text-right">Qty</th>
                    <th className="py-2.5 px-3 w-28 text-right">Gross Wt</th>
                    <th className="py-2.5 px-3 w-32 text-center">HazMat (#DG)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {formData.lineItems.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-3 text-slate-400 font-mono text-center">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 font-medium outline-none"
                        />
                        {item.isDangerousGood && (
                          <div className="mt-1 flex flex-wrap gap-2 text-[10px]">
                            <input
                              type="text"
                              value={item.unNumber || 'UN 1993'}
                              onChange={(e) => handleItemChange(idx, 'unNumber', e.target.value)}
                              placeholder="UN Number"
                              className="font-mono text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5 outline-none w-20"
                            />
                            <input
                              type="text"
                              value={item.imoClass || 'Class 3'}
                              onChange={(e) => handleItemChange(idx, 'imoClass', e.target.value)}
                              placeholder="IMO Class"
                              className="font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5 outline-none w-24"
                            />
                            <input
                              type="text"
                              value={item.flashPoint || ''}
                              onChange={(e) => handleItemChange(idx, 'flashPoint', e.target.value)}
                              placeholder="Flash Point (e.g. 23C)"
                              className="text-slate-600 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 outline-none w-28"
                            />
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={item.hsnCode}
                          onChange={(e) => handleItemChange(idx, 'hsnCode', e.target.value.replace(/[^0-9]/g, ''))}
                          className="w-full font-mono text-xs bg-white border border-slate-200 rounded px-2 py-1 outline-none"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full font-mono text-right bg-white border border-slate-200 rounded px-2 py-1 outline-none"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          value={item.grossWeightKg}
                          onChange={(e) => handleItemChange(idx, 'grossWeightKg', parseFloat(e.target.value) || 0)}
                          className="w-full font-mono text-right bg-white border border-slate-200 rounded px-2 py-1 outline-none"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            const newDg = !item.isDangerousGood;
                            handleItemChange(idx, 'isDangerousGood', newDg);
                            if (newDg) {
                              setFormData(p => ({ ...p, hasDangerousGoods: true }));
                            }
                          }}
                          className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors cursor-pointer ${
                            item.isDangerousGood
                              ? 'bg-rose-100 text-rose-700 border border-rose-300'
                              : 'bg-slate-100 text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {item.isDangerousGood ? 'HazMat (DG)' : 'Non-Hazardous'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PANEL C: GENERATED #DG & BOL DOCUMENTS (WITH TEMPLATE SELECTOR)
         ========================================================================= */}
      {viewMode === 'documents' && (
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-100/70">
          {/* Template Bar */}
          <div className="h-14 px-6 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 gap-4">
            <div className="flex items-center space-x-3">
              <span className="text-xs font-bold text-slate-700">Template Layout:</span>
              <select
                value={activeGeneratedDoc?.documentType === 'DG' ? formData.selectedDgTemplateId : formData.selectedBolTemplateId}
                onChange={(e) => {
                  const val = e.target.value;
                  if (activeGeneratedDoc?.documentType === 'DG') {
                    setFormData(p => ({ ...p, selectedDgTemplateId: val }));
                    setActiveGeneratedDoc(generateDgDeclaration(formData, val));
                  } else {
                    setFormData(p => ({ ...p, selectedBolTemplateId: val }));
                    setActiveGeneratedDoc(generateMasterBol(formData, val));
                  }
                }}
                className="text-xs font-semibold bg-slate-50 text-slate-900 border border-slate-200 rounded-lg px-3 py-1.5 outline-none cursor-pointer"
              >
                {activeGeneratedDoc?.documentType === 'DG'
                  ? DOCUMENT_TEMPLATES.filter(t => t.type === 'DG').map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.carrierOrClient})</option>
                    ))
                  : DOCUMENT_TEMPLATES.filter(t => t.type === 'BOL').map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.carrierOrClient})</option>
                    ))
                }
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => handleGenerateBol()}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeGeneratedDoc?.documentType === 'BOL'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Master BOL
              </button>

              <button
                type="button"
                onClick={() => handleGenerateDg()}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeGeneratedDoc?.documentType === 'DG'
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                #DG Declaration
              </button>

              {activeGeneratedDoc && (
                <>
                  <button
                    type="button"
                    onClick={() => printDocument(activeGeneratedDoc.formattedHtml)}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                    title="Print Document"
                  >
                    <Printer className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => downloadDocumentHtml(activeGeneratedDoc)}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                    title="Download HTML"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Rendered Document View */}
          <div className="flex-1 overflow-auto p-6 flex justify-center">
            {activeGeneratedDoc ? (
              <div 
                className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden w-full max-w-4xl"
                dangerouslySetInnerHTML={{ __html: activeGeneratedDoc.formattedHtml }}
              />
            ) : (
              <div className="text-center py-20 text-slate-400 text-xs">
                Select Master BOL or #DG Declaration above to render.
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          PANEL D: PDF SOURCE VIEWER
         ========================================================================= */}
      {viewMode === 'pdf' && (
        <div className="flex-1 flex flex-col bg-slate-900 overflow-hidden select-none">
          <div className="h-10 bg-slate-800 px-4 flex items-center justify-between text-xs text-slate-300 shrink-0">
            <span className="truncate">{formData.fileName}</span>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setZoom(z => Math.max(z - 15, 60))}
                className="p-1 hover:text-white"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono">{zoom}%</span>
              <button
                type="button"
                onClick={() => setZoom(z => Math.min(z + 15, 180))}
                className="p-1 hover:text-white"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
            {formData.pdfUrl ? (
              <iframe
                src={`${formData.pdfUrl}#toolbar=0`}
                className="w-full h-full rounded shadow-md border-0 bg-white"
                style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
                title={formData.fileName}
              />
            ) : (
              <div className="text-slate-400 text-xs">Original PDF document not attached to this session.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
