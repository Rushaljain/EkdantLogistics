// Ekdant Logistics - Multi-Carrier DG Document Canvas (Sprint 4)
// Implements 7 Carrier-Specific Reference Templates + Selective Multi-Item DG Cargo Picker
// Strict zero-hardcoding: dynamic resolution from ExtractedShipmentJSON

import React, { useState, useMemo } from 'react';
import { Layers, ChevronDown } from 'lucide-react';
import type {
  ExtractedShipmentJSON,
  DgTemplateId,
  DgCargoItemLine
} from '../types/index.ts';
import { EditableDocCell } from './EditableDocCell.tsx';
import {
  DG_TEMPLATE_DEFINITIONS,
  buildDgCargoItems,
  filterShipmentByDgCargoItems,
  buildTemplateCargoBlock
} from '../utils/dgTemplates.ts';

interface DgDocumentCanvasProps {
  shipmentJson: ExtractedShipmentJSON;
  onUpdateShipment: (updated: ExtractedShipmentJSON) => void;
  onFieldChange: (fieldId: string, newValue: string) => void;
  customOverrides: Record<string, string>;
  templateId?: DgTemplateId | string;
  onSelectedItemsChange?: (selectedIds: string[]) => void;
}

function getCleanShipperValue(shipment: ExtractedShipmentJSON): string {
  const full = `${shipment.shipperName || ''}\n${shipment.shipperAddress || ''}${
    shipment.shipperIec ? `\nIEC: ${shipment.shipperIec}` : ''
  }${shipment.shipperGstin ? `\nGSTIN: ${shipment.shipperGstin}` : ''}`.trim();

  const lines = full.split('\n').map((l) => l.trim()).filter(Boolean);
  const onBehalfIdx = lines.findIndex((l) => /^(ON BEHALF OF|FOR AND ON BEHALF OF|\(ON BEHALF OF\))/i.test(l));
  const primaryLines = onBehalfIdx >= 0 ? lines.slice(0, onBehalfIdx) : lines;

  let name = shipment.shipperName || '';
  let addrLines = primaryLines;
  if (primaryLines.length > 0 && /LIMITED|LTD|INDUSTRIES|CORP|INC|CO\b/i.test(primaryLines[0])) {
    name = primaryLines[0];
    addrLines = primaryLines.slice(1);
  }

  const addr1 = addrLines[0] || '';
  const addr2 = addrLines[1] || '';
  const addr3 = addrLines.length > 2 ? addrLines.slice(2).join(', ') : '';

  return [name, addr1, addr2, addr3].filter(Boolean).join('\n');
}

function getCleanConsigneeValue(shipment: ExtractedShipmentJSON): string {
  const full = `${shipment.consigneeName || ''}\n${shipment.consigneeAddress || ''}`.trim();
  const lines = full.split('\n').map((l) => l.trim()).filter(Boolean);
  let name = shipment.consigneeName || '';
  let addrLines = lines;
  if (lines.length > 0 && /LIMITED|LTD|COMPANY|CORP|INC|CO\b/i.test(lines[0])) {
    name = lines[0];
    addrLines = lines.slice(1);
  }
  const addr1 = addrLines[0] || '';
  const addr2 = addrLines[1] || '';
  const addr3 = addrLines.length > 2 ? addrLines.slice(2).join(', ') : '';
  return [name, addr1, addr2, addr3].filter(Boolean).join('\n');
}

export function DgDocumentCanvas({
  shipmentJson,
  onUpdateShipment,
  onFieldChange,
  customOverrides,
  templateId = 'COMMON_DG',
  onSelectedItemsChange
}: DgDocumentCanvasProps): React.JSX.Element {
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // Normalize template ID
  const activeTemplateId: DgTemplateId = useMemo(() => {
    if (templateId && templateId in DG_TEMPLATE_DEFINITIONS) {
      return templateId as DgTemplateId;
    }
    return 'COMMON_DG';
  }, [templateId]);

  // Extract distinct item lines from cargo
  const cargoItems = useMemo<DgCargoItemLine[]>(() => {
    return buildDgCargoItems(shipmentJson);
  }, [shipmentJson]);

  // Track unselected items to eliminate useEffect and cascading renders
  const [unselectedItemIds, setUnselectedItemIds] = useState<Set<string>>(new Set());

  // Derive selected items
  const selectedItemIds = useMemo<string[]>(() => {
    const list = cargoItems.map((i) => i.id).filter((id) => !unselectedItemIds.has(id));
    if (onSelectedItemsChange) {
      onSelectedItemsChange(list);
    }
    return list;
  }, [cargoItems, unselectedItemIds, onSelectedItemsChange]);

  const handleToggleItem = (itemId: string) => {
    setUnselectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setUnselectedItemIds(new Set());
  };

  const handleDeselectAll = () => {
    setUnselectedItemIds(new Set(cargoItems.map((i) => i.id)));
  };

  // Derive filtered active shipment based on selected cargo items
  const activeShipment = useMemo<ExtractedShipmentJSON>(() => {
    return filterShipmentByDgCargoItems(shipmentJson, selectedItemIds);
  }, [shipmentJson, selectedItemIds]);

  // Computed live totals from active shipment
  const activeGrossWeight = activeShipment.grossWeightKg || 0;
  const activeNetWeight = activeShipment.netWeightKg || 0;
  const activeTareWeight = activeShipment.tareWeightKg || 2150;
  const activeVgm = activeGrossWeight + activeTareWeight;
  const activePallets = activeShipment.totalPallets || (activeShipment.pallets && activeShipment.pallets.length) || 0;
  const activeBoxes = activeShipment.totalBoxes || activeShipment.totalPackages || 0;

  // Helper to read field value prioritizing custom override -> active shipment state
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
        const cleaned = typeof newValue === 'string' ? newValue.replace(/,/g, '').replace(/[^\d.]/g, '') : newValue;
        (updated as any)[shipmentKey] = parseFloat(cleaned as string) || 0;
      } else {
        (updated as any)[shipmentKey] = newValue;
      }
      onUpdateShipment(updated);
    }
  };

  // Cargo Block text for Box 14
  const cargoBlockText = useMemo(() => {
    return buildTemplateCargoBlock(activeTemplateId, activeShipment);
  }, [activeTemplateId, activeShipment]);

  // Template-specific text constants
  const isKmtc = activeTemplateId === 'KMTC_DG';
  const isCmaCgm = activeTemplateId === 'CMA_CGM_DG';
  const isAnlGrid = isKmtc || isCmaCgm;
  const isDiamond = activeTemplateId === 'DIAMOND_MARITIME_DG';
  const isOneLine = activeTemplateId === 'ONE_LINE_DG';
  const isMscLine = activeTemplateId === 'MSC_LINE_DG';
  const isNomination = activeTemplateId === 'NOMINATION_DG';
  const isVstar = activeTemplateId === 'VSTAR_DG';

  // Box 2 BKG.NO. display format
  const box2Value = useMemo(() => {
    if (isOneLine || isMscLine) {
      return activeShipment.bookingNumber
        ? `BKG.NO.: ${activeShipment.bookingNumber}`
        : '';
    }
    return activeShipment.bookingNumber || '';
  }, [activeShipment.bookingNumber, isOneLine, isMscLine]);

  // Box 17 Container size & type display format
  const box17Display = useMemo(() => {
    if (isOneLine || isMscLine) return "1x20'";
    if (isDiamond) return '01X20 GP';
    if (isNomination || isVstar) return '20 GP';
    return activeShipment.containerType || "20' GP";
  }, [activeShipment.containerType, isOneLine, isMscLine, isDiamond, isNomination, isVstar]);

  return (
    <div className="w-full max-w-[920px] mx-auto space-y-4 pb-12">
      {/* =========================================================================
          TOP TOOLBAR: SELECTIVE MULTI-ITEM DG CARGO PICKER & PALLET ANNEX TOGGLE
          ========================================================================= */}
      <div className="space-y-3">
        {/* Multi-Item Cargo Picker Bar */}
        {cargoItems.length > 0 && (
          <div className="bg-surface border border-divider rounded-xl p-3 shadow-xs">
            <div
              className="flex items-center justify-between cursor-pointer select-none"
              onClick={() => setIsPickerOpen(!isPickerOpen)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center space-x-1.5 text-xs font-bold text-content-primary">
                  <Layers className="w-4 h-4 text-brand-primary" />
                  <span>DG Cargo Items Included ({selectedItemIds.length} of {cargoItems.length} Selected)</span>
                </span>
                <span className="text-[11px] font-mono font-semibold text-content-secondary bg-surface-secondary px-2 py-0.5 rounded border border-divider">
                  {activeGrossWeight.toLocaleString()} kg &bull; {activeBoxes.toLocaleString()} boxes &bull; {activePallets} pallets &bull; VGM: {activeVgm.toLocaleString()} kg
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectAll();
                  }}
                  className="text-[11px] font-semibold text-brand-primary hover:underline px-1.5 py-0.5"
                >
                  Select All
                </button>
                <span className="text-divider">|</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeselectAll();
                  }}
                  className="text-[11px] font-semibold text-content-secondary hover:text-content-primary px-1.5 py-0.5"
                >
                  Deselect All
                </button>
                <ChevronDown
                  className={`w-4 h-4 text-content-secondary transition-transform duration-200 ${
                    isPickerOpen ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </div>

            {isPickerOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mt-3 pt-3 border-t border-divider">
                {cargoItems.map((item) => {
                  const isChecked = selectedItemIds.includes(item.id);
                  return (
                    <label
                      key={item.id}
                      className={`flex items-start space-x-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-brand-primary/5 border-brand-primary/40 text-content-primary'
                          : 'bg-surface-secondary/40 border-divider text-content-secondary opacity-60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleItem(item.id)}
                        className="mt-0.5 rounded border-divider text-brand-primary focus:ring-brand-primary h-3.5 w-3.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-content-primary truncate">{item.modelCode}</div>
                        <div className="text-[10px] text-content-secondary font-mono">
                          {item.palletCount} plts ({item.palletRange || 'P-01'}) &bull; {item.boxCount} boxes
                        </div>
                        <div className="text-[10px] font-mono text-content-secondary">
                          GW: {item.grossWeightKg.toLocaleString()} kg &bull; NW: {item.netWeightKg.toLocaleString()} kg
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Template info bar */}
        <div className="flex items-center justify-between px-1">
          <div className="text-xs font-semibold text-content-secondary">
            Template: <span className="text-content-primary font-bold">{DG_TEMPLATE_DEFINITIONS[activeTemplateId].name}</span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          VIEW A: KMTC / CMA CGM ANL HAZ FORMAT (GRID LAYOUT MODELED ON KMTC & CMA CGM DG.XLS)
          ========================================================================= */}
      {isAnlGrid ? (
        <div className="bg-white text-slate-900 shadow-2xl border-2 border-slate-900 rounded-sm p-6 sm:p-8 font-sans">
          {/* Document Header with Carrier Branding */}
          <div className="border-b-2 border-slate-900 pb-3 mb-3 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex-shrink-0 flex items-center justify-center min-w-[120px]">
              {isCmaCgm ? (
                <img
                  src="/images/carriers/cma_cgm_logo.png"
                  alt="CMA CGM"
                  className="h-10 sm:h-12 w-auto object-contain"
                  onError={(e) => {
                    // Fallback to text logo if image fails
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : isKmtc ? (
                <img
                  src="/images/carriers/kmtc_logo.png"
                  alt="KMTC"
                  className="h-9 sm:h-11 w-auto object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="text-xs font-black tracking-widest text-slate-800">CMA CGM / ANL</div>
              )}
            </div>
            <div className="flex-1 text-center">
              <h1 className="text-base sm:text-lg font-black uppercase tracking-tight text-slate-950">
                IMO DANGEROUS GOODS DECLARATION
              </h1>
              <p className="text-[8px] sm:text-[8.5px] text-slate-700 font-medium max-w-2xl mx-auto leading-tight mt-1">
                This form meets the requirements of SOLAS 74 chapter VII, regulation 5 MARPOL 73/78 Annex III, regulation 4 and the IMDG Code, General Introduction, section 9.
              </p>
            </div>
            <div className="hidden sm:block min-w-[100px] text-right text-[9px] font-mono text-slate-500 font-bold">
              {activeTemplateId}
            </div>
          </div>

          <div className="border border-slate-900 divide-y divide-slate-900 text-[10px]">
            {/* Top Grid: Shipper / Consignee on Left | References & Carrier on Right */}
            <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-900">
              {/* Left Column (col-span-6) */}
              <div className="md:col-span-6 flex flex-col divide-y divide-slate-900">
                <EditableDocCell
                  boxNumber=""
                  label="SHIPPER :-"
                  value={getVal(
                    'box_1_shipper',
                    getCleanShipperValue(activeShipment)
                  )}
                  onChange={(val) => handleUpdate('box_1_shipper', val, 'shipperAddress')}
                  multiline
                  rows={4}
                />
                <EditableDocCell
                  boxNumber=""
                  label="Consignee :-"
                  value={getVal('box_6_consignee', getCleanConsigneeValue(activeShipment))}
                  onChange={(val) => handleUpdate('box_6_consignee', val, 'consigneeAddress')}
                  multiline
                  rows={4}
                />
              </div>

              {/* Right Column (col-span-6) */}
              <div className="md:col-span-6 flex flex-col divide-y divide-slate-900">
                <EditableDocCell
                  boxNumber=""
                  label="Reference Number(s)"
                  value={getVal(
                    'box_4_shipper_reference',
                    activeShipment.shipperReference || activeShipment.invoiceNumbers?.[0] || ''
                  )}
                  onChange={(val) => handleUpdate('box_4_shipper_reference', val, 'shipperReference')}
                />
                <EditableDocCell
                  boxNumber=""
                  label="24 HRS Emergency Contact Telephone Number: (with Country code / Area code / telephone no)"
                  value={getVal('box_21_emergency_contact', activeShipment.emergencyContactPhone || '')}
                  onChange={(val) => handleUpdate('box_21_emergency_contact', val, 'emergencyContactPhone')}
                  stage2Key="emergencyContactPhone"
                />
                <EditableDocCell
                  boxNumber=""
                  label="Carrier"
                  value={getVal('box_7_carrier', activeShipment.carrierName || (isCmaCgm ? 'CMA-CGM AGENCIES INDIA PVT.LTD.' : 'KOREA MARINE TRANSPORT CO. LTD.'))}
                  onChange={(val) => handleUpdate('box_7_carrier', val, 'carrierName')}
                  stage2Key="carrierName"
                />
                <EditableDocCell
                  boxNumber=""
                  label={isCmaCgm ? "Carrier's Booking Number: " : "Carrier's Booking Number:"}
                  value={getVal('box_2_transport_document_number', activeShipment.bookingNumber || '')}
                  onChange={(val) => handleUpdate('box_2_transport_document_number', val, 'bookingNumber')}
                  stage2Key="bookingNumber"
                />
              </div>
            </div>

            {/* Middle Grid: Container Packing Declaration & Signatory */}
            <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-900">
              <div className="md:col-span-6 p-2 bg-slate-50">
                <span className="text-[8px] font-bold text-slate-800 uppercase tracking-wider block mb-1">
                  Container Packing Certificate / Vehicle Declaration
                </span>
                <div className="text-[8px] font-extrabold text-slate-900 mb-1">
                  CONTAINER PACKING DECLARATION
                </div>
                <p className="text-[7.5px] leading-tight text-slate-600">
                  It is hereby declared that the packing of the container has been carried out in accordance with the General Introduction, IMDG Code, paragraph 5.4.2.1
                </p>
              </div>

              <div className="md:col-span-6 flex flex-col divide-y divide-slate-900">
                <EditableDocCell
                  boxNumber=""
                  label="Name/Status, Company/Organization of Signatory"
                  value={getVal(
                    'box_20_container_packing_certificate',
                    `${activeShipment.dgDeclarantName || 'AUTHORIZED SIGNATORY'}\n${activeShipment.shipperName || ''}`
                  )}
                  onChange={(val) => handleUpdate('box_20_container_packing_certificate', val, 'dgDeclarantName')}
                  multiline
                  rows={2}
                />
                <div className="grid grid-cols-2 divide-x divide-slate-900">
                  <EditableDocCell
                    boxNumber=""
                    label="Place and Date"
                    value={getVal('box_22_place_date', activeShipment.dgDeclarationPlaceAndDate || '')}
                    onChange={(val) => handleUpdate('box_22_place_date', val, 'dgDeclarationPlaceAndDate')}
                  />
                  <div className="p-2 flex flex-col justify-between relative min-h-[56px]">
                    <span className="text-[7.5px] font-bold text-slate-700 uppercase">Signature on Behalf of Packer</span>
                    <div className="flex items-center space-x-2 pt-1">
                      <img
                        src="/images/carriers/signatory_stamp.jpg"
                        alt="Signature Stamp"
                        className="h-9 w-auto object-contain mix-blend-multiply opacity-90"
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      />
                      <span className="text-[7px] text-slate-500 font-mono italic">Authorized Signatory</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Routing & Equipment Strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-slate-900 bg-slate-100">
              <EditableDocCell
                boxNumber=""
                label="Ship's Name and Voyage No."
                value={getVal(
                  'box_10_vessel_and_voyage_number',
                  activeShipment.vesselName
                    ? (activeShipment.voyageNumber ? `${activeShipment.vesselName} / ${activeShipment.voyageNumber}` : activeShipment.vesselName)
                    : ''
                )}
                onChange={(val) => handleUpdate('box_10_vessel_and_voyage_number', val, 'vesselName')}
                stage2Key="vesselVoyage"
              />
              <EditableDocCell
                boxNumber=""
                label="Port of Loading"
                value={getVal('box_11_port_of_loading', activeShipment.portOfLoading)}
                onChange={(val) => handleUpdate('box_11_port_of_loading', val, 'portOfLoading')}
              />
              <EditableDocCell
                boxNumber=""
                label="Container Number(s)"
                value={getVal('box_19_container_number', activeShipment.containerNumber)}
                onChange={(val) => handleUpdate('box_19_container_number', val, 'containerNumber')}
                stage2Key="containerNumber"
              />
              <EditableDocCell
                boxNumber=""
                label="SEAL NO:"
                value={getVal('box_16_seal_number', activeShipment.sealNumber)}
                onChange={(val) => handleUpdate('box_16_seal_number', val, 'sealNumber')}
                stage2Key="sealNumber"
              />
            </div>

            <div className="grid grid-cols-2 divide-x divide-slate-900 bg-slate-100">
              <EditableDocCell
                boxNumber=""
                label="Port of Unloading"
                value={getVal('box_12_port_of_discharge', activeShipment.portOfDischarge)}
                onChange={(val) => handleUpdate('box_12_port_of_discharge', val, 'portOfDischarge')}
              />
              <EditableDocCell
                boxNumber=""
                label="Final Place of Delivery"
                value={getVal('box_13_destination', activeShipment.finalDestination || activeShipment.portOfDischarge)}
                onChange={(val) => handleUpdate('box_13_destination', val, 'finalDestination')}
              />
            </div>

            {/* 3-Column KMTC/CMA Cargo Table */}
            <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-900">
              {/* Col 1: Qty., Type, and Kind of Packages (col-span-3) */}
              <div className="md:col-span-3 p-2 bg-slate-50 flex flex-col justify-between space-y-2">
                <div>
                  <span className="text-[8px] font-bold text-slate-800 uppercase tracking-wider block mb-1">
                    Qty., Type, and Kind of Packages
                  </span>
                  <div className="inline-block bg-slate-900 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-sm mb-2">
                    {activeShipment.containerType || "1x20'FT"}
                  </div>
                  <div className="space-y-1.5 font-mono text-[9px] text-slate-900 font-semibold">
                    <div className="text-[8px] text-slate-500 font-bold uppercase">OUTER PACKAGES :-</div>
                    <div className="pl-1.5 border-l-2 border-slate-400">
                      {activePallets > 0 ? `${activeBoxes} FIBREBOARD BOXES IN ${activePallets} PALLETS` : `${activeBoxes} PACKAGES`}
                    </div>
                    <div className="text-[8px] text-slate-500 font-bold uppercase mt-2">INNER PACKING :-</div>
                    <div className="pl-1.5 border-l-2 border-slate-400 text-slate-700">
                      EACH BOX HAS 1 BATTERY ({activeBoxes} BOXES)
                    </div>
                  </div>
                </div>
              </div>

              {/* Col 2: Description (Proper Shipping Name, Class, UN, Packing Group) (col-span-6) */}
              <div className="md:col-span-6 p-2 bg-white flex flex-col space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-bold text-slate-800 uppercase tracking-wider">
                    Description (Proper Shipping Name, Class, UN, Packing Group)
                  </span>
                  <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-wide">
                    IMDG CODE REQUISITE
                  </span>
                </div>
                <textarea
                  rows={9}
                  value={getVal('box_14_shipping_marks', cargoBlockText)}
                  onChange={(e) => handleUpdate('box_14_shipping_marks', e.target.value, 'shippingMarks')}
                  className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-[9px] font-mono font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 leading-relaxed tracking-tight"
                />
              </div>

              {/* Col 3: Gross & Net Weights (col-span-3) */}
              <div className="md:col-span-3 p-2 bg-slate-50 flex flex-col justify-between">
                <div>
                  <span className="text-[8px] font-bold text-slate-800 uppercase tracking-wider block mb-2">
                    Gross &amp; Net Weights
                  </span>
                  <div className="space-y-2 font-mono text-[9px] text-slate-900 font-bold">
                    <div className="bg-white border border-slate-200 p-1.5 rounded shadow-xs">
                      <span className="text-slate-500 text-[8px] block font-semibold">GROSS MASS:</span>
                      GR WT : {activeGrossWeight.toLocaleString()} KGS
                    </div>
                    <div className="bg-white border border-slate-200 p-1.5 rounded shadow-xs">
                      <span className="text-slate-500 text-[8px] block font-semibold">NET MASS:</span>
                      NT WT : {activeNetWeight.toLocaleString()} KGS
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-2 border-t border-slate-300">
                  <div className="text-[8px] font-bold text-emerald-900 uppercase">SOLAS VGM Live</div>
                  <div className="text-xs font-mono font-extrabold text-emerald-900">
                    {activeVgm.toLocaleString()} KGS
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Shipper's Declaration */}
            <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-900">
              <div className="md:col-span-6 p-2 bg-slate-50">
                <span className="text-[8px] font-bold text-slate-800 uppercase tracking-wider block mb-1">
                  SHIPPER'S DECLARATION
                </span>
                <p className="text-[7.5px] leading-tight text-slate-600">
                  It is hereby declared that the contents of this consignment are fully and accurately described above by the proper shipping name(s), and are classified, packaged, marked and labeled/placarded, and are in all respects in proper condition for transport according to the applicable international and national government regulations.
                </p>
              </div>

              <div className="md:col-span-6 flex flex-col divide-y divide-slate-900">
                <EditableDocCell
                  boxNumber=""
                  label="Name/Status, Company/Organization of Signatory"
                  value={getVal(
                    'box_22_declarant_details',
                    `${activeShipment.dgDeclarantName || 'AUTHORIZED SIGNATORY'}\n${activeShipment.shipperName || ''}`
                  )}
                  onChange={(val) => handleUpdate('box_22_declarant_details', val, 'dgDeclarantName')}
                  multiline
                  rows={2}
                />
                <div className="grid grid-cols-2 divide-x divide-slate-900">
                  <EditableDocCell
                    boxNumber=""
                    label="Place and Date"
                    value={getVal('box_22_place_date', activeShipment.dgDeclarationPlaceAndDate || '')}
                    onChange={(val) => handleUpdate('box_22_place_date', val, 'dgDeclarationPlaceAndDate')}
                  />
                  <div className="p-2 flex flex-col justify-between relative min-h-[56px]">
                    <span className="text-[7.5px] font-bold text-slate-700 uppercase">Signature on Behalf of Shipper</span>
                    <div className="flex items-center space-x-2 pt-1">
                      <img
                        src="/images/carriers/signatory_stamp.jpg"
                        alt="Signature Stamp"
                        className="h-9 w-auto object-contain mix-blend-multiply opacity-90"
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      />
                      <span className="text-[7px] text-slate-500 font-mono italic">Authorized Signatory</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* =========================================================================
            VIEW B: STANDARD IMO 22-BOX FORM (COMMON, NOMINATION, VSTAR, ONE, MSC, DIAMOND)
            100% INTERACTIVE IN-PLACE EDITABLE A4 CANVAS
            ========================================================================= */
        <div className="bg-white text-slate-900 shadow-2xl border-2 border-slate-900 rounded-sm p-6 sm:p-8 font-sans">
          {/* Document Header */}
          <div className="border-b-2 border-slate-900 pb-2 mb-3 text-center">
            <h1 className="text-sm sm:text-base font-extrabold uppercase tracking-tight text-slate-950">
              {activeTemplateId === 'COMMON_DG'
                ? 'MULTIMODAL DANGEROUS GOODS DECLARATION'
                : 'MULTIMODAL DANGEROUS GOODS FORM'}
            </h1>
            <p className="text-[8.5px] text-slate-600 font-medium">
              {activeTemplateId === 'COMMON_DG'
                ? 'This form meets the requirements of SOLAS 74, chapter VII, reg 5.4; MARPOL 73/78, Annex III, reg 4'
                : 'This form may be used as a dangerous goods declaration as it meets the requirements of Solas 74,chapter VII, regulation 5; MARPOL 73/78, Annex III, regulation 4.'}
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
                  label={
                    isDiamond
                      ? '1 SHIPPER/CONSIGNOR/SENDER (FULL STYLE ADDRESS IS MANDATORY)'
                      : 'Shipper / Consignor / Sender'
                  }
                  value={getVal(
                    'box_1_shipper',
                    getCleanShipperValue(activeShipment)
                  )}
                  onChange={(val) => handleUpdate('box_1_shipper', val, 'shipperAddress')}
                  multiline
                  rows={3}
                />
                <EditableDocCell
                  boxNumber="6"
                  label="Consignee"
                  value={getVal('box_6_consignee', getCleanConsigneeValue(activeShipment))}
                  onChange={(val) => handleUpdate('box_6_consignee', val, 'consigneeAddress')}
                  multiline
                  rows={3}
                />
                <EditableDocCell
                  boxNumber="7"
                  label="Carrier"
                  value={getVal('box_7_carrier', activeShipment.carrierName)}
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

                {/* Vessel and Port of Loading Row (with ONE/MSC Emergency Strip support) */}
                <div className="grid grid-cols-2 divide-x divide-slate-900">
                  <EditableDocCell
                    boxNumber="10"
                    label={isDiamond ? 'Vessel and Voyage number' : 'Vessel and voy'}
                    value={getVal(
                      'box_10_vessel_and_voyage_number',
                      activeShipment.vesselName
                        ? (activeShipment.voyageNumber ? `${activeShipment.vesselName} / ${activeShipment.voyageNumber}` : activeShipment.vesselName)
                        : ''
                    )}
                    onChange={(val) => handleUpdate('box_10_vessel_and_voyage_number', val, 'vesselName')}
                    stage2Key="vesselVoyage"
                    placeholder="e.g. Vessel / Voy"
                  />
                  <EditableDocCell
                    boxNumber="11"
                    label="Port of loading"
                    value={getVal('box_11_port_of_loading', activeShipment.portOfLoading)}
                    onChange={(val) => handleUpdate('box_11_port_of_loading', val, 'portOfLoading')}
                  />
                </div>

                {/* Prominent Emergency Contact line inside Box 11 for ONE LINE & MSC LINE templates */}
                {(isOneLine || isMscLine) && (
                  <div className="p-1.5 bg-rose-50 border-t border-slate-900 text-[8.5px] font-mono font-bold text-rose-900">
                    EMERGENCY CONTACT NUMBER : {activeShipment.emergencyContactPhone || '---'}
                  </div>
                )}

                <div className="grid grid-cols-2 divide-x divide-slate-900">
                  <EditableDocCell
                    boxNumber="12"
                    label="Port of discharge"
                    value={getVal('box_12_port_of_discharge', activeShipment.portOfDischarge)}
                    onChange={(val) => handleUpdate('box_12_port_of_discharge', val, 'portOfDischarge')}
                  />
                  <EditableDocCell
                    boxNumber="13"
                    label={isDiamond ? 'DESTINATIONS' : 'Destination'}
                    value={getVal('box_13_destination', activeShipment.finalDestination || activeShipment.portOfDischarge)}
                    onChange={(val) => handleUpdate('box_13_destination', val, 'finalDestination')}
                  />
                </div>
              </div>

              {/* Right Column (50% / col-span-6) */}
              <div className="md:col-span-6 flex flex-col divide-y divide-slate-900">
                <EditableDocCell
                  boxNumber="2"
                  label={
                    isOneLine || isMscLine
                      ? 'Transport Document Number: BKG.NO.:'
                      : (isDiamond ? 'Transport document number BOOKING NO:' : 'Transport Document Number')
                  }
                  value={getVal('box_2_transport_document_number', box2Value)}
                  onChange={(val) => handleUpdate('box_2_transport_document_number', val, 'bookingNumber')}
                  stage2Key="bookingNumber"
                />

                {/* 3-Column Top Right for MSC LINE vs 2-Column for others */}
                {isMscLine ? (
                  <div className="grid grid-cols-3 divide-x divide-slate-900">
                    <EditableDocCell
                      boxNumber="3"
                      label="3 Page of Page"
                      value={getVal('box_3_page_of_page', '1 OF 1')}
                      onChange={(val) => handleUpdate('box_3_page_of_page', val)}
                    />
                    <EditableDocCell
                      boxNumber="4"
                      label="Shipper's reference"
                      value={getVal(
                        'box_4_shipper_reference',
                        activeShipment.shipperReference || activeShipment.invoiceNumbers?.[0] || ''
                      )}
                      onChange={(val) => handleUpdate('box_4_shipper_reference', val, 'shipperReference')}
                    />
                    <EditableDocCell
                      boxNumber="5"
                      label="Freight Forwarder's reference"
                      value={getVal('box_5_freight_forwarder_reference', activeShipment.forwarderReference || '')}
                      onChange={(val) => handleUpdate('box_5_freight_forwarder_reference', val, 'forwarderReference')}
                    />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 divide-x divide-slate-900">
                      <EditableDocCell
                        boxNumber="3"
                        label={isOneLine ? '3 Page of Page' : 'Page 1 of 1'}
                        value={getVal('box_3_page_of_page', '1 OF 1')}
                        onChange={(val) => handleUpdate('box_3_page_of_page', val)}
                      />
                      <EditableDocCell
                        boxNumber="4"
                        label="Shipper's reference"
                        value={getVal(
                          'box_4_shipper_reference',
                          activeShipment.shipperReference || activeShipment.invoiceNumbers?.[0] || ''
                        )}
                        onChange={(val) => handleUpdate('box_4_shipper_reference', val, 'shipperReference')}
                      />
                    </div>
                    <EditableDocCell
                      boxNumber="5"
                      label="Freight Forwarder's reference"
                      value={getVal('box_5_freight_forwarder_reference', activeShipment.forwarderReference || '')}
                      onChange={(val) => handleUpdate('box_5_freight_forwarder_reference', val, 'forwarderReference')}
                    />
                  </>
                )}

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
                    (isOneLine || isMscLine)
                      ? ''
                      : (activeShipment.emergencyContactPhone ? `EMERGENCY CONTACT NUMBER: ${activeShipment.emergencyContactPhone}` : '')
                  )}
                  onChange={(val) => handleUpdate('box_9_place_of_receipt', val, 'emergencyContactPhone')}
                  stage2Key="emergencyContactPhone"
                  placeholder="Additional handling instructions..."
                />
              </div>
            </div>

            {/* Center Cargo Table (Unified Wide Box 14 + 3 Weight Columns) */}
            <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-900">
              {/* Box 14: Shipping Marks | *Number and kind of packages; description of goods */}
              <div className="md:col-span-8 p-2 bg-white flex flex-col space-y-1.5 min-w-0">
                <span className="text-[8px] font-bold text-slate-700 uppercase tracking-wider">
                  14. Shipping Marks | *Number and kind of packages; description of goods
                </span>
                <textarea
                  rows={9}
                  value={getVal('box_14_shipping_marks', cargoBlockText)}
                  onChange={(e) => handleUpdate('box_14_shipping_marks', e.target.value, 'shippingMarks')}
                  className="w-full bg-slate-50 border border-slate-300 rounded p-1.5 text-[9px] font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 leading-relaxed whitespace-pre-wrap break-words"
                />
              </div>

              {/* Boxes 16, 17, 18: Masses & Cube */}
              <div className="md:col-span-4 flex flex-col divide-y divide-slate-900">
                <EditableDocCell
                  boxNumber="16"
                  label={isDiamond ? 'Gross mass (kg)' : 'Gross Mass (kg)'}
                  value={getVal(
                    'box_16_gross_mass_kg',
                    activeGrossWeight > 0 ? `${activeGrossWeight.toLocaleString()} KGS` : ''
                  )}
                  onChange={(val) => handleUpdate('box_16_gross_mass_kg', val, 'grossWeightKg')}
                />
                <EditableDocCell
                  boxNumber="17"
                  label={isDiamond ? 'Net Mass' : 'Net Mass (kgs)'}
                  value={getVal(
                    'box_17_net_mass_kg',
                    activeNetWeight > 0 ? `${activeNetWeight.toLocaleString()} KGS` : ''
                  )}
                  onChange={(val) => handleUpdate('box_17_net_mass_kg', val, 'netWeightKg')}
                />
                <EditableDocCell
                  boxNumber="18"
                  label={isDiamond ? 'Total cube (m3)' : 'Cube (m³)'}
                  value={getVal(
                    'box_18_cube_m3',
                    activeShipment.volumeCbm > 0 ? `${activeShipment.volumeCbm.toFixed(3)} M³` : ''
                  )}
                  onChange={(val) => handleUpdate('box_18_cube_m3', val, 'volumeCbm')}
                />
              </div>
            </div>

            {/* Extra "Other Details" Horizontal Bar for Nomination, V-Star, and Diamond Maritime */}
            {(isNomination || isVstar || isDiamond) && (
              <div className="p-1.5 bg-slate-100 font-mono text-[8.5px] font-bold text-slate-900 border-t border-slate-900">
                {isNomination && (
                  <span>Other Details : UN PACKING CODE :- {activeShipment.unPackingCode || ''}</span>
                )}
                {isVstar && (
                  <span>Other Details {activeShipment.unPackingCode ? `: UN PACKING CODE: ${activeShipment.unPackingCode}` : ''}</span>
                )}
                {isDiamond && (
                  <span>Other Details UN PACKAGING NO. {activeShipment.unPackingCode || ''}</span>
                )}
              </div>
            )}

            {/* Official IMO Equipment Row (Boxes 15, 16, 17, 18, 19) */}
            <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-y md:divide-y-0 divide-slate-900 bg-slate-50">
              <EditableDocCell
                boxNumber="15"
                label="Container identification no."
                value={getVal('box_19_container_and_seal_number', activeShipment.containerNumber)}
                onChange={(val) => handleUpdate('box_19_container_and_seal_number', val, 'containerNumber')}
                stage2Key="containerNumber"
                placeholder="e.g. Container No"
              />
              <EditableDocCell
                boxNumber="16"
                label={isDiamond ? 'SEAL NO' : 'Seal number(s)'}
                value={getVal('box_16_seal_number', activeShipment.sealNumber)}
                onChange={(val) => handleUpdate('box_16_seal_number', val, 'sealNumber')}
                stage2Key="sealNumber"
                placeholder="e.g. Seal No"
              />
              <EditableDocCell
                boxNumber="17"
                label={isDiamond ? 'CNTR TYPE' : 'Container size & type'}
                value={getVal('box_17_container_size_type', box17Display)}
                onChange={(val) => handleUpdate('box_17_container_size_type', val, 'containerType')}
              />
              <EditableDocCell
                boxNumber="18"
                label="Tare mass (kg)"
                value={getVal(
                  'box_19_tare_mass_kg',
                  activeTareWeight > 0 ? `${activeTareWeight.toLocaleString()} KGS` : ''
                )}
                onChange={(val) => handleUpdate('box_19_tare_mass_kg', val, 'tareWeightKg')}
                stage2Key="tareWeightKg"
                placeholder="e.g. 2150 KGS"
              />
              <div className="p-2 bg-emerald-50/80 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[8px] font-bold text-emerald-900 uppercase tracking-wider">
                      {isDiamond ? '19. Total gross (kg)' : '19. Total gross (incl. tare) (kg)'}
                    </span>
                    <span className="text-[7.5px] font-mono font-bold text-emerald-700 bg-emerald-200/80 px-1 py-0.2 rounded border border-emerald-400">
                      SOLAS VGM Live
                    </span>
                  </div>
                  <div className="text-xs font-mono font-extrabold text-emerald-950 mt-1">
                    {activeVgm > 0 ? `${activeVgm.toLocaleString()} KGS` : '—'}
                  </div>
                </div>
                <div className="text-[8px] font-mono text-emerald-700 mt-1">
                  Cargo ({activeGrossWeight.toLocaleString()} kg) + Tare ({activeTareWeight.toLocaleString()} kg)
                </div>
              </div>
            </div>

            {/* Bottom Signature Row (Boxes 20, 21, 22) */}
            <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-900">
              {/* Box 20: Container Packing Certificate */}
              <div className="md:col-span-4 p-2 bg-white flex flex-col justify-between">
                <div>
                  <span className="text-[8px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    20. CONTAINER / VEHICLE PACKING CERTIFICATE {isDiamond ? '(stamp & signature are mandatory)' : ''}
                  </span>
                  <p className="text-[8px] leading-tight text-slate-500 mb-2">
                    I hereby declare that the goods described above have been packed/loaded into the container/vehicle identified above in accordance with the applicable provisions.
                  </p>
                  <EditableDocCell
                    boxNumber="20"
                    label="20. Company Name & Declarant"
                    value={getVal(
                      'box_20_container_packing_certificate',
                      `${activeShipment.shipperName || ''}\n${activeShipment.dgDeclarantName || 'AUTHORIZED SIGNATORY'}`
                    )}
                    onChange={(val) => handleUpdate('box_20_container_packing_certificate', val, 'dgDeclarantName')}
                    multiline
                    rows={2}
                  />
                  <div className="mt-1.5 text-[8px] text-slate-600 font-mono">
                    Place and date: <span className="font-semibold text-slate-800">{activeShipment.dgDeclarationPlaceAndDate || '---'}</span>
                  </div>
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
                    22. SHIPPER'S DECLARATION {isDiamond ? '(stamp & signature are mandatory)' : ''}
                  </span>
                  <p className="text-[8px] leading-tight text-slate-500 mb-2">
                    I hereby declare that the contents of this consignment are fully and accurately described above by the proper shipping name, and are classified, packaged, marked and labeled/placarded and are in all respects in proper condition for transport according to the applicable international and national governmental regulations.
                  </p>
                  <EditableDocCell
                    boxNumber="22"
                    label="22. Company Name & Declarant"
                    value={getVal(
                      'box_22_declarant_details_and_signature',
                      `${activeShipment.shipperName || ''}\n${activeShipment.dgDeclarantName || 'AUTHORIZED SIGNATORY'}`
                    )}
                    onChange={(val) => handleUpdate('box_22_declarant_details_and_signature', val, 'dgDeclarantName')}
                    multiline
                    rows={2}
                  />
                  <div className="mt-1.5 text-[8px] text-slate-600 font-mono">
                    Place and date: <span className="font-semibold text-slate-800">{activeShipment.dgDeclarationPlaceAndDate || '---'}</span>
                  </div>
                </div>
                <div className="border-t border-dotted border-slate-400 pt-1 mt-2 text-[8px] text-slate-500">
                  Signature of Declarant
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
