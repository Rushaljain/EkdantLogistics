import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { CenterColumn } from './components/CenterColumn';
import { PreviewPane } from './components/PreviewPane';
import type { ConvertedInvoice, QueueFile, CustomsPort } from './types';
import { extractInvoiceFromPdf } from './utils/geminiExtractor';

const LOCAL_STORAGE_INVOICES_KEY = 'ekdant_customs_invoices_v4';
const LOCAL_STORAGE_KEY_KEY = 'ekdant_gemini_key';
const DEFAULT_PORT: CustomsPort = 'INNSA1';

export function App() {
  // Converted Invoices Feed
  const [invoices, setInvoices] = useState<ConvertedInvoice[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_INVOICES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });

  // Selected Invoice ID for Right Preview Pane
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_INVOICES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].id;
      }
    } catch {}
    return null;
  });

  // Upload Queue
  const [queue, setQueue] = useState<QueueFile[]>([]);

  // Gemini API Key (reads from Vercel env PDF_Parser / VITE_GEMINI_API_KEY, localStorage, or default)
  const apiKey = 
    (import.meta.env as any).PDF_Parser ||
    import.meta.env.VITE_GEMINI_API_KEY ||
    localStorage.getItem(LOCAL_STORAGE_KEY_KEY) ||
    'AQ.Ab8RN6IyREuG3Byw10B0La598MTc_8xAMNzQ2c6xs2mosvgfoA';

  // Active Selected Invoice (defaults to selected or first invoice)
  const activeInvoice = invoices.find(inv => inv.id === selectedInvoiceId) || (invoices.length > 0 ? invoices[0] : null);

  // Persist invoices whenever updated
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_INVOICES_KEY, JSON.stringify(invoices));
    } catch (err) {
      console.warn('Failed to save invoices to localStorage:', err);
    }
  }, [invoices]);

  // Handle multiple files selected
  const handleFilesSelected = async (files: File[]) => {
    const newQueueItems: QueueFile[] = files.map(file => ({
      id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      size: file.size,
      status: 'processing',
      file
    }));

    setQueue(prev => [...newQueueItems, ...prev]);

    // Process each file
    for (const item of newQueueItems) {
      try {
        if (!item.file) continue;
        const converted = await extractInvoiceFromPdf(item.file, apiKey, DEFAULT_PORT);

        // Update queue item status to converted
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'converted' } : q));

        // Add to converted invoices list (newest first)
        setInvoices(prev => [converted, ...prev]);

        // Auto-select the newly converted invoice into the preview pane
        setSelectedInvoiceId(converted.id);
      } catch (err: any) {
        setQueue(prev => prev.map(q => q.id === item.id ? { 
          ...q, 
          status: 'failed', 
          errorMessage: err.message || 'Processing failed' 
        } : q));
      }
    }
  };

  // Retry a failed file
  const handleRetryFile = async (fileId: string) => {
    const target = queue.find(q => q.id === fileId);
    if (!target || !target.file) return;

    setQueue(prev => prev.map(q => q.id === fileId ? { ...q, status: 'processing', errorMessage: undefined } : q));

    try {
      const converted = await extractInvoiceFromPdf(target.file, apiKey, DEFAULT_PORT);
      setQueue(prev => prev.map(q => q.id === fileId ? { ...q, status: 'converted' } : q));
      setInvoices(prev => [converted, ...prev]);
      setSelectedInvoiceId(converted.id);
    } catch (err: any) {
      setQueue(prev => prev.map(q => q.id === fileId ? { 
        ...q, 
        status: 'failed', 
        errorMessage: err.message || 'Processing failed' 
      } : q));
    }
  };

  const handleRemoveQueueItem = (fileId: string) => {
    setQueue(prev => prev.filter(q => q.id !== fileId));
  };

  const handleClearCompletedQueue = () => {
    setQueue(prev => prev.filter(q => q.status !== 'converted'));
  };

  // Update port on invoice
  const handleInvoicePortChange = (invoiceId: string, newPort: CustomsPort) => {
    setInvoices(prev => prev.map(inv => {
      if (inv.id !== invoiceId) return inv;
      const isAir = newPort === 'INBOM4';
      return {
        ...inv,
        portOfLoading: newPort,
        portOfDischarge: isAir ? (inv.portOfDischarge === 'DEHAM' ? 'DEMUC' : inv.portOfDischarge) : (inv.portOfDischarge === 'DEMUC' ? 'DEHAM' : inv.portOfDischarge)
      };
    }));
  };

  // Save edits from the Right Preview Pane
  const handleSaveInvoiceEdit = (updated: ConvertedInvoice) => {
    setInvoices(prev => prev.map(inv => inv.id === updated.id ? updated : inv));
  };

  // Delete invoice
  const handleDeleteInvoice = (invoiceId: string) => {
    setInvoices(prev => {
      const remaining = prev.filter(inv => inv.id !== invoiceId);
      if (selectedInvoiceId === invoiceId) {
        setSelectedInvoiceId(remaining.length > 0 ? remaining[0].id : null);
      }
      return remaining;
    });
  };

  // Clear all invoices
  const handleClearAllInvoices = () => {
    setInvoices([]);
    setSelectedInvoiceId(null);
    localStorage.removeItem(LOCAL_STORAGE_INVOICES_KEY);
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-slate-50 text-slate-900 font-sans">
      {/* 1. Left Non-Collapsible Sidebar */}
      <Sidebar />

      {/* 2. Center Workspace (Upload + Ready Files List) */}
      <CenterColumn
        invoices={invoices}
        queue={queue}
        selectedInvoiceId={activeInvoice?.id || null}
        onSelectInvoice={(id) => setSelectedInvoiceId(id)}
        onFilesSelected={handleFilesSelected}
        onRetryFile={handleRetryFile}
        onRemoveQueueItem={handleRemoveQueueItem}
        onClearCompletedQueue={handleClearCompletedQueue}
        onDeleteInvoice={handleDeleteInvoice}
        onClearAllInvoices={handleClearAllInvoices}
        onPortChange={handleInvoicePortChange}
      />

      {/* 3. Right Preview Pane (Integrated "Preview & Edit" + PDF Side-by-Side Carousel) */}
      <PreviewPane
        invoice={activeInvoice}
        onSave={handleSaveInvoiceEdit}
        onPortChange={handleInvoicePortChange}
      />
    </div>
  );
}

export default App;
