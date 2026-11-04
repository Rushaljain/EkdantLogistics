import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  CheckCircle2, 
  Trash2, 
  Eye, 
  RefreshCw, 
  Plus, 
  X,
  FileSpreadsheet,
  FileText
} from 'lucide-react';
import type { MasterFormat } from '../types';

interface ManageMasterFormatsViewProps {
  formats: MasterFormat[];
  onAddFormat: (format: MasterFormat) => void;
  onReplaceFormat: (formatId: string, updatedFormat: Partial<MasterFormat>, newFile?: File) => void;
  onDeleteFormat: (formatId: string) => void;
}

export const ManageMasterFormatsView: React.FC<ManageMasterFormatsViewProps> = ({
  formats,
  onAddFormat,
  onReplaceFormat,
  onDeleteFormat
}) => {
  // New Format Form State
  const [formatName, setFormatName] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  
  // Replace Format State
  const [replacingFormatId, setReplacingFormatId] = useState<string | null>(null);
  
  // Preview Modal State
  const [previewingFormat, setPreviewingFormat] = useState<MasterFormat | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!formatName) {
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
        setFormatName(cleanName);
      }
    }
  };

  const handleCreateFormat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formatName.trim()) {
      setErrorMsg('Please enter a format name.');
      return;
    }

    let fileContent: string | undefined;
    let fileType: string | undefined;

    if (selectedFile) {
      fileType = selectedFile.name.endsWith('.pdf') ? 'pdf' : 
                 /\.(xlsx|xls|csv)$/i.test(selectedFile.name) ? 'excel' : 'html';
      try {
        fileContent = await readFileAsBase64OrText(selectedFile);
      } catch (err) {
        console.warn('Could not read file preview:', err);
      }
    }

    const newFormat: MasterFormat = {
      id: `fmt-custom-${Date.now()}`,
      name: formatName.trim(),
      carrierOrClient: carrierName.trim() || 'Custom Shipping Line',
      description: `Format layout for ${carrierName.trim() || 'shipping line'} reference.`,
      isPreseeded: false,
      uploadedFileName: selectedFile?.name,
      uploadedAt: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      fileContent,
      fileType
    };

    onAddFormat(newFormat);
    setFormatName('');
    setCarrierName('');
    setSelectedFile(null);
    setErrorMsg(null);
    setShowUploadForm(false);
    setSuccessMsg(`Master format "${newFormat.name}" created successfully.`);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleReplaceClick = (formatId: string) => {
    setReplacingFormatId(formatId);
    setTimeout(() => replaceInputRef.current?.click(), 50);
  };

  const handleReplaceFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && replacingFormatId) {
      const file = e.target.files[0];

      let fileContent: string | undefined;
      const fileType = file.name.endsWith('.pdf') ? 'pdf' : 
                       /\.(xlsx|xls|csv)$/i.test(file.name) ? 'excel' : 'html';
      try {
        fileContent = await readFileAsBase64OrText(file);
      } catch (err) {
        console.warn('Could not read replacement file preview:', err);
      }

      onReplaceFormat(replacingFormatId, {
        uploadedFileName: file.name,
        uploadedAt: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        fileContent,
        fileType
      }, file);

      setSuccessMsg(`Format file replaced with "${file.name}".`);
      setTimeout(() => setSuccessMsg(null), 3000);
      setReplacingFormatId(null);
    }
  };

  // Helper to read file as data url
  const readFileAsBase64OrText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Generate simulated preview if no raw file uploaded (pre-seeded formats)
  const getPreviewHtml = (fmt: MasterFormat) => {
    if (fmt.fileContent) {
      if (fmt.fileType === 'pdf') {
        return `<iframe src="${fmt.fileContent}" class="w-full h-full border-0"></iframe>`;
      }
      if (fmt.fileType === 'html') {
        return fmt.fileContent;
      }
    }

    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #18181b; background: #fff; height: 100%; box-sizing: border-box;">
        <div style="border-bottom: 2px solid #18181b; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end;">
          <div>
            <div style="font-size: 16px; font-weight: 800; letter-spacing: -0.02em;">${fmt.carrierOrClient.toUpperCase()}</div>
            <div style="font-size: 12px; color: #71717a; font-weight: 500;">MASTER BILL OF LADING & CONTAINER SPECIFICATION</div>
          </div>
          <div style="text-align: right; font-family: monospace; font-size: 11px; color: #71717a;">
            <div>FORMAT ID: ${fmt.id}</div>
            <div>STATUS: ACTIVE REFERENCE</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; font-size: 11px;">
          <div style="border: 1px solid #e4e4e7; border-radius: 8px; padding: 12px; background: #fafafa;">
            <div style="font-weight: 700; color: #27272a; margin-bottom: 4px; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em;">Carrier / Shipping Line</div>
            <div style="font-size: 13px; font-weight: 600; color: #09090b;">${fmt.carrierOrClient}</div>
            <div style="color: #71717a; margin-top: 4px;">Verified format schema conforming to international customs & carrier manifests.</div>
          </div>
          <div style="border: 1px solid #e4e4e7; border-radius: 8px; padding: 12px; background: #fafafa;">
            <div style="font-weight: 700; color: #27272a; margin-bottom: 4px; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em;">Template Specification</div>
            <div style="font-size: 13px; font-weight: 600; color: #09090b;">${fmt.name}</div>
            <div style="color: #71717a; margin-top: 4px;">${fmt.description}</div>
          </div>
        </div>

        <div style="border: 1px solid #e4e4e7; border-radius: 8px; overflow: hidden; margin-bottom: 16px;">
          <div style="background: #f4f4f5; padding: 8px 12px; font-size: 11px; font-weight: 700; color: #3f3f46; border-bottom: 1px solid #e4e4e7;">
            CONTAINER & HAZMAT DISPATCH STRUCTURE MAPPING
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
            <thead>
              <tr style="background: #fafafa; border-bottom: 1px solid #e4e4e7; color: #71717a;">
                <th style="padding: 8px 12px; font-weight: 600;">CONTAINER UNIT</th>
                <th style="padding: 8px 12px; font-weight: 600;">EQUIPMENT TYPE</th>
                <th style="padding: 8px 12px; font-weight: 600;">PALLET CAPACITY</th>
                <th style="padding: 8px 12px; font-weight: 600;">HAZMAT CLASS</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom: 1px solid #f4f4f5;">
                <td style="padding: 8px 12px; font-family: monospace;">PRIMARY CONT</td>
                <td style="padding: 8px 12px;">20' GP (Standard)</td>
                <td style="padding: 8px 12px;">11 - 22 Pallets</td>
                <td style="padding: 8px 12px;"><span style="background: #fef2f2; color: #b91c1c; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 10px;">CLASS 8 / UN 2794</span></td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; font-family: monospace;">SPILLOVER CONT</td>
                <td style="padding: 8px 12px;">20' GP / 40' HC</td>
                <td style="padding: 8px 12px;">Balanced Weight</td>
                <td style="padding: 8px 12px;"><span style="background: #fef2f2; color: #b91c1c; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 10px;">IMO HAZMAT</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style="font-size: 10px; color: #a1a1aa; text-align: center; margin-top: 24px;">
          Ekdant Logistics Master Format Reference • ISO 9001 & IMO IMDG Compliant Output Engine
        </div>
      </div>
    `;
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-zinc-50 overflow-hidden select-none relative">
      {/* Hidden file input for Replace action */}
      <input 
        ref={replaceInputRef}
        type="file"
        accept=".pdf,.docx,.xlsx,.xls,.csv,.html"
        onChange={handleReplaceFileSelected}
        className="hidden"
      />

      {/* Notifications Toast */}
      {successMsg && (
        <div className="absolute top-4 right-6 z-30 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center space-x-2 shadow-lg animate-in fade-in slide-in-from-top-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="absolute top-4 right-6 z-30 p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg shadow-lg animate-in fade-in slide-in-from-top-2 duration-150">
          {errorMsg}
        </div>
      )}

      {/* Grid of Master Formats */}
      <div className="flex-1 overflow-y-auto p-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
          {formats.map((fmt) => (
            <div
              key={fmt.id}
              className="bg-white rounded-xl border border-zinc-200 shadow-2xs hover:border-zinc-300 transition-all p-4 flex flex-col justify-between"
            >
              <div>
                {/* Header: Carrier Name & Preseeded Badge */}
                <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-zinc-100">
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold tracking-wider uppercase text-zinc-400 block truncate">
                      Shipping Line
                    </span>
                    <h3 className="text-xs font-bold text-zinc-900 truncate mt-0.5" title={fmt.carrierOrClient}>
                      {fmt.carrierOrClient}
                    </h3>
                  </div>
                  {fmt.isPreseeded ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600 border border-zinc-200 shrink-0">
                      System Pre-seeded
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200/60 shrink-0">
                      Custom Upload
                    </span>
                  )}
                </div>

                {/* Format Name & Description */}
                <div className="mt-3">
                  <span className="text-[10px] font-semibold tracking-wider uppercase text-zinc-400 block">
                    Format Name
                  </span>
                  <div className="text-xs font-semibold text-zinc-800 mt-0.5 truncate" title={fmt.name}>
                    {fmt.name}
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
                    {fmt.description}
                  </p>
                </div>

                {/* Source File Meta if uploaded */}
                <div className="mt-3 pt-2.5 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-400">
                  <div className="flex items-center space-x-1.5 truncate">
                    {fmt.fileType === 'excel' ? (
                      <FileSpreadsheet className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    )}
                    <span className="truncate text-zinc-600 font-mono text-[10px]">
                      {fmt.uploadedFileName || 'Standard System Template'}
                    </span>
                  </div>
                  {fmt.uploadedAt && (
                    <span className="text-[10px] text-zinc-400 shrink-0 font-mono ml-2">
                      {fmt.uploadedAt}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Toolbar: Preview, Replace, Delete */}
              <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setPreviewingFormat(fmt)}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-md transition-colors cursor-pointer"
                  title="Preview reference format"
                >
                  <Eye className="w-3 h-3 text-zinc-500" />
                  <span>Preview</span>
                </button>

                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => handleReplaceClick(fmt.id)}
                    className="inline-flex items-center space-x-1 px-2 py-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-md transition-colors cursor-pointer"
                    title="Replace format template file"
                  >
                    <RefreshCw className="w-3 h-3 text-zinc-500" />
                    <span>Replace</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Are you sure you want to delete the format "${fmt.name}"?`)) {
                        onDeleteFormat(fmt.id);
                      }
                    }}
                    className="p-1 text-zinc-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Delete format"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Bottom-Right Action Button */}
      <div className="absolute bottom-6 right-8 z-30">
        <button
          type="button"
          onClick={() => setShowUploadForm(true)}
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-full text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white shadow-xl hover:shadow-2xl transition-all hover:scale-105 active:scale-95 cursor-pointer border border-zinc-700/60"
        >
          <Plus className="w-4 h-4" />
          <span>Upload Format</span>
        </button>
      </div>

      {/* Upload Modal (when floating button clicked) */}
      {showUploadForm && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 select-none animate-in fade-in duration-150"
          onClick={() => setShowUploadForm(false)}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl border border-zinc-200 w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-zinc-200 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center space-x-2">
                <UploadCloud className="w-4 h-4 text-zinc-700" />
                <h3 className="text-xs font-bold text-zinc-900">Upload Master Format</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadForm(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleCreateFormat} className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                  Format Name *
                </label>
                <input
                  type="text"
                  value={formatName}
                  onChange={(e) => setFormatName(e.target.value)}
                  placeholder="e.g. Hapag-Lloyd Standard Master BL"
                  className="w-full text-xs bg-white border border-zinc-200 rounded-lg px-3 py-2 outline-none focus:border-zinc-900 text-zinc-900 shadow-2xs"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                  Shipping Line Name *
                </label>
                <input
                  type="text"
                  value={carrierName}
                  onChange={(e) => setCarrierName(e.target.value)}
                  placeholder="e.g. Hapag-Lloyd, Maersk, MSC, ONE Line"
                  className="w-full text-xs bg-white border border-zinc-200 rounded-lg px-3 py-2 outline-none focus:border-zinc-900 text-zinc-900 shadow-2xs"
                />
              </div>

              {/* Drop Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border border-dashed border-zinc-300 hover:border-zinc-500 rounded-lg p-5 text-center cursor-pointer bg-zinc-50/70 hover:bg-zinc-50 transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.xlsx,.xls,.csv,.html"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <UploadCloud className="w-6 h-6 mx-auto text-zinc-400 mb-1.5" />
                <span className="text-xs font-medium text-zinc-800 block truncate">
                  {selectedFile ? selectedFile.name : 'Select or drop reference Master BL / DG format file'}
                </span>
                <p className="text-[10px] text-zinc-400 mt-1">
                  Supports .pdf, .docx, .xlsx, .csv, and .html templates
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowUploadForm(false);
                    setSelectedFile(null);
                    setFormatName('');
                    setCarrierName('');
                  }}
                  className="px-3.5 py-1.5 bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  Save Format
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewingFormat && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 select-none animate-in fade-in duration-150"
          onClick={() => setPreviewingFormat(null)}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl border border-zinc-200 w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-3 border-b border-zinc-200 flex items-center justify-between bg-white shrink-0">
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-bold text-zinc-900 truncate">
                    {previewingFormat.name}
                  </h3>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600 border border-zinc-200">
                    {previewingFormat.carrierOrClient}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                  {previewingFormat.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewingFormat(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Document Viewer */}
            <div className="flex-1 overflow-auto bg-zinc-100 p-4">
              <div 
                className="bg-white shadow-sm border border-zinc-200 rounded-lg mx-auto max-w-3xl min-h-full overflow-hidden"
                dangerouslySetInnerHTML={{ __html: getPreviewHtml(previewingFormat) }}
              />
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-2.5 border-t border-zinc-200 bg-white flex items-center justify-between text-xs shrink-0">
              <span className="text-[11px] text-zinc-400 font-mono">
                {previewingFormat.uploadedFileName ? `Source: ${previewingFormat.uploadedFileName}` : 'Preseeded standard template'}
              </span>
              <button
                type="button"
                onClick={() => setPreviewingFormat(null)}
                className="px-3 py-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded-md text-xs font-medium cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
