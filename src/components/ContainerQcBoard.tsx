import React, { useState, useMemo } from 'react';
import { 
  GripVertical, 
  AlertTriangle, 
  CheckCircle2, 
  Lock, 
  Flame, 
  Trash2, 
  ArrowRightLeft,
  ShieldAlert,
  Info
} from 'lucide-react';
import type { 
  ContainerAllocation, 
  ContainerType, 
  LineItem, 
  Pallet,
  ConvertedInvoice
} from '../types';
import { CONTAINER_SPECS } from '../types';
import { recalculateContainer } from '../utils/containerAllocator';
import { DEFAULT_PALLET_DIMENSIONS } from '../utils/containerOptimizer';
import { reconcileShipment } from '../utils/reconciliationEngine';
import { detectCrossDocumentConflicts } from '../utils/conflictDetector';

interface ContainerQcBoardProps {
  containers: ContainerAllocation[];
  pallets: Pallet[];
  lineItems: LineItem[];
  hasDangerousGoods?: boolean;
  invoice?: ConvertedInvoice;
  rawDocumentText?: string;
  onUpdateContainers: (updatedContainers: ContainerAllocation[], updatedPallets: Pallet[]) => void;
  onAutoReallocate?: (type?: ContainerType) => void;
  onAddContainer?: (type: ContainerType) => void;
  onDeleteContainer?: (id: string) => void;
  onContainerTypeChange?: (id: string, type: ContainerType) => void;
  onContainerFieldChange?: (id: string, field: 'containerNumber' | 'sealNumber', val: string) => void;
  onLockAndGenerate: () => void;
  onQuickDownloadBol?: () => void;
  onQuickDownloadDg?: () => void;
}

export const ContainerQcBoard: React.FC<ContainerQcBoardProps> = ({
  containers,
  pallets,
  lineItems,
  hasDangerousGoods: _hasDangerousGoods,
  invoice,
  rawDocumentText,
  onUpdateContainers,
  onAutoReallocate: _onAutoReallocate,
  onAddContainer: _onAddContainer,
  onDeleteContainer,
  onContainerTypeChange,
  onContainerFieldChange,
  onLockAndGenerate,
  onQuickDownloadBol: _onQuickDownloadBol,
  onQuickDownloadDg: _onQuickDownloadDg
}) => {
  // Drag & drop state
  const [draggedPalletId, setDraggedPalletId] = useState<string | null>(null);
  const [sourceContainerId, setSourceContainerId] = useState<string | null>(null);
  const [dragOverContainerId, setDragOverContainerId] = useState<string | null>(null);
  const [violationNotice, setViolationNotice] = useState<string | null>(null);
  const [dismissedConflicts, setDismissedConflicts] = useState<Set<string>>(new Set());

  // Active Shipment representation for deterministic numerical reconciliation
  const activeShipment: ConvertedInvoice = useMemo(() => {
    if (invoice) {
      return {
        ...invoice,
        containers,
        pallets,
        lineItems
      };
    }
    const totalG = containers.reduce((s, c) => s + c.totalGrossWeightKg, 0);
    const totalN = containers.reduce((s, c) => s + c.totalNetWeightKg, 0);
    const totalP = containers.reduce((s, c) => s + c.totalPackages, 0);

    return {
      id: 'active-qc-session',
      fileName: 'active-session.pdf',
      fileSize: 1024,
      convertedAt: 'Today',
      rawTimestamp: 0,
      status: 'converted' as const,
      invoiceNumber: 'ACTIVE',
      invoiceDate: '2026-11-04',
      exporterName: 'Declared Shipper',
      consigneeName: 'Declared Consignee',
      portOfLoading: 'INNSA1',
      portOfDischarge: 'DEHAM',
      finalDestination: 'DE',
      destinationCountry: 'DE',
      incoterm: 'FOB' as const,
      currency: 'USD',
      exchangeRate: 1,
      invoiceTotal: 0,
      grossWeightKg: totalG,
      netWeightKg: totalN,
      totalPackages: totalP,
      packageType: 'BOX',
      totalPallets: pallets.length,
      hasDangerousGoods: Boolean(_hasDangerousGoods),
      selectedBolTemplateId: 'bol-standard',
      selectedDgTemplateId: 'dg-imo-standard',
      containers,
      pallets,
      lineItems
    };
  }, [invoice, containers, pallets, lineItems, _hasDangerousGoods]);

  // Run Deterministic Numerical Reconciliation Engine
  const reconciliation = useMemo(() => reconcileShipment(activeShipment), [activeShipment]);

  // Run Cross-Document Conflict Exception Engine
  const rawConflicts = useMemo(() => 
    detectCrossDocumentConflicts(activeShipment, rawDocumentText || ''), 
    [activeShipment, rawDocumentText]
  );

  const activeConflicts = rawConflicts.filter(c => !dismissedConflicts.has(c.id));

  // Pallet transfer handler
  const movePallet = (palletId: string, fromContainerId: string, toContainerId: string) => {
    if (fromContainerId === toContainerId) return;

    const sourceCont = containers.find(c => c.id === fromContainerId);
    const targetCont = containers.find(c => c.id === toContainerId);
    const movingPallet = pallets.find(p => p.id === palletId);

    if (!sourceCont || !targetCont || !movingPallet) return;

    const targetSpec = CONTAINER_SPECS[targetCont.containerType] || CONTAINER_SPECS['20GP'];
    const maxPallets = targetCont.maxPallets || targetSpec.maxPallets;
    const maxPayloadKg = targetCont.maxPayloadKg || targetSpec.maxPayloadKg;

    // Projected check for warnings
    const projectedWeight = targetCont.totalGrossWeightKg + movingPallet.grossWeightKg;
    const projectedPallets = targetCont.pallets.length + 1;

    if (projectedPallets > maxPallets) {
      setViolationNotice(
        `Warning: Moving Pallet ${movingPallet.palletNumber} to ${targetCont.containerNumber} exceeds the 20' floor limit (${maxPallets} pallets max). Container marked as over-capacity.`
      );
    } else if (projectedWeight > maxPayloadKg) {
      setViolationNotice(
        `Warning: Moving Pallet ${movingPallet.palletNumber} to ${targetCont.containerNumber} exceeds the 25-ton payload cap (${maxPayloadKg.toLocaleString()} kg). Container marked as overweight.`
      );
    } else {
      setViolationNotice(null);
    }

    // Update pallet assigned container ID
    const updatedPallets = pallets.map(p => 
      p.id === palletId ? { ...p, assignedContainerId: toContainerId } : p
    );

    // Update containers
    const updatedContainers = containers.map(cont => {
      if (cont.id === fromContainerId) {
        const remainingPallets = cont.pallets.filter(p => p.id !== palletId);
        const remainingIds = cont.assignedPalletIds.filter(id => id !== palletId);
        return recalculateContainer({
          ...cont,
          pallets: remainingPallets,
          assignedPalletIds: remainingIds
        });
      }
      if (cont.id === toContainerId) {
        const addedPallets = [...cont.pallets, { ...movingPallet, assignedContainerId: toContainerId }];
        const addedIds = [...cont.assignedPalletIds, palletId];
        return recalculateContainer({
          ...cont,
          pallets: addedPallets,
          assignedPalletIds: addedIds
        });
      }
      return cont;
    });

    onUpdateContainers(updatedContainers, updatedPallets);
  };

  // Drag event listeners
  const handleDragStart = (e: React.DragEvent, palletId: string, contId: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ palletId, contId }));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedPalletId(palletId);
    setSourceContainerId(contId);
  };

  const handleDragOver = (e: React.DragEvent, contId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverContainerId !== contId) {
      setDragOverContainerId(contId);
    }
  };

  const handleDragLeave = () => {
    setDragOverContainerId(null);
  };

  const handleDrop = (e: React.DragEvent, toContainerId: string) => {
    e.preventDefault();
    setDragOverContainerId(null);
    setDraggedPalletId(null);
    setSourceContainerId(null);

    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.palletId && data.contId) {
        movePallet(data.palletId, data.contId, toContainerId);
      }
    } catch {
      if (draggedPalletId && sourceContainerId) {
        movePallet(draggedPalletId, sourceContainerId, toContainerId);
      }
    }
  };

  const handleDirectMove = (palletId: string, currentContId: string, targetContId: string) => {
    movePallet(palletId, currentContId, targetContId);
  };

  const totalGrossManifest = containers.reduce((s, c) => s + c.totalGrossWeightKg, 0);
  const totalPalletsManifest = containers.reduce((s, c) => s + c.pallets.length, 0);
  const anyViolations = containers.some(c => c.isOverweight || c.isOverCapacity);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-zinc-50/50 overflow-hidden">
      {/* 1. Numerical Reconciliation Alert Banner (Mandatory Invariant Check) */}
      {!reconciliation.isValid && (
        <div className="px-5 py-2.5 bg-rose-50 border-b border-rose-200 text-rose-900 text-xs shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-rose-950">
                  Numerical Reconciliation Discrepancy Detected — Document Export Locked
                </div>
                <div className="text-[11px] text-rose-800 mt-0.5 space-y-0.5 font-mono">
                  {reconciliation.errors.map((err, i) => (
                    <div key={i}>• {err}</div>
                  ))}
                </div>
                <div className="text-[10px] text-rose-700 mt-1 font-mono">
                  Pallet Gross Sum: {reconciliation.palletGrossSum.toLocaleString()} kg | Declared Gross: {reconciliation.declaredGrossKg.toLocaleString()} kg (Variance: {reconciliation.grossVarianceKg.toFixed(2)} kg) | Pallets: {reconciliation.allocatedPalletCount}/{reconciliation.declaredPalletCount}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Cross-Document Conflict Exception Handling Banner */}
      {activeConflicts.length > 0 && (
        <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs shrink-0">
          <div className="flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-amber-950 flex items-center gap-1.5">
                <span>Cross-Document Conflict Detected ({activeConflicts.length})</span>
                <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-amber-200/70 text-amber-900 uppercase">
                  Operator Verification Required
                </span>
              </div>
              <div className="mt-1 space-y-1.5">
                {activeConflicts.map(conf => (
                  <div key={conf.id} className="p-2 rounded bg-white/80 border border-amber-200/60 text-[11px]">
                    <div className="flex items-center justify-between font-mono text-zinc-900 font-medium">
                      <span>{conf.label}</span>
                      <button
                        type="button"
                        onClick={() => setDismissedConflicts(prev => new Set([...prev, conf.id]))}
                        className="text-[10px] text-amber-700 hover:text-amber-950 underline cursor-pointer"
                      >
                        Acknowledge & Dismiss
                      </button>
                    </div>
                    <div className="mt-0.5 text-zinc-600 text-[10.5px]">
                      {conf.description}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-zinc-500 flex items-center gap-3">
                      <span>Source A: <strong>{conf.valueA}</strong></span>
                      <span>Source B: <strong>{conf.valueB}</strong></span>
                      {conf.recommendedValue && (
                        <span className="text-emerald-700 font-semibold">
                          Recommended: {conf.recommendedValue}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Drag-and-Drop Local Warning Notice */}
      {violationNotice && (
        <div className="px-5 py-2 bg-amber-50 border-b border-amber-200/80 flex items-center justify-between text-xs text-amber-900 shrink-0">
          <div className="flex items-center space-x-2">
            <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>{violationNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setViolationNotice(null)}
            className="text-amber-800 hover:text-amber-950 font-medium px-2 py-0.5 rounded cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* =========================================================================
          COLUMN-BASED KANBAN TABLE LAYOUT
         ========================================================================= */}
      <div className="flex-1 min-h-0 overflow-x-auto p-4">
        <div className="flex items-stretch space-x-4 min-w-max h-full pb-1">
          {containers.map((cont, cIdx) => {
            const spec = CONTAINER_SPECS[cont.containerType] || CONTAINER_SPECS['20GP'];
            const maxPayload = cont.maxPayloadKg || spec.maxPayloadKg;
            const maxPallets = cont.maxPallets || spec.maxPallets;

            const weightPct = Math.min(100, Math.round((cont.totalGrossWeightKg / maxPayload) * 100));
            const palletPct = Math.min(100, Math.round((cont.pallets.length / maxPallets) * 100));

            const isWeightOver = cont.totalGrossWeightKg > maxPayload;
            const isPalletOver = cont.pallets.length > maxPallets;
            const isSpillover = cont.isSpillover || cIdx > 0;
            const isDropTarget = dragOverContainerId === cont.id;

            return (
              <div
                key={cont.id}
                onDragOver={(e) => handleDragOver(e, cont.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, cont.id)}
                className={`w-[340px] flex flex-col h-full bg-white rounded-xl border p-3.5 shadow-xs transition-all duration-150 ${
                  isDropTarget 
                    ? 'ring-2 ring-zinc-900 border-zinc-900 bg-zinc-50/50' 
                    : isWeightOver || isPalletOver
                    ? 'border-rose-300 ring-1 ring-rose-300'
                    : 'border-zinc-200'
                }`}
              >
                {/* Column Table Header (Strict 2-Row Layout to Prevent Overlaps) */}
                <div className="shrink-0 pb-2.5 border-b border-zinc-100 space-y-1.5">
                  {/* Row 1: Container Number Badge + Container Type Dropdown + Delete Button */}
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center space-x-1.5 min-w-0">
                      <span className={`w-5 h-5 rounded font-mono text-[11px] font-semibold flex items-center justify-center shrink-0 ${
                        isSpillover ? 'bg-zinc-200 text-zinc-800' : 'bg-zinc-900 text-white'
                      }`}>
                        {cIdx + 1}
                      </span>
                      {onContainerFieldChange ? (
                        <input
                          type="text"
                          value={cont.containerNumber}
                          onChange={(e) => onContainerFieldChange(cont.id, 'containerNumber', e.target.value)}
                          className="font-mono font-semibold text-xs text-zinc-900 bg-zinc-50 hover:bg-zinc-100 focus:bg-white px-1.5 py-0.5 rounded border border-zinc-200 focus:border-zinc-400 outline-none w-28 truncate"
                          title="Container Number"
                        />
                      ) : (
                        <span className="font-mono font-semibold text-xs text-zinc-900 truncate">
                          {cont.containerNumber}
                        </span>
                      )}
                      {isSpillover && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase bg-zinc-100 text-zinc-600 border border-zinc-200 shrink-0">
                          Spill
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      {onContainerTypeChange && (
                        <select
                          value={cont.containerType}
                          onChange={(e) => onContainerTypeChange(cont.id, e.target.value as ContainerType)}
                          className="text-[10px] font-medium bg-zinc-50 text-zinc-700 rounded px-1.5 py-1 border border-zinc-200 outline-none cursor-pointer hover:bg-zinc-100 max-w-[125px] truncate"
                          title="Container Type & Specs"
                        >
                          <option value="20GP">20' GP (25T/11P)</option>
                          <option value="40GP">40' GP (26.5T/24P)</option>
                          <option value="40HC">40' HC (26.5T/24P)</option>
                          <option value="45HC">45' HC (27.8T/26P)</option>
                        </select>
                      )}

                      {containers.length > 1 && onDeleteContainer && (
                        <button
                          type="button"
                          onClick={() => onDeleteContainer(cont.id)}
                          className="p-1 text-zinc-300 hover:text-rose-600 rounded transition-colors cursor-pointer shrink-0"
                          title="Remove Container"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Seal Number + Tare Weight Metadata */}
                  <div className="flex items-center justify-between text-[10.5px] font-mono text-zinc-500 pt-0.5 px-0.5">
                    <div className="flex items-center space-x-1 min-w-0">
                      <span className="text-[10px] text-zinc-400">Seal:</span>
                      {onContainerFieldChange ? (
                        <input
                          type="text"
                          value={cont.sealNumber}
                          onChange={(e) => onContainerFieldChange(cont.id, 'sealNumber', e.target.value)}
                          className="font-mono text-[10px] text-zinc-700 bg-transparent hover:bg-zinc-50 focus:bg-white px-1 py-0.2 rounded border border-transparent hover:border-zinc-200 outline-none w-24 truncate"
                          title="Seal Number"
                        />
                      ) : (
                        <span className="text-[10px] text-zinc-700 font-medium truncate">{cont.sealNumber}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-400 shrink-0">
                      Tare: {spec.tareWeightKg.toLocaleString()} kg
                    </span>
                  </div>
                </div>

                {/* Draggable Pallet Cards Container */}
                <div className="flex-1 min-h-0 overflow-y-auto py-2 space-y-2 pr-0.5">
                  {cont.pallets.length === 0 ? (
                    <div className="h-32 border border-dashed border-zinc-200 rounded-lg flex flex-col items-center justify-center text-center p-4 text-zinc-400">
                      <ArrowRightLeft className="w-4 h-4 mb-1 opacity-40" />
                      <span className="text-xs font-medium">Drop pallets here</span>
                      <span className="text-[10px] text-zinc-400 mt-0.5">Drag any pallet card into this column</span>
                    </div>
                  ) : (
                    cont.pallets.map((pallet) => {
                      const isDragging = draggedPalletId === pallet.id;
                      const lineItem = lineItems.find(it => pallet.lineItemIds.includes(it.id));
                      const modelText = pallet.modelOrDescription || lineItem?.description || 'Export Cargo Goods';

                      return (
                        <div
                          key={pallet.id}
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, pallet.id, cont.id)}
                          className={`group p-2.5 bg-white border rounded-lg transition-all cursor-grab active:cursor-grabbing relative ${
                            isDragging 
                              ? 'opacity-30 border-zinc-900 scale-[0.98]' 
                              : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/40 shadow-2xs'
                          }`}
                        >
                          {/* Row 1: Pallet ID + Package Count + Clean Right-Aligned Gross Weight */}
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center space-x-1.5 min-w-0">
                              <GripVertical className="w-3.5 h-3.5 text-zinc-300 group-hover:text-zinc-600 shrink-0" />
                              <span className="px-1.5 py-0.5 rounded text-xs font-mono font-semibold bg-zinc-100 text-zinc-900 border border-zinc-200">
                                {pallet.palletNumber}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-500">
                                {pallet.packageCount} {pallet.packageType || 'BOX'}
                              </span>
                            </div>

                            <div className="font-mono text-xs font-semibold text-zinc-900 tabular-nums shrink-0">
                              {pallet.grossWeightKg.toLocaleString()} kg
                            </div>
                          </div>

                          {/* Row 2: Cargo Model / Description */}
                          <div className="mt-1 text-[11px] font-normal text-zinc-600 truncate pl-5">
                            {modelText}
                          </div>

                          {/* Row 3: Compact HazMat Badge / Dimensions Footer */}
                          <div className="mt-2 pt-1.5 border-t border-zinc-100 flex items-center justify-between gap-1.5 pl-5 text-[10px] font-mono">
                            <div className="flex items-center space-x-1.5 min-w-0 truncate">
                              {pallet.isDangerousGoods ? (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded font-mono text-[9.5px] font-medium bg-zinc-100 text-zinc-800 border border-zinc-200 shrink-0">
                                  <Flame className="w-2.5 h-2.5 text-rose-500" />
                                  <span>{pallet.unNumber || 'UN 2794'}</span>
                                </span>
                              ) : (
                                <span className="text-zinc-400">Net: {pallet.netWeightKg.toLocaleString()} kg</span>
                              )}
                              <span className="text-zinc-400 truncate">• {pallet.dimensions || DEFAULT_PALLET_DIMENSIONS}</span>
                            </div>

                            {containers.length > 1 && (
                              <select
                                value={cont.id}
                                onChange={(e) => handleDirectMove(pallet.id, cont.id, e.target.value)}
                                className="text-[9px] bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded px-1.5 py-0.5 text-zinc-600 cursor-pointer font-sans shrink-0"
                                onClick={(e) => e.stopPropagation()}
                                title="Move pallet to another container"
                              >
                                {containers.map((c, idx) => (
                                  <option key={c.id} value={c.id}>
                                    C#{idx + 1}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Real-Time Metrics & Capacity Bars (Column Footer) */}
                <div className="shrink-0 pt-2.5 border-t border-zinc-100 space-y-1.5 text-xs">
                  {/* Metric A: Weight Payload Counter & Bar */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-medium text-zinc-600">Payload Weight</span>
                      <span className="font-mono text-zinc-600 tabular-nums">
                        <strong className={isWeightOver ? 'text-rose-600 font-bold' : 'text-zinc-900 font-semibold'}>
                          {cont.totalGrossWeightKg.toLocaleString()}
                        </strong> / {maxPayload.toLocaleString()} kg ({weightPct}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          isWeightOver ? 'bg-rose-600' : 'bg-zinc-900'
                        }`}
                        style={{ width: `${Math.min(100, weightPct)}%` }}
                      />
                    </div>
                  </div>

                  {/* Metric B: Floor Pallet Count & Footprint Bar */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-medium text-zinc-600">Floor Pallets</span>
                      <span className="font-mono text-zinc-600 tabular-nums">
                        <strong className={isPalletOver ? 'text-rose-600 font-bold' : 'text-zinc-900 font-semibold'}>
                          {cont.pallets.length}
                        </strong> / {maxPallets} Pallets
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          isPalletOver ? 'bg-rose-600' : 'bg-zinc-700'
                        }`}
                        style={{ width: `${Math.min(100, palletPct)}%` }}
                      />
                    </div>
                  </div>

                  {/* Status Indicator */}
                  <div className="pt-1 flex items-center justify-between text-[10px] font-mono text-zinc-400">
                    {isWeightOver || isPalletOver ? (
                      <span className="text-rose-600 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-rose-600" />
                        <span>Limit Exceeded</span>
                      </span>
                    ) : cont.pallets.length === maxPallets ? (
                      <span className="text-zinc-700 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-zinc-600" />
                        <span>Full (11/11)</span>
                      </span>
                    ) : (
                      <span className="text-zinc-500">
                        Slots: {Math.max(0, maxPallets - cont.pallets.length)}
                      </span>
                    )}

                    <span>
                      VGM: {(cont.totalGrossWeightKg + spec.tareWeightKg).toLocaleString()} kg
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
          LOCK SHIPMENT PLAN & GENERATE DOCUMENTS (STICKY FOOTER ACTION)
         ========================================================================= */}
      <div className="h-12 bg-white border-t border-zinc-200 px-5 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center space-x-6 text-xs">
          <div>
            <span className="text-zinc-400 block text-[10px] uppercase font-medium tracking-wider">Total Pallets</span>
            <span className="font-mono font-semibold text-zinc-900 text-xs tabular-nums">
              {totalPalletsManifest} Pallets
            </span>
          </div>
          <div className="h-5 w-px bg-zinc-200" />
          <div>
            <span className="text-zinc-400 block text-[10px] uppercase font-medium tracking-wider">Total Gross Weight</span>
            <span className="font-mono font-semibold text-zinc-900 text-xs tabular-nums">
              {totalGrossManifest.toLocaleString()} kg
            </span>
          </div>
          <div className="h-5 w-px bg-zinc-200" />
          <div>
            <span className="text-zinc-400 block text-[10px] uppercase font-medium tracking-wider">Container Count</span>
            <span className="font-mono font-semibold text-zinc-900 text-xs">
              {containers.length} Containers {containers.length > 1 ? `(1 Primary + ${containers.length - 1} Spillover)` : ''}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {!reconciliation.isValid ? (
            <span className="text-xs text-rose-600 font-medium flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
              <span>Reconciliation variance &gt; 0.01 kg. Resolve before locking.</span>
            </span>
          ) : anyViolations ? (
            <span className="text-xs text-rose-600 font-medium flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>Limits breached. Adjust before locking.</span>
            </span>
          ) : null}

          <button
            type="button"
            disabled={!reconciliation.isValid || anyViolations}
            onClick={onLockAndGenerate}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              !reconciliation.isValid || anyViolations
                ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed shadow-none'
                : 'bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-950 text-white shadow-2xs cursor-pointer'
            }`}
            title={
              !reconciliation.isValid 
                ? 'Mathematical reconciliation must have ≤ 0.01 kg variance to lock' 
                : anyViolations 
                ? 'Resolve container weight/pallet limit breaches before locking' 
                : 'Lock plan and proceed to DG & Master BOL generation'
            }
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Lock Plan & Generate Documents</span>
          </button>
        </div>
      </div>
    </div>
  );
};
