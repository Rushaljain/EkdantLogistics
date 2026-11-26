import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Boxes,
  FileText,
  FileSpreadsheet,
  Table as TableIcon,
  Package,
  Printer,
  Download,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Save
} from 'lucide-react';
import type {
  ExtractedShipmentJSON,
  FormatSchemaJSON,
  MappedManifestField,
  FormatDocumentType
} from '../types/index.ts';
import { DgDocumentCanvas } from './DgDocumentCanvas.tsx';
import { BlDocumentCanvas } from './BlDocumentCanvas.tsx';
import { ContainerBayWorkspace } from './ContainerBayWorkspace.tsx';
import { DateInput } from './DateInput.tsx';
import { synthesizePalletRanges } from '../utils/manifestKeywordReference.ts';
import { syncStage2FieldsToLedger, executeWorkspaceDispatch, formatToDDMMYYYY, markLedgerDocumentCreated } from '../utils/inventoryStore.ts';
import { InventoryStockSelector } from './InventoryStockSelector.tsx';

export type WorkspaceTab = 'dg_manifest' | 'bl_manifest' | 'container_bay' | 'extracted_data' | 'export_center';

interface WorkspacePageProps {
  shipmentJson: ExtractedShipmentJSON;
  onUpdateShipment: (updated: ExtractedShipmentJSON) => void;
  activeDgFormat: FormatSchemaJSON;
  activeBlFormat: FormatSchemaJSON;
  dgFormats: FormatSchemaJSON[];
  blFormats: FormatSchemaJSON[];
  selectedDgFormatId: string;
  selectedBlFormatId: string;
  onSelectDgFormat: (id: string) => void;
  onSelectBlFormat: (id: string) => void;
  onOpenFormatLibrary: (docType?: FormatDocumentType) => void;

  mappedDgFields: MappedManifestField[];
  mappedBlFields: MappedManifestField[];
  dgStats: { populated: number; total: number; percentage: number };
  blStats: { populated: number; total: number; percentage: number };
  onFieldChange: (field: MappedManifestField, docType: FormatDocumentType, newValue: string) => void;
  dgCustomOverrides?: Record<string, string>;
  blCustomOverrides?: Record<string, string>;

  // Header & Modal Actions
  onOpenContainerModal: () => void;
  onNewUpload: () => void;
  onSaveWork?: () => void;
  onHardReset: () => void;
  isPurging: boolean;
  onOpenApiKeyModal: () => void;
  hasCustomKey: boolean;
  onOpenInventory?: () => void;

  // Export actions
  onPrintPdf: (docType: FormatDocumentType) => void;
  onDownloadDocx: (docType: FormatDocumentType, overrideShipment?: ExtractedShipmentJSON) => void;
  onDownloadHtml: (docType: FormatDocumentType) => void;
  onDownloadJson: (data: any, filename: string) => void;
  onDownloadZip: () => void;
  isExportingZip: boolean;
}

export function WorkspacePage({
  shipmentJson,
  onUpdateShipment,
  activeDgFormat: _activeDgFormat,
  activeBlFormat: _activeBlFormat,
  dgFormats,
  blFormats,
  selectedDgFormatId,
  selectedBlFormatId,
  onSelectDgFormat,
  onSelectBlFormat,
  onOpenFormatLibrary: _onOpenFormatLibrary,
  mappedDgFields,
  mappedBlFields,
  dgStats,
  blStats,
  onFieldChange,
  dgCustomOverrides,
  blCustomOverrides,
  onOpenContainerModal: _onOpenContainerModal,
  onNewUpload: _onNewUpload,
  onSaveWork,
  onHardReset,
  isPurging,
  onOpenApiKeyModal: _onOpenApiKeyModal,
  hasCustomKey: _hasCustomKey,
  onOpenInventory,
  onPrintPdf,
  onDownloadDocx,
  onDownloadHtml,
  onDownloadJson,
  onDownloadZip,
  isExportingZip
}: WorkspacePageProps): React.JSX.Element {
  // Primary view switcher state: 'extracted_data' | 'dg_manifest' | 'bl_manifest' | 'export_center'
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('dg_manifest');

  // Sub-tabs in Extracted Data view: 'audit' | 'pallets' | 'raw_json'
  const [dataSubTab, setDataSubTab] = useState<'audit' | 'pallets' | 'raw_json'>('pallets');

  const [copiedJson, setCopiedJson] = useState(false);

  // Synchronize handler for container bay
  const containerSyncRef = useRef<(() => void) | null>(null);
  const [hasContainerSynced, setHasContainerSynced] = useState(false);

  const handleContainerSync = () => {
    if (containerSyncRef.current) {
      containerSyncRef.current();
      syncStage2FieldsToLedger(shipmentJson);
      setHasContainerSynced(true);
      setTimeout(() => setHasContainerSynced(false), 3000);
    }
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(shipmentJson, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const calculatedVgm = (shipmentJson.grossWeightKg || 0) + (shipmentJson.tareWeightKg || 0);

  // Sprint 6: Invoice Selection Modal & Closed-Loop Dispatch
  const [showInvoiceSelectorModal, setShowInvoiceSelectorModal] = useState(false);
  const [showDispatchConfirmModal, setShowDispatchConfirmModal] = useState(false);
  const [dispatchToast, setDispatchToast] = useState<string | null>(null);

  // Pending export action to resume immediately once container specifications are confirmed
  const [pendingExport, setPendingExport] = useState<{
    actionType: 'PRINT_PDF' | 'DOWNLOAD_DOCX' | 'DOWNLOAD_HTML' | 'DOWNLOAD_ZIP';
    docType?: FormatDocumentType;
    overrideShipment?: ExtractedShipmentJSON;
  } | null>(null);

  const [dispatchDetails, setDispatchDetails] = useState(() => {
    const today = formatToDDMMYYYY(new Date());
    const vName = shipmentJson.vesselName || '';
    const vVoy = shipmentJson.voyageNumber || '';
    const vComb = vName ? (vVoy ? `${vName} / ${vVoy}` : vName) : '';
    return {
      containerNo: (shipmentJson.containerNumber && !shipmentJson.containerNumber.startsWith('Container ') ? shipmentJson.containerNumber : '') || shipmentJson.containers?.[0]?.containerNumber || '',
      sealNo: (shipmentJson.sealNumber !== '---' ? shipmentJson.sealNumber : '') || shipmentJson.containers?.[0]?.sealNumber || '',
      bookingNumber: shipmentJson.bookingNumber || '',
      forwarderReference: shipmentJson.forwarderReference || '',
      carrierName: shipmentJson.carrierName || '',
      vesselVoyage: vComb,
      additionalHandlingInfo: (shipmentJson as any).additionalHandlingInformation || shipmentJson.emergencyContactPhone || '',
      shippingBillNo: shipmentJson.shippingBillNumbers || '',
      shippingBillDate: shipmentJson.invoiceDates?.[0] || today,
      stuffingDate: today,
      portGateInDate: today,
      vehicleNo: ''
    };
  });

  // Standalone Document Creation tracking (DG / BL)
  const handlePrintPdf = (docType: FormatDocumentType) => {
    if (shipmentJson.sourceLedgerIds && shipmentJson.sourceLedgerIds.length > 0) {
      markLedgerDocumentCreated(shipmentJson.sourceLedgerIds, docType);
    }
    onPrintPdf(docType);
  };

  const handleDownloadDocx = (docType: FormatDocumentType, overrideShipment?: ExtractedShipmentJSON) => {
    if (shipmentJson.sourceLedgerIds && shipmentJson.sourceLedgerIds.length > 0) {
      markLedgerDocumentCreated(shipmentJson.sourceLedgerIds, docType);
    }
    onDownloadDocx(docType, overrideShipment);
  };

  const handleDownloadHtml = (docType: FormatDocumentType) => {
    if (shipmentJson.sourceLedgerIds && shipmentJson.sourceLedgerIds.length > 0) {
      markLedgerDocumentCreated(shipmentJson.sourceLedgerIds, docType);
    }
    onDownloadHtml(docType);
  };

  const handleDownloadZip = () => {
    if (shipmentJson.sourceLedgerIds && shipmentJson.sourceLedgerIds.length > 0) {
      markLedgerDocumentCreated(shipmentJson.sourceLedgerIds, 'DG');
      markLedgerDocumentCreated(shipmentJson.sourceLedgerIds, 'BL');
    }
    onDownloadZip();
  };

  const executeExportDirectly = (
    actionType: 'PRINT_PDF' | 'DOWNLOAD_DOCX' | 'DOWNLOAD_HTML' | 'DOWNLOAD_ZIP',
    docType?: FormatDocumentType,
    overrideShipment?: ExtractedShipmentJSON
  ) => {
    if (actionType === 'PRINT_PDF' && docType) {
      handlePrintPdf(docType);
    } else if (actionType === 'DOWNLOAD_DOCX' && docType) {
      handleDownloadDocx(docType, overrideShipment);
    } else if (actionType === 'DOWNLOAD_HTML' && docType) {
      handleDownloadHtml(docType);
    } else if (actionType === 'DOWNLOAD_ZIP') {
      handleDownloadZip();
    }
  };

  // Mandatory Container & Transport Specifications Gatekeeper before any BL or DG Download
  const checkContainerSpecsAndExecute = (
    actionType: 'PRINT_PDF' | 'DOWNLOAD_DOCX' | 'DOWNLOAD_HTML' | 'DOWNLOAD_ZIP',
    docType?: FormatDocumentType,
    overrideShipment?: ExtractedShipmentJSON
  ) => {
    const targetShipment = overrideShipment || shipmentJson;

    const hasContainerNo = Boolean(
      targetShipment.containerNumber?.trim() &&
      targetShipment.containerNumber !== '---' &&
      !targetShipment.containerNumber.startsWith('Container ')
    );
    const hasSealNo = Boolean(
      targetShipment.sealNumber?.trim() &&
      targetShipment.sealNumber !== '---'
    );
    const hasBookingNo = Boolean(
      targetShipment.bookingNumber?.trim() &&
      targetShipment.bookingNumber !== '---'
    );
    const hasCarrier = Boolean(
      targetShipment.carrierName?.trim() &&
      targetShipment.carrierName !== '---'
    );
    const hasVessel = Boolean(
      targetShipment.vesselName?.trim() &&
      targetShipment.vesselName !== '---'
    );
    const hasForwarder = Boolean(
      targetShipment.forwarderReference?.trim() &&
      targetShipment.forwarderReference !== '---'
    );

    if (!hasContainerNo || !hasSealNo || !hasBookingNo || !hasCarrier || !hasVessel || !hasForwarder) {
      setPendingExport({ actionType, docType, overrideShipment });
      const vName = targetShipment.vesselName || '';
      const vVoy = targetShipment.voyageNumber || '';
      const vComb = vName ? (vVoy ? `${vName} / ${vVoy}` : vName) : '';
      setDispatchDetails((prev) => ({
        ...prev,
        containerNo: (targetShipment.containerNumber && !targetShipment.containerNumber.startsWith('Container ') ? targetShipment.containerNumber : prev.containerNo) || '',
        sealNo: (targetShipment.sealNumber !== '---' ? targetShipment.sealNumber : prev.sealNo) || '',
        bookingNumber: targetShipment.bookingNumber || prev.bookingNumber || '',
        forwarderReference: targetShipment.forwarderReference || prev.forwarderReference || '',
        carrierName: targetShipment.carrierName || prev.carrierName || '',
        vesselVoyage: vComb || prev.vesselVoyage || '',
        additionalHandlingInfo: (targetShipment as any).additionalHandlingInformation || targetShipment.emergencyContactPhone || prev.additionalHandlingInfo || '',
        shippingBillNo: targetShipment.shippingBillNumbers || prev.shippingBillNo || ''
      }));
      setShowDispatchConfirmModal(true);
      return;
    }

    executeExportDirectly(actionType, docType, overrideShipment);
  };

  const handleExecuteWorkspaceDispatch = () => {
    if (!dispatchDetails.containerNo.trim() || !dispatchDetails.sealNo.trim()) {
      alert('Please enter Container Number and Seal Number before proceeding.');
      return;
    }
    if (!dispatchDetails.bookingNumber.trim()) {
      alert('Please enter Transport Document Number: BKG.NO. (Booking No.) before proceeding.');
      return;
    }
    if (!dispatchDetails.carrierName.trim()) {
      alert('Please enter Carrier Name before proceeding.');
      return;
    }
    if (!dispatchDetails.vesselVoyage.trim()) {
      alert('Please enter Vessel and Voyage Number before proceeding.');
      return;
    }
    if (!dispatchDetails.forwarderReference.trim()) {
      alert("Please enter Freight Forwarder's Reference before proceeding.");
      return;
    }

    const vParts = dispatchDetails.vesselVoyage.split('/').map((s) => s.trim());
    const vName = vParts[0] || dispatchDetails.vesselVoyage;
    const vVoy = vParts.length > 1 ? vParts.slice(1).join('/') : (shipmentJson.voyageNumber || '');

    const { stuffedCount } = executeWorkspaceDispatch(shipmentJson, dispatchDetails);
    const updatedContainers = (shipmentJson.containers && shipmentJson.containers.length > 0)
      ? shipmentJson.containers.map((c, i) => i === 0 ? { ...c, containerNumber: dispatchDetails.containerNo, sealNumber: dispatchDetails.sealNo } : c)
      : shipmentJson.containers;

    const updated: ExtractedShipmentJSON = {
      ...shipmentJson,
      containerNumber: dispatchDetails.containerNo,
      sealNumber: dispatchDetails.sealNo,
      bookingNumber: dispatchDetails.bookingNumber,
      carrierName: dispatchDetails.carrierName,
      vesselName: vName,
      voyageNumber: vVoy,
      forwarderReference: dispatchDetails.forwarderReference,
      emergencyContactPhone: dispatchDetails.additionalHandlingInfo || shipmentJson.emergencyContactPhone,
      additionalHandlingInformation: dispatchDetails.additionalHandlingInfo || (shipmentJson as any).additionalHandlingInformation,
      shippingBillNumbers: dispatchDetails.shippingBillNo || shipmentJson.shippingBillNumbers,
      containers: updatedContainers,
      isDispatched: true,
      dispatchedAt: new Date().toISOString()
    };
    onUpdateShipment(updated);
    syncStage2FieldsToLedger(updated);
    setShowDispatchConfirmModal(false);

    const totalUnits = shipmentJson.totalBoxes || 0;
    setDispatchToast(`Specifications saved (${dispatchDetails.containerNo}) & ${totalUnits} units (${stuffedCount} pallets) dispatched!`);
    setTimeout(() => setDispatchToast(null), 4000);

    // If an export was waiting on specifications, trigger it immediately
    if (pendingExport) {
      const pending = pendingExport;
      setPendingExport(null);
      setTimeout(() => {
        const shipmentForExport = (pending.docType === 'DG')
          ? { ...updated, containerNumber: dispatchDetails.containerNo, sealNumber: dispatchDetails.sealNo }
          : updated;
        executeExportDirectly(pending.actionType, pending.docType, shipmentForExport);
      }, 150);
    }
  };

  // Stage-2 Pending Fields Tracking & Instant Cycling
  const pendingStage2DgKeys = useMemo(() => {
    const pending: string[] = [];
    if (!shipmentJson.bookingNumber?.trim()) pending.push('bookingNumber');
    if (!shipmentJson.carrierName?.trim()) pending.push('carrierName');
    if (!shipmentJson.vesselName?.trim() || !shipmentJson.voyageNumber?.trim()) pending.push('vesselVoyage');
    if (!shipmentJson.containerNumber?.trim()) pending.push('containerNumber');
    if (!shipmentJson.sealNumber?.trim()) pending.push('sealNumber');
    if (!shipmentJson.tareWeightKg || shipmentJson.tareWeightKg === 0) pending.push('tareWeightKg');
    if (!shipmentJson.emergencyContactPhone?.trim()) pending.push('emergencyContactPhone');
    return pending;
  }, [shipmentJson]);

  const pendingStage2BlKeys = useMemo(() => {
    const pending: string[] = [];
    if (!shipmentJson.bookingNumber?.trim()) pending.push('bookingNumber');
    if (!shipmentJson.carrierName?.trim()) pending.push('carrierName');
    if (!shipmentJson.vesselName?.trim() || !shipmentJson.voyageNumber?.trim()) pending.push('vesselVoyage');
    if (!shipmentJson.containerNumber?.trim()) pending.push('containerNumber');
    if (!shipmentJson.sealNumber?.trim()) pending.push('sealNumber');
    if (!shipmentJson.tareWeightKg || shipmentJson.tareWeightKg === 0) pending.push('tareWeightKg');
    if (!shipmentJson.shippingBillNumbers?.trim()) pending.push('shippingBillNumbers');
    const freeTimeVal = shipmentJson.freeTimeClause || blCustomOverrides?.['free_time_clause'] || blCustomOverrides?.['bl_free_time'] || '14 DAYS DETENTION FREE AT DESTINATION';
    if (!freeTimeVal?.trim()) pending.push('freeTimeClause');
    return pending;
  }, [shipmentJson, blCustomOverrides]);

  const [stage2JumpIdx, setStage2JumpIdx] = useState(0);

  const handleJumpToNextPending = () => {
    const activePending = activeTab === 'dg_manifest' ? pendingStage2DgKeys : pendingStage2BlKeys;
    if (activePending.length === 0) return;
    const nextIdx = (stage2JumpIdx + 1) % activePending.length;
    setStage2JumpIdx(nextIdx);
    const targetKey = activePending[nextIdx];
    const el = document.getElementById(`stage2-${targetKey}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
    }
  };

  // Multi-Container Dynamic Scoping for DG Manifest and Bill of Lading
  // Default view is Container 1 whenever multi-container allocation is present
  const [selectedContainerScope, setSelectedContainerScope] = useState<string>(() => {
    return shipmentJson.containers && shipmentJson.containers.length > 0 ? shipmentJson.containers[0].id : '';
  });

  // Ensure default view updates to Container 1 whenever shipmentJson containers are loaded or change
  useEffect(() => {
    if (shipmentJson.containers && shipmentJson.containers.length > 0) {
      const firstContId = shipmentJson.containers[0].id;
      // If current selection is invalid or not in containers list, default to Container 1
      const exists = shipmentJson.containers.some((c) => c.id === selectedContainerScope);
      if (!exists) {
        setSelectedContainerScope(firstContId);
      }
    } else {
      setSelectedContainerScope('');
    }
  }, [shipmentJson.containers, selectedContainerScope]);

  const activeScopedContainerId = useMemo(() => {
    if (!shipmentJson.containers || shipmentJson.containers.length === 0) return '';
    const exists = shipmentJson.containers.some((c) => c.id === selectedContainerScope);
    return exists ? selectedContainerScope : shipmentJson.containers[0].id;
  }, [shipmentJson.containers, selectedContainerScope]);

  const scopedDgShipmentJson = useMemo(() => {
    if (!shipmentJson.containers || shipmentJson.containers.length <= 1) {
      return shipmentJson;
    }
    const cont = shipmentJson.containers.find((c) => c.id === activeScopedContainerId) || shipmentJson.containers[0];
    if (!cont) return shipmentJson;

    const scopedPallets = cont.palletIndices && cont.palletIndices.length > 0
      ? cont.palletIndices.map((idx) => shipmentJson.pallets[idx]).filter(Boolean)
      : shipmentJson.pallets;
    const scopedBoxes = scopedPallets.reduce((s, p) => s + (p.boxCount || 0), 0);
    const scopedGross = scopedPallets.reduce((s, p) => s + (p.grossWeightKg || 0), 0);
    const scopedNet = scopedPallets.reduce((s, p) => s + (p.netWeightKg || 0), 0);
    const palletRanges = synthesizePalletRanges(scopedPallets);
    const palletStr = palletRanges.join(', ');

    let scopedMarks = (shipmentJson.shippingMarks || '')
      .replace(/(?:\r?\n)?PALLET\s*NOS?:\s*[^\r\n]*/gi, '')
      .trim();
    if (palletStr) {
      scopedMarks = scopedMarks ? `${scopedMarks}\nPALLET NOS: ${palletStr}` : `PALLET NOS: ${palletStr}`;
    }

    return {
      ...shipmentJson,
      containerNumber: cont.containerNumber || '',
      sealNumber: cont.sealNumber || '',
      containerType: '20GP' as const,
      tareWeightKg: cont.tareWeightKg || 0,
      totalPallets: scopedPallets.length,
      outerPackagingCount: scopedPallets.length,
      totalBoxes: scopedBoxes,
      totalPackages: scopedBoxes,
      innerPackageCount: scopedBoxes,
      grossWeightKg: scopedGross,
      netWeightKg: scopedNet,
      shippingMarks: scopedMarks,
      pallets: scopedPallets
    };
  }, [shipmentJson, activeScopedContainerId]);

  // Scoped DG Shipment directly without item filtering dropdown
  const activeFilteredDgShipment = scopedDgShipmentJson;

  const handleScopedDgUpdateShipment = (updated: ExtractedShipmentJSON) => {
    syncStage2FieldsToLedger(updated);
    if (!shipmentJson.containers || shipmentJson.containers.length <= 1) {
      onUpdateShipment(updated);
      return;
    }
    const updatedContainers = shipmentJson.containers.map((c) => {
      if (c.id === activeScopedContainerId) {
        return {
          ...c,
          containerNumber: updated.containerNumber,
          sealNumber: updated.sealNumber,
          tareWeightKg: updated.tareWeightKg
        };
      }
      return c;
    });

    const fullUpdated = {
      ...shipmentJson,
      carrierName: updated.carrierName,
      vesselName: updated.vesselName,
      voyageNumber: updated.voyageNumber,
      bookingNumber: updated.bookingNumber,
      portOfLoading: updated.portOfLoading,
      portOfDischarge: updated.portOfDischarge,
      emergencyContactPhone: updated.emergencyContactPhone,
      containers: updatedContainers
    };
    syncStage2FieldsToLedger(fullUpdated);
    onUpdateShipment(fullUpdated);
  };

  // Field audit entries
  const auditEntries = useMemo(() => {
    return Object.entries(shipmentJson).map(([key, value]) => {
      const isArray = Array.isArray(value);
      const isObject = typeof value === 'object' && value !== null && !isArray;
      const isBlank = value === '' || value === 0 || (isArray && value.length === 0) || value === false;
      return {
        key,
        value,
        isBlank,
        displayVal: isArray
          ? `[${value.length} items]`
          : isObject
          ? '{...}'
          : String(value)
      };
    });
  }, [shipmentJson]);

  const populatedFieldsCount = auditEntries.filter((e) => !e.isBlank && e.key !== 'sourceFiles').length;

  return (
    <div className="flex-1 flex flex-col h-full max-h-screen overflow-hidden bg-app text-content-primary relative">
      {/* =========================================================================
          UNIFIED WORKSPACE TOP CONTROL BAR (Sticky High-Contrast Header)
          ========================================================================= */}
      <header className="h-12 px-4 sm:px-6 border-b border-divider bg-surface flex items-center justify-between shrink-0 z-30 shadow-xs">
        {/* Left: Brand & Navigation Dropdown */}
        <div className="flex items-center space-x-3 shrink-0">
          <div className="flex items-center space-x-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-brand-primary flex items-center justify-center shadow-xs">
              <Package className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold tracking-tight text-content-primary">EKDANT</span>
              <span className="text-[8px] font-mono tracking-wider text-content-muted -mt-0.5">LOGISTICS</span>
            </div>
          </div>

          <div className="h-4 w-px bg-divider" />

          {/* Navigation Dropdown: Warehouse / Dispatch Tool */}
          <div className="relative">
            <select
              value="workspace"
              onChange={(e) => {
                if (e.target.value === 'inventory' && onOpenInventory) {
                  onOpenInventory();
                }
              }}
              className="pl-3 pr-8 py-1.5 bg-surface border border-divider rounded-lg font-bold text-xs sm:text-sm text-content-primary focus:outline-none focus:border-brand-primary cursor-pointer appearance-none shadow-2xs hover:bg-surface-secondary transition-colors"
              aria-label="Navigation selector"
            >
              <option value="workspace">Dispatch Tool</option>
              <option value="inventory">Warehouse</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-content-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Right: Header Utilities */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Save Work Button (Saves BL, DG, layouts, and truth JSON for files repository) */}
          {onSaveWork && (
            <button
              type="button"
              onClick={onSaveWork}
              className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary text-xs font-semibold border border-divider transition-all flex items-center space-x-1.5 cursor-pointer shadow-xs hover:border-brand-primary/50"
              title="Save work (BL, DG, Container placement & Truth JSON) into File Repository"
            >
              <Save className="w-3.5 h-3.5 text-brand-primary" />
              <span>Save</span>
            </button>
          )}

          {/* Confirm Dispatch (Stock-Out) Action */}
          {shipmentJson.isDispatched ? (
            <span className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold flex items-center space-x-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Dispatched &amp; Deducted</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setShowDispatchConfirmModal(true)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer"
              title="Confirm dispatch and automatically deduct from warehouse inventory"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Confirm Dispatch (Stock-Out)</span>
            </button>
          )}

          {/* Reset Session */}
          <button
            type="button"
            onClick={onHardReset}
            disabled={isPurging}
            className="p-1.5 rounded-lg bg-surface hover:bg-state-error-bg text-content-secondary hover:text-state-error border border-divider transition-colors cursor-pointer"
            title="Hard Reset Dispatch Tool Storage"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isPurging ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* =========================================================================
          WORKSPACE CONTENT AREA: Orange Box (Canvas) + Blue Box (Right Sidebar)
          ========================================================================= */}
      <div className="flex-1 flex overflow-hidden relative">
        <main className="flex-1 overflow-hidden relative flex flex-col">
        {/* ---------------------------------------------------------------------
            VIEW 1: Extracted Data & Pallets
            --------------------------------------------------------------------- */}
        {activeTab === 'extracted_data' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 max-w-7xl w-full mx-auto">
            {/* Shipment Overview Card */}
            <div className="p-4 bg-surface border border-divider rounded-xl space-y-3 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-divider">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-brand-primary" />
                  <h3 className="text-xs font-bold text-content-primary uppercase tracking-wider">
                    Extracted Shipment Canonical Truth
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-brand-primary bg-brand-primary-soft px-2 py-0.5 rounded border border-brand-primary/30">
                  {shipmentJson.uploadMode}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div className="p-2.5 bg-surface-secondary rounded border border-divider">
                  <span className="text-[10px] font-mono text-content-secondary block mb-0.5">Shipper (Consignor)</span>
                  <span className="font-semibold text-content-primary truncate block">{shipmentJson.shipperName || '—'}</span>
                  <span className="text-[10px] text-content-muted font-mono block truncate">
                    IEC: {shipmentJson.shipperIec || '—'}
                  </span>
                </div>

                <div className="p-2.5 bg-surface-secondary rounded border border-divider">
                  <span className="text-[10px] font-mono text-content-secondary block mb-0.5">Consignee</span>
                  <span className="font-semibold text-content-primary truncate block">{shipmentJson.consigneeName || '—'}</span>
                  <span className="text-[10px] text-content-muted font-mono block truncate">
                    POD: {shipmentJson.portOfDischarge || '—'}
                  </span>
                </div>

                <div className="p-2.5 bg-surface-secondary rounded border border-divider">
                  <span className="text-[10px] font-mono text-content-secondary block mb-0.5">Regulatory Hazmat</span>
                  <span className="font-semibold text-brand-primary block">
                    {shipmentJson.unNumber ? `UN ${shipmentJson.unNumber} (Class ${shipmentJson.imoClass || '8'})` : 'Non-DG'}
                  </span>
                  <span className="text-[10px] text-content-secondary font-mono block truncate">
                    {shipmentJson.properShippingName || '—'}
                  </span>
                </div>

                <div className="p-2.5 bg-surface-secondary rounded border border-divider">
                  <span className="text-[10px] font-mono text-content-secondary block mb-0.5">Totals &amp; VGM</span>
                  <span className="font-semibold text-state-success block font-mono">
                    Gross: {shipmentJson.grossWeightKg.toLocaleString()} kg
                  </span>
                  <span className="text-[10px] text-brand-primary font-mono block">
                    VGM: {calculatedVgm.toLocaleString()} kg ({shipmentJson.containerType || '20GP'})
                  </span>
                </div>
              </div>
            </div>

            {/* Sub-Tabs: Pallet Annex | Field Audit | Raw JSON */}
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-divider">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setDataSubTab('pallets')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center space-x-1.5 ${
                      dataSubTab === 'pallets'
                        ? 'bg-brand-primary text-brand-primary-text'
                        : 'bg-surface text-content-secondary hover:text-content-primary border border-divider'
                    }`}
                  >
                    <Boxes className="w-3.5 h-3.5" />
                    <span>Granular Pallet Table ({shipmentJson.pallets.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDataSubTab('audit')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center space-x-1.5 ${
                      dataSubTab === 'audit'
                        ? 'bg-brand-primary text-brand-primary-text'
                        : 'bg-surface text-content-secondary hover:text-content-primary border border-divider'
                    }`}
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                    <span>Field Audit ({populatedFieldsCount}/{auditEntries.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDataSubTab('raw_json')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      dataSubTab === 'raw_json'
                        ? 'bg-brand-primary text-brand-primary-text'
                        : 'bg-surface text-content-secondary hover:text-content-primary border border-divider'
                    }`}
                  >
                    Raw JSON Schema
                  </button>
                </div>

                {dataSubTab === 'raw_json' && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleCopyJson}
                      className="px-2.5 py-1 text-xs rounded bg-surface hover:bg-surface-secondary text-content-primary border border-divider flex items-center space-x-1"
                    >
                      {copiedJson ? <Check className="w-3 h-3 text-state-success" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
                    </button>
                    <button
                      onClick={() => onDownloadJson(shipmentJson, 'shipment_truth.json')}
                      className="px-2.5 py-1 text-xs rounded bg-brand-primary hover:bg-brand-primary-hover text-brand-primary-text flex items-center space-x-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Sub-tab 1: Pallets Table */}
              {dataSubTab === 'pallets' && (
                <div className="border border-divider rounded-xl overflow-hidden bg-surface shadow-sm">
                  {shipmentJson.pallets.length === 0 ? (
                    <div className="p-8 text-center text-xs text-content-secondary">
                      No pallet records extracted yet. Open the Container UI drawer to add or configure pallets.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse font-mono">
                      <thead>
                        <tr className="bg-surface-secondary border-b border-divider text-content-secondary text-[11px]">
                          <th className="px-4 py-2.5">Pallet #</th>
                          <th className="px-4 py-2.5">Model / Description</th>
                          <th className="px-4 py-2.5 text-right">Box Count</th>
                          <th className="px-4 py-2.5 text-right">Gross Wt (kg)</th>
                          <th className="px-4 py-2.5 text-right">Net Wt (kg)</th>
                          <th className="px-4 py-2.5">Source Provenance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-divider">
                        {shipmentJson.pallets.map((p, idx) => {
                          const pBrand = (p.brand || shipmentJson.brandName || '').trim();
                          const pInvoice = (
                            p.invoiceNumber ||
                            (shipmentJson.invoiceNumbers && shipmentJson.invoiceNumbers.length === 1 ? shipmentJson.invoiceNumbers[0] : undefined) ||
                            (shipmentJson.invoiceNumbers && shipmentJson.invoiceNumbers.length > 1 && p.sourceFile
                              ? shipmentJson.invoiceNumbers.find((inv) => p.sourceFile?.toLowerCase().includes(inv.toLowerCase()))
                              : undefined) ||
                            ''
                          ).trim();

                          return (
                            <tr key={p.palletNumber || idx} className="hover:bg-surface-secondary text-[11px]">
                              <td className="px-4 py-2 text-brand-primary font-bold">{p.palletNumber}</td>
                              <td className="px-4 py-2 text-content-primary">
                                <div className="flex items-center space-x-1.5 flex-wrap">
                                  <span>{p.modelCode || '—'}</span>
                                  {pBrand && (
                                    <span className="font-mono text-[10px] font-medium tracking-tight px-1.5 py-0.2 rounded border bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700">
                                      {pBrand}
                                    </span>
                                  )}
                                  {pInvoice && (
                                    <span className="font-mono text-[10px] font-medium tracking-tight px-1.5 py-0.2 rounded border bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800">
                                      {pInvoice.toUpperCase().startsWith('INV') ? pInvoice : `INV: ${pInvoice}`}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2 text-right text-content-primary">{p.boxCount}</td>
                              <td className="px-4 py-2 text-right text-content-primary">{p.grossWeightKg.toLocaleString()}</td>
                              <td className="px-4 py-2 text-right text-content-primary">{p.netWeightKg.toLocaleString()}</td>
                              <td className="px-4 py-2 text-content-muted truncate max-w-xs">{p.sourceFile || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Sub-tab 2: Field Audit Table */}
              {dataSubTab === 'audit' && (
                <div className="border border-divider rounded-xl overflow-hidden bg-surface shadow-sm">
                  <table className="w-full text-left text-xs border-collapse font-mono">
                    <thead>
                      <tr className="bg-surface-secondary border-b border-divider text-content-secondary text-[11px]">
                        <th className="px-4 py-2.5 w-1/3">Canonical Field Key</th>
                        <th className="px-4 py-2.5">Extracted Value</th>
                        <th className="px-4 py-2.5 w-24 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-divider">
                      {auditEntries.map(({ key, displayVal, isBlank }) => (
                        <tr key={key} className="hover:bg-surface-secondary text-[11px]">
                          <td className="px-4 py-2 text-brand-primary font-medium">{key}</td>
                          <td className="px-4 py-2 text-content-primary truncate max-w-lg">
                            {isBlank ? <span className="text-content-muted italic">empty</span> : displayVal}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {isBlank ? (
                              <span className="text-[10px] text-content-muted">pending</span>
                            ) : (
                              <span className="text-[10px] text-state-success font-semibold">populated</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Sub-tab 3: Raw JSON */}
              {dataSubTab === 'raw_json' && (
                <pre className="p-4 bg-input-bg border border-divider rounded-xl text-xs font-mono text-brand-primary overflow-x-auto max-h-[600px]">
                  {JSON.stringify(shipmentJson, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------------
            VIEW 2: DG Manifest (IMO Boxes 1–22) Centered Interactive A4 Canvas
            --------------------------------------------------------------------- */}
        {activeTab === 'dg_manifest' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center bg-slate-200/60">
            <DgDocumentCanvas
              shipmentJson={activeFilteredDgShipment}
              onUpdateShipment={handleScopedDgUpdateShipment}
              templateId={selectedDgFormatId}
              onFieldChange={(fieldId, val) => {
                const field = mappedDgFields.find((f) => f.fieldId === fieldId) || {
                  fieldId,
                  labelInTemplate: fieldId,
                  sectionName: 'IMO Boxes',
                  fieldType: 'text' as const,
                  mappedShipmentKey: '',
                  value: val,
                  status: 'POPULATED' as const
                };
                onFieldChange(field, 'DG', val);
              }}
              customOverrides={dgCustomOverrides || {}}
            />
          </div>
        )}

        {/* ---------------------------------------------------------------------
            VIEW 3: Bill of Lading (BOL) Full-Width Interactive A4 Canvas
            --------------------------------------------------------------------- */}
        {activeTab === 'bl_manifest' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center bg-slate-200/60">
            <BlDocumentCanvas
              shipmentJson={shipmentJson}
              onUpdateShipment={onUpdateShipment}
              onFieldChange={(fieldId, val) => {
                const targetFieldId = fieldId === 'free_time_clause' ? 'bl_free_time' : fieldId;
                const field = mappedBlFields.find((f) => f.fieldId === targetFieldId || f.fieldId === fieldId) || {
                  fieldId: targetFieldId,
                  labelInTemplate: targetFieldId,
                  sectionName: 'BOL Fields',
                  fieldType: 'text' as const,
                  mappedShipmentKey: fieldId === 'free_time_clause' || targetFieldId === 'bl_free_time' ? 'freeTimeClause' : '',
                  value: val,
                  status: 'POPULATED' as const
                };
                onFieldChange(field, 'BL', val);
              }}
              customOverrides={blCustomOverrides || {}}
            />
          </div>
        )}

        {/* ---------------------------------------------------------------------
            VIEW 4: Container Bay & Equipment Allocation (Inline Workspace Tab)
            --------------------------------------------------------------------- */}
        {activeTab === 'container_bay' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-app space-y-4">
            {/* Container Specifications Requirement Notice */}
            {(!shipmentJson.containerNumber?.trim() || shipmentJson.containerNumber === '---' || shipmentJson.containerNumber.startsWith('Container ') || !shipmentJson.sealNumber?.trim() || shipmentJson.sealNumber === '---') ? (
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center space-x-2.5 text-xs text-amber-900 dark:text-amber-200">
                  <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <div>
                    <span className="font-bold block">Final Requirement before DG &amp; BL Export</span>
                    <span className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                      Container Number &amp; Seal Number must be entered here before downloading official manifests.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDispatchConfirmModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shrink-0 cursor-pointer shadow-xs transition-colors"
                >
                  Confirm Specifications &amp; Dispatch
                </button>
              </div>
            ) : (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between shadow-2xs">
                <div className="flex items-center space-x-2 text-xs text-emerald-800 dark:text-emerald-300 font-mono">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    <strong>Container Specifications Confirmed:</strong> {shipmentJson.containerNumber} • Seal: {shipmentJson.sealNumber}
                  </span>
                </div>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full border border-emerald-300">
                  ✓ Ready for Export
                </span>
              </div>
            )}

            <ContainerBayWorkspace
              key={shipmentJson.invoiceNumbers.join('-') + '-' + shipmentJson.pallets.length + '-' + (shipmentJson.containerNumber || '') + '-' + (shipmentJson.containerType || '')}
              shipmentJson={shipmentJson}
              onUpdateShipment={onUpdateShipment}
              onSwitchTab={(tab) => setActiveTab(tab)}
              registerSyncHandler={(handler) => {
                containerSyncRef.current = handler;
              }}
            />
          </div>
        )}

        {/* ---------------------------------------------------------------------
            VIEW 5: Export Center (.ZIP / PDF / DOCX)
            --------------------------------------------------------------------- */}
        {activeTab === 'export_center' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-5xl w-full mx-auto space-y-6">
            <div className="text-center space-y-1">
              <h2 className="text-base font-bold text-content-primary tracking-wide">
                Document Export &amp; Carrier Issuance Center
              </h2>
              <p className="text-xs text-content-secondary">
                Verified multi-format downloads for customs submission and carrier filing
              </p>
            </div>

            {/* Side-by-side DG & BOL Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* DG Card */}
              <div className="p-5 bg-surface border border-divider rounded-2xl space-y-4 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-divider">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-brand-primary-soft border border-brand-primary/30 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-brand-primary" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-content-primary">Dangerous Goods Manifest</h3>
                      <p className="text-[10px] text-content-secondary font-mono">SOLAS 74 IMO Boxes 1–22</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-state-success-bg text-state-success border border-state-success/40">
                    {dgStats.populated}/{dgStats.total} Mapped
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => checkContainerSpecsAndExecute('PRINT_PDF', 'DG')}
                    className="p-2.5 rounded-lg bg-surface-secondary hover:bg-brand-primary-soft border border-divider hover:border-brand-primary text-center transition-all group"
                  >
                    <Printer className="w-4 h-4 text-brand-primary mx-auto mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-semibold text-content-primary block">Print PDF</span>
                    <span className="text-[9px] text-content-muted font-mono">Direct print dialog</span>
                  </button>

                  <button
                    onClick={() => checkContainerSpecsAndExecute('DOWNLOAD_DOCX', 'DG', activeFilteredDgShipment)}
                    className="p-2.5 rounded-lg bg-surface-secondary hover:bg-brand-primary-soft border border-divider hover:border-brand-primary text-center transition-all group"
                  >
                    <FileText className="w-4 h-4 text-brand-primary mx-auto mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-semibold text-content-primary block">
                      {selectedDgFormatId === 'KMTC_DG' || selectedDgFormatId === 'CMA_CGM_DG' ? 'Excel .xlsx' : 'Word .docx'}
                    </span>
                    <span className="text-[9px] text-content-muted font-mono">
                      {selectedDgFormatId === 'KMTC_DG' || selectedDgFormatId === 'CMA_CGM_DG' ? '1:1 Master Excel Sheet' : 'Editable master document'}
                    </span>
                  </button>

                  <button
                    onClick={() => checkContainerSpecsAndExecute('DOWNLOAD_HTML', 'DG')}
                    className="p-2.5 rounded-lg bg-surface-secondary hover:bg-brand-primary-soft border border-divider hover:border-brand-primary text-center transition-all group"
                  >
                    <ExternalLink className="w-4 h-4 text-brand-accent mx-auto mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-semibold text-content-primary block">Maritime HTML</span>
                    <span className="text-[9px] text-content-muted font-mono">Standalone file</span>
                  </button>
                </div>
              </div>

              {/* BOL Card */}
              <div className="p-5 bg-surface border border-divider rounded-2xl space-y-4 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-divider">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-brand-primary-soft border border-brand-primary/30 flex items-center justify-center">
                      <FileSpreadsheet className="w-4 h-4 text-brand-primary" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-content-primary">Bill of Lading Draft</h3>
                      <p className="text-[10px] text-content-secondary font-mono">Standard Ocean B/L Format</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-state-success-bg text-state-success border border-state-success/40">
                    {blStats.populated}/{blStats.total} Mapped
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => checkContainerSpecsAndExecute('PRINT_PDF', 'BL')}
                    className="p-2.5 rounded-lg bg-surface-secondary hover:bg-brand-primary-soft border border-divider hover:border-brand-primary text-center transition-all group"
                  >
                    <Printer className="w-4 h-4 text-brand-primary mx-auto mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-semibold text-content-primary block">Print PDF</span>
                    <span className="text-[9px] text-content-muted font-mono">Direct print dialog</span>
                  </button>

                  <button
                    onClick={() => checkContainerSpecsAndExecute('DOWNLOAD_DOCX', 'BL')}
                    className="p-2.5 rounded-lg bg-surface-secondary hover:bg-brand-primary-soft border border-divider hover:border-brand-primary text-center transition-all group"
                  >
                    <FileText className="w-4 h-4 text-brand-primary mx-auto mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-semibold text-content-primary block">Word .docx</span>
                    <span className="text-[9px] text-content-muted font-mono">Editable document</span>
                  </button>

                  <button
                    onClick={() => checkContainerSpecsAndExecute('DOWNLOAD_HTML', 'BL')}
                    className="p-2.5 rounded-lg bg-surface-secondary hover:bg-brand-primary-soft border border-divider hover:border-brand-primary text-center transition-all group"
                  >
                    <ExternalLink className="w-4 h-4 text-brand-accent mx-auto mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-semibold text-content-primary block">Maritime HTML</span>
                    <span className="text-[9px] text-content-muted font-mono">Standalone file</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Complete Package (.ZIP) Card */}
            <div className="p-6 bg-surface border border-brand-primary/40 rounded-2xl shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start space-x-2">
                  <Package className="w-5 h-5 text-brand-primary" />
                  <h3 className="text-sm font-bold text-content-primary">Complete Shipment Package (.zip)</h3>
                </div>
                <p className="text-xs text-content-secondary max-w-md">
                  Downloads an all-inclusive archive containing both DG and BOL manifests in PDF, Word (.docx), Maritime HTML, JSON data, and Pallet Annex tables.
                </p>
              </div>

              <button
                onClick={() => checkContainerSpecsAndExecute('DOWNLOAD_ZIP')}
                disabled={isExportingZip}
                className="px-6 py-3 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-brand-primary-text font-bold text-xs shadow-md flex items-center space-x-2 transition-all shrink-0 cursor-pointer"
              >
                <Package className={`w-4 h-4 ${isExportingZip ? 'animate-spin' : ''}`} />
                <span>{isExportingZip ? 'Compiling ZIP...' : 'Download Complete Package (.zip)'}</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* =========================================================================
          RIGHT SIDEBAR (Blue Box: Controls, Formats, Metrics & Exports)
          ========================================================================= */}
      <aside className="w-80 md:w-84 xl:w-96 border-l border-divider bg-surface flex flex-col shrink-0 overflow-y-auto z-20 shadow-xs divide-y divide-divider/60 font-sans">
        {/* Section 1: View Selection & Container Scope */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-content-secondary uppercase tracking-wider">Document View</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-brand-primary-soft text-brand-primary border border-brand-primary/20">
              {activeTab === 'dg_manifest' ? 'DG IMO-22' : activeTab === 'bl_manifest' ? 'Ocean B/L' : 'Bay Plan'}
            </span>
          </div>

          {/* Primary Workspace View Selector Dropdown */}
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-brand-primary flex items-center">
              {activeTab === 'dg_manifest' ? (
                <FileText className="w-4 h-4" />
              ) : activeTab === 'bl_manifest' ? (
                <FileSpreadsheet className="w-4 h-4" />
              ) : (
                <Boxes className="w-4 h-4" />
              )}
            </div>
            <select
              aria-label="Select workspace view"
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as WorkspaceTab)}
              className="w-full bg-surface-secondary hover:bg-surface border border-divider focus:border-brand-primary text-content-primary rounded-xl text-xs font-semibold pl-9 pr-8 py-2.5 appearance-none cursor-pointer shadow-xs transition-colors"
            >
              <option value="dg_manifest">
                DG Manifest ({dgStats.populated}/{dgStats.total})
              </option>
              <option value="bl_manifest">
                Bill of Lading ({blStats.populated}/{blStats.total})
              </option>
              <option value="container_bay">
                Container Placement ({shipmentJson.pallets.length}p)
              </option>
            </select>
            <ChevronDown className="w-4 h-4 text-content-secondary absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Multi-Container Switcher Pill Bar (When Multi-Container) */}
          {shipmentJson.containers && shipmentJson.containers.length > 1 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-semibold text-content-muted uppercase tracking-wider block">Container Scope</span>
              <div className="grid grid-cols-2 gap-1.5 bg-surface-secondary p-1 rounded-xl border border-divider">
                {shipmentJson.containers.map((c, idx) => {
                  const pCount = c.palletIndices?.length || 0;
                  const isSelected = activeScopedContainerId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedContainerScope(c.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer truncate ${
                        isSelected
                          ? 'bg-brand-primary text-brand-primary-text shadow-xs'
                          : 'text-content-secondary hover:text-content-primary bg-surface/50'
                      }`}
                    >
                      {c.label || `Container ${idx + 1}`} ({pCount}p)
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Missing Fields / Status Banner */}
        <div className="p-4 space-y-2">
          <span className="text-[11px] font-bold text-content-secondary uppercase tracking-wider block">Field Status</span>
          {activeTab === 'dg_manifest' ? (
            dgStats.total - dgStats.populated > 0 ? (
              <button
                type="button"
                onClick={handleJumpToNextPending}
                className="w-full text-xs font-semibold px-3 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white shadow-sm flex items-center justify-between transition-all cursor-pointer"
                title="Click to jump to next missing field"
              >
                <span className="flex items-center space-x-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-100" />
                  <span>Fields Pending</span>
                </span>
                <span className="bg-amber-600/70 px-2 py-0.5 rounded text-[11px] font-mono">
                  {dgStats.total - dgStats.populated} / {dgStats.total}
                </span>
              </button>
            ) : (
              <div className="w-full text-xs font-semibold px-3 py-2.5 rounded-xl bg-emerald-600 text-white shadow-sm flex items-center justify-between">
                <span className="flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-100" />
                  <span>All DG Fields Complete</span>
                </span>
                <span className="bg-emerald-700/60 px-2 py-0.5 rounded text-[11px] font-mono">Ready</span>
              </div>
            )
          ) : activeTab === 'bl_manifest' ? (
            blStats.total - blStats.populated > 0 ? (
              <button
                type="button"
                onClick={handleJumpToNextPending}
                className="w-full text-xs font-semibold px-3 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white shadow-sm flex items-center justify-between transition-all cursor-pointer"
                title="Click to jump to next missing field"
              >
                <span className="flex items-center space-x-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-100" />
                  <span>Fields Pending</span>
                </span>
                <span className="bg-amber-600/70 px-2 py-0.5 rounded text-[11px] font-mono">
                  {blStats.total - blStats.populated} / {blStats.total}
                </span>
              </button>
            ) : (
              <div className="w-full text-xs font-semibold px-3 py-2.5 rounded-xl bg-emerald-600 text-white shadow-sm flex items-center justify-between">
                <span className="flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-100" />
                  <span>All BL Fields Complete</span>
                </span>
                <span className="bg-emerald-700/60 px-2 py-0.5 rounded text-[11px] font-mono">Ready</span>
              </div>
            )
          ) : (
            <div className="w-full text-xs font-medium px-3 py-2 rounded-xl bg-surface-secondary border border-divider text-content-secondary flex items-center justify-between">
              <span>Equipment Allocation</span>
              <span className="font-semibold text-content-primary">{shipmentJson.pallets.length} Pallets</span>
            </div>
          )}
          {/* Shifted DG Fields & BL Fields blocks directly below Field Status (Reference Image 1) */}
          <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
            <div className="p-2.5 bg-surface-secondary rounded-xl border border-divider">
              <span className="text-[10px] text-content-muted block mb-0.5">DG Fields</span>
              <span className="font-semibold text-brand-primary">{dgStats.populated}/{dgStats.total}</span>
            </div>
            <div className="p-2.5 bg-surface-secondary rounded-xl border border-divider">
              <span className="text-[10px] text-content-muted block mb-0.5">BL Fields</span>
              <span className="font-semibold text-brand-primary">{blStats.populated}/{blStats.total}</span>
            </div>
          </div>
        </div>

        {/* Section 3: Carrier Format Template */}
        {(activeTab === 'dg_manifest' || activeTab === 'bl_manifest') && (
          <div className="p-4 space-y-2">
            <span className="text-[11px] font-bold text-content-secondary uppercase tracking-wider block">
              {activeTab === 'dg_manifest' ? 'DG Carrier Format' : 'BL Carrier Format'}
            </span>
            {activeTab === 'dg_manifest' ? (
              <div className="relative">
                <select
                  value={selectedDgFormatId}
                  onChange={(e) => onSelectDgFormat(e.target.value)}
                  className="w-full bg-surface-secondary hover:bg-surface border border-divider focus:border-brand-primary text-content-primary text-xs rounded-xl px-3 py-2.5 pr-8 focus:outline-none font-medium appearance-none cursor-pointer transition-colors shadow-xs"
                >
                  {dgFormats.map((fmt) => (
                    <option key={fmt.formatId} value={fmt.formatId}>
                      {fmt.formatName}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-content-secondary absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedBlFormatId}
                  onChange={(e) => onSelectBlFormat(e.target.value)}
                  className="w-full bg-surface-secondary hover:bg-surface border border-divider focus:border-brand-primary text-content-primary text-xs rounded-xl px-3 py-2.5 pr-8 focus:outline-none font-medium appearance-none cursor-pointer transition-colors shadow-xs"
                >
                  {blFormats.map((fmt) => (
                    <option key={fmt.formatId} value={fmt.formatId}>
                      {fmt.formatName}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-content-secondary absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}
          </div>
        )}

        {/* Section 4: Manifest Metrics */}
        <div className="p-4 space-y-2.5">
          <span className="text-[11px] font-bold text-content-secondary uppercase tracking-wider block">Manifest Metrics</span>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="p-2.5 bg-surface-secondary rounded-xl border border-divider">
              <span className="text-[10px] text-content-muted block mb-0.5">Gross Mass</span>
              <span className="font-semibold text-state-success truncate block">
                {shipmentJson.grossWeightKg > 0 ? `${shipmentJson.grossWeightKg.toLocaleString()} kg` : '—'}
              </span>
            </div>
            <div className="p-2.5 bg-surface-secondary rounded-xl border border-divider">
              <span className="text-[10px] text-content-muted block mb-0.5">SOLAS VGM</span>
              <span className="font-semibold text-state-success truncate block">
                {calculatedVgm > 0 ? `${calculatedVgm.toLocaleString()} kg` : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Section 5: Actions & Export */}
        <div className="p-4 space-y-3 mt-auto">
          <span className="text-[11px] font-bold text-content-secondary uppercase tracking-wider block">Actions &amp; Export</span>
          {activeTab === 'container_bay' ? (
            <button
              type="button"
              onClick={handleContainerSync}
              className={`w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer ${
                hasContainerSynced
                  ? 'bg-state-success text-white'
                  : 'bg-brand-primary hover:bg-brand-primary-hover text-brand-primary-text'
              }`}
            >
              <Boxes className="w-4 h-4" />
              <span>{hasContainerSynced ? '✓ Synced to Manifests!' : 'Apply & Sync to Manifests'}</span>
            </button>
          ) : (
            <div className="space-y-2">
              {/* Export Document Dropdown */}
              <div className="relative">
                <select
                  value=""
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    const targetDoc: FormatDocumentType = activeTab === 'bl_manifest' ? 'BL' : 'DG';
                    if (val === 'PDF') {
                      checkContainerSpecsAndExecute('PRINT_PDF', targetDoc);
                    } else if (val === 'Word') {
                      checkContainerSpecsAndExecute('DOWNLOAD_DOCX', targetDoc, targetDoc === 'DG' ? activeFilteredDgShipment : undefined);
                    }
                  }}
                  className="w-full bg-surface-secondary hover:bg-surface text-content-primary text-xs font-semibold border border-divider rounded-xl px-3 py-2.5 pr-8 focus:outline-none focus:border-brand-primary cursor-pointer transition-colors shadow-xs appearance-none"
                >
                  <option value="" disabled>
                    Export Document ({activeTab === 'bl_manifest' ? 'BL' : 'DG'})
                  </option>
                  <option value="PDF">Print / Download PDF</option>
                  <option value="Word">
                    {activeTab !== 'bl_manifest' && (selectedDgFormatId === 'KMTC_DG' || selectedDgFormatId === 'CMA_CGM_DG')
                      ? 'Master Excel (.xlsx)'
                      : 'Master Word (.docx)'}
                  </option>
                </select>
                <ChevronDown className="w-4 h-4 text-content-secondary absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Package ZIP button */}
              <button
                onClick={() => checkContainerSpecsAndExecute('DOWNLOAD_ZIP')}
                disabled={isExportingZip}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-brand-primary-text text-xs font-semibold shadow-sm transition-all cursor-pointer"
                title="Download Complete Shipment Package (.zip)"
              >
                <Package className={`w-4 h-4 ${isExportingZip ? 'animate-spin' : ''}`} />
                <span>{isExportingZip ? 'Compiling Archive...' : 'Download Package (.zip)'}</span>
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>

      {/* Dispatch Confirmation Toast */}
      {dispatchToast && (
        <div className="fixed top-16 right-6 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-lg shadow-xl text-xs font-semibold flex items-center space-x-2 animate-fade-in border border-emerald-400">
          <CheckCircle2 className="w-4 h-4 text-white" />
          <span>{dispatchToast}</span>
        </div>
      )}

      {/* Modal: Select Invoices from Active Warehouse Inventory */}
      {showInvoiceSelectorModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-divider rounded-2xl max-w-4xl w-full h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in">
            <InventoryStockSelector
              isModal={true}
              onSelectShipment={(unified) => {
                onUpdateShipment(unified);
                setShowInvoiceSelectorModal(false);
              }}
              onOpenInventory={() => {
                setShowInvoiceSelectorModal(false);
                if (onOpenInventory) onOpenInventory();
              }}
              onCancel={() => setShowInvoiceSelectorModal(false)}
            />
          </div>
        </div>
      )}

      {/* Modal: Confirm Dispatch & Update Inventory (Stock-Out) */}
      {showDispatchConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-divider rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-2xl animate-fade-in max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-divider shrink-0">
              <div className="flex items-center space-x-2 text-sm font-bold text-content-primary">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Container &amp; Transport Specifications</span>
              </div>
              <button
                onClick={() => {
                  setShowDispatchConfirmModal(false);
                  setPendingExport(null);
                }}
                className="text-content-muted hover:text-content-primary cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            {/* Notice if triggered as requirement before download */}
            {pendingExport ? (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start space-x-2 font-sans shrink-0">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Required for Download:</strong> Container Number, Seal Number, Transport Document Number (Booking No.), Carrier, Vessel &amp; Voy, and Forwarder's Ref are mandatory before generating {pendingExport.docType ? `${pendingExport.docType} manifest` : 'manifest documents'}.
                </span>
              </div>
            ) : (
              <p className="text-xs text-content-secondary leading-relaxed shrink-0">
                Save container equipment specifications and transport details for <strong className="text-content-primary">{shipmentJson.consigneeName}</strong>.
              </p>
            )}

            <div className="space-y-4 text-xs overflow-y-auto pr-1 flex-1">
              {/* Mandatory Section 1: Container Equipment */}
              <div className="bg-surface-secondary/40 p-3 rounded-xl border border-divider/60">
                <span className="text-[11px] font-bold text-content-primary uppercase tracking-wider block mb-2.5 text-slate-700 dark:text-slate-200">
                  1. Container Equipment Specifications
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-content-secondary mb-1 font-medium">Container Number *</label>
                    <input
                      type="text"
                      value={dispatchDetails.containerNo}
                      onChange={(e) => setDispatchDetails({ ...dispatchDetails, containerNo: e.target.value.toUpperCase() })}
                      placeholder="e.g. MSKU1234567"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-input-bg border border-divider text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-content-secondary mb-1 font-medium">Seal Number *</label>
                    <input
                      type="text"
                      value={dispatchDetails.sealNo}
                      onChange={(e) => setDispatchDetails({ ...dispatchDetails, sealNo: e.target.value.toUpperCase() })}
                      placeholder="e.g. SL987654"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-input-bg border border-divider text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Mandatory Section 2: Transport & Booking Specifications */}
              <div className="bg-surface-secondary/40 p-3 rounded-xl border border-divider/60">
                <span className="text-[11px] font-bold text-content-primary uppercase tracking-wider block mb-2.5 text-slate-700 dark:text-slate-200">
                  2. Transport &amp; Carrier Details (Manifest Header)
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-content-secondary mb-1 font-medium">Transport Doc / Booking No. *</label>
                    <input
                      type="text"
                      value={dispatchDetails.bookingNumber}
                      onChange={(e) => setDispatchDetails({ ...dispatchDetails, bookingNumber: e.target.value })}
                      placeholder="e.g. AMC2616964"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-input-bg border border-divider text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-content-secondary mb-1 font-medium">Carrier Name *</label>
                    <input
                      type="text"
                      value={dispatchDetails.carrierName}
                      onChange={(e) => setDispatchDetails({ ...dispatchDetails, carrierName: e.target.value })}
                      placeholder="e.g. CMA CGM / ONE LINE / MSC"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-input-bg border border-divider text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-content-secondary mb-1 font-medium">Vessel and Voy *</label>
                    <input
                      type="text"
                      value={dispatchDetails.vesselVoyage}
                      onChange={(e) => setDispatchDetails({ ...dispatchDetails, vesselVoyage: e.target.value })}
                      placeholder="e.g. BROOKLYN BRIDGE / 0184E"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-input-bg border border-divider text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-content-secondary mb-1 font-medium">Freight Forwarder's Ref *</label>
                    <input
                      type="text"
                      value={dispatchDetails.forwarderReference}
                      onChange={(e) => setDispatchDetails({ ...dispatchDetails, forwarderReference: e.target.value })}
                      placeholder="e.g. FWD000263"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-input-bg border border-divider text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-content-secondary mb-1 font-medium">Additional Handling Information</label>
                    <input
                      type="text"
                      value={dispatchDetails.additionalHandlingInfo}
                      onChange={(e) => setDispatchDetails({ ...dispatchDetails, additionalHandlingInfo: e.target.value })}
                      placeholder="e.g. MR. SUJOY MOB : 9729899131"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-input-bg border border-divider text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Customs & Dispatch Dates */}
              <div className="bg-surface-secondary/40 p-3 rounded-xl border border-divider/60">
                <span className="text-[11px] font-bold text-content-primary uppercase tracking-wider block mb-2.5 text-slate-700 dark:text-slate-200">
                  3. Customs &amp; Dispatch Dates (Optional)
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-content-secondary mb-1 font-medium">Shipping Bill No.</label>
                    <input
                      type="text"
                      value={dispatchDetails.shippingBillNo}
                      onChange={(e) => setDispatchDetails({ ...dispatchDetails, shippingBillNo: e.target.value })}
                      placeholder="e.g. 5622160"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-input-bg border border-divider text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-content-secondary mb-1 font-medium">Shipping Bill Date</label>
                    <DateInput
                      value={dispatchDetails.shippingBillDate}
                      onChange={(val) => setDispatchDetails({ ...dispatchDetails, shippingBillDate: val })}
                      placeholder="DD/MM/YYYY"
                    />
                  </div>

                  <div>
                    <label className="block text-content-secondary mb-1 font-medium">Stuffing Date</label>
                    <DateInput
                      value={dispatchDetails.stuffingDate}
                      onChange={(val) => setDispatchDetails({ ...dispatchDetails, stuffingDate: val })}
                      placeholder="DD/MM/YYYY"
                    />
                  </div>

                  <div>
                    <label className="block text-content-secondary mb-1 font-medium">Port Gate-in Date</label>
                    <DateInput
                      value={dispatchDetails.portGateInDate}
                      onChange={(val) => setDispatchDetails({ ...dispatchDetails, portGateInDate: val })}
                      placeholder="DD/MM/YYYY"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-divider shrink-0">
              <button
                onClick={() => {
                  setShowDispatchConfirmModal(false);
                  setPendingExport(null);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary border border-divider text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteWorkspaceDispatch}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                {pendingExport ? `Save Specs & Download ${pendingExport.docType || 'Manifest'}` : 'Confirm & Save Specifications'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
