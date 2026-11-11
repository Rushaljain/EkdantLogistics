import React, { useState, useRef } from 'react';
import {
  SlidersHorizontal,
  UploadCloud,
  FileText,
  FileSpreadsheet,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Eye,
  Plus,
  X,
  Copy,
  Check
} from 'lucide-react';
import type { FormatDocumentType, FormatSchemaJSON } from '../types/index.ts';
import type { ParseFormatProgress } from '../utils/formatParser.ts';

interface FormatAdderPageProps {
  formats: FormatSchemaJSON[];
  selectedDgFormatId: string;
  selectedBlFormatId: string;
  onSelectDgFormat: (id: string) => void;
  onSelectBlFormat: (id: string) => void;
  onDeleteFormat: (id: string) => void;

  // Upload state
  formatUploadName: string;
  onFormatUploadNameChange: (name: string) => void;
  formatUploadDocType: FormatDocumentType;
  onFormatUploadDocTypeChange: (type: FormatDocumentType) => void;
  formatUploadFile: File | null;
  onFormatUploadFileChange: (file: File | null) => void;
  isUploadingFormat: boolean;
  formatUploadProgress: ParseFormatProgress | null;
  formatUploadError: string | null;
  onExecuteFormatUpload: () => void;
}

export function FormatAdderPage({
  formats,
  selectedDgFormatId,
  selectedBlFormatId,
  onSelectDgFormat,
  onSelectBlFormat,
  onDeleteFormat,
  formatUploadName,
  onFormatUploadNameChange,
  formatUploadDocType,
  onFormatUploadDocTypeChange,
  formatUploadFile,
  onFormatUploadFileChange,
  isUploadingFormat,
  formatUploadProgress,
  formatUploadError,
  onExecuteFormatUpload
}: FormatAdderPageProps): React.JSX.Element {
  const [inspectSchema, setInspectSchema] = useState<FormatSchemaJSON | null>(null);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleCopySchema = () => {
    if (!inspectSchema) return;
    navigator.clipboard.writeText(JSON.stringify(inspectSchema, null, 2));
    setCopiedSchema(true);
    setTimeout(() => setCopiedSchema(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-y-auto bg-app text-content-primary">
      {/* Top Header */}
      <header className="h-14 px-6 border-b border-divider bg-surface flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-sm font-bold text-content-primary tracking-wide">Format Adder & Template Library</h1>
          <p className="text-[11px] text-content-secondary">
            Train, add, and manage carrier-specific DG and BL document format schemas ({formats.length} formats available)
          </p>
        </div>
      </header>

      {/* Main Body */}
      <main className="p-6 space-y-6 max-w-6xl w-full mx-auto">
        {/* Upload Form Card */}
        <div className="p-5 bg-surface border border-divider rounded-xl space-y-4 shadow-sm">
          <div className="flex items-center space-x-2 pb-2 border-b border-divider">
            <SlidersHorizontal className="w-4 h-4 text-brand-primary" />
            <h2 className="text-xs font-semibold text-content-primary uppercase tracking-wider">
              Train New Carrier Format Template
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left Inputs */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1">
                  Format / Carrier Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Maersk Dangerous Goods Declaration 2026"
                  value={formatUploadName}
                  onChange={(e) => onFormatUploadNameChange(e.target.value)}
                  className="w-full bg-input-bg border border-divider text-xs text-content-primary rounded-md px-3 py-2 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-action-ring font-sans"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1">
                  Target Document Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onFormatUploadDocTypeChange('DG')}
                    className={`py-2 px-3 text-xs font-medium rounded-md border transition-all text-center ${
                      formatUploadDocType === 'DG'
                        ? 'bg-brand-primary-soft border-brand-primary text-brand-primary font-semibold'
                        : 'bg-surface-secondary border-divider text-content-secondary hover:text-content-primary'
                    }`}
                  >
                    Dangerous Goods (DG)
                  </button>
                  <button
                    type="button"
                    onClick={() => onFormatUploadDocTypeChange('BL')}
                    className={`py-2 px-3 text-xs font-medium rounded-md border transition-all text-center ${
                      formatUploadDocType === 'BL'
                        ? 'bg-brand-primary-soft border-brand-primary text-brand-primary font-semibold'
                        : 'bg-surface-secondary border-divider text-content-secondary hover:text-content-primary'
                    }`}
                  >
                    Bill of Lading (BL)
                  </button>
                </div>
              </div>
            </div>

            {/* Right Dropzone */}
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1">
                Sample Template File (.pdf, .docx, .xlsx, .xls)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    onFormatUploadFileChange(e.target.files[0]);
                  }
                }}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-divider hover:border-brand-primary rounded-lg p-5 text-center cursor-pointer bg-surface-secondary hover:bg-brand-primary-soft transition-colors group"
              >
                <UploadCloud className="w-8 h-8 mx-auto text-content-muted group-hover:text-brand-primary transition-colors mb-2" />
                {formatUploadFile ? (
                  <div>
                    <p className="text-xs font-semibold text-brand-primary">{formatUploadFile.name}</p>
                    <p className="text-[10px] text-content-muted mt-0.5">
                      {(formatUploadFile.size / 1024).toFixed(1)} KB — click to change
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-content-primary font-medium">Click or drop carrier template file</p>
                    <p className="text-[10px] text-content-muted mt-0.5">PDF blank form, Word table, or Excel layout</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Error & Progress Feedback */}
          {formatUploadError && (
            <div className="p-3 rounded-md bg-state-error-bg border border-state-error/40 text-state-error text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-state-error shrink-0" />
              <span>{formatUploadError}</span>
            </div>
          )}

          {isUploadingFormat && formatUploadProgress && (
            <div className="space-y-1.5 p-3 rounded-md bg-surface-secondary border border-divider">
              <div className="flex justify-between text-xs font-mono text-brand-primary">
                <span>{formatUploadProgress.message || 'Extracting schema...'}</span>
                <span className="capitalize">{formatUploadProgress.stage}</span>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={onExecuteFormatUpload}
              disabled={!formatUploadFile || isUploadingFormat}
              className={`px-4 py-2 rounded-md text-xs font-semibold flex items-center space-x-2 shadow-sm transition-all ${
                !formatUploadFile || isUploadingFormat
                  ? 'bg-action-disabled text-action-disabled-text cursor-not-allowed'
                  : 'bg-brand-primary hover:bg-brand-primary-hover text-brand-primary-text'
              }`}
            >
              {isUploadingFormat ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  <span>Analyzing Template Schema...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Extract & Save Format</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Format Library Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-content-primary uppercase tracking-wider">
              Available Carrier Format Schemas ({formats.length})
            </h2>
          </div>

          <div className="border border-divider rounded-lg overflow-hidden bg-surface shadow-sm">
            <table className="w-full text-left text-xs border-collapse font-sans">
              <thead>
                <tr className="bg-surface-secondary border-b border-divider text-content-secondary text-[11px] font-mono">
                  <th className="px-4 py-3">Format Name</th>
                  <th className="px-4 py-3 w-32">Document Type</th>
                  <th className="px-4 py-3 w-32 text-right">Fields Count</th>
                  <th className="px-4 py-3 w-36 text-center">Status in Workspace</th>
                  <th className="px-4 py-3 w-44 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider font-mono">
                {formats.map((fmt) => {
                  const isDgActive = fmt.documentType === 'DG' && selectedDgFormatId === fmt.formatId;
                  const isBlActive = fmt.documentType === 'BL' && selectedBlFormatId === fmt.formatId;
                  const isActive = isDgActive || isBlActive;
                  const isBuiltIn =
                    fmt.formatId === 'standard_imo_dg_v1' || fmt.formatId === 'standard_ocean_bl_v1';

                  return (
                    <tr key={fmt.formatId} className="hover:bg-surface-secondary transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-2">
                          {fmt.documentType === 'DG' ? (
                            <FileText className="w-4 h-4 text-brand-primary shrink-0" />
                          ) : (
                            <FileSpreadsheet className="w-4 h-4 text-brand-accent shrink-0" />
                          )}
                          <div>
                            <span className="font-medium text-content-primary block font-sans">
                              {fmt.formatName}
                            </span>
                            <span className="text-[10px] text-content-muted font-mono">{fmt.formatId}</span>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                            fmt.documentType === 'DG'
                              ? 'bg-brand-primary-soft text-brand-primary border border-brand-primary/30'
                              : 'bg-brand-accent-soft text-brand-accent border border-brand-accent/30'
                          }`}
                        >
                          {fmt.documentType === 'DG' ? 'DG Manifest' : 'Bill of Lading'}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right text-content-secondary font-semibold">
                        {fmt.fields.length} fields
                      </td>

                      <td className="px-4 py-3 text-center">
                        {isActive ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-state-success-bg text-state-success border border-state-success/30 inline-flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Active in {fmt.documentType}</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-content-muted">Available</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {!isActive && (
                            <button
                              onClick={() => {
                                if (fmt.documentType === 'DG') {
                                  onSelectDgFormat(fmt.formatId);
                                } else {
                                  onSelectBlFormat(fmt.formatId);
                                }
                              }}
                              className="px-2 py-1 rounded bg-surface hover:bg-brand-primary-soft text-content-primary text-[10px] font-sans border border-divider transition-colors"
                            >
                              Set Active
                            </button>
                          )}

                          <button
                            onClick={() => setInspectSchema(fmt)}
                            className="p-1 rounded text-content-secondary hover:text-brand-primary hover:bg-surface-secondary transition-colors"
                            title="Inspect Schema JSON"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {!isBuiltIn && (
                            <button
                              onClick={() => onDeleteFormat(fmt.formatId)}
                              className="p-1 rounded text-content-muted hover:text-state-error hover:bg-state-error-bg transition-colors"
                              title="Delete custom format"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Schema Inspector Modal */}
      {inspectSchema && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-divider rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-divider flex items-center justify-between bg-surface-secondary">
              <div className="truncate pr-2">
                <h3 className="text-xs font-semibold text-content-primary truncate">
                  Schema: {inspectSchema.formatName}
                </h3>
                <p className="text-[10px] font-mono text-content-secondary">
                  {inspectSchema.fields.length} canonical fields registered
                </p>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={handleCopySchema}
                  className="px-2.5 py-1 text-xs rounded bg-surface hover:bg-surface-secondary text-content-primary border border-divider flex items-center space-x-1"
                >
                  {copiedSchema ? <Check className="w-3 h-3 text-state-success" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedSchema ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  onClick={() => setInspectSchema(null)}
                  className="p-1 text-content-muted hover:text-content-primary"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-input-bg">
              <pre className="text-xs font-mono text-brand-primary">
                {JSON.stringify(inspectSchema, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
