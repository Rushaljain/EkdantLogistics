import React, { useState, useMemo } from 'react';
import { 
  FileText, 
  Printer, 
  Download, 
  Boxes, 
  Layers, 
  Ship
} from 'lucide-react';
import type { 
  ConvertedInvoice, 
  CustomsPort, 
  AppDocument, 
  ContainerType, 
  MasterFormat
} from '../types';
import { generateMasterBol, printDocument, downloadDocumentHtml } from '../utils/bolGenerator';
import { generateDgDeclaration } from '../utils/dgGenerator';
import { ContainerQcBoard } from './ContainerQcBoard';
import { recalculateContainer, createEmptyContainer } from '../utils/containerAllocator';
import { optimizeContainerAllocation } from '../utils/containerOptimizer';

export type RightPaneViewMode = 'invoices' | 'container_plan' | 'dg' | 'bl';

interface PreviewPaneProps {
  documents: AppDocument[];
  activeDocument: AppDocument | null;
  onSave: (updated: ConvertedInvoice) => void;
  onPortChange: (docId: string, port: CustomsPort) => void;
  masterFormats: MasterFormat[];
  selectedFormatId: string;
  onSelectFormat: (formatId: string) => void;
  activeView: RightPaneViewMode;
  onSelectView: (view: RightPaneViewMode) => void;
  onOpenKeyModal?: () => void;
}

export const PreviewPane: React.FC<PreviewPaneProps> = ({
  documents,
  activeDocument,
  onSave,
  onPortChange: _onPortChange,
  masterFormats,
  selectedFormatId,
  onSelectFormat,
  activeView,
  onSelectView,
  onOpenKeyModal: _onOpenKeyModal
}) => {
  // If active invoice is present, use it; otherwise find first processed doc
  const activeInvoice = activeDocument?.invoice || documents.find(d => d.invoice)?.invoice || null;

  // Local state for interactive editing within active invoice
  const [formData, setFormData] = useState<ConvertedInvoice | null>(activeInvoice);
  const prevInvoiceIdRef = React.useRef<string | null>(null);

  // Synchronize formData when activeInvoice or selected document changes
  React.useEffect(() => {
    if (activeInvoice && prevInvoiceIdRef.current !== `${activeInvoice.id}-${activeInvoice.rawTimestamp}`) {
      prevInvoiceIdRef.current = `${activeInvoice.id}-${activeInvoice.rawTimestamp}`;
      setFormData(activeInvoice);
    }
  }, [activeInvoice]);

  // Generate Master BOL and DG outputs based on selected master format
  const generatedBol = useMemo(() => {
    if (!formData) return null;
    return generateMasterBol(formData, selectedFormatId);
  }, [formData, selectedFormatId]);

  const generatedDg = useMemo(() => {
    if (!formData) return null;
    return generateDgDeclaration(formData, selectedFormatId);
  }, [formData, selectedFormatId]);

  // Container update handlers for ContainerQcBoard
  const handleUpdateContainers = (updatedContainers: ConvertedInvoice['containers'], updatedPallets: ConvertedInvoice['pallets']) => {
    if (!formData) return;
    const updatedGross = updatedContainers.reduce((s, c) => s + c.totalGrossWeightKg, 0);
    const updatedNet = updatedContainers.reduce((s, c) => s + c.totalNetWeightKg, 0);
    const updatedPkgs = updatedContainers.reduce((s, c) => s + c.totalPackages, 0);

    const updated: ConvertedInvoice = {
      ...formData,
      containers: updatedContainers,
      pallets: updatedPallets,
      grossWeightKg: updatedGross,
      netWeightKg: updatedNet,
      totalPackages: updatedPkgs,
      totalPallets: updatedPallets.length
    };

    setFormData(updated);
    onSave(updated);
  };

  const handleAddContainer = (type: ContainerType) => {
    if (!formData) return;
    const newCont = createEmptyContainer(type, formData.containers.length + 1);
    const updatedContainers = [...formData.containers, newCont];
    const updated: ConvertedInvoice = {
      ...formData,
      containers: updatedContainers
    };
    setFormData(updated);
    onSave(updated);
  };

  const handleDeleteContainer = (contId: string) => {
    if (!formData || formData.containers.length <= 1) return;
    const contToDelete = formData.containers.find(c => c.id === contId);
    if (!contToDelete) return;

    const remainingContainers = formData.containers.filter(c => c.id !== contId);
    const targetCont = remainingContainers[0];

    const reallocatedPallets = formData.pallets.map(p => {
      if (p.assignedContainerId === contId) {
        return { ...p, assignedContainerId: targetCont.id };
      }
      return p;
    });

    const refreshedContainers = remainingContainers.map(c => {
      const assigned = reallocatedPallets.filter(p => p.assignedContainerId === c.id);
      return recalculateContainer({ ...c, pallets: assigned, assignedPalletIds: assigned.map(p => p.id) });
    });

    const updated: ConvertedInvoice = {
      ...formData,
      containers: refreshedContainers,
      pallets: reallocatedPallets
    };

    setFormData(updated);
    onSave(updated);
  };

  const handleContainerTypeChange = (contId: string, newType: ContainerType) => {
    if (!formData) return;
    const updatedContainers = formData.containers.map(c => {
      if (c.id !== contId) return c;
      const modified = { ...c, containerType: newType };
      return recalculateContainer(modified);
    });
    const updated: ConvertedInvoice = {
      ...formData,
      containers: updatedContainers
    };
    setFormData(updated);
    onSave(updated);
  };

  const handleContainerFieldChange = (contId: string, field: 'containerNumber' | 'sealNumber', val: string) => {
    if (!formData) return;
    const updatedContainers = formData.containers.map(c => {
      if (c.id !== contId) return c;
      return { ...c, [field]: val.toUpperCase().trim() };
    });
    const updated: ConvertedInvoice = {
      ...formData,
      containers: updatedContainers
    };
    setFormData(updated);
    onSave(updated);
  };

  const handleAutoReallocate = (targetType: ContainerType = '20GP') => {
    if (!formData) return;
    const optimized = optimizeContainerAllocation(formData.lineItems, formData.pallets, {
      preferredContainerType: targetType
    });
    const updated: ConvertedInvoice = {
      ...formData,
      containers: optimized.containers,
      pallets: optimized.pallets
    };
    setFormData(updated);
    onSave(updated);
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-white overflow-hidden select-none">
      {/* =========================================================================
          TOP UNIFIED HEADER: VIEW SELECTOR DROPDOWN + MASTER FORMAT SELECTOR
         ========================================================================= */}
      <div className="h-14 px-5 bg-white border-b border-zinc-200 flex items-center justify-between shrink-0 gap-3 select-none">
        {/* Left: View Selector + Master Format Selector */}
        <div className="flex items-center space-x-3">
          {/* 1. View Selector Dropdown */}
          <div className="flex items-center space-x-1.5">
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
              View:
            </span>
            <select
              value={activeView}
              onChange={(e) => onSelectView(e.target.value as RightPaneViewMode)}
              className="text-xs font-semibold bg-white text-zinc-900 border border-zinc-200 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer hover:bg-zinc-50 shadow-2xs"
            >
              <option value="invoices">View Invoices ({documents.length})</option>
              <option value="container_plan">Container Plan</option>
              <option value="dg">View DG</option>
              <option value="bl">View BL</option>
            </select>
          </div>

          {/* 2. Output Format Selector Dropdown */}
          <div className="flex items-center space-x-1.5">
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
              Master Format:
            </span>
            <select
              value={selectedFormatId}
              onChange={(e) => onSelectFormat(e.target.value)}
              className="text-xs font-medium bg-white text-zinc-900 border border-zinc-200 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer hover:bg-zinc-50 shadow-2xs max-w-[260px] truncate"
              title="Select Master BL & #DG layout format"
            >
              {masterFormats.map(fmt => (
                <option key={fmt.id} value={fmt.id}>
                  {fmt.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Inline Action Buttons Pinned to Right End */}
        <div className="flex items-center space-x-2">
          {activeView === 'dg' && generatedDg && (
            <>
              <button
                type="button"
                onClick={() => printDocument(generatedDg.formattedHtml)}
                className="p-1.5 border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 rounded-lg transition-colors cursor-pointer"
                title="Print DG Declaration"
              >
                <Printer className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => downloadDocumentHtml(generatedDg)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                title="Download DG Declaration HTML"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download DG</span>
              </button>
            </>
          )}

          {activeView === 'bl' && generatedBol && (
            <>
              <button
                type="button"
                onClick={() => printDocument(generatedBol.formattedHtml)}
                className="p-1.5 border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 rounded-lg transition-colors cursor-pointer"
                title="Print Master BOL"
              >
                <Printer className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => downloadDocumentHtml(generatedBol)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                title="Download Master BOL HTML"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download BL</span>
              </button>
            </>
          )}

          {activeView === 'container_plan' && formData && (
            <div className="flex items-center space-x-2 text-xs font-mono text-zinc-500">
              <span className="px-2 py-1 bg-zinc-100 rounded border border-zinc-200">
                {formData.containers.length} Container{formData.containers.length > 1 ? 's' : ''}
              </span>
              <span className="px-2 py-1 bg-zinc-100 rounded border border-zinc-200">
                {formData.pallets.length} Pallets
              </span>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          VIEW 1: VIEW INVOICES (VERTICAL SCROLLING CAROUSEL OF ALL DOCUMENTS)
         ========================================================================= */}
      {activeView === 'invoices' && (
        <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-zinc-50/50">
          {documents.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 text-zinc-400">
              <FileText className="w-10 h-10 mb-2 text-zinc-300" />
              <p className="text-xs font-medium text-zinc-600">No documents uploaded yet</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">Drop .pdf, .xlsx, or .csv files in the left panel</p>
            </div>
          ) : (
            documents.map((doc, idx) => {
              const isSpreadsheet = /\.xlsx$|\.xls$|\.csv$/i.test(doc.fileName);
              return (
                <div 
                  key={doc.id}
                  className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs"
                >
                  {/* Document Card Header */}
                  <div className="px-4 py-3 bg-white border-b border-zinc-200 flex items-center justify-between">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <span className="w-5 h-5 rounded bg-zinc-100 border border-zinc-200 text-zinc-700 text-[10px] font-mono font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-zinc-900 block truncate" title={doc.fileName}>
                          {doc.fileName}
                        </span>
                        <div className="flex items-center space-x-2 text-[10px] text-zinc-400 font-mono mt-0.5">
                          <span>{(doc.fileSize / 1024).toFixed(1)} KB</span>
                          <span>•</span>
                          <span className="uppercase">{isSpreadsheet ? 'Spreadsheet' : 'PDF Document'}</span>
                          <span>•</span>
                          <span className="capitalize">{doc.status}</span>
                        </div>
                      </div>
                    </div>

                    {doc.invoice && (
                      <div className="flex items-center space-x-2 text-[10.5px] font-mono shrink-0">
                        <span className="px-2 py-0.5 bg-zinc-100 rounded text-zinc-700 border border-zinc-200">
                          Inv: {doc.invoice.invoiceNumber}
                        </span>
                        <span className="px-2 py-0.5 bg-zinc-100 rounded text-zinc-700 border border-zinc-200">
                          Gross: {doc.invoice.grossWeightKg.toLocaleString()} kg
                        </span>
                        <span className="px-2 py-0.5 bg-zinc-100 rounded text-zinc-700 border border-zinc-200">
                          {doc.invoice.totalPallets} Plts
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Document Content View */}
                  <div className="bg-zinc-50">
                    {doc.previewHtml ? (
                      <div 
                        className="p-4 max-h-[550px] overflow-auto bg-white"
                        dangerouslySetInnerHTML={{ __html: doc.previewHtml }}
                      />
                    ) : doc.pdfUrl ? (
                      <iframe
                        src={`${doc.pdfUrl}#toolbar=0`}
                        className="w-full h-[600px] border-0 bg-white"
                        title={doc.fileName}
                      />
                    ) : (
                      <div className="p-8 text-center text-xs text-zinc-400 bg-white">
                        <FileText className="w-6 h-6 mx-auto mb-1 text-zinc-300" />
                        <span>Document staged for conversion. Click &ldquo;Convert to Output&rdquo; in the left panel.</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* =========================================================================
          VIEW 2: CONTAINER PLAN (CONTAINER TABLE & DRAG-AND-DROP QC BOARD)
         ========================================================================= */}
      {activeView === 'container_plan' && (
        <div className="flex-1 flex flex-col overflow-hidden bg-zinc-50/50">
          {formData && formData.containers.length > 0 ? (
            <ContainerQcBoard
              containers={formData.containers}
              pallets={formData.pallets}
              lineItems={formData.lineItems}
              hasDangerousGoods={formData.hasDangerousGoods}
              onUpdateContainers={handleUpdateContainers}
              onAutoReallocate={handleAutoReallocate}
              onAddContainer={handleAddContainer}
              onDeleteContainer={handleDeleteContainer}
              onContainerTypeChange={handleContainerTypeChange}
              onContainerFieldChange={handleContainerFieldChange}
              onLockAndGenerate={() => onSelectView('dg')}
              onQuickDownloadBol={() => {
                if (generatedBol) downloadDocumentHtml(generatedBol);
              }}
              onQuickDownloadDg={() => {
                if (generatedDg) downloadDocumentHtml(generatedDg);
              }}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 text-zinc-400">
              <Boxes className="w-10 h-10 mb-2 text-zinc-300" />
              <h3 className="text-xs font-semibold text-zinc-800">No Active Container Plan</h3>
              <p className="text-[11px] text-zinc-400 mt-1 max-w-sm">
                Click <strong className="text-zinc-700">&ldquo;Convert to Output&rdquo;</strong> in the left panel to execute the LAFF solver and populate container allocations.
              </p>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          VIEW 3: VIEW DG (IMO MULTIMODAL DANGEROUS GOODS DECLARATION)
         ========================================================================= */}
      {activeView === 'dg' && (
        <div className="flex-1 overflow-auto p-6 flex justify-center bg-zinc-100/60">
          {generatedDg ? (
            <div 
              className="bg-white rounded-xl shadow-xs border border-zinc-200 overflow-hidden w-full max-w-4xl"
              dangerouslySetInnerHTML={{ __html: generatedDg.formattedHtml }}
            />
          ) : (
            <div className="text-center py-24 text-zinc-400 text-xs">
              <Ship className="w-8 h-8 mx-auto mb-2 text-zinc-300" />
              <span>Process your shipment to view Dangerous Goods Declaration.</span>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          VIEW 4: VIEW BL (MASTER BILL OF LADING)
         ========================================================================= */}
      {activeView === 'bl' && (
        <div className="flex-1 overflow-auto p-6 flex justify-center bg-zinc-100/60">
          {generatedBol ? (
            <div 
              className="bg-white rounded-xl shadow-xs border border-zinc-200 overflow-hidden w-full max-w-4xl"
              dangerouslySetInnerHTML={{ __html: generatedBol.formattedHtml }}
            />
          ) : (
            <div className="text-center py-24 text-zinc-400 text-xs">
              <Layers className="w-8 h-8 mx-auto mb-2 text-zinc-300" />
              <span>Process your shipment to view Master Bill of Lading.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
