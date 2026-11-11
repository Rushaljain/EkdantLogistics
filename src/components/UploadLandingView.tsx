import React, { useRef } from 'react';
import {
  UploadCloud,
  FileText,
  FileSpreadsheet,
  File,
  X,
  Sparkles,
  Play,
  AlertTriangle,
  FolderPlus,
  Boxes,
  FileCode
} from 'lucide-react';
import type { UploadMode } from '../types/index.ts';
import type { ParseSessionProgress } from '../utils/documentParser.ts';

interface UploadLandingViewProps {
  mode: UploadMode;
  onModeChange: (mode: UploadMode) => void;
  uploadedFiles: File[];
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onRemoveFile: (index: number) => void;
  onClearFiles: () => void;
  isParsing: boolean;
  parseProgress: ParseSessionProgress | null;
  apiError: string | null;
  onExecuteParsing: () => void;
  onLoadDemoJson: () => void;
  onOpenFormatLibrary: () => void;
}

export function UploadLandingView({
  mode,
  onModeChange,
  uploadedFiles,
  onFileSelect,
  onDrop,
  onRemoveFile,
  onClearFiles,
  isParsing,
  parseProgress,
  apiError,
  onExecuteParsing,
  onLoadDemoJson,
  onOpenFormatLibrary
}: UploadLandingViewProps): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-950 text-slate-100 overflow-y-auto">
      <div className="max-w-xl w-full space-y-6">
        {/* Brand & Title */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-700 flex items-center justify-center mx-auto shadow-lg shadow-cyan-950/60">
            <Boxes className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            EKDANT LOGISTICS
          </h1>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            Universal Maritime Ingestion &bull; Sequential Dynamic Matcher (JSON &rarr; DG &rarr; BOL)
          </p>
        </div>

        {/* Central Ingestion Card */}
        <div className="p-6 bg-slate-900/70 border border-slate-800 rounded-2xl shadow-xl space-y-5">
          {/* Mode Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Select Ingestion Mode
            </label>
            <div className="grid grid-cols-2 p-1 bg-slate-950 border border-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => onModeChange('SINGLE_INVOICE')}
                className={`py-2 text-xs font-semibold rounded-md transition-all text-center ${
                  mode === 'SINGLE_INVOICE'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Single Invoice (Consolidated)
              </button>
              <button
                type="button"
                onClick={() => onModeChange('MULTI_INVOICE')}
                className={`py-2 text-xs font-semibold rounded-md transition-all text-center ${
                  mode === 'MULTI_INVOICE'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Multi-Invoice (Sequential)
              </button>
            </div>
          </div>

          {/* Drag & Drop Upload Zone */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.xlsx,.xls,.csv"
              className="hidden"
              onChange={onFileSelect}
            />
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-cyan-500 rounded-xl p-8 text-center cursor-pointer bg-slate-950/40 hover:bg-slate-950/70 transition-all group"
            >
              <UploadCloud className="w-10 h-10 mx-auto text-slate-500 group-hover:text-cyan-400 transition-colors mb-2" />
              <p className="text-xs font-semibold text-slate-200">
                Drop commercial documents here or click to browse
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                Supports PDF Invoices, Excel Workbooks (.xlsx, .xls), and Packing Lists (.csv)
              </p>
            </div>
          </div>

          {/* Staged Files List */}
          {uploadedFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Staged Files ({uploadedFiles.length})</span>
                <button
                  type="button"
                  onClick={onClearFiles}
                  className="text-rose-400 hover:text-rose-300 text-[11px]"
                >
                  Clear All
                </button>
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {uploadedFiles.map((f, idx) => {
                  const isPdf = f.name.toLowerCase().endsWith('.pdf');
                  const isSheet =
                    f.name.toLowerCase().endsWith('.xlsx') ||
                    f.name.toLowerCase().endsWith('.xls') ||
                    f.name.toLowerCase().endsWith('.csv');

                  return (
                    <div
                      key={`${f.name}-${idx}`}
                      className="flex items-center justify-between p-2 rounded-md bg-slate-950 border border-slate-800 text-xs text-slate-300"
                    >
                      <div className="flex items-center space-x-2 truncate pr-2">
                        {isPdf ? (
                          <FileText className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        ) : isSheet ? (
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <File className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        )}
                        <span className="truncate">{f.name}</span>
                        <span className="text-[10px] font-mono text-slate-500 shrink-0">
                          {(f.size / 1024).toFixed(0)} KB
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveFile(idx)}
                        className="text-slate-500 hover:text-rose-400"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Error Message */}
          {apiError && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{apiError}</span>
            </div>
          )}

          {/* Progress Bar */}
          {isParsing && parseProgress && (
            <div className="space-y-1.5 p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div className="flex justify-between text-xs font-mono text-cyan-400">
                <span>{parseProgress.message || 'Extracting shipment truth...'}</span>
                <span>
                  {parseProgress.processedFiles}/{parseProgress.totalFiles}
                </span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all duration-300"
                  style={{
                    width: `${
                      parseProgress.totalFiles > 0
                        ? Math.round((parseProgress.processedFiles / parseProgress.totalFiles) * 100)
                        : 50
                    }%`
                  }}
                />
              </div>
            </div>
          )}

          {/* Primary Action Button */}
          <div className="space-y-2.5 pt-1">
            <button
              onClick={onExecuteParsing}
              disabled={uploadedFiles.length === 0 || isParsing}
              className={`w-full py-2.5 px-4 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition-all shadow-md ${
                uploadedFiles.length === 0 || isParsing
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-cyan-950/50'
              }`}
            >
              {isParsing ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" />
                  <span>Harmonizing Multi-File Batch...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Extract &amp; Harmonize Manifests</span>
                </>
              )}
            </button>

            {/* Load Saved / Demo JSON Button */}
            <button
              type="button"
              onClick={onLoadDemoJson}
              className="w-full py-2 px-3 rounded-lg text-xs font-medium bg-slate-950 hover:bg-slate-800/80 text-cyan-300 border border-cyan-800/40 hover:border-cyan-500/60 transition-all flex items-center justify-center space-x-2"
            >
              <FileCode className="w-3.5 h-3.5 text-cyan-400" />
              <span>Load Verified Demo Shipment (Instant Test)</span>
            </button>
          </div>
        </div>

        {/* Footer Link */}
        <div className="flex items-center justify-center space-x-4 text-xs text-slate-500">
          <button
            onClick={onOpenFormatLibrary}
            className="hover:text-cyan-400 transition-colors flex items-center space-x-1"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Carrier Format Template Library</span>
          </button>
        </div>
      </div>
    </div>
  );
}
