import React, { useState, useMemo } from 'react';
import { 
  Building2, 
  FolderArchive, 
  Search, 
  Trash2, 
  ExternalLink, 
  FileCode, 
  FileSpreadsheet, 
  Plus 
} from 'lucide-react';
import type { ConvertedInvoice, CustomsPort } from '../types';
import { downloadEdi } from '../utils/ediCompiler';
import { downloadExcel } from '../utils/excelCompiler';

interface FilesViewProps {
  files: ConvertedInvoice[];
  onOpenInConverter: (invoice: ConvertedInvoice) => void;
  onDeleteFile: (fileId: string) => void;
  onClearAllFiles?: () => void;
  onNavigateToConverter: () => void;
}

export const FilesView: React.FC<FilesViewProps> = ({
  files,
  onOpenInConverter,
  onDeleteFile,
  onNavigateToConverter
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [portFilter, setPortFilter] = useState<'ALL' | CustomsPort>('ALL');

  // Filtered files based on search query & port
  const filteredFiles = useMemo(() => {
    return files.filter(file => {
      const query = searchQuery.trim().toLowerCase();
      const matchesQuery = 
        !query ||
        file.exporterName.toLowerCase().includes(query) ||
        file.invoiceNumber.toLowerCase().includes(query) ||
        file.consigneeName.toLowerCase().includes(query) ||
        file.fileName.toLowerCase().includes(query);

      const matchesPort = portFilter === 'ALL' || file.portOfLoading === portFilter;

      return matchesQuery && matchesPort;
    });
  }, [files, searchQuery, portFilter]);

  const formatCurrency = (amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: currency === 'INR' ? 'INR' : currency,
        maximumFractionDigits: 2
      }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-slate-50/50 overflow-hidden select-none">
      {/* =========================================================================
          TOP HEADER BAR OF FILES VIEW
         ========================================================================= */}
      <div className="h-16 px-8 bg-white border-b border-slate-200/80 flex items-center justify-between shrink-0 gap-4">
        {/* Left: Section Title & File Count */}
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <FolderArchive className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Saved Files
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 font-mono">
                {files.length} {files.length === 1 ? 'file' : 'files'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Archived converted invoices ready for ICEGATE filing and export
            </p>
          </div>
        </div>

        {/* Right: Search, Filter, & Actions */}
        <div className="flex items-center space-x-3">
          {/* Search Input */}
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search firm or invoice..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
            />
          </div>

          {/* Port Filter */}
          <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-medium">
            <button
              type="button"
              onClick={() => setPortFilter('ALL')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                portFilter === 'ALL'
                  ? 'bg-white text-indigo-700 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Ports
            </button>
            <button
              type="button"
              onClick={() => setPortFilter('INNSA1')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                portFilter === 'INNSA1'
                  ? 'bg-white text-indigo-700 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Nhava Sheva
            </button>
            <button
              type="button"
              onClick={() => setPortFilter('INBOM4')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                portFilter === 'INBOM4'
                  ? 'bg-white text-indigo-700 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mumbai Air
            </button>
          </div>

          {/* New Document Button */}
          <button
            type="button"
            onClick={onNavigateToConverter}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Convert New File</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          MAIN WORKSPACE: TILES GRID / EMPTY STATE
         ========================================================================= */}
      <div className="flex-1 overflow-y-auto p-8">
        {files.length === 0 ? (
          /* Empty State: No Files Saved Yet */
          <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto select-none">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-center text-indigo-500 mb-4">
              <FolderArchive className="w-8 h-8 text-indigo-500/80" />
            </div>
            <h3 className="text-base font-bold text-slate-800 tracking-tight">
              No Saved Files Yet
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              When you convert and save commercial invoices in the <strong>Document Converter</strong>, they will be archived here as tiles with the firm's name, invoice number, and 1-click export actions.
            </p>
            <button
              type="button"
              onClick={onNavigateToConverter}
              className="mt-6 inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Go to Document Converter</span>
            </button>
          </div>
        ) : filteredFiles.length === 0 ? (
          /* Empty State: No Matches */
          <div className="h-64 flex flex-col items-center justify-center text-center p-8 select-none">
            <Search className="w-8 h-8 text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-700">No matching files found</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Try adjusting your search query or port filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setPortFilter('ALL');
              }}
              className="mt-3 text-xs text-indigo-600 font-semibold hover:underline cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          /* Tiles Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-5">
            {filteredFiles.map((file) => {
              const isExport = file.filingType === 'EXPORT';
              const ediExt = isExport ? 'sb' : 'be';

              return (
                <div
                  key={file.id}
                  className="bg-white rounded-xl border border-slate-200/80 shadow-2xs hover:shadow-xs hover:border-indigo-200 transition-all p-5 flex flex-col justify-between group"
                >
                  {/* Tile Top: Firm Name & Saved Status */}
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-1.5 text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1">
                          <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>Firm / Exporter</span>
                        </div>
                        <h3 
                          className="font-bold text-slate-900 text-sm leading-snug truncate" 
                          title={file.exporterName}
                        >
                          {file.exporterName}
                        </h3>
                        {file.consigneeName && (
                          <p className="text-[11px] text-slate-500 truncate mt-0.5" title={file.consigneeName}>
                            To: <span className="text-slate-700 font-medium">{file.consigneeName}</span>
                          </p>
                        )}
                      </div>

                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 shrink-0">
                        Saved
                      </span>
                    </div>

                    {/* Invoice Number Box */}
                    <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
                          Invoice Number
                        </span>
                        <span className="font-mono font-bold text-xs text-indigo-950 truncate block mt-0.5">
                          {file.invoiceNumber}
                        </span>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
                          Filing Type
                        </span>
                        <span className="inline-block mt-0.5 text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200">
                          {file.filingType} • .{ediExt.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {/* Metadata Specs (Amount, Line Items, Port, Date) */}
                    <div className="mt-3.5 grid grid-cols-2 gap-2.5 text-[11px] text-slate-600 pt-2 border-t border-slate-100">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Invoice Total</span>
                        <span className="font-mono font-bold text-slate-900 text-xs">
                          {formatCurrency(file.invoiceTotal, file.currency)}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px]">Line Items</span>
                        <span className="font-medium text-slate-800">
                          {file.lineItems.length} {file.lineItems.length === 1 ? 'item' : 'items'}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px]">Customs Port</span>
                        <span className="font-mono font-semibold text-slate-800">
                          {file.portOfLoading}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px]">Invoice Date</span>
                        <span className="font-medium text-slate-800">
                          {file.invoiceDate || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tile Bottom: Download Actions & Open in Converter */}
                  <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    {/* Direct Downloads (.sb / .be and .xlsx) */}
                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => downloadEdi(file)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 text-slate-700 border border-slate-200/80 shadow-2xs transition-colors cursor-pointer"
                        title={`Download ICEGATE EDI Flat File (.${ediExt})`}
                      >
                        <FileCode className="w-3.5 h-3.5 text-indigo-600" />
                        <span>.{ediExt}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => downloadExcel(file)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 text-slate-700 border border-slate-200/80 shadow-2xs transition-colors cursor-pointer"
                        title="Download Excel Spreadsheet (.xlsx)"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                        <span>.xlsx</span>
                      </button>
                    </div>

                    {/* Open in Converter & Delete */}
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => onOpenInConverter(file)}
                        className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100/80 active:bg-indigo-100 text-indigo-700 border border-indigo-200/60 shadow-2xs transition-colors cursor-pointer"
                        title="Open file in Document Converter to edit"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete saved file "${file.invoiceNumber}" for ${file.exporterName}?`)) {
                            onDeleteFile(file.id);
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete from saved files"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
