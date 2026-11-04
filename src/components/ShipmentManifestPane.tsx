import React from 'react';
import { 
  Building2, 
  MapPin, 
  Flame, 
  CheckCircle2, 
  Ship
} from 'lucide-react';
import type { ConvertedInvoice } from '../types';

interface ShipmentManifestPaneProps {
  invoice: ConvertedInvoice;
  onUpdateInvoice: (updatedInvoice: ConvertedInvoice) => void;
}

export const ShipmentManifestPane: React.FC<ShipmentManifestPaneProps> = ({
  invoice,
  onUpdateInvoice
}) => {
  const handleChange = (field: keyof ConvertedInvoice, value: any) => {
    onUpdateInvoice({
      ...invoice,
      [field]: value
    });
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-zinc-50/60 select-none pb-24">
      <div className="w-full max-w-5xl mx-auto space-y-5">
        {/* Header / Summary Card */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-zinc-900 tracking-tight">
                  Shipment & Carrier Manifest (Single Source of Truth)
                </span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  Active Master
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Operator-editable master manifest data propagating directly to container allocation, IMO Dangerous Goods Declaration (#DG), and Ocean Bill of Lading (BOL).
              </p>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <span className="text-xs font-mono text-zinc-600 font-semibold px-2.5 py-1 bg-zinc-100 rounded-md border border-zinc-200">
                {invoice.containers?.length || 1} Containers • {invoice.totalPallets} Pallets • {invoice.grossWeightKg?.toLocaleString()} kg
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs">
            <div>
              <span className="text-[10px] font-mono text-zinc-400 block uppercase">Shipper / Exporter</span>
              <span className="font-semibold text-zinc-800 truncate block mt-0.5" title={invoice.exporterName}>
                {invoice.exporterName || '—'}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-mono text-zinc-400 block uppercase">Consignee</span>
              <span className="font-semibold text-zinc-800 truncate block mt-0.5" title={invoice.consigneeName}>
                {invoice.consigneeName || '—'}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-mono text-zinc-400 block uppercase">Carrier Line</span>
              <span className="font-semibold text-zinc-800 truncate block mt-0.5">
                {invoice.carrierName || '—'}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-mono text-zinc-400 block uppercase">Booking Number</span>
              <span className="font-semibold text-zinc-800 truncate block mt-0.5 font-mono">
                {invoice.bookingNumber || '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Section 1: Carrier, Vessel & Voyage */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center space-x-2 pb-3 mb-4 border-b border-zinc-100">
            <Ship className="w-4 h-4 text-zinc-700" />
            <h3 className="text-xs font-semibold text-zinc-900 uppercase tracking-wider font-mono">
              1. Carrier, Vessel & Booking Details
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">Carrier / Shipping Line</label>
              <input
                type="text"
                value={invoice.carrierName || ''}
                onChange={(e) => handleChange('carrierName', e.target.value)}
                placeholder="ONE LINE"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">Booking Reference</label>
              <input
                type="text"
                value={invoice.bookingNumber || ''}
                onChange={(e) => handleChange('bookingNumber', e.target.value)}
                placeholder="e.g. BKG1234567"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">Ocean Vessel Name</label>
              <input
                type="text"
                value={invoice.vesselName || ''}
                onChange={(e) => handleChange('vesselName', e.target.value)}
                placeholder="e.g. VESSEL NAME"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">Voyage Number</label>
              <input
                type="text"
                value={invoice.voyageNumber || ''}
                onChange={(e) => handleChange('voyageNumber', e.target.value)}
                placeholder="e.g. 001E"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">Movement Type</label>
              <input
                type="text"
                value={invoice.movementType || ''}
                onChange={(e) => handleChange('movementType', e.target.value)}
                placeholder="e.g. FCL / FCL or FCL / CY"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">Freight Terms</label>
              <input
                type="text"
                value={invoice.freightTerms || ''}
                onChange={(e) => handleChange('freightTerms', e.target.value)}
                placeholder="e.g. FREIGHT COLLECT"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Routing & Ports */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center space-x-2 pb-3 mb-4 border-b border-zinc-100">
            <MapPin className="w-4 h-4 text-zinc-700" />
            <h3 className="text-xs font-semibold text-zinc-900 uppercase tracking-wider font-mono">
              2. Routing & Transshipment Ports
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">Place of Receipt</label>
              <input
                type="text"
                value={invoice.placeOfReceipt || ''}
                onChange={(e) => handleChange('placeOfReceipt', e.target.value)}
                placeholder="e.g. PLACE OF RECEIPT"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">Port of Loading (POL)</label>
              <input
                type="text"
                value={invoice.portOfLoading || ''}
                onChange={(e) => handleChange('portOfLoading', e.target.value)}
                placeholder="e.g. PORT OF LOADING"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">Port of Discharge (BL)</label>
              <input
                type="text"
                value={invoice.portOfDischarge || ''}
                onChange={(e) => handleChange('portOfDischarge', e.target.value)}
                placeholder="e.g. PORT OF DISCHARGE"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">POD (DG Transshipment)</label>
              <input
                type="text"
                value={invoice.portOfDischargeDg || ''}
                onChange={(e) => handleChange('portOfDischargeDg', e.target.value)}
                placeholder="e.g. TRANSSHIPMENT PORT"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">Final Place of Delivery</label>
              <input
                type="text"
                value={invoice.placeOfDelivery || invoice.finalDestination || ''}
                onChange={(e) => {
                  handleChange('placeOfDelivery', e.target.value);
                  handleChange('finalDestination', e.target.value);
                }}
                placeholder="MYANMAR"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Customs & Commercial Metadata */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center space-x-2 pb-3 mb-4 border-b border-zinc-100">
            <Building2 className="w-4 h-4 text-zinc-700" />
            <h3 className="text-xs font-semibold text-zinc-900 uppercase tracking-wider font-mono">
              3. Customs Marks, Shipping Bills & Commercial Clauses
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">Shipping Marks & Container Numbers</label>
              <textarea
                rows={3}
                value={invoice.shippingMarks || ''}
                onChange={(e) => handleChange('shippingMarks', e.target.value)}
                placeholder="e.g. SHIPPING MARKS&#10;& NUMBERS"
                className="w-full p-2.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none resize-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">Shipping Bills & Export Declarations</label>
              <textarea
                rows={3}
                value={invoice.shippingBillNumbers || ''}
                onChange={(e) => handleChange('shippingBillNumbers', e.target.value)}
                placeholder="e.g. SB NO. 123456 DT. 01.01.2026"
                className="w-full p-2.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none resize-none transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-3 border-t border-zinc-100">
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">Brand Name</label>
              <input
                type="text"
                value={invoice.brandName || ''}
                onChange={(e) => handleChange('brandName', e.target.value)}
                placeholder="e.g. BRAND NAME"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">Harmonized H.S. Code</label>
              <input
                type="text"
                value={invoice.hsnCode || ''}
                onChange={(e) => handleChange('hsnCode', e.target.value)}
                placeholder="e.g. HSN CODE"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">Free Time Clause</label>
              <input
                type="text"
                value={invoice.freeTimeClause || ''}
                onChange={(e) => handleChange('freeTimeClause', e.target.value)}
                placeholder="14 DAYS FREE TIME DETENTION AT DESTINATION"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">BL Declared Net Weight (kg)</label>
              <input
                type="number"
                step="0.01"
                value={invoice.blDeclaredNetWeightKg ?? invoice.netWeightKg}
                onChange={(e) => handleChange('blDeclaredNetWeightKg', parseFloat(e.target.value) || 0)}
                placeholder="17970.70"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Section 4: IMO Dangerous Goods Signoff & Safety */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center space-x-2 pb-3 mb-4 border-b border-zinc-100">
            <Flame className="w-4 h-4 text-rose-600" />
            <h3 className="text-xs font-semibold text-zinc-900 uppercase tracking-wider font-mono">
              4. IMO Dangerous Goods Signoff, Safety & Segregation
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">Declarant Name</label>
              <input
                type="text"
                value={invoice.dgDeclarantName || ''}
                onChange={(e) => handleChange('dgDeclarantName', e.target.value)}
                placeholder="e.g. DECLARANT NAME"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">Declarant Title</label>
              <input
                type="text"
                value={invoice.dgDeclarantStatus || ''}
                onChange={(e) => handleChange('dgDeclarantStatus', e.target.value)}
                placeholder="e.g. DESIGNATION"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">Place & Date</label>
              <input
                type="text"
                value={invoice.dgDeclarationPlaceAndDate || ''}
                onChange={(e) => handleChange('dgDeclarationPlaceAndDate', e.target.value)}
                placeholder="e.g. PLACE / DATE"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">Emergency Contact</label>
              <input
                type="text"
                value={invoice.emergencyContactName || ''}
                onChange={(e) => handleChange('emergencyContactName', e.target.value)}
                placeholder="e.g. CONTACT PERSON"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">Emergency Phone</label>
              <input
                type="text"
                value={invoice.emergencyContactPhone || ''}
                onChange={(e) => handleChange('emergencyContactPhone', e.target.value)}
                placeholder="e.g. +91 98765 43210"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">UN Package Code</label>
              <input
                type="text"
                value={invoice.unPackingCode || ''}
                onChange={(e) => handleChange('unPackingCode', e.target.value)}
                placeholder="e.g. 4G/Z 30/S/..."
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-900 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 font-medium mb-1">EMS / Segregation</label>
              <input
                type="text"
                value={invoice.emsNumber ? `${invoice.emsNumber}${invoice.segregationGroup ? ` | ${invoice.segregationGroup}` : ''}` : ''}
                onChange={(e) => {
                  const parts = e.target.value.split('|').map(p => p.trim());
                  handleChange('emsNumber', parts[0] || '');
                  if (parts[1] !== undefined) handleChange('segregationGroup', parts[1]);
                }}
                placeholder="e.g. F-A-S-B | SGG1"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg font-mono text-zinc-900 focus:border-zinc-500 outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Informative Footer */}
        <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
          <div className="flex items-center space-x-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Changes in this manifest view are automatically saved and applied to BOL & #DG outputs.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
