import React, { useState, useRef } from 'react';
import { UploadCloud, FolderUp } from 'lucide-react';

interface UploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  onLoadSample?: () => void;
  isProcessing?: boolean;
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  onFilesSelected
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const pdfFiles = Array.from(e.dataTransfer.files).filter(
        f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
      );
      if (pdfFiles.length > 0) {
        onFilesSelected(pdfFiles);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const pdfFiles = Array.from(e.target.files).filter(
        f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
      );
      if (pdfFiles.length > 0) {
        onFilesSelected(pdfFiles);
      }
    }
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      {/* Drag & Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01]'
            : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50 shadow-subtle'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="flex flex-col items-center">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 transition-transform group-hover:scale-105">
            <UploadCloud className="w-6 h-6" />
          </div>

          <h3 className="text-sm font-semibold text-slate-900">
            Drop PDF documents here
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-[260px] leading-relaxed">
            Multi-page commercial invoices & packing lists from SAP, Tally, or scanned PDFs
          </p>

          <div className="mt-4 flex items-center space-x-2">
            <span className="inline-flex items-center space-x-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100/80 px-3 py-1.5 rounded-lg transition-colors">
              <FolderUp className="w-3.5 h-3.5" />
              <span>Browse Files</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
