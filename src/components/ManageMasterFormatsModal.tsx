import React, { useState, useRef } from 'react';
import { X, UploadCloud, CheckCircle2, FileText, Layers, Trash2 } from 'lucide-react';
import type { MasterFormat } from '../types';

interface ManageMasterFormatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  formats: MasterFormat[];
  onAddFormat: (format: MasterFormat) => void;
  onDeleteFormat?: (formatId: string) => void;
}

export const ManageMasterFormatsModal: React.FC<ManageMasterFormatsModalProps> = ({
  isOpen,
  onClose,
  formats,
  onAddFormat,
  onDeleteFormat
}) => {
  const [formatName, setFormatName] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      if (!formatName) {
        const cleanName = e.target.files[0].name.replace(/\.[^/.]+$/, '').replace(/[_\\-]/g, ' ');
        setFormatName(cleanName);
      }
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formatName.trim()) {
      setErrorMsg('Please enter a format name.');
      return;
    }

    const newFormat: MasterFormat = {
      id: `fmt-custom-${Date.now()}`,
      name: formatName.trim(),
      carrierOrClient: carrierName.trim() || 'Custom Shipping Line',
      description: `User-defined format layout derived from ${selectedFile ? selectedFile.name : 'manual specification'}.`,
      isPreseeded: false,
      uploadedFileName: selectedFile?.name,
      uploadedAt: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    };

    onAddFormat(newFormat);
    setFormatName('');
    setCarrierName('');
    setSelectedFile(null);
    setErrorMsg(null);
    setSuccessMsg(`Master Format "${newFormat.name}" saved successfully.`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 select-none animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-xl shadow-xl border border-zinc-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-900 border border-zinc-200">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Manage Master Formats</h2>
              <p className="text-xs text-zinc-500">Upload and configure reference Master BL & #DG output layouts</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {successMsg && (
            <div className="p-3 bg-zinc-50 border border-zinc-300 text-zinc-800 text-xs rounded-lg flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-zinc-700 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-zinc-50 border border-zinc-300 text-zinc-800 text-xs rounded-lg">
              {errorMsg}
            </div>
          )}

          {/* Section 1: Active Formats List */}
          <div>
            <h3 className="text-xs font-semibold text-zinc-900 uppercase tracking-wider mb-2.5">
              Configured Master Formats ({formats.length})
            </h3>
            <div className="space-y-2">
              {formats.map((fmt) => (
                <div 
                  key={fmt.id}
                  className="p-3 rounded-lg border border-zinc-200 bg-zinc-50/60 flex items-start justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-zinc-900">{fmt.name}</span>
                      {fmt.isPreseeded && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-zinc-200 text-zinc-700">
                          Pre-seeded
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                      {fmt.description}
                    </p>
                    {fmt.uploadedFileName && (
                      <div className="flex items-center space-x-1.5 text-[10px] text-zinc-400 mt-1 font-mono">
                        <FileText className="w-3 h-3" />
                        <span>Source: {fmt.uploadedFileName} ({fmt.uploadedAt})</span>
                      </div>
                    )}
                  </div>

                  {!fmt.isPreseeded && onDeleteFormat && (
                    <button
                      type="button"
                      onClick={() => onDeleteFormat(fmt.id)}
                      className="p-1 text-zinc-400 hover:text-zinc-900 transition-colors"
                      title="Delete custom format"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Upload New Format Reference */}
          <div className="pt-4 border-t border-zinc-200">
            <h3 className="text-xs font-semibold text-zinc-900 uppercase tracking-wider mb-2.5">
              Upload New Reference Format (.pdf, .docx, .xlsx, .csv, .html)
            </h3>
            <form onSubmit={handleSave} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                    Format Name *
                  </label>
                  <input
                    type="text"
                    value={formatName}
                    onChange={(e) => setFormatName(e.target.value)}
                    placeholder="e.g. Maersk Line Master Format"
                    className="w-full text-xs bg-white border border-zinc-200 rounded-lg px-3 py-2 outline-none focus:border-zinc-900 text-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                    Carrier or Shipping Line
                  </label>
                  <input
                    type="text"
                    value={carrierName}
                    onChange={(e) => setCarrierName(e.target.value)}
                    placeholder="e.g. Maersk / Hapag / MSC"
                    className="w-full text-xs bg-white border border-zinc-200 rounded-lg px-3 py-2 outline-none focus:border-zinc-900 text-zinc-900"
                  />
                </div>
              </div>

              {/* File Drop Target */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border border-dashed border-zinc-300 hover:border-zinc-500 rounded-lg p-4 text-center cursor-pointer bg-zinc-50/50 hover:bg-zinc-50 transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.xlsx,.xls,.csv,.html"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <UploadCloud className="w-5 h-5 mx-auto text-zinc-400 mb-1" />
                <span className="text-xs font-medium text-zinc-800">
                  {selectedFile ? selectedFile.name : 'Select or drop reference Master BL / DG file'}
                </span>
                <p className="text-[10px] text-zinc-400 mt-0.5">
                  Supports .pdf, .docx, .xlsx, .csv, and .html templates
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  Save Master Format
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
