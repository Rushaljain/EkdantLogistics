// Ekdant Logistics - Compact 4-Zone Invoice Block & Chevron-Triggered Drawer (Prompt 3)
// 4 Structured Zones: Identity & Gate-In, Quantities & Exact Weights, Dispatch & Customs, Status & Gated Outward

import React, { useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Truck,
  Lock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Plus,
  Trash2,
  ArrowRight,
  Package,
  Layers
} from 'lucide-react';
import type {
  CFSLedgerEntry,
  PalletStockUnit,
  ShortfallRecord
} from '../types/index.ts';
import {
  toExactWeight,
  formatToDDMMYYYY
} from '../utils/inventoryStore.ts';

interface CompactInvoiceBlockProps {
  entry: CFSLedgerEntry;
  isExpanded: boolean;
  onToggleExpand: () => void;
  selectedPalletIds: Set<string>;
  onTogglePallet: (palletId: string, customer: string) => void;
  onSelectAllPallets: (palletIds: string[], customer: string) => void;
  onDeselectAllPallets: (palletIds: string[]) => void;
  onConfirmFullGateIn: (entryId: string) => void;
  onOpenDispatch: (entry: CFSLedgerEntry) => void;
  onLoadCheckedIntoWorkspace: (pallets: PalletStockUnit[]) => void;
  onGenerateDgBl: (entry: CFSLedgerEntry, pallets: PalletStockUnit[]) => void;
  onRecordShortFill: (entry: CFSLedgerEntry) => void;
  onDeleteInvoice: (entry: CFSLedgerEntry) => void;
  onDeletePallet: (entry: CFSLedgerEntry, pallet: PalletStockUnit) => void;
}

export function CompactInvoiceBlock({
  entry,
  isExpanded,
  onToggleExpand,
  selectedPalletIds,
  onTogglePallet,
  onSelectAllPallets,
  onDeselectAllPallets,
  onConfirmFullGateIn,
  onOpenDispatch,
  onLoadCheckedIntoWorkspace,
  onGenerateDgBl,
  onRecordShortFill,
  onDeleteInvoice,
  onDeletePallet
}: CompactInvoiceBlockProps): React.JSX.Element {
  // Pallet lists
  const allPallets = useMemo(() => entry.pallets || [], [entry.pallets]);
  const readyPallets = useMemo(
    () => allPallets.filter((p) => p.status === 'IN_WAREHOUSE'),
    [allPallets]
  );
  const invoicePalletIds = useMemo(() => allPallets.map((p) => p.id), [allPallets]);
  const readyPalletIds = useMemo(() => readyPallets.map((p) => p.id), [readyPallets]);

  // Selected state for this specific invoice
  const selectedThisInvoiceCount = useMemo(
    () => invoicePalletIds.filter((id) => selectedPalletIds.has(id)).length,
    [invoicePalletIds, selectedPalletIds]
  );
  const areAllReadySelected = readyPalletIds.length > 0 && readyPalletIds.every((id) => selectedPalletIds.has(id));

  // Weights (exact decimals, zero Math.round)
  const exactGrossKg = toExactWeight(entry.actualGrossWeightKg ?? entry.invoicedGrossWeightKg);
  const exactNetKg = entry.actualNetWeightKg !== undefined || entry.invoicedNetWeightKg !== undefined
    ? toExactWeight(entry.actualNetWeightKg ?? entry.invoicedNetWeightKg)
    : undefined;

  // Shortfalls & Short-fills
  const shortfallsList: ShortfallRecord[] = entry.shortfalls || [];
  const hasOpenShortfall =
    shortfallsList.some((s) => s.status !== 'CLEARED' && s.remainingShortfallUnits > 0) ||
    (entry.shortfallBatteries || 0) > 0 ||
    (entry.shortfallPallets || 0) > 0;
  const isShortFillReconciled = (entry.shortFillLinks || []).length > 0;
  const isFullyDispatched = entry.balancePallets === 0 && (entry.actualStuffedPallets || 0) > 0;
  const isPartial = (entry.actualStuffedPallets || 0) > 0 && entry.balancePallets > 0;

  // Gated Outward Requirement: Both DG and BL must be created
  const isOutwardUnlocked = Boolean(entry.dgCreated && entry.blCreated);

  // Formatted date fallbacks
  const invoiceDateStr = entry.invoiceDate || (entry.createdAt ? formatToDDMMYYYY(new Date(entry.createdAt)) : '—');
  const gateInDateStr = entry.cartingInDate || entry.truckReportingDate || entry.lastPltRecdDate || '—';

  return (
    <div className="bg-surface border border-divider rounded-xl overflow-hidden shadow-xs hover:border-divider/90 transition-all font-sans">
      {/* =========================================================================
          4-ZONE COMPACT INVOICE CARD
          ========================================================================= */}
      <div className="p-3.5 sm:p-4 bg-surface space-y-3">
        {/* ROW 1: ZONE 1 (Identity & Gate-In Strip) */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start space-x-3 min-w-0 flex-1">
            {/* CHEVRON-ONLY TOGGLE BUTTON (Strictly toggles dropdown without card-click side-effects) */}
            <button
              type="button"
              onClick={onToggleExpand}
              className="mt-0.5 p-1.5 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-secondary border border-divider transition-colors cursor-pointer shrink-0"
              title={isExpanded ? 'Collapse Pallets & Details' : 'Expand Pallets & Details'}
              aria-label={isExpanded ? 'Collapse invoice details' : 'Expand invoice details'}
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-brand-primary" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {/* Identity details */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm sm:text-base font-bold text-brand-primary tracking-tight">
                  #{entry.customInvoiceNo}
                </span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                  {entry.month || 'OCT'}
                </span>
                <span className="text-xs sm:text-sm font-semibold text-content-primary truncate max-w-[280px]" title={entry.customer}>
                  {entry.customer}
                </span>

                {/* Shortfall / Shortfill / Partial Pill */}
                {hasOpenShortfall && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                    <span>Shortfall Open</span>
                  </span>
                )}
                {isShortFillReconciled && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 flex items-center space-x-1">
                    <Layers className="w-3 h-3 text-blue-600" />
                    <span>Short Fill Cleared</span>
                  </span>
                )}
                {isPartial && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                    Partial
                  </span>
                )}
              </div>

              {/* Identity Sub-strip */}
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-secondary">
                <span className="flex items-center space-x-1">
                  <span className="text-content-muted">POD:</span>
                  <span className="font-medium text-content-primary">{entry.pod || '—'}</span>
                </span>
                <span className="text-divider">•</span>
                <span className="flex items-center space-x-1">
                  <span className="text-content-muted">Inv Date:</span>
                  <span className="font-mono text-content-primary">{invoiceDateStr}</span>
                </span>
                <span className="text-divider">•</span>
                <span className="flex items-center space-x-1">
                  <span className="text-content-muted">Carting / Gate-In:</span>
                  <span className="font-mono text-content-primary">{gateInDateStr}</span>
                </span>
                <span className="text-divider">•</span>
                <span className="flex items-center space-x-1">
                  <span className="text-content-muted">Vehicle:</span>
                  <span className="font-mono text-content-primary font-medium">{entry.vehicleNo || '—'}</span>
                </span>
                <span className="text-divider">•</span>
                <span className="flex items-center space-x-1">
                  <span className="text-content-muted">Gate Pass:</span>
                  <span className="font-mono text-content-primary">{entry.cartingSlipNo || '—'}</span>
                </span>
                <span className="text-divider">•</span>
                <span className="flex items-center space-x-1">
                  <span className="text-content-muted">Ageing:</span>
                  <span className="font-bold text-content-primary font-mono bg-slate-100 px-1.5 py-0.2 rounded text-[11px]">
                    {entry.daysInCFS ?? 0}d
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* ZONE 4: STATUS & GATED ACTION STRIP (Right Header Block) */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Gate-in confirmation pill if pending */}
            {entry.actualReceivedPallets < entry.invoicedPallets ? (
              <button
                type="button"
                onClick={() => onConfirmFullGateIn(entry.id)}
                className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-medium flex items-center space-x-1 transition-colors cursor-pointer"
                title="Click to confirm full receipt gate-in"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span>Gate-In ({entry.actualReceivedPallets}/{entry.invoicedPallets})</span>
              </button>
            ) : (
              <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-medium flex items-center space-x-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>100% Recd</span>
              </span>
            )}

            {/* Document Badges (DG / BL) */}
            <div className="flex items-center space-x-1 text-[10px] font-mono">
              <span
                className={`px-1.5 py-0.5 rounded border font-semibold ${
                  entry.dgCreated
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}
                title={entry.dgCreated ? 'Dangerous Goods Manifest Created' : 'DG Manifest Not Created'}
              >
                DG {entry.dgCreated ? '✓' : '—'}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded border font-semibold ${
                  entry.blCreated
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}
                title={entry.blCreated ? 'Bill of Lading Created' : 'Bill of Lading Not Created'}
              >
                BL {entry.blCreated ? '✓' : '—'}
              </span>
            </div>

            {/* GATED OUTWARD / CONFIRM DISPATCH BUTTON */}
            {isFullyDispatched ? (
              <span className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 text-xs font-semibold flex items-center space-x-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                <span>Dispatched</span>
              </span>
            ) : isOutwardUnlocked ? (
              <button
                type="button"
                onClick={() => onOpenDispatch(entry)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                title={`Outward dispatch ready for ${entry.balancePallets} pallets`}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>Outward ({entry.balancePallets})</span>
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 text-xs font-medium flex items-center space-x-1.5 cursor-not-allowed"
                title="Both DG Manifest and Bill of Lading must be generated before executing main-block outward dispatch"
              >
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[11px]">DG &amp; BL Required</span>
              </button>
            )}

            {/* Delete Invoice */}
            <button
              type="button"
              onClick={() => onDeleteInvoice(entry)}
              className="p-1.5 rounded-lg text-content-muted hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
              title={`Delete invoice ${entry.customInvoiceNo}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ROW 2: ZONE 2 (4-Column Quantity & Exact Weight Strip) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 bg-surface-secondary/40 p-2.5 rounded-lg border border-divider/60 text-xs font-mono tabular-nums">
          {/* Col 1: Invoiced */}
          <div className="flex flex-col justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-content-muted">
              1. Invoiced
            </span>
            <div className="flex items-baseline space-x-1 mt-0.5">
              <span className="text-sm font-bold text-content-primary">{entry.invoicedPallets} Plt</span>
              <span className="text-content-muted text-[11px]">({entry.invoicedBatteries.toLocaleString()} u)</span>
            </div>
          </div>

          {/* Col 2: Actual Received */}
          <div className="flex flex-col justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-content-muted">
              2. Actual Received
            </span>
            <div className="flex items-baseline space-x-1 mt-0.5">
              <span className="text-sm font-bold text-emerald-700">{entry.actualReceivedPallets} Plt</span>
              <span className="text-content-muted text-[11px]">({(entry.actualReceivedBatteries || 0).toLocaleString()} u)</span>
            </div>
          </div>

          {/* Col 3: Shortfall (Highlighted only if > 0) */}
          <div className="flex flex-col justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-content-muted">
              3. Shortfall
            </span>
            <div className="flex items-baseline space-x-1 mt-0.5">
              {(entry.shortfallPallets > 0 || entry.shortfallBatteries > 0) ? (
                <div className="inline-flex items-center space-x-1 px-1.5 py-0.2 rounded bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs">
                  <span>{entry.shortfallPallets} Plt</span>
                  <span>/</span>
                  <span>{entry.shortfallBatteries} u</span>
                </div>
              ) : (
                <span className="text-content-muted font-medium">0 Plt (0 u)</span>
              )}
            </div>
          </div>

          {/* Col 4: Live Floor Balance & Exact Weights */}
          <div className="flex flex-col justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-content-muted">
              4. Floor Balance &amp; Exact Wt
            </span>
            <div className="flex flex-col mt-0.5">
              <div className="flex items-baseline space-x-1.5">
                <span className="text-sm font-bold text-brand-primary">{entry.balancePallets} Plt</span>
                <span className="text-content-muted text-[11px]">({(entry.balanceBatteries || 0).toLocaleString()} u)</span>
                {entry.actualStuffedPallets > 0 && (
                  <span className="text-[10px] text-slate-500 font-medium">
                    [{entry.actualStuffedPallets} stf]
                  </span>
                )}
              </div>
              <div className="text-[10px] text-content-secondary mt-0.5 flex items-center space-x-2">
                <span>GW: <strong>{exactGrossKg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg</strong></span>
                {exactNetKg !== undefined && (
                  <span>• NW: <strong>{exactNetKg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg</strong></span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ROW 3: ZONE 3 (Dispatch & Customs Strip) */}
        <div className="px-3 py-1.5 bg-slate-50/70 border border-divider/50 rounded-lg flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs font-mono text-content-secondary">
          <div className="flex items-center space-x-1.5">
            <span className="text-content-muted text-[11px]">Container:</span>
            <strong className="text-brand-primary font-bold">{entry.containerNo ? entry.containerNo : '—'}</strong>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-content-muted text-[11px]">Seal No:</span>
            <span className="text-content-primary">{entry.sealNo ? entry.sealNo : '—'}</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-content-muted text-[11px]">Stuffing Date:</span>
            <span className="text-content-primary">{entry.stuffingDate ? entry.stuffingDate : '—'}</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-content-muted text-[11px]">SB No. &amp; Date:</span>
            <span className="text-content-primary">
              {entry.shippingBillNo ? `${entry.shippingBillNo}${entry.shippingBillDate ? ` (${entry.shippingBillDate})` : ''}` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          CHEVRON-TRIGGERED EXPANDABLE DRAWER
          ========================================================================= */}
      {isExpanded && (
        <div className="border-t border-divider bg-surface-secondary/20 p-4 sm:p-5 space-y-4 animate-fade-in">
          {/* DRAWER SECTION 1: SHORTFALL & SHORT-FILL TRACEABILITY STRIP */}
          {(shortfallsList.length > 0 || isShortFillReconciled) && (
            <div className="bg-surface border border-divider rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center space-x-2 text-xs font-bold text-content-primary uppercase tracking-wider">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span>Shortfall &amp; Short-Fill Traceability</span>
              </div>

              {/* Inward Shortfalls */}
              {shortfallsList.length > 0 && (
                <div className="space-y-1.5">
                  {shortfallsList.map((sf) => (
                    <div
                      key={sf.id}
                      className="p-2.5 rounded-lg bg-surface-secondary/60 border border-divider/60 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                          sf.mode === 'PALLET' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {sf.mode} Mode
                        </span>
                        <span className="font-mono font-bold text-brand-primary">
                          PLT #{sf.palletNumber}
                        </span>
                        <span className="text-content-secondary">
                          Billed: <strong>{sf.billedUnits} u</strong> • Short: <strong className="text-rose-600">{sf.shortfallUnits} u</strong> • Remaining: <strong className="text-amber-700">{sf.remainingShortfallUnits} u</strong>
                        </span>
                        <span className="text-content-muted text-[11px]">
                          ({sf.openedDate} - {sf.openedMonth})
                        </span>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                          sf.status === 'CLEARED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : sf.status === 'PARTIAL_FILL'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {sf.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Linked Short Fills received into this entry */}
              {shortfallsList.some((sf) => (sf.linkedShortFills || []).length > 0) && (
                <div className="pl-3 border-l-2 border-emerald-400 space-y-1 text-xs">
                  <span className="text-[11px] font-semibold text-emerald-800">Linked Short-Fill History:</span>
                  {shortfallsList.flatMap((sf) =>
                    (sf.linkedShortFills || []).map((lsf, i) => (
                      <div key={i} className="text-content-secondary font-mono text-[11px]">
                        +<strong>{lsf.unitsFilled} u</strong> via INV <strong>#{lsf.shortFillInvoiceNo}</strong> ({lsf.filledDate || lsf.filledMonth})
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Reconciled Short Fill Link (if this invoice filled a prior invoice) */}
              {(entry.shortFillLinks || []).map((link, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center space-x-2"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>
                    Short Fill Reconciled: Fulfills <strong>{link.unitsFilled} units</strong> on prior Inv <strong>#{link.priorShortfallInvoiceNo}</strong> (Pallet {link.palletNumber || '—'}).
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* DRAWER SECTION 2: PALLET-WISE SELECTION GRID */}
          <div className="space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2 text-xs font-semibold text-content-primary">
                <Package className="w-4 h-4 text-brand-primary" />
                <span>
                  Pallet Units ({allPallets.length} Total • {readyPallets.length} Ready in Warehouse)
                </span>
                {selectedThisInvoiceCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-brand-primary text-white text-[10px] font-mono font-bold">
                    {selectedThisInvoiceCount} Selected
                  </span>
                )}
              </div>

              {/* Quick Select All / Deselect Ready Pallets */}
              {readyPallets.length > 0 && (
                <div className="flex items-center space-x-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      if (areAllReadySelected) {
                        onDeselectAllPallets(readyPalletIds);
                      } else {
                        onSelectAllPallets(readyPalletIds, entry.customer);
                      }
                    }}
                    className="text-xs text-brand-primary hover:text-brand-primary-hover font-medium underline cursor-pointer"
                  >
                    {areAllReadySelected ? 'Deselect All Ready' : 'Select All Ready'}
                  </button>
                </div>
              )}
            </div>

            {/* Pallet Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 font-mono">
              {allPallets.map((pallet) => {
                const isSelected = selectedPalletIds.has(pallet.id);
                const isStuffed = pallet.status === 'STUFFED_DISPATCHED';
                const isPending = pallet.status === 'PENDING_GATE_IN';
                const displayPalletNum = String(pallet.palletNumber || '').replace(/^PLT\s*#?/i, '').replace(/^#/, '');
                const exactPalletGrossKg = toExactWeight(pallet.grossWeightKg);

                return (
                  <div
                    key={pallet.id}
                    onClick={() => {
                      if (!isStuffed && !isPending) {
                        onTogglePallet(pallet.id, entry.customer);
                      }
                    }}
                    className={`p-2.5 rounded-lg border text-xs transition-all flex flex-col justify-between ${
                      isStuffed
                        ? 'bg-slate-100 text-content-muted border-slate-200 cursor-not-allowed opacity-75'
                        : isPending
                        ? 'bg-amber-50/50 text-amber-900 border-amber-200 cursor-not-allowed'
                        : isSelected
                        ? 'bg-brand-primary-soft border-brand-primary ring-1 ring-brand-primary cursor-pointer shadow-xs'
                        : 'bg-surface border-divider hover:border-brand-primary cursor-pointer shadow-2xs'
                    }`}
                  >
                    {/* Header: Checkbox + Pallet Identifier & Model + Delete */}
                    <div className="flex items-start justify-between gap-1.5 min-w-0">
                      <div className="flex items-center space-x-1.5 min-w-0 flex-1">
                        {!isStuffed && !isPending && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="rounded border-divider text-brand-primary focus:ring-brand-primary shrink-0 cursor-pointer"
                          />
                        )}
                        <span className="font-bold text-brand-primary truncate text-[11px]" title={`PLT #${displayPalletNum}`}>
                          PLT #{displayPalletNum}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded bg-surface-secondary border border-divider text-content-secondary font-medium truncate max-w-[80px]"
                          title={pallet.model}
                        >
                          {pallet.model || 'GENERIC'}
                        </span>
                        {!isStuffed && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeletePallet(entry, pallet);
                            }}
                            className="p-1 rounded text-content-muted hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title={`Delete Pallet #${displayPalletNum}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Footer: Qty, Weight, Status */}
                    <div className="mt-2 pt-1.5 border-t border-divider/40 flex items-center justify-between text-[11px]">
                      <div className="flex items-center space-x-1 text-content-secondary">
                        <span>Qty:</span>
                        <strong className="text-content-primary font-bold">
                          {pallet.receivedBatteries || pallet.invoicedBatteries} u
                        </strong>
                      </div>
                      <div className="flex items-center space-x-1.5 text-[10px]">
                        <span className="text-content-muted font-medium">
                          {exactPalletGrossKg.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 })} kg
                        </span>
                        <span
                          className={`px-1 py-0.2 rounded font-semibold uppercase text-[9px] ${
                            isStuffed
                              ? 'bg-slate-200/70 text-slate-700'
                              : isPending
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {isStuffed ? 'Shipped' : isPending ? 'Pending' : 'Ready'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* DRAWER SECTION 3: ACTION BAR */}
          <div className="pt-3 border-t border-divider flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="text-content-muted text-xs">
              Selected: <strong>{selectedThisInvoiceCount}</strong> of {readyPallets.length} ready pallets
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Record Short Fill Button (visible when shortfall open) */}
              {hasOpenShortfall && (
                <button
                  type="button"
                  onClick={() => onRecordShortFill(entry)}
                  className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
                  title="Open Short-Fill inward reconciliation for this shortfall invoice"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-700" />
                  <span>Record Short Fill</span>
                </button>
              )}

              {/* Generate DG / BL Button */}
              <button
                type="button"
                onClick={() => {
                  const palletsToProcess = selectedThisInvoiceCount > 0
                    ? allPallets.filter((p) => selectedPalletIds.has(p.id))
                    : readyPallets;
                  onGenerateDgBl(entry, palletsToProcess);
                }}
                className="px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-secondary text-brand-primary border border-brand-primary font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs"
                title="Prepare DG Manifest and Ocean Bill of Lading with checked pallets"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Generate DG / BL</span>
              </button>

              {/* Load Checked into Container Planner / Dispatch Tool */}
              <button
                type="button"
                onClick={() => {
                  const palletsToLoad = selectedThisInvoiceCount > 0
                    ? allPallets.filter((p) => selectedPalletIds.has(p.id))
                    : readyPallets;
                  onLoadCheckedIntoWorkspace(palletsToLoad);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-white font-semibold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
                title="Load checked pallets directly into Container Planner"
              >
                <span>Load Checked into Container Planner</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
