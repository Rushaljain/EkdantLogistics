import React from 'react';
import { 
  FileSpreadsheet, 
  FileCode, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import type { ConvertedInvoice } from '../types';
import { downloadEdi } from '../utils/ediCompiler';
import { downloadExcel } from '../utils/excelCompiler';

interface OutputCardProps {
  invoice: ConvertedInvoice;
  onEdit: (invoice: ConvertedInvoice) => void;
  onDelete: (invoiceId: string) => void;
}

export const OutputCard: React.FC<OutputCardProps> = ({
  invoice,
  onEdit,
  onDelete
}) => {
  const isExport = invoice.filingType === 'EXPORT';
  const ediExt = isExport ? 'sb' : 'be';

  // Format currency
  const formattedTotal = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: invoice.currency || 'USD',
    minimumFractionDigits: 2
  }).format(invoice.invoiceTotal || 0);

  // Math & HSN audit status check
  const itemsSum = invoice.lineItems.reduce((acc, it) => acc + (it.total || 0), 0);
  const mathDrift = Math.abs(itemsSum - invoice.invoiceTotal) > 0.5;
  const hasShortHsn = invoice.lineItems.some(it => it.hsnCode.length !== 8);
  const isReviewSuggested = invoice.status === 'review_suggested' || mathDrift || hasShortHsn;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card hover:shadow-card-hover transition-all duration-200 p-5 space-y-4">
      {/* 1. Top Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2.5">
          <span className="font-bold text-slate-900 text-sm font-mono tracking-tight">
            {invoice.invoiceNumber}
          </span>

          {/* Filing Type Badge */}
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200/60">
            {invoice.filingType} • .{ediExt.toUpperCase()}
          </span>

          {/* Status Pill */}
          {!isReviewSuggested ? (
            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/50">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>Converted</span>
            </span>
          ) : (
            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60" title="Check HSN length or line item math">
              <AlertTriangle className="w-3 h-3 text-amber-500" />
              <span>Review Suggested</span>
            </span>
          )}
        </div>

        {/* Timestamp */}
        <span className="text-[11px] text-slate-400 font-mono">
          {invoice.convertedAt}
        </span>
      </div>

      {/* 2. Subtitle: Exporter & Consignee */}
      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5 leading-snug">
        <span className="font-medium text-slate-800 truncate max-w-[240px]" title={invoice.exporterName}>
          {invoice.exporterName}
        </span>
        <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
        <span className="truncate max-w-[240px] text-slate-600" title={invoice.consigneeName}>
          {invoice.consigneeName}
        </span>
      </div>

      {/* 3. Summary Metrics Grid (4 Clean Mini-Columns on bg-slate-50) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50/90 border border-slate-100 rounded-xl p-3 text-xs">
        <div>
          <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider">
            Items
          </span>
          <span className="font-semibold text-slate-800 font-mono mt-0.5 block">
            {invoice.lineItems.length} {invoice.lineItems.length === 1 ? 'Line Item' : 'Line Items'}
          </span>
        </div>

        <div>
          <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider">
            Total Value
          </span>
          <span className="font-semibold text-slate-900 font-mono mt-0.5 block">
            {formattedTotal}
          </span>
        </div>

        <div>
          <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider">
            Weights (Gross/Net)
          </span>
          <span className="font-semibold text-slate-800 font-mono mt-0.5 block truncate" title={`${invoice.grossWeightKg} / ${invoice.netWeightKg} KG`}>
            {invoice.grossWeightKg.toLocaleString()} / {invoice.netWeightKg.toLocaleString()} KG
          </span>
        </div>

        <div>
          <span className="text-[10px] uppercase font-semibold text-slate-400 block tracking-wider">
            e-Sanchit IRN
          </span>
          {invoice.esanchitIrn ? (
            <span className="font-medium text-slate-700 font-mono mt-0.5 block truncate" title={invoice.esanchitIrn}>
              {invoice.esanchitIrn}
            </span>
          ) : (
            <span className="font-medium text-slate-400 font-mono mt-0.5 block">
              Not Linked
            </span>
          )}
        </div>
      </div>

      {/* 4. Bottom Action Bar */}
      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Preview & Edit + Delete */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => onEdit(invoice)}
            className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700 hover:text-indigo-600 bg-slate-100/80 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Preview & Edit</span>
          </button>

          <button
            onClick={() => onDelete(invoice.id)}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            title="Remove from history"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Direct Download Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => downloadEdi(invoice)}
            className="flex items-center space-x-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200/60 px-3 py-1.5 rounded-lg transition-colors shadow-subtle"
            title="Download official ICES 1.5 flat file with ASCII 0x1D separators"
          >
            <FileCode className="w-3.5 h-3.5 text-indigo-600" />
            <span>Download EDI (.{ediExt})</span>
          </button>

          <button
            onClick={() => downloadExcel(invoice)}
            className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-800 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200/60 px-3 py-1.5 rounded-lg transition-colors shadow-subtle"
            title="Download multi-tab spreadsheet formatted for Visual Impex and Softlink Logi-Sys"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Download Excel (.xlsx)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
