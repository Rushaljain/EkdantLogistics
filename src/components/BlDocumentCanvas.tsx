import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ExtractedShipmentJSON, ExtractedPallet } from '../types/index.ts';
import { EditableDocCell } from './EditableDocCell.tsx';

interface BlDocumentCanvasProps {
  shipmentJson: ExtractedShipmentJSON;
  onUpdateShipment: (updated: ExtractedShipmentJSON) => void;
  onFieldChange: (fieldId: string, newValue: string) => void;
  customOverrides: Record<string, string>;
}

export function BlDocumentCanvas({
  shipmentJson,
  onUpdateShipment,
  onFieldChange,
  customOverrides
}: BlDocumentCanvasProps): React.JSX.Element {
  const getVal = (overrideKey: string, fallbackVal: string): string => {
    if (customOverrides[overrideKey] !== undefined) {
      return customOverrides[overrideKey];
    }
    return fallbackVal || '';
  };

  const handleUpdate = (
    overrideKey: string,
    newValue: string,
    shipmentKey?: keyof ExtractedShipmentJSON
  ) => {
    onFieldChange(overrideKey, newValue);

    if (shipmentKey) {
      const updated = { ...shipmentJson };
      if (typeof updated[shipmentKey] === 'number') {
        (updated as any)[shipmentKey] = Number(newValue) || 0;
      } else {
        (updated as any)[shipmentKey] = newValue;
      }
      onUpdateShipment(updated);
    }
  };

  // Live VGM Calculation
  const calculatedVgm = (shipmentJson.grossWeightKg || 0) + (shipmentJson.tareWeightKg || 0);

  // Pallet Annex Handlers
  const handlePalletChange = (
    index: number,
    field: keyof ExtractedPallet,
    value: string | number
  ) => {
    const updatedPallets = [...shipmentJson.pallets];
    const target = { ...updatedPallets[index] };

    if (field === 'boxCount' || field === 'grossWeightKg' || field === 'netWeightKg') {
      (target as any)[field] = Number(value) || 0;
    } else {
      (target as any)[field] = String(value);
    }

    updatedPallets[index] = target;

    const totalBoxes = updatedPallets.reduce((sum, p) => sum + (p.boxCount || 0), 0);
    const grossWeight = updatedPallets.reduce((sum, p) => sum + (p.grossWeightKg || 0), 0);
    const netWeight = updatedPallets.reduce((sum, p) => sum + (p.netWeightKg || 0), 0);

    const palletNumbers = updatedPallets.map((p) => p.palletNumber).filter(Boolean);
    const synthesizedRange = palletNumbers.length > 0
      ? `${palletNumbers[0]} TO ${palletNumbers[palletNumbers.length - 1]}`
      : '';

    let updatedMarks = shipmentJson.shippingMarks;
    if (synthesizedRange && !updatedMarks.includes(synthesizedRange)) {
      updatedMarks = `${updatedMarks}\n${synthesizedRange}`.trim();
    }

    onUpdateShipment({
      ...shipmentJson,
      pallets: updatedPallets,
      totalBoxes: totalBoxes > 0 ? totalBoxes : shipmentJson.totalBoxes,
      totalPackages: totalBoxes > 0 ? totalBoxes : shipmentJson.totalPackages,
      grossWeightKg: grossWeight > 0 ? grossWeight : shipmentJson.grossWeightKg,
      netWeightKg: netWeight > 0 ? netWeight : shipmentJson.netWeightKg,
      shippingMarks: updatedMarks
    });
  };

  const handleAddPalletRow = () => {
    const nextIdx = shipmentJson.pallets.length + 1;
    const newPallet: ExtractedPallet = {
      palletNumber: `P-${nextIdx.toString().padStart(2, '0')}`,
      modelCode: shipmentJson.pallets[0]?.modelCode || '',
      brand: shipmentJson.pallets[0]?.brand || shipmentJson.brandName || undefined,
      invoiceNumber: shipmentJson.pallets[0]?.invoiceNumber || shipmentJson.invoiceNumbers?.[0] || undefined,
      boxCount: 40,
      grossWeightKg: 1020,
      netWeightKg: 980,
      sourceFile: 'Annex Pallet'
    };

    const updatedPallets = [...shipmentJson.pallets, newPallet];
    const totalBoxes = updatedPallets.reduce((sum, p) => sum + (p.boxCount || 0), 0);
    const grossWeight = updatedPallets.reduce((sum, p) => sum + (p.grossWeightKg || 0), 0);
    const netWeight = updatedPallets.reduce((sum, p) => sum + (p.netWeightKg || 0), 0);

    onUpdateShipment({
      ...shipmentJson,
      pallets: updatedPallets,
      totalPallets: updatedPallets.length,
      totalBoxes,
      totalPackages: totalBoxes,
      grossWeightKg: grossWeight,
      netWeightKg: netWeight
    });
  };

  const handleDeletePalletRow = (index: number) => {
    const updatedPallets = shipmentJson.pallets.filter((_, i) => i !== index);
    const totalBoxes = updatedPallets.reduce((sum, p) => sum + (p.boxCount || 0), 0);
    const grossWeight = updatedPallets.reduce((sum, p) => sum + (p.grossWeightKg || 0), 0);
    const netWeight = updatedPallets.reduce((sum, p) => sum + (p.netWeightKg || 0), 0);

    onUpdateShipment({
      ...shipmentJson,
      pallets: updatedPallets,
      totalPallets: updatedPallets.length,
      totalBoxes,
      totalPackages: totalBoxes,
      grossWeightKg: grossWeight,
      netWeightKg: netWeight
    });
  };

  return (
    <div className="w-full max-w-[920px] mx-auto space-y-6 pb-12">
      {/* =========================================================================
          PAGE 1: STANDARD OCEAN BILL OF LADING DRAFT (IN-PLACE WYSIWYG)
          ========================================================================= */}
      <div className="bg-white text-slate-900 shadow-2xl border-2 border-slate-900 rounded-sm p-6 sm:p-8 font-sans">
        {/* Document Header */}
        <div className="border-b-2 border-slate-900 pb-2 mb-3 flex items-start justify-between">
          <div>
            <h1 className="text-sm sm:text-base font-extrabold uppercase tracking-tight text-slate-950">
              BILL OF LADING FOR OCEAN TRANSPORT
            </h1>
            <p className="text-[9px] text-slate-600 font-medium">
              Multimodal Transport Document &bull; Negotiable Combined Transport Bill of Lading
            </p>
          </div>

          <div className="text-right">
            <span className="text-[8px] font-mono text-slate-500 uppercase block">Carrier Booking Reference</span>
            <span className="text-xs font-mono font-bold text-slate-900">{shipmentJson.bookingNumber || 'DRAFT-BL'}</span>
          </div>
        </div>

        {/* B/L Table Grid */}
        <div className="border border-slate-900 divide-y divide-slate-900 text-[10px]">
          {/* Row 1: Shipper, B/L Number, Booking Number, References */}
          <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-900">
            {/* Shipper */}
            <div className="md:col-span-6">
              <EditableDocCell
                label="Shipper / Exporter (Name, Address, Tax Identifiers)"
                value={getVal(
                  'shipper_name_address',
                  `${shipmentJson.shipperName}\n${shipmentJson.shipperAddress}${
                    shipmentJson.shipperIec ? `\nIEC: ${shipmentJson.shipperIec}` : ''
                  }${shipmentJson.shipperGstin ? `\nGSTIN: ${shipmentJson.shipperGstin}` : ''}`
                )}
                onChange={(val) => handleUpdate('shipper_name_address', val, 'shipperAddress')}
                multiline
                rows={4}
              />
            </div>

            {/* Document References Column */}
            <div className="md:col-span-6 flex flex-col divide-y divide-slate-900">
              <div className="grid grid-cols-2 divide-x divide-slate-900">
                <EditableDocCell
                  label="Bill of Lading Number"
                  value={getVal('bill_of_lading_number', shipmentJson.bookingNumber ? `BL-${shipmentJson.bookingNumber}` : '')}
                  onChange={(val) => handleUpdate('bill_of_lading_number', val)}
                  stage2Key="bookingNumber"
                  placeholder="e.g. BL-BKG-99201"
                />
                <EditableDocCell
                  label="Carrier Booking No."
                  value={getVal('booking_number', shipmentJson.bookingNumber)}
                  onChange={(val) => handleUpdate('booking_number', val, 'bookingNumber')}
                  stage2Key="bookingNumber"
                  placeholder="e.g. BKG-99201"
                />
              </div>

              <div className="grid grid-cols-2 divide-x divide-slate-900 flex-1">
                <EditableDocCell
                  label="Export / Shipper References"
                  value={getVal('export_references', shipmentJson.shipperReference || shipmentJson.invoiceNumbers[0])}
                  onChange={(val) => handleUpdate('export_references', val, 'shipperReference')}
                />
                <EditableDocCell
                  label="Shipping Bill Numbers"
                  value={getVal('shipping_bill_numbers', shipmentJson.shippingBillNumbers)}
                  onChange={(val) => handleUpdate('shipping_bill_numbers', val, 'shippingBillNumbers')}
                  stage2Key="shippingBillNumbers"
                  placeholder="e.g. SB-1092837 DT: 15-03-2026"
                />
              </div>
            </div>
          </div>

          {/* Row 2: Consignee & Notify Party */}
          <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-900">
            <div className="md:col-span-6">
              <EditableDocCell
                label="Consignee (Name and Full Address)"
                value={getVal('consignee_name_address', `${shipmentJson.consigneeName}\n${shipmentJson.consigneeAddress}`)}
                onChange={(val) => handleUpdate('consignee_name_address', val, 'consigneeAddress')}
                multiline
                rows={3}
              />
            </div>

            <div className="md:col-span-6">
              <EditableDocCell
                label="Notify Party (It is agreed that no responsibility shall attach to the carrier)"
                value={getVal(
                  'notify_party_name_address',
                  `${shipmentJson.notifyPartyName || 'SAME AS CONSIGNEE'}\n${shipmentJson.notifyPartyAddress || ''}`.trim()
                )}
                onChange={(val) => handleUpdate('notify_party_name_address', val, 'notifyPartyName')}
                multiline
                rows={3}
              />
            </div>
          </div>

          {/* Row 3: Transport & Routing */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 divide-x divide-y md:divide-y-0 divide-slate-900">
            <EditableDocCell
              label="Pre-Carriage By"
              value={getVal('pre_carriage_by', shipmentJson.preCarriageBy)}
              onChange={(val) => handleUpdate('pre_carriage_by', val, 'preCarriageBy')}
            />
            <EditableDocCell
              label="Place of Receipt"
              value={getVal('place_of_receipt', shipmentJson.placeOfReceipt || shipmentJson.portOfLoading)}
              onChange={(val) => handleUpdate('place_of_receipt', val, 'placeOfReceipt')}
            />
            <EditableDocCell
              label="Ocean Vessel / Voyage"
              value={getVal(
                'vessel_and_voyage',
                shipmentJson.vesselName
                  ? `${shipmentJson.vesselName} / ${shipmentJson.voyageNumber}`
                  : ''
              )}
              onChange={(val) => handleUpdate('vessel_and_voyage', val, 'vesselName')}
              stage2Key="vesselVoyage"
              placeholder="e.g. MSC LAUREN / 2401W"
            />
            <EditableDocCell
              label="Port of Loading"
              value={getVal('port_of_loading', shipmentJson.portOfLoading)}
              onChange={(val) => handleUpdate('port_of_loading', val, 'portOfLoading')}
            />
            <EditableDocCell
              label="Port of Discharge"
              value={getVal('port_of_discharge', shipmentJson.portOfDischarge)}
              onChange={(val) => handleUpdate('port_of_discharge', val, 'portOfDischarge')}
            />
            <EditableDocCell
              label="Place of Delivery"
              value={getVal('place_of_delivery', shipmentJson.placeOfDelivery || shipmentJson.finalDestination || shipmentJson.portOfDischarge)}
              onChange={(val) => handleUpdate('place_of_delivery', val, 'placeOfDelivery')}
            />
          </div>

          {/* Row 4: Cargo Specifications, Marks, Packages & Goods Description */}
          <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-900">
            {/* Marks & Numbers */}
            <div className="md:col-span-3">
              <EditableDocCell
                label="Marks & Numbers"
                value={getVal('marks_and_numbers', shipmentJson.shippingMarks)}
                onChange={(val) => handleUpdate('marks_and_numbers', val, 'shippingMarks')}
                multiline
                rows={6}
              />
            </div>

            {/* Packages & Commodity Description */}
            <div className="md:col-span-6 p-2 flex flex-col space-y-1.5 bg-white">
              <span className="text-[8px] font-bold text-slate-700 uppercase tracking-wider">
                Number and Kind of Packages; Description of Cargo
              </span>

              {/* Package Summary Line */}
              <div className="p-1.5 bg-slate-100 rounded text-[10px] font-mono font-bold text-slate-900 flex items-center justify-between">
                <span>
                  {shipmentJson.totalBoxes || shipmentJson.totalPackages} BOXES PACKED ON {shipmentJson.pallets.length || shipmentJson.totalPallets} PALLETS
                </span>
                <span className="text-[9px] text-slate-600">STC (Said To Contain)</span>
              </div>

              {/* Hazardous Regulatory Summary Line if DG */}
              {shipmentJson.unNumber && (
                <div className="p-1.5 bg-amber-50 border border-amber-300 rounded text-[9.5px] font-mono text-slate-900">
                  <span className="font-bold">UN {shipmentJson.unNumber} &bull; CLASS {shipmentJson.imoClass || '8'}</span>
                  {shipmentJson.properShippingName && (
                    <span className="font-extrabold text-blue-900 block mt-0.5">
                      {shipmentJson.properShippingName}
                    </span>
                  )}
                </div>
              )}

              {/* Commercial Cargo Description */}
              <textarea
                rows={3}
                value={getVal('cargo_description', shipmentJson.productDescription)}
                onChange={(e) => handleUpdate('cargo_description', e.target.value, 'productDescription')}
                placeholder="Description of commercial commodity..."
                className="w-full bg-slate-50 border border-slate-300 rounded p-1 text-[10px] font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            {/* Gross Weight & CBM */}
            <div className="md:col-span-3 flex flex-col divide-y divide-slate-900">
              <EditableDocCell
                label="Gross Weight (kg)"
                value={getVal(
                  'gross_weight_kg',
                  shipmentJson.grossWeightKg > 0 ? `${shipmentJson.grossWeightKg.toLocaleString()} KGS` : ''
                )}
                onChange={(val) => {
                  handleUpdate('gross_weight_kg', val, 'grossWeightKg');
                }}
              />
              <EditableDocCell
                label="Net Weight (kg)"
                value={getVal(
                  'net_weight_kg',
                  shipmentJson.netWeightKg > 0 ? `${shipmentJson.netWeightKg.toLocaleString()} KGS` : ''
                )}
                onChange={(val) => {
                  handleUpdate('net_weight_kg', val, 'netWeightKg');
                }}
              />
              <EditableDocCell
                label="Measurement (CBM)"
                value={getVal(
                  'volume_cbm',
                  shipmentJson.volumeCbm > 0 ? `${shipmentJson.volumeCbm.toFixed(3)} M³` : ''
                )}
                onChange={(val) => handleUpdate('volume_cbm', val, 'volumeCbm')}
              />
            </div>
          </div>

          {/* Row 5: 5-Column Container Summary Table & SOLAS Verified Gross Mass (VGM) */}
          <div className="p-3 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-bold text-slate-700 uppercase tracking-wider">
                Equipment Summary &amp; SOLAS Verified Gross Mass (VGM)
              </span>
              <span className="text-[8px] font-mono text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-300">
                SOLAS Chapter VI Reg 2 Verified
              </span>
            </div>

            <div className="border border-slate-900 bg-white text-[10px] font-mono">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-900 text-slate-800 text-[8.5px] uppercase font-bold">
                    <th className="px-2.5 py-1.5">Container No. &amp; Seal</th>
                    <th className="px-2.5 py-1.5 w-28">Type &amp; Size</th>
                    <th className="px-2.5 py-1.5 w-28 text-right">Tare Mass</th>
                    <th className="px-2.5 py-1.5 w-32 text-right">Cargo Gross</th>
                    <th className="px-2.5 py-1.5 w-36 text-right bg-emerald-50 text-emerald-950 font-extrabold">
                      VGM (incl. tare)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-2.5 py-1.5 font-bold text-slate-900">
                      {shipmentJson.containerNumber
                        ? `${shipmentJson.containerNumber} / SEAL: ${shipmentJson.sealNumber || ''}`
                        : '—'}
                    </td>
                    <td className="px-2.5 py-1.5 text-slate-700">
                      {shipmentJson.containerType || '20GP'}
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-semibold text-slate-800">
                      {shipmentJson.tareWeightKg > 0 ? `${shipmentJson.tareWeightKg.toLocaleString()} kg` : '—'}
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-semibold text-slate-800">
                      {shipmentJson.grossWeightKg.toLocaleString()} kg
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-extrabold text-emerald-950 bg-emerald-50">
                      {calculatedVgm > 0 ? `${calculatedVgm.toLocaleString()} kg` : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Row 6: Freight, Movement, Clauses & Endorsement */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-900">
            <EditableDocCell
              label="Freight Terms"
              value={getVal('freight_terms', shipmentJson.freightTerms || 'FREIGHT PREPAID')}
              onChange={(val) => handleUpdate('freight_terms', val, 'freightTerms')}
            />
            <EditableDocCell
              label="Movement Type"
              value={getVal('movement_type', shipmentJson.movementType || 'FCL / FCL')}
              onChange={(val) => handleUpdate('movement_type', val, 'movementType')}
            />
            <EditableDocCell
              label="Free Time Clause"
              value={getVal('free_time_clause', shipmentJson.freeTimeClause || '14 DAYS DETENTION FREE AT DESTINATION')}
              onChange={(val) => handleUpdate('free_time_clause', val, 'freeTimeClause')}
              stage2Key="freeTimeClause"
            />
            <EditableDocCell
              label="Number of Original B/Ls"
              value={getVal('number_of_original_bls', 'THREE (3)')}
              onChange={(val) => handleUpdate('number_of_original_bls', val)}
            />
          </div>
        </div>
      </div>

      {/* =========================================================================
          PAGE 2: PALLET BREAKDOWN ANNEX TABLE
          ========================================================================= */}
      <div className="bg-white text-slate-900 shadow-2xl border-2 border-slate-900 rounded-sm p-6 sm:p-8 font-sans">
        <div className="flex items-center justify-between pb-3 border-b-2 border-slate-900 mb-4">
          <div>
            <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-tight text-slate-950">
              ANNEX: PALLET-LEVEL PACKAGING &amp; WEIGHT BREAKDOWN TABLE
            </h2>
            <p className="text-[9px] text-slate-600 font-medium">
              Itemized cargo manifest breakdown attached to and forming part of Bill of Lading
            </p>
          </div>

          <button
            type="button"
            onClick={handleAddPalletRow}
            className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold flex items-center space-x-1 shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Add Pallet Row</span>
          </button>
        </div>

        <div className="border border-slate-900 overflow-x-auto text-[10px] font-mono">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-900 text-slate-800 text-[9px] uppercase font-bold">
                <th className="px-2.5 py-2 w-16">Pallet #</th>
                <th className="px-2.5 py-2">Model / Product Description</th>
                <th className="px-2.5 py-2 w-24 text-right">Boxes</th>
                <th className="px-2.5 py-2 w-32 text-right">Gross Wt (kg)</th>
                <th className="px-2.5 py-2 w-32 text-right">Net Wt (kg)</th>
                <th className="px-2.5 py-2 w-16 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300">
              {shipmentJson.pallets.map((p, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="px-2.5 py-1">
                    <input
                      type="text"
                      value={p.palletNumber}
                      onChange={(e) => handlePalletChange(idx, 'palletNumber', e.target.value)}
                      className="w-full bg-transparent font-bold text-slate-900 border-0 p-0 focus:outline-none focus:ring-1 focus:ring-sky-500 rounded"
                    />
                  </td>
                  <td className="px-2.5 py-1">
                    <input
                      type="text"
                      value={p.modelCode}
                      onChange={(e) => handlePalletChange(idx, 'modelCode', e.target.value)}
                      className="w-full bg-transparent text-slate-800 border-0 p-0 focus:outline-none focus:ring-1 focus:ring-sky-500 rounded"
                    />
                  </td>
                  <td className="px-2.5 py-1 text-right">
                    <input
                      type="number"
                      value={p.boxCount || ''}
                      onChange={(e) => handlePalletChange(idx, 'boxCount', e.target.value)}
                      className="w-full bg-transparent font-semibold text-right text-slate-900 border-0 p-0 focus:outline-none focus:ring-1 focus:ring-sky-500 rounded"
                    />
                  </td>
                  <td className="px-2.5 py-1 text-right">
                    <input
                      type="number"
                      value={p.grossWeightKg || ''}
                      onChange={(e) => handlePalletChange(idx, 'grossWeightKg', e.target.value)}
                      className="w-full bg-transparent font-semibold text-right text-slate-900 border-0 p-0 focus:outline-none focus:ring-1 focus:ring-sky-500 rounded"
                    />
                  </td>
                  <td className="px-2.5 py-1 text-right">
                    <input
                      type="number"
                      value={p.netWeightKg || ''}
                      onChange={(e) => handlePalletChange(idx, 'netWeightKg', e.target.value)}
                      className="w-full bg-transparent font-semibold text-right text-slate-900 border-0 p-0 focus:outline-none focus:ring-1 focus:ring-sky-500 rounded"
                    />
                  </td>
                  <td className="px-2.5 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => handleDeletePalletRow(idx)}
                      className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                      title="Delete Pallet"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-900 font-extrabold text-[10px] text-slate-950">
                <td colSpan={2} className="px-2.5 py-2">
                  TOTALS ({shipmentJson.pallets.length} Pallets)
                </td>
                <td className="px-2.5 py-2 text-right">
                  {shipmentJson.totalBoxes.toLocaleString()} Boxes
                </td>
                <td className="px-2.5 py-2 text-right text-emerald-800">
                  {shipmentJson.grossWeightKg.toLocaleString()} KGS
                </td>
                <td className="px-2.5 py-2 text-right">
                  {shipmentJson.netWeightKg.toLocaleString()} KGS
                </td>
                <td className="px-2.5 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
