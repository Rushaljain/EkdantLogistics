import React, { useState, useRef, useMemo } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  FileText,
  File,
  X,
  Play,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Download,
  Copy,
  Check,
  Search,
  Printer,
  Package,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Plus,
  Table as TableIcon,
  FolderPlus
} from 'lucide-react';
import type {
  UploadMode,
  ExtractedShipmentJSON,
  FormatSchemaJSON,
  MappedManifestField,
  FormatDocumentType
} from '../types/index.ts';
import type { ParseSessionProgress } from '../utils/documentParser.ts';
import { DocumentPreviewPanel } from './DocumentPreviewPanel.tsx';
import { groupManifestFieldsBySection } from '../utils/manifestMatcher.ts';

interface WorkspacePageProps {
  mode: UploadMode;
  onModeChange: (mode: UploadMode) => void;
  uploadedFiles: File[];
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onRemoveFile: (index: number) => void;
  onClearFiles: () => void;
  selectedFileIndex: number | null;
  onSelectFileIndex: (index: number | null) => void;
  isParsing: boolean;
  parseProgress: ParseSessionProgress | null;
  apiError: string | null;
  onExecuteParsing: () => void;
  hasParsed: boolean;
  onFlushAndNewShipment: () => void;
  onHardReset: () => void;
  isPurging: boolean;

  // Shipment & Manifest State
  shipmentJson: ExtractedShipmentJSON;
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

  // Export actions
  onPrintPdf: (docType: FormatDocumentType) => void;
  onDownloadDocx: (docType: FormatDocumentType) => void;
  onDownloadHtml: (docType: FormatDocumentType) => void;
  onDownloadJson: (data: any, filename: string) => void;
  onDownloadZip: () => void;
  isExportingZip: boolean;
}

export function WorkspacePage({
  mode,
  onModeChange,
  uploadedFiles,
  onFileSelect,
  onDrop,
  onRemoveFile,
  onClearFiles,
  selectedFileIndex,
  onSelectFileIndex,
  isParsing,
  parseProgress,
  apiError,
  onExecuteParsing,
  hasParsed,
  onFlushAndNewShipment,
  onHardReset,
  isPurging,
  shipmentJson,
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
  onPrintPdf,
  onDownloadDocx,
  onDownloadHtml,
  onDownloadJson,
  onDownloadZip,
  isExportingZip
}: WorkspacePageProps): React.JSX.Element {
  // Panel resizing state
  const [panelAWidth, setPanelAWidth] = useState<number>(250); // Left file panel
  const [panelBWidth, setPanelBWidth] = useState<number>(400); // Center preview panel
  const isDraggingRef = useRef<'panelA' | 'panelB' | null>(null);

  // Tabbed Editor State: 'extracted_data' | 'dg_manifest' | 'bl_manifest'
  const [activeEditorTab, setActiveEditorTab] = useState<'extracted_data' | 'dg_manifest' | 'bl_manifest'>('dg_manifest');
  const [dataSubTab, setDataSubTab] = useState<'audit' | 'pallets' | 'raw_json'>('audit');

  // Search & Filters in Manifest Editor
  const [fieldSearch, setFieldSearch] = useState<string>('');
  const [fieldFilter, setFieldFilter] = useState<'ALL' | 'POPULATED' | 'PENDING'>('ALL');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [copiedJson, setCopiedJson] = useState(false);

  // Bottom action bar document export target
  const [exportTargetDoc, setExportTargetDoc] = useState<FormatDocumentType>('DG');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // File currently selected for preview
  const selectedFile = useMemo(() => {
    if (selectedFileIndex !== null && uploadedFiles[selectedFileIndex]) {
      return uploadedFiles[selectedFileIndex];
    }
    return uploadedFiles[0] || null;
  }, [selectedFileIndex, uploadedFiles]);

  // Handle panel resize drag
  const handleMouseDownResizeA = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = 'panelA';
    const startX = e.clientX;
    const startWidth = panelAWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (isDraggingRef.current === 'panelA') {
        const delta = moveEvent.clientX - startX;
        setPanelAWidth(Math.max(180, Math.min(380, startWidth + delta)));
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseDownResizeB = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = 'panelB';
    const startX = e.clientX;
    const startWidth = panelBWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (isDraggingRef.current === 'panelB') {
        const delta = moveEvent.clientX - startX;
        setPanelBWidth(Math.max(260, Math.min(650, startWidth + delta)));
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

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

  // Grouped fields
  const activeFields = activeEditorTab === 'dg_manifest' ? mappedDgFields : mappedBlFields;
  const activeDocType = activeEditorTab === 'dg_manifest' ? 'DG' : 'BL';

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

  // Extracted Data Audit
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
  const calculatedVgm = (shipmentJson.grossWeightKg || 0) + (shipmentJson.tareWeightKg || 0);

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Top Workspace Header (52px) */}
      <header className="h-13 px-4 border-b border-slate-800/80 bg-slate-900/90 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center space-x-3 truncate">
          <span className="text-xs font-semibold text-white tracking-wide truncate">
            {shipmentJson.invoiceNumbers.length > 0
              ? `Shipment ${shipmentJson.invoiceNumbers.join(', ')}`
              : 'Workspace / Active Draft'}
          </span>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
              hasParsed
                ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {hasParsed ? 'Extracted & Live Synced' : 'Ready for Ingestion'}
          </span>
          {shipmentJson.containerNumber && (
            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/60">
              {shipmentJson.containerNumber}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={onFlushAndNewShipment}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-sm transition-colors"
            title="Archive current shipment and start clean"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Shipment</span>
          </button>

          <button
            onClick={onHardReset}
            disabled={isPurging}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs transition-colors border border-slate-700"
            title="Clear all workspace storage"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isPurging ? 'animate-spin' : ''}`} />
            <span>Reset</span>
          </button>
        </div>
      </header>

      {/* Main 3-Panel Resizable Operational Container */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* =========================================================================
            PANEL A: File List, Mode Selector & Extraction Trigger
            ========================================================================= */}
        <section
          style={{ width: `${panelAWidth}px` }}
          className="h-full flex flex-col bg-slate-950/80 border-r border-slate-800/80 shrink-0 select-none overflow-hidden"
        >
          {/* Panel A Header */}
          <div className="p-3 border-b border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                Source Files ({uploadedFiles.length})
              </span>
              {uploadedFiles.length > 0 && (
                <button
                  onClick={onClearFiles}
                  className="text-[10px] text-rose-400 hover:text-rose-300 transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Mode Selector Toggle */}
            <div className="grid grid-cols-2 p-0.5 bg-slate-900 border border-slate-800 rounded-md">
              <button
                type="button"
                onClick={() => onModeChange('SINGLE_INVOICE')}
                className={`py-1 text-[10px] font-medium rounded transition-colors text-center ${
                  mode === 'SINGLE_INVOICE'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Single Invoice
              </button>
              <button
                type="button"
                onClick={() => onModeChange('MULTI_INVOICE')}
                className={`py-1 text-[10px] font-medium rounded transition-colors text-center ${
                  mode === 'MULTI_INVOICE'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Multi-Invoice
              </button>
            </div>
          </div>

          {/* Compact Upload Dropzone */}
          <div className="p-3 border-b border-slate-800/80">
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border border-dashed border-slate-700 hover:border-cyan-500/60 rounded-lg p-2.5 text-center cursor-pointer bg-slate-900/40 hover:bg-slate-900 transition-colors group"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.xlsx,.xls,.csv"
                className="hidden"
                onChange={onFileSelect}
              />
              <UploadCloud className="w-4 h-4 mx-auto text-slate-500 group-hover:text-cyan-400 transition-colors mb-1" />
              <p className="text-[11px] text-slate-300 font-medium">Add source files</p>
              <p className="text-[9px] text-slate-500">PDF, Excel, CSV</p>
            </div>
          </div>

          {/* File Tile List (scrollable) */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {uploadedFiles.length === 0 ? (
              <div className="py-6 text-center text-[11px] text-slate-500 px-3">
                No files uploaded yet. Drag & drop or browse above.
              </div>
            ) : (
              uploadedFiles.map((file, idx) => {
                const isSelected = selectedFileIndex === idx || (selectedFileIndex === null && idx === 0);
                const isPdf = file.name.toLowerCase().endsWith('.pdf');
                const isSheet =
                  file.name.toLowerCase().endsWith('.xlsx') ||
                  file.name.toLowerCase().endsWith('.xls') ||
                  file.name.toLowerCase().endsWith('.csv');

                return (
                  <div
                    key={`${file.name}-${idx}`}
                    onClick={() => onSelectFileIndex(idx)}
                    className={`group flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors border text-left ${
                      isSelected
                        ? 'bg-blue-950/40 border-cyan-500/40 text-cyan-200'
                        : 'bg-slate-900/40 border-slate-800/60 text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate min-w-0 pr-1">
                      {isPdf ? (
                        <FileText className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      ) : isSheet ? (
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <File className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      )}
                      <div className="truncate">
                        <p className="text-[11px] font-medium truncate leading-tight">{file.name}</p>
                        <p className="text-[9px] font-mono text-slate-500">
                          {(file.size / 1024).toFixed(0)} KB
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveFile(idx);
                        if (selectedFileIndex === idx) {
                          onSelectFileIndex(null);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition-opacity"
                      title="Remove file"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Panel A Footer: Execution Button & Progress */}
          <div className="p-3 border-t border-slate-800/80 bg-slate-950 space-y-2">
            {apiError && (
              <div className="p-2 rounded bg-rose-950/40 border border-rose-900/60 text-rose-300 text-[10px] leading-tight flex items-start space-x-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400 mt-0.5" />
                <span className="truncate">{apiError}</span>
              </div>
            )}

            {isParsing && parseProgress && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-mono text-cyan-400">
                  <span className="truncate">{parseProgress.message || 'Processing...'}</span>
                  <span>
                    {parseProgress.processedFiles}/{parseProgress.totalFiles}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all duration-300"
                    style={{
                      width: `${
                        parseProgress.totalFiles > 0
                          ? Math.round((parseProgress.processedFiles / parseProgress.totalFiles) * 100)
                          : 50
                      }%`
                    }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={onExecuteParsing}
              disabled={uploadedFiles.length === 0 || isParsing}
              className={`w-full py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center space-x-2 transition-all shadow-sm ${
                uploadedFiles.length === 0 || isParsing
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-900/30'
              }`}
            >
              {isParsing ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  <span>Harmonizing...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Extract & Harmonize</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* Resizer Handle A (between Panel A and Panel B) */}
        <div
          onMouseDown={handleMouseDownResizeA}
          className="w-1 hover:w-1.5 bg-slate-800 hover:bg-cyan-500/50 cursor-col-resize transition-all z-10 shrink-0"
          title="Drag to resize source files panel"
        />

        {/* =========================================================================
            PANEL B: Source Document Preview (PDF / Sheet / Text Canvas)
            ========================================================================= */}
        <section
          style={{ width: `${panelBWidth}px` }}
          className="h-full flex flex-col shrink-0 overflow-hidden bg-slate-900"
        >
          <DocumentPreviewPanel key={selectedFile?.name || 'none'} file={selectedFile} />
        </section>

        {/* Resizer Handle B (between Panel B and Panel C) */}
        <div
          onMouseDown={handleMouseDownResizeB}
          className="w-1 hover:w-1.5 bg-slate-800 hover:bg-cyan-500/50 cursor-col-resize transition-all z-10 shrink-0"
          title="Drag to resize document preview panel"
        />

        {/* =========================================================================
            PANEL C: Tabbed Editor (Extracted Data | DG Manifest | Bill of Lading)
            ========================================================================= */}
        <section className="flex-1 h-full flex flex-col bg-slate-950 overflow-hidden min-w-[340px]">
          {/* Panel C Tab Bar */}
          <div className="h-10 border-b border-slate-800/80 bg-slate-900/70 px-3 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => setActiveEditorTab('extracted_data')}
                className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors flex items-center space-x-2 border-b-2 ${
                  activeEditorTab === 'extracted_data'
                    ? 'border-cyan-400 text-cyan-300 bg-slate-800/60'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>Extracted Data</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400">
                  {populatedFieldsCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveEditorTab('dg_manifest')}
                className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors flex items-center space-x-2 border-b-2 ${
                  activeEditorTab === 'dg_manifest'
                    ? 'border-cyan-400 text-cyan-300 bg-slate-800/60'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>DG Manifest</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    dgStats.percentage === 100
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                      : 'bg-slate-800 text-cyan-300'
                  }`}
                >
                  {dgStats.populated}/{dgStats.total}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveEditorTab('bl_manifest')}
                className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors flex items-center space-x-2 border-b-2 ${
                  activeEditorTab === 'bl_manifest'
                    ? 'border-cyan-400 text-cyan-300 bg-slate-800/60'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Bill of Lading</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    blStats.percentage === 100
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                      : 'bg-slate-800 text-cyan-300'
                  }`}
                >
                  {blStats.populated}/{blStats.total}
                </span>
              </button>
            </div>

            {/* Quick Format Name Display */}
            <div className="flex items-center space-x-2">
              <span className="text-[10px] text-slate-400 hidden xl:inline">
                {activeEditorTab === 'dg_manifest'
                  ? `${activeDgFormat.formatName}`
                  : activeEditorTab === 'bl_manifest'
                  ? `${activeBlFormat.formatName}`
                  : 'Universal Ground Truth'}
              </span>
            </div>
          </div>

          {/* Panel C Content Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* =========================================================================
                TAB 1: Extracted Data (Field Audit, Pallet Annex, Raw JSON)
                ========================================================================= */}
            {activeEditorTab === 'extracted_data' && (
              <div className="space-y-3">
                {/* Sub Tab Controls */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setDataSubTab('audit')}
                      className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                        dataSubTab === 'audit'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Field Audit ({populatedFieldsCount}/{auditEntries.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDataSubTab('pallets')}
                      className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                        dataSubTab === 'pallets'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Pallet Annex ({shipmentJson.pallets.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDataSubTab('raw_json')}
                      className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                        dataSubTab === 'raw_json'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Raw JSON
                    </button>
                  </div>

                  {dataSubTab === 'raw_json' && (
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleCopyJson}
                        className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center space-x-1"
                      >
                        {copiedJson ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
                      </button>
                      <button
                        onClick={() => onDownloadJson(shipmentJson, 'extracted_shipment.json')}
                        className="px-2.5 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white flex items-center space-x-1"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Sub Tab: Audit Table */}
                {dataSubTab === 'audit' && (
                  <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/60">
                    <table className="w-full text-left text-xs border-collapse font-mono">
                      <thead>
                        <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 text-[11px]">
                          <th className="px-3 py-2 w-1/3">Canonical Field</th>
                          <th className="px-3 py-2">Extracted Value</th>
                          <th className="px-3 py-2 w-24 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditEntries.map(({ key, displayVal, isBlank }) => (
                          <tr
                            key={key}
                            className="border-b border-slate-800/40 hover:bg-slate-800/40 text-[11px]"
                          >
                            <td className="px-3 py-1.5 text-cyan-300 font-medium">{key}</td>
                            <td className="px-3 py-1.5 text-slate-200 truncate max-w-md">
                              {isBlank ? <span className="text-slate-600 italic">empty</span> : displayVal}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              {isBlank ? (
                                <span className="text-[10px] text-slate-500">pending</span>
                              ) : (
                                <span className="text-[10px] text-emerald-400">populated</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Sub Tab: Pallets Table */}
                {dataSubTab === 'pallets' && (
                  <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/60">
                    {shipmentJson.pallets.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-500">
                        No pallet records extracted yet.
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs border-collapse font-mono">
                        <thead>
                          <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 text-[11px]">
                            <th className="px-3 py-2">Pallet #</th>
                            <th className="px-3 py-2">Model Code</th>
                            <th className="px-3 py-2 text-right">Boxes</th>
                            <th className="px-3 py-2 text-right">Gross (kg)</th>
                            <th className="px-3 py-2 text-right">Net (kg)</th>
                            <th className="px-3 py-2">Source File</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shipmentJson.pallets.map((p, idx) => (
                            <tr
                              key={p.palletNumber || idx}
                              className="border-b border-slate-800/40 hover:bg-slate-800/40 text-[11px]"
                            >
                              <td className="px-3 py-1.5 text-cyan-300 font-semibold">{p.palletNumber}</td>
                              <td className="px-3 py-1.5 text-slate-200">{p.modelCode || '—'}</td>
                              <td className="px-3 py-1.5 text-right text-slate-300">{p.boxCount}</td>
                              <td className="px-3 py-1.5 text-right text-slate-300">{p.grossWeightKg}</td>
                              <td className="px-3 py-1.5 text-right text-slate-300">{p.netWeightKg}</td>
                              <td className="px-3 py-1.5 text-slate-400 truncate max-w-xs">{p.sourceFile || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* Sub Tab: Raw JSON */}
                {dataSubTab === 'raw_json' && (
                  <pre className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-cyan-300 overflow-x-auto max-h-[600px]">
                    {JSON.stringify(shipmentJson, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {/* =========================================================================
                TAB 2 & 3: Manifest Field Editors (DG Manifest & Bill of Lading)
                ========================================================================= */}
            {(activeEditorTab === 'dg_manifest' || activeEditorTab === 'bl_manifest') && (
              <div className="space-y-4">
                {/* Format Selector & Field Filter Bar */}
                <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-medium text-slate-300">Carrier Format:</span>
                    <select
                      value={activeDocType === 'DG' ? selectedDgFormatId : selectedBlFormatId}
                      onChange={(e) => {
                        if (activeDocType === 'DG') {
                          onSelectDgFormat(e.target.value);
                        } else {
                          onSelectBlFormat(e.target.value);
                        }
                      }}
                      className="bg-slate-950 border border-slate-700 text-white text-xs rounded-md px-2.5 py-1 focus:outline-none focus:border-cyan-400"
                    >
                      {(activeDocType === 'DG' ? dgFormats : blFormats).map((fmt) => (
                        <option key={fmt.formatId} value={fmt.formatId}>
                          {fmt.formatName} ({fmt.fields.length} fields)
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => onOpenFormatLibrary(activeDocType)}
                      className="p-1 rounded text-cyan-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
                      title="Upload custom carrier format template"
                    >
                      <FolderPlus className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center space-x-2">
                    {/* Search Field */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
                      <input
                        type="text"
                        placeholder="Search fields or values..."
                        value={fieldSearch}
                        onChange={(e) => setFieldSearch(e.target.value)}
                        className="bg-slate-950 border border-slate-700 text-xs text-white rounded-md pl-8 pr-2.5 py-1 w-44 focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    {/* Filter Status */}
                    <select
                      value={fieldFilter}
                      onChange={(e) => setFieldFilter(e.target.value as any)}
                      className="bg-slate-950 border border-slate-700 text-white text-xs rounded-md px-2 py-1 focus:outline-none focus:border-cyan-400"
                    >
                      <option value="ALL">All Fields</option>
                      <option value="POPULATED">Populated Only</option>
                      <option value="PENDING">Pending Only</option>
                    </select>
                  </div>
                </div>

                {/* Grouped Collapsible Sections */}
                {Object.entries(groupedFields).length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 border border-slate-800 rounded-lg">
                    No fields match your search or filter.
                  </div>
                ) : (
                  Object.entries(groupedFields).map(([sectionName, fields]) => {
                    const isCollapsed = !!collapsedSections[sectionName];
                    const populatedCount = fields.filter((f) => f.value && f.value.trim() !== '').length;

                    return (
                      <div
                        key={sectionName}
                        className="border border-slate-800/90 rounded-lg overflow-hidden bg-slate-900/50"
                      >
                        {/* Section Header */}
                        <button
                          type="button"
                          onClick={() => toggleSection(sectionName)}
                          className="w-full px-3.5 py-2.5 bg-slate-900/90 hover:bg-slate-800/80 border-b border-slate-800 flex items-center justify-between text-left transition-colors"
                        >
                          <div className="flex items-center space-x-2">
                            {isCollapsed ? (
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-cyan-400" />
                            )}
                            <span className="text-xs font-semibold text-white tracking-wide">
                              {sectionName}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                              {populatedCount}/{fields.length}
                            </span>
                          </div>
                        </button>

                        {/* Section Fields Grid */}
                        {!isCollapsed && (
                          <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-950/40">
                            {fields.map((field) => {
                              const isBlank = !field.value || field.value.trim() === '';
                              const isLongText =
                                field.fieldId.includes('address') ||
                                field.fieldId.includes('marks') ||
                                field.fieldId.includes('desc') ||
                                field.value.length > 60 ||
                                field.value.includes('\n');

                              return (
                                <div
                                  key={field.fieldId}
                                  className={`p-2.5 rounded-md border transition-all ${
                                    isBlank
                                      ? 'bg-slate-900/30 border-slate-800'
                                      : 'bg-slate-900/80 border-slate-700/80'
                                  }`}
                                >
                                  <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center space-x-1.5 truncate">
                                      <span
                                        className="text-xs font-medium text-slate-200 truncate"
                                        title={field.labelInTemplate}
                                      >
                                        {field.labelInTemplate}
                                      </span>
                                    </div>

                                    <span
                                      className={`text-[9px] font-mono px-1 py-0.2 rounded ${
                                        field.status === 'POPULATED'
                                          ? 'text-emerald-400 bg-emerald-950/40 border border-emerald-800/40'
                                          : 'text-slate-500 bg-slate-800'
                                      }`}
                                    >
                                      {field.status}
                                    </span>
                                  </div>

                                  {isLongText ? (
                                    <textarea
                                      rows={3}
                                      value={field.value}
                                      onChange={(e) => onFieldChange(field, activeDocType, e.target.value)}
                                      placeholder={`Enter ${field.labelInTemplate}...`}
                                      className="w-full bg-slate-950 border border-slate-700/80 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono resize-y"
                                    />
                                  ) : (
                                    <input
                                      type="text"
                                      value={field.value}
                                      onChange={(e) => onFieldChange(field, activeDocType, e.target.value)}
                                      placeholder={`Enter ${field.labelInTemplate}...`}
                                      className="w-full bg-slate-950 border border-slate-700/80 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* =========================================================================
          PERSISTENT BOTTOM ACTION BAR
          ========================================================================= */}
      <footer className="h-13 px-4 border-t border-slate-800/80 bg-slate-900/95 flex items-center justify-between shrink-0 z-20 shadow-lg">
        {/* Left summary readouts */}
        <div className="flex items-center space-x-3 text-xs font-mono truncate">
          <div className="flex items-center space-x-1.5 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
            <span className="text-slate-400">DG:</span>
            <span className="text-cyan-300 font-semibold">
              {dgStats.populated}/{dgStats.total}
            </span>
          </div>

          <div className="flex items-center space-x-1.5 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
            <span className="text-slate-400">BL:</span>
            <span className="text-cyan-300 font-semibold">
              {blStats.populated}/{blStats.total}
            </span>
          </div>

          {shipmentJson.grossWeightKg > 0 && (
            <div className="hidden sm:flex items-center space-x-1.5 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
              <span className="text-slate-400">Gross:</span>
              <span className="text-emerald-400">
                {shipmentJson.grossWeightKg.toLocaleString()} kg
              </span>
            </div>
          )}

          {calculatedVgm > 0 && (
            <div className="hidden md:flex items-center space-x-1.5 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
              <span className="text-slate-400">VGM:</span>
              <span className="text-emerald-400 font-semibold">
                {calculatedVgm.toLocaleString()} kg
              </span>
            </div>
          )}
        </div>

        {/* Right Export Buttons */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Target doc toggle for exports */}
          <div className="flex bg-slate-950 border border-slate-800 rounded p-0.5 mr-1">
            <button
              onClick={() => setExportTargetDoc('DG')}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                exportTargetDoc === 'DG' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              DG
            </button>
            <button
              onClick={() => setExportTargetDoc('BL')}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                exportTargetDoc === 'BL' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              BL
            </button>
          </div>

          <button
            onClick={() => onPrintPdf(exportTargetDoc)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium border border-slate-700 transition-colors"
            title={`Print-Ready PDF (${exportTargetDoc})`}
          >
            <Printer className="w-3.5 h-3.5 text-cyan-400" />
            <span>PDF</span>
          </button>

          <button
            onClick={() => onDownloadDocx(exportTargetDoc)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium border border-slate-700 transition-colors"
            title={`Editable Word Document (${exportTargetDoc})`}
          >
            <FileText className="w-3.5 h-3.5 text-blue-400" />
            <span>Word</span>
          </button>

          <button
            onClick={() => onDownloadHtml(exportTargetDoc)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium border border-slate-700 transition-colors"
            title={`Maritime Submission HTML (${exportTargetDoc})`}
          >
            <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
            <span>HTML</span>
          </button>

          <button
            onClick={onDownloadZip}
            disabled={isExportingZip}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-sm transition-all"
            title="Download Complete Shipment Package (.zip)"
          >
            <Package className={`w-3.5 h-3.5 ${isExportingZip ? 'animate-spin' : ''}`} />
            <span>{isExportingZip ? 'Compiling ZIP...' : 'Package (.zip)'}</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
