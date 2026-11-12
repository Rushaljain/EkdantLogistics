import React, { useState, useMemo, useRef } from 'react';
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
  Plus,
  RotateCcw,
  Sparkles,
  CheckCircle2,
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

  // Export actions
  onPrintPdf: (docType: FormatDocumentType) => void;
  onDownloadDocx: (docType: FormatDocumentType) => void;
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
  onNewUpload,
  onSaveWork,
  onHardReset,
  isPurging,
  onOpenApiKeyModal: _onOpenApiKeyModal,
  hasCustomKey: _hasCustomKey,
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

  // Stage-2 Pending Fields Tracking & Instant Cycling
  const pendingStage2DgKeys = useMemo(() => {
    const pending: string[] = [];
    if (!shipmentJson.bookingNumber?.trim()) pending.push('bookingNumber');
    if (!shipmentJson.carrierName?.trim()) pending.push('carrierName');
    if (!shipmentJson.vesselName?.trim() || !shipmentJson.voyageNumber?.trim()) pending.push('vesselVoyage');
    if (!shipmentJson.containerNumber?.trim()) pending.push('containerNumber');
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
    if (!shipmentJson.tareWeightKg || shipmentJson.tareWeightKg === 0) pending.push('tareWeightKg');
    if (!shipmentJson.shippingBillNumbers?.trim()) pending.push('shippingBillNumbers');
    if (!shipmentJson.freeTimeClause?.trim()) pending.push('freeTimeClause');
    return pending;
  }, [shipmentJson]);

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
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-app text-content-primary">
      {/* =========================================================================
          UNIFIED WORKSPACE TOP CONTROL BAR (Sticky High-Contrast Header)
          ========================================================================= */}
      <header className="h-14 px-4 sm:px-6 border-b border-divider bg-surface backdrop-blur flex items-center justify-between shrink-0 z-30 shadow-sm">
        {/* Left: Brand & Shipment Reference */}
        <div className="flex items-center space-x-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-brand-primary flex items-center justify-center shadow-sm">
            <Boxes className="w-4 h-4 text-white" />
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-content-primary tracking-wide">EKDANT</span>
            </div>
            <span className="text-[10px] text-content-secondary font-mono truncate block max-w-[150px]">
              {shipmentJson.invoiceNumbers[0] ? `Inv: ${shipmentJson.invoiceNumbers[0]}` : 'Active Shipment'}
            </span>
          </div>
        </div>

        {/* Right: Header Utilities */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Primary View Selector Dropdown (Flushed elegantly in ribbon) */}
          <div className="relative flex items-center">
            <div className="absolute left-2.5 pointer-events-none text-brand-primary flex items-center">
              {activeTab === 'dg_manifest' && <FileText className="w-3.5 h-3.5" />}
              {activeTab === 'bl_manifest' && <ExternalLink className="w-3.5 h-3.5" />}
              {activeTab === 'container_bay' && <Boxes className="w-3.5 h-3.5" />}
            </div>
            <select
              aria-label="Select workspace view"
              value={activeTab === 'extracted_data' || activeTab === 'export_center' ? 'dg_manifest' : activeTab}
              onChange={(e) => setActiveTab(e.target.value as WorkspaceTab)}
              className="bg-surface-secondary hover:bg-surface border border-divider focus:border-brand-primary text-content-primary rounded-lg text-xs font-semibold pl-8 pr-7 py-1.5 appearance-none cursor-pointer shadow-xs transition-colors"
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
            <ChevronDown className="w-3.5 h-3.5 text-content-secondary absolute right-2 pointer-events-none" />
          </div>

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

          {/* New Upload Button */}
          <button
            type="button"
            onClick={onNewUpload}
            className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary text-xs font-medium border border-divider transition-colors flex items-center space-x-1 cursor-pointer"
            title="Upload new shipment batch"
          >
            <Plus className="w-3.5 h-3.5 text-brand-primary" />
            <span className="hidden lg:inline">New Upload</span>
          </button>

          {/* Reset Session */}
          <button
            type="button"
            onClick={onHardReset}
            disabled={isPurging}
            className="p-1.5 rounded-lg bg-surface hover:bg-state-error-bg text-content-secondary hover:text-state-error border border-divider transition-colors cursor-pointer"
            title="Hard Reset Workspace Storage"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isPurging ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* =========================================================================
          WORKSPACE CONTENT AREA (Renders Active Tab)
          ========================================================================= */}
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
                        {shipmentJson.pallets.map((p, idx) => (
                          <tr key={p.palletNumber || idx} className="hover:bg-surface-secondary text-[11px]">
                            <td className="px-4 py-2 text-brand-primary font-bold">{p.palletNumber}</td>
                            <td className="px-4 py-2 text-content-primary">
                              <div className="flex items-center space-x-1.5 flex-wrap">
                                <span>{p.modelCode || '—'}</span>
                                {p.brand && (
                                  <span className="font-mono text-[10px] font-medium tracking-tight px-1.5 py-0.2 rounded border bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700">
                                    {p.brand}
                                  </span>
                                )}
                                {p.invoiceNumber && (
                                  <span className="font-mono text-[10px] font-medium tracking-tight px-1.5 py-0.2 rounded border bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800">
                                    {p.invoiceNumber.toUpperCase().startsWith('INV') ? p.invoiceNumber : `INV: ${p.invoiceNumber}`}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right text-content-primary">{p.boxCount}</td>
                            <td className="px-4 py-2 text-right text-content-primary">{p.grossWeightKg.toLocaleString()}</td>
                            <td className="px-4 py-2 text-right text-content-primary">{p.netWeightKg.toLocaleString()}</td>
                            <td className="px-4 py-2 text-content-muted truncate max-w-xs">{p.sourceFile || '—'}</td>
                          </tr>
                        ))}
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
            VIEW 2: DG Manifest (IMO Boxes 1–22) Full-Width Interactive A4 Canvas
            --------------------------------------------------------------------- */}
        {activeTab === 'dg_manifest' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-200/60">
            {/* Top Document Action Bar */}
            <div className="px-4 py-2.5 bg-surface border-b border-divider flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-sm z-10">
              <div className="flex items-center space-x-3">
                {/* Pending Stage-2 Fields Jump Button / All Complete Badge */}
                {pendingStage2DgKeys.length > 0 ? (
                  <button
                    type="button"
                    onClick={handleJumpToNextPending}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white shadow-sm inline-flex items-center transition-all opacity-100 cursor-pointer"
                    title="Click to jump to next missing field"
                  >
                    <span>Fields Pending {dgStats.total - dgStats.populated}/{dgStats.total}</span>
                  </button>
                ) : (
                  <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-state-success text-white shadow-sm inline-flex items-center space-x-1.5 transition-all opacity-100">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>All Critical Boxes Complete</span>
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {/* Carrier Format Selector */}
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-medium text-content-secondary hidden sm:inline">Format:</span>
                  <select
                    value={selectedDgFormatId}
                    onChange={(e) => onSelectDgFormat(e.target.value)}
                    className="bg-input-bg border border-divider text-content-primary text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand-primary max-w-[240px] truncate font-medium"
                  >
                    {dgFormats.map((fmt) => (
                      <option key={fmt.formatId} value={fmt.formatId}>
                        {fmt.formatName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              </div>

            {/* Full-Width Centered A4 Carrier Document Canvas */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center">
              <DgDocumentCanvas
                shipmentJson={shipmentJson}
                onUpdateShipment={onUpdateShipment}
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
          </div>
        )}

        {/* ---------------------------------------------------------------------
            VIEW 3: Bill of Lading (BOL) Full-Width Interactive A4 Canvas
            --------------------------------------------------------------------- */}
        {activeTab === 'bl_manifest' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-200/60">
            {/* Top Document Action Bar */}
            <div className="px-4 py-2.5 bg-surface border-b border-divider flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-sm z-10">
              <div className="flex items-center space-x-3">
                {/* Pending Stage-2 Fields Jump Button / All Complete Badge */}
                {pendingStage2BlKeys.length > 0 ? (
                  <button
                    type="button"
                    onClick={handleJumpToNextPending}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white shadow-sm inline-flex items-center transition-all opacity-100 cursor-pointer"
                    title="Click to jump to next missing field"
                  >
                    <span>Fields Pending {blStats.total - blStats.populated}/{blStats.total}</span>
                  </button>
                ) : (
                  <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-state-success text-white shadow-sm inline-flex items-center space-x-1.5 transition-all opacity-100">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>All BOL Fields Complete</span>
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {/* Carrier Format Selector */}
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-medium text-content-secondary hidden sm:inline">Format:</span>
                  <select
                    value={selectedBlFormatId}
                    onChange={(e) => onSelectBlFormat(e.target.value)}
                    className="bg-input-bg border border-divider text-content-primary text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand-primary max-w-[240px] truncate font-medium"
                  >
                    {blFormats.map((fmt) => (
                      <option key={fmt.formatId} value={fmt.formatId}>
                        {fmt.formatName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Full-Width Centered A4 Carrier Document Canvas */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center">
              <BlDocumentCanvas
                shipmentJson={shipmentJson}
                onUpdateShipment={onUpdateShipment}
                onFieldChange={(fieldId, val) => {
                  const field = mappedBlFields.find((f) => f.fieldId === fieldId) || {
                    fieldId,
                    labelInTemplate: fieldId,
                    sectionName: 'BOL Fields',
                    fieldType: 'text' as const,
                    mappedShipmentKey: '',
                    value: val,
                    status: 'POPULATED' as const
                  };
                  onFieldChange(field, 'BL', val);
                }}
                customOverrides={blCustomOverrides || {}}
              />
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------------
            VIEW 4: Container Bay & Equipment Allocation (Inline Workspace Tab)
            --------------------------------------------------------------------- */}
        {activeTab === 'container_bay' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-app">
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
                    onClick={() => onPrintPdf('DG')}
                    className="p-2.5 rounded-lg bg-surface-secondary hover:bg-brand-primary-soft border border-divider hover:border-brand-primary text-center transition-all group"
                  >
                    <Printer className="w-4 h-4 text-brand-primary mx-auto mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-semibold text-content-primary block">Print PDF</span>
                    <span className="text-[9px] text-content-muted font-mono">Direct print dialog</span>
                  </button>

                  <button
                    onClick={() => onDownloadDocx('DG')}
                    className="p-2.5 rounded-lg bg-surface-secondary hover:bg-brand-primary-soft border border-divider hover:border-brand-primary text-center transition-all group"
                  >
                    <FileText className="w-4 h-4 text-brand-primary mx-auto mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-semibold text-content-primary block">Word .docx</span>
                    <span className="text-[9px] text-content-muted font-mono">Editable document</span>
                  </button>

                  <button
                    onClick={() => onDownloadHtml('DG')}
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
                    onClick={() => onPrintPdf('BL')}
                    className="p-2.5 rounded-lg bg-surface-secondary hover:bg-brand-primary-soft border border-divider hover:border-brand-primary text-center transition-all group"
                  >
                    <Printer className="w-4 h-4 text-brand-primary mx-auto mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-semibold text-content-primary block">Print PDF</span>
                    <span className="text-[9px] text-content-muted font-mono">Direct print dialog</span>
                  </button>

                  <button
                    onClick={() => onDownloadDocx('BL')}
                    className="p-2.5 rounded-lg bg-surface-secondary hover:bg-brand-primary-soft border border-divider hover:border-brand-primary text-center transition-all group"
                  >
                    <FileText className="w-4 h-4 text-brand-primary mx-auto mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-semibold text-content-primary block">Word .docx</span>
                    <span className="text-[9px] text-content-muted font-mono">Editable document</span>
                  </button>

                  <button
                    onClick={() => onDownloadHtml('BL')}
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
                onClick={onDownloadZip}
                disabled={isExportingZip}
                className="px-6 py-3 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-brand-primary-text font-bold text-xs shadow-md flex items-center space-x-2 transition-all shrink-0"
              >
                <Package className={`w-4 h-4 ${isExportingZip ? 'animate-spin' : ''}`} />
                <span>{isExportingZip ? 'Compiling ZIP...' : 'Download Complete Package (.zip)'}</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* =========================================================================
          PERSISTENT BOTTOM ACTION BAR
          ========================================================================= */}
      <footer className="h-12 px-4 sm:px-6 border-t border-divider bg-surface flex items-center justify-between shrink-0 z-30 shadow-sm">
        {/* Left summary readouts */}
        <div className="flex items-center space-x-3 text-xs font-mono truncate">
          <div className="flex items-center space-x-1.5 bg-surface-secondary px-2 py-0.5 rounded border border-divider">
            <span className="text-content-secondary">DG:</span>
            <span className="text-brand-primary font-semibold">{dgStats.populated}/{dgStats.total}</span>
          </div>

          <div className="flex items-center space-x-1.5 bg-surface-secondary px-2 py-0.5 rounded border border-divider">
            <span className="text-content-secondary">BL:</span>
            <span className="text-brand-primary font-semibold">{blStats.populated}/{blStats.total}</span>
          </div>

          {shipmentJson.grossWeightKg > 0 && (
            <div className="hidden sm:flex items-center space-x-1.5 bg-surface-secondary px-2 py-0.5 rounded border border-divider">
              <span className="text-content-secondary">Gross:</span>
              <span className="text-state-success font-semibold">{shipmentJson.grossWeightKg.toLocaleString()} kg</span>
            </div>
          )}

          {calculatedVgm > 0 && (
            <div className="hidden md:flex items-center space-x-1.5 bg-surface-secondary px-2 py-0.5 rounded border border-divider">
              <span className="text-content-secondary">VGM:</span>
              <span className="text-state-success font-semibold">{calculatedVgm.toLocaleString()} kg</span>
            </div>
          )}
        </div>

        {/* Right Actions: Apply & Sync when in container tab, otherwise Export Buttons */}
        <div className="flex items-center space-x-2 shrink-0">
          {activeTab === 'container_bay' ? (
            <button
              type="button"
              onClick={handleContainerSync}
              className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer ${
                hasContainerSynced
                  ? 'bg-state-success text-white'
                  : 'bg-brand-primary hover:bg-brand-primary-hover text-brand-primary-text'
              }`}
            >
              <span>{hasContainerSynced ? '✓ Synced to Manifests!' : 'Apply & Sync to Manifests'}</span>
            </button>
          ) : (
            <>
              <div className="relative">
                <select
                  value=""
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    const targetDoc: FormatDocumentType = activeTab === 'bl_manifest' ? 'BL' : 'DG';
                    if (val === 'PDF') {
                      onPrintPdf(targetDoc);
                    } else if (val === 'Word') {
                      onDownloadDocx(targetDoc);
                    }
                  }}
                  className="bg-surface hover:bg-brand-primary-soft text-content-primary text-xs font-medium border border-divider rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-action-ring cursor-pointer transition-colors"
                >
                  <option value="" disabled>
                    Export Document ({activeTab === 'bl_manifest' ? 'BL' : 'DG'})
                  </option>
                  <option value="PDF">PDF Document</option>
                  <option value="Word">Word (.docx)</option>
                </select>
              </div>

              <button
                onClick={onDownloadZip}
                disabled={isExportingZip}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-brand-primary-text text-xs font-semibold shadow-sm transition-all"
                title="Download Complete Shipment Package (.zip)"
              >
                <Package className={`w-3.5 h-3.5 ${isExportingZip ? 'animate-spin' : ''}`} />
                <span>Package (.zip)</span>
              </button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
