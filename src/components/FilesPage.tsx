import React, { useState, useMemo, useRef } from 'react';
import {
  FileText,
  FileSpreadsheet,
  File,
  UploadCloud,
  Trash2,
  ExternalLink,
  Search,
  Plus,
  Save,
  Clock,
  Layers
} from 'lucide-react';
import type { ArchivedShipment } from '../utils/storageReset.ts';

interface FilesPageProps {
  uploadedFiles: File[];
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onRemoveFile: (index: number) => void;
  onClearFiles: () => void;
  onOpenInWorkspace: (index: number) => void;
  hasParsed: boolean;
  savedWorkSessions?: ArchivedShipment[];
  onLoadSavedSession?: (session: ArchivedShipment) => void;
  onDeleteSavedSession?: (id: string) => void;
}

export function FilesPage({
  uploadedFiles,
  onFileSelect,
  onDrop,
  onRemoveFile,
  onClearFiles,
  onOpenInWorkspace,
  hasParsed,
  savedWorkSessions = [],
  onLoadSavedSession,
  onDeleteSavedSession
}: FilesPageProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'staged' | 'saved'>('saved');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'PDF' | 'SPREADSHEET'>('ALL');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const filteredFiles = useMemo(() => {
    return uploadedFiles
      .map((file, originalIndex) => ({ file, originalIndex }))
      .filter(({ file }) => {
        const matchesSearch =
          !searchQuery.trim() ||
          file.name.toLowerCase().includes(searchQuery.toLowerCase());

        const isPdf = file.name.toLowerCase().endsWith('.pdf');
        const isSheet =
          file.name.toLowerCase().endsWith('.xlsx') ||
          file.name.toLowerCase().endsWith('.xls') ||
          file.name.toLowerCase().endsWith('.csv');

        const matchesType =
          typeFilter === 'ALL' ||
          (typeFilter === 'PDF' && isPdf) ||
          (typeFilter === 'SPREADSHEET' && isSheet);

        return matchesSearch && matchesType;
      });
  }, [uploadedFiles, searchQuery, typeFilter]);

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-app text-content-primary">
      {/* Top Header */}
      <header className="h-14 px-6 border-b border-divider bg-surface flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-sm font-bold text-content-primary tracking-wide">Document Repository</h1>
          <p className="text-[11px] text-content-secondary">
            Manage source commercial invoices, packing lists, and cargo spreadsheets ({uploadedFiles.length} files)
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv"
            className="hidden"
            onChange={onFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-brand-primary hover:bg-brand-primary-hover text-brand-primary-text text-xs font-medium shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Upload Documents</span>
          </button>

          {uploadedFiles.length > 0 && (
            <button
              onClick={onClearFiles}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-md bg-surface hover:bg-state-error-bg text-content-secondary hover:text-state-error text-xs border border-divider transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Body */}
      <main className="p-6 space-y-4 max-w-6xl w-full mx-auto">
        {/* Main Body Tabs: Saved Work Sessions vs Source Staged Files */}
        <div className="flex border-b border-divider space-x-6">
          <button
            type="button"
            onClick={() => setActiveTab('saved')}
            className={`pb-2.5 text-xs font-bold transition-all relative flex items-center space-x-2 cursor-pointer ${
              activeTab === 'saved'
                ? 'text-brand-primary border-b-2 border-brand-primary'
                : 'text-content-secondary hover:text-content-primary'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>Saved Work & Layouts ({savedWorkSessions.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('staged')}
            className={`pb-2.5 text-xs font-bold transition-all relative flex items-center space-x-2 cursor-pointer ${
              activeTab === 'staged'
                ? 'text-brand-primary border-b-2 border-brand-primary'
                : 'text-content-secondary hover:text-content-primary'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Source Staged Documents ({uploadedFiles.length})</span>
          </button>
        </div>

        {activeTab === 'saved' ? (
          /* SAVED WORK SESSIONS TAB */
          <div className="space-y-4">
            {savedWorkSessions.length === 0 ? (
              <div className="border border-divider rounded-xl p-12 text-center bg-surface">
                <Save className="w-10 h-10 mx-auto text-content-muted mb-2.5" />
                <h3 className="text-sm font-semibold text-content-primary">No Saved Work Sessions</h3>
                <p className="text-xs text-content-secondary mt-1 max-w-sm mx-auto">
                  When working in the workspace, click the &quot;Save Work&quot; button in the top ribbon to archive your DG Manifests, BL, Container layouts, and truth JSON here.
                </p>
              </div>
            ) : (
              <div className="border border-divider rounded-lg overflow-hidden bg-surface shadow-card">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-surface-secondary border-b border-divider text-content-secondary text-[11px] font-mono">
                      <th className="px-4 py-3">Shipment / Work Title</th>
                      <th className="px-4 py-3 w-40">Mode & Content</th>
                      <th className="px-4 py-3 w-44">Saved At</th>
                      <th className="px-4 py-3 w-32 text-center">Status</th>
                      <th className="px-4 py-3 w-40 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider font-mono">
                    {savedWorkSessions.map((session) => (
                      <tr key={session.id} className="hover:bg-surface-secondary transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center space-x-2.5">
                            <Layers className="w-4 h-4 text-brand-primary shrink-0" />
                            <div>
                              <div className="font-sans font-bold text-content-primary truncate max-w-md">
                                {session.title || 'Saved Shipment'}
                              </div>
                              <div className="text-[10px] text-content-muted truncate max-w-md">
                                Invoices: {session.shipmentJson.invoiceNumbers?.join(', ') || 'None'} &bull; Gross: {session.shipmentJson.grossWeightKg}kg &bull; Tare: {session.shipmentJson.tareWeightKg}kg
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-2.5 text-content-secondary text-[11px]">
                          <span className="font-sans">
                            {session.shipmentJson.pallets?.length || 0} Pallets &bull; {session.mode}
                          </span>
                        </td>

                        <td className="px-4 py-2.5 text-content-secondary text-[11px]">
                          <div className="flex items-center space-x-1">
                            <Clock className="w-3 h-3 text-content-muted" />
                            <span>{new Date(session.archivedAt).toLocaleString()}</span>
                          </div>
                        </td>

                        <td className="px-4 py-2.5 text-center">
                          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-state-success-bg text-state-success border-state-success/30 font-semibold">
                            Archived Work
                          </span>
                        </td>

                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            {onLoadSavedSession && (
                              <button
                                type="button"
                                onClick={() => onLoadSavedSession(session)}
                                className="px-2.5 py-1 rounded bg-brand-primary text-white hover:bg-brand-primary-hover text-[11px] font-sans font-medium transition-colors flex items-center space-x-1 cursor-pointer shadow-xs"
                                title="Restore this work session into workspace"
                              >
                                <span>Load</span>
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            )}

                            {onDeleteSavedSession && (
                              <button
                                type="button"
                                onClick={() => onDeleteSavedSession(session.id)}
                                className="p-1.5 text-content-muted hover:text-state-error transition-colors rounded hover:bg-state-error-bg cursor-pointer"
                                title="Delete saved work from file manager"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* SOURCE STAGED DOCUMENTS TAB */
          <div className="space-y-4">
            {/* Search & Filter Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface border border-divider rounded-lg shadow-card">
              <div className="flex items-center space-x-2 flex-1 min-w-[240px]">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-content-muted absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search documents by name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-input-bg border border-divider text-xs text-content-primary placeholder:text-content-muted rounded-md pl-9 pr-3 py-1.5 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-action-ring"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs text-content-secondary">Filter:</span>
                <div className="flex bg-surface-secondary border border-divider rounded p-0.5">
                  <button
                    onClick={() => setTypeFilter('ALL')}
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                      typeFilter === 'ALL' ? 'bg-brand-primary text-brand-primary-text' : 'text-content-secondary hover:text-content-primary'
                    }`}
                  >
                    All Files ({uploadedFiles.length})
                  </button>
                  <button
                    onClick={() => setTypeFilter('PDF')}
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                      typeFilter === 'PDF' ? 'bg-brand-primary text-brand-primary-text' : 'text-content-secondary hover:text-content-primary'
                    }`}
                  >
                    PDF Invoices
                  </button>
                  <button
                    onClick={() => setTypeFilter('SPREADSHEET')}
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                      typeFilter === 'SPREADSHEET' ? 'bg-brand-primary text-brand-primary-text' : 'text-content-secondary hover:text-content-primary'
                    }`}
                  >
                    Spreadsheets
                  </button>
                </div>
              </div>
            </div>

            {/* Upload Dropzone when empty or supplementary */}
            {uploadedFiles.length === 0 ? (
              <div
                onDrop={onDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-divider hover:border-brand-primary rounded-xl p-12 text-center cursor-pointer bg-surface hover:bg-brand-primary-soft transition-all group"
              >
                <UploadCloud className="w-12 h-12 mx-auto text-content-muted group-hover:text-brand-primary transition-colors mb-3" />
                <h3 className="text-sm font-semibold text-content-primary">No documents in repository</h3>
                <p className="text-xs text-content-secondary mt-1 max-w-sm mx-auto">
                  Drag and drop source PDFs, Excel workbooks, or CSV packing lists here to begin processing.
                </p>
                <button
                  type="button"
                  className="mt-4 px-4 py-2 bg-brand-primary hover:bg-brand-primary-hover text-brand-primary-text text-xs font-semibold rounded-md shadow-sm transition-colors"
                >
                  Browse Local Files
                </button>
              </div>
            ) : (
              <div className="border border-divider rounded-lg overflow-hidden bg-surface shadow-card">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-surface-secondary border-b border-divider text-content-secondary text-[11px] font-mono">
                      <th className="px-4 py-3">Document Name</th>
                      <th className="px-4 py-3 w-32">Type</th>
                      <th className="px-4 py-3 w-28 text-right">Size</th>
                      <th className="px-4 py-3 w-36 text-center">Extraction Status</th>
                      <th className="px-4 py-3 w-44 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider font-mono">
                    {filteredFiles.map(({ file, originalIndex }) => {
                      const isPdf = file.name.toLowerCase().endsWith('.pdf');
                      const isSheet =
                        file.name.toLowerCase().endsWith('.xlsx') ||
                        file.name.toLowerCase().endsWith('.xls') ||
                        file.name.toLowerCase().endsWith('.csv');

                      return (
                        <tr
                          key={`${file.name}-${originalIndex}`}
                          className="hover:bg-surface-secondary transition-colors"
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center space-x-2.5">
                              {isPdf ? (
                                <FileText className="w-4 h-4 text-state-error shrink-0" />
                              ) : isSheet ? (
                                <FileSpreadsheet className="w-4 h-4 text-state-success shrink-0" />
                              ) : (
                                <File className="w-4 h-4 text-state-info shrink-0" />
                              )}
                              <span className="font-sans font-medium text-content-primary truncate max-w-md">
                                {file.name}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-2.5 text-content-secondary text-[11px]">
                            {isPdf ? 'PDF Invoice' : isSheet ? 'Excel Sheet' : 'Raw Document'}
                          </td>

                          <td className="px-4 py-2.5 text-right text-content-secondary text-[11px]">
                            {formatFileSize(file.size)}
                          </td>

                          <td className="px-4 py-2.5 text-center">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                hasParsed
                                  ? 'bg-state-success-bg text-state-success border-state-success/30'
                                  : 'bg-surface-secondary text-content-muted border-divider'
                              }`}
                            >
                              {hasParsed ? 'Extracted' : 'Ready'}
                            </span>
                          </td>

                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => onOpenInWorkspace(originalIndex)}
                                className="px-2.5 py-1 rounded bg-brand-primary-soft hover:bg-brand-primary-soft/80 text-brand-primary text-[11px] font-sans font-medium border border-brand-primary/20 transition-colors flex items-center space-x-1"
                                title="Inspect in 3-panel workspace"
                              >
                                <span>Open</span>
                                <ExternalLink className="w-3 h-3" />
                              </button>

                              <button
                                onClick={() => onRemoveFile(originalIndex)}
                                className="p-1 text-content-muted hover:text-state-error transition-colors"
                                title="Remove file"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
