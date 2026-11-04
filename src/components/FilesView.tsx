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
    <div className="flex-1 h-full flex flex-col bg-zinc-50/50 overflow-hidden select-none">
      {/* =========================================================================
          TOP HEADER BAR OF FILES VIEW
         ========================================================================= */}
      <div className="h-14 px-6 bg-white border-b border-zinc-200 flex items-center justify-between shrink-0 gap-3">
        {/* Left: Section Title & File Count */}
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center shrink-0">
            <FolderArchive className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xs font-semibold text-zinc-900 tracking-tight">
                Saved Shipments Repository
              </h2>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-zinc-100 text-zinc-700 border border-zinc-200 font-mono">
                {files.length} {files.length === 1 ? 'shipment' : 'shipments'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Allocated containers, pallet breakdowns, #DG declarations & Master BOLs
            </p>
          </div>
        </div>

        {/* Center/Right: Search & Filter Toolbar */}
        <div className="flex items-center space-x-2.5">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shipments..."
              className="w-52 lg:w-64 pl-8 pr-3 py-1 bg-zinc-50 border border-zinc-200 focus:border-zinc-400 rounded-lg text-xs text-zinc-800 placeholder-zinc-400 focus:bg-white outline-none transition-colors"
            />
          </div>

          {/* Port Filter */}
          <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg border border-zinc-200/80 text-xs">
            <button
              type="button"
              onClick={() => setPortFilter('ALL')}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer text-xs ${
                portFilter === 'ALL'
                  ? 'bg-white text-zinc-900 font-medium shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              All Ports
            </button>
            <button
              type="button"
              onClick={() => setPortFilter('INNSA1')}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer text-xs ${
                portFilter === 'INNSA1'
                  ? 'bg-white text-zinc-900 font-medium shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Nhava Sheva
            </button>
            <button
              type="button"
              onClick={() => setPortFilter('INBOM4')}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer text-xs ${
                portFilter === 'INBOM4'
                  ? 'bg-white text-zinc-900 font-medium shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Mumbai Air
            </button>
          </div>

          {/* New Document Button */}
          <button
            type="button"
            onClick={onNavigateToConverter}
            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Shipment</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          MAIN TILES GRID
         ========================================================================= */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredFiles.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-12">
            <div className="w-12 h-12 rounded-xl bg-white border border-zinc-200 shadow-2xs flex items-center justify-center text-zinc-400 mb-3">
              <Boxes className="w-6 h-6 text-zinc-500" />
            </div>
            <h3 className="text-xs font-semibold text-zinc-800">
              No shipments found in repository
            </h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm leading-relaxed">
              {searchQuery || portFilter !== 'ALL'
                ? 'No saved files match your current search or port filter.'
                : 'Process and allocate shipments in the Document Workspace, then click "Save to Files" to archive them here.'}
            </p>
            {files.length === 0 && (
              <button
                type="button"
                onClick={onNavigateToConverter}
                className="mt-3.5 inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Go to Workspace</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
            {filteredFiles.map(file => {
              const contCount = file.containers?.length || 1;
              const palletCount = file.containers?.reduce((s, c) => s + c.pallets.length, 0) || file.totalPallets || 1;
              const grossKg = file.containers?.reduce((s, c) => s + c.totalGrossWeightKg, 0) || file.grossWeightKg || 0;

              return (
                <div
                  key={file.id}
                  className="bg-white rounded-xl border border-zinc-200 shadow-2xs hover:border-zinc-300 transition-colors p-4 flex flex-col justify-between"
                >
                  <div>
                    {/* Top Header: Shipper & Badges */}
                    <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-zinc-100">
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5 text-[10px] text-zinc-400 uppercase font-medium">
                          <Building2 className="w-3 h-3 text-zinc-400 shrink-0" />
                          <span>Shipper</span>
                        </div>
                        <h3 className="text-xs font-semibold text-zinc-900 truncate mt-0.5" title={file.exporterName}>
                          {file.exporterName}
                        </h3>
                        <p className="text-[11px] text-zinc-500 truncate" title={file.consigneeName}>
                          To: <span className="font-medium text-zinc-700">{file.consigneeName}</span>
                        </p>
                      </div>

                      <div className="flex flex-col items-end space-y-1 shrink-0">
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-mono">
                          Saved
                        </span>
                        {file.hasDangerousGoods && (
                          <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.2 rounded text-[9px] font-medium bg-rose-50 text-rose-700 border border-rose-200/60">
                            <Flame className="w-2.5 h-2.5 text-rose-500" />
                            <span>#DG HazMat</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle Details Grid */}
                    <div className="grid grid-cols-2 gap-2.5 py-2.5 text-xs">
                      <div>
                        <span className="text-zinc-400 block text-[10px] font-medium">INVOICE</span>
                        <span className="font-mono font-semibold text-zinc-800 truncate block">
                          {file.invoiceNumber}
                        </span>
                      </div>

                      <div>
                        <span className="text-zinc-400 block text-[10px] font-medium">CONTAINERS</span>
                        <span className="font-mono font-medium text-zinc-700 block truncate">
                          {contCount} Cont ({file.containers?.[0]?.containerType || '40HC'})
                        </span>
                      </div>

                      <div>
                        <span className="text-zinc-400 block text-[10px] font-medium">GROSS WEIGHT</span>
                        <span className="font-mono font-semibold text-zinc-900 tabular-nums">
                          {Math.round(grossKg).toLocaleString()} kg
                        </span>
                      </div>

                      <div>
                        <span className="text-zinc-400 block text-[10px] font-medium">PALLETS</span>
                        <span className="font-mono text-zinc-700">
                          {palletCount} Pallets ({file.lineItems.length} lines)
                        </span>
                      </div>

                      <div>
                        <span className="text-zinc-400 block text-[10px] font-medium">LOADING PORT</span>
                        <span className="font-medium text-zinc-700 truncate block">
                          {file.portOfLoading}
                        </span>
                      </div>

                      <div>
                        <span className="text-zinc-400 block text-[10px] font-medium">DISCHARGE PORT</span>
                        <span className="font-medium text-zinc-700 truncate block">
                          {file.portOfDischarge}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tile Bottom: Download Actions & Open in Workspace */}
                  <div className="mt-3 pt-2.5 border-t border-zinc-100 flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-1">
                      {/* Master BOL Download */}
                      <button
                        type="button"
                        onClick={() => {
                          const bol = generateMasterBol(file);
                          downloadDocumentHtml(bol);
                        }}
                        className="inline-flex items-center space-x-1 px-2 py-1 rounded-md text-xs font-medium border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 shadow-2xs transition-colors cursor-pointer"
                        title="Generate & Download Master BOL"
                      >
                        <Ship className="w-3.5 h-3.5 text-zinc-500" />
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
                          className="inline-flex items-center space-x-1 px-2 py-1 rounded-md text-xs font-medium border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 shadow-2xs transition-colors cursor-pointer"
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
                        className="inline-flex items-center space-x-1 px-2 py-1 rounded-md text-xs font-medium border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 shadow-2xs transition-colors cursor-pointer"
                        title="Open file in Workspace to edit containers & allocations"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Open</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete shipment "${file.invoiceNumber}" for ${file.exporterName}?`)) {
                            onDeleteFile(file.id);
                          }
                        }}
                        className="p-1 text-zinc-300 hover:text-rose-600 rounded transition-colors cursor-pointer"
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
