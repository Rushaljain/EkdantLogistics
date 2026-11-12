import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ExtractedShipmentJSON, ExtractedPallet } from '../types/index.ts';
import { EditableDocCell } from './EditableDocCell.tsx';
import { buildImoBox14CargoBlock } from '../utils/manifestKeywordReference.ts';

interface DgDocumentCanvasProps {
  shipmentJson: ExtractedShipmentJSON;
  onUpdateShipment: (updated: ExtractedShipmentJSON) => void;
  onFieldChange: (fieldId: string, newValue: string) => void;
  customOverrides: Record<string, string>;
}

export function DgDocumentCanvas({
  shipmentJson,
  onUpdateShipment,
  onFieldChange,
  customOverrides
}: DgDocumentCanvasProps): React.JSX.Element {
  const [showPalletAnnex, setShowPalletAnnex] = useState(false);
  // Helper to read field value prioritizing custom override -> shipment state
  const getVal = (overrideKey: string, fallbackVal: string): string => {
    if (customOverrides[overrideKey] !== undefined) {
      return customOverrides[overrideKey];
    }
    return fallbackVal || '';
  };

  // Two-way sync: updates both the manifest override AND underlying canonical shipment state
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

  // Live VGM Calculation: Gross + Tare
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

    // Recalculate totals
    const totalBoxes = updatedPallets.reduce((sum, p) => sum + (p.boxCount || 0), 0);
    const grossWeight = updatedPallets.reduce((sum, p) => sum + (p.grossWeightKg || 0), 0);
    const netWeight = updatedPallets.reduce((sum, p) => sum + (p.netWeightKg || 0), 0);

    // Update synthesized pallet range in marks
    const palletNumbers = updatedPallets
      .map((p) => p.palletNumber)
      .filter(Boolean);
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
      {/* Top Controls: Pallet Annex Toggle */}
      <div className="flex items-center justify-end px-1">
        <label className="flex items-center space-x-2 cursor-pointer text-xs font-semibold text-slate-700 select-none bg-white px-3 py-1.5 rounded border border-slate-300 shadow-sm hover:bg-slate-50 transition-colors">
          <input
            type="checkbox"
            checked={showPalletAnnex}
            onChange={(e) => setShowPalletAnnex(e.target.checked)}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
          />
          <span>Include Pallet Annex Table (Page 2)</span>
        </label>
      </div>

      {/* =========================================================================
          PAGE 1: SOLAS 74 IMO MULTIMODAL DANGEROUS GOODS DECLARATION (BOXES 1-22)
          ========================================================================= */}
      <div className="bg-white text-slate-900 shadow-2xl border-2 border-slate-900 rounded-sm p-6 sm:p-8 font-sans">
        {/* Document Header */}
        <div className="border-b-2 border-slate-900 pb-2 mb-3 text-center">
          <h1 className="text-sm sm:text-base font-extrabold uppercase tracking-tight text-slate-950">
            MULTIMODAL DANGEROUS GOODS DECLARATION
          </h1>
          <p className="text-[9px] text-slate-600 font-medium">
            This form meets the requirements of SOLAS 74, chapter VII, reg 5.4; MARPOL 73/78, Annex III, reg 4
          </p>
        </div>

        {/* 22 IMO Boxes Grid */}
        <div className="border border-slate-900 divide-y divide-slate-900 text-[10px]">
          {/* Top Half: 2 Columns 50% Left / 50% Right */}
          <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-900">
            {/* Left Column (50% / col-span-6) */}
            <div className="md:col-span-6 flex flex-col divide-y divide-slate-900">
              <EditableDocCell
                boxNumber="1"
                label="Shipper / Consignor / Sender"
                value={getVal(
                  'box_1_shipper',
                  `${shipmentJson.shipperName}\n${shipmentJson.shipperAddress}${
                    shipmentJson.shipperIec ? `\nIEC: ${shipmentJson.shipperIec}` : ''
                  }${shipmentJson.shipperGstin ? `\nGSTIN: ${shipmentJson.shipperGstin}` : ''}`
                )}
                onChange={(val) => handleUpdate('box_1_shipper', val, 'shipperAddress')}
                multiline
                rows={3}
              />
              <EditableDocCell
                boxNumber="6"
                label="Consignee"
                value={getVal('box_6_consignee', `${shipmentJson.consigneeName}\n${shipmentJson.consigneeAddress}`)}
                onChange={(val) => handleUpdate('box_6_consignee', val, 'consigneeAddress')}
                multiline
                rows={3}
              />
              <EditableDocCell
                boxNumber="7"
                label="Carrier"
                value={getVal('box_7_carrier', shipmentJson.carrierName)}
                onChange={(val) => handleUpdate('box_7_carrier', val, 'carrierName')}
                stage2Key="carrierName"
                placeholder="e.g. Carrier Name"
              />
              <div className="p-2 bg-slate-50">
                <span className="text-[8px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  8. This shipment is within the limitations prescribed for:
                </span>
                <div className="text-[9px] font-semibold text-slate-800">
                  [ PASSENGER AND CARGO AIRCRAFT &nbsp;&bull;&nbsp; CARGO AIRCRAFT ONLY ]
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-900">
                <EditableDocCell
                  boxNumber="10"
                  label="Vessel and voy"
                  value={getVal(
                    'box_10_vessel_and_voyage_number',
                    shipmentJson.vesselName
                      ? (shipmentJson.voyageNumber ? `${shipmentJson.vesselName} / ${shipmentJson.voyageNumber}` : shipmentJson.vesselName)
                      : ''
                  )}
                  onChange={(val) => handleUpdate('box_10_vessel_and_voyage_number', val, 'vesselName')}
                  stage2Key="vesselVoyage"
                  placeholder="e.g. Vessel / Voy"
                />
                <EditableDocCell
                  boxNumber="11"
                  label="Port of loading"
                  value={getVal('box_11_port_of_loading', shipmentJson.portOfLoading)}
                  onChange={(val) => handleUpdate('box_11_port_of_loading', val, 'portOfLoading')}
                />
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-900">
                <EditableDocCell
                  boxNumber="12"
                  label="Port of discharge"
                  value={getVal('box_12_port_of_discharge', shipmentJson.portOfDischarge)}
                  onChange={(val) => handleUpdate('box_12_port_of_discharge', val, 'portOfDischarge')}
                />
                <EditableDocCell
                  boxNumber="13"
                  label="Destination"
                  value={getVal('box_13_destination', shipmentJson.finalDestination || shipmentJson.portOfDischarge)}
                  onChange={(val) => handleUpdate('box_13_destination', val, 'finalDestination')}
                />
              </div>
            </div>

            {/* Right Column (50% / col-span-6) */}
            <div className="md:col-span-6 flex flex-col divide-y divide-slate-900">
              <EditableDocCell
                boxNumber="2"
                label="Transport Document Number"
                value={getVal('box_2_transport_document_number', shipmentJson.bookingNumber)}
                onChange={(val) => handleUpdate('box_2_transport_document_number', val, 'bookingNumber')}
                stage2Key="bookingNumber"
              />
              <div className="grid grid-cols-2 divide-x divide-slate-900">
                <EditableDocCell
                  boxNumber="3"
                  label="Page 1 of 1"
                  value={getVal('box_3_page_of_page', '1 OF 1')}
                  onChange={(val) => handleUpdate('box_3_page_of_page', val)}
                />
                <EditableDocCell
                  boxNumber="4"
                  label="Shipper's reference"
                  value={getVal('box_4_shipper_reference', shipmentJson.shipperReference || shipmentJson.invoiceNumbers[0])}
                  onChange={(val) => handleUpdate('box_4_shipper_reference', val, 'shipperReference')}
                />
              </div>
              <EditableDocCell
                boxNumber="5"
                label="Freight Forwarder's reference"
                value={getVal('box_5_freight_forwarder_reference', shipmentJson.forwarderReference)}
                onChange={(val) => handleUpdate('box_5_freight_forwarder_reference', val, 'forwarderReference')}
              />
              <div className="p-2 bg-slate-50 flex-1">
                <span className="text-[8px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  SHIPPER'S DECLARATION
                </span>
                <p className="text-[8px] leading-tight text-slate-600">
                  I hereby declare that the contents of this consignment are fully and accurately described below by the proper shipping name(s), and are classified, packaged, marked and labelled/placarded, and are in all respects in proper condition for transport according to the applicable international and national governmental regulations.
                </p>
              </div>
              <EditableDocCell
                boxNumber="9"
                label="Additional handling information"
                value={getVal(
                  'box_9_place_of_receipt',
                  shipmentJson.emergencyContactPhone ? `EMERGENCY CONTACT NUMBER: ${shipmentJson.emergencyContactPhone}` : ''
                )}
                onChange={(val) => handleUpdate('box_9_place_of_receipt', val, 'emergencyContactPhone')}
                stage2Key="emergencyContactPhone"
                placeholder="EMERGENCY CONTACT NUMBER: +91 ..."
              />
            </div>
          </div>

          {/* Center Cargo Table (Unified Wide Box 14 + 3 Weight Columns) */}
          <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-900">
            {/* Box 14: Shipping Marks | *Number and kind of packages; description of goods */}
            <div className="md:col-span-8 p-2 bg-white flex flex-col space-y-1.5">
              <span className="text-[8px] font-bold text-slate-700 uppercase tracking-wider">
                14. Shipping Marks | *Number and kind of packages; description of goods
              </span>
              <textarea
                rows={9}
                value={getVal('box_14_shipping_marks', buildImoBox14CargoBlock(shipmentJson))}
                onChange={(e) => handleUpdate('box_14_shipping_marks', e.target.value, 'shippingMarks')}
                className="w-full bg-slate-50 border border-slate-300 rounded p-1.5 text-[9px] font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 leading-tight"
              />
            </div>

            {/* Boxes 16, 17, 18: Masses & Cube */}
            <div className="md:col-span-4 flex flex-col divide-y divide-slate-900">
              <EditableDocCell
                boxNumber="16"
                label="Gross Mass (kg)"
                value={getVal(
                  'box_16_gross_mass_kg',
                  shipmentJson.grossWeightKg > 0 ? `${shipmentJson.grossWeightKg.toLocaleString()} KGS` : ''
                )}
                onChange={(val) => {
                  handleUpdate('box_16_gross_mass_kg', val, 'grossWeightKg');
                }}
              />
              <EditableDocCell
                boxNumber="17"
                label="Net Mass (kgs)"
                value={getVal(
                  'box_17_net_mass_kg',
                  shipmentJson.netWeightKg > 0 ? `${shipmentJson.netWeightKg.toLocaleString()} KGS` : ''
                )}
                onChange={(val) => {
                  handleUpdate('box_17_net_mass_kg', val, 'netWeightKg');
                }}
              />
              <EditableDocCell
                boxNumber="18"
                label="Cube (m³)"
                value={getVal(
                  'box_18_cube_m3',
                  shipmentJson.volumeCbm > 0 ? `${shipmentJson.volumeCbm.toFixed(3)} M³` : ''
                )}
                onChange={(val) => handleUpdate('box_18_cube_m3', val, 'volumeCbm')}
              />
            </div>
          </div>

          {/* Official IMO Equipment Row (Boxes 15, 16, 17, 18, 19) */}
          <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-y md:divide-y-0 divide-slate-900 bg-slate-50">
            <EditableDocCell
              boxNumber="15"
              label="Container identification no."
              value={getVal('box_19_container_and_seal_number', shipmentJson.containerNumber)}
              onChange={(val) => handleUpdate('box_19_container_and_seal_number', val, 'containerNumber')}
              stage2Key="containerNumber"
              placeholder="e.g. Container No"
            />
            <EditableDocCell
              boxNumber="16"
              label="Seal number(s)"
              value={getVal('box_16_seal_number', shipmentJson.sealNumber)}
              onChange={(val) => handleUpdate('box_16_seal_number', val, 'sealNumber')}
              stage2Key="sealNumber"
              placeholder="e.g. Seal No"
            />
            <EditableDocCell
              boxNumber="17"
              label="Container size & type"
              value={getVal('box_17_container_size_type', shipmentJson.containerType || "20' GP")}
              onChange={(val) => handleUpdate('box_17_container_size_type', val, 'containerType')}
            />
            <EditableDocCell
              boxNumber="18"
              label="Tare mass (kg)"
              value={getVal(
                'box_19_tare_mass_kg',
                shipmentJson.tareWeightKg > 0 ? `${shipmentJson.tareWeightKg.toLocaleString()} KGS` : ''
              )}
              onChange={(val) => {
                handleUpdate('box_19_tare_mass_kg', val, 'tareWeightKg');
              }}
              stage2Key="tareWeightKg"
              placeholder="e.g. 2150 KGS"
            />
            <div className="p-2 bg-emerald-50/80 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[8px] font-bold text-emerald-900 uppercase tracking-wider">
                    19. Total gross (incl. tare) (kg)
                  </span>
                  <span className="text-[7.5px] font-mono font-bold text-emerald-700 bg-emerald-200/80 px-1 py-0.2 rounded border border-emerald-400">
                    SOLAS VGM Live
                  </span>
                </div>
                <div className="text-xs font-mono font-extrabold text-emerald-950 mt-1">
                  {calculatedVgm > 0 ? `${calculatedVgm.toLocaleString()} KGS` : '—'}
                </div>
              </div>
              <div className="text-[8px] font-mono text-emerald-700 mt-1">
                Cargo ({shipmentJson.grossWeightKg.toLocaleString()} kg) + Tare ({shipmentJson.tareWeightKg.toLocaleString()} kg)
              </div>
            </div>
          </div>

          {/* Bottom Signature Row (Boxes 20, 21, 22) */}
          <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-900">
            {/* Box 20: Container Packing Certificate */}
            <div className="md:col-span-4 p-2 bg-white flex flex-col justify-between">
              <div>
                <span className="text-[8px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  20. CONTAINER / VEHICLE PACKING CERTIFICATE
                </span>
                <p className="text-[8px] leading-tight text-slate-500 mb-2">
                  I hereby declare that the goods described above have been packed/loaded into the container/vehicle identified above in accordance with the applicable provisions.
                </p>
                <EditableDocCell
                  boxNumber="20"
                  label="Name / Status of Declarant & Date"
                  value={getVal(
                    'box_20_container_packing_certificate',
                    `${shipmentJson.dgDeclarantName || 'AUTHORIZED SIGNATORY'}\n${shipmentJson.dgDeclarationPlaceAndDate || ''}`
                  )}
                  onChange={(val) => handleUpdate('box_20_container_packing_certificate', val, 'dgDeclarantName')}
                  multiline
                  rows={2}
                />
              </div>
              <div className="border-t border-dotted border-slate-400 pt-1 mt-2 text-[8px] text-slate-500">
                Signature of Declarant
              </div>
            </div>

            {/* Box 21: Receiving Organization Receipt */}
            <div className="md:col-span-4 p-2 bg-slate-50 flex flex-col justify-between">
              <div>
                <span className="text-[8px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  21. RECEIVING ORGANIZATION RECEIPT
                </span>
                <p className="text-[8px] leading-tight text-slate-500 mb-2">
                  Received the above number of packages/containers in apparent good order and condition.
                </p>
                <div className="text-[8.5px] text-slate-600 space-y-1">
                  <div>Haulier: <span className="border-b border-dotted border-slate-400 inline-block w-24">&nbsp;</span></div>
                  <div>Vehicle Reg No: <span className="border-b border-dotted border-slate-400 inline-block w-20">&nbsp;</span></div>
                </div>
              </div>
              <div className="border-t border-dotted border-slate-400 pt-1 mt-2 text-[8px] text-slate-500">
                Driver's Signature
              </div>
            </div>

            {/* Box 22: Shipper's Declaration */}
            <div className="md:col-span-4 p-2 bg-white flex flex-col justify-between">
              <div>
                <span className="text-[8px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  22. SHIPPER'S DECLARATION
                </span>
                <p className="text-[8px] leading-tight text-slate-500 mb-2">
                  I hereby declare that the contents of this consignment are fully and accurately described above by the proper shipping name, and are classified, packaged, marked and labeled/placarded and are in all respects in proper condition for transport according to the applicable international and national governmental regulations.
                </p>
                <EditableDocCell
                  boxNumber="22"
                  label="Company Name, Declarant & Date"
                  value={getVal(
                    'box_22_declarant_details_and_signature',
                    `${shipmentJson.shipperName || ''}\n${shipmentJson.dgDeclarantName || 'AUTHORIZED SIGNATORY'}\n${shipmentJson.dgDeclarationPlaceAndDate || ''}`
                  )}
                  onChange={(val) => handleUpdate('box_22_declarant_details_and_signature', val, 'dgDeclarantName')}
                  multiline
                  rows={2}
                />
              </div>
              <div className="border-t border-dotted border-slate-400 pt-1 mt-2 text-[8px] text-slate-500">
                Signature of Declarant
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          PAGE 2: PALLET-LEVEL PACKAGING & WEIGHT BREAKDOWN ANNEX TABLE
          ========================================================================= */}
      {showPalletAnnex && (
        <div className="bg-white text-slate-900 shadow-2xl border-2 border-slate-900 rounded-sm p-6 sm:p-8 font-sans">
          <div className="flex items-center justify-between pb-3 border-b-2 border-slate-900 mb-4">
            <div>
              <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-tight text-slate-950">
                ANNEX: PALLET-LEVEL PACKAGING &amp; WEIGHT BREAKDOWN TABLE
              </h2>
              <p className="text-[9px] text-slate-600 font-medium">
                Itemized package verification matching Box 14 pallet ranges
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

          {/* Pallets Table */}
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
      )}
    </div>
  );
}
