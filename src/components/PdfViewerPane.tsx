import React, { useState } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  FileText, 
  ChevronLeft, 
  ChevronRight, 
  ShieldCheck
} from 'lucide-react';
import type { ShipmentData } from '../types/customs';

interface PdfViewerPaneProps {
  shipment: ShipmentData;
  activeItemIndex?: number | null;
  uploadedPdfUrl?: string | null;
}

export const PdfViewerPane: React.FC<PdfViewerPaneProps> = ({
  shipment,
  activeItemIndex,
  uploadedPdfUrl
}) => {
  const [zoom, setZoom] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const totalPages = shipment.sourcePdf?.totalPages || 2;

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 15, 175));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 15, 70));
  const handleResetZoom = () => setZoom(100);

  return (
    <div className="h-full flex flex-col bg-slate-950 border-r border-slate-800 select-none">
      {/* Top Toolbar */}
      <div className="h-10 bg-slate-900/90 border-b border-slate-800 px-3 flex items-center justify-between text-xs text-slate-300">
        <div className="flex items-center space-x-2 truncate">
          <FileText className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="font-medium truncate max-w-[220px]" title={shipment.sourcePdf?.name}>
            {shipment.sourcePdf?.name || `${shipment.invoice.invoiceNo}.pdf`}
          </span>
          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
            PDF 1.7
          </span>
        </div>

        {/* Page navigation & Zoom controls */}
        <div className="flex items-center space-x-2">
          {/* Page nav */}
          <div className="flex items-center space-x-1 bg-slate-800 px-1.5 py-0.5 rounded">
            <button
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
              disabled={currentPage <= 1}
              className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30"
              title="Previous Page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono px-1">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
              disabled={currentPage >= totalPages}
              className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30"
              title="Next Page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center space-x-1 bg-slate-800 px-1 py-0.5 rounded">
            <button
              onClick={handleZoomOut}
              className="p-1 text-slate-400 hover:text-white"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={handleResetZoom}
              className="text-[11px] font-mono px-1 hover:text-sky-400"
            >
              {zoom}%
            </button>
            <button
              onClick={handleZoomIn}
              className="p-1 text-slate-400 hover:text-white"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Document View Canvas */}
      <div className="flex-1 overflow-auto p-4 bg-slate-900/50 flex justify-center items-start">
        {uploadedPdfUrl ? (
          <div 
            className="bg-white rounded shadow-2xl overflow-hidden transition-transform origin-top w-full h-full min-h-[750px]"
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
          >
            <iframe 
              src={`${uploadedPdfUrl}#toolbar=0&navpanes=0`} 
              className="w-full h-full border-none"
              title="Uploaded Commercial Invoice PDF"
            />
          </div>
        ) : (
          /* High-Fidelity Rendered Indian Customs Commercial Invoice Document */
          <div
            className="bg-white text-slate-900 p-8 rounded shadow-2xl border border-slate-300 w-full max-w-[800px] transition-transform origin-top select-text text-[11px] leading-relaxed"
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
          >
            {/* Invoice Header / Letterhead */}
            <div className="border-b-2 border-slate-900 pb-3 mb-3">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-base font-black text-slate-900 uppercase tracking-tight">
                    {shipment.exporter.companyName}
                  </h1>
                  <p className="text-[10px] text-slate-600 max-w-[420px]">
                    {shipment.exporter.address}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] font-mono text-slate-700">
                    <span><strong>IEC:</strong> {shipment.exporter.iec}</span>
                    <span><strong>GSTIN:</strong> {shipment.exporter.gstin}</span>
                    <span><strong>PAN:</strong> {shipment.exporter.gstin?.substring(2, 12)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="inline-block bg-slate-900 text-white font-bold text-xs uppercase px-2 py-0.5 rounded mb-1">
                    COMMERCIAL INVOICE
                  </div>
                  <div className="text-[10px] text-slate-600">
                    <div><strong>Inv No:</strong> <span className="font-mono font-bold text-slate-900">{shipment.invoice.invoiceNo}</span></div>
                    <div><strong>Date:</strong> {shipment.invoice.invoiceDate}</div>
                    <div><strong>Port of Loading:</strong> <span className="font-mono font-bold text-slate-900">{shipment.portCode}</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Buyer & Shipment Details Grid */}
            <div className="grid grid-cols-2 gap-4 border border-slate-300 p-2.5 rounded mb-3 bg-slate-50 text-[10px]">
              <div>
                <span className="font-bold uppercase text-slate-700 block mb-0.5">Consignee / Buyer (Overseas):</span>
                <p className="font-semibold text-slate-900">{shipment.invoice.consigneeName}</p>
                <p className="text-slate-600 whitespace-pre-line">{shipment.invoice.consigneeAddress}</p>
                <p className="mt-1 text-slate-700"><strong>Country of Destination:</strong> {shipment.invoice.destinationCountry}</p>
              </div>
              <div className="border-l border-slate-300 pl-3">
                <span className="font-bold uppercase text-slate-700 block mb-0.5">Shipping & Banking Terms:</span>
                <div className="space-y-0.5 text-slate-700">
                  <div><strong>Terms of Delivery:</strong> <span className="font-bold text-sky-800">{shipment.invoice.incoterm}</span> ({shipment.invoice.portOfDischarge})</div>
                  <div><strong>Currency:</strong> {shipment.invoice.currency} (Exch. Rate: ₹{shipment.invoice.exchangeRate})</div>
                  <div><strong>Bank AD Code:</strong> <span className="font-mono font-semibold">{shipment.exporter.adCode}</span></div>
                  <div><strong>Bank Name:</strong> {shipment.exporter.bankName}</div>
                  <div><strong>Gross Wt:</strong> <span className="font-semibold">{shipment.packages.grossWeightKg} KGS</span> | <strong>Net:</strong> {shipment.packages.netWeightKg} KGS</div>
                  <div><strong>Total Packages:</strong> {shipment.packages.totalPackages} {shipment.packages.packageType}</div>
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <table className="w-full border-collapse border border-slate-300 text-[10px] mb-3">
              <thead>
                <tr className="bg-slate-200 text-slate-800 font-bold uppercase text-[9px]">
                  <th className="border border-slate-300 px-1.5 py-1 text-center w-8">Item</th>
                  <th className="border border-slate-300 px-2 py-1 text-left">Description of Goods</th>
                  <th className="border border-slate-300 px-2 py-1 text-center w-24">HSN / RITC</th>
                  <th className="border border-slate-300 px-2 py-1 text-right w-16">Quantity</th>
                  <th className="border border-slate-300 px-2 py-1 text-center w-12">UQC</th>
                  <th className="border border-slate-300 px-2 py-1 text-right w-20">Unit Rate ({shipment.invoice.currency})</th>
                  <th className="border border-slate-300 px-2 py-1 text-right w-24">Total ({shipment.invoice.currency})</th>
                </tr>
              </thead>
              <tbody>
                {shipment.lineItems.map((item, idx) => {
                  const isHighlighted = activeItemIndex === idx;
                  const hasHsnIssue = !item.isHsnValid || item.hsnCode.length !== 8;
                  const hasMathIssue = !item.isLineMathValid;

                  return (
                    <tr 
                      key={item.id}
                      className={`border-b border-slate-200 transition-colors ${
                        isHighlighted 
                          ? 'bg-amber-100 font-medium' 
                          : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                      }`}
                    >
                      <td className="border border-slate-300 px-1.5 py-1 text-center font-mono">{item.itemNumber || idx + 1}</td>
                      <td className="border border-slate-300 px-2 py-1">
                        <div className="font-medium text-slate-800">{item.description}</div>
                      </td>
                      <td className={`border border-slate-300 px-2 py-1 text-center font-mono ${
                        hasHsnIssue ? 'bg-red-50 text-red-700 font-bold underline decoration-wavy' : 'text-slate-800'
                      }`}>
                        {item.hsnCode}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-mono">{item.quantity}</td>
                      <td className="border border-slate-300 px-2 py-1 text-center font-mono text-slate-700">
                        {item.originalUqc || item.uqc}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-mono">{item.unitPrice.toFixed(2)}</td>
                      <td className={`border border-slate-300 px-2 py-1 text-right font-mono font-bold ${
                        hasMathIssue ? 'text-amber-700 bg-amber-50' : 'text-slate-900'
                      }`}>
                        {item.itemTotalValue.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-400">
                  <td colSpan={6} className="border border-slate-300 px-2 py-1.5 text-right uppercase">
                    Invoice Total ({shipment.invoice.currency}):
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5 text-right font-mono text-xs text-sky-900">
                    {shipment.invoice.invoiceTotal.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Footer / Declarations & Digital Signature DSC Stamp */}
            <div className="border border-slate-300 p-2.5 rounded bg-slate-50 text-[9px] text-slate-600 mb-3">
              <p className="font-semibold text-slate-700 mb-0.5">DECLARATION:</p>
              <p>
                We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct. Goods are of Indian Origin, cleared via Licensed Customs Broker Ekdant Logistics.
              </p>
            </div>

            {/* e-Sanchit IRN & DSC Signature Badge */}
            <div className="flex justify-between items-end pt-2 border-t border-slate-300">
              <div className="text-[9px] text-slate-600">
                <div className="flex items-center space-x-1 text-emerald-800 font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>e-Sanchit IRN: {shipment.invoice.eSanchitIrn || 'PENDING DIGITAL SIGNATURE'}</span>
                </div>
                <div>Doc Reference (DRN): {shipment.invoice.eSanchitDrn || 'DRN88921004'}</div>
                <div>Signed via: Class-3 USB DSC Dongle</div>
              </div>

              <div className="text-center border border-dashed border-slate-400 p-2 rounded w-44 bg-slate-50/50">
                <span className="text-[8px] uppercase tracking-wider block text-slate-500">For {shipment.exporter.companyName}</span>
                <div className="my-1 font-serif italic text-xs text-indigo-900">Digitally Signed DSC</div>
                <span className="text-[8px] font-bold block text-slate-700 uppercase">Authorized Signatory</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
