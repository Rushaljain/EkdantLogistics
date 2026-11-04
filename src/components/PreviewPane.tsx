import React, { useState, useMemo } from 'react';
import { 
  FileText, 
  Printer, 
  Download, 
  Boxes, 
  Layers, 
  Ship,
  RefreshCw,
  Plus,
  FileSpreadsheet,
  Eye,
  X,
  ExternalLink
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
import { ShipmentManifestPane } from './ShipmentManifestPane';
import { recalculateContainer, createEmptyContainer } from '../utils/containerAllocator';
import { optimizeContainerAllocation } from '../utils/containerOptimizer';
import { reconcileShipment } from '../utils/reconciliationEngine';

export type RightPaneViewMode = 'invoices' | 'container_plan' | 'manifest' | 'dg' | 'bl';

interface PreviewPaneProps {
  documents: AppDocument[];
  activeDocument: AppDocument | null;
  activeInvoice?: ConvertedInvoice | null;
  consolidatedInvoice?: ConvertedInvoice | null;
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
  activeInvoice: propActiveInvoice,
  consolidatedInvoice: _consolidatedInvoice,
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
  const activeInvoice = propActiveInvoice !== undefined 
    ? propActiveInvoice 
    : (activeDocument?.invoice || _consolidatedInvoice || documents.find(d => d.invoice)?.invoice || null);

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
    return generateMasterBol(formData, selectedFormatId, masterFormats);
  }, [formData, selectedFormatId, masterFormats]);

  const generatedDg = useMemo(() => {
    if (!formData) return null;
    return generateDgDeclaration(formData, selectedFormatId, masterFormats);
  }, [formData, selectedFormatId, masterFormats]);

  // Document preview & download modal state
  const [viewingPdfDoc, setViewingPdfDoc] = useState<AppDocument | null>(null);

  const handleDownloadDocument = (doc: AppDocument) => {
    if (doc.file) {
      const url = URL.createObjectURL(doc.file);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else if (doc.pdfUrl) {
      const a = document.createElement('a');
      a.href = doc.pdfUrl;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (doc.previewHtml) {
      const blob = new Blob([doc.previewHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.fileName}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const handleViewPdf = (doc: AppDocument) => {
    setViewingPdfDoc(doc);
  };

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
    <div className="flex-1 min-h-0 h-full flex flex-col bg-white overflow-hidden">
      {/* =========================================================================
          TOP UNIFIED HEADER: VIEW SELECTOR DROPDOWN + MASTER FORMAT SELECTOR
         ========================================================================= */}
      <div className="h-12 px-5 bg-white border-b border-zinc-200 flex items-center justify-between shrink-0 gap-3 select-none">
        {/* Left: View Selector + Master Format Selector */}
        <div className="flex items-center space-x-3 min-w-0">
          {/* 1. View Selector Dropdown */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <span className="text-[10px] font-mono font-medium text-zinc-400 uppercase tracking-wider">
              View:
            </span>
            <select
              value={activeView}
              onChange={(e) => onSelectView(e.target.value as RightPaneViewMode)}
              className="text-xs font-semibold bg-white text-zinc-900 border border-zinc-200 rounded-lg px-2.5 py-1 outline-none cursor-pointer hover:bg-zinc-50 shadow-2xs"
            >
              <option value="invoices">View Invoices ({documents.length})</option>
              <option value="container_plan">Container Plan</option>
              <option value="manifest">Shipment & Manifest</option>
              <option value="dg">View DG</option>
              <option value="bl">View BL</option>
            </select>
          </div>

          {/* 2. Output Format Selector Dropdown */}
          <div className="flex items-center space-x-1.5 min-w-0">
            <span className="text-[10px] font-mono font-medium text-zinc-400 uppercase tracking-wider shrink-0">
              Format:
            </span>
            <select
              value={selectedFormatId}
              onChange={(e) => onSelectFormat(e.target.value)}
              className="text-xs font-medium bg-white text-zinc-900 border border-zinc-200 rounded-lg px-2.5 py-1 outline-none cursor-pointer hover:bg-zinc-50 shadow-2xs max-w-[240px] truncate"
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
                onClick={() => {
                  if (formData) {
                    const recon = reconcileShipment(formData);
                    if (!recon.isValid) {
                      alert(`Cannot download DG: Numerical reconciliation discrepancy detected.\n\n${recon.errors.join('\n')}`);
                      return;
                    }
                  }
                  downloadDocumentHtml(generatedDg);
                }}
                className="inline-flex items-center space-x-1.5 px-3 py-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
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
                onClick={() => {
                  if (formData) {
                    const recon = reconcileShipment(formData);
                    if (!recon.isValid) {
                      alert(`Cannot download BL: Numerical reconciliation discrepancy detected.\n\n${recon.errors.join('\n')}`);
                      return;
                    }
                  }
                  downloadDocumentHtml(generatedBol);
                }}
                className="inline-flex items-center space-x-1.5 px-3 py-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                title="Download Master BOL HTML"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download BL</span>
              </button>
            </>
          )}

          {activeView === 'container_plan' && formData && (
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => handleAutoReallocate('20GP')}
                className="px-2.5 py-1 rounded-md text-xs font-medium border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title="Reset & Re-run 20' LAFF Optimizer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-zinc-500" />
                <span>Reset to LAFF Optimal</span>
              </button>

              <button
                type="button"
                onClick={() => handleAddContainer('20GP')}
                className="px-2.5 py-1 rounded-md text-xs font-medium border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5 text-zinc-500" />
                <span>Add Container</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          VIEW 1: VIEW INVOICES (CLEAN 5-COLUMN GRID VIEW)
         ========================================================================= */}
      {activeView === 'invoices' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-5 bg-zinc-50/50">
          {documents.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 text-zinc-400">
              <FileText className="w-8 h-8 mb-2 text-zinc-300" />
              <p className="text-xs font-medium text-zinc-600">No invoices uploaded yet</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">Drop .pdf, .xlsx, or .csv files in the left panel</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
              {documents.map((doc) => {
                const isSpreadsheet = /\.xlsx$|\.xls$|\.csv$/i.test(doc.fileName);
                return (
                  <div
                    key={doc.id}
                    className="bg-white border border-zinc-200 rounded-xl p-3.5 flex flex-col justify-between hover:border-zinc-300 transition-all shadow-2xs group min-h-[145px]"
                  >
                    {/* Top: Icon + Badge + Name */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isSpreadsheet 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' 
                            : 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                        }`}>
                          {isSpreadsheet ? (
                            <FileSpreadsheet className="w-4 h-4" />
                          ) : (
                            <FileText className="w-4 h-4" />
                          )}
                        </div>

                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200 uppercase font-medium">
                          {isSpreadsheet ? 'Excel' : 'PDF'}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <h4 
                          className="text-xs font-semibold text-zinc-900 line-clamp-2 leading-snug break-words" 
                          title={doc.fileName}
                        >
                          {doc.fileName}
                        </h4>
                        <span className="text-[10.5px] text-zinc-400 font-mono mt-1 block">
                          {(doc.fileSize / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    </div>

                    {/* Bottom: Action Buttons */}
                    <div className="pt-2.5 border-t border-zinc-100 mt-2.5">
                      {isSpreadsheet ? (
                        <button
                          type="button"
                          onClick={() => handleDownloadDocument(doc)}
                          className="w-full inline-flex items-center justify-center space-x-1.5 py-1.5 px-2.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white shadow-2xs transition-colors cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download</span>
                        </button>
                      ) : (
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleViewPdf(doc)}
                            className="inline-flex items-center justify-center space-x-1 py-1.5 px-2 rounded-lg text-xs font-medium border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-zinc-500" />
                            <span>View</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDownloadDocument(doc)}
                            className="inline-flex items-center justify-center space-x-1 py-1.5 px-2 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white shadow-2xs transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          VIEW 2: CONTAINER PLAN (CONTAINER TABLE & DRAG-AND-DROP QC BOARD)
         ========================================================================= */}
      {activeView === 'container_plan' && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-zinc-50/50">
          {formData && formData.containers.length > 0 ? (
            <ContainerQcBoard
              containers={formData.containers}
              pallets={formData.pallets}
              lineItems={formData.lineItems}
              hasDangerousGoods={formData.hasDangerousGoods}
              invoice={formData}
              rawDocumentText={activeDocument?.previewHtml || ''}
              onUpdateContainers={handleUpdateContainers}
              onAutoReallocate={handleAutoReallocate}
              onAddContainer={handleAddContainer}
              onDeleteContainer={handleDeleteContainer}
              onContainerTypeChange={handleContainerTypeChange}
              onContainerFieldChange={handleContainerFieldChange}
              onUpdateInvoice={(updated: ConvertedInvoice) => {
                setFormData(updated);
                onSave(updated);
              }}
              onLockAndGenerate={() => {
                const recon = reconcileShipment(formData);
                if (!recon.isValid) {
                  alert(`Cannot lock plan: Discrepancy detected.\n\n${recon.errors[0]}`);
                  return;
                }
                onSelectView('dg');
              }}
              onQuickDownloadBol={() => {
                if (generatedBol) {
                  const recon = reconcileShipment(formData);
                  if (!recon.isValid) {
                    alert(`Cannot download BL: ${recon.errors[0]}`);
                    return;
                  }
                  downloadDocumentHtml(generatedBol);
                }
              }}
              onQuickDownloadDg={() => {
                if (generatedDg) {
                  const recon = reconcileShipment(formData);
                  if (!recon.isValid) {
                    alert(`Cannot download DG: ${recon.errors[0]}`);
                    return;
                  }
                  downloadDocumentHtml(generatedDg);
                }
              }}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 text-zinc-400">
              <Boxes className="w-10 h-10 mb-2 text-zinc-300" />
              <h3 className="text-xs font-semibold text-zinc-800">No Active Container Plan</h3>
              <p className="text-[11px] text-zinc-400 mt-1 max-w-sm">
                Click <strong className="text-zinc-700">&ldquo;Process Invoices&rdquo;</strong> in the left panel to execute the LAFF solver and populate container allocations.
              </p>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          VIEW: SHIPMENT & CARRIER MANIFEST
         ========================================================================= */}
      {activeView === 'manifest' && (
        formData ? (
          <ShipmentManifestPane
            invoice={formData}
            onUpdateInvoice={(updated: ConvertedInvoice) => {
              setFormData(updated);
              onSave(updated);
            }}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-12 text-zinc-400">
            <Boxes className="w-10 h-10 mb-2 text-zinc-300" />
            <h3 className="text-xs font-semibold text-zinc-800">No Active Shipment Manifest</h3>
            <p className="text-[11px] text-zinc-400 mt-1 max-w-sm">
              Process your shipment invoices in the left panel to populate and edit manifest fields.
            </p>
          </div>
        )
      )}

      {/* =========================================================================
          VIEW 3: VIEW DG (IMO MULTIMODAL DANGEROUS GOODS DECLARATION)
         ========================================================================= */}
      {activeView === 'dg' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-zinc-100/60">
          {generatedDg ? (
            <div className="w-full max-w-4xl mx-auto bg-white rounded-xl shadow-xs border border-zinc-200 overflow-visible pb-16 mb-24">
              <div 
                dangerouslySetInnerHTML={{ __html: generatedDg.formattedHtml }}
              />
            </div>
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
        <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-zinc-100/60">
          {generatedBol ? (
            <div className="w-full max-w-4xl mx-auto bg-white rounded-xl shadow-xs border border-zinc-200 overflow-visible pb-16 mb-24">
              <div 
                dangerouslySetInnerHTML={{ __html: generatedBol.formattedHtml }}
              />
            </div>
          ) : (
            <div className="text-center py-24 text-zinc-400 text-xs">
              <Layers className="w-8 h-8 mx-auto mb-2 text-zinc-300" />
              <span>Process your shipment to view Master Bill of Lading.</span>
            </div>
          )}
        </div>
      )}
      {/* =========================================================================
          PDF DOCUMENT PREVIEW MODAL
         ========================================================================= */}
      {viewingPdfDoc && (
        <div 
          className="fixed inset-0 z-50 bg-zinc-900/50 backdrop-blur-xs flex items-center justify-center p-4 select-none"
          onClick={() => setViewingPdfDoc(null)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="h-12 px-5 border-b border-zinc-200 flex items-center justify-between shrink-0 bg-white">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-700">
                  <FileText className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold text-zinc-900 truncate max-w-md">
                  {viewingPdfDoc.fileName}
                </span>
                <span className="text-[10px] font-mono text-zinc-400">
                  ({(viewingPdfDoc.fileSize / 1024).toFixed(1)} KB)
                </span>
              </div>

              <div className="flex items-center space-x-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const url = viewingPdfDoc.pdfUrl || (viewingPdfDoc.file ? URL.createObjectURL(viewingPdfDoc.file) : undefined);
                    if (url) window.open(url, '_blank');
                  }}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                  title="Open in new window"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadDocument(viewingPdfDoc)}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg transition-colors cursor-pointer shadow-2xs"
                  title="Download PDF"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>

                <div className="h-4 w-px bg-zinc-200 mx-1" />

                <button
                  type="button"
                  onClick={() => setViewingPdfDoc(null)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                  title="Close preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body: Embedded PDF or Preview */}
            <div className="flex-1 min-h-0 bg-zinc-100 overflow-hidden relative">
              {viewingPdfDoc.pdfUrl || viewingPdfDoc.file ? (
                <iframe
                  src={`${viewingPdfDoc.pdfUrl || URL.createObjectURL(viewingPdfDoc.file!)}#toolbar=1`}
                  className="w-full h-full border-0 bg-white"
                  title={viewingPdfDoc.fileName}
                />
              ) : viewingPdfDoc.previewHtml ? (
                <div 
                  className="w-full h-full overflow-auto p-6 bg-white"
                  dangerouslySetInnerHTML={{ __html: viewingPdfDoc.previewHtml }}
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-zinc-400 text-xs">
                  <FileText className="w-8 h-8 mb-2 text-zinc-300" />
                  <span>Preview not available for this file.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
