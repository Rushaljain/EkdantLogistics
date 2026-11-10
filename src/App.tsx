import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  RotateCcw,
  CheckCircle2,
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
  AlertOctagon,
  Plus,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Search,
  FolderPlus,
  CheckCheck,
  SlidersHorizontal,
  Printer,
  Package,
  ExternalLink,
  FileCheck
} from 'lucide-react';
import type {
  UploadMode,
  ExtractedShipmentJSON,
  DGManifest,
  BLManifest,
  FormatDocumentType,
  FormatSchemaJSON,
  MappedManifestField
} from './types/index.ts';
import {
  createEmptyShipmentJSON,
  createEmptyDGManifest,
  createEmptyBLManifest,
  deriveDGManifestFromJSON,
  deriveBLManifestFromDG
} from './types/index.ts';
import { purgeAllWorkspaceStorage, archiveCurrentSession } from './utils/storageReset.ts';
import { parseDocumentsToJSON, type ParseSessionProgress, type ParseResult } from './utils/documentParser.ts';
import type { PreFilterResult } from './utils/spreadsheetPreFilter.ts';
import {
  DEFAULT_DG_FORMAT,
  DEFAULT_BL_FORMAT,
  getSavedFormats,
  saveFormatToLibrary,
  deleteFormatFromLibrary,
  clearFormatLibrary,
  parseTargetFormat,
  type ParseFormatProgress
} from './utils/formatParser.ts';
import {
  buildMappedManifest,
  updateShipmentFromManifestField,
  getManifestStats,
  groupManifestFieldsBySection
} from './utils/manifestMatcher.ts';
import {
  generateManifestHtml,
  downloadManifestHtml,
  printManifestToPdf,
  downloadManifestDocx,
  downloadCompleteShipmentPackage
} from './utils/documentExporter.ts';

export function App(): React.JSX.Element {
  const [mode, setMode] = useState<UploadMode>('SINGLE_INVOICE');
  const [isPurging, setIsPurging] = useState(false);
  const [lastPurgedAt, setLastPurgedAt] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<number>(1);

  // Upload & Parser state
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState<ParseSessionProgress | null>(null);
  const [, setParseResult] = useState<ParseResult | null>(null);
  const [, setFilterResults] = useState<PreFilterResult[]>([]);
  const [, setLogs] = useState<string[]>([]);
  const [hasParsed, setHasParsed] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Inspector View Modes for Step 1: 'audit' | 'pallets' | 'raw_json'
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

  // Phase 3 Format Library & Matcher State
  const [formats, setFormats] = useState<FormatSchemaJSON[]>(() => getSavedFormats());
  const [selectedDgFormatId, setSelectedDgFormatId] = useState<string>(DEFAULT_DG_FORMAT.formatId);
  const [selectedBlFormatId, setSelectedBlFormatId] = useState<string>(DEFAULT_BL_FORMAT.formatId);
  const [dgCustomOverrides, setDgCustomOverrides] = useState<Record<string, string>>({});
  const [blCustomOverrides, setBlCustomOverrides] = useState<Record<string, string>>({});
  const [fieldFilter, setFieldFilter] = useState<'ALL' | 'POPULATED' | 'PENDING'>('ALL');
  const [fieldSearch, setFieldSearch] = useState<string>('');

  // Unified Format Library & Template Uploader State
  const [showFormatLibraryModal, setShowFormatLibraryModal] = useState(false);
  const [formatUploadDocType, setFormatUploadDocType] = useState<FormatDocumentType>('DG');
  const [formatUploadName, setFormatUploadName] = useState<string>('');
  const [formatUploadFile, setFormatUploadFile] = useState<File | null>(null);
  const [isUploadingFormat, setIsUploadingFormat] = useState(false);
  const [formatUploadProgress, setFormatUploadProgress] = useState<ParseFormatProgress | null>(null);
  const [formatUploadError, setFormatUploadError] = useState<string | null>(null);
  const [isDragOverFormat, setIsDragOverFormat] = useState(false);

  // Step 4 Output Render & Verification Center State
  const [outputTab, setOutputTab] = useState<'DG' | 'BL' | 'PALLETS'>('DG');
  const [includePalletAnnex, setIncludePalletAnnex] = useState(true);
  const [isExportingZip, setIsExportingZip] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const formatFileInputRef = useRef<HTMLInputElement | null>(null);

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
    setDgCustomOverrides({});
    setBlCustomOverrides({});
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
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setUploadedFiles(prev => [...prev, ...filesArray]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      const filesArray = Array.from(e.dataTransfer.files);
      setUploadedFiles(prev => [...prev, ...filesArray]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearFiles = () => {
    setUploadedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSaveApiKey = () => {
    const trimmed = customApiKey.trim();
    if (trimmed) {
      localStorage.setItem('ekdant_custom_gemini_key', trimmed);
    } else {
      localStorage.removeItem('ekdant_custom_gemini_key');
    }
    setShowKeyModal(false);
  };

  const handleExecuteParsing = async () => {
    if (uploadedFiles.length === 0) return;

    setIsParsing(true);
    setParseProgress(null);
    setApiError(null);
    setLogs([]);
    setFilterResults([]);

    try {
      const result = await parseDocumentsToJSON(
        uploadedFiles,
        mode,
        customApiKey || undefined,
        (progress) => {
          setParseProgress(progress);
        }
      );

      setParseResult(result);
      setShipmentJson(result.shipmentJson);
      setFilterResults(result.filterResults);
      setLogs(result.logs);
      setHasParsed(true);

      const derivedDg = deriveDGManifestFromJSON(result.shipmentJson);
      setDgManifest(derivedDg);
      const derivedBl = deriveBLManifestFromDG(derivedDg, undefined, result.shipmentJson);
      setBlManifest(derivedBl);
    } catch (err: any) {
      console.error('Document parsing halted due to error:', err);
      setApiError(err?.message || 'An unexpected error occurred during extraction.');
      setHasParsed(false);
    } finally {
      setIsParsing(false);
    }
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(shipmentJson, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleDownloadJson = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // =========================================================================
  // Phase 3 Matcher & Auto-Inheritance Logic
  // =========================================================================

  const dgFormats = useMemo(() => formats.filter(f => f.documentType === 'DG'), [formats]);
  const blFormats = useMemo(() => formats.filter(f => f.documentType === 'BL'), [formats]);

  const activeDgFormat = useMemo(() => {
    return dgFormats.find(f => f.formatId === selectedDgFormatId) || dgFormats[0] || DEFAULT_DG_FORMAT;
  }, [dgFormats, selectedDgFormatId]);

  const activeBlFormat = useMemo(() => {
    return blFormats.find(f => f.formatId === selectedBlFormatId) || blFormats[0] || DEFAULT_BL_FORMAT;
  }, [blFormats, selectedBlFormatId]);

  // Dynamically map manifest fields based on active shipmentJson & format schema
  const mappedDgFields = useMemo(() => {
    return buildMappedManifest(shipmentJson, activeDgFormat, dgCustomOverrides);
  }, [shipmentJson, activeDgFormat, dgCustomOverrides]);

  const mappedBlFields = useMemo(() => {
    return buildMappedManifest(shipmentJson, activeBlFormat, blCustomOverrides);
  }, [shipmentJson, activeBlFormat, blCustomOverrides]);

  // Two-way interactive live field editor: editing a field updates manifest state + shipmentJson
  const handleFieldChange = (field: MappedManifestField, docType: FormatDocumentType, newValue: string) => {
    if (docType === 'DG') {
      setDgCustomOverrides(prev => ({ ...prev, [field.fieldId]: newValue }));
    } else {
      setBlCustomOverrides(prev => ({ ...prev, [field.fieldId]: newValue }));
    }

    // Always enrich underlying shipment state with two-way decomposition
    setShipmentJson(prev => updateShipmentFromManifestField(prev, field, newValue));

    // When tareWeightKg or grossWeightKg is edited, clear any custom overrides on VGM fields
    // so live arithmetic (grossWeightKg + tareWeightKg) recalculates and renders immediately
    if (field.mappedShipmentKey === 'tareWeightKg' || field.mappedShipmentKey === 'grossWeightKg') {
      const clearVgmOverrides = (prev: Record<string, string>) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          const kLower = k.toLowerCase();
          if (kLower.includes('vgm') || kLower.includes('total_gross') || kLower.includes('incl_tare')) {
            delete next[k];
          }
        }
        return next;
      };
      setDgCustomOverrides(clearVgmOverrides);
      setBlCustomOverrides(clearVgmOverrides);
    }
  };

  // Open Unified Format Library & Template Uploader Modal
  const handleOpenFormatLibrary = (preselectedDocType?: FormatDocumentType) => {
    if (preselectedDocType) {
      setFormatUploadDocType(preselectedDocType);
    }
    setFormatUploadError(null);
    setShowFormatLibraryModal(true);
  };

  const handleExecuteFormatUpload = async () => {
    if (!formatUploadFile) {
      setFormatUploadError('Please select or drop a template file (.pdf, .docx, .xlsx, .xls) to parse.');
      return;
    }
    const nameToUse = formatUploadName.trim() || formatUploadFile.name.replace(/\.[^/.]+$/, '');

    setIsUploadingFormat(true);
    setFormatUploadProgress(null);
    setFormatUploadError(null);

    try {
      const extractedSchema = await parseTargetFormat(
        formatUploadFile,
        nameToUse,
        formatUploadDocType,
        customApiKey || undefined,
        (progress) => setFormatUploadProgress(progress)
      );

      saveFormatToLibrary(extractedSchema);
      const updatedFormats = getSavedFormats();
      setFormats(updatedFormats);

      if (formatUploadDocType === 'DG') {
        setSelectedDgFormatId(extractedSchema.formatId);
      } else {
        setSelectedBlFormatId(extractedSchema.formatId);
      }

      // Reset upload inputs after successful parsing
      setFormatUploadFile(null);
      setFormatUploadName('');
      setFormatUploadProgress(null);
      if (formatFileInputRef.current) {
        formatFileInputRef.current.value = '';
      }
    } catch (err: any) {
      console.error('Format upload failed:', err);
      setFormatUploadError(err?.message || 'Failed to extract format schema.');
    } finally {
      setIsUploadingFormat(false);
    }
  };

  const handleDeleteFormat = (formatId: string) => {
    deleteFormatFromLibrary(formatId);
    setFormats(getSavedFormats());
    if (selectedDgFormatId === formatId) {
      setSelectedDgFormatId(DEFAULT_DG_FORMAT.formatId);
    }
    if (selectedBlFormatId === formatId) {
      setSelectedBlFormatId(DEFAULT_BL_FORMAT.formatId);
    }
  };

  // Field stats
  const dgStats = useMemo(() => getManifestStats(mappedDgFields), [mappedDgFields]);
  const blStats = useMemo(() => getManifestStats(mappedBlFields), [mappedBlFields]);

  // Inspect populated vs pending fields for Step 1 Audit
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
    { num: 2, title: '2. DG Manifest', desc: `IMO Boxes 1-22 (${dgStats.populated}/${dgStats.total})`, status: hasParsed ? 'Live Matcher Active' : 'Standby' },
    { num: 3, title: '3. BL Manifest', desc: `30 Master Fields (${blStats.populated}/${blStats.total})`, status: hasParsed ? 'Auto-Inherited from DG' : 'Standby' },
    { num: 4, title: '4. Output Render', desc: 'Dual Document Issuance', status: 'Standby for Phase 4' }
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
              <p className="text-xs text-slate-400">Sequential Dynamic Matcher: Step 1 (JSON) &rarr; Step 2 (DG) &rarr; Step 3 (BL)</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {lastPurgedAt && (
              <span className="hidden md:inline-flex items-center space-x-1.5 text-[11px] text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2.5 py-1 rounded-lg">
                <CheckCircle2 className="w-3 h-3" />
                <span>Clean Slate ({lastPurgedAt})</span>
              </span>
            )}

            {/* Format Library & Upload Template */}
            <button
              onClick={() => handleOpenFormatLibrary(activeStep === 3 ? 'BL' : 'DG')}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
              title="Format Library & Upload Template"
            >
              <FolderPlus className="w-3.5 h-3.5 text-cyan-400" />
              <span>Format Library & Upload ({formats.length})</span>
            </button>

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
                  <span className={`text-xs font-bold ${isSelected ? 'text-cyan-400' : 'text-slate-300'}`}>
                    {s.title}
                  </span>
                  {isSelected && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{s.desc}</p>
                <div className="mt-2 text-[10px] font-mono text-slate-500">
                  {s.status}
                </div>
              </div>
            );
          })}
        </section>

        {/* STEP 1: Ingestion & Universal JSON State */}
        {activeStep === 1 && (
          <div className="space-y-6">
            {/* Mode Selector & Action Bar */}
            <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs uppercase font-bold tracking-wider text-slate-400">1. Select Upload Mode</span>
                <p className="text-xs text-slate-400">
                  Choose whether your batch contains a single consolidated shipment or multiple commercial invoices.
                </p>
              </div>

              <div className="inline-flex rounded-xl bg-slate-950 p-1 border border-slate-800">
                <button
                  type="button"
                  onClick={() => handleModeChange('SINGLE_INVOICE')}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    mode === 'SINGLE_INVOICE'
                      ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Single Invoice (Consolidated)
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('MULTI_INVOICE')}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    mode === 'MULTI_INVOICE'
                      ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Multi-Invoice (Sequential Workbooks)
                </button>
              </div>
            </section>

            {/* Error Banner: Loud Error Surfacing */}
            {apiError && (
              <section className="bg-red-950/80 border-2 border-red-600 rounded-2xl p-5 text-red-200 shadow-xl space-y-3 animate-in fade-in duration-200">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <AlertOctagon className="w-6 h-6 text-red-400 shrink-0" />
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                        Extraction / API Error Occurred
                      </h3>
                      <p className="text-xs text-red-300">
                        The extraction pipeline halted due to an API error. Silent fallbacks are strictly disabled.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setApiError(null)}
                    className="text-red-400 hover:text-white p-1 rounded-lg hover:bg-red-900/50 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {apiError.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') && (
                  <div className="bg-amber-950/60 border border-amber-500/60 rounded-xl p-3 text-xs text-amber-200 space-y-1.5">
                    <div className="font-bold flex items-center space-x-1.5 text-amber-300">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Unsupported Key / Token Format ("AQ...")</span>
                    </div>
                    <p className="leading-relaxed">
                      The key configured starts with <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-300 font-mono">AQ.</code>, which is an internal session token. Google Gemini API requires a standard API key starting with <code className="bg-slate-900 px-1.5 py-0.5 rounded text-cyan-300 font-mono">AIzaSy...</code>.
                    </p>
                    <p className="leading-relaxed">
                      Please generate a free Gemini API key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-cyan-400 underline font-semibold hover:text-cyan-300">aistudio.google.com/apikey</a> and click <strong>"Update API Key"</strong> below.
                    </p>
                  </div>
                )}
                <div className="bg-slate-950/90 rounded-xl p-3.5 border border-red-900/60 font-mono text-xs overflow-x-auto text-red-300 max-h-48 whitespace-pre-wrap">
                  {apiError}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <p className="text-[11px] text-red-400">
                    Verify your Gemini API key or document format, then retry.
                  </p>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setShowKeyModal(true)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-900/60 hover:bg-red-800 text-white cursor-pointer border border-red-700 transition"
                    >
                      Update API Key
                    </button>
                    <button
                      onClick={handleExecuteParsing}
                      disabled={isParsing || uploadedFiles.length === 0}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white cursor-pointer transition disabled:opacity-50"
                    >
                      Retry Extraction
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* Drag & Drop File Zone */}
            <section
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-slate-800 hover:border-cyan-500/50 rounded-2xl p-8 bg-slate-900/40 text-center transition flex flex-col items-center justify-center space-y-4"
            >
              <div className="w-14 h-14 rounded-2xl bg-cyan-950/60 border border-cyan-800/80 flex items-center justify-center text-cyan-400">
                <UploadCloud className="w-7 h-7" />
              </div>

              <div>
                <h3 className="text-sm font-bold text-white">Upload Shipment Documents</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md">
                  Drop Commercial Invoices, Packing Lists, or Carrier Dangerous Goods declarations (.pdf, .xlsx, .xls, .csv).
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload-input"
              />

              <div className="flex flex-wrap items-center justify-center gap-3">
                <label
                  htmlFor="file-upload-input"
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer shadow-md shadow-cyan-600/20 transition inline-flex items-center space-x-2"
                >
                  <FileUp className="w-4 h-4" />
                  <span>Choose Files</span>
                </label>

                {uploadedFiles.length > 0 && (
                  <button
                    onClick={handleClearFiles}
                    className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer transition"
                  >
                    Clear Selected
                  </button>
                )}

                <button
                  onClick={handleExecuteParsing}
                  disabled={uploadedFiles.length === 0 || isParsing}
                  className={`px-5 py-2 text-xs font-bold rounded-xl text-white shadow-lg transition inline-flex items-center space-x-2 cursor-pointer ${
                    uploadedFiles.length === 0 || isParsing
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/20'
                  }`}
                >
                  <Sparkles className={`w-4 h-4 ${isParsing ? 'animate-spin' : ''}`} />
                  <span>{isParsing ? 'Extracting via Gemini...' : `Run AI Extraction (${uploadedFiles.length} files)`}</span>
                </button>
              </div>
            </section>

            {/* Attached Files List */}
            {uploadedFiles.length > 0 && (
              <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Uploaded Batch ({uploadedFiles.length} files)
                  </span>
                  <span className="text-xs font-mono text-cyan-400">
                    Mode: {mode}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {uploadedFiles.map((file, idx) => {
                    const isXls = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv');
                    return (
                      <div
                        key={idx}
                        className="bg-slate-950 border border-slate-800/80 rounded-xl p-2.5 flex items-center justify-between text-xs group"
                      >
                        <div className="flex items-center space-x-2 truncate">
                          {isXls ? (
                            <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
                          )}
                          <span className="truncate text-slate-200 font-medium" title={file.name}>
                            {file.name}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemoveFile(idx)}
                          className="text-slate-500 hover:text-red-400 p-1 cursor-pointer shrink-0 ml-2"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Parsing Progress / Filter Logs */}
            {isParsing && parseProgress && (
              <section className="bg-slate-900/80 border border-cyan-800/50 rounded-2xl p-5 space-y-3 animate-pulse">
                <div className="flex items-center space-x-3">
                  <Sparkles className="w-5 h-5 text-cyan-400 animate-spin" />
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      AI Multimodal Ingestion Pipeline Running
                    </h4>
                    <p className="text-xs text-cyan-300 mt-0.5">{parseProgress.message}</p>
                  </div>
                </div>
              </section>
            )}

            {/* Extracted JSON Inspector & Verification View */}
            {hasParsed && (
              <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-950/80 border border-emerald-800 flex items-center justify-center text-emerald-400">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                          Extracted Universal Shipment JSON
                        </h3>
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                          Verified Universal Truth
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        {shipmentJson.uploadMode} &bull; {shipmentJson.pallets.length} Pallets Extracted &bull; Total Value: {shipmentJson.currency} {shipmentJson.totalInvoiceValue.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleCopyJson}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer inline-flex items-center space-x-1.5"
                    >
                      {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
                    </button>
                    <button
                      onClick={() => handleDownloadJson(shipmentJson, `ExtractedShipment_${Date.now()}.json`)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer inline-flex items-center space-x-1.5"
                    >
                      <Download className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Download JSON</span>
                    </button>
                  </div>
                </div>

                {/* Mathematical Discrepancy Warnings */}
                {shipmentJson.discrepancyWarnings && shipmentJson.discrepancyWarnings.length > 0 && (
                  <div className="bg-amber-950/40 border border-amber-800/80 rounded-xl p-4 space-y-1.5">
                    <div className="flex items-center space-x-2 text-amber-400 text-xs font-bold">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>Mathematical Verification Discrepancy Flagged</span>
                    </div>
                    <ul className="text-xs text-amber-200/90 list-disc list-inside space-y-1">
                      {shipmentJson.discrepancyWarnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Sub-Tab Navigation: Field Audit vs Pallets vs Raw JSON */}
                <div className="flex items-center space-x-2 border-b border-slate-800 pb-2">
                  <button
                    onClick={() => setInspectorTab('audit')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer inline-flex items-center space-x-1.5 ${
                      inspectorTab === 'audit'
                        ? 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Field Audit ({populatedFields.length} Populated / {pendingFields.length} Blank)</span>
                  </button>
                  <button
                    onClick={() => setInspectorTab('pallets')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer inline-flex items-center space-x-1.5 ${
                      inspectorTab === 'pallets'
                        ? 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Table className="w-3.5 h-3.5" />
                    <span>Pallet Breakdown ({shipmentJson.pallets.length})</span>
                  </button>
                  <button
                    onClick={() => setInspectorTab('raw_json')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer inline-flex items-center space-x-1.5 ${
                      inspectorTab === 'raw_json'
                        ? 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Raw JSON Schema</span>
                  </button>
                </div>

                {/* Sub-Tab 1: Field Audit Grid */}
                {inspectorTab === 'audit' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                      <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
                        <span className="text-[10px] text-slate-500 uppercase font-bold">Populated Fields</span>
                        <div className="text-xl font-bold text-emerald-400 mt-1">{populatedFields.length}</div>
                      </div>
                      <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
                        <span className="text-[10px] text-slate-500 uppercase font-bold">Blank / Pending Fields</span>
                        <div className="text-xl font-bold text-amber-400 mt-1">{pendingFields.length}</div>
                      </div>
                      <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
                        <span className="text-[10px] text-slate-500 uppercase font-bold">Dangerous Goods</span>
                        <div className="text-xl font-bold text-cyan-400 mt-1">
                          {shipmentJson.isDangerousGoods ? 'YES (UN ' + shipmentJson.unNumber + ')' : 'NO'}
                        </div>
                      </div>
                      <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
                        <span className="text-[10px] text-slate-500 uppercase font-bold">Total Pallets / Boxes</span>
                        <div className="text-xl font-bold text-white mt-1">
                          {shipmentJson.totalPallets} / {shipmentJson.totalBoxes}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {populatedFields.map(field => (
                        <div
                          key={field.key}
                          className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-xs flex flex-col justify-between"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-cyan-400 font-semibold">{field.key}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 font-bold">
                              POPULATED
                            </span>
                          </div>
                          <div className="text-slate-200 whitespace-pre-wrap font-sans break-words mt-1">
                            {field.displayVal}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sub-Tab 2: Pallet Table */}
                {inspectorTab === 'pallets' && (
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
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

                {/* Proceed to Step 2 Action Card */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-950 border border-cyan-800/60 rounded-xl shadow-lg shadow-cyan-950/50">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Step 1 Extraction Complete</span>
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Proceed to Step 2 to inspect and match fields against the IMO Multimodal Dangerous Goods format.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveStep(2)}
                    className="px-5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-600/30 cursor-pointer transition inline-flex items-center space-x-2"
                  >
                    <span>Proceed to Step 2: DG Manifest</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </section>
            )}
          </div>
        )}

        {/* STEP 2: DG Manifest (IMO Boxes 1-22 Dynamic Matcher) */}
        {activeStep === 2 && (
          <ManifestEditorSection
            documentType="DG"
            title="Dangerous Goods Manifest (IMO Multimodal Declaration)"
            description="Inspect, edit, and verify IMO Boxes 1 to 22. Any field you edit here automatically updates the shared shipment state and flows into Step 3."
            format={activeDgFormat}
            availableFormats={dgFormats}
            selectedFormatId={selectedDgFormatId}
            onSelectFormat={setSelectedDgFormatId}
            onOpenUploadModal={() => handleOpenFormatLibrary('DG')}
            onManageFormats={() => handleOpenFormatLibrary('DG')}
            mappedFields={mappedDgFields}
            onFieldChange={(field, val) => handleFieldChange(field, 'DG', val)}
            filter={fieldFilter}
            onFilterChange={setFieldFilter}
            searchQuery={fieldSearch}
            onSearchChange={setFieldSearch}
            stats={dgStats}
            onBack={() => setActiveStep(1)}
            onProceed={() => setActiveStep(3)}
            proceedButtonLabel="Proceed to Step 3: BL Manifest (Auto-Sync Shared Fields)"
            onDownloadJson={() => handleDownloadJson(mappedDgFields, `MappedDGManifest_${Date.now()}.json`)}
          />
        )}

        {/* STEP 3: BL Manifest (30 Master Fields Sequential Matcher) */}
        {activeStep === 3 && (
          <ManifestEditorSection
            documentType="BL"
            title="Master Bill of Lading Manifest (Multimodal Ocean BOL)"
            description="All shared fields (Booking Number, Carrier, Vessel, Voyage, Container, Seal, Tare Weight, Ports, Marks, and Weights) are automatically synchronized from your DG edits."
            format={activeBlFormat}
            availableFormats={blFormats}
            selectedFormatId={selectedBlFormatId}
            onSelectFormat={setSelectedBlFormatId}
            onOpenUploadModal={() => handleOpenFormatLibrary('BL')}
            onManageFormats={() => handleOpenFormatLibrary('BL')}
            mappedFields={mappedBlFields}
            onFieldChange={(field, val) => handleFieldChange(field, 'BL', val)}
            filter={fieldFilter}
            onFilterChange={setFieldFilter}
            searchQuery={fieldSearch}
            onSearchChange={setFieldSearch}
            stats={blStats}
            onBack={() => setActiveStep(2)}
            onProceed={() => setActiveStep(4)}
            proceedButtonLabel="Proceed to Step 4: Output Render"
            onDownloadJson={() => handleDownloadJson(mappedBlFields, `MappedBLManifest_${Date.now()}.json`)}
            showInheritedBanner
          />
        )}

        {/* STEP 4: Output Render & Verification Center */}
        {activeStep === 4 && (
          <section className="space-y-6">
            {/* Top Readiness & Completeness Banner */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-600/30">
                    <FileCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white tracking-wide">
                      Multi-Format Output &amp; Verification Center
                    </h2>
                    <p className="text-xs text-slate-400">
                      Compile verified DG and BL manifests into Print-Ready PDF, Editable Word (.docx), Maritime HTML, or a complete shipment ZIP bundle.
                    </p>
                  </div>
                </div>

                {/* Master ZIP Export Button */}
                <button
                  onClick={async () => {
                    setIsExportingZip(true);
                    try {
                      await downloadCompleteShipmentPackage(
                        shipmentJson,
                        activeDgFormat,
                        mappedDgFields,
                        activeBlFormat,
                        mappedBlFields,
                        { includePalletAnnex }
                      );
                    } finally {
                      setIsExportingZip(false);
                    }
                  }}
                  disabled={isExportingZip}
                  className="px-5 py-2.5 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/30 transition inline-flex items-center space-x-2 cursor-pointer disabled:opacity-50"
                >
                  <Package className={`w-4 h-4 ${isExportingZip ? 'animate-spin' : ''}`} />
                  <span>{isExportingZip ? 'Packaging ZIP Archive...' : 'Download Complete Shipment Package (.zip)'}</span>
                </button>
              </div>

              {/* Side-by-Side Readiness Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* DG Readiness Card */}
                <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
                      <span className="text-xs font-bold text-white uppercase tracking-wider">Dangerous Goods Declaration</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                      {dgStats.populated} / {dgStats.total} Populated ({dgStats.percentage}%)
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 font-medium truncate">
                    Template: {activeDgFormat.formatName}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                    <div>Booking: <span className="font-mono text-cyan-300">{shipmentJson.bookingNumber || 'Pending'}</span></div>
                    <div>Vessel: <span className="text-slate-200">{shipmentJson.vesselName || 'Pending'}</span></div>
                    <div>UN Number: <span className="font-mono text-amber-300">{shipmentJson.unNumber || 'N/A'}</span></div>
                    <div>Marine Pollutant: <span className="font-bold text-slate-200">{shipmentJson.marinePollutant ? 'YES' : 'NO'}</span></div>
                  </div>
                </div>

                {/* BL Readiness Card */}
                <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse"></span>
                      <span className="text-xs font-bold text-white uppercase tracking-wider">Ocean Bill of Lading</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                      {blStats.populated} / {blStats.total} Populated ({blStats.percentage}%)
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 font-medium truncate">
                    Template: {activeBlFormat.formatName}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                    <div>Carrier: <span className="text-slate-200">{shipmentJson.carrierName || 'Pending'}</span></div>
                    <div>Container: <span className="font-mono text-cyan-300">{shipmentJson.containerNumber || 'Pending'}</span></div>
                    <div>Tare Mass: <span className="font-mono text-slate-200">{shipmentJson.tareWeightKg > 0 ? `${shipmentJson.tareWeightKg} kg` : 'Pending'}</span></div>
                    <div>Total Gross VGM: <span className="font-mono font-bold text-emerald-400">{shipmentJson.grossWeightKg > 0 && shipmentJson.tareWeightKg > 0 ? `${(shipmentJson.grossWeightKg + shipmentJson.tareWeightKg).toFixed(2)} kg` : 'Pending'}</span></div>
                  </div>
                </div>
              </div>

              {/* Quick Stage-2 Carrier & Equipment Bar */}
              <div className="bg-slate-950/70 border border-cyan-900/40 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Quick Stage-2 Carrier &amp; Equipment Sync Bar
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    Changes made here synchronize immediately across DG and BL manifests and auto-compute VGM.
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2.5">
                  <div className="lg:col-span-2">
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Container No.</label>
                    <input
                      type="text"
                      value={shipmentJson.containerNumber}
                      onChange={(e) => setShipmentJson(prev => ({ ...prev, containerNumber: e.target.value }))}
                      placeholder="e.g. MSKU1234567"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Seal No.</label>
                    <input
                      type="text"
                      value={shipmentJson.sealNumber}
                      onChange={(e) => setShipmentJson(prev => ({ ...prev, sealNumber: e.target.value }))}
                      placeholder="e.g. SL987654"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                    />
                  </div>
                  <div className="lg:col-span-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Tare (kg)</label>
                    <input
                      type="number"
                      value={shipmentJson.tareWeightKg || ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setShipmentJson(prev => ({ ...prev, tareWeightKg: val }));
                      }}
                      placeholder="e.g. 2300"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Carrier Name</label>
                    <input
                      type="text"
                      value={shipmentJson.carrierName}
                      onChange={(e) => setShipmentJson(prev => ({ ...prev, carrierName: e.target.value }))}
                      placeholder="e.g. MAERSK / CMA CGM"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Vessel Name</label>
                    <input
                      type="text"
                      value={shipmentJson.vesselName}
                      onChange={(e) => setShipmentJson(prev => ({ ...prev, vesselName: e.target.value }))}
                      placeholder="e.g. MSC ALTAIR"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                  <div className="lg:col-span-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Voyage No.</label>
                    <input
                      type="text"
                      value={shipmentJson.voyageNumber}
                      onChange={(e) => setShipmentJson(prev => ({ ...prev, voyageNumber: e.target.value }))}
                      placeholder="e.g. 2401E"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Booking No.</label>
                    <input
                      type="text"
                      value={shipmentJson.bookingNumber}
                      onChange={(e) => setShipmentJson(prev => ({ ...prev, bookingNumber: e.target.value }))}
                      placeholder="e.g. BKG-8899"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                    />
                  </div>

                  {/* Additional Stage-2 Carrier / Operational Inputs */}
                  <div className="lg:col-span-2">
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Emergency Contact</label>
                    <input
                      type="text"
                      value={shipmentJson.emergencyContactPhone}
                      onChange={(e) => setShipmentJson(prev => ({ ...prev, emergencyContactPhone: e.target.value }))}
                      placeholder="e.g. +91 98765 43210"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Shipping Bill No(s)</label>
                    <input
                      type="text"
                      value={shipmentJson.shippingBillNumbers}
                      onChange={(e) => setShipmentJson(prev => ({ ...prev, shippingBillNumbers: e.target.value }))}
                      placeholder="e.g. SB-1234567, SB-1234568"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Free Time Clause</label>
                    <input
                      type="text"
                      value={shipmentJson.freeTimeClause}
                      onChange={(e) => setShipmentJson(prev => ({ ...prev, freeTimeClause: e.target.value }))}
                      placeholder="e.g. 14 DAYS FREE TIME AT POD"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Declarant Name / Status</label>
                    <input
                      type="text"
                      value={shipmentJson.dgDeclarantName}
                      onChange={(e) => setShipmentJson(prev => ({ ...prev, dgDeclarantName: e.target.value }))}
                      placeholder="e.g. AUTHORIZED SIGNATORY"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Freight Terms</label>
                    <select
                      value={shipmentJson.freightTerms || 'FREIGHT PREPAID'}
                      onChange={(e) => setShipmentJson(prev => ({ ...prev, freightTerms: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
                    >
                      <option value="FREIGHT PREPAID">FREIGHT PREPAID</option>
                      <option value="FREIGHT COLLECT">FREIGHT COLLECT</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Live Interactive Document Preview Section */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <div className="inline-flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs">
                    <button
                      onClick={() => setOutputTab('DG')}
                      className={`px-3 py-1 font-semibold rounded-lg transition cursor-pointer flex items-center space-x-1.5 ${
                        outputTab === 'DG'
                          ? 'bg-amber-950 text-amber-400 border border-amber-800'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <span>DG Declaration ({activeDgFormat.formatName})</span>
                    </button>
                    <button
                      onClick={() => setOutputTab('BL')}
                      className={`px-3 py-1 font-semibold rounded-lg transition cursor-pointer flex items-center space-x-1.5 ${
                        outputTab === 'BL'
                          ? 'bg-blue-950 text-blue-400 border border-blue-800'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <span>Master BL Draft ({activeBlFormat.formatName})</span>
                    </button>
                    <button
                      onClick={() => setOutputTab('PALLETS')}
                      className={`px-3 py-1 font-semibold rounded-lg transition cursor-pointer flex items-center space-x-1.5 ${
                        outputTab === 'PALLETS'
                          ? 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Boxes className="w-3.5 h-3.5" />
                      <span>Pallet Breakdown ({shipmentJson.pallets.length})</span>
                    </button>
                  </div>

                  <label className="text-xs text-slate-300 flex items-center space-x-2 cursor-pointer ml-3 select-none">
                    <input
                      type="checkbox"
                      checked={includePalletAnnex}
                      onChange={(e) => setIncludePalletAnnex(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                    />
                    <span className="text-[11px] text-slate-400">Include Pallet Annex on Output</span>
                  </label>
                </div>

                {/* Per-Document Export Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {outputTab === 'DG' && (
                    <>
                      <button
                        onClick={() => printManifestToPdf(shipmentJson, activeDgFormat, mappedDgFields, { includePalletAnnex })}
                        className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer shadow-sm transition inline-flex items-center space-x-1.5"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print / Save PDF</span>
                      </button>
                      <button
                        onClick={() => downloadManifestDocx(shipmentJson, activeDgFormat, mappedDgFields, { includePalletAnnex })}
                        className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-white cursor-pointer transition border border-slate-700 inline-flex items-center space-x-1.5"
                      >
                        <FileText className="w-3.5 h-3.5 text-blue-400" />
                        <span>Editable Word (.docx)</span>
                      </button>
                      <button
                        onClick={() => downloadManifestHtml(shipmentJson, activeDgFormat, mappedDgFields, { includePalletAnnex })}
                        className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer transition border border-slate-700 inline-flex items-center space-x-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                        <span>HTML</span>
                      </button>
                      <button
                        onClick={() => handleDownloadJson(mappedDgFields, `MappedDGManifest_${Date.now()}.json`)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer transition border border-slate-700 inline-flex items-center space-x-1.5"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span>JSON</span>
                      </button>
                    </>
                  )}

                  {outputTab === 'BL' && (
                    <>
                      <button
                        onClick={() => printManifestToPdf(shipmentJson, activeBlFormat, mappedBlFields, { includePalletAnnex })}
                        className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer shadow-sm transition inline-flex items-center space-x-1.5"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print / Save PDF</span>
                      </button>
                      <button
                        onClick={() => downloadManifestDocx(shipmentJson, activeBlFormat, mappedBlFields, { includePalletAnnex })}
                        className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-white cursor-pointer transition border border-slate-700 inline-flex items-center space-x-1.5"
                      >
                        <FileText className="w-3.5 h-3.5 text-blue-400" />
                        <span>Editable Word (.docx)</span>
                      </button>
                      <button
                        onClick={() => downloadManifestHtml(shipmentJson, activeBlFormat, mappedBlFields, { includePalletAnnex })}
                        className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer transition border border-slate-700 inline-flex items-center space-x-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                        <span>HTML</span>
                      </button>
                      <button
                        onClick={() => handleDownloadJson(mappedBlFields, `MappedBLManifest_${Date.now()}.json`)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer transition border border-slate-700 inline-flex items-center space-x-1.5"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span>JSON</span>
                      </button>
                    </>
                  )}

                  {outputTab === 'PALLETS' && (
                    <button
                      onClick={() => handleDownloadJson(shipmentJson.pallets, `Pallets_Breakdown_${Date.now()}.json`)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-white cursor-pointer transition border border-slate-700 inline-flex items-center space-x-1.5"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Download Pallet JSON</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Document Preview Canvas */}
              {outputTab === 'DG' && (
                <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 overflow-x-auto">
                  <div
                    className="bg-white text-slate-900 rounded-lg p-6 max-w-4xl mx-auto shadow-2xl font-sans"
                    dangerouslySetInnerHTML={{
                      __html: generateManifestHtml(shipmentJson, activeDgFormat, mappedDgFields, { includePalletAnnex })
                        .replace(/<!DOCTYPE html>[\s\S]*?<body[^>]*>/i, '')
                        .replace(/<\/body>[\s\S]*?<\/html>/i, '')
                    }}
                  />
                </div>
              )}

              {outputTab === 'BL' && (
                <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 overflow-x-auto">
                  <div
                    className="bg-white text-slate-900 rounded-lg p-6 max-w-4xl mx-auto shadow-2xl font-sans"
                    dangerouslySetInnerHTML={{
                      __html: generateManifestHtml(shipmentJson, activeBlFormat, mappedBlFields, { includePalletAnnex })
                        .replace(/<!DOCTYPE html>[\s\S]*?<body[^>]*>/i, '')
                        .replace(/<\/body>[\s\S]*?<\/html>/i, '')
                    }}
                  />
                </div>
              )}

              {outputTab === 'PALLETS' && (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
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
            </div>

            {/* Bottom Navigation Buttons */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setActiveStep(3)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer transition inline-flex items-center space-x-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Step 3: BL Manifest</span>
              </button>
              <button
                onClick={() => setActiveStep(1)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer transition inline-flex items-center space-x-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Back to Step 1: Ingestion</span>
              </button>
            </div>
          </section>
        )}
      </main>

      {/* Unified Format Library & Template Uploader Modal */}
      {showFormatLibraryModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/40">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-800/80 flex items-center justify-center text-cyan-400">
                  <FolderPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Format Library & Template Uploader</h3>
                  <p className="text-[11px] text-slate-400">
                    Upload custom format files to extract reusable schemas, or switch and manage saved formats ({formats.length} in library).
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowFormatLibraryModal(false);
                  setFormatUploadError(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Section 1: Upload & Parse New Format Template */}
              <section className="bg-slate-950/70 border border-cyan-900/40 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      Upload & Parse New Format Template
                    </h4>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Accepts .pdf, .docx, .xlsx, .xls, .csv
                  </span>
                </div>

                {formatUploadError && (
                  <div className="p-3 bg-red-950/80 border border-red-800 rounded-xl text-xs text-red-200 flex items-start space-x-2">
                    <AlertOctagon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Extraction Error: </span>
                      {formatUploadError}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Format Name (Optional):
                    </label>
                    <input
                      type="text"
                      value={formatUploadName}
                      onChange={(e) => setFormatUploadName(e.target.value)}
                      placeholder="Auto-derived from filename if blank"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-sans"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Document Type:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setFormatUploadDocType('DG')}
                        className={`py-2 px-2 text-xs font-bold rounded-xl border transition cursor-pointer flex items-center justify-center space-x-1.5 ${
                          formatUploadDocType === 'DG'
                            ? 'bg-amber-950/80 border-amber-600 text-amber-300 shadow-sm'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span>DG Manifest (Step 2)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormatUploadDocType('BL')}
                        className={`py-2 px-2 text-xs font-bold rounded-xl border transition cursor-pointer flex items-center justify-center space-x-1.5 ${
                          formatUploadDocType === 'BL'
                            ? 'bg-blue-950/80 border-blue-600 text-blue-300 shadow-sm'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <span>BL Manifest (Step 3)</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Visible File Upload Dropzone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOverFormat(true);
                  }}
                  onDragLeave={() => setIsDragOverFormat(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOverFormat(false);
                    if (e.dataTransfer.files?.[0]) {
                      const file = e.dataTransfer.files[0];
                      setFormatUploadFile(file);
                      if (!formatUploadName.trim()) {
                        setFormatUploadName(file.name.replace(/\.[^/.]+$/, ''));
                      }
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-4 text-center transition flex flex-col items-center justify-center space-y-2 cursor-pointer ${
                    isDragOverFormat
                      ? 'border-cyan-400 bg-cyan-950/40'
                      : formatUploadFile
                      ? 'border-emerald-600 bg-emerald-950/20'
                      : 'border-slate-800 hover:border-slate-700 bg-slate-900/40'
                  }`}
                  onClick={() => formatFileInputRef.current?.click()}
                >
                  <input
                    ref={formatFileInputRef}
                    type="file"
                    accept=".pdf,.docx,.xlsx,.xls,.csv"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        const file = e.target.files[0];
                        setFormatUploadFile(file);
                        if (!formatUploadName.trim()) {
                          setFormatUploadName(file.name.replace(/\.[^/.]+$/, ''));
                        }
                      }
                    }}
                    className="hidden"
                  />

                  {formatUploadFile ? (
                    <div className="flex items-center justify-between w-full max-w-md px-3 py-1 bg-slate-900 border border-slate-700 rounded-lg">
                      <div className="flex items-center space-x-2 truncate">
                        <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="text-xs text-white font-medium truncate">{formatUploadFile.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          ({(formatUploadFile.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormatUploadFile(null);
                          if (formatFileInputRef.current) formatFileInputRef.current.value = '';
                        }}
                        className="text-slate-400 hover:text-red-400 p-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <FileUp className="w-6 h-6 text-slate-400" />
                      <div>
                        <span className="text-xs font-semibold text-cyan-400 hover:underline">
                          Click to browse or drop template file here
                        </span>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Supports .pdf, .docx (Word), .xlsx / .xls (Excel)
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* Action Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <span className="text-[11px] text-slate-400">
                    {isUploadingFormat && formatUploadProgress ? (
                      <span className="text-cyan-400 flex items-center space-x-1.5 animate-pulse">
                        <Sparkles className="w-3.5 h-3.5 animate-spin" />
                        <span>{formatUploadProgress.message}</span>
                      </span>
                    ) : (
                      'Extracts field structure only — zero sample data copied.'
                    )}
                  </span>

                  <button
                    type="button"
                    onClick={handleExecuteFormatUpload}
                    disabled={isUploadingFormat || !formatUploadFile}
                    className={`px-4 py-2 text-xs font-bold rounded-xl text-white shadow-md transition inline-flex items-center space-x-2 cursor-pointer ${
                      isUploadingFormat || !formatUploadFile
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                        : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-cyan-600/20'
                    }`}
                  >
                    <Plus className={`w-3.5 h-3.5 ${isUploadingFormat ? 'animate-spin' : ''}`} />
                    <span>{isUploadingFormat ? 'Parsing Structure...' : 'Parse & Add to Format Library'}</span>
                  </button>
                </div>
              </section>

              {/* Section 2: Saved Format Library List */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Saved Target Formats in Library ({formats.length})
                  </h4>
                  <div className="flex items-center space-x-1.5 text-[10px] font-mono">
                    <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800">
                      {dgFormats.length} DG Formats
                    </span>
                    <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
                      {blFormats.length} BL Formats
                    </span>
                  </div>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {formats.map((fmt) => {
                    const isDefault = fmt.formatId === DEFAULT_DG_FORMAT.formatId || fmt.formatId === DEFAULT_BL_FORMAT.formatId;
                    const isCurrentSelected =
                      (fmt.documentType === 'DG' && selectedDgFormatId === fmt.formatId) ||
                      (fmt.documentType === 'BL' && selectedBlFormatId === fmt.formatId);

                    return (
                      <div
                        key={fmt.formatId}
                        className={`p-3 rounded-xl border flex items-center justify-between text-xs transition ${
                          isCurrentSelected
                            ? 'bg-slate-950 border-cyan-500 ring-1 ring-cyan-500/20'
                            : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        <div className="space-y-0.5 truncate pr-3">
                          <div className="flex items-center space-x-2">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              fmt.documentType === 'DG'
                                ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                : 'bg-blue-950 text-blue-400 border border-blue-800'
                            }`}>
                              {fmt.documentType}
                            </span>
                            <span className="font-bold text-slate-200 truncate">{fmt.formatName}</span>
                            {isDefault && (
                              <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                                Built-in Default
                              </span>
                            )}
                            {isCurrentSelected && (
                              <span className="text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800 px-1.5 py-0.5 rounded font-bold">
                                Active for {fmt.documentType}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500">
                            File: {fmt.sourceFileName} &bull; {fmt.fields.length} Fields Defined
                          </p>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              if (fmt.documentType === 'DG') {
                                setSelectedDgFormatId(fmt.formatId);
                              } else {
                                setSelectedBlFormatId(fmt.formatId);
                              }
                            }}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition cursor-pointer ${
                              isCurrentSelected
                                ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                                : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                            }`}
                          >
                            {isCurrentSelected ? 'Active' : 'Select'}
                          </button>

                          {!isDefault && (
                            <button
                              onClick={() => handleDeleteFormat(fmt.formatId)}
                              className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-900 cursor-pointer transition"
                              title="Delete template from library"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-950/60">
              <button
                onClick={() => {
                  if (confirm('Clear custom templates from format library? Built-in standard defaults will remain.')) {
                    clearFormatLibrary();
                    setFormats(getSavedFormats());
                  }
                }}
                className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
              >
                Clear Custom Formats
              </button>
              <button
                onClick={() => {
                  setShowFormatLibraryModal(false);
                  setFormatUploadError(null);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-white cursor-pointer transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

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
              Configure your Google AI Studio Gemini API key. You can generate a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-cyan-400 underline font-semibold hover:text-cyan-300">aistudio.google.com/apikey</a>.
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
                placeholder="AIzaSy... (from aistudio.google.com/apikey)"
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
    </div>
  );
}

// =========================================================================
// Manifest Editor Section Component (Used for Step 2 & Step 3)
// =========================================================================

interface ManifestEditorSectionProps {
  documentType: FormatDocumentType;
  title: string;
  description: string;
  format: FormatSchemaJSON;
  availableFormats: FormatSchemaJSON[];
  selectedFormatId: string;
  onSelectFormat: (formatId: string) => void;
  onOpenUploadModal: () => void;
  onManageFormats: () => void;
  mappedFields: MappedManifestField[];
  onFieldChange: (field: MappedManifestField, newValue: string) => void;
  filter: 'ALL' | 'POPULATED' | 'PENDING';
  onFilterChange: (filter: 'ALL' | 'POPULATED' | 'PENDING') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  stats: ReturnType<typeof getManifestStats>;
  onBack: () => void;
  onProceed: () => void;
  proceedButtonLabel: string;
  onDownloadJson: () => void;
  showInheritedBanner?: boolean;
}

function ManifestEditorSection({
  documentType,
  title,
  description,
  format,
  availableFormats,
  selectedFormatId,
  onSelectFormat,
  onOpenUploadModal,
  onManageFormats,
  mappedFields,
  onFieldChange,
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  stats,
  onBack,
  onProceed,
  proceedButtonLabel,
  onDownloadJson,
  showInheritedBanner
}: ManifestEditorSectionProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  // Filter and search
  const filteredFields = useMemo(() => {
    return mappedFields.filter((f) => {
      if (filter === 'POPULATED' && f.status !== 'POPULATED') return false;
      if (filter === 'PENDING' && f.status !== 'PENDING_BLANK') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesLabel = f.labelInTemplate.toLowerCase().includes(q);
        const matchesKey = f.mappedShipmentKey.toLowerCase().includes(q);
        const matchesValue = f.value.toLowerCase().includes(q);
        const matchesSection = f.sectionName.toLowerCase().includes(q);
        return matchesLabel || matchesKey || matchesValue || matchesSection;
      }
      return true;
    });
  }, [mappedFields, filter, searchQuery]);

  const groupedSections = useMemo(() => {
    return groupManifestFieldsBySection(filteredFields);
  }, [filteredFields]);

  const handleCopyManifest = () => {
    const payload = mappedFields.reduce((acc, f) => {
      acc[f.labelInTemplate] = f.value;
      return acc;
    }, {} as Record<string, string>);
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Format Selector Bar */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 max-w-xl">
            <div className="flex items-center space-x-2">
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                documentType === 'DG'
                  ? 'bg-amber-950 text-amber-400 border border-amber-800'
                  : 'bg-blue-950 text-blue-400 border border-blue-800'
              }`}>
                {documentType === 'DG' ? 'Hazardous DG Manifest' : 'Master Ocean Bill of Lading'}
              </span>
              <h2 className="text-sm font-bold text-white">{title}</h2>
            </div>
            <p className="text-xs text-slate-400">{description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="space-y-0.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase font-bold text-slate-400 block">
                  Target Format Template:
                </label>
                <button
                  type="button"
                  onClick={onManageFormats}
                  className="text-[10px] text-cyan-400 hover:underline cursor-pointer"
                >
                  Manage Formats
                </button>
              </div>
              <select
                value={selectedFormatId}
                onChange={(e) => onSelectFormat(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer min-w-[240px]"
              >
                {availableFormats.map((f) => (
                  <option key={f.formatId} value={f.formatId}>
                    {f.formatName} ({f.fields.length} fields)
                  </option>
                ))}
              </select>
              <div className="text-[10px] text-slate-500 truncate max-w-[240px]">
                Template File: {format.sourceFileName}
              </div>
            </div>

            <button
              onClick={onOpenUploadModal}
              className="mt-4 px-3 py-1.5 text-xs font-semibold rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer shadow-sm transition inline-flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Upload New Format</span>
            </button>
          </div>
        </div>

        {/* Inherited Banner for Step 3 */}
        {showInheritedBanner && (
          <div className="bg-blue-950/40 border border-blue-800/80 rounded-xl p-3 flex items-start space-x-2 text-xs text-blue-200">
            <CheckCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white">Sequential Shared-State Inheritance Active: </span>
              Parties, Booking Number, Carrier, Vessel, Voyage, Container, Seal, Tare Weight, Ports, Marks, and Weights have been automatically inherited without re-typing.
            </div>
          </div>
        )}

        {/* Stats & Search/Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs">
              <button
                onClick={() => onFilterChange('ALL')}
                className={`px-3 py-1 font-semibold rounded-lg transition cursor-pointer ${
                  filter === 'ALL'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All Fields ({stats.total})
              </button>
              <button
                onClick={() => onFilterChange('POPULATED')}
                className={`px-3 py-1 font-semibold rounded-lg transition cursor-pointer flex items-center space-x-1.5 ${
                  filter === 'POPULATED'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'text-slate-400 hover:text-emerald-400'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>Populated ({stats.populated})</span>
              </button>
              <button
                onClick={() => onFilterChange('PENDING')}
                className={`px-3 py-1 font-semibold rounded-lg transition cursor-pointer flex items-center space-x-1.5 ${
                  filter === 'PENDING'
                    ? 'bg-amber-950 text-amber-400 border border-amber-800'
                    : 'text-slate-400 hover:text-amber-400'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>Pending / Blank ({stats.pending})</span>
              </button>
            </div>

            {/* Granular Invoice vs Stage 2 Badges */}
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-800/80">
              Invoice Data: {stats.invoiceDataPopulated}/{stats.invoiceDataTotal} ({stats.invoiceDataPercentage}%)
            </span>
            {stats.stage2Pending > 0 && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                Carrier/Equipment Pending: {stats.stage2Pending}
              </span>
            )}
            {stats.signaturePending > 0 && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-lg bg-slate-800 text-slate-400 border border-slate-700">
                Signatures Pending: {stats.signaturePending}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search template fields..."
                className="bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 w-48 sm:w-60"
              />
            </div>

            <button
              onClick={handleCopyManifest}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer inline-flex items-center space-x-1"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              onClick={onDownloadJson}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer inline-flex items-center space-x-1"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Download JSON</span>
            </button>
          </div>
        </div>
      </section>

      {/* Dynamic Fields Grouped by Section */}
      <div className="space-y-6">
        {Object.keys(groupedSections).length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs">
            No fields match your search or filter criteria.
          </div>
        ) : (
          Object.entries(groupedSections).map(([sectionName, fields]) => (
            <section
              key={sectionName}
              className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                <div className="flex items-center space-x-2">
                  <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">{sectionName}</h3>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  {fields.length} {fields.length === 1 ? 'field' : 'fields'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {fields.map((field) => {
                  const isPopulated = field.status === 'POPULATED';
                  return (
                    <div
                      key={field.fieldId}
                      className={`bg-slate-950 border rounded-xl p-3.5 space-y-2 transition ${
                        isPopulated
                          ? 'border-slate-800/80 focus-within:border-cyan-500/80'
                          : 'border-amber-900/40 bg-amber-950/10 focus-within:border-amber-500/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <label
                          htmlFor={`input-${field.fieldId}`}
                          className="text-xs font-semibold text-slate-200 leading-snug"
                        >
                          {field.labelInTemplate}
                        </label>
                        <div className="flex items-center space-x-1.5 shrink-0">
                          {isPopulated ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                              POPULATED
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800">
                              BLANK
                            </span>
                          )}
                          {field.mappedShipmentKey && (
                            <span className="text-[9px] font-mono text-slate-400 bg-slate-900 px-1 py-0.5 rounded border border-slate-800">
                              {field.mappedShipmentKey}
                            </span>
                          )}
                        </div>
                      </div>

                      {field.fieldType === 'multiline' ? (
                        <textarea
                          id={`input-${field.fieldId}`}
                          rows={3}
                          value={field.value}
                          onChange={(e) => onFieldChange(field, e.target.value)}
                          placeholder="Leave blank if not applicable..."
                          className="w-full bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono resize-y"
                        />
                      ) : field.fieldType === 'number' ? (
                        <input
                          id={`input-${field.fieldId}`}
                          type="number"
                          value={field.value}
                          onChange={(e) => onFieldChange(field, e.target.value)}
                          placeholder="0"
                          className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                        />
                      ) : (
                        <input
                          id={`input-${field.fieldId}`}
                          type="text"
                          value={field.value}
                          onChange={(e) => onFieldChange(field, e.target.value)}
                          placeholder="---"
                          className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {/* Action Footer Bar */}
      <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 sticky bottom-4 z-20 shadow-2xl backdrop-blur">
        <button
          onClick={onBack}
          className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer transition inline-flex items-center space-x-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>

        <div className="flex items-center space-x-3">
          <button
            onClick={onDownloadJson}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer inline-flex items-center space-x-1.5"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export Manifest JSON</span>
          </button>

          <button
            onClick={onProceed}
            className="px-5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-600/30 cursor-pointer transition inline-flex items-center space-x-2"
          >
            <span>{proceedButtonLabel}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>
    </div>
  );
}

export default App;
