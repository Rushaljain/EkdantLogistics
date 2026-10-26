import React, { useState } from 'react';
import { 
  Building2, 
  FileSpreadsheet, 
  Scale, 
  ChevronDown, 
  ChevronUp, 
  FileKey
} from 'lucide-react';
import type { ShipmentData, ExporterMasterData } from '../types/customs';
import { getExporterMasters } from '../services/supabaseClient';

interface CustomsHeaderCardsProps {
  shipment: ShipmentData;
  onUpdateExporter: (exporter: ExporterMasterData) => void;
  onUpdateInvoice: (invoicePartial: Partial<ShipmentData['invoice']>) => void;
  onUpdatePackages: (packagesPartial: Partial<ShipmentData['packages']>) => void;
}

export const CustomsHeaderCards: React.FC<CustomsHeaderCardsProps> = ({
  shipment,
  onUpdateExporter,
  onUpdateInvoice,
  onUpdatePackages
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const masters = getExporterMasters();

  const handleSelectMaster = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = masters.find(m => m.id === e.target.value);
    if (selected) {
      onUpdateExporter(selected);
    }
  };

  const isGrossWeightValid = shipment.packages.grossWeightKg >= shipment.packages.netWeightKg;

  return (
    <div className="bg-slate-900/90 border-b border-slate-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Customs Declarations & Statutory Master
          </span>
          <span className="text-[10px] bg-sky-950 text-sky-400 border border-sky-800 px-2 py-0.5 rounded font-mono">
            {shipment.shipmentType === 'EXPORT' ? 'Shipping Bill (ICES 1.5 .sb)' : 'Bill of Entry (ICES 1.5 .be)'}
          </span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 font-medium"
        >
          {isExpanded ? (
            <><span>Hide Details</span> <ChevronUp className="w-3.5 h-3.5" /></>
          ) : (
            <><span>Edit Header & Exporter</span> <ChevronDown className="w-3.5 h-3.5" /></>
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {/* Card 1: Statutory Exporter Master */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800/80">
              <span className="font-semibold text-sky-400 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> Exporter / IEC Master
              </span>
              <select
                onChange={handleSelectMaster}
                defaultValue={shipment.exporter.id || ''}
                className="bg-slate-900 border border-slate-700 text-[11px] text-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="" disabled>Auto-fill from Master...</option>
                {masters.map(m => (
                  <option key={m.id} value={m.id}>{m.companyName.substring(0, 24)}...</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <div>
                <label className="text-[10px] text-slate-400 block">Company Name</label>
                <input
                  type="text"
                  value={shipment.exporter.companyName}
                  onChange={(e) => onUpdateExporter({ ...shipment.exporter, companyName: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs font-medium focus:ring-1 focus:ring-sky-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block">10-Digit IEC</label>
                  <input
                    type="text"
                    maxLength={10}
                    value={shipment.exporter.iec}
                    onChange={(e) => onUpdateExporter({ ...shipment.exporter, iec: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs focus:ring-1 focus:ring-sky-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">15-Digit GSTIN</label>
                  <input
                    type="text"
                    maxLength={15}
                    value={shipment.exporter.gstin}
                    onChange={(e) => onUpdateExporter({ ...shipment.exporter, gstin: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs focus:ring-1 focus:ring-sky-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block">7-Digit Bank AD Code</label>
                  <input
                    type="text"
                    maxLength={7}
                    value={shipment.exporter.adCode}
                    onChange={(e) => onUpdateExporter({ ...shipment.exporter, adCode: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs focus:ring-1 focus:ring-sky-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">State Code (MH=27)</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={shipment.exporter.stateCode || '27'}
                    onChange={(e) => onUpdateExporter({ ...shipment.exporter, stateCode: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs focus:ring-1 focus:ring-sky-500 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Commercial Invoice & e-Sanchit Details */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800/80">
              <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5" /> Commercial Invoice
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                Port: <strong className="text-white">{shipment.portCode}</strong>
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block">Invoice Number</label>
                  <input
                    type="text"
                    value={shipment.invoice.invoiceNo}
                    onChange={(e) => onUpdateInvoice({ invoiceNo: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs focus:ring-1 focus:ring-sky-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">Invoice Date</label>
                  <input
                    type="date"
                    value={shipment.invoice.invoiceDate}
                    onChange={(e) => onUpdateInvoice({ invoiceDate: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs focus:ring-1 focus:ring-sky-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block">Incoterm</label>
                  <select
                    value={shipment.invoice.incoterm}
                    onChange={(e) => onUpdateInvoice({ incoterm: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-slate-200 text-xs font-semibold focus:ring-1 focus:ring-sky-500 outline-none"
                  >
                    <option value="FOB">FOB</option>
                    <option value="CIF">CIF</option>
                    <option value="CFR">CFR</option>
                    <option value="EXW">EXW</option>
                    <option value="FCA">FCA</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">Currency</label>
                  <select
                    value={shipment.invoice.currency}
                    onChange={(e) => onUpdateInvoice({ currency: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-slate-200 text-xs font-semibold focus:ring-1 focus:ring-sky-500 outline-none"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="INR">INR</option>
                    <option value="GBP">GBP</option>
                    <option value="AED">AED</option>
                    <option value="SGD">SGD</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">Exch Rate (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={shipment.invoice.exchangeRate}
                    onChange={(e) => onUpdateInvoice({ exchangeRate: parseFloat(e.target.value) || 1 })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs focus:ring-1 focus:ring-sky-500 outline-none"
                  />
                </div>
              </div>

              {/* e-Sanchit IRN Field */}
              <div>
                <label className="text-[10px] text-slate-400 flex items-center justify-between">
                  <span className="flex items-center gap-1 font-semibold text-emerald-400">
                    <FileKey className="w-3 h-3" /> 16-Char e-Sanchit IRN (Class-3 DSC)
                  </span>
                  <span className="font-mono text-[9px] text-slate-500">
                    {shipment.invoice.eSanchitIrn?.length || 0}/16
                  </span>
                </label>
                <div className="flex space-x-1">
                  <input
                    type="text"
                    maxLength={16}
                    placeholder="e.g. 2026INNSA1009841"
                    value={shipment.invoice.eSanchitIrn}
                    onChange={(e) => onUpdateInvoice({ eSanchitIrn: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => onUpdateInvoice({ eSanchitIrn: `2026${shipment.portCode}00${Math.floor(1000 + Math.random() * 9000)}` })}
                    className="px-2 py-1 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 rounded text-[10px] font-mono shrink-0"
                    title="Generate test e-Sanchit DSC Reference"
                  >
                    Gen
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Weight Logic & Package Verification */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800/80">
              <span className="font-semibold text-amber-400 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5" /> Manifest & Weight Logic
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                isGrossWeightValid ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-300 animate-pulse'
              }`}>
                {isGrossWeightValid ? 'Gross ≥ Net OK' : 'REJECT: Gross < Net'}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block">Total Packages</label>
                  <input
                    type="number"
                    value={shipment.packages.totalPackages}
                    onChange={(e) => onUpdatePackages({ totalPackages: parseInt(e.target.value) || 1 })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs focus:ring-1 focus:ring-sky-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">Package Type</label>
                  <select
                    value={shipment.packages.packageType}
                    onChange={(e) => onUpdatePackages({ packageType: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-slate-200 text-xs focus:ring-1 focus:ring-sky-500 outline-none"
                  >
                    <option value="BOX">BOX - Boxes</option>
                    <option value="CTN">CTN - Cartons</option>
                    <option value="CRATE">CRATE - Wooden Crates</option>
                    <option value="PLT">PLT - Pallets</option>
                    <option value="BAG">BAG - Bags</option>
                    <option value="DRM">DRM - Drums</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block">Gross Weight (KG)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={shipment.packages.grossWeightKg}
                    onChange={(e) => onUpdatePackages({ grossWeightKg: parseFloat(e.target.value) || 0 })}
                    className={`w-full bg-slate-900 border rounded px-2 py-1 font-mono text-xs focus:ring-1 outline-none ${
                      isGrossWeightValid 
                        ? 'border-slate-800 text-slate-200 focus:ring-sky-500' 
                        : 'border-rose-600 text-rose-300 focus:ring-rose-500 bg-rose-950/20'
                    }`}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block">Net Weight (KG)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={shipment.packages.netWeightKg}
                    onChange={(e) => onUpdatePackages({ netWeightKg: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs focus:ring-1 focus:ring-sky-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block">Consignee Name</label>
                <input
                  type="text"
                  value={shipment.invoice.consigneeName}
                  onChange={(e) => onUpdateInvoice({ consigneeName: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs focus:ring-1 focus:ring-sky-500 outline-none truncate"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
