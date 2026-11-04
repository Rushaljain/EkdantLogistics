import { useState, useEffect } from 'react';
import { FolderArchive, Search, Plus } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import type { NavTab } from './components/Sidebar';
import { CenterColumn } from './components/CenterColumn';
import { PreviewPane } from './components/PreviewPane';
import type { RightPaneViewMode } from './components/PreviewPane';
import { FilesView } from './components/FilesView';
import { GeminiApiKeyModal } from './components/GeminiApiKeyModal';
import { ManageMasterFormatsModal } from './components/ManageMasterFormatsModal';
import type { ConvertedInvoice, CustomsPort, AppDocument, MasterFormat } from './types';
import { extractInvoiceFromPdf } from './utils/geminiExtractor';
import { extractFromSpreadsheet } from './utils/spreadsheetExtractor';
import { optimizeContainerAllocation } from './utils/containerOptimizer';
import { SHIPMENT_MUMGA3747500 } from './data/profiles';
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

  // Files Repository Search & Port Filter
  const [fileSearchQuery, setFileSearchQuery] = useState<string>('');
  const [filePortFilter, setFilePortFilter] = useState<'ALL' | string>('ALL');

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
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
      // Migrate existing legacy converted invoices if any
      const legacyInvoices = localStorage.getItem(LOCAL_STORAGE_INVOICES_KEY);
      if (legacyInvoices) {
        const parsed = JSON.parse(legacyInvoices);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return [SHIPMENT_MUMGA3747500];
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

  // Selected Document ID for Right Preview Pane
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(() => {
    try {
      const savedDocs = localStorage.getItem(LOCAL_STORAGE_DOCS_KEY);
      if (savedDocs) {
        const parsed = JSON.parse(savedDocs);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].id;
      }
    } catch {}
    return null;
  });

  // Bulk conversion state
  const [isBulkConverting, setIsBulkConverting] = useState<boolean>(false);

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
  const [isFormatsModalOpen, setIsFormatsModalOpen] = useState<boolean>(false);
  const [activeRightView, setActiveRightView] = useState<RightPaneViewMode>('container_plan');

  // Active Selected Document in converter
  const activeDocument = documents.find(d => d.id === selectedDocumentId) || (documents.length > 0 ? documents[0] : null);

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
    setSelectedFormatId(format.id);
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
    setDocuments(prev => [...newDocs, ...prev]);
    setSelectedDocumentId(newDocs[0].id);
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

    // Auto-consolidation if multiple invoices processed in batch
    const processedDocs = currentDocs.filter(d => d.status === 'processed' && d.invoice);
    if (processedDocs.length >= 2) {
      const invoices = processedDocs.map(d => d.invoice!);
      const primary = invoices[0];

      const combinedLineItems = invoices.flatMap((inv, invIdx) => 
        inv.lineItems.map((item, itemIdx) => ({
          ...item,
          id: `item-batch-${invIdx}-${itemIdx}-${item.id}`,
          itemNumber: itemIdx + 1
        }))
      );

      const totalGross = combinedLineItems.reduce((acc, it) => acc + (it.grossWeightKg || 0), 0) || invoices.reduce((s, i) => s + i.grossWeightKg, 0);
      const totalNet = combinedLineItems.reduce((acc, it) => acc + (it.netWeightKg || 0), 0) || invoices.reduce((s, i) => s + i.netWeightKg, 0);
      const totalPkgs = combinedLineItems.reduce((acc, it) => acc + (it.quantity || 1), 0);
      const totalPalletCount = invoices.reduce((s, i) => s + (i.totalPallets || i.pallets?.length || 1), 0);
      const hasDangerousGoods = combinedLineItems.some(it => it.isDangerousGood) || invoices.some(i => i.hasDangerousGoods);
      const invoiceNumbers = invoices.map(i => i.invoiceNumber).join(' + ');

      const { containers, pallets } = optimizeContainerAllocation(combinedLineItems, undefined, {
        preferredContainerType: '20GP',
        explicitPalletCount: totalPalletCount
      });

      const consolidatedInvoice: ConvertedInvoice = {
        id: `inv-batch-${Date.now()}`,
        fileName: `Consolidated_Batch_${invoices.length}_Invoices.pdf`,
        fileSize: invoices.reduce((s, i) => s + i.fileSize, 0),
        convertedAt: `Today, ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        rawTimestamp: Date.now(),
        status: 'converted',
        invoiceNumber: invoiceNumbers,
        invoiceDate: primary.invoiceDate,
        bookingNumber: primary.bookingNumber || `BKG-BATCH-${Date.now().toString().slice(-5)}`,
        masterBolNumber: `BOL-EKD-BATCH${Date.now().toString().slice(-6)}`,
        exporterName: primary.exporterName,
        shipperAddress: primary.shipperAddress,
        iec: primary.iec,
        gstin: primary.gstin,
        adCode: primary.adCode,
        consigneeName: primary.consigneeName,
        consigneeAddress: primary.consigneeAddress,
        notifyParty: primary.notifyParty,
        portOfLoading: primary.portOfLoading,
        portOfDischarge: primary.portOfDischarge,
        destinationCountry: primary.destinationCountry,
        vesselName: primary.vesselName,
        voyageNumber: primary.voyageNumber,
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
        hasDangerousGoods,
        selectedBolTemplateId: 'bol-standard',
        selectedDgTemplateId: 'dg-imo-standard',
        containers,
        pallets,
        lineItems: combinedLineItems,
        pdfUrl: primary.pdfUrl
      };

      const newDoc: AppDocument = {
        id: `doc-batch-${Date.now()}`,
        fileName: consolidatedInvoice.fileName,
        fileSize: consolidatedInvoice.fileSize,
        uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'processed',
        invoice: consolidatedInvoice,
        pdfUrl: primary.pdfUrl
      };

      const consolidatedIds = new Set(processedDocs.map(d => d.id));
      const finalDocs = [newDoc, ...currentDocs.filter(d => !consolidatedIds.has(d.id))];
      setDocuments(finalDocs);
      setSelectedDocumentId(newDoc.id);
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

    // 2. Clear saved file from working board so the user can add more files
    setDocuments(prev => {
      const remaining = prev.filter(d => d.invoice?.id !== updated.id && d.id !== selectedDocumentId);
      return remaining;
    });
    setSelectedDocumentId(null);
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
  };

  // Consolidate multiple processed invoices into a unified Master Shipment
  const handleConsolidateBatch = () => {
    const processedDocs = documents.filter(d => d.status === 'processed' && d.invoice);
    if (processedDocs.length < 2) return;

    const invoices = processedDocs.map(d => d.invoice!);
    const primary = invoices[0];

    // Merge line items
    const combinedLineItems = invoices.flatMap((inv, invIdx) => 
      inv.lineItems.map((item, itemIdx) => ({
        ...item,
        id: `item-batch-${invIdx}-${itemIdx}-${item.id}`,
        itemNumber: itemIdx + 1
      }))
    );

    const totalGross = combinedLineItems.reduce((acc, it) => acc + (it.grossWeightKg || 0), 0) || invoices.reduce((s, i) => s + i.grossWeightKg, 0);
    const totalNet = combinedLineItems.reduce((acc, it) => acc + (it.netWeightKg || 0), 0) || invoices.reduce((s, i) => s + i.netWeightKg, 0);
    const totalPkgs = combinedLineItems.reduce((acc, it) => acc + (it.quantity || 1), 0);
    const totalPalletCount = invoices.reduce((s, i) => s + (i.totalPallets || i.pallets?.length || 1), 0);

    const hasDangerousGoods = combinedLineItems.some(it => it.isDangerousGood) || invoices.some(i => i.hasDangerousGoods);
    const invoiceNumbers = invoices.map(i => i.invoiceNumber).join(' + ');

    // Re-run LAFF solver for the consolidated batch
    const { containers, pallets } = optimizeContainerAllocation(combinedLineItems, undefined, {
      preferredContainerType: '20GP',
      explicitPalletCount: totalPalletCount
    });

    const consolidatedInvoice: ConvertedInvoice = {
      id: `inv-batch-${Date.now()}`,
      fileName: `Consolidated_Batch_${invoices.length}_Invoices.pdf`,
      fileSize: invoices.reduce((s, i) => s + i.fileSize, 0),
      convertedAt: `Today, ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      rawTimestamp: Date.now(),
      status: 'converted',
      invoiceNumber: invoiceNumbers,
      invoiceDate: primary.invoiceDate,
      bookingNumber: primary.bookingNumber || `BKG-BATCH-${Date.now().toString().slice(-5)}`,
      masterBolNumber: `BOL-EKD-BATCH${Date.now().toString().slice(-6)}`,
      exporterName: primary.exporterName,
      shipperAddress: primary.shipperAddress,
      iec: primary.iec,
      gstin: primary.gstin,
      adCode: primary.adCode,
      consigneeName: primary.consigneeName,
      consigneeAddress: primary.consigneeAddress,
      notifyParty: primary.notifyParty,
      portOfLoading: primary.portOfLoading,
      portOfDischarge: primary.portOfDischarge,
      destinationCountry: primary.destinationCountry,
      vesselName: primary.vesselName,
      voyageNumber: primary.voyageNumber,
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
      hasDangerousGoods,
      selectedBolTemplateId: 'bol-standard',
      selectedDgTemplateId: 'dg-imo-standard',
      containers,
      pallets,
      lineItems: combinedLineItems,
      pdfUrl: primary.pdfUrl
    };

    const newDoc: AppDocument = {
      id: `doc-batch-${Date.now()}`,
      fileName: consolidatedInvoice.fileName,
      fileSize: consolidatedInvoice.fileSize,
      uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'processed',
      invoice: consolidatedInvoice,
      pdfUrl: primary.pdfUrl
    };

    const consolidatedIds = new Set(processedDocs.map(d => d.id));
    setDocuments(prev => [newDoc, ...prev.filter(d => !consolidatedIds.has(d.id))]);
    setSelectedDocumentId(newDoc.id);
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
    setSavedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // Clear all saved files
  const handleClearAllSavedFiles = () => {
    setSavedFiles([]);
    localStorage.removeItem(LOCAL_STORAGE_SAVED_FILES_KEY);
  };

  // Delete working document from converter
  const handleDeleteDocument = (docId: string) => {
    setDocuments(prev => {
      const remaining = prev.filter(d => d.id !== docId);
      if (selectedDocumentId === docId) {
        setSelectedDocumentId(remaining.length > 0 ? remaining[0].id : null);
      }
      return remaining;
    });
  };

  // Clear all working documents
  const handleClearAllDocuments = () => {
    setDocuments([]);
    setSelectedDocumentId(null);
    localStorage.removeItem(LOCAL_STORAGE_DOCS_KEY);
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-zinc-50 text-zinc-900 font-sans">
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
        {activeTab === 'converter' ? (
          <div className="flex items-center space-x-2 text-xs font-normal text-zinc-500">
            {activeDocument ? (
              <div className="flex items-center space-x-2">
                <span className="text-zinc-400">Active Shipment:</span>
                <span className="font-medium text-zinc-800 truncate max-w-[240px] lg:max-w-[380px]">
                  {activeDocument.invoice?.invoiceNumber || activeDocument.fileName}
                </span>
                {activeDocument.invoice && (
                  <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-100 text-zinc-700 border border-zinc-200">
                    {activeDocument.invoice.containers?.length || 1} Cont • {Math.round(activeDocument.invoice.grossWeightKg || 0).toLocaleString()} kg
                  </span>
                )}
                {activeDocument.invoice?.hasDangerousGoods && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200/60">
                    #DG HazMat
                  </span>
                )}
                {activeDocument.status === 'processed' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    Allocated
                  </span>
                )}
                {activeDocument.status === 'pending' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600 border border-zinc-200">
                    Pending
                  </span>
                )}
                {activeDocument.status === 'failed' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200/60">
                    Failed
                  </span>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          /* Files Repository Global Header Controls (Seamlessly aligned with NO vertical divider) */
          <div className="flex-1 flex items-center justify-between ml-6 min-w-0">
            {/* Title & Count */}
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center shrink-0">
                <FolderArchive className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xs font-semibold text-zinc-900 tracking-tight">
                  Saved Shipments Repository
                </h2>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-zinc-100 text-zinc-700 border border-zinc-200 font-mono">
                  {savedFiles.length} {savedFiles.length === 1 ? 'shipment' : 'shipments'}
                </span>
              </div>
            </div>

            {/* Search, Filter & Action Button */}
            <div className="flex items-center space-x-2.5 shrink-0">
              {/* Search Box */}
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

              {/* Port Filter */}
              <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg border border-zinc-200/80 text-xs">
                <button
                  type="button"
                  onClick={() => setFilePortFilter('ALL')}
                  className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer text-xs ${
                    filePortFilter === 'ALL'
                      ? 'bg-white text-zinc-900 font-medium shadow-2xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  All Ports
                </button>
                <button
                  type="button"
                  onClick={() => setFilePortFilter('INNSA1')}
                  className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer text-xs ${
                    filePortFilter === 'INNSA1'
                      ? 'bg-white text-zinc-900 font-medium shadow-2xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Nhava Sheva
                </button>
                <button
                  type="button"
                  onClick={() => setFilePortFilter('INBOM4')}
                  className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer text-xs ${
                    filePortFilter === 'INBOM4'
                      ? 'bg-white text-zinc-900 font-medium shadow-2xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Mumbai Air
                </button>
              </div>

              {/* New Shipment Action */}
              <button
                type="button"
                onClick={() => setActiveTab('converter')}
                className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Shipment</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Body Below Top Header */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <Sidebar 
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          savedFilesCount={savedFiles.length}
          onOpenKeyModal={() => setIsKeyModalOpen(true)}
          onOpenFormatsModal={() => setIsFormatsModalOpen(true)}
          showHeader={false}
        />
        {activeTab === 'converter' ? (
          <>
            <CenterColumn
              documents={documents}
              selectedDocumentId={activeDocument?.id || null}
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
              onSave={handleSaveInvoiceEdit}
              onPortChange={handlePortChange}
              masterFormats={masterFormats}
              selectedFormatId={selectedFormatId}
              onSelectFormat={setSelectedFormatId}
              activeView={activeRightView}
              onSelectView={setActiveRightView}
              onOpenKeyModal={() => setIsKeyModalOpen(true)}
            />
          </>
        ) : (
          <FilesView
            files={savedFiles}
            searchQuery={fileSearchQuery}
            portFilter={filePortFilter}
            onOpenInConverter={handleOpenInConverter}
            onDeleteFile={handleDeleteSavedFile}
            onClearAllFiles={handleClearAllSavedFiles}
            onNavigateToConverter={() => setActiveTab('converter')}
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

      {/* 4. Manage Master Formats Modal */}
      <ManageMasterFormatsModal
        isOpen={isFormatsModalOpen}
        onClose={() => setIsFormatsModalOpen(false)}
        formats={masterFormats}
        onAddFormat={handleSaveMasterFormat}
        onDeleteFormat={handleDeleteMasterFormat}
      />
    </div>
  );
}

export default App;
