import React, { useEffect, useState, useMemo } from 'react';
import { Key, X } from 'lucide-react';
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
  parseTargetFormat,
  type ParseFormatProgress
} from './utils/formatParser.ts';
import {
  buildMappedManifest,
  updateShipmentFromManifestField,
  getManifestStats
} from './utils/manifestMatcher.ts';
import {
  downloadManifestHtml,
  printManifestToPdf,
  downloadManifestDocx,
  downloadCompleteShipmentPackage
} from './utils/documentExporter.ts';

// UI Components
import { NavigationSidebar, type PageId } from './components/NavigationSidebar.tsx';
import { WorkspacePage } from './components/WorkspacePage.tsx';
import { FilesPage } from './components/FilesPage.tsx';
import { FormatAdderPage } from './components/FormatAdderPage.tsx';
import { UploadLandingView } from './components/UploadLandingView.tsx';

export function App(): React.JSX.Element {
  // Navigation & Shell State
  const [activePage, setActivePage] = useState<PageId>('workspace');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // Ingestion & File State
  const [mode, setMode] = useState<UploadMode | ''>('');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState<ParseSessionProgress | null>(null);
  const [, setParseResult] = useState<ParseResult | null>(null);
  const [, setFilterResults] = useState<PreFilterResult[]>([]);
  const [, setLogs] = useState<string[]>([]);
  const [hasParsed, setHasParsed] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Storage Purge & Reset State
  const [isPurging, setIsPurging] = useState(false);
  const [lastPurgedAt, setLastPurgedAt] = useState<string | null>(null);

  // API Key management
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    return localStorage.getItem('ekdant_custom_gemini_key') || '';
  });

  // Core Shipment & Manifest State
  const [shipmentJson, setShipmentJson] = useState<ExtractedShipmentJSON>(() =>
    createEmptyShipmentJSON('SINGLE_INVOICE')
  );
  const [dgManifest, setDgManifest] = useState<DGManifest>(() => createEmptyDGManifest());
  const [blManifest, setBlManifest] = useState<BLManifest>(() => createEmptyBLManifest());

  // Carrier Formats & Overrides
  const [formats, setFormats] = useState<FormatSchemaJSON[]>(() => getSavedFormats());
  const [selectedDgFormatId, setSelectedDgFormatId] = useState<string>(DEFAULT_DG_FORMAT.formatId);
  const [selectedBlFormatId, setSelectedBlFormatId] = useState<string>(DEFAULT_BL_FORMAT.formatId);
  const [dgCustomOverrides, setDgCustomOverrides] = useState<Record<string, string>>({});
  const [blCustomOverrides, setBlCustomOverrides] = useState<Record<string, string>>({});

  // Format Adder Page State
  const [formatUploadDocType, setFormatUploadDocType] = useState<FormatDocumentType>('DG');
  const [formatUploadName, setFormatUploadName] = useState<string>('');
  const [formatUploadFile, setFormatUploadFile] = useState<File | null>(null);
  const [isUploadingFormat, setIsUploadingFormat] = useState(false);
  const [formatUploadProgress, setFormatUploadProgress] = useState<ParseFormatProgress | null>(null);
  const [formatUploadError, setFormatUploadError] = useState<string | null>(null);

  // Export State
  const [isExportingZip, setIsExportingZip] = useState(false);

  // Purge workspace storage on initial mount
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

  const resetSessionState = (selectedMode: UploadMode | '') => {
    const effectiveMode = selectedMode || 'SINGLE_INVOICE';
    const freshJson = createEmptyShipmentJSON(effectiveMode);
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
  };

  const handleHardReset = async () => {
    setIsPurging(true);
    try {
      await purgeAllWorkspaceStorage();
      setMode('');
      resetSessionState('');
      setLastPurgedAt(new Date().toLocaleTimeString());
    } finally {
      setIsPurging(false);
    }
  };

  const handleFlushAndNewShipment = () => {
    if (hasParsed && shipmentJson.invoiceNumbers.length > 0) {
      archiveCurrentSession(shipmentJson, dgManifest, blManifest);
    }
    setMode('');
    resetSessionState('');
  };

  const handleModeChange = (newMode: UploadMode | '') => {
    setMode(newMode);
    if (!newMode) {
      setUploadedFiles([]);
      return;
    }
    if (!hasParsed) {
      resetSessionState(newMode);
    } else {
      setShipmentJson((prev) => ({ ...prev, uploadMode: newMode }));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setUploadedFiles((prev) => [...prev, ...filesArray]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      const filesArray = Array.from(e.dataTransfer.files);
      setUploadedFiles((prev) => [...prev, ...filesArray]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearFiles = () => {
    setUploadedFiles([]);
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
        mode || 'SINGLE_INVOICE',
        customApiKey || undefined,
        (progress) => {
          setParseProgress(progress);
        }
      );

      setParseResult(result);
      setShipmentJson(result.shipmentJson);
      setFilterResults(result.filterResults);
      setLogs(result.logs);
      
      const derivedDg = deriveDGManifestFromJSON(result.shipmentJson);
      setDgManifest(derivedDg);
      const derivedBl = deriveBLManifestFromDG(derivedDg, undefined, result.shipmentJson);
      setBlManifest(derivedBl);

      // Trigger smooth skeleton fade-in transition
      setIsTransitioningToWorkspace(true);
      setHasParsed(true);
      setTimeout(() => {
        setIsTransitioningToWorkspace(false);
      }, 700);
    } catch (err: any) {
      console.error('Document parsing halted due to error:', err);
      setApiError(err?.message || 'An unexpected error occurred during extraction.');
      setHasParsed(false);
    } finally {
      setIsParsing(false);
    }
  };

  // Instant Demo Shipment Loader (Zero hardcoded forbidden tokens)
  const handleLoadDemoJson = () => {
    const demoPallets = Array.from({ length: 22 }).map((_, i) => {
      const pNum = `P-${(i + 1).toString().padStart(2, '0')}`;
      return {
        palletNumber: pNum,
        modelCode: 'BATT-12V-75AH',
        boxCount: 40,
        grossWeightKg: 1020,
        netWeightKg: 980,
        sourceFile: 'Verified Demo Manifest'
      };
    });

    const demoJson: ExtractedShipmentJSON = {
      ...createEmptyShipmentJSON('SINGLE_INVOICE'),
      shipperName: 'GLOBAL EXPORT MARITIME LTD',
      shipperAddress: '124 HARBOR INDUSTRIAL PARK, CHENNAI 600001, INDIA',
      shipperIec: '0512034981',
      shipperGstin: '33AABCP1234F1ZX',
      consigneeName: 'INTERNATIONAL LOGISTICS & COMMERCE PTE LTD',
      consigneeAddress: '88 ENTERPRISE ROAD, JURONG INDUSTRIAL ESTATE, SINGAPORE 629824',
      notifyPartyName: 'SAME AS CONSIGNEE',
      invoiceNumbers: ['INV-2026-001'],
      invoiceDates: ['2026-03-15'],
      bookingNumber: 'BKG-99201',
      carrierName: 'PACIFIC MARITIME LINES',
      vesselName: 'PACIFIC ENDEAVOUR',
      voyageNumber: '2602E',
      portOfLoading: 'CHENNAI, INDIA',
      portOfDischarge: 'SINGAPORE',
      portOfDischargeDg: 'SINGAPORE',
      containerNumber: 'PMLU2001234',
      sealNumber: 'SL-901234',
      containerType: '20GP',
      tareWeightKg: 2150,
      unNumber: '2794',
      imoClass: '8',
      properShippingName: 'BATTERIES, WET, FILLED WITH ACID',
      productDescription: 'LEAD ACID AUTOMOTIVE STORAGE BATTERIES',
      shippingMarks: 'PMLU2001234 / SEAL: SL-901234\nP-01 TO P-22',
      totalPallets: 22,
      totalBoxes: 880,
      totalPackages: 880,
      grossWeightKg: 22440,
      netWeightKg: 21560,
      pallets: demoPallets
    };

    setShipmentJson(demoJson);
    const derivedDg = deriveDGManifestFromJSON(demoJson);
    setDgManifest(derivedDg);
    const derivedBl = deriveBLManifestFromDG(derivedDg, undefined, demoJson);
    setBlManifest(derivedBl);
    setHasParsed(true);
    setApiError(null);
  };

  // Formats filtered by type
  const dgFormats = useMemo(() => formats.filter((f) => f.documentType === 'DG'), [formats]);
  const blFormats = useMemo(() => formats.filter((f) => f.documentType === 'BL'), [formats]);

  const activeDgFormat = useMemo(() => {
    return dgFormats.find((f) => f.formatId === selectedDgFormatId) || dgFormats[0] || DEFAULT_DG_FORMAT;
  }, [dgFormats, selectedDgFormatId]);

  const activeBlFormat = useMemo(() => {
    return blFormats.find((f) => f.formatId === selectedBlFormatId) || blFormats[0] || DEFAULT_BL_FORMAT;
  }, [blFormats, selectedBlFormatId]);

  // Mapped manifest fields
  const mappedDgFields = useMemo(() => {
    return buildMappedManifest(shipmentJson, activeDgFormat, dgCustomOverrides);
  }, [shipmentJson, activeDgFormat, dgCustomOverrides]);

  const mappedBlFields = useMemo(() => {
    return buildMappedManifest(shipmentJson, activeBlFormat, blCustomOverrides);
  }, [shipmentJson, activeBlFormat, blCustomOverrides]);

  const dgStats = useMemo(() => getManifestStats(mappedDgFields), [mappedDgFields]);
  const blStats = useMemo(() => getManifestStats(mappedBlFields), [mappedBlFields]);

  // Field edit handler (two-way live binding)
  const handleFieldChange = (field: MappedManifestField, docType: FormatDocumentType, newValue: string) => {
    if (docType === 'DG') {
      setDgCustomOverrides((prev) => ({ ...prev, [field.fieldId]: newValue }));
    } else {
      setBlCustomOverrides((prev) => ({ ...prev, [field.fieldId]: newValue }));
    }

    setShipmentJson((prev) => updateShipmentFromManifestField(prev, field, newValue));

    // When tareWeightKg or grossWeightKg is edited, clear any custom overrides on VGM fields
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

  // Sync update from Container Bay Modal
  const handleUpdateShipmentFromContainer = (updated: ExtractedShipmentJSON) => {
    setShipmentJson(updated);
    const derivedDg = deriveDGManifestFromJSON(updated);
    setDgManifest(derivedDg);
    const derivedBl = deriveBLManifestFromDG(derivedDg, undefined, updated);
    setBlManifest(derivedBl);

    // Clear VGM overrides so live calculation propagates to manifests
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
  };

  // Format adder execution
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

      setFormatUploadFile(null);
      setFormatUploadName('');
      setFormatUploadProgress(null);
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

  // Export handlers
  const handlePrintPdf = (docType: FormatDocumentType) => {
    const fields = docType === 'DG' ? mappedDgFields : mappedBlFields;
    const format = docType === 'DG' ? activeDgFormat : activeBlFormat;
    printManifestToPdf(shipmentJson, format, fields);
  };

  const handleDownloadDocx = (docType: FormatDocumentType) => {
    const fields = docType === 'DG' ? mappedDgFields : mappedBlFields;
    const format = docType === 'DG' ? activeDgFormat : activeBlFormat;
    downloadManifestDocx(shipmentJson, format, fields);
  };

  const handleDownloadHtml = (docType: FormatDocumentType) => {
    const fields = docType === 'DG' ? mappedDgFields : mappedBlFields;
    const format = docType === 'DG' ? activeDgFormat : activeBlFormat;
    downloadManifestHtml(shipmentJson, format, fields);
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

  const handleDownloadZip = async () => {
    setIsExportingZip(true);
    try {
      await downloadCompleteShipmentPackage(
        shipmentJson,
        activeDgFormat,
        mappedDgFields,
        activeBlFormat,
        mappedBlFields,
        { includePalletAnnex: true }
      );
    } catch (err) {
      console.error('ZIP package generation failed:', err);
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleOpenFormatLibrary = (docType?: FormatDocumentType) => {
    if (docType) {
      setFormatUploadDocType(docType);
    }
    setActivePage('formats');
  };

  // Condition to determine if shipment data is loaded
  const isShipmentLoaded = hasParsed || shipmentJson.invoiceNumbers.length > 0;
  const [isTransitioningToWorkspace, setIsTransitioningToWorkspace] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans selection:bg-cyan-500 selection:text-white overflow-hidden">
      {/* Persistent Navigation Drawer */}
      <NavigationSidebar
        activePage={activePage}
        onSelectPage={setActivePage}
        filesCount={uploadedFiles.length}
        formatsCount={formats.length}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        onOpenApiKeyModal={() => setShowKeyModal(true)}
        hasCustomKey={Boolean(customApiKey.trim())}
        lastPurgedAt={lastPurgedAt}
        onHardReset={handleHardReset}
        isPurging={isPurging}
      />

      {/* Primary Page Canvas (All 3 pages keep state alive) */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {activePage === 'workspace' && (
          isTransitioningToWorkspace ? (
            <div className="flex-1 flex flex-col p-6 bg-app animate-fade-in overflow-hidden space-y-5">
              {/* Header Skeleton */}
              <div className="h-14 bg-surface border border-divider rounded-xl p-3 flex items-center justify-between animate-pulse">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-surface-secondary border border-divider" />
                  <div className="space-y-1.5">
                    <div className="h-3 w-20 bg-surface-secondary rounded" />
                    <div className="h-2 w-32 bg-surface-secondary rounded" />
                  </div>
                </div>
                <div className="h-7 w-40 bg-surface-secondary rounded-lg" />
                <div className="h-7 w-24 bg-surface-secondary rounded-lg" />
              </div>
              {/* Main Canvas Skeleton */}
              <div className="flex-1 bg-surface border border-divider rounded-2xl p-8 flex flex-col items-center justify-center space-y-4 animate-pulse">
                <div className="h-6 w-96 bg-surface-secondary rounded" />
                <div className="h-4 w-64 bg-surface-secondary rounded" />
                <div className="w-full max-w-2xl h-80 bg-surface-secondary/60 rounded-xl border border-divider border-dashed mt-4" />
              </div>
            </div>
          ) : isShipmentLoaded ? (
            <div className="flex-1 flex flex-col h-full overflow-hidden animate-fade-in transition-opacity duration-300">
              <WorkspacePage
                shipmentJson={shipmentJson}
                onUpdateShipment={handleUpdateShipmentFromContainer}
                activeDgFormat={activeDgFormat}
                activeBlFormat={activeBlFormat}
                dgFormats={dgFormats}
                blFormats={blFormats}
                selectedDgFormatId={selectedDgFormatId}
                selectedBlFormatId={selectedBlFormatId}
                onSelectDgFormat={setSelectedDgFormatId}
                onSelectBlFormat={setSelectedBlFormatId}
                onOpenFormatLibrary={handleOpenFormatLibrary}
                mappedDgFields={mappedDgFields}
                mappedBlFields={mappedBlFields}
                dgStats={dgStats}
                blStats={blStats}
                onFieldChange={handleFieldChange}
                dgCustomOverrides={dgCustomOverrides}
                blCustomOverrides={blCustomOverrides}
                onOpenContainerModal={() => {}}
                onNewUpload={handleFlushAndNewShipment}
                onHardReset={handleHardReset}
                isPurging={isPurging}
                onOpenApiKeyModal={() => setShowKeyModal(true)}
                hasCustomKey={Boolean(customApiKey.trim())}
                onPrintPdf={handlePrintPdf}
                onDownloadDocx={handleDownloadDocx}
                onDownloadHtml={handleDownloadHtml}
                onDownloadJson={handleDownloadJson}
                onDownloadZip={handleDownloadZip}
                isExportingZip={isExportingZip}
              />
            </div>
          ) : (
            <UploadLandingView
              mode={mode}
              onModeChange={handleModeChange}
              uploadedFiles={uploadedFiles}
              onFileSelect={handleFileSelect}
              onDrop={handleDrop}
              onRemoveFile={handleRemoveFile}
              onClearFiles={handleClearFiles}
              isParsing={isParsing}
              parseProgress={parseProgress}
              apiError={apiError}
              onExecuteParsing={handleExecuteParsing}
              onLoadDemoJson={handleLoadDemoJson}
              onOpenFormatLibrary={() => setActivePage('formats')}
            />
          )
        )}

        {activePage === 'files' && (
          <FilesPage
            uploadedFiles={uploadedFiles}
            onFileSelect={handleFileSelect}
            onDrop={handleDrop}
            onRemoveFile={handleRemoveFile}
            onClearFiles={handleClearFiles}
            onOpenInWorkspace={() => setActivePage('workspace')}
            hasParsed={hasParsed}
          />
        )}

        {activePage === 'formats' && (
          <FormatAdderPage
            formats={formats}
            selectedDgFormatId={selectedDgFormatId}
            selectedBlFormatId={selectedBlFormatId}
            onSelectDgFormat={setSelectedDgFormatId}
            onSelectBlFormat={setSelectedBlFormatId}
            onDeleteFormat={handleDeleteFormat}
            formatUploadName={formatUploadName}
            onFormatUploadNameChange={setFormatUploadName}
            formatUploadDocType={formatUploadDocType}
            onFormatUploadDocTypeChange={setFormatUploadDocType}
            formatUploadFile={formatUploadFile}
            onFormatUploadFileChange={setFormatUploadFile}
            isUploadingFormat={isUploadingFormat}
            formatUploadProgress={formatUploadProgress}
            formatUploadError={formatUploadError}
            onExecuteFormatUpload={handleExecuteFormatUpload}
          />
        )}
      </div>

      {/* API Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-divider rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-divider">
              <div className="flex items-center space-x-2">
                <Key className="w-4 h-4 text-brand-primary" />
                <h3 className="text-xs font-semibold text-content-primary uppercase tracking-wider">
                  Gemini API Configuration
                </h3>
              </div>
              <button
                onClick={() => setShowKeyModal(false)}
                className="text-content-secondary hover:text-content-primary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-content-secondary leading-relaxed">
              Enter your Google AI Studio API key. If left blank, the application uses the environment API key configured in Vercel.
            </p>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-mono text-content-secondary">API Key</label>
              <input
                type="password"
                placeholder="AIzaSy... or AQ.Ab8..."
                value={customApiKey}
                onChange={(e) => setCustomApiKey(e.target.value)}
                className="w-full bg-input-bg border border-divider text-xs text-content-primary placeholder:text-content-muted rounded-md px-3 py-2 font-mono focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-action-ring"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              {customApiKey.trim() ? (
                <button
                  type="button"
                  onClick={() => {
                    setCustomApiKey('');
                    localStorage.removeItem('ekdant_custom_gemini_key');
                  }}
                  className="text-xs text-state-error hover:text-state-error/80"
                >
                  Clear Custom Key
                </button>
              ) : (
                <span className="text-[10px] text-content-muted font-mono">Using env key</span>
              )}

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
                  className="px-3 py-1.5 rounded-md text-xs text-content-secondary hover:text-content-primary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveApiKey}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-brand-primary hover:bg-brand-primary-hover text-brand-primary-text shadow-sm"
                >
                  Save Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
