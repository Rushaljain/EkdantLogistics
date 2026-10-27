import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { UploadZone } from './components/UploadZone';
import { FileQueueCard } from './components/FileQueueCard';
import { ConvertedOutputsFeed } from './components/ConvertedOutputsFeed';
import { EditModal } from './components/EditModal';
import type { ConvertedInvoice, QueueFile, CustomsPort } from './types';
import { INITIAL_SAMPLE_INVOICE } from './data/profiles';
import { extractInvoiceFromPdf } from './utils/geminiExtractor';

const LOCAL_STORAGE_INVOICES_KEY = 'ekdant_customs_invoices_v2';
const LOCAL_STORAGE_PORT_KEY = 'ekdant_customs_port_v2';
const LOCAL_STORAGE_KEY_KEY = 'ekdant_gemini_key';

export function App() {
  // Current active port
  const [currentPort, setCurrentPort] = useState<CustomsPort>(() => {
    return (localStorage.getItem(LOCAL_STORAGE_PORT_KEY) as CustomsPort) || 'INNSA1';
  });

  // Converted Invoices Feed
  const [invoices, setInvoices] = useState<ConvertedInvoice[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_INVOICES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    // Initial state: pre-load 1 realistic converted invoice
    return [INITIAL_SAMPLE_INVOICE];
  });

  // Upload Queue
  const [queue, setQueue] = useState<QueueFile[]>([]);

  // Modals state
  const [editingInvoice, setEditingInvoice] = useState<ConvertedInvoice | null>(null);

  // Gemini API Key (reads from Vercel env PDF_Parser / VITE_GEMINI_API_KEY, localStorage, or default)
  const apiKey = 
    localStorage.getItem(LOCAL_STORAGE_KEY_KEY) ||
    (import.meta.env as any).PDF_Parser ||
    import.meta.env.VITE_GEMINI_API_KEY ||
    'AQ.Ab8RN6IyREuG3Byw10B0La598MTc_8xAMNzQ2c6xs2mosvgfoA';

  // Persist invoices whenever updated
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_INVOICES_KEY, JSON.stringify(invoices));
    } catch (err) {
      console.warn('Failed to save invoices to localStorage:', err);
    }
  }, [invoices]);

  // Persist port
  const handlePortChange = (port: CustomsPort) => {
    setCurrentPort(port);
    localStorage.setItem(LOCAL_STORAGE_PORT_KEY, port);
  };

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
        const converted = await extractInvoiceFromPdf(item.file, apiKey, currentPort);

        // Update queue item status to converted
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'converted' } : q));

        // Add to converted invoices feed (newest first)
        setInvoices(prev => [converted, ...prev]);
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
      const converted = await extractInvoiceFromPdf(target.file, apiKey, currentPort);
      setQueue(prev => prev.map(q => q.id === fileId ? { ...q, status: 'converted' } : q));
      setInvoices(prev => [converted, ...prev]);
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

  // 1-Click Load Sample Invoice
  const handleLoadSample = () => {
    const now = new Date();
    const timeString = `Today, ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const isAir = currentPort === 'INBOM4';

    const newSample: ConvertedInvoice = {
      ...INITIAL_SAMPLE_INVOICE,
      id: `inv-sample-${Date.now()}`,
      invoiceNumber: `EXP/${now.getFullYear()}/${Math.floor(100 + Math.random() * 900)}`,
      portOfLoading: currentPort,
      portOfDischarge: isAir ? 'DEMUC' : 'DEHAM',
      convertedAt: timeString,
      rawTimestamp: Date.now()
    };

    setInvoices(prev => [newSample, ...prev]);

    // Also add temporary item in queue for visual delight
    setQueue(prev => [
      {
        id: `queue-${Date.now()}`,
        name: isAir ? 'Sahyadri_Pharma_Air_Invoice.pdf' : 'Apex_Engineering_Valves_Invoice.pdf',
        size: 248100,
        status: 'converted'
      },
      ...prev
    ]);
  };

  // Invoice Card Actions
  const handleEditInvoice = (invoice: ConvertedInvoice) => {
    setEditingInvoice(invoice);
  };

  const handleSaveInvoiceEdit = (updated: ConvertedInvoice) => {
    setInvoices(prev => prev.map(inv => inv.id === updated.id ? updated : inv));
  };

  const handleDeleteInvoice = (invoiceId: string) => {
    setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
  };

  const handleClearAllInvoices = () => {
    setInvoices([]);
    localStorage.removeItem(LOCAL_STORAGE_INVOICES_KEY);
  };

  return (
    <div className="min-h-screen bg-slate-50/80 text-slate-900 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <Header
        currentPort={currentPort}
        onPortChange={handlePortChange}
      />

      {/* Main Workspace (2-Column Split) */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column (5 Cols) — Upload & Queue */}
          <section className="lg:col-span-5 space-y-5">
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Upload Documents
              </h2>
            </div>

            {/* Drag & Drop Zone */}
            <UploadZone
              onFilesSelected={handleFilesSelected}
            />

            {/* Selected Files Queue Card */}
            <FileQueueCard
              queue={queue}
              onRetry={handleRetryFile}
              onRemove={handleRemoveQueueItem}
              onClearCompleted={handleClearCompletedQueue}
            />
          </section>

          {/* Right Column (7 Cols) — Converted Outputs Feed */}
          <section className="lg:col-span-7">
            <ConvertedOutputsFeed
              invoices={invoices}
              onEdit={handleEditInvoice}
              onDelete={handleDeleteInvoice}
              onClearAll={handleClearAllInvoices}
              onLoadSample={handleLoadSample}
            />
          </section>
        </div>
      </main>

      {/* Preview & Edit Modal */}
      <EditModal
        invoice={editingInvoice}
        isOpen={Boolean(editingInvoice)}
        onClose={() => setEditingInvoice(null)}
        onSave={handleSaveInvoiceEdit}
      />
    </div>
  );
}

export default App;
