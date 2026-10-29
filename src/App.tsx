import { useState, useEffect } from 'react';
import { FolderArchive } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import type { NavTab } from './components/Sidebar';
import { CenterColumn } from './components/CenterColumn';
import { PreviewPane } from './components/PreviewPane';
import { FilesView } from './components/FilesView';
import { GeminiApiKeyModal } from './components/GeminiApiKeyModal';
import type { ConvertedInvoice, CustomsPort, AppDocument } from './types';
import { extractInvoiceFromPdf } from './utils/geminiExtractor';

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
        if (Array.isArray(parsed)) return parsed;
      }
      // Migrate existing legacy converted invoices if any
      const legacyInvoices = localStorage.getItem(LOCAL_STORAGE_INVOICES_KEY);
      if (legacyInvoices) {
        const parsed = JSON.parse(legacyInvoices);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
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

  // Handle files selected (drag & drop or browse) - NO AUTO-PROCESSING
  const handleFilesSelected = (files: File[]) => {
    const newDocs: AppDocument[] = files.map(file => {
      const pdfUrl = typeof window !== 'undefined' && window.URL ? URL.createObjectURL(file) : undefined;
      return {
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: file.name,
        fileSize: file.size,
        uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'pending' as const,
        file,
        pdfUrl
      };
    });

    setDocuments(prev => [...newDocs, ...prev]);

    // Auto-select the first newly uploaded document for instant preview
    if (newDocs.length > 0) {
      setSelectedDocumentId(newDocs[0].id);
    }
  };

  // Convert a single document
  const handleConvertDocument = async (docId: string) => {
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    if (!doc.file) {
      alert('Original PDF file is missing from the current browser session. Please re-upload the document.');
      return;
    }

    if (!apiKey) {
      setIsKeyModalOpen(true);
      setDocuments(prev => prev.map(d => d.id === docId ? {
        ...d,
        status: 'failed',
        errorMessage: 'Gemini API key is required. Please enter an API key in settings.'
      } : d));
      return;
    }

    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status: 'processing', errorMessage: undefined } : d));

    try {
      const converted = await extractInvoiceFromPdf(doc.file, apiKey, DEFAULT_PORT);
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

  // Bulk convert all pending/failed documents at once
  const handleConvertAll = async () => {
    const targets = documents.filter(d => d.status === 'pending' || d.status === 'failed');
    if (targets.length === 0 || isBulkConverting) return;

    if (!apiKey) {
      setIsKeyModalOpen(true);
      setDocuments(prev => prev.map(d => targets.some(t => t.id === d.id) ? {
        ...d,
        status: 'failed',
        errorMessage: 'Gemini API key is required. Please enter an API key in settings.'
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

    // Process targets sequentially
    for (const target of targets) {
      try {
        if (!target.file) {
          throw new Error('Original session file not found. Re-upload document.');
        }

        const converted = await extractInvoiceFromPdf(target.file, apiKey, DEFAULT_PORT);
        if (target.pdfUrl && !converted.pdfUrl) {
          converted.pdfUrl = target.pdfUrl;
        }

        setDocuments(prev => prev.map(d => d.id === target.id ? {
          ...d,
          status: 'processed',
          invoice: converted,
          errorMessage: undefined
        } : d));
      } catch (err: any) {
        const isAuthError = err.message && (err.message.includes('401') || err.message.includes('API key'));
        if (isAuthError) {
          setIsKeyModalOpen(true);
        }
        setDocuments(prev => prev.map(d => d.id === target.id ? {
          ...d,
          status: 'failed',
          errorMessage: err.message || 'Extraction failed'
        } : d));
      }
    }

    setIsBulkConverting(false);
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
    // 1. Store in savedFiles (update existing or prepend new)
    setSavedFiles(prev => {
      const idx = prev.findIndex(f => f.id === updated.id);
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

  // Save all processed documents to Files and clear the board
  const handleSaveAllToFiles = () => {
    const processedInvoices = documents
      .filter(d => d.status === 'processed' && d.invoice)
      .map(d => d.invoice!);

    if (processedInvoices.length === 0) return;

    setSavedFiles(prev => {
      const existingIds = new Set(prev.map(f => f.id));
      const newFiles = processedInvoices.filter(f => !existingIds.has(f.id));
      const updatedExisting = prev.map(f => {
        const match = processedInvoices.find(p => p.id === f.id);
        return match || f;
      });
      return [...newFiles, ...updatedExisting];
    });

    // Clear saved documents from working board
    setDocuments(prev => prev.filter(d => d.status !== 'processed'));
    setSelectedDocumentId(null);
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
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-50 text-slate-900 font-sans">
      {/* =========================================================================
          GLOBAL UNIFIED TOP NAVIGATION PANEL (Spanning 100% full screen width)
         ========================================================================= */}
      <header className="h-16 w-full bg-white border-b border-slate-200/80 flex items-center justify-between px-6 shrink-0 z-20 select-none">
        {/* Left: Brand Logo & Wordmark */}
        <div className="flex items-center space-x-3.5 shrink-0">
          <img 
            src="/logo.png" 
            alt="Ekdant Logistics Logo" 
            className="h-9 w-auto object-contain rounded" 
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-slate-900 tracking-tight leading-tight">
              Ekdant Logistics
            </h1>
            <p className="text-[10px] text-slate-400 font-medium">
              Customs Document Converter
            </p>
          </div>
        </div>

        {/* Right: Context Status / Active Document */}
        <div className="flex items-center space-x-2 text-xs font-medium text-slate-500">
          {activeTab === 'files' ? (
            <div className="flex items-center space-x-2 text-slate-700 font-semibold">
              <FolderArchive className="w-4 h-4 text-indigo-600" />
              <span>Saved Files Repository ({savedFiles.length})</span>
            </div>
          ) : activeDocument ? (
            <div className="flex items-center space-x-2">
              <span className="text-slate-400">Active Document:</span>
              <span className="font-semibold text-slate-800 truncate max-w-[240px] lg:max-w-[380px]">
                {activeDocument.invoice?.invoiceNumber || activeDocument.fileName}
              </span>
              {activeDocument.status === 'processed' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Processed
                </span>
              )}
              {activeDocument.status === 'pending' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  Pending
                </span>
              )}
              {activeDocument.status === 'failed' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                  Failed
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-400 font-medium">Multi-Page Customs Invoices & Packing Lists</span>
          )}
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* 1. Left Non-Collapsible Sidebar */}
        <Sidebar 
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          savedFilesCount={savedFiles.length}
          onOpenKeyModal={() => setIsKeyModalOpen(true)}
        />

        {/* 2. Main Workspace: Document Converter or Saved Files Tiles */}
        {activeTab === 'converter' ? (
          <>
            {/* Center Workspace (Upload Dropzone + Uploaded Documents List with Status & Bulk Convert) */}
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
            />

            {/* Right Preview Pane (Active Editable Invoice or Pending Document Preview + PDF Carousel) */}
            <PreviewPane
              document={activeDocument}
              onSave={handleSaveInvoiceEdit}
              onPortChange={handlePortChange}
              onConvert={handleConvertDocument}
              onOpenKeyModal={() => setIsKeyModalOpen(true)}
            />
          </>
        ) : (
          /* Saved Files View (Tiles with Firm Name, Invoice Number, and Exports) */
          <FilesView
            files={savedFiles}
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
    </div>
  );
}

export default App;
