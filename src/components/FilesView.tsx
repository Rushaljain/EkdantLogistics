import React, { useState, useMemo } from 'react';
import { 
  Building2, 
  FolderArchive, 
  Search, 
  Trash2, 
  ExternalLink, 
  Plus,
  Ship,
  Boxes,
  Flame
} from 'lucide-react';
import type { ConvertedInvoice } from '../types';
import { generateMasterBol, downloadDocumentHtml } from '../utils/bolGenerator';
import { generateDgDeclaration } from '../utils/dgGenerator';

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
  const [portFilter, setPortFilter] = useState<'ALL' | string>('ALL');

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

      const matchesPort = portFilter === 'ALL' || file.portOfLoading.includes(portFilter);

      return matchesQuery && matchesPort;
    });
  }, [files, searchQuery, portFilter]);

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
                Saved Shipments Repository
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 font-mono">
                {files.length} {files.length === 1 ? 'shipment' : 'shipments'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Allocated containers, pallet breakdowns, #DG declarations & Master BOLs
            </p>
          </div>
        </div>

        {/* Center/Right: Search & Filter Toolbar */}
        <div className="flex items-center space-x-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shipper, consignee, or invoice..."
              className="w-56 lg:w-72 pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
            />
          </div>

          {/* Port Filter */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/60 text-xs">
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
            <span>New Shipment</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          MAIN TILES GRID
         ========================================================================= */}
      <div className="flex-1 overflow-y-auto p-8">
        {filteredFiles.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-12">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-center text-slate-400 mb-4">
              <Boxes className="w-8 h-8 text-indigo-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">
              No shipments found in repository
            </h3>
            <p className="text-xs text-slate-400 mt-1.5 max-w-sm leading-relaxed">
              {searchQuery || portFilter !== 'ALL'
                ? 'No saved files match your current search or port filter.'
                : 'Process and allocate shipments in the Document Workspace, then click "Save to Files" to archive them here.'}
            </p>
            {files.length === 0 && (
              <button
                type="button"
                onClick={onNavigateToConverter}
                className="mt-4 inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Go to Workspace</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-5">
            {filteredFiles.map(file => {
              const contCount = file.containers?.length || 1;
              const palletCount = file.containers?.reduce((s, c) => s + c.pallets.length, 0) || file.totalPallets || 1;
              const grossKg = file.containers?.reduce((s, c) => s + c.totalGrossWeightKg, 0) || file.grossWeightKg || 0;

              return (
                <div
                  key={file.id}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-sm hover:border-indigo-300 transition-all p-5 flex flex-col justify-between"
                >
                  <div>
                    {/* Top Header: Shipper & Badges */}
                    <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5 text-[10px] text-slate-400 uppercase font-semibold">
                          <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>Shipper / Exporter</span>
                        </div>
                        <h3 className="text-xs font-bold text-slate-900 truncate mt-0.5" title={file.exporterName}>
                          {file.exporterName}
                        </h3>
                        <p className="text-[11px] text-slate-500 truncate" title={file.consigneeName}>
                          To: <span className="font-semibold text-slate-700">{file.consigneeName}</span>
                        </p>
                      </div>

                      <div className="flex flex-col items-end space-y-1 shrink-0">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 font-mono">
                          Saved
                        </span>
                        {file.hasDangerousGoods && (
                          <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <Flame className="w-2.5 h-2.5 text-rose-600" />
                            <span>#DG HazMat</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle Details Grid */}
                    <div className="grid grid-cols-2 gap-3 py-3 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px] font-medium">INVOICE NUMBER</span>
                        <span className="font-mono font-bold text-slate-800 truncate block">
                          {file.invoiceNumber}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px] font-medium">CONTAINER BREAKDOWN</span>
                        <span className="font-mono font-semibold text-indigo-700 block truncate">
                          {contCount} Cont ({file.containers?.[0]?.containerType || '40HC'})
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px] font-medium">TOTAL GROSS WEIGHT</span>
                        <span className="font-mono font-bold text-slate-900">
                          {Math.round(grossKg).toLocaleString()} kg
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px] font-medium">PALLET COUNT</span>
                        <span className="font-mono text-slate-700">
                          {palletCount} Pallets ({file.lineItems.length} lines)
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px] font-medium">PORT OF LOADING</span>
                        <span className="font-semibold text-slate-700 truncate block">
                          {file.portOfLoading}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px] font-medium">DISCHARGE PORT</span>
                        <span className="font-semibold text-slate-700 truncate block">
                          {file.portOfDischarge}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tile Bottom: Download Actions & Open in Workspace */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-1.5">
                      {/* Master BOL Download */}
                      <button
                        type="button"
                        onClick={() => {
                          const bol = generateMasterBol(file);
                          downloadDocumentHtml(bol);
                        }}
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 border border-indigo-200/80 shadow-2xs transition-colors cursor-pointer"
                        title="Generate & Download Master BOL"
                      >
                        <Ship className="w-3.5 h-3.5" />
                        <span>BOL</span>
                      </button>

                      {/* #DG Document Download */}
                      {file.hasDangerousGoods && (
                        <button
                          type="button"
                          onClick={() => {
                            const dg = generateDgDeclaration(file);
                            downloadDocumentHtml(dg);
                          }}
                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-700 border border-rose-200/80 shadow-2xs transition-colors cursor-pointer"
                          title="Generate & Download IMO Dangerous Goods Declaration"
                        >
                          <Flame className="w-3.5 h-3.5 text-rose-500" />
                          <span>#DG Dec</span>
                        </button>
                      )}
                    </div>

                    {/* Open in Workspace & Delete */}
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => onOpenInConverter(file)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/70 shadow-2xs transition-colors cursor-pointer"
                        title="Open file in Workspace to edit containers & allocations"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete shipment "${file.invoiceNumber}" for ${file.exporterName}?`)) {
                            onDeleteFile(file.id);
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete from saved shipments"
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
