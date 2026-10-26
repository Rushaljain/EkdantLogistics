import React from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  FileSpreadsheet, 
  FileCode, 
  Eye, 
  Sparkles
} from 'lucide-react';
import type { ShipmentData } from '../types/customs';
import { exportChaExcel } from '../services/chaExcelExporter';
import { compileIcegateEdiFlatFile, downloadEdiFile } from '../services/icegateEdiCompiler';

interface StickyMathFooterProps {
  shipment: ShipmentData;
  onAutoReconcile: () => void;
  onOpenEdiInspector: () => void;
}

export const StickyMathFooter: React.FC<StickyMathFooterProps> = ({
  shipment,
  onAutoReconcile,
  onOpenEdiInspector
}) => {
  const lineItemsSum = Number(
    shipment.lineItems.reduce((acc, curr) => acc + (curr.itemTotalValue || 0), 0).toFixed(2)
  );
  const headerTotal = Number(shipment.invoice.invoiceTotal.toFixed(2));
  const diff = Number(Math.abs(lineItemsSum - headerTotal).toFixed(2));
  const isBalanced = diff <= 0.50;

  const handleDownloadExcel = (targetSoftware: 'SOFTLINK_LOGISYS' | 'VISUAL_IMPEX') => {
    exportChaExcel(shipment, targetSoftware);
  };

  const handleDownloadEdi = () => {
    const ediContent = compileIcegateEdiFlatFile(shipment, shipment.shipmentType);
    const ext = shipment.shipmentType === 'EXPORT' ? 'sb' : 'be';
    const safeJob = (shipment.jobNo || 'EKD').replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadEdiFile(`${safeJob}_${shipment.portCode}.${ext}`, ediContent);
  };

  return (
    <div className={`border-t transition-colors duration-300 p-3 shadow-2xl sticky bottom-0 z-30 ${
      isBalanced 
        ? 'bg-slate-950/95 border-emerald-600/80 text-slate-100' 
        : 'bg-slate-950/95 border-amber-500/80 text-slate-100'
    }`}>
      <div className="max-w-[1920px] mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Math Reconciliation Status Area */}
        <div className="flex items-center space-x-4">
          {/* Status Badge */}
          <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border font-bold text-xs transition-colors ${
            isBalanced
              ? 'bg-emerald-950/70 border-emerald-500 text-emerald-300'
              : 'bg-amber-950/70 border-amber-500 text-amber-300 animate-pulse'
          }`}>
            {isBalanced ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>ARITHMETIC RECONCILED</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>MATH DRIFT DETECTED</span>
              </>
            )}
          </div>

          {/* Numbers Comparison */}
          <div className="flex items-center space-x-3 text-xs font-mono">
            <div>
              <span className="text-[10px] text-slate-400 block uppercase">Sum of Line Items:</span>
              <span className="font-bold text-slate-100 text-sm">
                {lineItemsSum.toFixed(2)} {shipment.invoice.currency}
              </span>
            </div>

            <div className="text-slate-600 font-sans">vs</div>

            <div>
              <span className="text-[10px] text-slate-400 block uppercase">Invoice Header Total:</span>
              <span className="font-bold text-slate-100 text-sm">
                {headerTotal.toFixed(2)} {shipment.invoice.currency}
              </span>
            </div>

            {/* Difference indicator */}
            {!isBalanced && (
              <div className="bg-amber-950/50 border border-amber-800 px-2 py-0.5 rounded text-amber-300 text-xs">
                Variance: <strong className="font-bold">{diff.toFixed(2)} {shipment.invoice.currency}</strong>
              </div>
            )}
          </div>

          {/* 1-Click Auto-Reconcile Button */}
          {!isBalanced && (
            <button
              onClick={onAutoReconcile}
              className="flex items-center space-x-1.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs shadow-md shadow-amber-950 transition-all"
              title="Force Header Invoice Total to match the sum of Line Items"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Auto-Balance Header Total</span>
            </button>
          )}
        </div>

        {/* Exporters and EDI Generation Bar */}
        <div className="flex items-center space-x-2">
          {/* View Raw EDI with ASCII 0x1D modal trigger */}
          <button
            onClick={onOpenEdiInspector}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            title="Inspect ICES 1.5 Flat File with ASCII 0x1D Delimiters"
          >
            <Eye className="w-3.5 h-3.5 text-sky-400" />
            <span>Inspect Flat File</span>
          </button>

          {/* Excel Export Menu */}
          <div className="relative group">
            <button
              className="flex items-center space-x-1.5 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold px-3 py-1.5 rounded-lg text-xs shadow-sm transition-all"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export CHA (.xlsx)</span>
            </button>
            <div className="absolute right-0 bottom-full mb-1 w-56 bg-slate-900 border border-slate-800 rounded-lg shadow-2xl py-1 hidden group-hover:block z-50">
              <div className="px-3 py-1 text-[10px] uppercase font-bold text-slate-500">
                1-Click Bulk Import Format
              </div>
              <button
                onClick={() => handleDownloadExcel('SOFTLINK_LOGISYS')}
                className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-emerald-400 flex items-center justify-between"
              >
                <span>Softlink Logi-Sys Excel</span>
                <span className="text-[10px] text-slate-500 font-mono">.xlsx</span>
              </button>
              <button
                onClick={() => handleDownloadExcel('VISUAL_IMPEX')}
                className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-emerald-400 flex items-center justify-between border-t border-slate-800"
              >
                <span>Visual Impex Bulk Excel</span>
                <span className="text-[10px] text-slate-500 font-mono">.xlsx</span>
              </button>
            </div>
          </div>

          {/* Official ICEGATE .sb / .be Flat File Download */}
          <button
            onClick={handleDownloadEdi}
            className="flex items-center space-x-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs shadow-md shadow-sky-950 transition-all"
            title="Download official ICES 1.5 flat file for ICEGATE remote submission"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Generate ICEGATE .{shipment.shipmentType === 'EXPORT' ? 'sb' : 'be'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
