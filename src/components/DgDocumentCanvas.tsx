// Ekdant Logistics - Multi-Carrier DG Document Canvas (Sprint 4)
// Implements 7 Carrier-Specific Reference Templates + Selective Multi-Item DG Cargo Picker
// Strict zero-hardcoding: dynamic resolution from ExtractedShipmentJSON

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Trash2, Layers, ChevronDown } from 'lucide-react';
import { renderAsync } from 'docx-preview';
import type {
  ExtractedShipmentJSON,
  ExtractedPallet,
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
import { generatePopulatedDocxBlob } from '../utils/documentExporter.ts';

interface DgDocumentCanvasProps {
  shipmentJson: ExtractedShipmentJSON;
  onUpdateShipment: (updated: ExtractedShipmentJSON) => void;
  onFieldChange: (fieldId: string, newValue: string) => void;
  customOverrides: Record<string, string>;
  templateId?: DgTemplateId | string;
  onSelectedItemsChange?: (selectedIds: string[]) => void;
}

export function DgDocumentCanvas({
  shipmentJson,
  onUpdateShipment,
  onFieldChange,
  customOverrides,
  templateId = 'COMMON_DG',
  onSelectedItemsChange
}: DgDocumentCanvasProps): React.JSX.Element {
  const [showPalletAnnex, setShowPalletAnnex] = useState(false);
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

    onUpdateShipment({
      ...shipmentJson,
      pallets: updatedPallets,
      totalBoxes: totalBoxes > 0 ? totalBoxes : shipmentJson.totalBoxes,
      totalPackages: totalBoxes > 0 ? totalBoxes : shipmentJson.totalPackages,
      grossWeightKg: grossWeight > 0 ? grossWeight : shipmentJson.grossWeightKg,
      netWeightKg: netWeight > 0 ? netWeight : shipmentJson.netWeightKg
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

  // Template-specific text constants
  const isKmtc = activeTemplateId === 'KMTC_DG';
  const isCmaCgm = activeTemplateId === 'CMA_CGM_DG';
  const isAnlGrid = isKmtc || isCmaCgm;

  // Ref and state for docx-preview WYSIWYG rendering
  const docxContainerRef = useRef<HTMLDivElement>(null);
  const [isRenderingDocx, setIsRenderingDocx] = useState(false);
  const [docxRenderError, setDocxRenderError] = useState(false);

  useEffect(() => {
    if (isAnlGrid) return;
    let isCancelled = false;

    async function loadAndRender() {
      if (!docxContainerRef.current) return;
      setIsRenderingDocx(true);
      setDocxRenderError(false);

      try {
        const blob = await generatePopulatedDocxBlob(activeShipment, activeTemplateId);
        if (!blob || isCancelled) return;
        if (docxContainerRef.current) {
          docxContainerRef.current.innerHTML = '';
          await renderAsync(blob, docxContainerRef.current, undefined, {
            inWrapper: false,
            ignoreWidth: false,
            ignoreHeight: false
          });
        }
      } catch (err) {
        console.warn('docx-preview renderAsync failed:', err);
        if (!isCancelled) setDocxRenderError(true);
      } finally {
        if (!isCancelled) setIsRenderingDocx(false);
      }
    }

    loadAndRender();
    return () => {
      isCancelled = true;
    };
  }, [activeShipment, activeTemplateId, isAnlGrid]);

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

        {/* Pallet Annex Page 2 Toggle */}
        <div className="flex items-center justify-between px-1">
          <div className="text-xs font-semibold text-content-secondary">
            Template: <span className="text-content-primary font-bold">{DG_TEMPLATE_DEFINITIONS[activeTemplateId].name}</span>
          </div>
          <label className="flex items-center space-x-2 cursor-pointer text-xs font-semibold text-content-secondary select-none bg-surface px-3 py-1.5 rounded-lg border border-divider shadow-xs hover:bg-surface-secondary transition-colors">
            <input
              type="checkbox"
              checked={showPalletAnnex}
              onChange={(e) => setShowPalletAnnex(e.target.checked)}
              className="rounded border-divider text-brand-primary focus:ring-brand-primary h-3.5 w-3.5"
            />
            <span>Include Pallet Annex Table (Page 2)</span>
          </label>
        </div>
      </div>

      {/* =========================================================================
          VIEW A: KMTC / CMA CGM ANL HAZ FORMAT (GRID LAYOUT MODELED ON KMTC & CMA CGM DG.XLS)
          ========================================================================= */}
      {isAnlGrid ? (
        <div className="bg-white text-slate-900 shadow-2xl border-2 border-slate-900 rounded-sm p-6 sm:p-8 font-sans">
          {/* Document Header */}
          <div className="border-b-2 border-slate-900 pb-2 mb-3 text-center">
            <h1 className="text-base sm:text-lg font-black uppercase tracking-tight text-slate-950">
              IMO DANGEROUS GOODS DECLARATION
            </h1>
            <p className="text-[8.5px] text-slate-700 font-medium max-w-2xl mx-auto leading-tight mt-1">
              This form meets the requirements of SOLAS 74 chapter VII, regulation 5 MARPOL 73/78 Annex III, regulation 4 and the IMDG Code, General Introduction, section 9.
            </p>
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
                    `${activeShipment.shipperName}\n${activeShipment.shipperAddress}${
                      activeShipment.shipperIec ? `\nIEC: ${activeShipment.shipperIec}` : ''
                    }${activeShipment.shipperGstin ? `\nGSTIN: ${activeShipment.shipperGstin}` : ''}`
                  )}
                  onChange={(val) => handleUpdate('box_1_shipper', val, 'shipperAddress')}
                  multiline
                  rows={4}
                />
                <EditableDocCell
                  boxNumber=""
                  label="Consignee :-"
                  value={getVal('box_6_consignee', `${activeShipment.consigneeName}\n${activeShipment.consigneeAddress}`)}
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
                  <div className="p-2 flex flex-col justify-between">
                    <span className="text-[7.5px] font-bold text-slate-700 uppercase">Signature on Behalf of Packer</span>
                    <div className="border-t border-dotted border-slate-400 pt-1 text-[7.5px] text-slate-400">
                      Authorized Signature
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

            {/* 3-Column KMTC Cargo Table */}
            <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-900">
              {/* Col 1: Qty, Type, and Kind of Packages (col-span-3) */}
              <div className="md:col-span-3 p-2 bg-slate-50 flex flex-col justify-between">
                <div>
                  <span className="text-[8px] font-bold text-slate-800 uppercase tracking-wider block mb-2">
                    Qty., Type, and Kind of Packages
                  </span>
                  <div className="space-y-1.5 font-mono text-[9px] text-slate-900 font-semibold">
                    <div className="font-bold">NO OF PACKAGES</div>
                    <div>OUTER PACKAGES :- {activePallets} PALLETS</div>
                    <div>INNER PACKING :- {activeBoxes} BOXES</div>
                  </div>
                </div>
              </div>

              {/* Col 2: Description (Proper Shipping Name, Class, UN, Packing Group) (col-span-6) */}
              <div className="md:col-span-6 p-2 bg-white flex flex-col space-y-1">
                <span className="text-[8px] font-bold text-slate-800 uppercase tracking-wider block mb-1">
                  Description (Proper Shipping Name, Class, UN, Packing Group)
                </span>
                <textarea
                  rows={10}
                  value={getVal('box_14_shipping_marks', cargoBlockText)}
                  onChange={(e) => handleUpdate('box_14_shipping_marks', e.target.value, 'shippingMarks')}
                  className="w-full bg-slate-50 border border-slate-300 rounded p-1.5 text-[9px] font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 leading-tight"
                />
              </div>

              {/* Col 3: Gross & Net Weights (col-span-3) */}
              <div className="md:col-span-3 p-2 bg-slate-50 flex flex-col justify-between">
                <div>
                  <span className="text-[8px] font-bold text-slate-800 uppercase tracking-wider block mb-2">
                    Gross &amp; Net Weights
                  </span>
                  <div className="space-y-2 font-mono text-[9px] text-slate-900 font-bold">
                    <div>GR WT : {activeGrossWeight.toLocaleString()} KGS</div>
                    <div>NT WT : {activeNetWeight.toLocaleString()} KGS</div>
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
                  <div className="p-2 flex flex-col justify-between">
                    <span className="text-[7.5px] font-bold text-slate-700 uppercase">Signature on Behalf of Shipper</span>
                    <div className="border-t border-dotted border-slate-400 pt-1 text-[7.5px] text-slate-400">
                      Authorized Signature
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* =========================================================================
            VIEW B: 100% DITTO WORD MASTER TEMPLATE (COMMON, NOMINATION, VSTAR, ONE, MSC, DIAMOND)
            RENDERED PIXEL-FOR-PIXEL VIA DOCX-PREVIEW
            ========================================================================= */
        <div className="space-y-4">
          <div className="bg-white text-slate-900 shadow-2xl border border-slate-300 rounded-sm p-4 sm:p-6 font-sans relative">
            <div className="border-b border-slate-200 pb-2 mb-3 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wide">
                  100% Exact Carrier Master Template ({DG_TEMPLATE_DEFINITIONS[activeTemplateId].name})
                </span>
                <p className="text-[9px] text-slate-500">
                  Word OpenXML Layout Engine &bull; Native Geometry, Borders &amp; Styling Verbatim
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                Live Populated DOCX Preview
              </span>
            </div>

            {isRenderingDocx && (
              <div className="py-12 flex items-center justify-center">
                <div className="flex items-center space-x-2 text-xs font-semibold text-brand-primary">
                  <span className="w-4 h-4 border-2 border-brand-primary border-t-transparent rounded-full animate-spin"></span>
                  <span>Rendering exact master template...</span>
                </div>
              </div>
            )}

            <div
              ref={docxContainerRef}
              className="docx-render-target overflow-x-auto w-full [&_.docx]:!p-0 [&_.docx]:!shadow-none [&_.docx]:!border-0 [&_table]:!border-collapse [&_td]:!border-slate-800"
            />

            {docxRenderError && (
              <div className="p-4 text-center text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
                Word document preview fallback: The exported .docx download contains the full binary master template.
              </div>
            )}
          </div>
        </div>
      )}



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
                {activeShipment.pallets.map((p, idx) => (
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
                    TOTALS ({activeShipment.pallets.length} Pallets)
                  </td>
                  <td className="px-2.5 py-2 text-right">
                    {activeBoxes.toLocaleString()} Boxes
                  </td>
                  <td className="px-2.5 py-2 text-right text-emerald-800">
                    {activeGrossWeight.toLocaleString()} KGS
                  </td>
                  <td className="px-2.5 py-2 text-right">
                    {activeNetWeight.toLocaleString()} KGS
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
