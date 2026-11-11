import React, { useState, useMemo } from 'react';
import {
  Boxes,
  CheckCircle2,
  Plus,
  Trash2,
  Sparkles,
  Info,
  Scale,
  Edit2,
  X,
  FileText,
  ExternalLink
} from 'lucide-react';
import type {
  ExtractedShipmentJSON,
  ExtractedPallet,
  ContainerType
} from '../types/index.ts';
import { CONTAINER_SPECS } from '../types/index.ts';

interface ContainerBayWorkspaceProps {
  shipmentJson: ExtractedShipmentJSON;
  onUpdateShipment: (updated: ExtractedShipmentJSON) => void;
  onSwitchTab?: (tab: 'dg_manifest' | 'bl_manifest') => void;
}

export function ContainerBayWorkspace({
  shipmentJson,
  onUpdateShipment,
  onSwitchTab
}: ContainerBayWorkspaceProps): React.JSX.Element {
  // Smart Equipment Constraint Auto-Selection on initialization
  const initialPallets = shipmentJson.pallets || [];
  const pCount = initialPallets.length || shipmentJson.totalPallets || 0;
  const grossWt = shipmentJson.grossWeightKg || 0;

  const initialType: ContainerType =
    shipmentJson.containerType && shipmentJson.containerType !== '20GP'
      ? shipmentJson.containerType
      : pCount > 22 || grossWt > 25000
      ? '40GP'
      : '20GP';

  const defaultTare = CONTAINER_SPECS[initialType]?.tareWeightKg || 2150;
  const initialTare = shipmentJson.tareWeightKg > 0 ? shipmentJson.tareWeightKg : defaultTare;

  // Equipment input states
  const [containerNumber, setContainerNumber] = useState<string>(shipmentJson.containerNumber || '');
  const [sealNumber, setSealNumber] = useState<string>(shipmentJson.sealNumber || '');
  const [containerType, setContainerType] = useState<ContainerType>(initialType);
  const [tareWeightKg, setTareWeightKg] = useState<number>(initialTare);
  const [carrierName, setCarrierName] = useState<string>(shipmentJson.carrierName || '');
  const [vesselName, setVesselName] = useState<string>(shipmentJson.vesselName || '');
  const [voyageNumber, setVoyageNumber] = useState<string>(shipmentJson.voyageNumber || '');
  const [bookingNumber, setBookingNumber] = useState<string>(shipmentJson.bookingNumber || '');

  // Pallet allocation state: 100% default auto-allocation
  const [pallets, setPallets] = useState<ExtractedPallet[]>(() => [...initialPallets]);
  const [allocatedPalletNumbers, setAllocatedPalletNumbers] = useState<Set<string>>(() => {
    return new Set(initialPallets.map((p) => p.palletNumber));
  });

  const [hasSynced, setHasSynced] = useState<boolean>(false);

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

  // Handle container type change
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
          return next;
        }
        next.add(palletNumber);
      }
      return next;
    });
  };

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
      modelCode: shipmentJson.productDescription?.split('\n')[0]?.slice(0, 30) || 'STANDARD',
      boxCount: 40,
      grossWeightKg: 1020,
      netWeightKg: 980
    });
    setShowPalletForm(true);
  };

  const handleSavePalletForm = () => {
    if (!palletForm.palletNumber.trim()) return;

    if (editingPalletIndex !== null) {
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
      const newPallet: ExtractedPallet = {
        palletNumber: palletForm.palletNumber.trim(),
        modelCode: palletForm.modelCode.trim(),
        boxCount: Number(palletForm.boxCount) || 0,
        grossWeightKg: Number(palletForm.grossWeightKg) || 0,
        netWeightKg: Number(palletForm.netWeightKg) || 0,
        sourceFile: 'Container Bay Workspace'
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
    // Generate updated pallet range in shippingMarks
    const palletNumbers = allocatedPalletsList.map((p) => p.palletNumber).filter(Boolean);
    const rangeStr =
      palletNumbers.length > 0
        ? `${palletNumbers[0]} TO ${palletNumbers[palletNumbers.length - 1]}`
        : '';

    let updatedMarks = shipmentJson.shippingMarks || '';
    if (rangeStr && !updatedMarks.includes(rangeStr)) {
      updatedMarks = `${updatedMarks}\nPALLET NOS: ${rangeStr}`.trim();
    }

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
      totalPallets: allocatedPalletsList.length > 0 ? allocatedPalletsList.length : shipmentJson.totalPallets,
      totalBoxes: totalAllocatedBoxes > 0 ? totalAllocatedBoxes : shipmentJson.totalBoxes,
      totalPackages: totalAllocatedBoxes > 0 ? totalAllocatedBoxes : shipmentJson.totalPackages,
      grossWeightKg: cargoGrossWeight > 0 ? cargoGrossWeight : shipmentJson.grossWeightKg,
      netWeightKg: cargoNetWeight > 0 ? cargoNetWeight : shipmentJson.netWeightKg,
      shippingMarks: updatedMarks,
      pallets
    };

    onUpdateShipment(updated);
    setHasSynced(true);
    setTimeout(() => setHasSynced(false), 3000);
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-5 pb-8">
      {/* Top Header & Fast Navigation Ribbon */}
      <div className="p-4 bg-surface border border-divider rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-brand-primary-soft border border-brand-primary/30 flex items-center justify-center">
            <Boxes className="w-5 h-5 text-brand-primary" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-content-primary uppercase tracking-wider">
                Container Bay &amp; Equipment Allocation
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-brand-primary-soft text-brand-primary border border-brand-primary/30 font-semibold">
                {containerType} ({specs.maxPallets} Pallets Max)
              </span>
            </div>
            <p className="text-xs text-content-secondary mt-0.5">
              Live payload distribution, slot placement, and real-time SOLAS VGM synchronization
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {onSwitchTab && (
            <div className="flex items-center space-x-1.5 mr-2 border-r border-divider pr-3">
              <button
                type="button"
                onClick={() => onSwitchTab('dg_manifest')}
                className="px-2.5 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface text-content-secondary hover:text-content-primary text-xs font-medium border border-divider flex items-center space-x-1 transition-colors"
                title="View DG Manifest Document"
              >
                <FileText className="w-3.5 h-3.5 text-brand-primary" />
                <span>DG Manifest</span>
              </button>
              <button
                type="button"
                onClick={() => onSwitchTab('bl_manifest')}
                className="px-2.5 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface text-content-secondary hover:text-content-primary text-xs font-medium border border-divider flex items-center space-x-1 transition-colors"
                title="View Bill of Lading Document"
              >
                <ExternalLink className="w-3.5 h-3.5 text-brand-accent" />
                <span>Bill of Lading</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleApplyAndSync}
            className={`px-4 py-2 rounded-xl text-xs font-bold shadow-sm flex items-center space-x-2 transition-all ${
              hasSynced
                ? 'bg-state-success text-white'
                : 'bg-brand-primary hover:bg-brand-primary-hover text-brand-primary-text'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{hasSynced ? '✓ Synced to DG & BOL' : 'Apply & Sync to Manifests'}</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Body (2 Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* =========================================================================
            LEFT COLUMN: Pallet Allocation List (5 Cols)
            ========================================================================= */}
        <div className="lg:col-span-5 p-4 bg-surface border border-divider rounded-2xl flex flex-col space-y-3.5 shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-divider">
            <div>
              <h3 className="text-xs font-bold text-content-primary uppercase tracking-wider">
                Extracted Pallets ({pallets.length})
              </h3>
              <p className="text-[10px] text-content-secondary">
                {allocatedPalletsList.length} of {pallets.length} allocated to this container bay
              </p>
            </div>

            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={handleSelectAllPallets}
                className="px-2.5 py-1 text-[11px] rounded bg-surface-secondary hover:bg-surface text-content-primary border border-divider font-medium transition-colors"
              >
                All
              </button>
              <button
                type="button"
                onClick={handleDeselectAllPallets}
                className="px-2.5 py-1 text-[11px] rounded bg-surface-secondary hover:bg-surface text-content-primary border border-divider font-medium transition-colors"
              >
                None
              </button>
              <button
                type="button"
                onClick={handleOpenNewPallet}
                className="px-2.5 py-1 text-[11px] rounded bg-brand-primary hover:bg-brand-primary-hover text-brand-primary-text font-semibold flex items-center space-x-1 shadow-xs transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* Pallets Card Grid */}
          <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
            {pallets.length === 0 ? (
              <div className="p-8 text-center text-xs text-content-secondary border border-dashed border-divider rounded-xl">
                No pallets extracted. Click &quot;+ Add&quot; above to create one.
              </div>
            ) : (
              pallets.map((p, idx) => {
                const isAllocated = allocatedPalletNumbers.has(p.palletNumber);

                return (
                  <div
                    key={p.palletNumber || idx}
                    onClick={() => togglePalletAllocation(p.palletNumber)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isAllocated
                        ? 'bg-brand-primary-soft/40 border-brand-primary/40 text-content-primary shadow-xs'
                        : 'bg-surface-secondary/60 border-divider text-content-secondary hover:border-brand-primary/30 opacity-75'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={isAllocated}
                          onChange={() => togglePalletAllocation(p.palletNumber)}
                          className="rounded border-divider bg-input-bg text-brand-primary focus:ring-0 cursor-pointer"
                        />
                        <span className="text-xs font-mono font-bold text-brand-primary">
                          {p.palletNumber}
                        </span>
                        {p.modelCode && (
                          <span className="text-[10px] font-sans px-1.5 py-0.2 rounded bg-surface border border-divider text-content-primary truncate max-w-[130px]">
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
                          className="p-1 text-content-muted hover:text-brand-primary transition-colors"
                          title="Edit Pallet"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePallet(idx);
                          }}
                          className="p-1 text-content-muted hover:text-state-error transition-colors"
                          title="Delete Pallet"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1 text-[11px] font-mono text-content-secondary pt-1 border-t border-divider/60">
                      <div>
                        Boxes: <span className="text-content-primary font-semibold">{p.boxCount}</span>
                      </div>
                      <div>
                        Gross: <span className="text-content-primary font-semibold">{p.grossWeightKg.toLocaleString()} kg</span>
                      </div>
                      <div>
                        Net: <span className="text-content-primary font-semibold">{p.netWeightKg.toLocaleString()} kg</span>
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
        <div className="lg:col-span-7 flex flex-col space-y-4">
          {/* Visual Container Floorplan Load Grid */}
          <div className="p-5 bg-surface border border-divider rounded-2xl space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-content-primary uppercase tracking-wider">
                  Container Bay Load Grid
                </span>
                <span className="text-[11px] font-mono font-semibold text-brand-primary">
                  ({allocatedPalletsList.length}/{specs.maxPallets} Pallets)
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <label className="text-xs text-content-secondary font-medium">Equipment:</label>
                <select
                  value={containerType}
                  onChange={(e) => handleContainerTypeChange(e.target.value as ContainerType)}
                  className="bg-input-bg border border-divider text-xs text-content-primary rounded-lg px-2.5 py-1 font-mono focus:outline-none focus:border-brand-primary font-medium cursor-pointer"
                >
                  <option value="20GP">20&apos; GP (Max 22 Pallets / 25,000 kg)</option>
                  <option value="40GP">40&apos; GP (Max 40 Pallets / 28,500 kg)</option>
                  <option value="40HC">40&apos; HC (Max 40 Pallets / 28,500 kg)</option>
                  <option value="45HC">45&apos; HC (Max 44 Pallets / 28,500 kg)</option>
                </select>
              </div>
            </div>

            {/* Graphic 2-row container floorplan */}
            <div className="p-4 bg-surface-secondary border border-divider rounded-xl">
              <div className="text-[9px] font-mono text-content-muted mb-2.5 flex justify-between uppercase tracking-wider">
                <span>DOOR END &rarr;</span>
                <span className="font-bold text-content-secondary">BAY INTERIOR ({containerType})</span>
                <span>&larr; NOSE / FRONT</span>
              </div>

              {/* 2 Rows representing container interior */}
              <div className="space-y-1.5">
                <div className="grid grid-cols-11 sm:grid-cols-12 gap-1.5">
                  {Array.from({ length: Math.ceil(specs.maxPallets / 2) }).map((_, slotIdx) => {
                    const pallet = allocatedPalletsList[slotIdx];
                    return (
                      <div
                        key={`top-${slotIdx}`}
                        onClick={() => pallet && togglePalletAllocation(pallet.palletNumber)}
                        className={`h-12 rounded-lg border flex flex-col items-center justify-center p-1 text-center transition-all cursor-pointer ${
                          pallet
                            ? 'bg-brand-primary-soft border-brand-primary/50 text-brand-primary shadow-xs hover:border-brand-primary'
                            : 'bg-surface border-dashed border-divider text-content-muted hover:border-brand-primary/40'
                        }`}
                        title={pallet ? `Click to unallocate ${pallet.palletNumber}` : `Empty Slot ${slotIdx + 1}`}
                      >
                        {pallet ? (
                          <>
                            <span className="text-[9px] font-mono font-bold truncate max-w-full">
                              {pallet.palletNumber}
                            </span>
                            <span className="text-[8px] font-mono text-content-secondary">
                              {pallet.grossWeightKg}k
                            </span>
                          </>
                        ) : (
                          <span className="text-[8px] font-mono text-content-muted">Slot {slotIdx + 1}</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-11 sm:grid-cols-12 gap-1.5">
                  {Array.from({ length: Math.floor(specs.maxPallets / 2) }).map((_, slotIdx) => {
                    const actualIdx = Math.ceil(specs.maxPallets / 2) + slotIdx;
                    const pallet = allocatedPalletsList[actualIdx];
                    return (
                      <div
                        key={`bot-${slotIdx}`}
                        onClick={() => pallet && togglePalletAllocation(pallet.palletNumber)}
                        className={`h-12 rounded-lg border flex flex-col items-center justify-center p-1 text-center transition-all cursor-pointer ${
                          pallet
                            ? 'bg-brand-primary-soft border-brand-primary/50 text-brand-primary shadow-xs hover:border-brand-primary'
                            : 'bg-surface border-dashed border-divider text-content-muted hover:border-brand-primary/40'
                        }`}
                        title={pallet ? `Click to unallocate ${pallet.palletNumber}` : `Empty Slot ${actualIdx + 1}`}
                      >
                        {pallet ? (
                          <>
                            <span className="text-[9px] font-mono font-bold truncate max-w-full">
                              {pallet.palletNumber}
                            </span>
                            <span className="text-[8px] font-mono text-content-secondary">
                              {pallet.grossWeightKg}k
                            </span>
                          </>
                        ) : (
                          <span className="text-[8px] font-mono text-content-muted">Slot {actualIdx + 1}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Utilization Bars */}
              <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-divider text-[11px] font-mono">
                <div>
                  <div className="flex justify-between text-content-secondary mb-1">
                    <span>Pallet Capacity</span>
                    <span className="text-content-primary font-semibold">
                      {allocatedPalletsList.length} / {specs.maxPallets} ({palletUtilPct}%)
                    </span>
                  </div>
                  <div className="h-2 bg-surface rounded-full overflow-hidden border border-divider">
                    <div
                      className="h-full bg-brand-primary transition-all duration-300"
                      style={{ width: `${palletUtilPct}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-content-secondary mb-1">
                    <span>Payload Weight</span>
                    <span className={isOverweight ? 'text-state-error font-bold' : 'text-content-primary font-semibold'}>
                      {cargoGrossWeight.toLocaleString()} / {specs.maxPayloadKg.toLocaleString()} kg ({weightUtilPct}%)
                    </span>
                  </div>
                  <div className="h-2 bg-surface rounded-full overflow-hidden border border-divider">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isOverweight ? 'bg-state-error' : 'bg-state-success'
                      }`}
                      style={{ width: `${weightUtilPct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Equipment Inputs (Auto-syncing to DG & BOL) */}
          <div className="p-5 bg-surface border border-divider rounded-2xl space-y-3.5 shadow-sm">
            <div className="flex items-center space-x-2">
              <Scale className="w-4 h-4 text-brand-primary" />
              <h3 className="text-xs font-bold text-content-primary uppercase tracking-wider">
                Equipment &amp; Haulier Specifications
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-content-secondary mb-1">
                  Container Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. MSKU1234567"
                  value={containerNumber}
                  onChange={(e) => setContainerNumber(e.target.value.toUpperCase())}
                  className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary font-mono uppercase focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-content-secondary mb-1">
                  Seal Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. SL987654"
                  value={sealNumber}
                  onChange={(e) => setSealNumber(e.target.value.toUpperCase())}
                  className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary font-mono uppercase focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-content-secondary mb-1">
                  Container Tare Weight (kg)
                </label>
                <input
                  type="number"
                  value={tareWeightKg || ''}
                  onChange={(e) => setTareWeightKg(Number(e.target.value) || 0)}
                  className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-content-secondary mb-1">
                  Carrier Booking Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. BKG-99201"
                  value={bookingNumber}
                  onChange={(e) => setBookingNumber(e.target.value)}
                  className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-content-secondary mb-1">
                  Carrier / Shipping Line
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pacific Maritime Line"
                  value={carrierName}
                  onChange={(e) => setCarrierName(e.target.value)}
                  className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-content-secondary mb-1">
                    Vessel Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. PACIFIC VOYAGER"
                    value={vesselName}
                    onChange={(e) => setVesselName(e.target.value)}
                    className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-content-secondary mb-1">
                    Voyage Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2602E"
                    value={voyageNumber}
                    onChange={(e) => setVoyageNumber(e.target.value)}
                    className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Live VGM Calculator Banner */}
          <div className="p-4 bg-brand-primary-soft border border-brand-primary/30 rounded-2xl space-y-2 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-brand-primary" />
                <span className="text-xs font-bold text-content-primary uppercase tracking-wider">
                  SOLAS Verified Gross Mass (VGM — Box 19c)
                </span>
              </div>
              <span className="text-base font-mono font-extrabold text-brand-primary">
                {vgmWeightKg.toLocaleString()} kg
              </span>
            </div>

            <div className="p-2.5 bg-surface rounded-xl border border-divider text-xs font-mono text-content-primary flex items-center justify-between">
              <span>Cargo Gross: {cargoGrossWeight.toLocaleString()} kg</span>
              <span className="text-content-muted">+</span>
              <span>Container Tare: {Number(tareWeightKg).toLocaleString()} kg</span>
              <span className="text-content-muted">=</span>
              <span className="text-state-success font-bold">VGM: {vgmWeightKg.toLocaleString()} kg</span>
            </div>

            <p className="text-[11px] text-content-secondary leading-relaxed">
              <Info className="w-3.5 h-3.5 text-brand-primary inline mr-1" />
              Equipment parameters immediately propagate to pending fields in DG Manifest (Boxes 2, 7, 10, 19, 19b, 19c) and Bill of Lading (Booking, Vessel/Voyage, Container, Seal, Tare, VGM, and Container Summary Table).
            </p>
          </div>
        </div>
      </div>

      {/* Edit / Add Pallet Modal */}
      {showPalletForm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-divider rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-divider">
              <h4 className="text-xs font-bold text-content-primary uppercase tracking-wider">
                {editingPalletIndex !== null ? 'Edit Pallet' : 'Add New Pallet'}
              </h4>
              <button
                type="button"
                onClick={() => setShowPalletForm(false)}
                className="text-content-muted hover:text-content-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-content-secondary mb-1">
                  Pallet ID / Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. P-01"
                  value={palletForm.palletNumber}
                  onChange={(e) => setPalletForm((prev) => ({ ...prev, palletNumber: e.target.value }))}
                  className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-content-secondary mb-1">
                  Model / Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Model Code"
                  value={palletForm.modelCode}
                  onChange={(e) => setPalletForm((prev) => ({ ...prev, modelCode: e.target.value }))}
                  className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-content-secondary mb-1">Boxes</label>
                  <input
                    type="number"
                    value={palletForm.boxCount || ''}
                    onChange={(e) => setPalletForm((prev) => ({ ...prev, boxCount: Number(e.target.value) || 0 }))}
                    className="w-full bg-input-bg border border-divider rounded-lg px-2.5 py-2 text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-content-secondary mb-1">Gross (kg)</label>
                  <input
                    type="number"
                    value={palletForm.grossWeightKg || ''}
                    onChange={(e) => setPalletForm((prev) => ({ ...prev, grossWeightKg: Number(e.target.value) || 0 }))}
                    className="w-full bg-input-bg border border-divider rounded-lg px-2.5 py-2 text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-content-secondary mb-1">Net (kg)</label>
                  <input
                    type="number"
                    value={palletForm.netWeightKg || ''}
                    onChange={(e) => setPalletForm((prev) => ({ ...prev, netWeightKg: Number(e.target.value) || 0 }))}
                    className="w-full bg-input-bg border border-divider rounded-lg px-2.5 py-2 text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-divider">
              <button
                type="button"
                onClick={() => setShowPalletForm(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-content-secondary hover:text-content-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePalletForm}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-brand-primary hover:bg-brand-primary-hover text-brand-primary-text shadow-sm"
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
