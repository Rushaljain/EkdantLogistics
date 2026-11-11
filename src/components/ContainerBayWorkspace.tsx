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
  ExternalLink,
  ChevronDown,
  Layers
} from 'lucide-react';
import type {
  ExtractedShipmentJSON,
  ExtractedPallet,
  ContainerType
} from '../types/index.ts';
import { CONTAINER_SPECS } from '../types/index.ts';

export interface ContainerItem {
  id: string;
  containerNumber: string;
  sealNumber: string;
  containerType: ContainerType;
  tareWeightKg: number;
}

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

  // Multi-Container Initialization
  const initialContainers: ContainerItem[] = useMemo(() => {
    const rawConts = shipmentJson.containerNumber
      ? shipmentJson.containerNumber.split(/[,/]/).map((s) => s.trim()).filter(Boolean)
      : [];
    const rawSeals = shipmentJson.sealNumber
      ? shipmentJson.sealNumber.split(/[,/]/).map((s) => s.trim()).filter(Boolean)
      : [];

    if (rawConts.length > 1) {
      return rawConts.map((cNum, idx) => ({
        id: `container-${idx + 1}`,
        containerNumber: cNum,
        sealNumber: rawSeals[idx] || (idx === 0 ? shipmentJson.sealNumber || '' : ''),
        containerType: initialType,
        tareWeightKg: idx === 0 ? initialTare : (CONTAINER_SPECS[initialType]?.tareWeightKg || 2150)
      }));
    }

    return [
      {
        id: 'container-1',
        containerNumber: shipmentJson.containerNumber || '',
        sealNumber: shipmentJson.sealNumber || '',
        containerType: initialType,
        tareWeightKg: initialTare
      }
    ];
  }, []);

  const [containers, setContainers] = useState<ContainerItem[]>(() => initialContainers);
  const [activeContainerId, setActiveContainerId] = useState<string>(() => initialContainers[0]?.id || 'container-1');

  // Active Container and its specs
  const activeContainer = containers.find((c) => c.id === activeContainerId) || containers[0] || {
    id: 'container-1',
    containerNumber: '',
    sealNumber: '',
    containerType: '20GP' as ContainerType,
    tareWeightKg: 2150
  };
  const specs = CONTAINER_SPECS[activeContainer.containerType] || CONTAINER_SPECS['20GP'];

  // Update active container fields
  const updateActiveContainer = (partial: Partial<ContainerItem>) => {
    setContainers((prev) =>
      prev.map((c) => (c.id === activeContainer.id ? { ...c, ...partial } : c))
    );
  };

  // General shipment transport states
  const [carrierName, setCarrierName] = useState<string>(shipmentJson.carrierName || '');
  const [vesselName, setVesselName] = useState<string>(shipmentJson.vesselName || '');
  const [voyageNumber, setVoyageNumber] = useState<string>(shipmentJson.voyageNumber || '');
  const [bookingNumber, setBookingNumber] = useState<string>(shipmentJson.bookingNumber || '');

  // Pallet allocation state: maps palletNumber -> containerId (or undefined if unallocated)
  const [pallets, setPallets] = useState<ExtractedPallet[]>(() => [...initialPallets]);
  const [palletAllocationMap, setPalletAllocationMap] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    const defaultContId = initialContainers[0]?.id || 'container-1';
    initialPallets.forEach((p) => {
      map[p.palletNumber] = defaultContId;
    });
    return map;
  });

  const [hasSynced, setHasSynced] = useState<boolean>(false);
  const [showAddMenu, setShowAddMenu] = useState<boolean>(false);

  // Pallet Add / Edit modal state
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

  // Container Add modal state
  const [showContainerForm, setShowContainerForm] = useState<boolean>(false);
  const [containerForm, setContainerForm] = useState<{
    containerNumber: string;
    sealNumber: string;
    containerType: ContainerType;
    tareWeightKg: number;
  }>({
    containerNumber: '',
    sealNumber: '',
    containerType: '20GP',
    tareWeightKg: 2150
  });

  // Handle container type change for active container
  const handleContainerTypeChange = (newType: ContainerType) => {
    const newDefaultTare = CONTAINER_SPECS[newType]?.tareWeightKg || 2150;
    updateActiveContainer({
      containerType: newType,
      tareWeightKg: newDefaultTare
    });
  };

  // Toggle allocation of a pallet to the active container
  const togglePalletAllocation = (palletNumber: string) => {
    setPalletAllocationMap((prev) => {
      const next = { ...prev };
      if (next[palletNumber] === activeContainer.id) {
        delete next[palletNumber];
      } else {
        const currentCount = pallets.filter((p) => next[p.palletNumber] === activeContainer.id).length;
        if (currentCount >= specs.maxPallets) {
          return next;
        }
        next[palletNumber] = activeContainer.id;
      }
      return next;
    });
  };

  const handleSelectAllPallets = () => {
    setPalletAllocationMap((prev) => {
      const next = { ...prev };
      let count = 0;
      for (const p of pallets) {
        if (count < specs.maxPallets) {
          next[p.palletNumber] = activeContainer.id;
          count++;
        }
      }
      return next;
    });
  };

  const handleDeselectAllPallets = () => {
    setPalletAllocationMap((prev) => {
      const next = { ...prev };
      for (const p of pallets) {
        if (next[p.palletNumber] === activeContainer.id) {
          delete next[p.palletNumber];
        }
      }
      return next;
    });
  };

  // Metrics for pallets allocated to the active container
  const allocatedPalletsList = useMemo(() => {
    return pallets.filter((p) => palletAllocationMap[p.palletNumber] === activeContainer.id);
  }, [pallets, palletAllocationMap, activeContainer.id]);

  const allAllocatedPallets = useMemo(() => {
    return pallets.filter((p) => Boolean(palletAllocationMap[p.palletNumber]));
  }, [pallets, palletAllocationMap]);

  const totalAllocatedBoxes = useMemo(() => {
    return allocatedPalletsList.reduce((sum, p) => sum + (p.boxCount || 0), 0);
  }, [allocatedPalletsList]);

  const cargoGrossWeight = useMemo(() => {
    return allocatedPalletsList.reduce((sum, p) => sum + (p.grossWeightKg || 0), 0);
  }, [allocatedPalletsList]);

  const cargoNetWeight = useMemo(() => {
    return allocatedPalletsList.reduce((sum, p) => sum + (p.netWeightKg || 0), 0);
  }, [allocatedPalletsList]);

  // Live VGM Calculation for active container
  const vgmWeightKg = cargoGrossWeight + (Number(activeContainer.tareWeightKg) || 0);

  // Utilization for active container
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
      setPalletAllocationMap((prev) => ({
        ...prev,
        [newPallet.palletNumber]: activeContainer.id
      }));
    }

    setShowPalletForm(false);
  };

  const handleDeletePallet = (index: number) => {
    const target = pallets[index];
    if (!target) return;
    setPallets((prev) => prev.filter((_, i) => i !== index));
    setPalletAllocationMap((prev) => {
      const next = { ...prev };
      delete next[target.palletNumber];
      return next;
    });
  };

  // Container Creation and Deletion
  const handleOpenNewContainer = () => {
    setContainerForm({
      containerNumber: '',
      sealNumber: '',
      containerType: '20GP',
      tareWeightKg: 2150
    });
    setShowContainerForm(true);
  };

  const handleSaveContainerForm = () => {
    const newId = `container-${Date.now()}`;
    const newCont: ContainerItem = {
      id: newId,
      containerNumber: containerForm.containerNumber.trim(),
      sealNumber: containerForm.sealNumber.trim(),
      containerType: containerForm.containerType,
      tareWeightKg: Number(containerForm.tareWeightKg) || 2150
    };
    setContainers((prev) => [...prev, newCont]);
    setActiveContainerId(newId);
    setShowContainerForm(false);
  };

  const handleDeleteContainer = (idToDelete: string) => {
    if (containers.length <= 1) return;
    setContainers((prev) => prev.filter((c) => c.id !== idToDelete));
    if (activeContainerId === idToDelete) {
      const remaining = containers.filter((c) => c.id !== idToDelete);
      setActiveContainerId(remaining[0]?.id || 'container-1');
    }
    setPalletAllocationMap((prev) => {
      const next = { ...prev };
      for (const [pNum, contId] of Object.entries(next)) {
        if (contId === idToDelete) {
          delete next[pNum];
        }
      }
      return next;
    });
  };

  // Save & Synchronize Equipment back to ExtractedShipmentJSON
  const handleApplyAndSync = () => {
    const contNums = containers.map((c) => c.containerNumber.trim()).filter(Boolean);
    const sealNums = containers.map((c) => c.sealNumber.trim()).filter(Boolean);
    const primaryContNum = contNums.length > 0 ? contNums.join(', ') : activeContainer.containerNumber.trim();
    const primarySealNum = sealNums.length > 0 ? sealNums.join(', ') : activeContainer.sealNumber.trim();

    const palletNumbers = allAllocatedPallets.map((p) => p.palletNumber).filter(Boolean);
    const rangeStr =
      palletNumbers.length > 0
        ? `${palletNumbers[0]} TO ${palletNumbers[palletNumbers.length - 1]}`
        : '';

    let updatedMarks = shipmentJson.shippingMarks || '';
    if (rangeStr && !updatedMarks.includes(rangeStr)) {
      updatedMarks = `${updatedMarks}\nPALLET NOS: ${rangeStr}`.trim();
    }

    const totalAllGross = allAllocatedPallets.reduce((sum, p) => sum + (p.grossWeightKg || 0), 0);
    const totalAllNet = allAllocatedPallets.reduce((sum, p) => sum + (p.netWeightKg || 0), 0);
    const totalAllBoxes = allAllocatedPallets.reduce((sum, p) => sum + (p.boxCount || 0), 0);
    const totalAllTare = containers.reduce((sum, c) => sum + (Number(c.tareWeightKg) || 0), 0);

    const updated: ExtractedShipmentJSON = {
      ...shipmentJson,
      containerNumber: primaryContNum,
      sealNumber: primarySealNum,
      containerType: activeContainer.containerType,
      tareWeightKg: totalAllTare > 0 ? totalAllTare : Number(activeContainer.tareWeightKg) || 0,
      carrierName: carrierName.trim(),
      vesselName: vesselName.trim(),
      voyageNumber: voyageNumber.trim(),
      bookingNumber: bookingNumber.trim(),
      totalPallets: allAllocatedPallets.length > 0 ? allAllocatedPallets.length : shipmentJson.totalPallets,
      totalBoxes: totalAllBoxes > 0 ? totalAllBoxes : shipmentJson.totalBoxes,
      totalPackages: totalAllBoxes > 0 ? totalAllBoxes : shipmentJson.totalPackages,
      grossWeightKg: totalAllGross > 0 ? totalAllGross : shipmentJson.grossWeightKg,
      netWeightKg: totalAllNet > 0 ? totalAllNet : shipmentJson.netWeightKg,
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
                Container Placement &amp; Equipment Allocation
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-brand-primary-soft text-brand-primary border border-brand-primary/30 font-semibold">
                {activeContainer.containerType} ({specs.maxPallets} Pallets Max)
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
            {hasSynced ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Synced to Manifests!</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Apply &amp; Sync to Manifests</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Grid: 5 Cols Left (Pallets List) | 7 Cols Right (Bay Grid & Equipment) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* =========================================================================
            LEFT COLUMN: Pallets & Cargo Inventory (5 Cols)
            ========================================================================= */}
        <div className="lg:col-span-5 bg-surface border border-divider rounded-2xl p-4 space-y-3.5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-divider">
            <div>
              <h3 className="text-xs font-bold text-content-primary uppercase tracking-wider">
                Extracted Pallets ({pallets.length})
              </h3>
              <p className="text-[10px] text-content-secondary">
                {allocatedPalletsList.length} of {pallets.length} allocated to active container
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

              {/* Add Dropdown for Pallet & Container */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAddMenu((prev) => !prev)}
                  className="px-2.5 py-1 text-[11px] rounded bg-brand-primary hover:bg-brand-primary-hover text-brand-primary-text font-semibold flex items-center space-x-1 shadow-xs transition-colors cursor-pointer"
                  title="Add Pallet or Container"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add</span>
                  <ChevronDown className="w-3 h-3 ml-0.5" />
                </button>

                {showAddMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowAddMenu(false)}
                    />
                    <div className="absolute right-0 mt-1 w-38 bg-surface border border-divider rounded-xl shadow-xl py-1 z-50">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddMenu(false);
                          handleOpenNewPallet();
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-content-primary hover:bg-surface-secondary flex items-center space-x-2 transition-colors cursor-pointer"
                      >
                        <Layers className="w-3.5 h-3.5 text-brand-primary" />
                        <span className="font-medium">Add Pallet</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddMenu(false);
                          handleOpenNewContainer();
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-content-primary hover:bg-surface-secondary flex items-center space-x-2 transition-colors border-t border-divider/60 cursor-pointer"
                      >
                        <Boxes className="w-3.5 h-3.5 text-brand-accent" />
                        <span className="font-medium">Add Container</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Pallets Card Grid */}
          <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
            {pallets.length === 0 ? (
              <div className="p-8 text-center text-xs text-content-secondary border border-dashed border-divider rounded-xl">
                No pallets extracted. Click &quot;Add &gt; Add Pallet&quot; above to create one.
              </div>
            ) : (
              pallets.map((p, idx) => {
                const assignedContId = palletAllocationMap[p.palletNumber];
                const isAllocated = assignedContId === activeContainer.id;
                const otherCont = assignedContId && assignedContId !== activeContainer.id
                  ? containers.find((c) => c.id === assignedContId)
                  : null;

                return (
                  <div
                    key={p.palletNumber || idx}
                    onClick={() => togglePalletAllocation(p.palletNumber)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isAllocated
                        ? 'bg-brand-primary-soft/40 border-brand-primary/40 text-content-primary shadow-xs'
                        : otherCont
                        ? 'bg-amber-500/10 border-amber-500/30 text-content-primary opacity-80'
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
                        {otherCont && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-600 border border-amber-500/30">
                            {otherCont.containerNumber || 'Other Container'}
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
                          className="p-1 text-content-muted hover:text-brand-primary transition-colors cursor-pointer"
                          title="Edit Pallet Details"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePallet(idx);
                          }}
                          className="p-1 text-content-muted hover:text-state-error transition-colors cursor-pointer"
                          title="Delete Pallet"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[10px] font-mono text-content-secondary mt-1 bg-surface/60 p-1.5 rounded-lg border border-divider/60">
                      <div>
                        <span className="text-content-muted">Boxes: </span>
                        <span className="font-semibold text-content-primary">{p.boxCount || 0}</span>
                      </div>
                      <div>
                        <span className="text-content-muted">Gross: </span>
                        <span className="font-semibold text-content-primary">{p.grossWeightKg} kg</span>
                      </div>
                      <div>
                        <span className="text-content-muted">Net: </span>
                        <span className="font-semibold text-content-primary">{p.netWeightKg} kg</span>
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
          {/* Container Selection / Switcher Bar */}
          <div className="p-3 bg-surface border border-divider rounded-2xl flex flex-wrap items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center space-x-2 overflow-x-auto py-0.5 max-w-full">
              <span className="text-[11px] font-bold text-content-secondary uppercase tracking-wider shrink-0 mr-1">
                Containers ({containers.length}):
              </span>
              {containers.map((cont, idx) => {
                const isActive = cont.id === activeContainer.id;
                const contPalletsCount = pallets.filter((p) => palletAllocationMap[p.palletNumber] === cont.id).length;
                const contSpecs = CONTAINER_SPECS[cont.containerType] || CONTAINER_SPECS['20GP'];

                return (
                  <div
                    key={cont.id}
                    onClick={() => setActiveContainerId(cont.id)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-2 cursor-pointer transition-all shrink-0 ${
                      isActive
                        ? 'bg-brand-primary text-brand-primary-text border-brand-primary shadow-xs'
                        : 'bg-surface-secondary hover:bg-surface text-content-primary border-divider'
                    }`}
                  >
                    <Boxes className="w-3.5 h-3.5" />
                    <span>
                      {cont.containerNumber ? cont.containerNumber : `Container ${idx + 1}`}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                        isActive ? 'bg-white/20 text-white' : 'bg-surface border border-divider text-content-secondary'
                      }`}
                    >
                      {contPalletsCount}/{contSpecs.maxPallets}p
                    </span>
                    {containers.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteContainer(cont.id);
                        }}
                        className={`p-0.5 rounded hover:bg-red-500/20 ${isActive ? 'text-white/80 hover:text-white' : 'text-content-muted hover:text-state-error'}`}
                        title="Remove container"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleOpenNewContainer}
              className="px-2.5 py-1.5 rounded-xl border border-dashed border-divider hover:border-brand-primary text-content-secondary hover:text-brand-primary text-xs font-medium flex items-center space-x-1 transition-colors shrink-0 cursor-pointer"
              title="Add New Container"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Container</span>
            </button>
          </div>

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
                  value={activeContainer.containerType}
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
                <span className="font-bold text-content-secondary">BAY INTERIOR ({activeContainer.containerType})</span>
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

          {/* Equipment Inputs for the Active Container (Auto-syncing to DG & BOL) */}
          <div className="p-5 bg-surface border border-divider rounded-2xl space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Scale className="w-4 h-4 text-brand-primary" />
                <h3 className="text-xs font-bold text-content-primary uppercase tracking-wider">
                  Active Container &amp; Haulier Specifications
                </h3>
              </div>
              <span className="text-[10px] font-mono text-content-muted">
                Editing: {activeContainer.containerNumber || 'Container'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-content-secondary mb-1">
                  Container Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. MSKU1234567"
                  value={activeContainer.containerNumber}
                  onChange={(e) => updateActiveContainer({ containerNumber: e.target.value.toUpperCase() })}
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
                  value={activeContainer.sealNumber}
                  onChange={(e) => updateActiveContainer({ sealNumber: e.target.value.toUpperCase() })}
                  className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary font-mono uppercase focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-content-secondary mb-1">
                  Container Tare Weight (kg)
                </label>
                <input
                  type="number"
                  value={activeContainer.tareWeightKg || ''}
                  onChange={(e) => updateActiveContainer({ tareWeightKg: Number(e.target.value) || 0 })}
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

              <div>
                <label className="block text-[11px] font-medium text-content-secondary mb-1">
                  Vessel Name &amp; Voyage Number
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="e.g. MSC LAUREN"
                    value={vesselName}
                    onChange={(e) => setVesselName(e.target.value)}
                    className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                  />
                  <input
                    type="text"
                    placeholder="e.g. 246W"
                    value={voyageNumber}
                    onChange={(e) => setVoyageNumber(e.target.value)}
                    className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Real-time SOLAS VGM Indicator Card */}
          <div className="p-4 bg-surface border border-divider rounded-2xl shadow-sm space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-content-secondary">Cargo Gross ({cargoGrossWeight.toLocaleString()} kg) + Tare ({activeContainer.tareWeightKg} kg)</span>
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
                className="text-content-muted hover:text-content-primary cursor-pointer"
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
                className="px-3 py-1.5 rounded-lg text-xs text-content-secondary hover:text-content-primary cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePalletForm}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-brand-primary hover:bg-brand-primary-hover text-brand-primary-text shadow-sm cursor-pointer"
              >
                Save Pallet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Container Modal */}
      {showContainerForm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-divider rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-divider">
              <div className="flex items-center space-x-2">
                <Boxes className="w-4 h-4 text-brand-primary" />
                <h4 className="text-xs font-bold text-content-primary uppercase tracking-wider">
                  Add New Container
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowContainerForm(false)}
                className="text-content-muted hover:text-content-primary cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-content-secondary mb-1">
                  Container Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. MSKU1234567"
                  value={containerForm.containerNumber}
                  onChange={(e) => setContainerForm((prev) => ({ ...prev, containerNumber: e.target.value.toUpperCase() }))}
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
                  value={containerForm.sealNumber}
                  onChange={(e) => setContainerForm((prev) => ({ ...prev, sealNumber: e.target.value.toUpperCase() }))}
                  className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary font-mono uppercase focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-content-secondary mb-1">
                  Container Equipment Type
                </label>
                <select
                  value={containerForm.containerType}
                  onChange={(e) => {
                    const t = e.target.value as ContainerType;
                    const defaultT = CONTAINER_SPECS[t]?.tareWeightKg || 2150;
                    setContainerForm((prev) => ({ ...prev, containerType: t, tareWeightKg: defaultT }));
                  }}
                  className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary font-mono focus:outline-none focus:border-brand-primary cursor-pointer"
                >
                  <option value="20GP">20&apos; GP (Max 22 Pallets / 25,000 kg)</option>
                  <option value="40GP">40&apos; GP (Max 40 Pallets / 28,500 kg)</option>
                  <option value="40HC">40&apos; HC (Max 40 Pallets / 28,500 kg)</option>
                  <option value="45HC">45&apos; HC (Max 44 Pallets / 28,500 kg)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-content-secondary mb-1">
                  Tare Weight (kg)
                </label>
                <input
                  type="number"
                  value={containerForm.tareWeightKg || ''}
                  onChange={(e) => setContainerForm((prev) => ({ ...prev, tareWeightKg: Number(e.target.value) || 0 }))}
                  className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-divider">
              <button
                type="button"
                onClick={() => setShowContainerForm(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-content-secondary hover:text-content-primary cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveContainerForm}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-brand-primary hover:bg-brand-primary-hover text-brand-primary-text shadow-sm cursor-pointer"
              >
                Add Container
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
