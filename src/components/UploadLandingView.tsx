import React, { useRef } from 'react';
import {
  UploadCloud,
  FileText,
  FileSpreadsheet,
  File,
  X,
  Loader2,
  Play,
  AlertTriangle,
  Boxes
} from 'lucide-react';
import type { UploadMode } from '../types/index.ts';
import type { ParseSessionProgress } from '../utils/documentParser.ts';

interface UploadLandingViewProps {
  mode: UploadMode | '';
  onModeChange: (mode: UploadMode | '') => void;
  uploadedFiles: File[];
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onRemoveFile: (index: number) => void;
  onClearFiles: () => void;
  isParsing: boolean;
  parseProgress?: ParseSessionProgress | null;
  apiError: string | null;
  onExecuteParsing: () => void;
  onLoadDemoJson?: () => void;
  onOpenFormatLibrary?: () => void;
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
  apiError,
  onExecuteParsing
}: UploadLandingViewProps): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isModeSelected = Boolean(mode);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-app text-content-primary overflow-y-auto">
      <div className="max-w-xl w-full space-y-6">
        {/* Brand & Title */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-brand-primary flex items-center justify-center mx-auto shadow-md">
            <Boxes className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-content-primary">
            EKDANT LOGISTICS
          </h1>
        </div>

        {/* Central Ingestion Card */}
        <div className="p-6 bg-surface border border-divider rounded-2xl shadow-card space-y-5">
          {/* Mode Dropdown Selector */}
          <div>
            <label className="block text-xs font-semibold text-content-secondary uppercase tracking-wider mb-2">
              Select Format
            </label>
            <select
              value={mode}
              onChange={(e) => onModeChange(e.target.value as UploadMode | '')}
              className="w-full bg-input-bg border border-divider text-xs text-content-primary rounded-lg px-3.5 py-2.5 font-sans focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-action-ring cursor-pointer"
            >
              <option value="" disabled>
                Select Format
              </option>
              <option value="SINGLE_INVOICE">Single Invoice</option>
              <option value="MULTI_INVOICE">Multi Invoice</option>
            </select>
          </div>

          {/* Drag & Drop Upload Zone (Enabled only when format selected) */}
          {isModeSelected ? (
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
                className="border-2 border-dashed border-divider hover:border-brand-primary rounded-xl p-8 text-center cursor-pointer bg-surface-secondary hover:bg-brand-primary-soft transition-all group"
              >
                <UploadCloud className="w-10 h-10 mx-auto text-content-muted group-hover:text-brand-primary transition-colors mb-2" />
                <p className="text-xs font-semibold text-content-primary">
                  Drop commercial documents here or click to browse
                </p>
                <p className="text-[10px] text-content-muted mt-1">
                  Supports PDF Invoices, Excel Workbooks (.xlsx, .xls), and Packing Lists (.csv)
                </p>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-divider rounded-xl p-8 text-center bg-surface-secondary/50">
              <UploadCloud className="w-10 h-10 mx-auto text-content-muted/60 mb-2" />
              <p className="text-xs font-medium text-content-muted">
                Please select a format above to enable document uploads
              </p>
            </div>
          )}

          {/* Staged Files List */}
          {uploadedFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-content-secondary">
                <span>Staged Files ({uploadedFiles.length})</span>
                <button
                  type="button"
                  onClick={onClearFiles}
                  className="text-state-error hover:underline text-[11px]"
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
                      className="flex items-center justify-between p-2 rounded-md bg-surface-secondary border border-divider text-xs text-content-primary"
                    >
                      <div className="flex items-center space-x-2 truncate pr-2">
                        {isPdf ? (
                          <FileText className="w-3.5 h-3.5 text-state-error shrink-0" />
                        ) : isSheet ? (
                          <FileSpreadsheet className="w-3.5 h-3.5 text-state-success shrink-0" />
                        ) : (
                          <File className="w-3.5 h-3.5 text-state-info shrink-0" />
                        )}
                        <span className="truncate">{f.name}</span>
                        <span className="text-[10px] font-mono text-content-muted shrink-0">
                          {(f.size / 1024).toFixed(0)} KB
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveFile(idx)}
                        className="text-content-muted hover:text-state-error"
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
            <div className="p-3 rounded-lg bg-state-error-bg border border-state-error/30 text-state-error text-xs flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-state-error shrink-0 mt-0.5" />
              <span>{apiError}</span>
            </div>
          )}

          {/* Primary Action Button */}
          <div className="space-y-2.5 pt-1">
            <button
              onClick={onExecuteParsing}
              disabled={uploadedFiles.length === 0 || isParsing || !isModeSelected}
              className={`w-full py-2.5 px-4 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition-all shadow-md ${
                uploadedFiles.length === 0 || isParsing || !isModeSelected
                  ? 'bg-action-disabled text-action-disabled-text cursor-not-allowed'
                  : 'bg-brand-primary hover:bg-brand-primary-hover text-brand-primary-text'
              }`}
            >
              {isParsing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing Documents...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Process Documents</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
