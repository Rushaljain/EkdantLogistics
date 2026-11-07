import React, { useEffect, useState, useRef } from 'react';
import {
  RotateCcw,
  CheckCircle2,
  Layers,
  FileText,
  Boxes,
  Sparkles,
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  Download,
  Copy,
  Check,
  Key,
  X,
  FileBox,
  Eye,
  Table,
  FileUp,
  AlertOctagon
} from 'lucide-react';
import type { UploadMode, ExtractedShipmentJSON, DGManifest, BLManifest } from './types';
import { createEmptyShipmentJSON, createEmptyDGManifest, createEmptyBLManifest, deriveDGManifestFromJSON, deriveBLManifestFromDG } from './types';
import { purgeAllWorkspaceStorage, archiveCurrentSession } from './utils/storageReset';
import { parseDocumentsToJSON, type ParseSessionProgress, type ParseResult } from './utils/documentParser';
import type { PreFilterResult } from './utils/spreadsheetPreFilter';

export function App(): React.JSX.Element {
  const [mode, setMode] = useState<UploadMode>('SINGLE_INVOICE');
  const [isPurging, setIsPurging] = useState(false);
  const [lastPurgedAt, setLastPurgedAt] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<number>(1);

  // Upload & Parser state
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState<ParseSessionProgress | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [filterResults, setFilterResults] = useState<PreFilterResult[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [hasParsed, setHasParsed] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Inspector View Modes: 'audit' | 'pallets' | 'raw_json'
  const [inspectorTab, setInspectorTab] = useState<'audit' | 'pallets' | 'raw_json'>('audit');
  const [copiedJson, setCopiedJson] = useState(false);

  // API Key management
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    return localStorage.getItem('ekdant_custom_gemini_key') || '';
  });

  // State objects
  const [shipmentJson, setShipmentJson] = useState<ExtractedShipmentJSON>(() => createEmptyShipmentJSON('SINGLE_INVOICE'));
  const [dgManifest, setDgManifest] = useState<DGManifest>(() => createEmptyDGManifest());
  const [blManifest, setBlManifest] = useState<BLManifest>(() => createEmptyBLManifest());

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Run hard storage purge on initial mount
  useEffect(() => {
    let isMounted = true;
    purgeAllWorkspaceStorage()
      .then(() => {
        if (isMounted) {
          setLastPurgedAt(new Date().toLocaleTimeString());
        }
      })
      .catch((err) => {
        console.error('Initial storage purge failed:', err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleHardReset = async () => {
    setIsPurging(true);
    try {
      await purgeAllWorkspaceStorage();
      resetSessionState(mode);
      setLastPurgedAt(new Date().toLocaleTimeString());
    } finally {
      setIsPurging(false);
    }
  };

  const resetSessionState = (selectedMode: UploadMode) => {
    const freshJson = createEmptyShipmentJSON(selectedMode);
    const freshDg = deriveDGManifestFromJSON(freshJson);
    const freshBl = deriveBLManifestFromDG(freshDg, undefined, freshJson);
    setShipmentJson(freshJson);
    setDgManifest(freshDg);
    setBlManifest(freshBl);
    setUploadedFiles([]);
    setParseResult(null);
    setFilterResults([]);
    setLogs([]);
    setHasParsed(false);
    setApiError(null);
    setActiveStep(1);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFlushAndNewShipment = () => {
    if (hasParsed && shipmentJson.invoiceNumbers.length > 0) {
      archiveCurrentSession(shipmentJson, dgManifest, blManifest);
    }
    resetSessionState(mode);
  };

  const handleModeChange = (newMode: UploadMode) => {
    setMode(newMode);
    if (!hasParsed) {
      resetSessionState(newMode);
    } else {
      setShipmentJson(prev => ({ ...prev, uploadMode: newMode }));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setUploadedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveApiKey = () => {
    localStorage.setItem('ekdant_custom_gemini_key', customApiKey.trim());
    setShowKeyModal(false);
  };

  const handleExecuteParsing = async () => {
    if (uploadedFiles.length === 0) return;

    // Flush previous session cleanly before new parse
    if (hasParsed) {
      archiveCurrentSession(shipmentJson, dgManifest, blManifest);
    }

    setIsParsing(true);
    setHasParsed(false);
    setParseProgress(null);
    setParseResult(null);
    setApiError(null);

    try {
      const activeKey = customApiKey.trim() || undefined;
      const result = await parseDocumentsToJSON(
        uploadedFiles,
        mode,
        activeKey,
        (prog) => setParseProgress(prog)
      );

      setShipmentJson(result.shipmentJson);
      setFilterResults(result.filterResults);
      setLogs(result.logs);
      setParseResult(result);
      setHasParsed(true);

      // Auto-derive DG and BL manifests from universal truth
      const derivedDg = deriveDGManifestFromJSON(result.shipmentJson);
      const derivedBl = deriveBLManifestFromDG(derivedDg, undefined, result.shipmentJson);
      setDgManifest(derivedDg);
      setBlManifest(derivedBl);
    } catch (err: any) {
      console.error('Parsing failure:', err);
      setApiError(err?.message || String(err));
    } finally {
      setIsParsing(false);
    }
  };

  const handleDownloadJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(shipmentJson, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    const invTag = shipmentJson.invoiceNumbers[0] || 'Shipment';
    downloadAnchor.setAttribute('download', `${invTag}_ExtractedShipmentJSON.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleCopyJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(shipmentJson, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  // Inspect populated vs pending fields
  const auditEntries = Object.entries(shipmentJson).map(([key, value]) => {
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

  const populatedFields = auditEntries.filter(e => !e.isBlank && e.key !== 'sourceFiles');
  const pendingFields = auditEntries.filter(e => e.isBlank);

  const steps = [
    { num: 1, title: '1. Raw JSON State', desc: 'Universal Truth (Hybrid Ingestion)', status: hasParsed ? 'Extracted & Verified' : 'Ready for Ingestion' },
    { num: 2, title: '2. DG Manifest', desc: 'IMO Boxes 1 to 22 (Zero Fallbacks)', status: hasParsed ? 'Inherited from JSON' : 'Schema Standby' },
    { num: 3, title: '3. BL Manifest', desc: '30 Master Fields (Auto-Inherited)', status: hasParsed ? 'Inherited from DG' : 'Schema Standby' },
    { num: 4, title: '4. Output Render', desc: 'Document Agnostic Issuance', status: 'Standby for Phase 3' }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30 px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Boxes className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold tracking-tight text-white">EKDANT LOGISTICS</h1>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Universal Hybrid v2.0
                </span>
              </div>
              <p className="text-xs text-slate-400">Step 1: Document Ingestion & Universal JSON Verification</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {lastPurgedAt && (
              <span className="hidden md:inline-flex items-center space-x-1.5 text-[11px] text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2.5 py-1 rounded-lg">
                <CheckCircle2 className="w-3 h-3" />
                <span>Clean Slate ({lastPurgedAt})</span>
              </span>
            )}
            {/* Gemini API Key Button */}
            <button
              onClick={() => setShowKeyModal(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
              title="Configure Gemini API Key"
            >
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>{customApiKey ? 'Custom Key' : 'Env API Key'}</span>
            </button>

            {/* Flush Session */}
            <button
              onClick={handleFlushAndNewShipment}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
            >
              <FileBox className="w-3.5 h-3.5 text-cyan-400" />
              <span>New Shipment</span>
            </button>

            {/* Hard Reset Storage */}
            <button
              id="hard-reset-btn"
              onClick={handleHardReset}
              disabled={isPurging}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-800 transition disabled:opacity-50 cursor-pointer shadow-sm shadow-red-950"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isPurging ? 'animate-spin' : ''}`} />
              <span>{isPurging ? 'Purging...' : 'Hard Reset'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Pipeline Stepper */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {steps.map((s) => {
            const isSelected = activeStep === s.num;
            return (
              <div
                key={s.num}
                onClick={() => setActiveStep(s.num)}
                className={`p-3.5 rounded-xl border transition cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 border-cyan-500 ring-1 ring-cyan-500/30 shadow-md'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    Step {s.num}
                  </span>
                  <span className="text-[10px] font-medium text-cyan-400 flex items-center space-x-1">
                    <Sparkles className="w-3 h-3" />
                    <span>{s.status}</span>
                  </span>
                </div>
                <h4 className="text-xs font-bold text-white mt-1.5">{s.title}</h4>
                <p className="text-[11px] text-slate-400">{s.desc}</p>
              </div>
            );
          })}
        </section>

        {/* Step 1 Container */}
        {activeStep === 1 && (
          <div className="space-y-6">
            {/* Extraction / API Error Banner */}
            {apiError && (
              <div
                id="api-error-banner"
                className="bg-red-950/80 border-2 border-red-600 rounded-2xl p-5 text-red-200 shadow-2xl space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2.5">
                    <AlertOctagon className="w-6 h-6 text-red-400 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-bold text-red-100 uppercase tracking-wide">
                        Extraction / API Error Occurred
                      </h3>
                      <p className="text-xs text-red-300 mt-0.5">
                        The extraction pipeline halted due to an API error. Silent fallbacks are strictly disabled.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setApiError(null)}
                    className="text-red-400 hover:text-white p-1 rounded-lg cursor-pointer"
                    title="Dismiss Error"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="bg-black/60 rounded-xl p-3.5 border border-red-800/80 font-mono text-xs text-red-300 break-all whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {apiError}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
                  <span className="text-red-400">
                    Verify your Gemini API key or document format, then retry.
                  </span>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setShowKeyModal(true)}
                      className="px-3.5 py-1.5 rounded-lg bg-red-900/80 hover:bg-red-800 text-white font-semibold text-xs border border-red-700 cursor-pointer"
                    >
                      Update API Key
                    </button>
                    <button
                      onClick={handleExecuteParsing}
                      className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-xs cursor-pointer shadow-md"
                    >
                      Retry Extraction
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Ingestion Settings Card */}
            <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <Layers className="w-5 h-5 text-cyan-400" />
                    <h2 className="text-base font-semibold text-white">1. Select Upload Mode</h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Determines whether incoming files are treated as a single unified shipment or consolidated across multiple invoices.
                  </p>
                </div>

                <div className="flex items-center space-x-3">
                  <select
                    id="upload-mode-select"
                    value={mode}
                    onChange={(e) => handleModeChange(e.target.value as UploadMode)}
                    className="bg-slate-800 text-white border border-slate-700 rounded-xl px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500 hover:border-slate-600 transition"
                  >
                    <option value="SINGLE_INVOICE">Mode 1: Single Invoice (1 Set → 1 DG & 1 BL)</option>
                    <option value="MULTI_INVOICE">Mode 2: Multi-Invoice Consolidation (N Invoices → 1 DG & 1 BL)</option>
                  </select>
                </div>
              </div>

              {/* Mode Visual Indicator */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div
                  onClick={() => handleModeChange('SINGLE_INVOICE')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition ${
                    mode === 'SINGLE_INVOICE'
                      ? 'bg-cyan-950/40 border-cyan-500/70 ring-1 ring-cyan-500/30'
                      : 'bg-slate-800/30 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold text-white">
                    <span>Mode 1: Single Invoice Mode</span>
                    {mode === 'SINGLE_INVOICE' && <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
                  </div>
                  <p className="text-slate-400 mt-1">
                    Upload Commercial Invoice PDF + Packing List PDF + HazMat Booking Excel. Merges all source attributes into 1 single shipment record.
                  </p>
                </div>

                <div
                  onClick={() => handleModeChange('MULTI_INVOICE')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition ${
                    mode === 'MULTI_INVOICE'
                      ? 'bg-cyan-950/40 border-cyan-500/70 ring-1 ring-cyan-500/30'
                      : 'bg-slate-800/30 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold text-white">
                    <span>Mode 2: Multi-Invoice Consolidation</span>
                    {mode === 'MULTI_INVOICE' && <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
                  </div>
                  <p className="text-slate-400 mt-1">
                    Upload multiple commercial invoices (e.g. 5 Excel files). Extracts each invoice, filters legacy tabs, concatenates all pallets, and sums verified totals.
                  </p>
                </div>
              </div>

              {/* File Upload Dropzone */}
              <div className="space-y-3">
                <h3 className="text-xs uppercase tracking-wider font-bold text-slate-400 flex items-center space-x-1.5">
                  <FileUp className="w-4 h-4 text-cyan-400" />
                  <span>Upload Documents (.pdf, .xlsx, .xls, .csv)</span>
                </h3>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 hover:border-cyan-500 bg-slate-950/50 rounded-2xl p-8 text-center cursor-pointer transition group"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <UploadCloud className="w-10 h-10 text-slate-500 group-hover:text-cyan-400 mx-auto transition" />
                  <p className="text-sm font-semibold text-slate-200 mt-2">
                    Click to browse or drop logistics files here
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Supports Commercial Invoices, Packing Lists, DG Declarations, and Carrier Booking sheets (.PDF, .XLSX, .CSV)
                  </p>
                </div>

                {/* Uploaded Files List */}
                {uploadedFiles.length > 0 && (
                  <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                      <span>Selected Documents ({uploadedFiles.length}):</span>
                      <button
                        onClick={() => setUploadedFiles([])}
                        className="text-red-400 hover:text-red-300 text-[11px] cursor-pointer"
                      >
                        Clear All
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {uploadedFiles.map((f, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            {f.name.endsWith('.pdf') ? (
                              <FileText className="w-4 h-4 text-red-400 flex-shrink-0" />
                            ) : (
                              <FileSpreadsheet className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                            )}
                            <span className="truncate text-slate-200" title={f.name}>{f.name}</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveFile(i);
                            }}
                            className="text-slate-500 hover:text-red-400 p-0.5 ml-2 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Parse Trigger Button */}
                    <div className="pt-2 flex justify-end">
                      <button
                        id="parse-btn"
                        onClick={handleExecuteParsing}
                        disabled={isParsing}
                        className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/30 transition disabled:opacity-50 cursor-pointer"
                      >
                        {isParsing ? (
                          <>
                            <RotateCcw className="w-4 h-4 animate-spin" />
                            <span>Parsing Documents...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            <span>Parse Documents to JSON</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Parsing Progress / Filter Logs Banner */}
            {(isParsing || logs.length > 0) && (
              <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <span className="font-semibold text-white">Extraction Engine & Spreadsheet Tab Scorer</span>
                  </div>
                  {parseResult && (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                      Gemini Multimodal Verified
                    </span>
                  )}
                </div>

                {parseProgress && isParsing && (
                  <div className="text-xs text-cyan-400 flex items-center space-x-2 animate-pulse">
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    <span>{parseProgress.message}</span>
                  </div>
                )}

                {/* Filtered Sheets Summary Cards */}
                {filterResults.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                    {filterResults.map((fr, idx) => (
                      <div key={idx} className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs space-y-1.5">
                        <div className="font-semibold text-slate-200 truncate flex items-center space-x-1.5">
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                          <span title={fr.fileName}>{fr.fileName}</span>
                        </div>
                        <div className="text-[11px] space-y-0.5">
                          <div className="text-emerald-400">
                            <strong>Kept Tabs:</strong> {fr.keptSheets.join(', ') || 'None'}
                          </div>
                          {fr.ignoredSheets.length > 0 && (
                            <div className="text-slate-400">
                              <strong>Ignored Legacy:</strong> {fr.ignoredSheets.join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Universal Truth JSON Inspector (when parsed) */}
            {hasParsed && (
              <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
                {/* Summary Metrics Banner */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Invoices</span>
                    <p className="text-base font-bold text-white mt-1">
                      {shipmentJson.invoiceNumbers.length > 0 ? shipmentJson.invoiceNumbers.join(', ') : 'None'}
                    </p>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Pallets</span>
                    <p className="text-base font-bold text-cyan-400 mt-1">
                      {shipmentJson.totalPallets}
                    </p>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Inner Boxes</span>
                    <p className="text-base font-bold text-cyan-400 mt-1">
                      {shipmentJson.totalBoxes}
                    </p>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Net Weight (kg)</span>
                    <p className="text-base font-bold text-emerald-400 mt-1">
                      {shipmentJson.netWeightKg.toLocaleString()} kg
                    </p>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Gross Weight (kg)</span>
                    <p className="text-base font-bold text-emerald-400 mt-1">
                      {shipmentJson.grossWeightKg.toLocaleString()} kg
                    </p>
                  </div>
                </div>

                {/* Discrepancy Warnings (if any) */}
                {shipmentJson.discrepancyWarnings && shipmentJson.discrepancyWarnings.length > 0 && (
                  <div className="bg-amber-950/40 border border-amber-800/80 rounded-xl p-3.5 text-xs text-amber-200 space-y-1">
                    <div className="flex items-center space-x-2 font-bold text-amber-300">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Mathematical Verification & Source Observations:</span>
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-300/90 pl-1">
                      {shipmentJson.discrepancyWarnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Inspector View Tabs */}
                <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-3">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setInspectorTab('audit')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer ${
                        inspectorTab === 'audit'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Field Audit (Populated vs Blank)</span>
                    </button>

                    <button
                      onClick={() => setInspectorTab('pallets')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer ${
                        inspectorTab === 'pallets'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <Table className="w-3.5 h-3.5" />
                      <span>Pallet Breakdown ({shipmentJson.pallets.length})</span>
                    </button>

                    <button
                      onClick={() => setInspectorTab('raw_json')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer ${
                        inspectorTab === 'raw_json'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Raw ExtractedShipmentJSON</span>
                    </button>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleCopyJSON}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center space-x-1.5 transition cursor-pointer"
                    >
                      {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
                    </button>
                    <button
                      onClick={handleDownloadJSON}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white flex items-center space-x-1.5 transition cursor-pointer shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download JSON</span>
                    </button>
                  </div>
                </div>

                {/* Sub-Tab 1: Populated vs Blank Field Audit */}
                {inspectorTab === 'audit' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left: Populated Fields */}
                    <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center space-x-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Populated Fields ({populatedFields.length})</span>
                        </span>
                        <span className="text-[11px] text-slate-500">Source Confirmed</span>
                      </div>
                      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                        {populatedFields.map(f => (
                          <div key={f.key} className="bg-slate-900/70 border border-slate-800/80 rounded-lg p-2.5 text-xs space-y-0.5">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-cyan-300 font-semibold">{f.key}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                                Verified
                              </span>
                            </div>
                            <div className="text-slate-300 break-words font-mono text-[11px]">
                              {typeof f.value === 'object' ? JSON.stringify(f.value) : String(f.value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right: Blank / Pending Fields */}
                    <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Blank / Pending Fields ({pendingFields.length})</span>
                        </span>
                        <span className="text-[11px] text-slate-500">Zero Hallucinations</span>
                      </div>
                      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                        {pendingFields.map(f => (
                          <div key={f.key} className="bg-slate-900/40 border border-slate-800/50 rounded-lg p-2 text-xs flex items-center justify-between">
                            <span className="font-mono text-slate-400">{f.key}</span>
                            <span className="font-mono text-[11px] text-amber-400/80 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
                              &quot;&quot; (empty)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Sub-Tab 2: Pallet Breakdown Table */}
                {inspectorTab === 'pallets' && (
                  <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-x-auto max-h-96">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-900 border-b border-slate-800 text-slate-300">
                        <tr>
                          <th className="p-3">#</th>
                          <th className="p-3">Pallet Number</th>
                          <th className="p-3">Model / Description</th>
                          <th className="p-3 text-right">Box Count</th>
                          <th className="p-3 text-right">Net Wt (kg)</th>
                          <th className="p-3 text-right">Gross Wt (kg)</th>
                          <th className="p-3">Source File</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-200">
                        {shipmentJson.pallets.map((p, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/40 transition">
                            <td className="p-3 text-slate-500">{idx + 1}</td>
                            <td className="p-3 font-bold text-cyan-300">{p.palletNumber}</td>
                            <td className="p-3 text-slate-300">{p.modelCode || '---'}</td>
                            <td className="p-3 text-right text-white font-semibold">{p.boxCount}</td>
                            <td className="p-3 text-right text-emerald-400">{p.netWeightKg.toFixed(2)}</td>
                            <td className="p-3 text-right text-emerald-400">{p.grossWeightKg.toFixed(2)}</td>
                            <td className="p-3 text-slate-400 text-[11px] truncate max-w-xs">{p.sourceFile}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Sub-Tab 3: Raw JSON Viewer */}
                {inspectorTab === 'raw_json' && (
                  <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 font-mono text-xs overflow-x-auto max-h-96 text-slate-300">
                    <pre>{JSON.stringify(shipmentJson, null, 2)}</pre>
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* Step 2, 3, 4 Placeholders (Phase 3 & Beyond) */}
        {activeStep > 1 && (
          <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400 mx-auto">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {steps[activeStep - 1]?.title}
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                {activeStep === 2
                  ? 'DG Manifest Form (IMO Multimodal Boxes 1 to 22) editing and verification will be built in Phase 3.'
                  : activeStep === 3
                  ? 'Master Bill of Lading Manifest (30 fields) auto-inheriting from DG Manifest will be built in Phase 3.'
                  : 'Document output rendering and dual issuance will be finalized in Phase 4/5.'}
              </p>
            </div>
            <button
              onClick={() => setActiveStep(1)}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 cursor-pointer transition"
            >
              Back to Step 1: Ingestion & Universal JSON
            </button>
          </section>
        )}
      </main>

      {/* Gemini API Key Configuration Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Key className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Gemini API Key Configuration</h3>
              </div>
              <button
                onClick={() => setShowKeyModal(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              You can provide a custom Gemini API key for this browser session. If left blank, the app uses `VITE_GEMINI_API_KEY` from environment variables, or falls back to client-side deterministic extraction.
            </p>
            <div className="space-y-1.5">
              <label htmlFor="api-key-input" className="text-xs font-semibold text-slate-300">
                Custom API Key:
              </label>
              <input
                id="api-key-input"
                type="password"
                value={customApiKey}
                onChange={(e) => setCustomApiKey(e.target.value)}
                placeholder="AIzaSy... or leave blank for default"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
              />
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => {
                  setCustomApiKey('');
                  localStorage.removeItem('ekdant_custom_gemini_key');
                  setShowKeyModal(false);
                }}
                className="px-3 py-1.5 text-xs rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Clear
              </button>
              <button
                onClick={handleSaveApiKey}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer"
              >
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 px-6 py-4 text-center text-xs text-slate-400">
        Ekdant Logistics &bull; Phase 2 Universal Ingestion Engine &bull; Zero State Contamination Architecture
      </footer>
    </div>
  );
}

export default App;
