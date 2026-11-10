import React, { useState, useMemo, useRef } from 'react';
import {
  FileText,
  FileSpreadsheet,
  File,
  UploadCloud,
  Trash2,
  ExternalLink,
  Search,
  Plus
} from 'lucide-react';

interface FilesPageProps {
  uploadedFiles: File[];
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onRemoveFile: (index: number) => void;
  onClearFiles: () => void;
  onOpenInWorkspace: (index: number) => void;
  hasParsed: boolean;
}

export function FilesPage({
  uploadedFiles,
  onFileSelect,
  onDrop,
  onRemoveFile,
  onClearFiles,
  onOpenInWorkspace,
  hasParsed
}: FilesPageProps): React.JSX.Element {
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
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-slate-950 text-slate-100">
      {/* Top Header */}
      <header className="h-14 px-6 border-b border-slate-800/80 bg-slate-900/90 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-sm font-bold text-white tracking-wide">Document Repository</h1>
          <p className="text-[11px] text-slate-400">
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
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Upload Documents</span>
          </button>

          {uploadedFiles.length > 0 && (
            <button
              onClick={onClearFiles}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 text-xs border border-slate-700 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Body */}
      <main className="p-6 space-y-4 max-w-6xl w-full mx-auto">
        {/* Search & Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
          <div className="flex items-center space-x-2 flex-1 min-w-[240px]">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search documents by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-xs text-white rounded-md pl-9 pr-3 py-1.5 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-400">Filter:</span>
            <div className="flex bg-slate-950 border border-slate-800 rounded p-0.5">
              <button
                onClick={() => setTypeFilter('ALL')}
                className={`px-2.5 py-1 text-xs rounded transition-colors ${
                  typeFilter === 'ALL' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Files ({uploadedFiles.length})
              </button>
              <button
                onClick={() => setTypeFilter('PDF')}
                className={`px-2.5 py-1 text-xs rounded transition-colors ${
                  typeFilter === 'PDF' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                PDF Invoices
              </button>
              <button
                onClick={() => setTypeFilter('SPREADSHEET')}
                className={`px-2.5 py-1 text-xs rounded transition-colors ${
                  typeFilter === 'SPREADSHEET' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
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
            className="border-2 border-dashed border-slate-700 hover:border-cyan-500 rounded-xl p-12 text-center cursor-pointer bg-slate-900/30 hover:bg-slate-900/50 transition-all group"
          >
            <UploadCloud className="w-12 h-12 mx-auto text-slate-500 group-hover:text-cyan-400 transition-colors mb-3" />
            <h3 className="text-sm font-semibold text-slate-200">No documents in repository</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Drag and drop source PDFs, Excel workbooks, or CSV packing lists here to begin processing.
            </p>
            <button
              type="button"
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-md shadow-sm transition-colors"
            >
              Browse Local Files
            </button>
          </div>
        ) : (
          <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/50 shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 text-[11px] font-mono">
                  <th className="px-4 py-3">Document Name</th>
                  <th className="px-4 py-3 w-32">Type</th>
                  <th className="px-4 py-3 w-28 text-right">Size</th>
                  <th className="px-4 py-3 w-36 text-center">Extraction Status</th>
                  <th className="px-4 py-3 w-44 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredFiles.map(({ file, originalIndex }) => {
                  const isPdf = file.name.toLowerCase().endsWith('.pdf');
                  const isSheet =
                    file.name.toLowerCase().endsWith('.xlsx') ||
                    file.name.toLowerCase().endsWith('.xls') ||
                    file.name.toLowerCase().endsWith('.csv');

                  return (
                    <tr
                      key={`${file.name}-${originalIndex}`}
                      className="hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center space-x-2.5">
                          {isPdf ? (
                            <FileText className="w-4 h-4 text-rose-400 shrink-0" />
                          ) : isSheet ? (
                            <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <File className="w-4 h-4 text-cyan-400 shrink-0" />
                          )}
                          <span className="font-sans font-medium text-slate-200 truncate max-w-md">
                            {file.name}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-2.5 text-slate-400 text-[11px]">
                        {isPdf ? 'PDF Invoice' : isSheet ? 'Excel Sheet' : 'Raw Document'}
                      </td>

                      <td className="px-4 py-2.5 text-right text-slate-300 text-[11px]">
                        {formatFileSize(file.size)}
                      </td>

                      <td className="px-4 py-2.5 text-center">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full border ${
                            hasParsed
                              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {hasParsed ? 'Extracted' : 'Ready'}
                        </span>
                      </td>

                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => onOpenInWorkspace(originalIndex)}
                            className="px-2.5 py-1 rounded bg-blue-600/20 hover:bg-blue-600/30 text-cyan-300 text-[11px] font-sans font-medium border border-cyan-500/30 transition-colors flex items-center space-x-1"
                            title="Inspect in 3-panel workspace"
                          >
                            <span>Open</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>

                          <button
                            onClick={() => onRemoveFile(originalIndex)}
                            className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
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
      </main>
    </div>
  );
}
