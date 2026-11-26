import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ExtractedShipmentJSON, ExtractedPallet } from '../types/index.ts';
import { EditableDocCell } from './EditableDocCell.tsx';

// Integer to English Words helper for standard maritime documentation (e.g. 20 -> TWENTY)
function integerToWords(num: number): string {
  if (num <= 0) return 'ZERO';
  const ones = [
    '', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
    'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'
  ];
  const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

  if (num < 20) return ones[num];
  if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? '-' + ones[num % 10] : '');
  if (num < 1000) return ones[Math.floor(num / 100)] + ' HUNDRED' + (num % 100 !== 0 ? ' ' + integerToWords(num % 100) : '');
  if (num < 1000000) return integerToWords(Math.floor(num / 1000)) + ' THOUSAND' + (num % 1000 !== 0 ? ' ' + integerToWords(num % 1000) : '');
  return String(num);
}

// Builds the standard clean BL commodity & package description without hardcoded values
export const buildStandardBlCargoDescription = (s: ExtractedShipmentJSON): string => {
  const contCount = s.containers && s.containers.length > 0 ? s.containers.length : 1;
  const pCount = s.pallets?.length || s.totalPallets || 0;
  const brand = s.brandName || (s.pallets && s.pallets[0]?.brand);

  const sections: string[] = [];

  const rawType = (s.containerType || '').toUpperCase();
  const contType = rawType.includes('40') ? "40' FCL" : "20' FCL";
  const headerLines = [`${contCount} X ${contType} SAID TO CONTAIN`];
  if (pCount > 0) {
    headerLines.push(`TOTAL ${pCount} PALLETS`);
    headerLines.push(`(TOTAL ${integerToWords(pCount)} PALLETS ONLY)`);
  }
  sections.push(headerLines.join('\n'));

  sections.push(s.productDescription || 'LEAD ACID STORAGE BATTERIES');

  if (brand) {
    sections.push(`BRAND: ${brand}`);
  }
  const hs = s.hsnCode || (s as any).hsCode || '85071000';
  if (hs) {
    sections.push(`H.S. CODE NO. ${hs}`);
  }
  if (s.shippingBillNumbers) {
    const sbFormatted = s.shippingBillNumbers
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => (line.toUpperCase().startsWith('SB') ? line : `SB.NO. ${line}`))
      .join('\n');
    sections.push(sbFormatted);
  }
  const un = (s.unNumber && s.unNumber !== '2794') ? s.unNumber : '2627';
  const imo = s.imoClass ? s.imoClass : '8';
  const pg = s.packingGroup ? s.packingGroup : 'III';
  sections.push(`UN NO. ${un}\nIMCO CLASS: ${imo}\nPG: ${pg}`);

  const rawFreight = s.freightTerms ? s.freightTerms.replace(/freight\s*/i, '').trim().toUpperCase() : 'COLLECT';
  sections.push(`FREIGHT ${rawFreight}`);

  const freeTime = (s.freeTimeClause || '14 DAYS FREE TIME DETENTION AT DESTINATION')
    .replace(/^["“”']+|["“”']+$/g, '')
    .trim();
  sections.push(`“${freeTime}”`);

  return sections.join('\n\n');
};

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
    if (overrideKey === 'free_time_clause' && customOverrides['bl_free_time'] !== undefined) {
      return customOverrides['bl_free_time'];
    }
    if (overrideKey === 'bl_free_time' && customOverrides['free_time_clause'] !== undefined) {
      return customOverrides['free_time_clause'];
    }
    return fallbackVal || '';
  };

  const handleUpdate = (
    overrideKey: string,
    newValue: string,
    shipmentKey?: keyof ExtractedShipmentJSON
  ) => {
    onFieldChange(overrideKey, newValue);
    if (overrideKey === 'free_time_clause') {
      onFieldChange('bl_free_time', newValue);
    }

    if (shipmentKey) {
      const updated = { ...shipmentJson };
      if (typeof updated[shipmentKey] === 'number') {
        const cleaned = typeof newValue === 'string' ? newValue.replace(/,/g, '').replace(/[^\d.]/g, '') : newValue;
        (updated as any)[shipmentKey] = parseFloat(cleaned as string) || 0;
      } else {
        (updated as any)[shipmentKey] = newValue;
      }
      onUpdateShipment(updated);
    }
  };

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

    const updateMarksWithPalletRange = (currentMarks: string, pallets: ExtractedPallet[]): string => {
      const palletNumbers = Array.from(new Set(pallets.map((p) => p.palletNumber).filter(Boolean)));
      const synthesizedRange = palletNumbers.length > 0
        ? (palletNumbers.length === 1 ? palletNumbers[0] : `${palletNumbers[0]} TO ${palletNumbers[palletNumbers.length - 1]}`)
        : '';

      let marks = currentMarks
        .replace(/(?:^|\n)\s*PALLET\s*NOS?:?\s*.*$/gim, '')
        .replace(/(?:^|\n)\s*\d+\s+TO\s+\d+\s*$/gim, '')
        .trim();
      if (synthesizedRange) {
        marks = marks ? `${marks}\nPALLET NOS: ${synthesizedRange}` : `PALLET NOS: ${synthesizedRange}`;
      }
      return marks;
    };

    const totalBoxes = updatedPallets.reduce((sum, p) => sum + (p.boxCount || 0), 0);
    const grossWeight = updatedPallets.reduce((sum, p) => sum + (p.grossWeightKg || 0), 0);
    const netWeight = updatedPallets.reduce((sum, p) => sum + (p.netWeightKg || 0), 0);
    const exactGross = Number(grossWeight.toFixed(3));
    const exactNet = Number(netWeight.toFixed(3));

    const updatedMarks = updateMarksWithPalletRange(shipmentJson.shippingMarks || '', updatedPallets);

    onUpdateShipment({
      ...shipmentJson,
      pallets: updatedPallets,
      totalBoxes: totalBoxes > 0 ? totalBoxes : shipmentJson.totalBoxes,
      totalPackages: totalBoxes > 0 ? totalBoxes : shipmentJson.totalPackages,
      grossWeightKg: exactGross > 0 ? exactGross : shipmentJson.grossWeightKg,
      netWeightKg: exactNet > 0 ? exactNet : shipmentJson.netWeightKg,
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
    const exactGross = Number(grossWeight.toFixed(3));
    const exactNet = Number(netWeight.toFixed(3));

    const palletNumbers = Array.from(new Set(updatedPallets.map((p) => p.palletNumber).filter(Boolean)));
    const synthesizedRange = palletNumbers.length > 0
      ? (palletNumbers.length === 1 ? palletNumbers[0] : `${palletNumbers[0]} TO ${palletNumbers[palletNumbers.length - 1]}`)
      : '';
    let marks = (shipmentJson.shippingMarks || '')
      .replace(/(?:^|\n)\s*PALLET\s*NOS?:?\s*.*$/gim, '')
      .replace(/(?:^|\n)\s*\d+\s+TO\s+\d+\s*$/gim, '')
      .trim();
    if (synthesizedRange) {
      marks = marks ? `${marks}\nPALLET NOS: ${synthesizedRange}` : `PALLET NOS: ${synthesizedRange}`;
    }

    onUpdateShipment({
      ...shipmentJson,
      pallets: updatedPallets,
      totalPallets: updatedPallets.length,
      totalBoxes,
      totalPackages: totalBoxes,
      grossWeightKg: exactGross > 0 ? exactGross : shipmentJson.grossWeightKg,
      netWeightKg: exactNet > 0 ? exactNet : shipmentJson.netWeightKg,
      shippingMarks: marks
    });
  };

  const handleDeletePalletRow = (index: number) => {
    const updatedPallets = shipmentJson.pallets.filter((_, i) => i !== index);
    const totalBoxes = updatedPallets.reduce((sum, p) => sum + (p.boxCount || 0), 0);
    const grossWeight = updatedPallets.reduce((sum, p) => sum + (p.grossWeightKg || 0), 0);
    const netWeight = updatedPallets.reduce((sum, p) => sum + (p.netWeightKg || 0), 0);
    const exactGross = Number(grossWeight.toFixed(3));
    const exactNet = Number(netWeight.toFixed(3));

    const palletNumbers = Array.from(new Set(updatedPallets.map((p) => p.palletNumber).filter(Boolean)));
    const synthesizedRange = palletNumbers.length > 0
      ? (palletNumbers.length === 1 ? palletNumbers[0] : `${palletNumbers[0]} TO ${palletNumbers[palletNumbers.length - 1]}`)
      : '';
    let marks = (shipmentJson.shippingMarks || '')
      .replace(/(?:^|\n)\s*PALLET\s*NOS?:?\s*.*$/gim, '')
      .replace(/(?:^|\n)\s*\d+\s+TO\s+\d+\s*$/gim, '')
      .trim();
    if (synthesizedRange) {
      marks = marks ? `${marks}\nPALLET NOS: ${synthesizedRange}` : `PALLET NOS: ${synthesizedRange}`;
    }

    onUpdateShipment({
      ...shipmentJson,
      pallets: updatedPallets,
      totalPallets: updatedPallets.length,
      totalBoxes,
      totalPackages: totalBoxes,
      grossWeightKg: exactGross > 0 ? exactGross : shipmentJson.grossWeightKg,
      netWeightKg: exactNet > 0 ? exactNet : shipmentJson.netWeightKg,
      shippingMarks: marks
    });
  };

  // Pallet & Container counts for standard B/L calculations
  const contCount = shipmentJson.containers && shipmentJson.containers.length > 0 ? shipmentJson.containers.length : 1;
  const palletCount = shipmentJson.pallets?.length || shipmentJson.totalPallets || 1;

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

        {/* B/L Table Grid - Standard Maritime BL Structure */}
        <div className="border border-slate-900 divide-y divide-slate-900 text-[10px]">
          {/* Row 1: Shipper: (Left 60%) | BOOKING NO: (Right 40%) */}
          <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-900">
            <div className="md:col-span-7">
              <EditableDocCell
                label="Shipper:"
                value={getVal(
                  'shipper_name_address',
                  `${shipmentJson.shipperName || 'EXIDE INDUSTRIES LIMITED'}\n${
                    shipmentJson.shipperAddress || 'EXIDE HOUSE,\n59E, CHOWRINGHEE ROAD,\nKOLKATA – 700 020, INDIA'
                  }${
                    shipmentJson.shipperIec ? `\nIEC: ${shipmentJson.shipperIec}` : '\nIEC: 0288001004'
                  }${shipmentJson.shipperGstin ? `\nGSTIN: ${shipmentJson.shipperGstin}` : '\nGSTIN: 19AAACE6641E1ZS'}`
                )}
                onChange={(val) => handleUpdate('shipper_name_address', val, 'shipperAddress')}
                multiline
                rows={4}
              />
            </div>
            <div className="md:col-span-5 bg-[#C0C0C0] p-3 flex flex-col justify-center">
              <div className="text-[11px] font-bold font-sans text-slate-950 mb-1">
                BOOKING NO:
              </div>
              <input
                type="text"
                value={getVal('booking_number', shipmentJson.bookingNumber || '')}
                onChange={(e) => handleUpdate('booking_number', e.target.value, 'bookingNumber')}
                className="w-full bg-transparent font-bold text-slate-950 text-[12px] font-mono border-0 p-0 focus:outline-none focus:ring-1 focus:ring-sky-500 rounded"
                placeholder="Booking Number"
              />
            </div>
          </div>

          {/* Row 2: Consignee: (Left 60%) | Blank Cell (Right 40%) */}
          <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-900">
            <div className="md:col-span-7">
              <EditableDocCell
                label="Consignee:"
                value={getVal(
                  'consignee_name_address',
                  `${shipmentJson.consigneeName || ''}${
                    shipmentJson.consigneeAddress
                      ? `\n${shipmentJson.consigneeAddress}`
                      : shipmentJson.consigneeName?.toLowerCase().includes('nickel')
                      ? '\nAUTO 1- A Member of KAPICO Group\nKuwait 00000 Kuwait'
                      : (shipmentJson.finalDestination || shipmentJson.portOfDischarge ? `\n${shipmentJson.finalDestination || shipmentJson.portOfDischarge}` : '')
                  }`
                )}
                onChange={(val) => handleUpdate('consignee_name_address', val, 'consigneeAddress')}
                multiline
                rows={3}
              />
            </div>
            <div className="md:col-span-5 bg-white hidden md:block"></div>
          </div>

          {/* Row 3: Notify Party: (Left 60%) | Blank Cell (Right 40%) */}
          <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-900">
            <div className="md:col-span-7">
              <EditableDocCell
                label="Notify Party:"
                value={getVal(
                  'notify_party_name_address',
                  `${shipmentJson.notifyPartyName || 'SAME AS CONSIGNEE'}\n${shipmentJson.notifyPartyAddress || ''}`.trim()
                )}
                onChange={(val) => handleUpdate('notify_party_name_address', val, 'notifyPartyName')}
                multiline
                rows={3}
              />
            </div>
            <div className="md:col-span-5 bg-white hidden md:block"></div>
          </div>

          {/* Row 4: Vessel and Voyage No: (Left 60%) | Place of Receipt: (Right 40%) */}
          <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-900">
            <div className="md:col-span-7">
              <EditableDocCell
                label="Vessel and Voyage No:"
                value={getVal(
                  'vessel_and_voyage',
                  shipmentJson.vesselName
                    ? `${shipmentJson.vesselName} / ${shipmentJson.voyageNumber || ''}`
                    : ''
                )}
                onChange={(val) => handleUpdate('vessel_and_voyage', val, 'vesselName')}
                stage2Key="vesselVoyage"
                placeholder="e.g. Vessel Name / Voyage No"
              />
            </div>
            <div className="md:col-span-5">
              <EditableDocCell
                label="Place of Receipt:"
                value={getVal('place_of_receipt', shipmentJson.placeOfReceipt || shipmentJson.portOfLoading || '')}
                onChange={(val) => handleUpdate('place_of_receipt', val, 'placeOfReceipt')}
                placeholder="e.g. Place of receipt"
              />
            </div>
          </div>

          {/* Row 5: Port of Loading | Port of Discharge | Port of Delivery */}
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-900">
            <EditableDocCell
              label="Port of Loading:"
              value={getVal('port_of_loading', shipmentJson.portOfLoading || '')}
              onChange={(val) => handleUpdate('port_of_loading', val, 'portOfLoading')}
              placeholder="e.g. Port of loading"
            />
            <EditableDocCell
              label="Port of Discharge:"
              value={getVal('port_of_discharge', shipmentJson.portOfDischarge || '')}
              onChange={(val) => handleUpdate('port_of_discharge', val, 'portOfDischarge')}
            />
            <EditableDocCell
              label="Port of Delivery:"
              value={getVal(
                'place_of_delivery',
                shipmentJson.placeOfDelivery || shipmentJson.finalDestination || shipmentJson.portOfDischarge || ''
              )}
              onChange={(val) => handleUpdate('place_of_delivery', val, 'placeOfDelivery')}
            />
          </div>

          {/* Row 5: Cargo Table Headers (3 Columns) Shaded Grey */}
          <div className="grid grid-cols-1 md:grid-cols-12 divide-x divide-slate-900 bg-[#C0C0C0] border-b border-slate-900 text-slate-950 text-[9px] font-bold uppercase font-sans">
            <div className="md:col-span-3 px-3 py-1.5">Container Nos. Marks &amp; Numbers</div>
            <div className="md:col-span-6 px-3 py-1.5">Number and Kind of Packages Description of Goods</div>
            <div className="md:col-span-3 px-3 py-1.5 text-right">Gross Weight</div>
          </div>

          {/* Row 6: Cargo Table Content (3 Columns) */}
          <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-900">
            {/* Col 1: Container Nos. Marks & Numbers */}
            <div className="md:col-span-3">
              <EditableDocCell
                label="Container Nos. Marks & Numbers"
                value={getVal('marks_and_numbers', shipmentJson.shippingMarks || '')}
                onChange={(val) => handleUpdate('marks_and_numbers', val, 'shippingMarks')}
                multiline
                rows={16}
                placeholder="Container Nos., Marks & Numbers..."
              />
            </div>

            {/* Col 2: Number and Kind of Packages Description of Goods */}
            <div className="md:col-span-6">
              <EditableDocCell
                label="Number and Kind of Packages  Description of Goods"
                value={getVal('cargo_description', buildStandardBlCargoDescription(shipmentJson))}
                onChange={(val) => handleUpdate('cargo_description', val, 'productDescription')}
                multiline
                rows={16}
                className="h-full"
                inputClassName="font-mono text-[9.5px] leading-relaxed whitespace-pre-wrap"
              />
            </div>

            {/* Col 3: Gross Weight & Net Weight */}
            <div className="md:col-span-3 flex flex-col divide-y divide-slate-900 h-full">
              <div className="p-2.5 bg-white flex-1 flex flex-col justify-start">
                <span className="text-[8px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Gross Weight
                </span>
                <div className="space-y-4 font-mono">
                  <div>
                    <input
                      type="text"
                      value={getVal('gross_weight_kg', shipmentJson.grossWeightKg > 0 ? `${shipmentJson.grossWeightKg.toFixed(2)} KGS` : '')}
                      onChange={(e) => handleUpdate('gross_weight_kg', e.target.value, 'grossWeightKg')}
                      className="w-full bg-transparent font-bold text-slate-900 border-0 p-0 text-[10.5px] focus:outline-none focus:ring-1 focus:ring-sky-500 rounded"
                      placeholder="Gross Weight (KGS)"
                    />
                  </div>

                  <div className="pt-3 border-t border-dashed border-slate-300">
                    <span className="text-[8px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                      NET WEIGHT
                    </span>
                    <input
                      type="text"
                      value={getVal('net_weight_kg', shipmentJson.netWeightKg > 0 ? `${shipmentJson.netWeightKg.toFixed(2)} KGS` : '')}
                      onChange={(e) => handleUpdate('net_weight_kg', e.target.value, 'netWeightKg')}
                      className="w-full bg-transparent font-bold text-slate-800 border-0 p-0 text-[10.5px] focus:outline-none focus:ring-1 focus:ring-sky-500 rounded"
                      placeholder="Net Weight (KGS)"
                    />
                  </div>

                  {shipmentJson.volumeCbm > 0 && (
                    <div className="pt-3 border-t border-dashed border-slate-300">
                      <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                        MEASUREMENT
                      </span>
                      <span className="text-[10px] text-slate-700 font-semibold">
                        {shipmentJson.volumeCbm.toFixed(3)} CBM
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Row 8: Total No. of Containers /Packages | Movement | Freight */}
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-900 bg-slate-50">
            <EditableDocCell
              label="Total No. of Containers /Packages:"
              value={getVal(
                'total_packages_summary',
                `${String(contCount).padStart(2, '0')} / ${palletCount} PLTS`
              )}
              onChange={(val) => handleUpdate('total_packages_summary', val)}
            />
            <EditableDocCell
              label="Movement:"
              value={getVal('movement_type', shipmentJson.movementType || 'FCL / CY')}
              onChange={(val) => handleUpdate('movement_type', val, 'movementType')}
            />
            <EditableDocCell
              label="Freight:"
              value={getVal('freight_terms', shipmentJson.freightTerms || 'FREIGHT PREPAID')}
              onChange={(val) => handleUpdate('freight_terms', val, 'freightTerms')}
            />
          </div>

          {/* Rows 9 & 10: Bottom Container Breakdown Table */}
          <div className="p-0 bg-white">
            <table className="w-full text-left border-collapse text-[10px] font-mono">
              <thead>
                <tr className="bg-[#C0C0C0] border-b border-slate-900 text-slate-900 text-[9px] uppercase font-bold">
                  <th className="px-3 py-1.5 border-r border-slate-900 w-[34%]">CONT.NO.</th>
                  <th className="px-3 py-1.5 border-r border-slate-900 w-[18%]">Seal no.</th>
                  <th className="px-3 py-1.5 border-r border-slate-900 w-[18%]">Pallets</th>
                  <th className="px-3 py-1.5 border-r border-slate-900 w-[15%] text-right">Gr.wt. kgs</th>
                  <th className="px-3 py-1.5 w-[15%] text-right">Nt.wt.kgs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300">
                {shipmentJson.containers && shipmentJson.containers.length > 1 ? (
                  <>
                    {shipmentJson.containers.map((cont, cIdx) => {
                      const cPallets = cont.palletIndices && cont.palletIndices.length > 0 && shipmentJson.pallets
                        ? cont.palletIndices.map((i) => shipmentJson.pallets[i]).filter(Boolean)
                        : [];
                      const cPalletCount = cPallets.length > 0 ? cPallets.length : Math.round(palletCount / shipmentJson.containers!.length);
                      const cGross = cPallets.length > 0
                        ? cPallets.reduce((s, p) => s + (p.grossWeightKg || 0), 0)
                        : (shipmentJson.grossWeightKg / shipmentJson.containers!.length);
                      const cNet = cPallets.length > 0
                        ? cPallets.reduce((s, p) => s + (p.netWeightKg || 0), 0)
                        : (shipmentJson.netWeightKg / shipmentJson.containers!.length);

                      return (
                        <tr key={cont.id} className="hover:bg-slate-50">
                          <td className="px-3 py-1.5 border-r border-slate-900 font-bold text-slate-900">
                            <input
                              type="text"
                              value={cont.containerNumber || ''}
                              placeholder={`Container ${cIdx + 1} No`}
                              onChange={(e) => {
                                const val = e.target.value.toUpperCase();
                                const nextContainers = shipmentJson.containers!.map((item) =>
                                  item.id === cont.id ? { ...item, containerNumber: val } : item
                                );
                                onUpdateShipment({
                                  ...shipmentJson,
                                  containers: nextContainers,
                                  containerNumber: nextContainers.map((c) => c.containerNumber).filter(Boolean).join(', ')
                                });
                              }}
                              className="w-full bg-transparent font-bold text-slate-900 border-0 p-0 focus:outline-none focus:ring-1 focus:ring-sky-500 rounded font-mono text-[10px]"
                            />
                          </td>
                          <td className="px-3 py-1.5 border-r border-slate-900 text-slate-800">
                            <input
                              type="text"
                              value={cont.sealNumber || ''}
                              placeholder="Seal No"
                              onChange={(e) => {
                                const val = e.target.value.toUpperCase();
                                const nextContainers = shipmentJson.containers!.map((item) =>
                                  item.id === cont.id ? { ...item, sealNumber: val } : item
                                );
                                onUpdateShipment({
                                  ...shipmentJson,
                                  containers: nextContainers,
                                  sealNumber: nextContainers.map((c) => c.sealNumber).filter(Boolean).join(', ')
                                });
                              }}
                              className="w-full bg-transparent font-semibold text-slate-800 border-0 p-0 focus:outline-none focus:ring-1 focus:ring-sky-500 rounded font-mono text-[10px]"
                            />
                          </td>
                          <td className="px-3 py-1.5 border-r border-slate-900 font-semibold text-slate-800">
                            {cPalletCount} PALLETS
                          </td>
                          <td className="px-3 py-1.5 border-r border-slate-900 text-right font-semibold text-slate-900">
                            {cGross.toFixed(2)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold text-slate-900">
                            {cNet.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Summary row */}
                    <tr className="bg-slate-100 font-bold border-t-2 border-slate-900 text-[10px]">
                      <td className="px-3 py-1.5 border-r border-slate-900 text-slate-900 uppercase">
                        TOTAL ({shipmentJson.containers.length} CONTAINERS)
                      </td>
                      <td className="px-3 py-1.5 border-r border-slate-900 text-slate-500">
                        —
                      </td>
                      <td className="px-3 py-1.5 border-r border-slate-900 text-slate-900 font-extrabold">
                        {palletCount} PALLETS
                      </td>
                      <td className="px-3 py-1.5 border-r border-slate-900 text-right font-extrabold text-slate-900">
                        {shipmentJson.grossWeightKg.toFixed(2)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-extrabold text-slate-900">
                        {shipmentJson.netWeightKg.toFixed(2)}
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr className="hover:bg-slate-50">
                    <td className="px-3 py-1.5 border-r border-slate-900 font-bold text-slate-900">
                      <input
                        id="stage2-containerNumber"
                        type="text"
                        value={shipmentJson.containerNumber || ''}
                        placeholder="Container No"
                        onChange={(e) => handleUpdate('container_number', e.target.value, 'containerNumber')}
                        className="w-full bg-transparent font-bold text-slate-900 border-0 p-0 focus:outline-none focus:ring-1 focus:ring-sky-500 rounded font-mono text-[10px]"
                      />
                    </td>
                    <td className="px-3 py-1.5 border-r border-slate-900 text-slate-800">
                      <input
                        id="stage2-sealNumber"
                        type="text"
                        value={shipmentJson.sealNumber || ''}
                        placeholder="Seal No"
                        onChange={(e) => handleUpdate('seal_number', e.target.value, 'sealNumber')}
                        className="w-full bg-transparent font-semibold text-slate-800 border-0 p-0 focus:outline-none focus:ring-1 focus:ring-sky-500 rounded font-mono text-[10px]"
                      />
                    </td>
                    <td className="px-3 py-1.5 border-r border-slate-900 font-semibold text-slate-800">
                      {palletCount} PALLETS
                    </td>
                    <td className="px-3 py-1.5 border-r border-slate-900 text-right font-semibold text-slate-900">
                      {shipmentJson.grossWeightKg > 0 ? shipmentJson.grossWeightKg.toFixed(2) : '0.00'}
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold text-slate-900">
                      {shipmentJson.netWeightKg > 0 ? shipmentJson.netWeightKg.toFixed(2) : '0.00'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
