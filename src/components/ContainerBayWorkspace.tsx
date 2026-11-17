import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Boxes,
  Plus,
  Trash2,
  Scale,
  Edit2,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  GripVertical
} from 'lucide-react';
import type {
  ExtractedShipmentJSON,
  ExtractedPallet,
  ContainerType,
  ContainerAllocation
} from '../types/index.ts';
import { CONTAINER_SPECS } from '../types/index.ts';
import { autoAllocate20GPContainers } from '../utils/manifestKeywordReference.ts';

export interface ContainerItem {
  id: string;
  label: string;
  containerNumber: string;
  sealNumber: string;
  containerType: ContainerType;
  tareWeightKg: number;
  bookingNumber?: string;
  palletIndices?: number[];
}

interface ContainerBayWorkspaceProps {
  shipmentJson: ExtractedShipmentJSON;
  onUpdateShipment: (updated: ExtractedShipmentJSON) => void;
  onSwitchTab?: (tab: 'dg_manifest' | 'bl_manifest') => void;
  registerSyncHandler?: (handler: () => void) => void;
}

export function ContainerBayWorkspace({
  shipmentJson,
  onUpdateShipment,
  onSwitchTab: _onSwitchTab,
  registerSyncHandler
}: ContainerBayWorkspaceProps): React.JSX.Element {
  // Hard-locked 20' GP container type and default tare
  const initialPallets: ExtractedPallet[] = useMemo(() => {
    return (shipmentJson.pallets || []).map((p) => {
      const pBrand = (p.brand || shipmentJson.brandName || '').trim();
      const pInv = (
        p.invoiceNumber ||
        (shipmentJson.invoiceNumbers && shipmentJson.invoiceNumbers.length === 1 ? shipmentJson.invoiceNumbers[0] : undefined) ||
        (shipmentJson.invoiceNumbers && shipmentJson.invoiceNumbers.length > 1 && p.sourceFile
          ? shipmentJson.invoiceNumbers.find((inv) => p.sourceFile?.toLowerCase().includes(inv.toLowerCase()))
          : undefined) ||
        ''
      ).trim();
      return {
        ...p,
        brand: pBrand || undefined,
        invoiceNumber: pInv || undefined
      };
    });
  }, [shipmentJson.pallets, shipmentJson.brandName, shipmentJson.invoiceNumbers]);

  // Deterministic 20' GP multi-container allocation (Max 22 Pallets / 25,000 kg)
  const initialContainers: ContainerItem[] = useMemo(() => {
    if (shipmentJson.containers && shipmentJson.containers.length > 0) {
      return shipmentJson.containers.map((c, idx) => ({
        id: c.id || `container-${idx + 1}`,
        label: c.label || `Container ${idx + 1}`,
        containerNumber: c.containerNumber || '',
        sealNumber: c.sealNumber || '',
        containerType: '20GP' as ContainerType,
        tareWeightKg: c.tareWeightKg || 2150,
        bookingNumber: c.bookingNumber || shipmentJson.bookingNumber || '',
        palletIndices: c.palletIndices || []
      }));
    }
    const allocated = autoAllocate20GPContainers(
      shipmentJson.pallets || [],
      undefined,
      shipmentJson.containerNumber,
      shipmentJson.sealNumber
    );
    return allocated.map((c, idx) => ({
      id: c.id || `container-${idx + 1}`,
      label: c.label || `Container ${idx + 1}`,
      containerNumber: c.containerNumber || '',
      sealNumber: c.sealNumber || '',
      containerType: '20GP' as ContainerType,
      tareWeightKg: c.tareWeightKg || 2150,
      bookingNumber: c.bookingNumber || shipmentJson.bookingNumber || '',
      palletIndices: c.palletIndices || []
    }));
  }, [shipmentJson.containers, shipmentJson.pallets, shipmentJson.containerNumber, shipmentJson.sealNumber, shipmentJson.bookingNumber]);

  // Multi-Container State
  const [containers, setContainers] = useState<ContainerItem[]>(() => initialContainers);
  const [activeContainerId, setActiveContainerId] = useState<string>(() => initialContainers[0]?.id || 'container-1');

  // Active Container and its specs (Locked to 20' GP)
  const activeContainer = containers.find((c) => c.id === activeContainerId) || containers[0] || {
    id: 'container-1',
    label: 'Container 1',
    containerNumber: '',
    sealNumber: '',
    containerType: '20GP' as ContainerType,
    tareWeightKg: 2150
  };
  const specs = CONTAINER_SPECS['20GP'];

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
    initialContainers.forEach((cont) => {
      if (cont.palletIndices && cont.palletIndices.length > 0) {
        cont.palletIndices.forEach((pIdx) => {
          const p = initialPallets[pIdx];
          if (p) {
            map[p.palletNumber] = cont.id;
          }
        });
      }
    });

    // Fallback: assign remaining sequentially within 20' GP limits
    let contIdx = 0;
    let countInCont = 0;
    initialPallets.forEach((p) => {
      if (!map[p.palletNumber]) {
        if (countInCont >= 22) {
          contIdx++;
          countInCont = 0;
        }
        const targetCont = initialContainers[contIdx] || initialContainers[0];
        map[p.palletNumber] = targetCont?.id || 'container-1';
        countInCont++;
      }
    });
    return map;
  });

  const [, setHasSynced] = useState<boolean>(false);
  const [showAddMenu, setShowAddMenu] = useState<boolean>(false);

  // Pallet Add / Edit modal state
  const [editingPalletIndex, setEditingPalletIndex] = useState<number | null>(null);
  const [palletForm, setPalletForm] = useState<{
    palletNumber: string;
    modelCode: string;
    brand: string;
    invoiceNumber: string;
    boxCount: number;
    grossWeightKg: number;
    netWeightKg: number;
  }>({
    palletNumber: '',
    modelCode: '',
    brand: '',
    invoiceNumber: '',
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

  // Move a pallet to a specific container (or unallocate)
  const movePalletToContainer = (palletNumber: string, targetContainerId: string | null) => {
    setPalletAllocationMap((prev) => {
      const next = { ...prev };
      if (!targetContainerId) {
        delete next[palletNumber];
      } else {
        const targetCont = containers.find((c) => c.id === targetContainerId);
        const targetSpecs = CONTAINER_SPECS[targetCont?.containerType || '20GP'] || CONTAINER_SPECS['20GP'];
        const currentInTarget = pallets.filter((p) => next[p.palletNumber] === targetContainerId && p.palletNumber !== palletNumber).length;
        if (currentInTarget >= targetSpecs.maxPallets) {
          return next;
        }
        next[palletNumber] = targetContainerId;
      }
      return next;
    });
  };

  // Drag and drop states
  const [draggedPalletNumber, setDraggedPalletNumber] = useState<string | null>(null);
  const [dragOverContainerId, setDragOverContainerId] = useState<string | null>(null);
  const containerTabsRef = useRef<HTMLDivElement | null>(null);
  const autoScrollTimerRef = useRef<number | null>(null);

  // Carousel navigation handlers
  const activeContainerIndex = useMemo(() => {
    const idx = containers.findIndex((c) => c.id === activeContainer.id);
    return idx >= 0 ? idx : 0;
  }, [containers, activeContainer.id]);

  const handlePrevContainer = () => {
    if (activeContainerIndex > 0) {
      const prevCont = containers[activeContainerIndex - 1];
      if (prevCont) {
        setActiveContainerId(prevCont.id);
        scrollContainerIntoView(prevCont.id);
      }
    }
  };

  const handleNextContainer = () => {
    if (activeContainerIndex < containers.length - 1) {
      const nextCont = containers[activeContainerIndex + 1];
      if (nextCont) {
        setActiveContainerId(nextCont.id);
        scrollContainerIntoView(nextCont.id);
      }
    }
  };

  const scrollContainerIntoView = (contId: string) => {
    if (!containerTabsRef.current) return;
    const tabEl = containerTabsRef.current.querySelector(`[data-container-id="${contId}"]`) as HTMLElement | null;
    if (tabEl) {
      tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  };

  // Auto-scroll carousel during drag near edges
  const handleDragOverCarousel = (e: React.DragEvent) => {
    e.preventDefault();
    if (!containerTabsRef.current) return;
    const rect = containerTabsRef.current.getBoundingClientRect();
    const mouseX = e.clientX;
    const edgeThreshold = 60;

    if (autoScrollTimerRef.current) {
      window.clearInterval(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }

    if (mouseX < rect.left + edgeThreshold) {
      // Near left edge -> scroll left and show previous container
      autoScrollTimerRef.current = window.setInterval(() => {
        if (containerTabsRef.current) {
          containerTabsRef.current.scrollLeft -= 15;
        }
      }, 30);
    } else if (mouseX > rect.right - edgeThreshold) {
      // Near right edge -> scroll right and show next container
      autoScrollTimerRef.current = window.setInterval(() => {
        if (containerTabsRef.current) {
          containerTabsRef.current.scrollLeft += 15;
        }
      }, 30);
    }
  };

  const handleDragLeaveCarousel = () => {
    if (autoScrollTimerRef.current) {
      window.clearInterval(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (autoScrollTimerRef.current) {
        window.clearInterval(autoScrollTimerRef.current);
      }
    };
  }, []);

  // Toggle allocation of a pallet to the active container (with auto-spill & auto-spawn)
  const togglePalletAllocation = (palletNumber: string) => {
    const targetPallet = pallets.find((p) => p.palletNumber === palletNumber);
    const targetGross = targetPallet?.grossWeightKg || 0;

    setPalletAllocationMap((prev) => {
      const next = { ...prev };
      if (next[palletNumber] === activeContainer.id) {
        delete next[palletNumber];
        return next;
      }

      // Check active container capacity (Max 22 Pallets / 25,000 kg payload)
      const currentInActive = pallets.filter((p) => next[p.palletNumber] === activeContainer.id && p.palletNumber !== palletNumber);
      const activeGross = currentInActive.reduce((s, p) => s + (p.grossWeightKg || 0), 0);

      if (currentInActive.length + 1 <= 22 && activeGross + targetGross <= 25000) {
        next[palletNumber] = activeContainer.id;
        return next;
      }

      // Active container is full -> spill into next available container or spawn new 20' GP container
      let targetContId = '';
      for (const cont of containers) {
        if (cont.id === activeContainer.id) continue;
        const inCont = pallets.filter((p) => next[p.palletNumber] === cont.id && p.palletNumber !== palletNumber);
        const contGross = inCont.reduce((s, p) => s + (p.grossWeightKg || 0), 0);
        if (inCont.length + 1 <= 22 && contGross + targetGross <= 25000) {
          targetContId = cont.id;
          break;
        }
      }

      if (targetContId) {
        next[palletNumber] = targetContId;
      } else {
        const newContNum = containers.length + 1;
        const newId = `container-${newContNum}`;
        const newCont: ContainerItem = {
          id: newId,
          label: `Container ${newContNum}`,
          containerNumber: '',
          sealNumber: '',
          containerType: '20GP',
          tareWeightKg: 2150,
          bookingNumber
        };
        setContainers((cList) => [...cList, newCont]);
        next[palletNumber] = newId;
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
      brand: target.brand || shipmentJson.brandName || '',
      invoiceNumber:
        target.invoiceNumber ||
        (shipmentJson.invoiceNumbers && shipmentJson.invoiceNumbers.length === 1 ? shipmentJson.invoiceNumbers[0] : '') ||
        (shipmentJson.invoiceNumbers && shipmentJson.invoiceNumbers.length > 1 && target.sourceFile
          ? shipmentJson.invoiceNumbers.find((inv) => target.sourceFile?.toLowerCase().includes(inv.toLowerCase())) || ''
          : '') ||
        '',
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
      brand: shipmentJson.brandName || '',
      invoiceNumber: shipmentJson.invoiceNumbers?.[0] || '',
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
          brand: palletForm.brand.trim() || undefined,
          invoiceNumber: palletForm.invoiceNumber.trim() || undefined,
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
        brand: palletForm.brand.trim() || undefined,
        invoiceNumber: palletForm.invoiceNumber.trim() || undefined,
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
    const nextIdx = containers.length + 1;
    const newId = `container-${nextIdx}`;
    const newCont: ContainerItem = {
      id: newId,
      label: `Container ${nextIdx}`,
      containerNumber: containerForm.containerNumber.trim(),
      sealNumber: containerForm.sealNumber.trim(),
      containerType: '20GP',
      tareWeightKg: Number(containerForm.tareWeightKg) || 2150,
      bookingNumber
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

    const mappedContainers: ContainerAllocation[] = containers.map((c, cIdx) => {
      const cPallets = pallets.filter((p) => palletAllocationMap[p.palletNumber] === c.id);
      const palletIndices = cPallets
        .map((cp) => pallets.findIndex((p) => p.palletNumber === cp.palletNumber))
        .filter((idx) => idx !== -1);
      const cGross = cPallets.reduce((s, p) => s + (p.grossWeightKg || 0), 0);
      const cNet = cPallets.reduce((s, p) => s + (p.netWeightKg || 0), 0);
      const cBoxes = cPallets.reduce((s, p) => s + (p.boxCount || 0), 0);
      return {
        id: c.id,
        label: c.label || `Container ${cIdx + 1}`,
        containerNumber: c.containerNumber.trim(),
        sealNumber: c.sealNumber.trim(),
        containerType: '20GP' as const,
        tareWeightKg: Number(c.tareWeightKg) || 2150,
        bookingNumber: bookingNumber.trim(),
        palletIndices,
        maxPayloadKg: 25000,
        maxPallets: 22,
        pallets: cPallets as any,
        assignedPalletIds: cPallets.map((p) => p.palletNumber),
        totalGrossWeightKg: cGross,
        totalNetWeightKg: cNet,
        totalPackages: cBoxes,
        totalPallets: cPallets.length,
        isOverweight: cGross > 25000,
        isOverCapacity: cPallets.length > 22,
        hasDangerousGoods: false
      };
    });

    const updated: ExtractedShipmentJSON = {
      ...shipmentJson,
      containerNumber: primaryContNum,
      sealNumber: primarySealNum,
      containerType: '20GP',
      tareWeightKg: totalAllTare > 0 ? totalAllTare : Number(activeContainer.tareWeightKg) || 2150,
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
      pallets,
      containers: mappedContainers
    };

    onUpdateShipment(updated);
    setHasSynced(true);
    setTimeout(() => setHasSynced(false), 3000);
  };

  const syncRef = useRef(handleApplyAndSync);
  useEffect(() => {
    syncRef.current = handleApplyAndSync;
  });

  useEffect(() => {
    if (registerSyncHandler) {
      registerSyncHandler(() => syncRef.current());
    }
  }, [registerSyncHandler]);

  return (
    <div className="w-full max-w-7xl mx-auto space-y-5 pb-8">
      {/* Top Header */}
      <div className="p-4 bg-surface border border-divider rounded-2xl shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-brand-primary-soft border border-brand-primary/30 flex items-center justify-center">
            <Boxes className="w-5 h-5 text-brand-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-content-primary uppercase tracking-wider">
              Container Placement &amp; Equipment Allocation
            </h2>
          </div>
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

                const cardBrand = (p.brand || shipmentJson.brandName || '').trim();
                const cardInvoice = (
                  p.invoiceNumber ||
                  (shipmentJson.invoiceNumbers && shipmentJson.invoiceNumbers.length === 1 ? shipmentJson.invoiceNumbers[0] : undefined) ||
                  (shipmentJson.invoiceNumbers && shipmentJson.invoiceNumbers.length > 1 && p.sourceFile
                    ? shipmentJson.invoiceNumbers.find((inv) => p.sourceFile?.toLowerCase().includes(inv.toLowerCase()))
                    : undefined) ||
                  ''
                ).trim();

                return (
                  <div
                    key={p.palletNumber || idx}
                    draggable
                    onDragStart={(e) => {
                      setDraggedPalletNumber(p.palletNumber);
                      e.dataTransfer.setData('text/plain', p.palletNumber);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => {
                      setDraggedPalletNumber(null);
                      setDragOverContainerId(null);
                      if (autoScrollTimerRef.current) {
                        window.clearInterval(autoScrollTimerRef.current);
                        autoScrollTimerRef.current = null;
                      }
                    }}
                    onClick={() => togglePalletAllocation(p.palletNumber)}
                    className={`p-3 rounded-xl border cursor-grab active:cursor-grabbing transition-all select-none ${
                      draggedPalletNumber === p.palletNumber
                        ? 'opacity-40 border-brand-primary scale-98 shadow-md'
                        : isAllocated
                        ? 'bg-brand-primary-soft/40 border-brand-primary/40 text-content-primary shadow-xs'
                        : otherCont
                        ? 'bg-amber-500/10 border-amber-500/30 text-content-primary opacity-80'
                        : 'bg-surface-secondary/60 border-divider text-content-secondary hover:border-brand-primary/30 opacity-75'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <GripVertical className="w-3.5 h-3.5 text-content-muted shrink-0 cursor-grab active:cursor-grabbing" />
                        <input
                          type="checkbox"
                          checked={isAllocated}
                          onChange={() => togglePalletAllocation(p.palletNumber)}
                          className="rounded border-divider bg-input-bg text-brand-primary focus:ring-0 cursor-pointer"
                        />
                        <span className="text-xs font-mono font-bold text-brand-primary shrink-0">
                          {p.palletNumber}
                        </span>
                        {p.modelCode && (
                          <span
                            className="font-mono text-[11px] font-medium tracking-tight leading-none px-2 py-0.5 rounded border bg-surface border-divider text-content-primary truncate max-w-[130px] shrink-0"
                            title={p.modelCode}
                          >
                            {p.modelCode}
                          </span>
                        )}
                        {cardBrand && (
                          <span
                            className="font-mono text-[11px] font-medium tracking-tight leading-none px-2 py-0.5 rounded border bg-slate-100/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200/90 dark:border-slate-700 truncate max-w-[130px] shrink-0"
                            title={`Brand: ${cardBrand}`}
                          >
                            {cardBrand}
                          </span>
                        )}
                        {cardInvoice && (
                          <span
                            className="font-mono text-[11px] font-medium tracking-tight leading-none px-2 py-0.5 rounded border bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200/70 dark:border-indigo-800/60 truncate max-w-[130px] shrink-0"
                            title={`Invoice: ${cardInvoice}`}
                          >
                            {cardInvoice.toUpperCase().startsWith('INV') ? cardInvoice : `INV: ${cardInvoice}`}
                          </span>
                        )}
                        {(() => {
                          const assignedContId = palletAllocationMap[p.palletNumber];
                          const cIdx = containers.findIndex((c) => c.id === assignedContId);
                          if (cIdx >= 0) {
                            const contPallets = pallets.filter((other) => palletAllocationMap[other.palletNumber] === assignedContId);
                            const slotNum = contPallets.findIndex((other) => other.palletNumber === p.palletNumber) + 1;
                            const isCurrentActive = assignedContId === activeContainer.id;
                            return (
                              <span
                                className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                                  isCurrentActive
                                    ? 'bg-sky-100/90 dark:bg-sky-950/50 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-800'
                                    : 'bg-indigo-100/80 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800'
                                }`}
                              >
                                C{cIdx + 1} &bull; Slot {slotNum}
                              </span>
                            );
                          }
                          return (
                            <span className="font-mono text-[10px] font-medium px-1.5 py-0.5 rounded border bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700 shrink-0">
                              Unassigned
                            </span>
                          );
                        })()}
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
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
          {/* Container Selection / Carousel Bar */}
          <div className="p-3 bg-surface border border-divider rounded-2xl shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-bold text-content-secondary uppercase tracking-wider">
                  Containers ({containers.length})
                </span>
                <span className="text-[10px] text-content-muted">
                  Slide or drag pallets onto a container
                </span>
              </div>

              {/* Prev / Next Carousel Arrow Controls */}
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={handlePrevContainer}
                  disabled={activeContainerIndex === 0}
                  className={`p-1.5 rounded-lg border transition-all ${
                    activeContainerIndex === 0
                      ? 'border-divider text-content-muted/40 cursor-not-allowed bg-surface-secondary/40'
                      : 'border-divider bg-surface hover:bg-surface-secondary text-content-primary hover:border-brand-primary cursor-pointer shadow-xs'
                  }`}
                  title="Previous Container"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono font-semibold text-content-secondary px-1">
                  {activeContainerIndex + 1} / {containers.length}
                </span>
                <button
                  type="button"
                  onClick={handleNextContainer}
                  disabled={activeContainerIndex === containers.length - 1}
                  className={`p-1.5 rounded-lg border transition-all ${
                    activeContainerIndex === containers.length - 1
                      ? 'border-divider text-content-muted/40 cursor-not-allowed bg-surface-secondary/40'
                      : 'border-divider bg-surface hover:bg-surface-secondary text-content-primary hover:border-brand-primary cursor-pointer shadow-xs'
                  }`}
                  title="Next Container"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Scrollable Container Carousel Track */}
            <div
              ref={containerTabsRef}
              onDragOver={handleDragOverCarousel}
              onDragLeave={handleDragLeaveCarousel}
              className="flex items-center space-x-2.5 overflow-x-auto pb-2 pt-0.5 max-w-full scroll-smooth select-none focus:outline-none focus:ring-0 custom-horizontal-scrollbar"
              style={{ scrollbarWidth: 'thin' }}
            >
              {containers.map((cont, idx) => {
                const isActive = cont.id === activeContainer.id;
                const isDragOver = dragOverContainerId === cont.id;
                const contPalletsCount = pallets.filter((p) => palletAllocationMap[p.palletNumber] === cont.id).length;
                const contSpecs = CONTAINER_SPECS[cont.containerType] || CONTAINER_SPECS['20GP'];

                return (
                  <div
                    key={cont.id}
                    data-container-id={cont.id}
                    onClick={() => setActiveContainerId(cont.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverContainerId !== cont.id) {
                        setDragOverContainerId(cont.id);
                        setActiveContainerId(cont.id);
                      }
                    }}
                    onDragLeave={(e) => {
                      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                      if (dragOverContainerId === cont.id) {
                        setDragOverContainerId(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const pNum = e.dataTransfer.getData('text/plain') || draggedPalletNumber;
                      if (pNum) {
                        movePalletToContainer(pNum, cont.id);
                        setActiveContainerId(cont.id);
                      }
                      setDragOverContainerId(null);
                      setDraggedPalletNumber(null);
                    }}
                    className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center space-x-2.5 cursor-pointer transition-all shrink-0 select-none ${
                      isDragOver
                        ? 'border-brand-primary ring-2 ring-brand-primary/40 bg-brand-primary/10 scale-102 shadow-md'
                        : isActive
                        ? 'bg-brand-primary text-brand-primary-text border-brand-primary shadow-sm'
                        : 'bg-surface-secondary hover:bg-surface text-content-primary border-divider hover:border-brand-primary/50'
                    }`}
                  >
                    <Boxes className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate max-w-[130px]">
                      {cont.containerNumber ? cont.containerNumber : `Container ${idx + 1}`}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full shrink-0 ${
                        isActive
                          ? 'bg-white/20 text-white font-bold'
                          : 'bg-surface border border-divider text-content-secondary'
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
                        className={`p-0.5 rounded hover:bg-red-500/20 shrink-0 ${
                          isActive ? 'text-white/80 hover:text-white' : 'text-content-muted hover:text-state-error'
                        }`}
                        title="Remove container"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
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
                  value="20GP"
                  disabled
                  className="bg-input-bg border border-divider text-xs text-content-primary rounded-lg px-2.5 py-1 font-mono focus:outline-none focus:border-brand-primary font-medium opacity-85 cursor-not-allowed"
                >
                  <option value="20GP">20&apos; GP (Max 22 Pallets / 25,000 kg)</option>
                </select>
              </div>
            </div>

            {/* Graphic 2-row container floorplan */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                const pNum = e.dataTransfer.getData('text/plain') || draggedPalletNumber;
                if (pNum) {
                  movePalletToContainer(pNum, activeContainer.id);
                }
                setDraggedPalletNumber(null);
                setDragOverContainerId(null);
              }}
              className="p-4 bg-surface-secondary border border-divider rounded-xl transition-colors hover:border-brand-primary/40"
            >
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

            <div className="flex items-center justify-between text-[11px] font-mono text-content-secondary border-t border-divider/60 pt-1.5">
              <span>Boxes: {totalAllocatedBoxes}</span>
              <span>Net: {cargoNetWeight.toLocaleString()} kg</span>
              <span>Gross: {cargoGrossWeight.toLocaleString()} kg</span>
            </div>
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

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-content-secondary mb-1">
                    Brand Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Brand Name"
                    value={palletForm.brand}
                    onChange={(e) => setPalletForm((prev) => ({ ...prev, brand: e.target.value }))}
                    className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary focus:outline-none focus:border-brand-primary"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-content-secondary mb-1">
                    Source Invoice #
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. INV-1001"
                    value={palletForm.invoiceNumber}
                    onChange={(e) => setPalletForm((prev) => ({ ...prev, invoiceNumber: e.target.value }))}
                    className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                  />
                </div>
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
                  disabled
                  className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary font-mono focus:outline-none focus:border-brand-primary opacity-80 cursor-not-allowed"
                >
                  <option value="20GP">20&apos; GP (Max 22 Pallets / 25,000 kg)</option>
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
