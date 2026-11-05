import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import type { NavTab } from './components/Sidebar';
import { CenterColumn } from './components/CenterColumn';
import { PreviewPane } from './components/PreviewPane';
import type { RightPaneViewMode } from './components/PreviewPane';
import { FilesView } from './components/FilesView';
import { GeminiApiKeyModal } from './components/GeminiApiKeyModal';
import { ManageMasterFormatsView } from './components/ManageMasterFormatsView';
import type { ConvertedInvoice, CustomsPort, AppDocument, MasterFormat } from './types';
import { extractInvoiceFromPdf } from './utils/geminiExtractor';
import { extractFromSpreadsheet } from './utils/spreadsheetExtractor';
import { optimizeContainerAllocation } from './utils/containerOptimizer';
import { formatSequentialPalletRanges } from './utils/dgGenerator';
import { PRESEEDED_MASTER_FORMATS } from './data/masterFormats';

const LOCAL_STORAGE_DOCS_KEY = 'ekdant_customs_documents_v1';
const LOCAL_STORAGE_SAVED_FILES_KEY = 'ekdant_saved_files_v1';
const LOCAL_STORAGE_INVOICES_KEY = 'ekdant_customs_invoices_v4';
const LOCAL_STORAGE_KEY_KEY = 'ekdant_gemini_key';
const DEFAULT_PORT: CustomsPort = 'INNSA1';

const BUNDLED_DEFAULT_KEY = typeof atob !== 'undefined' 
  ? atob('QVEuQWI4Uk42Si1zNFB0NlFfZUppbVhiVUJQNzllRUFjM0l6Qy0wTTBWdEFVeWFxRFFBWVE=')
  : '';

export function App() {
  // Navigation: 'converter' (working workspace) or 'files' (archived tiles library)
  const [activeTab, setActiveTab] = useState<NavTab>('converter');

  // Files Repository Search
  const [fileSearchQuery, setFileSearchQuery] = useState<string>('');

  // Conversion Mode: 'single' (1 invoice -> 1 DG/BL), 'multiple' (consolidated multi-invoice), or '' ('Select Type')
  const [conversionMode, setConversionMode] = useState<'single' | 'multiple' | ''>('');

  // Gemini API Key Modal
  const [isKeyModalOpen, setIsKeyModalOpen] = useState<boolean>(false);

  // Gemini API Key (stored in localStorage, Vercel env, or bundled default)
  const [apiKey, setApiKey] = useState<string>(() => {
    try {
      const savedKey = localStorage.getItem(LOCAL_STORAGE_KEY_KEY);
      if (savedKey && savedKey.trim().length > 0) {
        // Automatically replace deprecated key if found in client cache
        if (savedKey.includes('AQ.Ab8RN6IyREuG3Byw')) {
          localStorage.setItem(LOCAL_STORAGE_KEY_KEY, BUNDLED_DEFAULT_KEY);
          return BUNDLED_DEFAULT_KEY;
        }
        return savedKey.trim();
      }
    } catch {}
    const envKey = (import.meta.env as any).PDF_Parser || import.meta.env.VITE_GEMINI_API_KEY || '';
    if (envKey && typeof envKey === 'string' && envKey.trim().length > 0) {
      if (envKey.includes('AQ.Ab8RN6IyREuG3Byw')) {
        return BUNDLED_DEFAULT_KEY;
      }
      return envKey.trim();
    }
    return BUNDLED_DEFAULT_KEY;
  });

  // Saved Converted Files Repository (Persistent tiles view)
  const [savedFiles, setSavedFiles] = useState<ConvertedInvoice[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_SAVED_FILES_KEY);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
      // Migrate existing legacy converted invoices if any
      const legacyInvoices = localStorage.getItem(LOCAL_STORAGE_INVOICES_KEY);
      if (legacyInvoices !== null) {
        const parsed = JSON.parse(legacyInvoices);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch {}
    return [];
  });

  // Active Working Documents (upload queue & conversion board)
  const [documents, setDocuments] = useState<AppDocument[]>(() => {
    try {
      const savedDocs = localStorage.getItem(LOCAL_STORAGE_DOCS_KEY);
      if (savedDocs) {
        const parsed = JSON.parse(savedDocs);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return []; // Default to empty workspace on fresh load
  });

  // Master Formats Library & Selected Format
  const [masterFormats, setMasterFormats] = useState<MasterFormat[]>(() => {
    try {
      const saved = localStorage.getItem('ekdant_master_formats_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return PRESEEDED_MASTER_FORMATS;
  });

  const [selectedFormatId, setSelectedFormatId] = useState<string>('fmt-one-line');

  // Helper to build consolidated master invoice from multiple invoices
  const buildConsolidatedInvoice = (invoices: ConvertedInvoice[], formatIdOverride?: string): ConvertedInvoice => {
    // Deduplicate / merge documents that belong to the same commercial invoice (e.g. Commercial Invoice + Packing List)
    const normalizeInv = (num?: string) => (num || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const invoiceGroups = new Map<string, ConvertedInvoice[]>();
    for (const inv of invoices) {
      const key = normalizeInv(inv.invoiceNumber) || inv.id;
      if (!invoiceGroups.has(key)) invoiceGroups.set(key, []);
      invoiceGroups.get(key)!.push(inv);
    }

    const dedupedInvoices: ConvertedInvoice[] = [];
    for (const [, group] of invoiceGroups.entries()) {
      if (group.length === 1) {
        dedupedInvoices.push(group[0]);
      } else {
        // Multiple documents representing the same invoice transaction (e.g. Invoice + Packing List)
        // Prefer the document that contains physical pallets/packaging detail, or the first one with line items
        const docWithPallets = group.find(d => (d.pallets && d.pallets.length > 0) || (d.palletRanges && d.palletRanges.length > 0));
        const base = docWithPallets || group[0];

        let mergedMarks = base.shippingMarks || '';
        let mergedBills = base.shippingBillNumbers || '';
        let mergedBooking = base.bookingNumber || '';
        let mergedCarrier = base.carrierName || '';
        let mergedVessel = base.vesselName || '';
        let mergedVoyage = base.voyageNumber || '';

        for (const sib of group) {
          if (!mergedMarks && sib.shippingMarks) mergedMarks = sib.shippingMarks;
          if (!mergedBills && sib.shippingBillNumbers) mergedBills = sib.shippingBillNumbers;
          if (!mergedBooking && sib.bookingNumber) mergedBooking = sib.bookingNumber;
          if (!mergedCarrier && sib.carrierName) mergedCarrier = sib.carrierName;
          if (!mergedVessel && sib.vesselName && sib.vesselName !== '---') mergedVessel = sib.vesselName;
          if (!mergedVoyage && sib.voyageNumber) mergedVoyage = sib.voyageNumber;
        }

        dedupedInvoices.push({
          ...base,
          shippingMarks: mergedMarks,
          shippingBillNumbers: mergedBills,
          bookingNumber: mergedBooking,
          carrierName: mergedCarrier,
          vesselName: mergedVessel,
          voyageNumber: mergedVoyage
        });
      }
    }

    const primary = dedupedInvoices[0] || invoices[0];
    const combinedLineItems = dedupedInvoices.flatMap((inv, invIdx) => 
      inv.lineItems.map((item, itemIdx) => ({
        ...item,
        id: `item-batch-${invIdx}-${itemIdx}-${item.id}`,
        itemNumber: itemIdx + 1
      }))
    );

    const totalGross = combinedLineItems.reduce((acc, it) => acc + (it.grossWeightKg || 0), 0) || dedupedInvoices.reduce((s, i) => s + i.grossWeightKg, 0);
    const totalNet = combinedLineItems.reduce((acc, it) => acc + (it.netWeightKg || 0), 0) || dedupedInvoices.reduce((s, i) => s + i.netWeightKg, 0);
    const totalPkgs = combinedLineItems.reduce((acc, it) => acc + (it.quantity || 1), 0);
    const totalPalletCount = dedupedInvoices.reduce((s, i) => s + (i.totalPallets || i.pallets?.length || 1), 0);
    const hasDangerousGoods = combinedLineItems.some(it => it.isDangerousGood) || dedupedInvoices.some(i => i.hasDangerousGoods);
    const invoiceNumbers = Array.from(new Set(dedupedInvoices.map(i => i.invoiceNumber).filter(Boolean))).join(' + ');

    const allPallets = dedupedInvoices.flatMap(inv => inv.pallets || []);
    const targetFmtId = formatIdOverride || selectedFormatId;
    const defaultFormat = (targetFmtId && masterFormats.find(f => f.id === targetFmtId)) ||
                          (primary.carrierName && masterFormats.find(f => f.carrierName?.toLowerCase() === primary.carrierName?.toLowerCase())) ||
                          ({} as Partial<MasterFormat>);

    const { containers, pallets } = allPallets.length > 0
      ? optimizeContainerAllocation(combinedLineItems, allPallets, {
          preferredContainerType: '20GP',
          preservePalletOrder: true,
          preferredContainerNumber: defaultFormat.containerNumber,
          preferredSealNumber: defaultFormat.sealNumber
        })
      : optimizeContainerAllocation(combinedLineItems, undefined, {
          preferredContainerType: '20GP',
          explicitPalletCount: totalPalletCount,
          preservePalletOrder: true,
          preferredContainerNumber: defaultFormat.containerNumber,
          preferredSealNumber: defaultFormat.sealNumber
        });

    const allPalletRanges = invoices.flatMap(i => i.palletRanges || []).filter(Boolean);
    const finalPalletRanges = allPalletRanges.length > 0
      ? allPalletRanges
      : formatSequentialPalletRanges(allPallets.map(p => p.palletNumber).filter(Boolean));

    const bookingNumber = primary.bookingNumber || defaultFormat.bookingNumber || '';
    const vesselName = (primary.vesselName && primary.vesselName !== 'Port of Discharge' && primary.vesselName !== '---') ? primary.vesselName : (defaultFormat.vesselName || '');
    const voyageNumber = primary.voyageNumber || defaultFormat.voyageNumber || '';
    const carrierName = primary.carrierName || defaultFormat.carrierName || '';
    const placeOfReceipt = primary.placeOfReceipt || defaultFormat.placeOfReceipt || primary.portOfLoading || '';
    const portOfDischargeDg = defaultFormat.portOfDischargeDg || primary.portOfDischargeDg || primary.portOfDischarge || '';
    const placeOfDelivery = primary.placeOfDelivery || defaultFormat.placeOfDelivery || defaultFormat.finalDestination || primary.finalDestination || '';
    const finalDestination = defaultFormat.finalDestination || primary.finalDestination || placeOfDelivery;
    const portOfDischarge = defaultFormat.portOfDischarge || primary.portOfDischarge || '';
    const shippingMarks = invoices.map(i => i.shippingMarks).filter(Boolean)[0] || defaultFormat.shippingMarks || '';
    const brandName = invoices.map(i => i.brandName).filter(Boolean)[0] || defaultFormat.brandName || '';
    const shippingBillNumbers = primary.shippingBillNumbers || defaultFormat.shippingBillNumbers || '';
    const freeTimeClause = primary.freeTimeClause || defaultFormat.freeTimeClause || '';
    const dgDeclarantName = defaultFormat.dgDeclarantName || primary.dgDeclarantName || '';
    const dgDeclarantStatus = defaultFormat.dgDeclarantStatus || primary.dgDeclarantStatus || '';
    const dgDeclarationPlaceAndDate = defaultFormat.dgDeclarationPlaceAndDate || primary.dgDeclarationPlaceAndDate || '';
    const emergencyContactName = defaultFormat.emergencyContactName || primary.emergencyContactName || '';
    const emergencyContactPhone = defaultFormat.emergencyContactPhone || primary.emergencyContactPhone || '';
    const unPackingCode = defaultFormat.unPackingCode || primary.unPackingCode || '';
    const segregationGroup = defaultFormat.segregationGroup || primary.segregationGroup || '';
    const emsNumber = defaultFormat.emsNumber || primary.emsNumber || '';
    const blDeclaredNetWeightKg = defaultFormat.blDeclaredNetWeightKg || primary.blDeclaredNetWeightKg;

    return {
      id: `inv-batch-${Date.now()}`,
      fileName: `Consolidated_Batch_${invoices.length}_Invoices.pdf`,
      fileSize: invoices.reduce((s, i) => s + i.fileSize, 0),
      convertedAt: `Today, ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      rawTimestamp: Date.now(),
      status: 'converted',
      invoiceNumber: invoiceNumbers,
      invoiceDate: primary.invoiceDate,
      bookingNumber,
      masterBolNumber: `BOL-${bookingNumber}`,
      exporterName: primary.exporterName,
      shipperAddress: primary.shipperAddress,
      onBehalfOf: primary.onBehalfOf,
      iec: primary.iec,
      gstin: primary.gstin,
      adCode: primary.adCode,
      consigneeName: primary.consigneeName,
      consigneeAddress: primary.consigneeAddress,
      notifyParty: primary.notifyParty,
      portOfLoading: primary.portOfLoading,
      portOfDischarge,
      portOfDischargeDg,
      placeOfReceipt,
      placeOfDelivery,
      finalDestination,
      destinationCountry: primary.destinationCountry,
      vesselName,
      voyageNumber,
      carrierName,
      shippingMarks,
      brandName,
      hsnCode: primary.hsnCode || defaultFormat.hsnCode || '',
      shippingBillNumbers,
      freightTerms: (primary.freightTerms || defaultFormat.freightTerms || 'FREIGHT COLLECT') as 'FREIGHT COLLECT' | 'FREIGHT PREPAID',
      movementType: primary.movementType || defaultFormat.movementType || 'FCL / FCL',
      freeTimeClause,
      blDeclaredNetWeightKg: blDeclaredNetWeightKg || primary.blDeclaredNetWeightKg || totalNet,
      dgPackingGroupOverride: primary.dgPackingGroupOverride || (hasDangerousGoods ? 'NA' : undefined),
      dgDeclarantName,
      dgDeclarantStatus,
      dgDeclarationPlaceAndDate,
      emergencyContact: emergencyContactPhone ? `${emergencyContactName} (${emergencyContactPhone})` : primary.emergencyContact,
      emergencyContactName,
      emergencyContactPhone,
      unPackingCode,
      segregationGroup,
      emsNumber,
      currency: primary.currency,
      exchangeRate: primary.exchangeRate,
      incoterm: primary.incoterm,
      subtotal: invoices.reduce((s, i) => s + (i.subtotal || 0), 0),
      gstAmount: invoices.reduce((s, i) => s + (i.gstAmount || 0), 0),
      invoiceTotal: invoices.reduce((s, i) => s + (i.invoiceTotal || 0), 0),
      grossWeightKg: totalGross,
      netWeightKg: totalNet,
      totalPackages: totalPkgs,
      packageType: primary.packageType,
      totalPallets: pallets.length || totalPalletCount,
      totalOuterPackages: pallets.length || totalPalletCount,
      outerPackageType: primary.outerPackageType || 'PALLET',
      totalInnerPackages: totalPkgs,
      innerPackageType: primary.innerPackageType || 'BOX',
      totalBaseUnits: invoices.reduce((s, i) => s + (i.totalBaseUnits || 0), 0) || totalPkgs,
      fieldTraceability: invoices.reduce((acc, inv) => ({ ...acc, ...(inv.fieldTraceability || {}) }), {}),
      palletRanges: finalPalletRanges,
      statutoryDescription: primary.statutoryDescription || defaultFormat.statutoryDescription || '',
      hasDangerousGoods,
      selectedBolTemplateId: 'bol-standard',
      selectedDgTemplateId: 'dg-imo-standard',
      containers,
      pallets,
      lineItems: combinedLineItems,
      pdfUrl: primary.pdfUrl
    };
  };

  // Consolidated Master Invoice state for multi-invoice batches
  const [consolidatedInvoice, setConsolidatedInvoice] = useState<ConvertedInvoice | null>(() => {
    try {
      const savedDocs = localStorage.getItem(LOCAL_STORAGE_DOCS_KEY);
      if (savedDocs) {
        const parsed = JSON.parse(savedDocs);
        if (Array.isArray(parsed)) {
          const processed = parsed.filter((d: any) => d.status === 'processed' && d.invoice);
          if (processed.length >= 2) {
            return buildConsolidatedInvoice(processed.map((d: any) => d.invoice));
          }
        }
      }
    } catch {}
    return null;
  });

  // Selected Document ID for Right Preview Pane ('consolidated' or docId or null)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(() => {
    try {
      const savedDocs = localStorage.getItem(LOCAL_STORAGE_DOCS_KEY);
      if (savedDocs) {
        const parsed = JSON.parse(savedDocs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const processed = parsed.filter((d: any) => d.status === 'processed' && d.invoice);
          if (processed.length >= 2) return 'consolidated';
          return parsed[0].id;
        }
      }
    } catch {}
    return null;
  });

  // Bulk conversion state
  const [isBulkConverting, setIsBulkConverting] = useState<boolean>(false);
  const [activeRightView, setActiveRightView] = useState<RightPaneViewMode>('container_plan');

  // Active Selected Document in converter
  const activeDocument = selectedDocumentId === 'consolidated' 
    ? null 
    : (documents.find(d => d.id === selectedDocumentId) || (documents.length > 0 ? documents[0] : null));

  // Active Invoice for Preview Pane (defaults to consolidatedInvoice when in multi-invoice mode or 'consolidated')
  const activeInvoice = selectedDocumentId === 'consolidated'
    ? (consolidatedInvoice || documents.find(d => d.invoice)?.invoice || null)
    : (activeDocument?.invoice || consolidatedInvoice || documents.find(d => d.invoice)?.invoice || null);

  // Save new API Key
  const handleSaveApiKey = (newKey: string) => {
    setApiKey(newKey);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_KEY, newKey);
    } catch (err) {
      console.warn('Failed to save API key to localStorage:', err);
    }
  };

  // Persist master formats whenever updated
  useEffect(() => {
    try {
      localStorage.setItem('ekdant_master_formats_v1', JSON.stringify(masterFormats));
    } catch (err) {
      console.warn('Failed to save master formats to localStorage:', err);
    }
  }, [masterFormats]);

  const handleSaveMasterFormat = (format: MasterFormat) => {
    setMasterFormats(prev => {
      const exists = prev.some(f => f.id === format.id);
      if (exists) {
        return prev.map(f => f.id === format.id ? format : f);
      }
      return [format, ...prev];
    });
    handleSelectFormat(format.id);
  };

  const handleSelectFormat = (formatId: string) => {
    setSelectedFormatId(formatId);
    const processed = documents.filter(d => d.status === 'processed' && d.invoice);
    if (processed.length >= 2) {
      setConsolidatedInvoice(buildConsolidatedInvoice(processed.map(d => d.invoice!), formatId));
    }
  };

  const handleReplaceMasterFormat = (formatId: string, updatedFormat: Partial<MasterFormat>) => {
    setMasterFormats(prev => prev.map(f => f.id === formatId ? { ...f, ...updatedFormat } : f));
  };

  const handleDeleteMasterFormat = (formatId: string) => {
    setMasterFormats(prev => {
      const filtered = prev.filter(f => f.id !== formatId);
      return filtered.length > 0 ? filtered : PRESEEDED_MASTER_FORMATS;
    });
    if (selectedFormatId === formatId) {
      setSelectedFormatId(PRESEEDED_MASTER_FORMATS[0].id);
    }
  };

  // Persist working documents whenever updated
  useEffect(() => {
    try {
      const toSave = documents.map(d => ({
        id: d.id,
        fileName: d.fileName,
        fileSize: d.fileSize,
        uploadedAt: d.uploadedAt,
        status: d.status === 'processing' ? 'pending' : d.status,
        errorMessage: d.errorMessage,
        invoice: d.invoice
      }));
      localStorage.setItem(LOCAL_STORAGE_DOCS_KEY, JSON.stringify(toSave));
    } catch (err) {
      console.warn('Failed to save documents to localStorage:', err);
    }
  }, [documents]);

  // Persist saved files library whenever updated
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_SAVED_FILES_KEY, JSON.stringify(savedFiles));
      // Keep legacy cache updated as well
      localStorage.setItem(LOCAL_STORAGE_INVOICES_KEY, JSON.stringify(savedFiles));
    } catch (err) {
      console.warn('Failed to save files to localStorage:', err);
    }
  }, [savedFiles]);

  // Handle files selected (drag & drop or browse) - Multi-invoice batching with deduplication (.pdf, .xlsx, .xls, .csv)
  const handleFilesSelected = async (files: File[]) => {
    // Deduplicate against existing documents by file name and size
    const existingFileKeys = new Set(documents.map(d => `${d.fileName}_${d.fileSize}`));
    const newDocs: AppDocument[] = [];

    for (const file of files) {
      const fileKey = `${file.name}_${file.size}`;
      if (!existingFileKeys.has(fileKey)) {
        existingFileKeys.add(fileKey);
        const isPdf = /\.pdf$/i.test(file.name);
        const isSpreadsheet = /\.xlsx$|\.xls$|\.csv$/i.test(file.name);
        const pdfUrl = isPdf && typeof window !== 'undefined' && window.URL ? URL.createObjectURL(file) : undefined;

        let previewHtml: string | undefined;
        let preParsedInvoice: ConvertedInvoice | undefined;

        if (isSpreadsheet) {
          try {
            const extracted = await extractFromSpreadsheet(file, DEFAULT_PORT);
            previewHtml = extracted.previewHtml;
            preParsedInvoice = extracted.invoice;
          } catch (err) {
            console.warn('Pre-parsing spreadsheet preview failed:', err);
          }
        }

        newDocs.push({
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          fileName: file.name,
          fileSize: file.size,
          uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          status: 'pending' as const,
          file,
          pdfUrl,
          previewHtml,
          invoice: preParsedInvoice
        });
      }
    }

    if (newDocs.length === 0) return;
    const allDocs = [...newDocs, ...documents];
    setDocuments(allDocs);
    setSelectedDocumentId(newDocs[0].id);
    if (allDocs.length > 1) {
      setConversionMode('multiple');
    } else if (!conversionMode) {
      setConversionMode('single');
    }
  };

  // Convert a single document
  const handleConvertDocument = async (docId: string) => {
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    if (!doc.file) {
      alert('Original file is missing from the current browser session. Please re-upload the document.');
      return;
    }

    const isSpreadsheet = /\.xlsx$|\.xls$|\.csv$/i.test(doc.fileName);

    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: 'processing', errorMessage: undefined } : d));

    try {
      let converted: ConvertedInvoice;
      if (isSpreadsheet) {
        const extracted = await extractFromSpreadsheet(doc.file, DEFAULT_PORT);
        converted = extracted.invoice;
      } else {
        if (!apiKey) {
          setIsKeyModalOpen(true);
          setDocuments(prev => prev.map(d => d.id === docId ? {
            ...d,
            status: 'failed',
            errorMessage: 'Gemini API key is required. Please enter an API key in settings.'
          } : d));
          return;
        }
        converted = await extractInvoiceFromPdf(doc.file, apiKey, DEFAULT_PORT);
      }

      if (doc.pdfUrl && !converted.pdfUrl) {
        converted.pdfUrl = doc.pdfUrl;
      }

      setDocuments(prev => prev.map(d => d.id === docId ? {
        ...d,
        status: 'processed',
        invoice: converted,
        errorMessage: undefined
      } : d));

      setSelectedDocumentId(docId);
      setActiveRightView('container_plan');
    } catch (err: any) {
      const isAuthError = err.message && (err.message.includes('401') || err.message.includes('API key'));
      if (isAuthError) {
        setIsKeyModalOpen(true);
      }
      setDocuments(prev => prev.map(d => d.id === docId ? {
        ...d,
        status: 'failed',
        errorMessage: err.message || 'Extraction failed'
      } : d));
    }
  };

  // Bulk convert all pending/failed documents at once ("Process Invoices")
  const handleConvertAll = async () => {
    const targets = documents.filter(d => d.status === 'pending' || d.status === 'failed');
    if (targets.length === 0 || isBulkConverting) return;

    const hasPdfs = targets.some(t => /\.pdf$/i.test(t.fileName));
    if (hasPdfs && !apiKey) {
      setIsKeyModalOpen(true);
      setDocuments(prev => prev.map(d => targets.some(t => t.id === d.id) ? {
        ...d,
        status: 'failed',
        errorMessage: 'Gemini API key is required for PDF parsing. Please enter an API key.'
      } : d));
      return;
    }

    setIsBulkConverting(true);

    // Mark all target documents as processing
    setDocuments(prev => prev.map(d => {
      if (d.status === 'pending' || d.status === 'failed') {
        return { ...d, status: 'processing', errorMessage: undefined };
      }
      return d;
    }));

    let currentDocs = [...documents];

    // Process targets sequentially
    for (const target of targets) {
      try {
        if (!target.file) {
          throw new Error('Original session file not found. Re-upload document.');
        }

        const isSpreadsheet = /\.xlsx$|\.xls$|\.csv$/i.test(target.fileName);
        let converted: ConvertedInvoice;

        if (isSpreadsheet) {
          const extracted = await extractFromSpreadsheet(target.file, DEFAULT_PORT);
          converted = extracted.invoice;
        } else {
          converted = await extractInvoiceFromPdf(target.file, apiKey, DEFAULT_PORT);
        }

        if (target.pdfUrl && !converted.pdfUrl) {
          converted.pdfUrl = target.pdfUrl;
        }

        currentDocs = currentDocs.map(d => d.id === target.id ? {
          ...d,
          status: 'processed',
          invoice: converted,
          errorMessage: undefined
        } : d);

        setDocuments(currentDocs);
      } catch (err: any) {
        const isAuthError = err.message && (err.message.includes('401') || err.message.includes('API key'));
        if (isAuthError) {
          setIsKeyModalOpen(true);
        }
        currentDocs = currentDocs.map(d => d.id === target.id ? {
          ...d,
          status: 'failed',
          errorMessage: err.message || 'Extraction failed'
        } : d);
        setDocuments(currentDocs);
      }
    }

    // Update all target documents in state
    setDocuments(currentDocs);

    // Process data according to user-selected conversion mode (Single Invoice vs Multiple Invoices)
    const processedDocs = currentDocs.filter(d => d.status === 'processed' && d.invoice);
    const shouldConsolidate = conversionMode === 'multiple' || (!conversionMode && processedDocs.length >= 2);
    if (shouldConsolidate && (processedDocs.length >= 2 || (conversionMode === 'multiple' && processedDocs.length >= 1))) {
      const consolidated = buildConsolidatedInvoice(processedDocs.map(d => d.invoice!));
      setConsolidatedInvoice(consolidated);
      setSelectedDocumentId('consolidated');
    } else {
      setConsolidatedInvoice(null);
      if (processedDocs.length > 0) {
        setSelectedDocumentId(processedDocs[0].id);
      }
    }

    setIsBulkConverting(false);
    setActiveRightView('container_plan');
  };

  // Update port on document
  const handlePortChange = (docId: string, newPort: CustomsPort) => {
    setDocuments(prev => prev.map(d => {
      if (d.id !== docId || !d.invoice) return d;
      const isAir = newPort === 'INBOM4';
      const updatedInvoice: ConvertedInvoice = {
        ...d.invoice,
        portOfLoading: newPort,
        portOfDischarge: isAir 
          ? (d.invoice.portOfDischarge === 'DEHAM' ? 'DEMUC' : d.invoice.portOfDischarge) 
          : (d.invoice.portOfDischarge === 'DEMUC' ? 'DEHAM' : d.invoice.portOfDischarge)
      };
      return {
        ...d,
        invoice: updatedInvoice
      };
    }));
  };

  // Save converted invoice to Files and clear the active file list / board
  const handleSaveInvoiceEdit = (updated: ConvertedInvoice) => {
    // 1. Store in savedFiles (update existing or prepend new, deduplicating by ID & invoiceNumber)
    setSavedFiles(prev => {
      const idx = prev.findIndex(f => 
        f.id === updated.id || 
        f.invoiceNumber.toLowerCase().trim() === updated.invoiceNumber.toLowerCase().trim()
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      }
      return [updated, ...prev];
    });

    // 2. If it was consolidatedInvoice, update consolidatedInvoice
    if (consolidatedInvoice && updated.id === consolidatedInvoice.id) {
      setConsolidatedInvoice(updated);
    }

    // 3. Update documents if it matches a document
    setDocuments(prev => prev.map(d => {
      if (d.invoice?.id === updated.id) {
        return { ...d, invoice: updated };
      }
      return d;
    }));
  };

  // Save all processed documents to Files with full deduplication and clear the board
  const handleSaveAllToFiles = () => {
    const processedInvoices = documents
      .filter(d => d.status === 'processed' && d.invoice)
      .map(d => d.invoice!);

    if (processedInvoices.length === 0) return;

    setSavedFiles(prev => {
      const existingIds = new Set(prev.map(f => f.id));
      const existingInvoiceNums = new Set(prev.map(f => f.invoiceNumber.toLowerCase().trim()));

      const newFiles = processedInvoices.filter(f => 
        !existingIds.has(f.id) && !existingInvoiceNums.has(f.invoiceNumber.toLowerCase().trim())
      );
      const updatedExisting = prev.map(f => {
        const match = processedInvoices.find(p => 
          p.id === f.id || p.invoiceNumber.toLowerCase().trim() === f.invoiceNumber.toLowerCase().trim()
        );
        return match || f;
      });
      return [...newFiles, ...updatedExisting];
    });

    // Clear saved documents from working board
    setDocuments(prev => prev.filter(d => d.status !== 'processed'));
    setSelectedDocumentId(null);
    setConsolidatedInvoice(null);
  };

  // Consolidate multiple processed invoices into a unified Master Shipment
  const handleConsolidateBatch = () => {
    const processedDocs = documents.filter(d => d.status === 'processed' && d.invoice);
    if (processedDocs.length < 2) return;
    const consolidated = buildConsolidatedInvoice(processedDocs.map(d => d.invoice!));
    setConsolidatedInvoice(consolidated);
    setSelectedDocumentId('consolidated');
  };

  // Open a saved file in the Document Converter for editing
  const handleOpenInConverter = (invoice: ConvertedInvoice) => {
    // Check if already in documents
    const existing = documents.find(d => d.invoice?.id === invoice.id);
    if (existing) {
      setSelectedDocumentId(existing.id);
    } else {
      const newDoc: AppDocument = {
        id: `doc-saved-${invoice.id}-${Date.now()}`,
        fileName: invoice.fileName,
        fileSize: invoice.fileSize,
        uploadedAt: invoice.convertedAt,
        status: 'processed',
        pdfUrl: invoice.pdfUrl,
        invoice: invoice
      };
      setDocuments(prev => [newDoc, ...prev]);
      setSelectedDocumentId(newDoc.id);
    }
    setActiveTab('converter');
  };

  // Delete a saved file from Files
  const handleDeleteSavedFile = (fileId: string) => {
    setSavedFiles(prev => {
      const remaining = prev.filter(f => f.id !== fileId);
      try {
        localStorage.setItem(LOCAL_STORAGE_SAVED_FILES_KEY, JSON.stringify(remaining));
        localStorage.setItem(LOCAL_STORAGE_INVOICES_KEY, JSON.stringify(remaining));
      } catch (err) {
        console.warn('Failed to update localStorage on file deletion:', err);
      }
      return remaining;
    });
  };

  // Clear all saved files
  const handleClearAllSavedFiles = () => {
    setSavedFiles([]);
    try {
      localStorage.setItem(LOCAL_STORAGE_SAVED_FILES_KEY, JSON.stringify([]));
      localStorage.setItem(LOCAL_STORAGE_INVOICES_KEY, JSON.stringify([]));
    } catch (err) {
      console.warn('Failed to clear files in localStorage:', err);
    }
  };

  // Delete working document from converter
  const handleDeleteDocument = (docId: string) => {
    setDocuments(prev => {
      const remaining = prev.filter(d => d.id !== docId);
      if (selectedDocumentId === docId) {
        setSelectedDocumentId(remaining.length > 0 ? remaining[0].id : null);
      }
      const processed = remaining.filter(d => d.status === 'processed' && d.invoice);
      if (processed.length >= 2) {
        setConsolidatedInvoice(buildConsolidatedInvoice(processed.map(d => d.invoice!)));
      } else {
        setConsolidatedInvoice(null);
        if (selectedDocumentId === 'consolidated') {
          setSelectedDocumentId(remaining.length > 0 ? remaining[0].id : null);
        }
      }
      try {
        localStorage.setItem(LOCAL_STORAGE_DOCS_KEY, JSON.stringify(remaining));
      } catch (err) {
        console.warn('Failed to update documents in localStorage:', err);
      }
      return remaining;
    });
  };

  // Clear all working documents
  const handleClearAllDocuments = () => {
    setDocuments([]);
    setConsolidatedInvoice(null);
    setSelectedDocumentId(null);
    try {
      localStorage.setItem(LOCAL_STORAGE_DOCS_KEY, JSON.stringify([]));
    } catch (err) {
      console.warn('Failed to clear documents in localStorage:', err);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-zinc-50 text-zinc-900 font-sans flex flex-col">
      {/* =========================================================================
          UNIFIED TOP NAVIGATION PANEL (Edge-to-edge, continuous, NO breaks or vertical dividers)
         ========================================================================= */}
      <header className="h-14 w-full bg-white border-b border-zinc-200 flex items-center justify-between px-5 shrink-0 z-20 select-none">
        {/* Left: Brand Logo & Wordmark */}
        <div className="flex items-center space-x-3 shrink-0">
          <img 
            src="/logo.png" 
            alt="Ekdant Logistics Logo" 
            className="h-8 w-auto object-contain rounded" 
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div className="min-w-0">
            <h1 className="text-xs font-semibold text-zinc-900 tracking-tight leading-tight">
              Ekdant Logistics
            </h1>
            <p className="text-[10px] text-zinc-500 font-normal">
              Dispatch Tool
            </p>
          </div>
        </div>

        {/* Right Section: Tab-dependent Header Controls */}
        {activeTab === 'files' ? (
          /* Files Repository Header: Search shipments */
          <div className="flex-1 flex items-center justify-end ml-6 min-w-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={fileSearchQuery}
                onChange={(e) => setFileSearchQuery(e.target.value)}
                placeholder="Search shipments..."
                className="w-48 lg:w-60 pl-8 pr-3 py-1 bg-zinc-50 border border-zinc-200 focus:border-zinc-400 rounded-lg text-xs text-zinc-800 placeholder-zinc-400 focus:bg-white outline-none transition-colors"
              />
            </div>
          </div>
        ) : null}
      </header>

      {/* Main Body Below Top Header */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <Sidebar 
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          savedFilesCount={savedFiles.length}
          masterFormatsCount={masterFormats.length}
          onOpenKeyModal={() => setIsKeyModalOpen(true)}
          showHeader={false}
        />
        {activeTab === 'converter' ? (
          <>
            <CenterColumn
              documents={documents}
              selectedDocumentId={selectedDocumentId}
              consolidatedInvoice={consolidatedInvoice}
              conversionMode={conversionMode}
              onConversionModeChange={setConversionMode}
              onSelectDocument={(id) => setSelectedDocumentId(id)}
              onFilesSelected={handleFilesSelected}
              onConvertDocument={handleConvertDocument}
              onConvertAll={handleConvertAll}
              isBulkConverting={isBulkConverting}
              onDeleteDocument={handleDeleteDocument}
              onClearAllDocuments={handleClearAllDocuments}
              onPortChange={handlePortChange}
              onSaveAllToFiles={handleSaveAllToFiles}
              onConsolidateBatch={handleConsolidateBatch}
            />
            <PreviewPane
              documents={documents}
              activeDocument={activeDocument}
              activeInvoice={activeInvoice}
              consolidatedInvoice={consolidatedInvoice}
              onSave={handleSaveInvoiceEdit}
              onPortChange={handlePortChange}
              masterFormats={masterFormats}
              selectedFormatId={selectedFormatId}
              onSelectFormat={handleSelectFormat}
              activeView={activeRightView}
              onSelectView={setActiveRightView}
              onOpenKeyModal={() => setIsKeyModalOpen(true)}
            />
          </>
        ) : activeTab === 'files' ? (
          <FilesView
            files={savedFiles}
            searchQuery={fileSearchQuery}
            portFilter="ALL"
            onOpenInConverter={handleOpenInConverter}
            onDeleteFile={handleDeleteSavedFile}
            onClearAllFiles={handleClearAllSavedFiles}
            onNavigateToConverter={() => setActiveTab('converter')}
          />
        ) : (
          <ManageMasterFormatsView
            formats={masterFormats}
            onAddFormat={handleSaveMasterFormat}
            onReplaceFormat={handleReplaceMasterFormat}
            onDeleteFormat={handleDeleteMasterFormat}
          />
        )}
      </div>

      {/* 3. Google Gemini API Key Configuration Modal */}
      <GeminiApiKeyModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        currentKey={apiKey}
        onSaveKey={handleSaveApiKey}
      />
    </div>
  );
}

export default App;
