import React from 'react';
import { 
  FileSpreadsheet, 
  FileCode, 
  Edit3, 
  Trash2, 
  ArrowRight,
  Ship,
  Plane,
  ChevronDown
} from 'lucide-react';
import type { ConvertedInvoice, CustomsPort } from '../types';
import { downloadEdi } from '../utils/ediCompiler';
import { downloadExcel } from '../utils/excelCompiler';

interface OutputCardProps {
  invoice: ConvertedInvoice;
  onEdit: (invoice: ConvertedInvoice) => void;
  onDelete: (invoiceId: string) => void;
  onPortChange?: (invoiceId: string, port: CustomsPort) => void;
}

export const OutputCard: React.FC<OutputCardProps> = ({
  invoice,
  onEdit,
  onDelete,
  onPortChange
}) => {
  const isExport = invoice.filingType === 'EXPORT';
  const ediExt = isExport ? 'sb' : 'be';

  // Format currency
  const formattedTotal = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: invoice.currency || 'USD',
    minimumFractionDigits: 2
  }).format(invoice.invoiceTotal || 0);

  return (
    <div className="p-3.5 sm:px-5 sm:py-3.5 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 group">
      {/* Left: Invoice ID, Amount, Parties & Specs */}
      <div className="min-w-0 flex-1 space-y-1">
        {/* Top Mini-Row: Invoice Number + Total + Item Count + Timestamp */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-bold text-slate-900 text-sm font-mono tracking-tight">
            {invoice.invoiceNumber}
          </span>

          <span className="font-semibold text-slate-900 font-mono text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60">
            {formattedTotal}
          </span>

          <span className="text-[11px] font-mono text-slate-500">
            {invoice.lineItems.length} {invoice.lineItems.length === 1 ? 'item' : 'items'}
          </span>

          {invoice.grossWeightKg > 0 && (
            <span className="text-[11px] font-mono text-slate-400">
              • {invoice.grossWeightKg.toLocaleString()} KG
            </span>
          )}

          <span className="text-[11px] text-slate-400 font-mono ml-auto md:ml-0">
            • {invoice.convertedAt}
          </span>
        </div>

        {/* Sub-line: Vendor -> Consignee */}
        <div className="text-xs text-slate-500 flex items-center space-x-1.5 truncate" title={`${invoice.exporterName} → ${invoice.consigneeName}`}>
          <span className="font-medium text-slate-700 truncate max-w-[220px] sm:max-w-[280px]">
            {invoice.exporterName}
          </span>
          <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
          <span className="truncate max-w-[220px] sm:max-w-[280px] text-slate-500">
            {invoice.consigneeName}
          </span>
        </div>
      </div>

      {/* Right: Port Dropdown + Compact Action Buttons */}
      <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
        {/* Port Dropdown for this output */}
        <div className="relative inline-flex items-center">
          <select
            value={invoice.portOfLoading || 'INNSA1'}
            onChange={(e) => onPortChange && onPortChange(invoice.id, e.target.value as CustomsPort)}
            className="appearance-none bg-slate-50 hover:bg-slate-100/90 text-slate-800 text-[11px] font-semibold pl-6 pr-6 py-1.5 rounded-lg border border-slate-200/80 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer transition-colors shadow-2xs"
          >
            <option value="INNSA1">Nhava Sheva (INNSA1)</option>
            <option value="INBOM4">Mumbai Air (INBOM4)</option>
          </select>
          <div className="absolute left-1.5 pointer-events-none text-indigo-600">
            {invoice.portOfLoading === 'INBOM4' ? (
              <Plane className="w-3.5 h-3.5" />
            ) : (
              <Ship className="w-3.5 h-3.5" />
            )}
          </div>
          <div className="absolute right-1.5 pointer-events-none text-slate-400">
            <ChevronDown className="w-3 h-3" />
          </div>
        </div>

        {/* Preview & Edit Button */}
        <button
          onClick={() => onEdit(invoice)}
          className="flex items-center space-x-1 text-xs font-semibold text-slate-700 hover:text-indigo-600 bg-slate-100 hover:bg-slate-200/70 px-2.5 py-1.5 rounded-lg transition-colors"
          title="Preview & Edit"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>Edit</span>
        </button>

        {/* Download EDI */}
        <button
          onClick={() => downloadEdi(invoice)}
          className="flex items-center space-x-1 text-xs font-semibold text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/60 px-2.5 py-1.5 rounded-lg transition-colors shadow-2xs"
          title={`Download official ICES 1.5 flat file (.${ediExt})`}
        >
          <FileCode className="w-3.5 h-3.5 text-indigo-600" />
          <span>.{ediExt}</span>
        </button>

        {/* Download Excel */}
        <button
          onClick={() => downloadExcel(invoice)}
          className="flex items-center space-x-1 text-xs font-semibold text-emerald-800 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/60 px-2.5 py-1.5 rounded-lg transition-colors shadow-2xs"
          title="Download multi-tab spreadsheet formatted for Visual Impex and Logi-Sys"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
          <span>.xlsx</span>
        </button>

        {/* Delete / Remove */}
        <button
          onClick={() => onDelete(invoice.id)}
          className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
          title="Remove from history"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
