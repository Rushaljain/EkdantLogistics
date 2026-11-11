import React, { useState, useMemo } from 'react';
import {
  Boxes,
  X,
  CheckCircle2,
  Plus,
  Trash2,
  Sparkles,
  Info,
  Scale,
  Edit2
} from 'lucide-react';
import type {
  ExtractedShipmentJSON,
  ExtractedPallet,
  ContainerType
} from '../types/index.ts';
import { CONTAINER_SPECS } from '../types/index.ts';

interface ContainerBayModalProps {
  isOpen: boolean;
  onClose: () => void;
  shipmentJson: ExtractedShipmentJSON;
  onUpdateShipment: (updated: ExtractedShipmentJSON) => void;
}

export function ContainerBayModal({
  isOpen,
  onClose,
  shipmentJson,
  onUpdateShipment
}: ContainerBayModalProps): React.JSX.Element | null {
  // Equipment input states (local copy for instant editing)
  const [containerNumber, setContainerNumber] = useState<string>(shipmentJson.containerNumber || '');
  const [sealNumber, setSealNumber] = useState<string>(shipmentJson.sealNumber || '');
  const [containerType, setContainerType] = useState<ContainerType>(shipmentJson.containerType || '20GP');
  const [tareWeightKg, setTareWeightKg] = useState<number>(() => {
    return shipmentJson.tareWeightKg || CONTAINER_SPECS[shipmentJson.containerType || '20GP'].tareWeightKg;
  });
  const [carrierName, setCarrierName] = useState<string>(shipmentJson.carrierName || '');
  const [vesselName, setVesselName] = useState<string>(shipmentJson.vesselName || '');
  const [voyageNumber, setVoyageNumber] = useState<string>(shipmentJson.voyageNumber || '');
  const [bookingNumber, setBookingNumber] = useState<string>(shipmentJson.bookingNumber || '');

  // Pallet allocation state: list of pallet numbers currently allocated to this container bay
  const [pallets, setPallets] = useState<ExtractedPallet[]>(() => [...shipmentJson.pallets]);
  const [allocatedPalletNumbers, setAllocatedPalletNumbers] = useState<Set<string>>(() => {
    return new Set(shipmentJson.pallets.map((p) => p.palletNumber));
  });

  // Edit / Add pallet modal state
  const [editingPalletIndex, setEditingPalletIndex] = useState<number | null>(null);
  const [palletForm, setPalletForm] = useState<{
    palletNumber: string;
    modelCode: string;
    boxCount: number;
    grossWeightKg: number;
    netWeightKg: number;
  }>({
    palletNumber: '',
    modelCode: '',
    boxCount: 0,
    grossWeightKg: 0,
    netWeightKg: 0
  });
  const [showPalletForm, setShowPalletForm] = useState<boolean>(false);

  // Container specs
  const specs = CONTAINER_SPECS[containerType] || CONTAINER_SPECS['20GP'];

  // Handle container type change: auto-update default tare weight if not customized
  const handleContainerTypeChange = (newType: ContainerType) => {
    setContainerType(newType);
    const newDefaultTare = CONTAINER_SPECS[newType]?.tareWeightKg || 2150;
    setTareWeightKg(newDefaultTare);
  };

  // Toggle allocation of a pallet
  const togglePalletAllocation = (palletNumber: string) => {
    setAllocatedPalletNumbers((prev) => {
      const next = new Set(prev);
      if (next.has(palletNumber)) {
        next.delete(palletNumber);
      } else {
        if (next.size >= specs.maxPallets) {
          return next; // Exceeded container capacity
        }
        next.add(palletNumber);
      }
      return next;
    });
  };

  // Select all / Deselect all
  const handleSelectAllPallets = () => {
    setAllocatedPalletNumbers(new Set(pallets.map((p) => p.palletNumber)));
  };

  const handleDeselectAllPallets = () => {
    setAllocatedPalletNumbers(new Set());
  };

  // Metrics for allocated pallets
  const allocatedPalletsList = useMemo(() => {
    return pallets.filter((p) => allocatedPalletNumbers.has(p.palletNumber));
  }, [pallets, allocatedPalletNumbers]);

  const totalAllocatedBoxes = useMemo(() => {
    return allocatedPalletsList.reduce((sum, p) => sum + (p.boxCount || 0), 0);
  }, [allocatedPalletsList]);

  const cargoGrossWeight = useMemo(() => {
    return allocatedPalletsList.reduce((sum, p) => sum + (p.grossWeightKg || 0), 0);
  }, [allocatedPalletsList]);

  const cargoNetWeight = useMemo(() => {
    return allocatedPalletsList.reduce((sum, p) => sum + (p.netWeightKg || 0), 0);
  }, [allocatedPalletsList]);

  // Live VGM Calculation
  const vgmWeightKg = cargoGrossWeight + (Number(tareWeightKg) || 0);

  // Utilization
  const weightUtilPct = Math.min(Math.round((cargoGrossWeight / specs.maxPayloadKg) * 100), 100);
  const palletUtilPct = Math.min(Math.round((allocatedPalletsList.length / specs.maxPallets) * 100), 100);
  const isOverweight = cargoGrossWeight > specs.maxPayloadKg;

  // Open Pallet Edit
  const handleOpenEditPallet = (index: number) => {
    const target = pallets[index];
    if (!target) return;
    setEditingPalletIndex(index);
    setPalletForm({
      palletNumber: target.palletNumber,
      modelCode: target.modelCode,
      boxCount: target.boxCount,
      grossWeightKg: target.grossWeightKg,
      netWeightKg: target.netWeightKg
    });
    setShowPalletForm(true);
  };

  const handleOpenNewPallet = () => {
    const nextNum = pallets.length + 1;
    setEditingPalletIndex(null);
    setPalletForm({
      palletNumber: `P-${nextNum.toString().padStart(2, '0')}`,
      modelCode: '',
      boxCount: 0,
      grossWeightKg: 0,
      netWeightKg: 0
    });
    setShowPalletForm(true);
  };

  const handleSavePalletForm = () => {
    if (!palletForm.palletNumber.trim()) return;

    if (editingPalletIndex !== null) {
      // Update existing pallet
      setPallets((prev) => {
        const next = [...prev];
        next[editingPalletIndex] = {
          ...next[editingPalletIndex],
          palletNumber: palletForm.palletNumber.trim(),
          modelCode: palletForm.modelCode.trim(),
          boxCount: Number(palletForm.boxCount) || 0,
          grossWeightKg: Number(palletForm.grossWeightKg) || 0,
          netWeightKg: Number(palletForm.netWeightKg) || 0
        };
        return next;
      });
    } else {
      // Add new pallet
      const newPallet: ExtractedPallet = {
        palletNumber: palletForm.palletNumber.trim(),
        modelCode: palletForm.modelCode.trim(),
        boxCount: Number(palletForm.boxCount) || 0,
        grossWeightKg: Number(palletForm.grossWeightKg) || 0,
        netWeightKg: Number(palletForm.netWeightKg) || 0,
        sourceFile: 'Manual / Container UI'
      };
      setPallets((prev) => [...prev, newPallet]);
      setAllocatedPalletNumbers((prev) => new Set(prev).add(newPallet.palletNumber));
    }

    setShowPalletForm(false);
  };

  const handleDeletePallet = (index: number) => {
    const target = pallets[index];
    if (!target) return;
    setPallets((prev) => prev.filter((_, i) => i !== index));
    setAllocatedPalletNumbers((prev) => {
      const next = new Set(prev);
      next.delete(target.palletNumber);
      return next;
    });
  };

  // Save & Synchronize Equipment back to ExtractedShipmentJSON
  const handleApplyAndSync = () => {
    const updated: ExtractedShipmentJSON = {
      ...shipmentJson,
      containerNumber: containerNumber.trim(),
      sealNumber: sealNumber.trim(),
      containerType,
      tareWeightKg: Number(tareWeightKg) || 0,
      carrierName: carrierName.trim(),
      vesselName: vesselName.trim(),
      voyageNumber: voyageNumber.trim(),
      bookingNumber: bookingNumber.trim(),
      totalPallets: allocatedPalletsList.length,
      totalBoxes: totalAllocatedBoxes > 0 ? totalAllocatedBoxes : shipmentJson.totalBoxes,
      totalPackages: totalAllocatedBoxes > 0 ? totalAllocatedBoxes : shipmentJson.totalPackages,
      grossWeightKg: cargoGrossWeight > 0 ? cargoGrossWeight : shipmentJson.grossWeightKg,
      netWeightKg: cargoNetWeight > 0 ? cargoNetWeight : shipmentJson.netWeightKg,
      pallets
    };

    onUpdateShipment(updated);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Modal Top Bar */}
        <div className="h-14 px-5 border-b border-slate-800 flex items-center justify-between bg-slate-950 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
              <Boxes className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white tracking-wide">
                  Container Bay & Equipment Allocation
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                  {containerType} ({specs.maxPallets} Pallets Max)
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                Allocate cargo pallets, configure container hardware, and calculate SOLAS VGM in real time
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Main Body (2 Columns) */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
          {/* =========================================================================
              LEFT COLUMN: Pallet Allocation List (5 Cols)
              ========================================================================= */}
          <div className="lg:col-span-5 p-4 flex flex-col space-y-3 bg-slate-950/60 overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Extracted Pallets ({pallets.length})
                </h3>
                <p className="text-[10px] text-slate-400">
                  {allocatedPalletsList.length} of {pallets.length} allocated to this container bay
                </p>
              </div>

              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={handleSelectAllPallets}
                  className="px-2 py-0.5 text-[10px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAllPallets}
                  className="px-2 py-0.5 text-[10px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  None
                </button>
                <button
                  type="button"
                  onClick={handleOpenNewPallet}
                  className="px-2 py-0.5 text-[10px] rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium flex items-center space-x-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add</span>
                </button>
              </div>
            </div>

            {/* Pallets Card Grid */}
            <div className="space-y-2 flex-1 overflow-y-auto pr-1">
              {pallets.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 border border-slate-800 rounded-lg">
                  No pallets extracted. Click &quot;+ Add&quot; above to create one.
                </div>
              ) : (
                pallets.map((p, idx) => {
                  const isAllocated = allocatedPalletNumbers.has(p.palletNumber);

                  return (
                    <div
                      key={p.palletNumber || idx}
                      onClick={() => togglePalletAllocation(p.palletNumber)}
                      className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                        isAllocated
                          ? 'bg-blue-950/40 border-cyan-500/50 text-slate-100 shadow-sm'
                          : 'bg-slate-900/40 border-slate-800 text-slate-400 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={isAllocated}
                            onChange={() => togglePalletAllocation(p.palletNumber)}
                            className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0"
                          />
                          <span className="text-xs font-mono font-bold text-cyan-300">
                            {p.palletNumber}
                          </span>
                          {p.modelCode && (
                            <span className="text-[10px] font-sans px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                              {p.modelCode}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditPallet(idx);
                            }}
                            className="p-1 text-slate-500 hover:text-cyan-300 transition-colors"
                            title="Edit Pallet"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePallet(idx);
                            }}
                            className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                            title="Delete Pallet"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-1 text-[10px] font-mono mt-1 text-slate-400">
                        <div>
                          Boxes: <span className="text-white font-semibold">{p.boxCount}</span>
                        </div>
                        <div>
                          Gross: <span className="text-white font-semibold">{p.grossWeightKg} kg</span>
                        </div>
                        <div>
                          Net: <span className="text-white font-semibold">{p.netWeightKg} kg</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* =========================================================================
              RIGHT COLUMN: Visual Container Bay, Equipment Inputs & VGM (7 Cols)
              ========================================================================= */}
          <div className="lg:col-span-7 p-5 flex flex-col space-y-4 bg-slate-900/70 overflow-y-auto">
            {/* Visual Container Floorplan Load Grid */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Container Bay Load Grid
                  </span>
                  <span className="text-[10px] font-mono text-cyan-400">
                    ({allocatedPalletsList.length}/{specs.maxPallets} Pallets)
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <label className="text-[10px] text-slate-400">Equipment Type:</label>
                  <select
                    value={containerType}
                    onChange={(e) => handleContainerTypeChange(e.target.value as ContainerType)}
                    className="bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1 font-mono focus:outline-none focus:border-cyan-400"
                  >
                    <option value="20GP">20&apos; GP (Max 22 Pallets / 25,000 kg)</option>
                    <option value="40GP">40&apos; GP (Max 24 Pallets / 26,500 kg)</option>
                    <option value="40HC">40&apos; HC (Max 24 Pallets / 26,500 kg)</option>
                    <option value="45HC">45&apos; HC (Max 26 Pallets / 27,800 kg)</option>
                  </select>
                </div>
              </div>

              {/* Graphic 2-row container floorplan */}
              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg">
                <div className="text-[9px] font-mono text-slate-500 mb-2 flex justify-between">
                  <span>DOOR END &rarr;</span>
                  <span>INSIDE CONTAINER BAY ({containerType})</span>
                  <span>&larr; NOSE / FRONT</span>
                </div>

                {/* 2 Rows representing container interior */}
                <div className="space-y-1.5">
                  <div className="grid grid-cols-11 sm:grid-cols-12 gap-1">
                    {Array.from({ length: Math.ceil(specs.maxPallets / 2) }).map((_, slotIdx) => {
                      const pallet = allocatedPalletsList[slotIdx];
                      return (
                        <div
                          key={`top-${slotIdx}`}
                          className={`h-11 rounded border flex flex-col items-center justify-center p-0.5 text-center transition-all ${
                            pallet
                              ? 'bg-blue-600/30 border-cyan-400/60 text-cyan-200'
                              : 'bg-slate-950/60 border-dashed border-slate-800 text-slate-700'
                          }`}
                        >
                          {pallet ? (
                            <>
                              <span className="text-[9px] font-mono font-bold truncate max-w-full">
                                {pallet.palletNumber}
                              </span>
                              <span className="text-[8px] font-mono text-slate-400">
                                {pallet.grossWeightKg}k
                              </span>
                            </>
                          ) : (
                            <span className="text-[8px] font-mono text-slate-700">Slot {slotIdx + 1}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-11 sm:grid-cols-12 gap-1">
                    {Array.from({ length: Math.floor(specs.maxPallets / 2) }).map((_, slotIdx) => {
                      const actualIdx = Math.ceil(specs.maxPallets / 2) + slotIdx;
                      const pallet = allocatedPalletsList[actualIdx];
                      return (
                        <div
                          key={`bot-${slotIdx}`}
                          className={`h-11 rounded border flex flex-col items-center justify-center p-0.5 text-center transition-all ${
                            pallet
                              ? 'bg-blue-600/30 border-cyan-400/60 text-cyan-200'
                              : 'bg-slate-950/60 border-dashed border-slate-800 text-slate-700'
                          }`}
                        >
                          {pallet ? (
                            <>
                              <span className="text-[9px] font-mono font-bold truncate max-w-full">
                                {pallet.palletNumber}
                              </span>
                              <span className="text-[8px] font-mono text-slate-400">
                                {pallet.grossWeightKg}k
                              </span>
                            </>
                          ) : (
                            <span className="text-[8px] font-mono text-slate-700">Slot {actualIdx + 1}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Utilization Bars */}
                <div className="grid grid-cols-2 gap-4 mt-3 pt-2 border-t border-slate-800 text-[10px] font-mono">
                  <div>
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>Pallet Capacity</span>
                      <span className="text-white font-semibold">
                        {allocatedPalletsList.length} / {specs.maxPallets} ({palletUtilPct}%)
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-400 transition-all duration-300"
                        style={{ width: `${palletUtilPct}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>Payload Weight</span>
                      <span className={isOverweight ? 'text-rose-400 font-bold' : 'text-white font-semibold'}>
                        {cargoGrossWeight.toLocaleString()} / {specs.maxPayloadKg.toLocaleString()} kg ({weightUtilPct}%)
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isOverweight ? 'bg-rose-500' : 'bg-emerald-400'
                        }`}
                        style={{ width: `${weightUtilPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Equipment Inputs (Auto-syncing to DG & BOL) */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center space-x-2">
                <Scale className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Equipment & Haulier Specifications
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Container Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. MSKU1234567"
                    value={containerNumber}
                    onChange={(e) => setContainerNumber(e.target.value.toUpperCase())}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono uppercase focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Seal Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. SL987654"
                    value={sealNumber}
                    onChange={(e) => setSealNumber(e.target.value.toUpperCase())}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono uppercase focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Container Tare Weight (kg)
                  </label>
                  <input
                    type="number"
                    value={tareWeightKg || ''}
                    onChange={(e) => setTareWeightKg(Number(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Carrier Booking Reference
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BKG-99201"
                    value={bookingNumber}
                    onChange={(e) => setBookingNumber(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Carrier / Shipping Line
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Mediterranean Shipping Co."
                    value={carrierName}
                    onChange={(e) => setCarrierName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Vessel Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. MSC LAUREN"
                      value={vesselName}
                      onChange={(e) => setVesselName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Voyage Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 2401W"
                      value={voyageNumber}
                      onChange={(e) => setVoyageNumber(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Live VGM Calculator Banner */}
            <div className="p-4 bg-gradient-to-r from-blue-950/70 to-cyan-950/70 border border-cyan-500/40 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    SOLAS Verified Gross Mass (VGM — Box 19c)
                  </span>
                </div>
                <span className="text-base font-mono font-extrabold text-cyan-300">
                  {vgmWeightKg.toLocaleString()} kg
                </span>
              </div>

              <div className="p-2.5 bg-slate-950/80 rounded border border-slate-800 text-[11px] font-mono text-slate-300 flex items-center justify-between">
                <span>Cargo Gross: {cargoGrossWeight.toLocaleString()} kg</span>
                <span>+</span>
                <span>Container Tare: {Number(tareWeightKg).toLocaleString()} kg</span>
                <span>=</span>
                <span className="text-emerald-400 font-bold">VGM: {vgmWeightKg.toLocaleString()} kg</span>
              </div>

              <p className="text-[10px] text-slate-400 leading-relaxed">
                <Info className="w-3 h-3 text-cyan-400 inline mr-1" />
                Filling these equipment specifications automatically populates 7 pending fields across DG (Boxes 2, 7, 10, 19, 19b, 19c) and BOL (Booking, Vessel/Voyage, Container, Seal, Tare, VGM, and the 5-column Container Summary Table).
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="h-14 px-5 border-t border-slate-800 flex items-center justify-between bg-slate-950 shrink-0">
          <div className="flex items-center space-x-2 text-xs font-mono text-slate-400">
            <span>Allocated: {allocatedPalletsList.length} pallets</span>
            <span>&bull;</span>
            <span>Total: {totalAllocatedBoxes} boxes</span>
            <span>&bull;</span>
            <span className="text-cyan-300">VGM: {vgmWeightKg.toLocaleString()} kg</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyAndSync}
              className="px-4 py-1.5 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm flex items-center space-x-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Apply &amp; Sync to Manifests</span>
            </button>
          </div>
        </div>
      </div>

      {/* Edit / Add Pallet Inner Dialog */}
      {showPalletForm && (
        <div className="fixed inset-0 z-60 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                {editingPalletIndex !== null ? 'Edit Pallet' : 'Add New Pallet'}
              </h4>
              <button
                type="button"
                onClick={() => setShowPalletForm(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Pallet ID / Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. P-01"
                  value={palletForm.palletNumber}
                  onChange={(e) => setPalletForm((prev) => ({ ...prev, palletNumber: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Model / Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Model Code"
                  value={palletForm.modelCode}
                  onChange={(e) => setPalletForm((prev) => ({ ...prev, modelCode: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Boxes</label>
                  <input
                    type="number"
                    value={palletForm.boxCount || ''}
                    onChange={(e) => setPalletForm((prev) => ({ ...prev, boxCount: Number(e.target.value) || 0 }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Gross (kg)</label>
                  <input
                    type="number"
                    value={palletForm.grossWeightKg || ''}
                    onChange={(e) => setPalletForm((prev) => ({ ...prev, grossWeightKg: Number(e.target.value) || 0 }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Net (kg)</label>
                  <input
                    type="number"
                    value={palletForm.netWeightKg || ''}
                    onChange={(e) => setPalletForm((prev) => ({ ...prev, netWeightKg: Number(e.target.value) || 0 }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowPalletForm(false)}
                className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePalletForm}
                className="px-3.5 py-1.5 rounded text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                Save Pallet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
