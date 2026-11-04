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
      const validFiles = Array.from(e.dataTransfer.files).filter(f => {
        const lower = f.name.toLowerCase();
        return lower.endsWith('.pdf') || lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv');
      });
      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const validFiles = Array.from(e.target.files).filter(f => {
        const lower = f.name.toLowerCase();
        return lower.endsWith('.pdf') || lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv');
      });
      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
      }
    }
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`relative border border-dashed rounded-xl p-3.5 text-center cursor-pointer transition-all duration-150 ${
        isDragging
          ? 'border-zinc-900 bg-zinc-100/60 scale-[1.01]'
          : 'border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50/50 shadow-2xs'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.xlsx,.xls,.csv"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center mb-1.5 transition-transform group-hover:scale-105">
          <UploadCloud className="w-4 h-4" />
        </div>

        <h3 className="text-xs font-medium text-zinc-900">
          Drop documents here (.pdf, .xlsx, .csv)
        </h3>

        <div className="mt-2.5 flex items-center space-x-2">
          <span className="inline-flex items-center space-x-1.5 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200 px-2.5 py-1 rounded-md shadow-2xs transition-colors">
            <FolderUp className="w-3.5 h-3.5 text-zinc-500" />
            <span>Browse Files</span>
          </span>
        </div>
      </div>
    </div>
  );
};
