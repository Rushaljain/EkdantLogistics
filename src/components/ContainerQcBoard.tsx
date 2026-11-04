import React, { useState } from 'react';
import { 
  Boxes, 
  GripVertical, 
  AlertTriangle, 
  CheckCircle2, 
  Lock, 
  Flame, 
  Plus, 
  Trash2, 
  RefreshCw, 
  Download, 
  ArrowRightLeft 
} from 'lucide-react';
import type { 
  ContainerAllocation, 
  ContainerType, 
  LineItem, 
  Pallet 
} from '../types';
import { CONTAINER_SPECS } from '../types';
import { recalculateContainer } from '../utils/containerAllocator';
import { DEFAULT_PALLET_DIMENSIONS } from '../utils/containerOptimizer';

interface ContainerQcBoardProps {
  containers: ContainerAllocation[];
  pallets: Pallet[];
  lineItems: LineItem[];
  hasDangerousGoods: boolean;
  onUpdateContainers: (updatedContainers: ContainerAllocation[], updatedPallets: Pallet[]) => void;
  onAutoReallocate: (type?: ContainerType) => void;
  onAddContainer?: (type: ContainerType) => void;
  onDeleteContainer?: (id: string) => void;
  onContainerTypeChange?: (id: string, type: ContainerType) => void;
  onContainerFieldChange?: (id: string, field: 'containerNumber' | 'sealNumber', val: string) => void;
  onLockAndGenerate: () => void;
  onQuickDownloadBol: () => void;
  onQuickDownloadDg: () => void;
}

export const ContainerQcBoard: React.FC<ContainerQcBoardProps> = ({
  containers,
  pallets,
  lineItems,
  hasDangerousGoods,
  onUpdateContainers,
  onAutoReallocate,
  onAddContainer,
  onDeleteContainer,
  onContainerTypeChange,
  onContainerFieldChange,
  onLockAndGenerate,
  onQuickDownloadBol,
  onQuickDownloadDg
}) => {
  // Drag & drop state
  const [draggedPalletId, setDraggedPalletId] = useState<string | null>(null);
  const [sourceContainerId, setSourceContainerId] = useState<string | null>(null);
  const [dragOverContainerId, setDragOverContainerId] = useState<string | null>(null);
  const [violationNotice, setViolationNotice] = useState<string | null>(null);

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
      // Fallback to active state
      if (draggedPalletId && sourceContainerId) {
        movePallet(draggedPalletId, sourceContainerId, toContainerId);
      }
    }
  };

  // Quick move to next/previous container
  const handleDirectMove = (palletId: string, currentContId: string, targetContId: string) => {
    movePallet(palletId, currentContId, targetContId);
  };

  const totalGrossManifest = containers.reduce((s, c) => s + c.totalGrossWeightKg, 0);
  const totalPalletsManifest = containers.reduce((s, c) => s + c.pallets.length, 0);
  const anyViolations = containers.some(c => c.isOverweight || c.isOverCapacity);

  return (
    <div className="flex-1 flex flex-col bg-slate-100/60 overflow-hidden select-none">
      {/* =========================================================================
          QC BOARD HEADER & ACTION TOOLBAR
         ========================================================================= */}
      <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              Interactive QC Table
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
              Drag-and-Drop Active
            </span>
            {hasDangerousGoods && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                <Flame className="w-3 h-3 text-rose-600" />
                <span>HazMat Safety Gate</span>
              </span>
            )}
          </div>
          <h2 className="text-sm font-extrabold text-slate-900 tracking-tight mt-1 flex items-center gap-2">
            <Boxes className="w-4 h-4 text-indigo-600" />
            <span>Visual Container Distribution & Pallet QC Board</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Drag pallet rows between container columns to re-balance weight or resolve spillover. Constraints: <strong>25,000 kg cap</strong> and <strong>11-pallet floor limit</strong> per 20' container.
          </p>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={() => onAutoReallocate('20GP')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer flex items-center gap-1.5"
            title="Reset & Re-run 20' LAFF Optimizer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset to LAFF Optimal</span>
          </button>

          {onAddContainer && (
            <button
              type="button"
              onClick={() => onAddContainer('20GP')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Container</span>
            </button>
          )}

          <button
            type="button"
            onClick={onQuickDownloadBol}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors cursor-pointer flex items-center gap-1.5"
            title="Download Master BOL"
          >
            <Download className="w-3.5 h-3.5 text-indigo-600" />
            <span>Master BOL</span>
          </button>

          {hasDangerousGoods && (
            <button
              type="button"
              onClick={onQuickDownloadDg}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors cursor-pointer flex items-center gap-1.5"
              title="Download #DG Declaration"
            >
              <Download className="w-3.5 h-3.5 text-rose-600" />
              <span>#DG Declaration</span>
            </button>
          )}
        </div>
      </div>

      {/* Violation Alert Banner if applicable */}
      {violationNotice && (
        <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between text-xs text-amber-800 animate-fadeIn">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{violationNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setViolationNotice(null)}
            className="text-amber-700 hover:text-amber-900 font-bold px-2 py-0.5 rounded"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* =========================================================================
          COLUMN-BASED KANBAN TABLE LAYOUT
         ========================================================================= */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex items-start space-x-6 min-w-max h-full pb-4">
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
                className={`w-96 flex flex-col max-h-full bg-white rounded-2xl border shadow-sm transition-all duration-150 ${
                  isDropTarget 
                    ? 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50/20 shadow-md' 
                    : isWeightOver || isPalletOver
                    ? 'border-rose-400 ring-1 ring-rose-400'
                    : isSpillover
                    ? 'border-amber-200 bg-slate-50/40'
                    : 'border-slate-200/90'
                }`}
              >
                {/* Column Table Header */}
                <div className={`p-4 border-b rounded-t-2xl ${
                  isSpillover ? 'bg-amber-50/60 border-amber-200/80' : 'bg-slate-50/80 border-slate-200/80'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className={`w-6 h-6 rounded-md font-mono text-xs font-bold flex items-center justify-center ${
                        isSpillover ? 'bg-amber-100 text-amber-800' : 'bg-indigo-600 text-white'
                      }`}>
                        {cIdx + 1}
                      </span>
                      <div>
                        <div className="font-mono font-bold text-xs text-slate-900 tracking-tight flex items-center gap-1.5">
                          {onContainerFieldChange ? (
                            <input
                              type="text"
                              value={cont.containerNumber}
                              onChange={(e) => onContainerFieldChange(cont.id, 'containerNumber', e.target.value)}
                              className="font-bold font-mono text-xs text-slate-900 bg-white/70 hover:bg-white px-1.5 py-0.5 rounded border border-slate-200 outline-none w-32"
                            />
                          ) : (
                            <span>{cont.containerNumber}</span>
                          )}
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                            isSpillover ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-indigo-100 text-indigo-700'
                          }`}>
                            {isSpillover ? 'Spillover' : "20' Std Dry"}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                          <span>Seal:</span>
                          {onContainerFieldChange ? (
                            <input
                              type="text"
                              value={cont.sealNumber}
                              onChange={(e) => onContainerFieldChange(cont.id, 'sealNumber', e.target.value)}
                              className="font-semibold font-mono text-[10px] text-slate-800 bg-transparent hover:bg-white px-1 py-0.2 rounded border border-transparent hover:border-slate-200 outline-none w-20"
                            />
                          ) : (
                            <strong>{cont.sealNumber}</strong>
                          )}
                          <span>• Tare: {spec.tareWeightKg.toLocaleString()} kg</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0">
                      {onContainerTypeChange && (
                        <select
                          value={cont.containerType}
                          onChange={(e) => onContainerTypeChange(cont.id, e.target.value as ContainerType)}
                          className="text-[10px] font-semibold bg-white text-slate-800 rounded px-1.5 py-0.5 border border-slate-200 outline-none cursor-pointer"
                        >
                          <option value="20GP">20' GP (Max 25T / 11 Plt)</option>
                          <option value="40GP">40' GP (Max 26.5T / 24 Plt)</option>
                          <option value="40HC">40' HC (Max 26.5T / 24 Plt)</option>
                          <option value="45HC">45' HC (Max 27.8T / 26 Plt)</option>
                        </select>
                      )}

                      <div className="text-right">
                        <span className="text-[11px] font-mono font-bold text-slate-800 block">
                          {cont.totalGrossWeightKg.toLocaleString()} kg
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {cont.pallets.length} of {maxPallets} Pallets
                        </span>
                      </div>

                      {containers.length > 1 && onDeleteContainer && (
                        <button
                          type="button"
                          onClick={() => onDeleteContainer(cont.id)}
                          className="p-1 text-slate-300 hover:text-rose-600 rounded transition-colors"
                          title="Remove Container"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Draggable Pallet Cards Container */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-[220px]">
                  {cont.pallets.length === 0 ? (
                    <div className="h-36 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-center p-4 text-slate-400">
                      <ArrowRightLeft className="w-5 h-5 mb-1.5 opacity-40" />
                      <span className="text-xs font-semibold">Drop pallets here</span>
                      <span className="text-[10px] opacity-75 mt-0.5">Drag any pallet card into this column</span>
                    </div>
                  ) : (
                    cont.pallets.map((pallet) => {
                      const isDragging = draggedPalletId === pallet.id;
                      const lineItem = lineItems.find(it => pallet.lineItemIds.includes(it.id));
                      const modelText = pallet.modelOrDescription || lineItem?.description || 'EFB70-S95-D26L - Lead Acid Batteries';

                      return (
                        <div
                          key={pallet.id}
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, pallet.id, cont.id)}
                          className={`group p-3.5 bg-white border rounded-xl shadow-2xs hover:shadow-md transition-all cursor-grab active:cursor-grabbing relative ${
                            isDragging 
                              ? 'opacity-40 border-indigo-400 scale-95 ring-2 ring-indigo-400' 
                              : pallet.isDangerousGoods
                              ? 'border-slate-200/90 hover:border-rose-400'
                              : 'border-slate-200/90 hover:border-indigo-400'
                          }`}
                        >
                          {/* Unified Header: Drag Grip + Pallet ID Badge + Package / Box Count */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center space-x-1.5 min-w-0">
                              <GripVertical className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500 shrink-0" />
                              <span className="px-2 py-0.5 rounded-md text-xs font-mono font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200/80 tracking-tight">
                                {pallet.palletNumber}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200/70 font-mono">
                                {pallet.packageCount} {pallet.packageType || 'BOX'}
                              </span>
                            </div>

                            <span className="text-[10px] text-slate-400 font-mono shrink-0">
                              {pallet.dimensions || DEFAULT_PALLET_DIMENSIONS}
                            </span>
                          </div>

                          {/* Unified Attribute 1: Item Model / Product Line */}
                          <div className="mt-2 text-xs font-semibold text-slate-800 line-clamp-2 leading-snug pl-5">
                            {modelText}
                          </div>

                          {/* Unified Attribute 2: Weight Metrics (Gross & Net Weights Side-by-Side) */}
                          <div className="mt-2.5 pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px] font-mono pl-5">
                            <div className="bg-slate-50/90 rounded px-2 py-1 border border-slate-100">
                              <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">Gross Wt</span>
                              <span className="font-extrabold text-slate-900">{pallet.grossWeightKg.toLocaleString()} kg</span>
                            </div>
                            <div className="bg-slate-50/90 rounded px-2 py-1 border border-slate-100">
                              <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">Net Wt</span>
                              <span className="font-extrabold text-slate-700">{pallet.netWeightKg.toLocaleString()} kg</span>
                            </div>
                          </div>

                          {/* Unified Attribute 3: UN 2794 HazMat & #DG Compliance Badges + Quick Move */}
                          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5 flex-wrap pl-5">
                            {pallet.isDangerousGoods ? (
                              <div className="flex items-center space-x-1">
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  <Flame className="w-2.5 h-2.5 text-rose-600" />
                                  <span>{pallet.unNumber || 'UN 2794'}</span>
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                  {pallet.imoClass?.replace(/class/i, 'Cl.').replace(/\(.*\)/, '').trim() || 'Cl. 8'}
                                </span>
                                {pallet.packingGroup && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                    PG {pallet.packingGroup}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-medium">Non-Hazardous</span>
                            )}

                            {/* Quick Reassign Dropdown for Quick Access */}
                            {containers.length > 1 && (
                              <div className="relative group/menu ml-auto">
                                <select
                                  value={cont.id}
                                  onChange={(e) => handleDirectMove(pallet.id, cont.id, e.target.value)}
                                  className="text-[9px] bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 outline-none font-sans font-semibold text-slate-700 cursor-pointer"
                                  onClick={(e) => e.stopPropagation()}
                                  title="Quick Move Pallet"
                                >
                                  {containers.map((c, idx) => (
                                    <option key={c.id} value={c.id}>
                                      Move to C#{idx + 1}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Real-Time Metrics & Capacity Bars (Column Footer) */}
                <div className="p-4 bg-slate-50/90 border-t border-slate-200 rounded-b-2xl space-y-3">
                  {/* Metric A: Weight Payload Counter & Bar */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-semibold text-slate-700">Gross Payload</span>
                      <span className="font-mono text-slate-600">
                        <strong className={isWeightOver ? 'text-rose-600' : 'text-slate-900'}>
                          {cont.totalGrossWeightKg.toLocaleString()}
                        </strong> / {maxPayload.toLocaleString()} kg ({weightPct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          isWeightOver ? 'bg-rose-500' : weightPct >= 85 ? 'bg-amber-500' : 'bg-indigo-600'
                        }`}
                        style={{ width: `${Math.min(100, weightPct)}%` }}
                      />
                    </div>
                  </div>

                  {/* Metric B: Floor Pallet Count & Footprint Bar */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-semibold text-slate-700">Floor Pallet Limit</span>
                      <span className="font-mono text-slate-600">
                        <strong className={isPalletOver ? 'text-rose-600' : 'text-slate-900'}>
                          {cont.pallets.length}
                        </strong> / {maxPallets} Pallets {cont.pallets.length === maxPallets ? '(Full)' : ''}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          isPalletOver ? 'bg-rose-500' : cont.pallets.length === maxPallets ? 'bg-emerald-600' : 'bg-slate-400'
                        }`}
                        style={{ width: `${Math.min(100, palletPct)}%` }}
                      />
                    </div>
                  </div>

                  {/* Status Indicator */}
                  <div className="pt-1 flex items-center justify-between text-[10px] font-mono">
                    {isWeightOver || isPalletOver ? (
                      <span className="text-rose-600 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-rose-600" />
                        <span>Capacity Exceeded</span>
                      </span>
                    ) : cont.pallets.length === maxPallets ? (
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Tier Optimized (11/11)</span>
                      </span>
                    ) : (
                      <span className="text-slate-500">
                        Available slots: {Math.max(0, maxPallets - cont.pallets.length)}
                      </span>
                    )}

                    <span className="text-slate-400">
                      VGM Est: {(cont.totalGrossWeightKg + spec.tareWeightKg).toLocaleString()} kg
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
      <div className="h-18 bg-white border-t border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center space-x-6 text-xs">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Total Pallets</span>
            <span className="font-mono font-bold text-slate-800 text-sm">
              {totalPalletsManifest} Pallets
            </span>
          </div>
          <div className="h-6 w-px bg-slate-200" />
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Total Gross Weight</span>
            <span className="font-mono font-bold text-slate-800 text-sm">
              {totalGrossManifest.toLocaleString()} kg
            </span>
          </div>
          <div className="h-6 w-px bg-slate-200" />
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Container Count</span>
            <span className="font-mono font-bold text-slate-800 text-sm">
              {containers.length} Containers {containers.length > 1 ? `(1 Primary + ${containers.length - 1} Spillover)` : ''}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {anyViolations && (
            <span className="text-xs text-rose-600 font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>Weight/pallet limits breached. Adjust before locking.</span>
            </span>
          )}

          <button
            type="button"
            onClick={onLockAndGenerate}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Lock Shipment Plan & Generate Documents</span>
          </button>
        </div>
      </div>
    </div>
  );
};
