import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { CenterColumn } from './components/CenterColumn';
import { PreviewPane } from './components/PreviewPane';
import type { ConvertedInvoice, CustomsPort, AppDocument } from './types';
import { extractInvoiceFromPdf } from './utils/geminiExtractor';

const LOCAL_STORAGE_DOCS_KEY = 'ekdant_customs_documents_v1';
const LOCAL_STORAGE_INVOICES_KEY = 'ekdant_customs_invoices_v4';
const LOCAL_STORAGE_KEY_KEY = 'ekdant_gemini_key';
const DEFAULT_PORT: CustomsPort = 'INNSA1';

export function App() {
  // All Uploaded Documents (both pending and processed)
  const [documents, setDocuments] = useState<AppDocument[]>(() => {
    try {
      const savedDocs = localStorage.getItem(LOCAL_STORAGE_DOCS_KEY);
      if (savedDocs) {
        const parsed = JSON.parse(savedDocs);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      // Backward compatibility migration from legacy invoices key
      const legacyInvoices = localStorage.getItem(LOCAL_STORAGE_INVOICES_KEY);
      if (legacyInvoices) {
        const parsed = JSON.parse(legacyInvoices);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((inv: ConvertedInvoice) => ({
            id: inv.id,
            fileName: inv.fileName,
            fileSize: inv.fileSize,
            uploadedAt: inv.convertedAt,
            status: 'processed' as const,
            pdfUrl: inv.pdfUrl,
            invoice: inv
          }));
        }
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

  // Gemini API Key
  const apiKey = 
    (import.meta.env as any).PDF_Parser ||
    import.meta.env.VITE_GEMINI_API_KEY ||
    localStorage.getItem(LOCAL_STORAGE_KEY_KEY) ||
    'AQ.Ab8RN6IyREuG3Byw10B0La598MTc_8xAMNzQ2c6xs2mosvgfoA';

  // Active Selected Document
  const activeDocument = documents.find(d => d.id === selectedDocumentId) || (documents.length > 0 ? documents[0] : null);

  // Persist documents whenever updated
  useEffect(() => {
    try {
      // Serialize documents excluding ephemeral in-memory File objects
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

      // Keep legacy invoice cache updated
      const processedInvoices = documents
        .filter(d => d.status === 'processed' && d.invoice)
        .map(d => d.invoice!);
      localStorage.setItem(LOCAL_STORAGE_INVOICES_KEY, JSON.stringify(processedInvoices));
    } catch (err) {
      console.warn('Failed to save documents to localStorage:', err);
    }
  }, [documents]);

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

  // Save edits from the Right Preview Pane
  const handleSaveInvoiceEdit = (updated: ConvertedInvoice) => {
    setDocuments(prev => prev.map(d => {
      if (d.invoice && d.invoice.id === updated.id) {
        return {
          ...d,
          invoice: updated
        };
      }
      return d;
    }));
  };

  // Delete document
  const handleDeleteDocument = (docId: string) => {
    setDocuments(prev => {
      const remaining = prev.filter(d => d.id !== docId);
      if (selectedDocumentId === docId) {
        setSelectedDocumentId(remaining.length > 0 ? remaining[0].id : null);
      }
      return remaining;
    });
  };

  // Clear all documents
  const handleClearAllDocuments = () => {
    setDocuments([]);
    setSelectedDocumentId(null);
    localStorage.removeItem(LOCAL_STORAGE_DOCS_KEY);
    localStorage.removeItem(LOCAL_STORAGE_INVOICES_KEY);
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-slate-50 text-slate-900 font-sans">
      {/* 1. Left Non-Collapsible Sidebar */}
      <Sidebar />

      {/* 2. Center Workspace (Upload Dropzone + Uploaded Documents List with Status & Bulk Convert) */}
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
      />

      {/* 3. Right Preview Pane (Active Editable Invoice or Pending Document Preview + PDF Carousel) */}
      <PreviewPane
        document={activeDocument}
        onSave={handleSaveInvoiceEdit}
        onPortChange={handlePortChange}
        onConvert={handleConvertDocument}
      />
    </div>
  );
}

export default App;
