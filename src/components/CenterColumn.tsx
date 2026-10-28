import React from 'react';
import { 
  Inbox, 
  Trash2, 
  FileCode, 
  FileSpreadsheet, 
  ArrowRight,
  Ship,
  Plane,
  ChevronDown
} from 'lucide-react';
import { UploadZone } from './UploadZone';
import { FileQueueCard } from './FileQueueCard';
import type { ConvertedInvoice, QueueFile, CustomsPort } from '../types';
import { downloadEdi } from '../utils/ediCompiler';
import { downloadExcel } from '../utils/excelCompiler';

interface CenterColumnProps {
  invoices: ConvertedInvoice[];
  queue: QueueFile[];
  selectedInvoiceId: string | null;
  onSelectInvoice: (invoiceId: string) => void;
  onFilesSelected: (files: File[]) => void;
  onRetryFile: (fileId: string) => void;
  onRemoveQueueItem: (fileId: string) => void;
  onClearCompletedQueue: () => void;
  onDeleteInvoice: (invoiceId: string) => void;
  onClearAllInvoices: () => void;
  onPortChange: (invoiceId: string, port: CustomsPort) => void;
}

export const CenterColumn: React.FC<CenterColumnProps> = ({
  invoices,
  queue,
  selectedInvoiceId,
  onSelectInvoice,
  onFilesSelected,
  onRetryFile,
  onRemoveQueueItem,
  onClearCompletedQueue,
  onDeleteInvoice,
  onClearAllInvoices,
  onPortChange
}) => {
  return (
    <div className="w-[380px] lg:w-[420px] xl:w-[450px] h-screen border-r border-slate-200/80 bg-slate-50/60 flex flex-col shrink-0 select-none overflow-hidden">
      {/* =========================================================================
          TOP: COMPACT UPLOAD DOCUMENTS ZONE
         ========================================================================= */}
      <div className="shrink-0 p-4 border-b border-slate-200/80 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-900 tracking-tight uppercase flex items-center gap-1.5">
            <span>Upload Documents</span>
          </h2>
          <span className="text-[10px] text-slate-400 font-medium">
            Commercial Invoice & Packing List
          </span>
        </div>

        {/* Upload Drop Zone (Direct, no extra nesting) */}
        <UploadZone onFilesSelected={onFilesSelected} />

        {/* Processing Queue Card (if any files are processing / error) */}
        {queue.length > 0 && (
          <FileQueueCard
            queue={queue}
            onRetry={onRetryFile}
            onRemove={onRemoveQueueItem}
            onClearCompleted={onClearCompletedQueue}
          />
        )}
      </div>

      {/* =========================================================================
          BOTTOM: EXPANDED LIST OF UPLOADED FILES READY TO PREVIEW (flex-1)
         ========================================================================= */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 shrink-0">
          <div className="flex items-center space-x-2">
            <h2 className="text-xs font-bold text-slate-900 tracking-tight uppercase">
              Uploaded & Ready to Preview
            </h2>
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700">
              {invoices.length}
            </span>
          </div>

          {invoices.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm('Clear all uploaded invoice history?')) {
                  onClearAllInvoices();
                }
              }}
              className="text-[11px] text-slate-400 hover:text-rose-600 transition-colors flex items-center space-x-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Scrollable Invoices List / Clean Unboxed Empty State */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {invoices.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-2.5">
                <Inbox className="w-6 h-6" />
              </div>
              <h3 className="text-xs font-semibold text-slate-700">
                No documents uploaded yet
              </h3>
              <p className="text-[11px] text-slate-400 mt-1 max-w-[220px] leading-relaxed">
                Drop your commercial invoice PDF in the section above to preview and edit extraction.
              </p>
            </div>
          ) : (
            invoices.map(inv => {
              const isSelected = inv.id === selectedInvoiceId;
              const isExport = inv.filingType === 'EXPORT';
              const ediExt = isExport ? 'sb' : 'be';

              const formattedTotal = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: inv.currency || 'USD',
                minimumFractionDigits: 2
              }).format(inv.invoiceTotal || 0);

              return (
                <div
                  key={inv.id}
                  onClick={() => onSelectInvoice(inv.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer text-left relative ${
                    isSelected
                      ? 'bg-white border-indigo-500 shadow-sm ring-2 ring-indigo-500/20'
                      : 'bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-2xs'
                  }`}
                >
                  {/* Top Line: Invoice Number + Total + Port */}
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center space-x-2 min-w-0">
                      <span className="font-bold text-slate-900 text-xs font-mono truncate">
                        {inv.invoiceNumber}
                      </span>
                      {isSelected && (
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/50">
                          Active
                        </span>
                      )}
                    </div>

                    {/* Port Selector Dropdown */}
                    <div 
                      className="relative inline-flex items-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <select
                        value={inv.portOfLoading || 'INNSA1'}
                        onChange={(e) => onPortChange(inv.id, e.target.value as CustomsPort)}
                        className="appearance-none bg-slate-50 hover:bg-slate-100 text-slate-700 text-[10px] font-semibold pl-5 pr-5 py-0.5 rounded-md border border-slate-200 focus:outline-none cursor-pointer"
                      >
                        <option value="INNSA1">INNSA1</option>
                        <option value="INBOM4">INBOM4</option>
                      </select>
                      <div className="absolute left-1 pointer-events-none text-indigo-600">
                        {inv.portOfLoading === 'INBOM4' ? (
                          <Plane className="w-3 h-3" />
                        ) : (
                          <Ship className="w-3 h-3" />
                        )}
                      </div>
                      <div className="absolute right-1 pointer-events-none text-slate-400">
                        <ChevronDown className="w-2.5 h-2.5" />
                      </div>
                    </div>
                  </div>

                  {/* Vendor -> Consignee */}
                  <div className="text-[11px] text-slate-500 truncate flex items-center space-x-1 mt-1" title={`${inv.exporterName} → ${inv.consigneeName}`}>
                    <span className="font-medium text-slate-700 truncate max-w-[150px]">
                      {inv.exporterName}
                    </span>
                    <ArrowRight className="w-2.5 h-2.5 text-slate-300 shrink-0" />
                    <span className="truncate max-w-[150px] text-slate-500">
                      {inv.consigneeName}
                    </span>
                  </div>

                  {/* Bottom Line: Total Value + Items + Direct Downloads */}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[11px]">
                    <div className="flex items-center space-x-1.5 font-mono">
                      <span className="font-bold text-slate-900">{formattedTotal}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-500">{inv.lineItems.length} items</span>
                    </div>

                    {/* Direct Action Buttons */}
                    <div 
                      className="flex items-center space-x-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => downloadEdi(inv)}
                        className="p-1 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title={`Download EDI (.${ediExt})`}
                      >
                        <FileCode className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => downloadExcel(inv)}
                        className="p-1 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                        title="Download Excel (.xlsx)"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => onDeleteInvoice(inv.id)}
                        className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
