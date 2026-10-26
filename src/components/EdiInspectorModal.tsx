import React, { useState } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  Download, 
  FileCode, 
  Info
} from 'lucide-react';
import type { ShipmentData } from '../types/customs';
import { 
  compileIcegateEdiFlatFile, 
  formatEdiForInspection, 
  downloadEdiFile, 
  VISIBLE_GS 
} from '../services/icegateEdiCompiler';

interface EdiInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  shipment: ShipmentData;
}

export const EdiInspectorModal: React.FC<EdiInspectorModalProps> = ({
  isOpen,
  onClose,
  shipment
}) => {
  const [showVisibleSeparators, setShowVisibleSeparators] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const rawEdi = compileIcegateEdiFlatFile(shipment, shipment.shipmentType);
  const formattedEdi = formatEdiForInspection(rawEdi);
  const displayContent = showVisibleSeparators ? formattedEdi : rawEdi;
  const ext = shipment.shipmentType === 'EXPORT' ? 'sb' : 'be';
  const filename = `${shipment.jobNo || 'EKD'}_${shipment.portCode}.${ext}`;

  const handleCopy = () => {
    // Copy real raw EDI with 0x1D
    navigator.clipboard.writeText(rawEdi);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    downloadEdiFile(filename, rawEdi);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-950 border border-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileCode className="w-5 h-5 text-sky-400" />
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                ICEGATE Remote EDI Flat File Compiler (ICES 1.5)
                <span className="font-mono text-[10px] bg-sky-950 text-sky-300 border border-sky-800 px-2 py-0.5 rounded">
                  .{ext}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Port: <strong className="text-sky-300 font-mono">{shipment.portCode}</strong> | Job: <strong className="text-slate-200 font-mono">{shipment.jobNo}</strong> | ASCII 0x1D Group Separator Delimited
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls Bar */}
        <div className="px-5 py-2.5 bg-slate-900/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-3">
            <label className="flex items-center space-x-2 cursor-pointer text-slate-300 select-none">
              <input
                type="checkbox"
                checked={showVisibleSeparators}
                onChange={(e) => setShowVisibleSeparators(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-sky-500"
              />
              <span>Highlight ASCII 0x1D with symbol <strong>{VISIBLE_GS}</strong></span>
            </label>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400 font-mono text-[11px]">
              {shipment.lineItems.length} &lt;TABLE&gt;ITEM records compiled
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded text-xs font-semibold transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied with 0x1D!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Flat File</span>
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center space-x-1.5 bg-sky-600 hover:bg-sky-500 text-white px-3 py-1.5 rounded text-xs font-semibold shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .{ext}</span>
            </button>
          </div>
        </div>

        {/* Code Content */}
        <div className="flex-1 overflow-auto p-4 bg-slate-950 font-mono text-xs leading-relaxed text-slate-300">
          <pre className="whitespace-pre-wrap break-all select-all">
            {displayContent}
          </pre>
        </div>

        {/* Modal Info Footer */}
        <div className="px-5 py-2.5 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>
              Directly uploadable to ICEGATE (icegate.gov.in) File Upload Service or through Softlink/Visual Impex EDI dispatcher.
            </span>
          </div>
          <span className="font-mono text-[10px] text-slate-500">
            Byte Length: {new Blob([rawEdi]).size} bytes
          </span>
        </div>
      </div>
    </div>
  );
};
