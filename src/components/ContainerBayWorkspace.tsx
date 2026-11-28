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
  GripVertical,
  FileSpreadsheet,
  Download,
  Scissors,
  Undo2,
  Package
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type {
  ExtractedShipmentJSON,
  ExtractedPallet,
  ContainerType,
  ContainerAllocation,
  MergedTransfer,
  FloorStockItem
} from '../types/index.ts';
import { CONTAINER_SPECS } from '../types/index.ts';
import { autoAllocate20GPContainers } from '../utils/manifestKeywordReference.ts';
import { toExactWeight, getFloorStockItems } from '../utils/inventoryStore.ts';

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
  onSwitchTab?: (tab: 'dg_manifest' | 'bl_manifest' | 'container_bay') => void;
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

  const sanitizeRef = (val?: string): string => {
    if (!val) return '';
    const s = val.trim();
    if (/^CONT-|^SL-|^SEAL-|^BKG-\d+$/i.test(s)) return '';
    return s;
  };

  // Deterministic 20' GP multi-container allocation (Max 22 Pallets / 25,000 kg)
  const initialContainers: ContainerItem[] = useMemo(() => {
    if (shipmentJson.containers && shipmentJson.containers.length > 0) {
      return shipmentJson.containers.map((c, idx) => ({
        id: c.id || `container-${idx + 1}`,
        label: c.label || `Container ${idx + 1}`,
        containerNumber: sanitizeRef(c.containerNumber),
        sealNumber: sanitizeRef(c.sealNumber),
        containerType: '20GP' as ContainerType,
        tareWeightKg: c.tareWeightKg || 0,
        bookingNumber: sanitizeRef(c.bookingNumber || shipmentJson.bookingNumber),
        palletIndices: c.palletIndices || []
      }));
    }
    const allocated = autoAllocate20GPContainers(
      shipmentJson.pallets || [],
      undefined,
      sanitizeRef(shipmentJson.containerNumber),
      sanitizeRef(shipmentJson.sealNumber)
    );
    return allocated.map((c, idx) => ({
      id: c.id || `container-${idx + 1}`,
      label: c.label || `Container ${idx + 1}`,
      containerNumber: sanitizeRef(c.containerNumber),
      sealNumber: sanitizeRef(c.sealNumber),
      containerType: '20GP' as ContainerType,
      tareWeightKg: c.tareWeightKg || 0,
      bookingNumber: sanitizeRef(c.bookingNumber || shipmentJson.bookingNumber),
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
    tareWeightKg: 0
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
  const [bookingNumber, setBookingNumber] = useState<string>(sanitizeRef(shipmentJson.bookingNumber));

  // Pallet allocation state: maps palletId / palletNumber -> containerId (or undefined if unallocated)
  const [pallets, setPallets] = useState<ExtractedPallet[]>(() =>
    initialPallets.map((p, idx) => ({
      ...p,
      id: p.id || `plt_${p.palletNumber}_${idx}`
    }))
  );
  const [palletAllocationMap, setPalletAllocationMap] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    const prepared = initialPallets.map((p, idx) => ({
      ...p,
      id: p.id || `plt_${p.palletNumber}_${idx}`
    }));

    initialContainers.forEach((cont) => {
      if (cont.palletIndices && cont.palletIndices.length > 0) {
        cont.palletIndices.forEach((pIdx) => {
          const p = prepared[pIdx];
          if (p) {
            map[p.id!] = cont.id;
            map[p.palletNumber] = cont.id;
          }
        });
      }
    });

    // Fallback: assign remaining sequentially within 20' GP limits
    let contIdx = 0;
    let countInCont = 0;
    prepared.forEach((p) => {
      if (!map[p.id!]) {
        if (countInCont >= 22) {
          contIdx++;
          countInCont = 0;
        }
        const targetCont = initialContainers[contIdx] || initialContainers[0];
        const targetId = targetCont?.id || 'container-1';
        map[p.id!] = targetId;
        map[p.palletNumber] = targetId;
        countInCont++;
      }
    });
    return map;
  });

  // Explicit slot order per container: containerId -> array of (palletId | null) of size specs.maxPallets
  const [containerSlotMap, setContainerSlotMap] = useState<Record<string, (string | null)[]>>(() => {
    const initialSlotState: Record<string, (string | null)[]> = {};
    const prepared = initialPallets.map((p, idx) => ({
      ...p,
      id: p.id || `plt_${p.palletNumber}_${idx}`
    }));

    initialContainers.forEach((cont) => {
      const slots: (string | null)[] = Array(22).fill(null);
      let slotIdx = 0;
      if (cont.palletIndices && cont.palletIndices.length > 0) {
        cont.palletIndices.forEach((pIdx) => {
          const p = prepared[pIdx];
          if (p && slotIdx < 22) {
            slots[slotIdx++] = p.id!;
          }
        });
      }
      initialSlotState[cont.id] = slots;
    });

    return initialSlotState;
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
    tareWeightKg: 0
  });

  // Floor Stock Picker State
  const [showFloorStockPicker, setShowFloorStockPicker] = useState<boolean>(false);
  const floorStockWarehouseItems = useMemo(() => getFloorStockItems(), [showFloorStockPicker]);

  const handleAddFloorStockToContainer = (item: FloorStockItem) => {
    const baseNum = String(item.palletNumber).replace(/^PLT\s*#?/i, '');
    const palletNum = pallets.some((p) => String(p.palletNumber) === baseNum)
      ? `${baseNum}_loose_${Date.now().toString().slice(-4)}`
      : baseNum;

    const newPallet: ExtractedPallet = {
      id: item.id,
      palletNumber: palletNum,
      parentPalletNumber: item.parentPalletNumber || baseNum,
      isSplitPiece: true,
      modelCode: item.model || 'STANDARD',
      brand: item.brand || undefined,
      invoiceNumber: item.invoiceNo || undefined,
      boxCount: item.looseUnits,
      grossWeightKg: item.grossWeightKg || 0,
      netWeightKg: item.netWeightKg || 0,
      sourceFile: `CFS_FLOOR_STOCK_INV_${item.invoiceNo}`
    };

    const nextPallets = [...pallets, newPallet];
    setPallets(nextPallets);
    setPalletAllocationMap((prev) => ({
      ...prev,
      [palletNum]: activeContainer.id
    }));

    const nextInvoiceNumbers = Array.from(new Set([...(shipmentJson.invoiceNumbers || []), item.invoiceNo]));
    onUpdateShipment({
      ...shipmentJson,
      invoiceNumbers: nextInvoiceNumbers,
      pallets: nextPallets.map((p) => ({
        palletNumber: String(p.palletNumber),
        modelCode: p.modelCode,
        brand: p.brand || '',
        boxCount: p.boxCount,
        grossWeightKg: p.grossWeightKg || 0,
        netWeightKg: p.netWeightKg || 0,
        sourceFile: p.sourceFile || 'CFS_WAREHOUSE'
      }))
    });

    setShowFloorStockPicker(false);
  };

  // Split / Move Units State
  const [splitMoveState, setSplitMoveState] = useState<{
    isOpen: boolean;
    sourcePallet: ExtractedPallet | null;
    unitsToMove: number;
    destinationMode: 'SEPARATE_SPLIT' | 'TOP_UP_MERGE';
    targetContainerId: string;
    targetPalletId: string;
  }>({
    isOpen: false,
    sourcePallet: null,
    unitsToMove: 1,
    destinationMode: 'SEPARATE_SPLIT',
    targetContainerId: activeContainer.id,
    targetPalletId: ''
  });

  const handleOpenSplitMove = (pallet: ExtractedPallet) => {
    const otherPallets = pallets.filter((p) => (p.id || p.palletNumber) !== (pallet.id || pallet.palletNumber));
    setSplitMoveState({
      isOpen: true,
      sourcePallet: pallet,
      unitsToMove: Math.max(1, Math.min(Math.floor((pallet.boxCount || 0) / 2) || 1, Math.max(1, (pallet.boxCount || 1) - 1))),
      destinationMode: 'SEPARATE_SPLIT',
      targetContainerId: activeContainer.id,
      targetPalletId: otherPallets[0]?.id || otherPallets[0]?.palletNumber || ''
    });
  };

  const handleExecuteSplitMove = () => {
    if (!splitMoveState.sourcePallet) return;
    const source = splitMoveState.sourcePallet;
    const sourceKey = source.id || source.palletNumber;
    const units = splitMoveState.unitsToMove;

    if (units <= 0 || units >= source.boxCount) {
      alert(`Units to move must be between 1 and ${source.boxCount - 1}.`);
      return;
    }

    const origGross = source.grossWeightKg || 0;
    const origNet = source.netWeightKg || 0;
    const deltaGross = toExactWeight((origGross / source.boxCount) * units);
    const deltaNet = toExactWeight((origNet / source.boxCount) * units);

    if (splitMoveState.destinationMode === 'SEPARATE_SPLIT') {
      const baseNum = String(source.parentPalletNumber || source.palletNumber)
        .replace(/-S\d+$/i, '')
        .replace(/-[A-Z]$/i, '');
      const existingSplits = pallets.filter((p) => {
        const pBase = String(p.parentPalletNumber || p.palletNumber)
          .replace(/-S\d+$/i, '')
          .replace(/-[A-Z]$/i, '');
        return pBase === baseNum && p.isSplitPiece;
      });
      const splitSuffix = `-S${existingSplits.length + 1}`;
      const splitPalletNum = `${baseNum}${splitSuffix}`;
      const newSplitId = `plt_${splitPalletNum}_${Date.now()}`;

      const remainingGross = toExactWeight(origGross - deltaGross);
      const remainingNet = toExactWeight(origNet - deltaNet);

      const updatedSource: ExtractedPallet = {
        ...source,
        parentPalletNumber: baseNum,
        isSplitPiece: true,
        boxCount: source.boxCount - units,
        grossWeightKg: remainingGross,
        netWeightKg: remainingNet
      };

      let targetContId = splitMoveState.targetContainerId;
      if (targetContId === '+new') {
        const nextContNum = containers.length + 1;
        targetContId = `container-${nextContNum}`;
        const newCont: ContainerItem = {
          id: targetContId,
          label: `Container ${nextContNum}`,
          containerNumber: '',
          sealNumber: '',
          containerType: '20GP',
          tareWeightKg: 0,
          bookingNumber
        };
        setContainers((prev) => [...prev, newCont]);
      }

      const newSplitPallet: ExtractedPallet = {
        id: newSplitId,
        palletNumber: splitPalletNum,
        parentPalletNumber: baseNum,
        isSplitPiece: true,
        modelCode: source.modelCode,
        brand: source.brand,
        invoiceNumber: source.invoiceNumber,
        boxCount: units,
        grossWeightKg: deltaGross,
        netWeightKg: deltaNet,
        sourceFile: source.sourceFile || 'CFS_SPLIT'
      };

      setPallets((prev) => {
        const idx = prev.findIndex((p) => (p.id || p.palletNumber) === sourceKey);
        const next = [...prev];
        if (idx !== -1) {
          next[idx] = updatedSource;
          next.splice(idx + 1, 0, newSplitPallet);
        } else {
          next.push(newSplitPallet);
        }
        return next;
      });

      setPalletAllocationMap((prev) => ({
        ...prev,
        [newSplitId]: targetContId,
        [splitPalletNum]: targetContId
      }));

      setContainerSlotMap((prev) => {
        const next = { ...prev };
        const slots = [...(next[targetContId] || Array(22).fill(null))];
        const emptyIdx = slots.indexOf(null);
        if (emptyIdx !== -1) {
          slots[emptyIdx] = newSplitId;
          next[targetContId] = slots;
        }
        return next;
      });
    } else {
      const targetKey = splitMoveState.targetPalletId;
      const target = pallets.find((p) => (p.id || p.palletNumber) === targetKey);
      if (!target) {
        alert('Please select a valid target pallet to top-up.');
        return;
      }

      const remainingGross = toExactWeight(origGross - deltaGross);
      const remainingNet = toExactWeight(origNet - deltaNet);

      const updatedSource: ExtractedPallet = {
        ...source,
        boxCount: source.boxCount - units,
        grossWeightKg: remainingGross,
        netWeightKg: remainingNet
      };

      const transferRecord: MergedTransfer = {
        fromPalletId: source.id || source.palletNumber,
        fromPalletNumber: source.palletNumber,
        units,
        grossWeightKg: deltaGross,
        netWeightKg: deltaNet
      };

      const updatedTarget: ExtractedPallet = {
        ...target,
        boxCount: target.boxCount + units,
        grossWeightKg: toExactWeight((target.grossWeightKg || 0) + deltaGross),
        netWeightKg: toExactWeight((target.netWeightKg || 0) + deltaNet),
        mergedTransfers: [...(target.mergedTransfers || []), transferRecord]
      };

      setPallets((prev) => {
        return prev.map((p) => {
          const pk = p.id || p.palletNumber;
          if (pk === sourceKey) return updatedSource;
          if (pk === targetKey) return updatedTarget;
          return p;
        });
      });
    }

    setSplitMoveState({
      isOpen: false,
      sourcePallet: null,
      unitsToMove: 1,
      destinationMode: 'SEPARATE_SPLIT',
      targetContainerId: activeContainer.id,
      targetPalletId: ''
    });
  };

  const handleUndoMergeTransfer = (targetPallet: ExtractedPallet, transferIndex: number) => {
    const transfer = targetPallet.mergedTransfers?.[transferIndex];
    if (!transfer) return;

    const sourcePallet = pallets.find(
      (p) => (p.id || p.palletNumber) === transfer.fromPalletId || p.palletNumber === transfer.fromPalletNumber
    );

    const updatedMergedTransfers = [...(targetPallet.mergedTransfers || [])];
    updatedMergedTransfers.splice(transferIndex, 1);

    const updatedTarget: ExtractedPallet = {
      ...targetPallet,
      boxCount: targetPallet.boxCount - transfer.units,
      grossWeightKg: toExactWeight((targetPallet.grossWeightKg || 0) - transfer.grossWeightKg),
      netWeightKg: toExactWeight((targetPallet.netWeightKg || 0) - transfer.netWeightKg),
      mergedTransfers: updatedMergedTransfers.length > 0 ? updatedMergedTransfers : undefined
    };

    setPallets((prev) => {
      return prev.map((p) => {
        const pk = p.id || p.palletNumber;
        if (pk === (targetPallet.id || targetPallet.palletNumber)) return updatedTarget;
        if (sourcePallet && pk === (sourcePallet.id || sourcePallet.palletNumber)) {
          return {
            ...p,
            boxCount: p.boxCount + transfer.units,
            grossWeightKg: toExactWeight((p.grossWeightKg || 0) + transfer.grossWeightKg),
            netWeightKg: toExactWeight((p.netWeightKg || 0) + transfer.netWeightKg)
          };
        }
        return p;
      });
    });
  };

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

    // Also update containerSlotMap
    setContainerSlotMap((prevSlots) => {
      const nextSlots = { ...prevSlots };
      // Remove pallet from all container slots first
      Object.keys(nextSlots).forEach((cId) => {
        nextSlots[cId] = (nextSlots[cId] || []).map((p) => (p === palletNumber ? null : p));
      });

      if (targetContainerId) {
        const slots = [...(nextSlots[targetContainerId] || Array(22).fill(null))];
        const emptyIdx = slots.indexOf(null);
        if (emptyIdx !== -1) {
          slots[emptyIdx] = palletNumber;
          nextSlots[targetContainerId] = slots;
        }
      }
      return nextSlots;
    });
  };

  // Place or swap a pallet directly onto a specific slot in the active container
  const handleDropOnSlot = (targetSlotIdx: number, pNum: string) => {
    if (!pNum) return;
    const targetContId = activeContainer.id;

    setPalletAllocationMap((prev) => ({
      ...prev,
      [pNum]: targetContId
    }));

    setContainerSlotMap((prev) => {
      const next = { ...prev };
      // Clean pNum from all containers
      Object.keys(next).forEach((cId) => {
        next[cId] = (next[cId] || []).map((p) => (p === pNum ? null : p));
      });

      const activeSlots = [...(next[targetContId] || Array(22).fill(null))];
      while (activeSlots.length < 22) activeSlots.push(null);

      // What was in this slot?
      const existingPalletInSlot = activeSlots[targetSlotIdx];

      if (existingPalletInSlot && existingPalletInSlot !== pNum) {
        // Find if pNum had an old slot in active container to swap, otherwise find first empty slot for existingPallet
        const oldSlotIdx = activeSlots.indexOf(pNum);
        if (oldSlotIdx !== -1) {
          activeSlots[oldSlotIdx] = existingPalletInSlot;
        } else {
          const firstEmpty = activeSlots.findIndex((item, i) => item === null && i !== targetSlotIdx);
          if (firstEmpty !== -1) {
            activeSlots[firstEmpty] = existingPalletInSlot;
          }
        }
      }

      activeSlots[targetSlotIdx] = pNum;
      next[targetContId] = activeSlots;
      return next;
    });
  };

  // Drag and drop states
  const [draggedPalletNumber, setDraggedPalletNumber] = useState<string | null>(null);
  const [dragOverContainerId, setDragOverContainerId] = useState<string | null>(null);
  const [dragOverSlotIdx, setDragOverSlotIdx] = useState<number | null>(null);
  const [isDragOverPalletList, setIsDragOverPalletList] = useState<boolean>(false);
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
          tareWeightKg: 0,
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

  // Derived array of exactly specs.maxPallets items for active container slots (preserving custom order)
  const activeContainerSlots = useMemo(() => {
    const max = specs.maxPallets;
    const storedSlots = containerSlotMap[activeContainer.id] || [];
    const result: (ExtractedPallet | null)[] = Array(max).fill(null);
    const allocatedMap = new Map(allocatedPalletsList.map((p) => [p.palletNumber, p]));
    const placedPallets = new Set<string>();

    // 1. Fill slots based on stored slots if pallet is still allocated to this container
    for (let i = 0; i < max; i++) {
      const pNum = storedSlots[i];
      if (pNum && allocatedMap.has(pNum)) {
        result[i] = allocatedMap.get(pNum)!;
        placedPallets.add(pNum);
      }
    }

    // 2. Any allocated pallet that hasn't been placed in a slot gets the next available empty slot
    let nextEmpty = 0;
    allocatedPalletsList.forEach((p) => {
      if (!placedPallets.has(p.palletNumber)) {
        while (nextEmpty < max && result[nextEmpty] !== null) {
          nextEmpty++;
        }
        if (nextEmpty < max) {
          result[nextEmpty] = p;
          placedPallets.add(p.palletNumber);
          nextEmpty++;
        }
      }
    });

    return result;
  }, [specs.maxPallets, containerSlotMap, activeContainer.id, allocatedPalletsList]);

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

  // Computed Container Plan based on MAY 26-27.xlsx master report structure
  const containerPlanData = useMemo(() => {
    const allAllocated = pallets.filter((p) => Boolean(palletAllocationMap[p.palletNumber]));
    const totalPlanGross = allAllocated.reduce((sum, p) => sum + (p.grossWeightKg || 0), 0);
    const totalPlanPallets = allAllocated.length;
    const totalInvoiceVal = shipmentJson.totalInvoiceValue || 0;
    const currency = shipmentJson.currency || '$';

    const containerGroups = containers.map((cont) => {
      const contPallets = pallets.filter((p) => palletAllocationMap[p.palletNumber] === cont.id);

      const lineMap = new Map<
        string,
        {
          id: string;
          brand: string;
          piNo: string;
          pkgListNo: string;
          customer: string;
          destination: string;
          customInv: string;
          contract: string;
          palletsCount: number;
          quantity: number;
          grossWeightKg: number;
          netWeightKg: number;
          sbNo: string;
          date: string;
          containerNo: string;
          sealNo: string;
          rawValue: number;
        }
      >();

      contPallets.forEach((p) => {
        const invNum = (p.invoiceNumber || (shipmentJson.invoiceNumbers && shipmentJson.invoiceNumbers.length > 0 ? shipmentJson.invoiceNumbers[0] : '') || '').trim();
        const brandStr = (p.brand || shipmentJson.brandName || '').trim();
        const modelStr = (p.modelCode || '').trim();
        const groupKey = `${invNum}__${brandStr}__${modelStr}`;

        const existing = lineMap.get(groupKey);
        if (existing) {
          existing.palletsCount += 1;
          existing.quantity += p.boxCount || 0;
          existing.grossWeightKg += p.grossWeightKg || 0;
          existing.netWeightKg += p.netWeightKg || 0;
        } else {
          lineMap.set(groupKey, {
            id: groupKey,
            brand: brandStr || modelStr || shipmentJson.productDescription?.split('\n')[0]?.slice(0, 30) || '-',
            piNo: shipmentJson.shipperReference || shipmentJson.bookingNumber || '-',
            pkgListNo: p.sourceFile || shipmentJson.forwarderReference || '-',
            customer: shipmentJson.consigneeName || '-',
            destination: shipmentJson.portOfDischarge || shipmentJson.finalDestination || '-',
            customInv: invNum || '-',
            contract: shipmentJson.incoterm || shipmentJson.freightTerms || 'FOB',
            palletsCount: 1,
            quantity: p.boxCount || 0,
            grossWeightKg: p.grossWeightKg || 0,
            netWeightKg: p.netWeightKg || 0,
            sbNo: shipmentJson.shippingBillNumbers || '-',
            date: (shipmentJson.invoiceDates && shipmentJson.invoiceDates.length > 0 ? shipmentJson.invoiceDates[0] : '') || new Date().toLocaleDateString('en-GB'),
            containerNo: cont.containerNumber || cont.label,
            sealNo: cont.sealNumber || '-',
            rawValue: 0
          });
        }
      });

      const lineItems = Array.from(lineMap.values()).map((item) => {
        const proportion = totalPlanGross > 0
          ? item.grossWeightKg / totalPlanGross
          : totalPlanPallets > 0
          ? item.palletsCount / totalPlanPallets
          : 0;
        const rawValue = totalInvoiceVal * proportion;
        return {
          ...item,
          rawValue,
          valueFormatted: rawValue > 0
            ? `${currency} ${rawValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : '-'
        };
      });

      const subtotalPallets = lineItems.reduce((sum, item) => sum + item.palletsCount, 0);
      const subtotalQty = lineItems.reduce((sum, item) => sum + item.quantity, 0);
      const subtotalGrossWeight = lineItems.reduce((sum, item) => sum + item.grossWeightKg, 0);
      const subtotalNetWeight = lineItems.reduce((sum, item) => sum + item.netWeightKg, 0);
      const subtotalValue = lineItems.reduce((sum, item) => sum + item.rawValue, 0);
      const vgmKg = subtotalGrossWeight + (Number(cont.tareWeightKg) || 0);

      return {
        container: cont,
        lineItems,
        subtotalPallets,
        subtotalQty,
        subtotalGrossWeight,
        subtotalNetWeight,
        subtotalValue,
        subtotalValueFormatted: subtotalValue > 0
          ? `${currency} ${subtotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : '-',
        vgmKg
      };
    });

    const grandTotalPallets = containerGroups.reduce((sum, g) => sum + g.subtotalPallets, 0);
    const grandTotalQty = containerGroups.reduce((sum, g) => sum + g.subtotalQty, 0);
    const grandTotalGrossWeight = containerGroups.reduce((sum, g) => sum + g.subtotalGrossWeight, 0);
    const grandTotalNetWeight = containerGroups.reduce((sum, g) => sum + g.subtotalNetWeight, 0);
    const grandTotalValue = containerGroups.reduce((sum, g) => sum + g.subtotalValue, 0);
    const grandTotalValueFormatted = grandTotalValue > 0
      ? `${currency} ${grandTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '-';

    const unallocatedPalletsCount = pallets.filter((p) => !palletAllocationMap[p.palletNumber]).length;

    return {
      containerGroups,
      grandTotalPallets,
      grandTotalQty,
      grandTotalGrossWeight,
      grandTotalNetWeight,
      grandTotalValue,
      grandTotalValueFormatted,
      unallocatedPalletsCount
    };
  }, [pallets, palletAllocationMap, containers, shipmentJson]);

  // Export Container Plan directly to .xlsx matching MAY 26-27 format
  const handleExportContainerPlanXlsx = () => {
    const headers = [
      'Brand / Description',
      'PI No',
      'Pkg. List No.',
      'Customer',
      'Destn.',
      'Custom Inv.',
      'Contract',
      'Value',
      'Pallets',
      'Qty',
      'GR WT',
      'NT WT',
      'SB NO',
      'DATE',
      'CONTAINER',
      'SEAL'
    ];

    const aoaData: (string | number | null)[][] = [headers];

    containerPlanData.containerGroups.forEach((group) => {
      if (group.lineItems.length === 0) {
        aoaData.push([
          `[${group.container.label}] No pallets allocated`,
          '',
          '',
          shipmentJson.consigneeName || '',
          shipmentJson.portOfDischarge || '',
          '',
          shipmentJson.incoterm || 'FOB',
          '',
          0,
          0,
          0,
          0,
          shipmentJson.shippingBillNumbers || '',
          (shipmentJson.invoiceDates && shipmentJson.invoiceDates.length > 0 ? shipmentJson.invoiceDates[0] : '') || '',
          group.container.containerNumber || group.container.label,
          group.container.sealNumber || ''
        ]);
      } else {
        group.lineItems.forEach((item) => {
          aoaData.push([
            item.brand,
            item.piNo !== '-' ? item.piNo : '',
            item.pkgListNo !== '-' ? item.pkgListNo : '',
            item.customer !== '-' ? item.customer : '',
            item.destination !== '-' ? item.destination : '',
            item.customInv !== '-' ? item.customInv : '',
            item.contract !== '-' ? item.contract : '',
            item.valueFormatted !== '-' ? item.valueFormatted : '',
            item.palletsCount,
            item.quantity,
            toExactWeight(item.grossWeightKg),
            toExactWeight(item.netWeightKg),
            item.sbNo !== '-' ? item.sbNo : '',
            item.date !== '-' ? item.date : '',
            item.containerNo,
            item.sealNo !== '-' ? item.sealNo : ''
          ]);
        });
      }

      // Container subtotal row
      aoaData.push([
        `SUBTOTAL - ${group.container.label}`,
        '',
        '',
        '',
        '',
        '',
        '',
        group.subtotalValueFormatted !== '-' ? group.subtotalValueFormatted : '',
        group.subtotalPallets,
        group.subtotalQty,
        toExactWeight(group.subtotalGrossWeight),
        toExactWeight(group.subtotalNetWeight),
        '',
        '',
        group.container.containerNumber || group.container.label,
        group.container.sealNumber || ''
      ]);

      // Blank spacer row
      aoaData.push([]);
    });

    // Grand total row
    aoaData.push([
      'GRAND TOTAL',
      '',
      '',
      '',
      '',
      '',
      '',
      containerPlanData.grandTotalValueFormatted !== '-' ? containerPlanData.grandTotalValueFormatted : '',
      containerPlanData.grandTotalPallets,
      containerPlanData.grandTotalQty,
      toExactWeight(containerPlanData.grandTotalGrossWeight),
      toExactWeight(containerPlanData.grandTotalNetWeight),
      '',
      '',
      containers.map((c) => c.containerNumber || c.label).filter(Boolean).join(', '),
      ''
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoaData);
    ws['!cols'] = [
      { wch: 22 }, // Brand / Description
      { wch: 16 }, // PI No
      { wch: 16 }, // Pkg List No
      { wch: 28 }, // Customer
      { wch: 18 }, // Destn
      { wch: 18 }, // Custom Inv
      { wch: 10 }, // Contract
      { wch: 16 }, // Value
      { wch: 10 }, // Pallets
      { wch: 10 }, // Qty
      { wch: 14 }, // GR WT
      { wch: 14 }, // NT WT
      { wch: 16 }, // SB NO
      { wch: 14 }, // DATE
      { wch: 20 }, // CONTAINER
      { wch: 16 }  // SEAL
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Container Plan');
    const bookingRef = (shipmentJson.bookingNumber || shipmentJson.shipperReference || 'Plan').replace(/[^a-zA-Z0-9-_]/g, '_');
    const todayStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Container_Plan_${bookingRef}_${todayStr}.xlsx`);
  };

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
      tareWeightKg: 0
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
      tareWeightKg: Number(containerForm.tareWeightKg) || 0,
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
        tareWeightKg: Number(c.tareWeightKg) || 0,
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
    <div className="w-full max-w-[1700px] mx-auto space-y-6 pb-36 px-1 sm:px-2">
      {/* Main Grid: 5 Cols Left (Pallets List) | 7 Cols Right (Bay Grid & Equipment) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* =========================================================================
            LEFT COLUMN: Pallets & Cargo Inventory (5 Cols)
            ========================================================================= */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (!isDragOverPalletList) setIsDragOverPalletList(true);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setIsDragOverPalletList(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOverPalletList(false);
            const pNum = e.dataTransfer.getData('text/plain') || draggedPalletNumber;
            if (pNum) {
              movePalletToContainer(pNum, null);
            }
            setDraggedPalletNumber(null);
          }}
          className={`lg:col-span-5 bg-surface border rounded-2xl p-4 space-y-3.5 shadow-sm transition-all ${
            isDragOverPalletList
              ? 'border-brand-primary ring-2 ring-brand-primary/30 bg-brand-primary-soft/20'
              : 'border-divider'
          }`}
        >
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
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddMenu(false);
                          setShowFloorStockPicker(true);
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-content-primary hover:bg-surface-secondary flex items-center space-x-2 transition-colors border-t border-divider/60 cursor-pointer"
                      >
                        <Package className="w-3.5 h-3.5 text-amber-600" />
                        <span className="font-medium">Add Floor Stock (Loose)</span>
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
                      <div className="flex items-center space-x-2 flex-wrap gap-1.5">
                        <GripVertical className="w-3.5 h-3.5 text-content-muted shrink-0 cursor-grab active:cursor-grabbing" />
                        <input
                          type="checkbox"
                          checked={isAllocated}
                          onChange={() => togglePalletAllocation(p.palletNumber)}
                          className="rounded border-divider bg-input-bg text-brand-primary focus:ring-0 cursor-pointer"
                        />
                        <span className="text-xs font-mono font-bold text-brand-primary shrink-0">
                          {p.palletNumber} ({p.boxCount || 0} Units)
                        </span>
                        {p.isSplitPiece && (
                          <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800 shrink-0">
                            SPLIT
                          </span>
                        )}
                        {p.parentPalletNumber && (
                          <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800 shrink-0" title={`Origin Pallet: #${p.parentPalletNumber}`}>
                            Ex-PLT #{p.parentPalletNumber}
                          </span>
                        )}
                        {p.modelCode && (
                          <span
                            className="font-mono text-[11px] font-medium tracking-tight leading-none px-2 py-0.5 rounded border bg-surface border-divider text-content-primary whitespace-nowrap shrink-0"
                            title={p.modelCode}
                          >
                            {p.modelCode}
                          </span>
                        )}
                        {cardBrand && (
                          <span
                            className="font-mono text-[11px] font-medium tracking-tight leading-none px-2 py-0.5 rounded border bg-slate-100/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200/90 dark:border-slate-700 whitespace-nowrap shrink-0"
                            title={`Brand: ${cardBrand}`}
                          >
                            {cardBrand}
                          </span>
                        )}
                        {cardInvoice && (
                          <span
                            className="font-mono text-[11px] font-medium tracking-tight leading-none px-2 py-0.5 rounded border bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200/70 dark:border-indigo-800/60 whitespace-nowrap shrink-0"
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
                        {(p.boxCount || 0) > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenSplitMove(p);
                            }}
                            className="p-1 text-content-muted hover:text-brand-primary transition-colors cursor-pointer"
                            title="Split / Move Units"
                          >
                            <Scissors className="w-3.5 h-3.5" />
                          </button>
                        )}
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

                    {p.mergedTransfers && p.mergedTransfers.length > 0 && (
                      <div className="mt-1.5 pt-1.5 border-t border-divider/60 space-y-1">
                        <div className="text-[10px] font-semibold text-content-muted">Top-Up Merged Units:</div>
                        {p.mergedTransfers.map((mt, mtIdx) => (
                          <div
                            key={`${mt.fromPalletNumber}-${mtIdx}`}
                            className="flex items-center justify-between text-[10px] font-mono bg-brand-primary-soft/30 px-2 py-0.5 rounded border border-brand-primary/20"
                          >
                            <span className="text-content-primary">
                              +{mt.units} Units from {mt.fromPalletNumber} ({mt.grossWeightKg} kg)
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUndoMergeTransfer(p, mtIdx);
                              }}
                              className="text-content-muted hover:text-state-error p-0.5 cursor-pointer"
                              title="Undo merge transfer"
                            >
                              <Undo2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
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
                <span className="bg-input-bg border border-divider text-xs text-content-primary rounded-lg px-2.5 py-1 font-semibold shadow-2xs">
                  20Ft Container
                </span>
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
                setDragOverSlotIdx(null);
              }}
              className="p-4 bg-surface-secondary border border-divider rounded-xl transition-colors hover:border-brand-primary/40"
            >
              <div className="text-[9px] font-mono text-content-muted mb-2.5 flex justify-between uppercase tracking-wider">
                <span>DOOR END &rarr;</span>
                <span className="font-bold text-content-secondary">BAY INTERIOR ({activeContainer.containerType})</span>
                <span>&larr; NOSE / FRONT</span>
              </div>

              {/* 2 Rows representing container interior with Drag & Drop Slot Reordering */}
              <div className="overflow-x-auto pb-1.5 custom-horizontal-scrollbar">
                <div className="min-w-[660px] space-y-2">
                  {/* Top Row: Slots 0 to 10 (Slots 1 to 11) */}
                  <div className="grid grid-cols-11 gap-1.5">
                    {Array.from({ length: Math.ceil(specs.maxPallets / 2) }).map((_, slotIdx) => {
                      const pallet = activeContainerSlots[slotIdx];
                      const isDragTarget = dragOverSlotIdx === slotIdx;
                      return (
                        <div
                          key={`top-${slotIdx}`}
                          draggable={Boolean(pallet)}
                          onDragStart={(e) => {
                            if (!pallet) return;
                            setDraggedPalletNumber(pallet.palletNumber);
                            e.dataTransfer.setData('text/plain', pallet.palletNumber);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragEnd={() => {
                            setDraggedPalletNumber(null);
                            setDragOverSlotIdx(null);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'move';
                            if (dragOverSlotIdx !== slotIdx) {
                              setDragOverSlotIdx(slotIdx);
                            }
                          }}
                          onDragLeave={(e) => {
                            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                            if (dragOverSlotIdx === slotIdx) {
                              setDragOverSlotIdx(null);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const pNum = e.dataTransfer.getData('text/plain') || draggedPalletNumber;
                            if (pNum) {
                              handleDropOnSlot(slotIdx, pNum);
                            }
                            setDragOverSlotIdx(null);
                            setDraggedPalletNumber(null);
                          }}
                          className={`group relative h-13 min-w-[54px] rounded-lg border flex flex-col items-center justify-center p-1 text-center transition-all select-none ${
                            isDragTarget
                              ? 'ring-2 ring-brand-primary border-brand-primary bg-brand-primary-soft scale-102 shadow-md'
                              : pallet
                              ? 'bg-brand-primary-soft border-brand-primary/50 text-brand-primary shadow-xs hover:border-brand-primary cursor-grab active:cursor-grabbing'
                              : 'bg-surface border-dashed border-divider text-content-muted hover:border-brand-primary/40'
                          }`}
                          title={pallet ? `Pallet ${pallet.palletNumber} (Slot ${slotIdx + 1}) - Drag to reorder, move or unallocate` : `Empty Slot ${slotIdx + 1} - Drag pallet here`}
                        >
                          {pallet ? (
                            <>
                              <div className="flex items-center space-x-0.5 justify-center max-w-full px-0.5">
                                <span className="text-[9px] font-mono font-bold leading-tight truncate">
                                  {pallet.palletNumber}
                                </span>
                                {pallet.isSplitPiece && (
                                  <span className="text-[7px] font-bold px-0.5 py-0 rounded bg-purple-500/20 text-purple-700 dark:text-purple-300 shrink-0">
                                    SPLIT
                                  </span>
                                )}
                              </div>
                              <span className="text-[8px] font-mono text-content-secondary mt-0.5">
                                {pallet.boxCount ? `${pallet.boxCount}u · ` : ''}{pallet.grossWeightKg.toLocaleString()}k
                              </span>
                              {/* Explicit Unallocate Action on hover */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  movePalletToContainer(pallet.palletNumber, null);
                                }}
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-surface border border-divider text-content-muted hover:text-state-error hover:border-state-error/40 items-center justify-center shadow-xs transition-opacity hidden group-hover:flex"
                                title={`Unallocate ${pallet.palletNumber}`}
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </>
                          ) : (
                            <span className="text-[8px] font-mono text-content-muted">Slot {slotIdx + 1}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Bottom Row: Slots 11 to 21 (Slots 12 to 22) */}
                  <div className="grid grid-cols-11 gap-1.5">
                    {Array.from({ length: Math.floor(specs.maxPallets / 2) }).map((_, slotIdx) => {
                      const actualIdx = Math.ceil(specs.maxPallets / 2) + slotIdx;
                      const pallet = activeContainerSlots[actualIdx];
                      const isDragTarget = dragOverSlotIdx === actualIdx;
                      return (
                        <div
                          key={`bot-${slotIdx}`}
                          draggable={Boolean(pallet)}
                          onDragStart={(e) => {
                            if (!pallet) return;
                            setDraggedPalletNumber(pallet.palletNumber);
                            e.dataTransfer.setData('text/plain', pallet.palletNumber);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragEnd={() => {
                            setDraggedPalletNumber(null);
                            setDragOverSlotIdx(null);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'move';
                            if (dragOverSlotIdx !== actualIdx) {
                              setDragOverSlotIdx(actualIdx);
                            }
                          }}
                          onDragLeave={(e) => {
                            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                            if (dragOverSlotIdx === actualIdx) {
                              setDragOverSlotIdx(null);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const pNum = e.dataTransfer.getData('text/plain') || draggedPalletNumber;
                            if (pNum) {
                              handleDropOnSlot(actualIdx, pNum);
                            }
                            setDragOverSlotIdx(null);
                            setDraggedPalletNumber(null);
                          }}
                          className={`group relative h-13 min-w-[54px] rounded-lg border flex flex-col items-center justify-center p-1 text-center transition-all select-none ${
                            isDragTarget
                              ? 'ring-2 ring-brand-primary border-brand-primary bg-brand-primary-soft scale-102 shadow-md'
                              : pallet
                              ? 'bg-brand-primary-soft border-brand-primary/50 text-brand-primary shadow-xs hover:border-brand-primary cursor-grab active:cursor-grabbing'
                              : 'bg-surface border-dashed border-divider text-content-muted hover:border-brand-primary/40'
                          }`}
                          title={pallet ? `Pallet ${pallet.palletNumber} (Slot ${actualIdx + 1}) - Drag to reorder, move or unallocate` : `Empty Slot ${actualIdx + 1} - Drag pallet here`}
                        >
                          {pallet ? (
                            <>
                              <div className="flex items-center space-x-0.5 justify-center max-w-full px-0.5">
                                <span className="text-[9px] font-mono font-bold leading-tight truncate">
                                  {pallet.palletNumber}
                                </span>
                                {pallet.isSplitPiece && (
                                  <span className="text-[7px] font-bold px-0.5 py-0 rounded bg-purple-500/20 text-purple-700 dark:text-purple-300 shrink-0">
                                    SPLIT
                                  </span>
                                )}
                              </div>
                              <span className="text-[8px] font-mono text-content-secondary mt-0.5">
                                {pallet.boxCount ? `${pallet.boxCount}u · ` : ''}{pallet.grossWeightKg.toLocaleString()}k
                              </span>
                              {/* Explicit Unallocate Action on hover */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  movePalletToContainer(pallet.palletNumber, null);
                                }}
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-surface border border-divider text-content-muted hover:text-state-error hover:border-state-error/40 items-center justify-center shadow-xs transition-opacity hidden group-hover:flex"
                                title={`Unallocate ${pallet.palletNumber}`}
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </>
                          ) : (
                            <span className="text-[8px] font-mono text-content-muted">Slot {actualIdx + 1}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
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
                    value={vesselName}
                    onChange={(e) => setVesselName(e.target.value)}
                    className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary font-mono focus:outline-none focus:border-brand-primary"
                  />
                  <input
                    type="text"
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
              <span className="text-content-secondary">Cargo Gross ({cargoGrossWeight.toLocaleString()} kg) + Tare ({Number(activeContainer.tareWeightKg || 0).toLocaleString()} kg)</span>
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

      {/* =========================================================================
          CONTAINER PLAN MASTER WYSIWYG TABLE (Modeled after MAY 26-27.xlsx)
          ========================================================================= */}
      <div className="bg-surface border border-divider rounded-2xl shadow-sm overflow-hidden mt-6">
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-divider flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-secondary/30">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-brand-primary-soft text-brand-primary">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-content-primary uppercase tracking-wider">
                  Container Plan
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                  {containers.length} Container{containers.length > 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-xs text-content-secondary mt-0.5">
                Stuffing and multi-container allocation plan modeled after operator master report (MAY 26-27)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleExportContainerPlanXlsx}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center space-x-2 shadow-xs transition-colors cursor-pointer"
              title="Download Container Plan in Excel (.xlsx)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Container Plan (.xlsx)</span>
            </button>
          </div>
        </div>

        {containerPlanData.unallocatedPalletsCount > 0 && (
          <div className="px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-center justify-between">
            <span>
              <strong>Note:</strong> {containerPlanData.unallocatedPalletsCount} pallet{containerPlanData.unallocatedPalletsCount > 1 ? 's' : ''} currently unallocated on the floor. Drag or assign them to containers above to include them in the container plan.
            </span>
          </div>
        )}

        {/* Scrollable WYSIWYG Excel Grid */}
        <div className="overflow-x-auto custom-horizontal-scrollbar">
          <table className="w-full text-xs text-left border-collapse min-w-[1750px]">
            <thead>
              <tr className="bg-surface-secondary/70 text-content-secondary text-[11px] font-semibold border-b border-divider uppercase tracking-wider">
                <th className="py-3 px-4 min-w-[220px] whitespace-nowrap">Brand / Description</th>
                <th className="py-3 px-3.5 min-w-[130px] whitespace-nowrap">PI No</th>
                <th className="py-3 px-3.5 min-w-[130px] whitespace-nowrap">Pkg. List No.</th>
                <th className="py-3 px-4 min-w-[260px] whitespace-nowrap">Customer</th>
                <th className="py-3 px-3.5 min-w-[180px] whitespace-nowrap">Destn.</th>
                <th className="py-3 px-3.5 min-w-[140px] whitespace-nowrap">Custom Inv.</th>
                <th className="py-3 px-3.5 min-w-[100px] whitespace-nowrap text-center">Contract</th>
                <th className="py-3 px-3.5 min-w-[140px] whitespace-nowrap text-right">Value</th>
                <th className="py-3 px-3.5 min-w-[90px] whitespace-nowrap text-right">Pallets</th>
                <th className="py-3 px-3.5 min-w-[100px] whitespace-nowrap text-right">Qty</th>
                <th className="py-3 px-3.5 min-w-[120px] whitespace-nowrap text-right">GR WT (kg)</th>
                <th className="py-3 px-3.5 min-w-[120px] whitespace-nowrap text-right">NT WT (kg)</th>
                <th className="py-3 px-3.5 min-w-[130px] whitespace-nowrap">SB NO</th>
                <th className="py-3 px-3.5 min-w-[120px] whitespace-nowrap">DATE</th>
                <th className="py-3 px-4 min-w-[170px] whitespace-nowrap">CONTAINER</th>
                <th className="py-3 px-3.5 min-w-[130px] whitespace-nowrap">SEAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider/60">
              {containerPlanData.containerGroups.map((group, gIdx) => {
                const cont = group.container;
                return (
                  <React.Fragment key={cont.id || gIdx}>
                    {/* Container Banner Row */}
                    <tr className="bg-surface-secondary/40 font-semibold text-content-primary">
                      <td colSpan={16} className="py-3 px-4 text-xs whitespace-nowrap">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2.5">
                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-brand-primary" />
                            <span className="font-bold text-sm">{cont.label}</span>
                            <span className="text-content-secondary font-mono text-xs">
                              [{cont.containerNumber || 'Container No Pending'} / Seal: {cont.sealNumber || 'Pending'}]
                            </span>
                          </div>
                          <div className="flex items-center space-x-4 text-xs font-mono text-content-secondary">
                            <span>Tare: {cont.tareWeightKg} kg</span>
                            <span>•</span>
                            <span>Payload: {group.subtotalGrossWeight.toLocaleString()} kg</span>
                            <span>•</span>
                            <span className="text-state-success font-semibold">VGM: {group.vgmKg.toLocaleString()} kg</span>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* Line Items */}
                    {group.lineItems.length === 0 ? (
                      <tr>
                        <td colSpan={16} className="py-4 px-4 text-center text-content-muted italic bg-surface whitespace-nowrap">
                          No pallets allocated to {cont.label} yet.
                        </td>
                      </tr>
                    ) : (
                      group.lineItems.map((item) => (
                        <tr key={item.id} className="hover:bg-surface-secondary/30 transition-colors bg-surface">
                          <td className="py-2.5 px-4 font-medium text-content-primary whitespace-nowrap">{item.brand}</td>
                          <td className="py-2.5 px-3.5 font-mono text-content-secondary whitespace-nowrap">{item.piNo}</td>
                          <td className="py-2.5 px-3.5 font-mono text-content-secondary whitespace-nowrap">{item.pkgListNo}</td>
                          <td className="py-2.5 px-4 text-content-primary whitespace-nowrap">{item.customer}</td>
                          <td className="py-2.5 px-3.5 text-content-secondary whitespace-nowrap">{item.destination}</td>
                          <td className="py-2.5 px-3.5 font-mono font-semibold text-brand-primary whitespace-nowrap">{item.customInv}</td>
                          <td className="py-2.5 px-3.5 text-center font-mono text-[11px] text-content-secondary whitespace-nowrap">{item.contract}</td>
                          <td className="py-2.5 px-3.5 text-right font-mono text-content-primary whitespace-nowrap">{item.valueFormatted}</td>
                          <td className="py-2.5 px-3.5 text-right font-mono font-bold text-content-primary whitespace-nowrap">{item.palletsCount}</td>
                          <td className="py-2.5 px-3.5 text-right font-mono text-content-primary whitespace-nowrap">{item.quantity.toLocaleString()}</td>
                          <td className="py-2.5 px-3.5 text-right font-mono font-medium text-content-primary whitespace-nowrap">{item.grossWeightKg.toLocaleString()}</td>
                          <td className="py-2.5 px-3.5 text-right font-mono text-content-secondary whitespace-nowrap">{item.netWeightKg.toLocaleString()}</td>
                          <td className="py-2.5 px-3.5 font-mono text-content-secondary whitespace-nowrap">{item.sbNo}</td>
                          <td className="py-2.5 px-3.5 font-mono text-content-secondary whitespace-nowrap">{item.date}</td>
                          <td className="py-2.5 px-4 font-mono font-semibold text-content-primary whitespace-nowrap">{item.containerNo}</td>
                          <td className="py-2.5 px-3.5 font-mono text-content-secondary whitespace-nowrap">{item.sealNo}</td>
                        </tr>
                      ))
                    )}

                    {/* Subtotal Row */}
                    <tr className="bg-surface-secondary/80 font-semibold border-b border-divider text-content-primary">
                      <td colSpan={7} className="py-3 px-4 text-right text-xs uppercase tracking-wider text-content-secondary whitespace-nowrap">
                        Subtotal {cont.label}:
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono whitespace-nowrap">{group.subtotalValueFormatted}</td>
                      <td className="py-3 px-3.5 text-right font-mono text-brand-primary font-bold whitespace-nowrap">{group.subtotalPallets}</td>
                      <td className="py-3 px-3.5 text-right font-mono font-bold whitespace-nowrap">{group.subtotalQty.toLocaleString()}</td>
                      <td className="py-3 px-3.5 text-right font-mono font-bold whitespace-nowrap">{group.subtotalGrossWeight.toLocaleString()}</td>
                      <td className="py-3 px-3.5 text-right font-mono font-bold whitespace-nowrap">{group.subtotalNetWeight.toLocaleString()}</td>
                      <td colSpan={2} className="py-3 px-3.5 whitespace-nowrap" />
                      <td className="py-3 px-4 font-mono text-xs text-content-secondary whitespace-nowrap">{cont.containerNumber || cont.label}</td>
                      <td className="py-3 px-3.5 font-mono text-xs text-content-secondary whitespace-nowrap">{cont.sealNumber || '-'}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>

            {/* Grand Total Footer */}
            <tfoot>
              <tr className="bg-brand-primary-soft/40 border-t-2 border-divider font-bold text-content-primary text-xs">
                <td colSpan={7} className="py-3.5 px-4 text-right uppercase tracking-wider text-content-primary whitespace-nowrap">
                  Grand Total ({containers.length} Container{containers.length > 1 ? 's' : ''}):
                </td>
                <td className="py-3.5 px-3.5 text-right font-mono text-brand-primary whitespace-nowrap">{containerPlanData.grandTotalValueFormatted}</td>
                <td className="py-3.5 px-3.5 text-right font-mono text-brand-primary text-sm font-black whitespace-nowrap">{containerPlanData.grandTotalPallets}</td>
                <td className="py-3.5 px-3.5 text-right font-mono text-sm font-black whitespace-nowrap">{containerPlanData.grandTotalQty.toLocaleString()}</td>
                <td className="py-3.5 px-3.5 text-right font-mono text-sm font-black whitespace-nowrap">{containerPlanData.grandTotalGrossWeight.toLocaleString()}</td>
                <td className="py-3.5 px-3.5 text-right font-mono text-sm font-black whitespace-nowrap">{containerPlanData.grandTotalNetWeight.toLocaleString()}</td>
                <td colSpan={4} className="py-3.5 px-4 text-content-secondary text-[11px] font-normal text-right whitespace-nowrap">
                  All containers combined
                </td>
              </tr>
            </tfoot>
          </table>
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
                <div className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary font-semibold text-xs">
                  20Ft Container
                </div>
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

      {/* Floor Stock (Loose Stock) Picker Modal */}
      {showFloorStockPicker && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-divider rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-divider">
              <div className="flex items-center space-x-2">
                <Package className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-content-primary">
                  Add Floor Stock (Loose Units) to Container
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFloorStockPicker(false)}
                className="text-content-muted hover:text-content-primary p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-content-secondary leading-relaxed">
              Select loose boxes or pending pallets retained in warehouse from partial dispatches. These will be loaded into active container (<strong>{activeContainer.label}</strong>).
            </p>

            <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1 font-mono">
              {floorStockWarehouseItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-content-secondary border border-dashed border-divider rounded-xl">
                  No loose floor stock currently in warehouse.
                </div>
              ) : (
                floorStockWarehouseItems.map((item: FloorStockItem) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl border border-divider bg-surface-secondary/40 hover:bg-surface-secondary/80 flex items-center justify-between text-xs transition-colors"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-brand-primary">PLT #{item.palletNumber}</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          Ex-PLT #{item.parentPalletNumber || item.palletNumber}
                        </span>
                        <span className="text-content-primary font-bold">({item.looseUnits} Units)</span>
                      </div>
                      <div className="text-[11px] text-content-secondary mt-0.5">
                        Invoice: <strong>#{item.invoiceNo}</strong> • Consignee: {item.customer} • {item.model}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddFloorStockToContainer(item)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-primary hover:bg-brand-primary-hover text-white shadow-2xs transition-colors cursor-pointer shrink-0 ml-3"
                    >
                      + Add to Plan
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-divider">
              <button
                type="button"
                onClick={() => setShowFloorStockPicker(false)}
                className="px-4 py-1.5 rounded-lg border border-divider bg-surface hover:bg-surface-secondary text-xs font-medium text-content-primary cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split / Move Units Pop-up Modal */}
      {splitMoveState.isOpen && splitMoveState.sourcePallet && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-divider rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-divider">
              <div className="flex items-center space-x-2">
                <Scissors className="w-4 h-4 text-brand-primary" />
                <h3 className="text-sm font-bold text-content-primary">
                  Split / Move Units &mdash; {splitMoveState.sourcePallet.palletNumber}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSplitMoveState((prev) => ({ ...prev, isOpen: false, sourcePallet: null }))}
                className="text-content-muted hover:text-content-primary p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Source summary */}
            <div className="p-2.5 rounded-xl bg-surface-secondary border border-divider text-xs font-mono space-y-1">
              <div className="flex justify-between text-content-secondary">
                <span>Current Pallet Boxes:</span>
                <span className="font-bold text-content-primary">{splitMoveState.sourcePallet.boxCount} units</span>
              </div>
              <div className="flex justify-between text-content-secondary">
                <span>Gross / Net Weight:</span>
                <span className="text-content-primary font-semibold">
                  {splitMoveState.sourcePallet.grossWeightKg} kg / {splitMoveState.sourcePallet.netWeightKg} kg
                </span>
              </div>
            </div>

            {/* Units to move */}
            <div>
              <label className="block text-[11px] font-semibold text-content-secondary mb-1">
                Units to Move (1 to {splitMoveState.sourcePallet.boxCount - 1}):
              </label>
              <input
                type="number"
                min={1}
                max={splitMoveState.sourcePallet.boxCount - 1}
                value={splitMoveState.unitsToMove}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(splitMoveState.sourcePallet!.boxCount - 1, Number(e.target.value) || 1));
                  setSplitMoveState((prev) => ({ ...prev, unitsToMove: val }));
                }}
                className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary font-mono focus:outline-none focus:border-brand-primary text-xs"
              />
            </div>

            {/* Destination Mode */}
            <div>
              <label className="block text-[11px] font-semibold text-content-secondary mb-1">
                Destination Type:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSplitMoveState((prev) => ({ ...prev, destinationMode: 'SEPARATE_SPLIT' }))}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all text-left cursor-pointer ${
                    splitMoveState.destinationMode === 'SEPARATE_SPLIT'
                      ? 'bg-brand-primary text-brand-primary-text border-brand-primary shadow-xs'
                      : 'bg-surface-secondary text-content-secondary border-divider hover:text-content-primary'
                  }`}
                >
                  <div className="font-bold">Separate Split Piece</div>
                  <div className="text-[10px] opacity-80 mt-0.5">Load into container slot</div>
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMoveState((prev) => ({ ...prev, destinationMode: 'TOP_UP_MERGE' }))}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all text-left cursor-pointer ${
                    splitMoveState.destinationMode === 'TOP_UP_MERGE'
                      ? 'bg-brand-primary text-brand-primary-text border-brand-primary shadow-xs'
                      : 'bg-surface-secondary text-content-secondary border-divider hover:text-content-primary'
                  }`}
                >
                  <div className="font-bold">Load onto Pallet</div>
                  <div className="text-[10px] opacity-80 mt-0.5">Top-up existing pallet</div>
                </button>
              </div>
            </div>

            {/* Destination selector */}
            {splitMoveState.destinationMode === 'SEPARATE_SPLIT' ? (
              <div>
                <label className="block text-[11px] font-semibold text-content-secondary mb-1">
                  Target Container:
                </label>
                <select
                  value={splitMoveState.targetContainerId}
                  onChange={(e) => setSplitMoveState((prev) => ({ ...prev, targetContainerId: e.target.value }))}
                  className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary text-xs focus:outline-none focus:border-brand-primary cursor-pointer"
                >
                  {containers.map((c, cIdx) => (
                    <option key={c.id} value={c.id}>
                      Container {cIdx + 1} {c.containerNumber ? `(${c.containerNumber})` : ''}
                    </option>
                  ))}
                  <option value="+new">+ New Container</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-semibold text-content-secondary mb-1">
                  Target Pallet to Top-Up:
                </label>
                <select
                  value={splitMoveState.targetPalletId}
                  onChange={(e) => setSplitMoveState((prev) => ({ ...prev, targetPalletId: e.target.value }))}
                  className="w-full bg-input-bg border border-divider rounded-lg px-3 py-2 text-content-primary text-xs font-mono focus:outline-none focus:border-brand-primary cursor-pointer"
                >
                  {pallets
                    .filter((p) => (p.id || p.palletNumber) !== (splitMoveState.sourcePallet?.id || splitMoveState.sourcePallet?.palletNumber))
                    .map((p) => (
                      <option key={p.id || p.palletNumber} value={p.id || p.palletNumber}>
                        {p.palletNumber} ({p.boxCount || 0} Units &bull; {p.grossWeightKg} kg)
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Live Preview Strip */}
            {(() => {
              const src = splitMoveState.sourcePallet;
              const u = splitMoveState.unitsToMove;
              const origG = src.grossWeightKg || 0;
              const origN = src.netWeightKg || 0;
              const deltaG = toExactWeight((origG / (src.boxCount || 1)) * u);
              const deltaN = toExactWeight((origN / (src.boxCount || 1)) * u);
              const remG = toExactWeight(origG - deltaG);
              const remN = toExactWeight(origN - deltaN);
              const remU = src.boxCount - u;

              return (
                <div className="p-3 bg-brand-primary-soft/20 border border-brand-primary/30 rounded-xl space-y-1.5 text-xs font-mono">
                  <div className="text-[11px] font-bold text-brand-primary uppercase tracking-wide">
                    Live Split Preview (0.00 kg Variance)
                  </div>
                  <div className="flex justify-between text-content-secondary">
                    <span>Source {src.palletNumber} Remains:</span>
                    <span className="font-semibold text-content-primary">{remU} Units &bull; {remG} kg gross ({remN} kg net)</span>
                  </div>
                  <div className="flex justify-between text-content-secondary">
                    <span>Split / Moved:</span>
                    <span className="font-semibold text-brand-primary">+{u} Units &bull; {deltaG} kg gross ({deltaN} kg net)</span>
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end space-x-2 pt-2 border-t border-divider">
              <button
                type="button"
                onClick={() => setSplitMoveState((prev) => ({ ...prev, isOpen: false, sourcePallet: null }))}
                className="px-3 py-1.5 rounded-lg text-xs text-content-secondary hover:text-content-primary cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteSplitMove}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-brand-primary hover:bg-brand-primary-hover text-brand-primary-text shadow-sm cursor-pointer"
              >
                Confirm Split / Move
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
