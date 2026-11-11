import React, { useState, useMemo } from 'react';
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
  Search,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Plus,
  RotateCcw,
  Sparkles,
  FolderPlus,
  Key
} from 'lucide-react';
import type {
  ExtractedShipmentJSON,
  FormatSchemaJSON,
  MappedManifestField,
  FormatDocumentType
} from '../types/index.ts';
import { groupManifestFieldsBySection } from '../utils/manifestMatcher.ts';
import { generateManifestHtml } from '../utils/documentExporter.ts';

export type WorkspaceTab = 'extracted_data' | 'dg_manifest' | 'bl_manifest' | 'export_center';

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

  // Header & Modal Actions
  onOpenContainerModal: () => void;
  onNewUpload: () => void;
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
  onUpdateShipment: _onUpdateShipment,
  activeDgFormat,
  activeBlFormat,
  dgFormats,
  blFormats,
  selectedDgFormatId,
  selectedBlFormatId,
  onSelectDgFormat,
  onSelectBlFormat,
  onOpenFormatLibrary,
  mappedDgFields,
  mappedBlFields,
  dgStats,
  blStats,
  onFieldChange,
  onOpenContainerModal,
  onNewUpload,
  onHardReset,
  isPurging,
  onOpenApiKeyModal,
  hasCustomKey,
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

  // Search & Filter in Manifest Editors
  const [fieldSearch, setFieldSearch] = useState<string>('');
  const [fieldFilter, setFieldFilter] = useState<'ALL' | 'POPULATED' | 'PENDING'>('ALL');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [copiedJson, setCopiedJson] = useState(false);

  const toggleSection = (sectionName: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }));
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(shipmentJson, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  // Check equipment completeness for Container UI status dot
  const isEquipmentComplete = Boolean(
    shipmentJson.containerNumber &&
    shipmentJson.containerNumber.trim() !== '' &&
    shipmentJson.sealNumber &&
    shipmentJson.sealNumber.trim() !== '' &&
    shipmentJson.tareWeightKg > 0
  );

  const calculatedVgm = (shipmentJson.grossWeightKg || 0) + (shipmentJson.tareWeightKg || 0);

  // Filtered fields for active manifest
  const activeFields = activeTab === 'dg_manifest' ? mappedDgFields : mappedBlFields;

  const filteredFields = useMemo(() => {
    return activeFields.filter((f) => {
      const matchesSearch =
        !fieldSearch.trim() ||
        f.labelInTemplate.toLowerCase().includes(fieldSearch.toLowerCase()) ||
        f.fieldId.toLowerCase().includes(fieldSearch.toLowerCase()) ||
        f.value.toLowerCase().includes(fieldSearch.toLowerCase());

      const isBlank = !f.value || f.value.trim() === '';
      const matchesFilter =
        fieldFilter === 'ALL' ||
        (fieldFilter === 'POPULATED' && !isBlank) ||
        (fieldFilter === 'PENDING' && isBlank);

      return matchesSearch && matchesFilter;
    });
  }, [activeFields, fieldSearch, fieldFilter]);

  const groupedFields = useMemo(() => {
    return groupManifestFieldsBySection(filteredFields);
  }, [filteredFields]);

  // Live A4 HTML generation for iframe previews
  const liveDgHtml = useMemo(() => {
    return generateManifestHtml(shipmentJson, activeDgFormat, mappedDgFields, {
      includePalletAnnex: true
    });
  }, [shipmentJson, activeDgFormat, mappedDgFields]);

  const liveBlHtml = useMemo(() => {
    return generateManifestHtml(shipmentJson, activeBlFormat, mappedBlFields, {
      includePalletAnnex: true
    });
  }, [shipmentJson, activeBlFormat, mappedBlFields]);

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
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-brand-primary-soft text-brand-primary border border-brand-primary/30">
                v2.0
              </span>
            </div>
            <span className="text-[10px] text-content-secondary font-mono truncate block max-w-[150px]">
              {shipmentJson.invoiceNumbers[0] ? `Inv: ${shipmentJson.invoiceNumbers[0]}` : 'Active Shipment'}
            </span>
          </div>
        </div>

        {/* Center: Primary View Switcher Buttons */}
        <div className="flex items-center p-1 bg-surface-secondary border border-divider rounded-xl space-x-1">
          <button
            type="button"
            onClick={() => setActiveTab('extracted_data')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 ${
              activeTab === 'extracted_data'
                ? 'bg-brand-primary text-brand-primary-text shadow-sm'
                : 'text-content-secondary hover:text-content-primary hover:bg-surface'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span className="hidden md:inline">1.</span>
            <span>Extracted Data &amp; Pallets</span>
            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${activeTab === 'extracted_data' ? 'bg-white/20 text-white' : 'bg-surface border border-divider text-content-secondary'}`}>
              {shipmentJson.pallets.length}p
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('dg_manifest')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 ${
              activeTab === 'dg_manifest'
                ? 'bg-brand-primary text-brand-primary-text shadow-sm'
                : 'text-content-secondary hover:text-content-primary hover:bg-surface'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden md:inline">2.</span>
            <span>DG Manifest</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                dgStats.percentage === 100
                  ? 'bg-state-success-bg text-state-success border border-state-success/40'
                  : activeTab === 'dg_manifest'
                  ? 'bg-white/20 text-white'
                  : 'bg-surface border border-divider text-brand-primary'
              }`}
            >
              {dgStats.populated}/{dgStats.total}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('bl_manifest')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 ${
              activeTab === 'bl_manifest'
                ? 'bg-brand-primary text-brand-primary-text shadow-sm'
                : 'text-content-secondary hover:text-content-primary hover:bg-surface'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span className="hidden md:inline">3.</span>
            <span>Bill of Lading</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                blStats.percentage === 100
                  ? 'bg-state-success-bg text-state-success border border-state-success/40'
                  : activeTab === 'bl_manifest'
                  ? 'bg-white/20 text-white'
                  : 'bg-surface border border-divider text-brand-primary'
              }`}
            >
              {blStats.populated}/{blStats.total}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('export_center')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 ${
              activeTab === 'export_center'
                ? 'bg-brand-primary text-brand-primary-text shadow-sm'
                : 'text-content-secondary hover:text-content-primary hover:bg-surface'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span className="hidden md:inline">4.</span>
            <span>Export Center</span>
          </button>
        </div>

        {/* Right: Prominent Container UI Icon Button & Header Utilities */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Prominent Container UI Drawer Trigger */}
          <button
            type="button"
            onClick={onOpenContainerModal}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center space-x-2 shadow-sm ${
              isEquipmentComplete
                ? 'bg-state-success-bg border-state-success/40 text-state-success hover:bg-state-success-bg/80'
                : 'bg-state-warning-bg border-state-warning/40 text-state-warning hover:bg-state-warning-bg/80'
            }`}
            title="Open Container Load Bay, Equipment & SOLAS VGM Allocation"
          >
            <Boxes className="w-4 h-4 text-current" />
            <span className="hidden xl:inline">Container Bay &amp; VGM</span>
            <span className="flex items-center space-x-1">
              <span
                className={`w-2 h-2 rounded-full ${
                  isEquipmentComplete ? 'bg-state-success' : 'bg-state-warning'
                }`}
              />
              <span className="text-[10px] font-mono font-bold">
                {isEquipmentComplete
                  ? `VGM: ${calculatedVgm.toLocaleString()} kg`
                  : 'Equipment Pending'}
              </span>
            </span>
          </button>

          {/* New Upload Button */}
          <button
            type="button"
            onClick={onNewUpload}
            className="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary text-xs font-medium border border-divider transition-colors flex items-center space-x-1"
            title="Upload new shipment batch"
          >
            <Plus className="w-3.5 h-3.5 text-brand-primary" />
            <span className="hidden lg:inline">New Upload</span>
          </button>

          {/* API Key Modal Button */}
          <button
            type="button"
            onClick={onOpenApiKeyModal}
            className="p-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-content-secondary hover:text-content-primary border border-divider transition-colors"
            title={hasCustomKey ? 'Custom API Key active' : 'Configure Gemini API Key'}
          >
            <Key className="w-3.5 h-3.5" />
          </button>

          {/* Reset Session */}
          <button
            type="button"
            onClick={onHardReset}
            disabled={isPurging}
            className="p-1.5 rounded-lg bg-surface hover:bg-state-error-bg text-content-secondary hover:text-state-error border border-divider transition-colors"
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
                            <td className="px-4 py-2 text-content-primary">{p.modelCode || '—'}</td>
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
            VIEW 2: DG Manifest (IMO Boxes 1–22) Split View
            --------------------------------------------------------------------- */}
        {activeTab === 'dg_manifest' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Column: Grouped Interactive Fields (45% Width) */}
            <div className="w-full lg:w-[48%] h-full flex flex-col border-r border-divider bg-app overflow-hidden">
              {/* Field Filter & Format Bar */}
              <div className="p-3 bg-surface border-b border-divider flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-medium text-content-secondary">Format:</span>
                  <select
                    value={selectedDgFormatId}
                    onChange={(e) => onSelectDgFormat(e.target.value)}
                    className="bg-input-bg border border-divider text-content-primary text-xs rounded-md px-2.5 py-1 focus:outline-none focus:border-brand-primary max-w-[200px] truncate"
                  >
                    {dgFormats.map((fmt) => (
                      <option key={fmt.formatId} value={fmt.formatId}>
                        {fmt.formatName}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => onOpenFormatLibrary('DG')}
                    className="p-1 rounded text-brand-primary hover:bg-brand-primary-soft transition-colors"
                    title="Upload custom carrier format"
                  >
                    <FolderPlus className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-content-muted absolute left-2.5 top-2" />
                    <input
                      type="text"
                      placeholder="Search DG boxes..."
                      value={fieldSearch}
                      onChange={(e) => setFieldSearch(e.target.value)}
                      className="bg-input-bg border border-divider text-xs text-content-primary rounded-md pl-8 pr-2 py-1 w-36 focus:outline-none focus:border-brand-primary"
                    />
                  </div>

                  <select
                    value={fieldFilter}
                    onChange={(e) => setFieldFilter(e.target.value as any)}
                    className="bg-input-bg border border-divider text-content-primary text-xs rounded-md px-2 py-1 focus:outline-none focus:border-brand-primary"
                  >
                    <option value="ALL">All ({dgStats.total})</option>
                    <option value="POPULATED">Populated ({dgStats.populated})</option>
                    <option value="PENDING">Pending ({dgStats.total - dgStats.populated})</option>
                  </select>
                </div>
              </div>

              {/* Collapsible Grouped Fields Grid */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                {Object.entries(groupedFields).map(([sectionName, fields]) => {
                  const isCollapsed = Boolean(collapsedSections[sectionName]);
                  const populatedCount = fields.filter((f) => f.value && f.value.trim() !== '').length;

                  return (
                    <div
                      key={sectionName}
                      className="border border-divider rounded-xl overflow-hidden bg-surface"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSection(sectionName)}
                        className="w-full px-3.5 py-2.5 bg-surface-secondary hover:bg-slate-850 border-b border-divider flex items-center justify-between text-left transition-colors"
                      >
                        <div className="flex items-center space-x-2">
                          {isCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-content-muted" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-brand-primary" />
                          )}
                          <span className="text-xs font-bold text-content-primary tracking-wide">
                            {sectionName}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface border border-divider text-content-secondary">
                            {populatedCount}/{fields.length}
                          </span>
                        </div>
                      </button>

                      {!isCollapsed && (
                        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-surface-secondary/40">
                          {fields.map((field) => {
                            const isBlank = !field.value || field.value.trim() === '';
                            const isLongText =
                              field.fieldId.includes('address') ||
                              field.fieldId.includes('marks') ||
                              field.fieldId.includes('desc') ||
                              field.value.length > 50 ||
                              field.value.includes('\n');

                            return (
                              <div
                                key={field.fieldId}
                                className={`p-2.5 rounded-lg border transition-all ${
                                  isLongText ? 'col-span-1 sm:col-span-2' : 'col-span-1'
                                } ${
                                  isBlank
                                    ? 'bg-surface border-divider'
                                    : 'bg-surface border-brand-primary/30 shadow-xs'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span
                                    className="text-[11px] font-medium text-content-primary truncate"
                                    title={field.labelInTemplate}
                                  >
                                    {field.labelInTemplate}
                                  </span>
                                  <span
                                    className={`text-[9px] font-mono px-1 py-0.2 rounded ${
                                      field.status === 'POPULATED'
                                        ? 'text-state-success bg-state-success-bg border border-state-success/40'
                                        : 'text-content-muted bg-surface-secondary'
                                    }`}
                                  >
                                    {field.status}
                                  </span>
                                </div>

                                {isLongText ? (
                                  <textarea
                                    rows={3}
                                    value={field.value}
                                    onChange={(e) => onFieldChange(field, 'DG', e.target.value)}
                                    placeholder={`Enter ${field.labelInTemplate}...`}
                                    className="w-full bg-input-bg border border-divider rounded px-2.5 py-1.5 text-xs text-content-primary focus:outline-none focus:border-brand-primary font-mono resize-y"
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={field.value}
                                    onChange={(e) => onFieldChange(field, 'DG', e.target.value)}
                                    placeholder={`Enter ${field.labelInTemplate}...`}
                                    className="w-full bg-input-bg border border-divider rounded px-2.5 py-1 text-xs text-content-primary focus:outline-none focus:border-brand-primary font-mono"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Real-Time SOLAS 74 Multimodal DG A4 Document Preview (52% Width) */}
            <div className="hidden lg:flex flex-1 h-full flex-col bg-surface-secondary overflow-hidden">
              {/* Document Preview Toolbar */}
              <div className="h-11 px-4 border-b border-divider bg-surface flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-brand-primary" />
                  <span className="text-xs font-semibold text-content-primary tracking-wide">
                    Live SOLAS 74 / MARPOL DG Declaration Preview (A4)
                  </span>
                </div>

                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => onPrintPdf('DG')}
                    className="px-2.5 py-1 text-[11px] font-medium rounded bg-surface hover:bg-surface-secondary text-content-primary border border-divider flex items-center space-x-1"
                    title="Print PDF"
                  >
                    <Printer className="w-3 h-3 text-brand-primary" />
                    <span>Print PDF</span>
                  </button>
                  <button
                    onClick={() => onDownloadDocx('DG')}
                    className="px-2.5 py-1 text-[11px] font-medium rounded bg-surface hover:bg-surface-secondary text-content-primary border border-divider flex items-center space-x-1"
                    title="Download Word Document"
                  >
                    <FileText className="w-3 h-3 text-brand-primary" />
                    <span>Word</span>
                  </button>
                  <button
                    onClick={() => onDownloadHtml('DG')}
                    className="px-2.5 py-1 text-[11px] font-medium rounded bg-surface hover:bg-surface-secondary text-content-primary border border-divider flex items-center space-x-1"
                    title="Download HTML"
                  >
                    <ExternalLink className="w-3 h-3 text-brand-accent" />
                    <span>HTML</span>
                  </button>
                </div>
              </div>

              {/* Embedded Live A4 Document Frame */}
              <div className="flex-1 p-3 bg-surface-secondary overflow-auto flex justify-center">
                <iframe
                  srcDoc={liveDgHtml}
                  title="SOLAS DG Live Preview"
                  className="w-full max-w-[850px] h-full bg-white rounded-lg shadow-lg border border-divider"
                />
              </div>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------------
            VIEW 3: Bill of Lading (BOL) Split View
            --------------------------------------------------------------------- */}
        {activeTab === 'bl_manifest' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Column: Grouped Interactive Fields (45% Width) */}
            <div className="w-full lg:w-[48%] h-full flex flex-col border-r border-divider bg-app overflow-hidden">
              {/* Field Filter & Format Bar */}
              <div className="p-3 bg-surface border-b border-divider flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-medium text-content-secondary">Format:</span>
                  <select
                    value={selectedBlFormatId}
                    onChange={(e) => onSelectBlFormat(e.target.value)}
                    className="bg-input-bg border border-divider text-content-primary text-xs rounded-md px-2.5 py-1 focus:outline-none focus:border-brand-primary max-w-[200px] truncate"
                  >
                    {blFormats.map((fmt) => (
                      <option key={fmt.formatId} value={fmt.formatId}>
                        {fmt.formatName}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => onOpenFormatLibrary('BL')}
                    className="p-1 rounded text-brand-primary hover:bg-brand-primary-soft transition-colors"
                    title="Upload custom carrier format"
                  >
                    <FolderPlus className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-content-muted absolute left-2.5 top-2" />
                    <input
                      type="text"
                      placeholder="Search BOL fields..."
                      value={fieldSearch}
                      onChange={(e) => setFieldSearch(e.target.value)}
                      className="bg-input-bg border border-divider text-xs text-content-primary rounded-md pl-8 pr-2 py-1 w-36 focus:outline-none focus:border-brand-primary"
                    />
                  </div>

                  <select
                    value={fieldFilter}
                    onChange={(e) => setFieldFilter(e.target.value as any)}
                    className="bg-input-bg border border-divider text-content-primary text-xs rounded-md px-2 py-1 focus:outline-none focus:border-brand-primary"
                  >
                    <option value="ALL">All ({blStats.total})</option>
                    <option value="POPULATED">Populated ({blStats.populated})</option>
                    <option value="PENDING">Pending ({blStats.total - blStats.populated})</option>
                  </select>
                </div>
              </div>

              {/* Collapsible Grouped Fields Grid */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                {Object.entries(groupedFields).map(([sectionName, fields]) => {
                  const isCollapsed = Boolean(collapsedSections[sectionName]);
                  const populatedCount = fields.filter((f) => f.value && f.value.trim() !== '').length;

                  return (
                    <div
                      key={sectionName}
                      className="border border-divider rounded-xl overflow-hidden bg-surface"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSection(sectionName)}
                        className="w-full px-3.5 py-2.5 bg-surface-secondary hover:bg-brand-primary-soft/50 border-b border-divider flex items-center justify-between text-left transition-colors"
                      >
                        <div className="flex items-center space-x-2">
                          {isCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-content-muted" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-brand-primary" />
                          )}
                          <span className="text-xs font-bold text-content-primary tracking-wide">
                            {sectionName}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface border border-divider text-content-secondary">
                            {populatedCount}/{fields.length}
                          </span>
                        </div>
                      </button>

                      {!isCollapsed && (
                        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-surface-secondary/40">
                          {fields.map((field) => {
                            const isBlank = !field.value || field.value.trim() === '';
                            const isLongText =
                              field.fieldId.includes('address') ||
                              field.fieldId.includes('marks') ||
                              field.fieldId.includes('desc') ||
                              field.value.length > 50 ||
                              field.value.includes('\n');

                            return (
                              <div
                                key={field.fieldId}
                                className={`p-2.5 rounded-lg border transition-all ${
                                  isLongText ? 'col-span-1 sm:col-span-2' : 'col-span-1'
                                } ${
                                  isBlank
                                    ? 'bg-surface border-divider'
                                    : 'bg-surface border-brand-primary/30 shadow-xs'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span
                                    className="text-[11px] font-medium text-content-primary truncate"
                                    title={field.labelInTemplate}
                                  >
                                    {field.labelInTemplate}
                                  </span>
                                  <span
                                    className={`text-[9px] font-mono px-1 py-0.2 rounded ${
                                      field.status === 'POPULATED'
                                        ? 'text-state-success bg-state-success-bg border border-state-success/40'
                                        : 'text-content-muted bg-surface-secondary'
                                    }`}
                                  >
                                    {field.status}
                                  </span>
                                </div>

                                {isLongText ? (
                                  <textarea
                                    rows={3}
                                    value={field.value}
                                    onChange={(e) => onFieldChange(field, 'BL', e.target.value)}
                                    placeholder={`Enter ${field.labelInTemplate}...`}
                                    className="w-full bg-input-bg border border-divider rounded px-2.5 py-1.5 text-xs text-content-primary focus:outline-none focus:border-brand-primary font-mono resize-y"
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={field.value}
                                    onChange={(e) => onFieldChange(field, 'BL', e.target.value)}
                                    placeholder={`Enter ${field.labelInTemplate}...`}
                                    className="w-full bg-input-bg border border-divider rounded px-2.5 py-1 text-xs text-content-primary focus:outline-none focus:border-brand-primary font-mono"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Real-Time Ocean Bill of Lading A4 Document Preview (52% Width) */}
            <div className="hidden lg:flex flex-1 h-full flex-col bg-surface-secondary overflow-hidden">
              {/* Document Preview Toolbar */}
              <div className="h-11 px-4 border-b border-divider bg-surface flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-2">
                  <FileSpreadsheet className="w-4 h-4 text-brand-primary" />
                  <span className="text-xs font-semibold text-content-primary tracking-wide">
                    Live Ocean Bill of Lading Draft Preview (A4)
                  </span>
                </div>

                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => onPrintPdf('BL')}
                    className="px-2.5 py-1 text-[11px] font-medium rounded bg-surface hover:bg-surface-secondary text-content-primary border border-divider flex items-center space-x-1"
                    title="Print PDF"
                  >
                    <Printer className="w-3 h-3 text-brand-primary" />
                    <span>Print PDF</span>
                  </button>
                  <button
                    onClick={() => onDownloadDocx('BL')}
                    className="px-2.5 py-1 text-[11px] font-medium rounded bg-surface hover:bg-surface-secondary text-content-primary border border-divider flex items-center space-x-1"
                    title="Download Word Document"
                  >
                    <FileText className="w-3 h-3 text-brand-primary" />
                    <span>Word</span>
                  </button>
                  <button
                    onClick={() => onDownloadHtml('BL')}
                    className="px-2.5 py-1 text-[11px] font-medium rounded bg-surface hover:bg-surface-secondary text-content-primary border border-divider flex items-center space-x-1"
                    title="Download HTML"
                  >
                    <ExternalLink className="w-3 h-3 text-brand-accent" />
                    <span>HTML</span>
                  </button>
                </div>
              </div>

              {/* Embedded Live A4 Document Frame */}
              <div className="flex-1 p-3 bg-surface-secondary overflow-auto flex justify-center">
                <iframe
                  srcDoc={liveBlHtml}
                  title="BOL Live Preview"
                  className="w-full max-w-[850px] h-full bg-white rounded-lg shadow-lg border border-divider"
                />
              </div>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------------
            VIEW 4: Export Center (.ZIP / PDF / DOCX)
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

        {/* Right Export Buttons */}
        <div className="flex items-center space-x-2 shrink-0">
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
                } else if (val === 'HTML') {
                  onDownloadHtml(targetDoc);
                }
              }}
              className="bg-surface hover:bg-brand-primary-soft text-content-primary text-xs font-medium border border-divider rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-action-ring cursor-pointer transition-colors"
            >
              <option value="" disabled>
                Export Document ({activeTab === 'bl_manifest' ? 'BL' : 'DG'})
              </option>
              <option value="PDF">PDF Document</option>
              <option value="Word">Word (.docx)</option>
              <option value="HTML">Maritime HTML</option>
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
        </div>
      </footer>
    </div>
  );
}
