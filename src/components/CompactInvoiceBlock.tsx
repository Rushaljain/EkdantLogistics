// Ekdant Logistics - Redesigned Structured Invoice Table Row & Expandable Operational Details
// Follows reference layout: Collapsed (Top Half) & Expanded (Bottom Half)

import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  Truck,
  Lock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Plus,
  Trash2,
  Package,
  Search,
  Calendar,
  MoreVertical,
  Pencil,
  ArrowRight
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
  onLoadCheckedIntoWorkspace?: (pallets: PalletStockUnit[]) => void;
  onGenerateDgBl?: (entry: CFSLedgerEntry, pallets: PalletStockUnit[]) => void;
  onRecordShortFill: (entry: CFSLedgerEntry) => void;
  onDeleteInvoice: (entry: CFSLedgerEntry) => void;
  onDeletePallet?: (entry: CFSLedgerEntry, pallet: PalletStockUnit) => void;
  onEditInward?: (entry: CFSLedgerEntry) => void;
  onLoadDispatchTool?: (entry: CFSLedgerEntry) => void;
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
  onRecordShortFill,
  onDeleteInvoice,
  onEditInward,
  onLoadDispatchTool
}: CompactInvoiceBlockProps): React.JSX.Element {
  // Pallet search filter inside expanded pallet table
  const [palletSearchQuery, setPalletSearchQuery] = useState('');
  const [showActionMenu, setShowActionMenu] = useState(false);
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);

  const toggleActionMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!showActionMenu && actionButtonRef.current) {
      const rect = actionButtonRef.current.getBoundingClientRect();
      const menuHeight = 200;
      const opensUpward = rect.bottom + menuHeight > window.innerHeight;
      setMenuPosition({
        top: opensUpward ? Math.max(10, rect.top - menuHeight) : rect.bottom + 4,
        right: Math.max(12, window.innerWidth - rect.right),
      });
      setShowActionMenu(true);
    } else {
      setShowActionMenu(false);
    }
  };

  useEffect(() => {
    if (!showActionMenu) return;
    const handleClose = () => setShowActionMenu(false);
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('resize', handleClose);
    return () => {
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('resize', handleClose);
    };
  }, [showActionMenu]);

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

  // Units Mode State: allows operator to specify custom units to dispatch per pallet
  const [unitsMode, setUnitsMode] = useState(false);
  const [customUnitCounts, setCustomUnitCounts] = useState<Record<string, number>>({});

  const handleCustomUnitsChange = (palletId: string, val: number) => {
    setCustomUnitCounts((prev) => ({ ...prev, [palletId]: val }));
    if (!selectedPalletIds.has(palletId)) {
      onTogglePallet(palletId, entry.customer);
    }
  };

  const selectedTotalUnits = useMemo(() => {
    return readyPallets
      .filter((p) => selectedPalletIds.has(p.id))
      .reduce((sum, p) => {
        const maxU = p.receivedBatteries || p.invoicedBatteries || 0;
        const u = unitsMode && customUnitCounts[p.id] !== undefined ? customUnitCounts[p.id] : maxU;
        return sum + u;
      }, 0);
  }, [readyPallets, selectedPalletIds, unitsMode, customUnitCounts]);

  // Filtered pallets based on expanded search
  const filteredPallets = useMemo(() => {
    if (!palletSearchQuery.trim()) return allPallets;
    const q = palletSearchQuery.toLowerCase();
    return allPallets.filter(
      (p) =>
        String(p.palletNumber || '').toLowerCase().includes(q) ||
        String(p.model || '').toLowerCase().includes(q)
    );
  }, [allPallets, palletSearchQuery]);

  // Split pallets into two balanced side-by-side tables
  const halfIndex = Math.ceil(filteredPallets.length / 2);
  const leftTablePallets = filteredPallets.slice(0, halfIndex);
  const rightTablePallets = filteredPallets.slice(halfIndex);

  // Weights (exact decimals, zero Math.round)
  const exactGrossKg = toExactWeight(entry.actualGrossWeightKg ?? entry.invoicedGrossWeightKg);
  const exactNetKg =
    entry.actualNetWeightKg !== undefined || entry.invoicedNetWeightKg !== undefined
      ? toExactWeight(entry.actualNetWeightKg ?? entry.invoicedNetWeightKg)
      : undefined;

  // Shortfalls & Short-fills
  const shortfallsList: ShortfallRecord[] = entry.shortfalls || [];
  const hasOpenShortfall =
    shortfallsList.some((s) => s.status !== 'CLEARED' && s.remainingShortfallUnits > 0) ||
    (entry.shortfallBatteries || 0) > 0 ||
    (entry.shortfallPallets || 0) > 0;
  const isShortFillReconciled = (entry.shortFillLinks || []).length > 0;
  const isFullyDispatched = entry.balancePallets === 0 && (entry.balanceBatteries === 0 || entry.balanceBatteries === undefined) && ((entry.actualStuffedPallets || 0) > 0 || (entry.actualStuffedBatteries || 0) > 0);
  const isPartiallyDispatched = ((entry.actualStuffedBatteries || 0) > 0 || (entry.actualStuffedPallets || 0) > 0) && ((entry.balanceBatteries || 0) > 0 || (entry.balancePallets || 0) > 0);

  // Gated Outward Requirement: Both DG and BL must be created
  const isOutwardUnlocked = Boolean(entry.dgCreated && entry.blCreated);

  // Formatted date fallbacks
  const invoiceDateStr = entry.invoiceDate || (entry.createdAt ? formatToDDMMYYYY(new Date(entry.createdAt)) : '—');
  const gateInDateStr = entry.cartingInDate || entry.truckReportingDate || entry.lastPltRecdDate || '—';

  // Helper to render one side-by-side pallet table
  const renderPalletTable = (pallets: PalletStockUnit[]) => {
    if (pallets.length === 0) {
      return (
        <div className="p-8 text-center text-content-muted bg-surface-secondary/40 border border-divider/60 rounded-xl text-xs">
          No pallets match filter
        </div>
      );
    }
    return (
      <div className="bg-surface border border-divider/80 rounded-xl shadow-2xs overflow-hidden">
        <table className="w-full text-xs font-mono border-collapse select-text">
          <thead className="bg-surface-secondary/60 border-b border-divider text-[11px] font-semibold text-content-secondary select-none">
            <tr>
              <th className="p-2.5 w-9 text-center border-r border-divider/50"></th>
              <th className="p-2.5 text-left border-r border-divider/50 whitespace-nowrap">PLT No.</th>
              <th className="p-2.5 text-left border-r border-divider/50 whitespace-nowrap min-w-[120px]">Item / SKU</th>
              <th className="p-2.5 text-center border-r border-divider/50 whitespace-nowrap">Type</th>
              <th className="p-2.5 text-right border-r border-divider/50 whitespace-nowrap">Qty (Units)</th>
              <th className="p-2.5 text-right border-r border-divider/50 whitespace-nowrap">Gross Weight (kg)</th>
              <th className="p-2.5 text-center whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider/50 tabular-nums">
            {pallets.map((pallet) => {
              const isSelected = selectedPalletIds.has(pallet.id);
              const isStuffed = pallet.status === 'STUFFED_DISPATCHED';
              const isPending = pallet.status === 'PENDING_GATE_IN';
              const displayPalletNum = String(pallet.palletNumber || '').replace(/^PLT\s*#?/i, '').replace(/^#/, '');
              const exactPalletGrossKg = toExactWeight(pallet.grossWeightKg);
              const maxUnits = pallet.receivedBatteries || pallet.invoicedBatteries || 0;
              const currentUnits = unitsMode && customUnitCounts[pallet.id] !== undefined
                ? customUnitCounts[pallet.id]
                : maxUnits;
              const ratio = maxUnits > 0 ? currentUnits / maxUnits : 1;
              const displayGrossKg = unitsMode
                ? toExactWeight(exactPalletGrossKg * ratio)
                : exactPalletGrossKg;

              // Check if this pallet has linked shortfills (received shortfill from another invoice)
              const matchingShortfall = (entry.shortfalls || []).find(
                (sf) => String(sf.palletNumber).trim() === String(displayPalletNum).trim() ||
                        String(sf.palletNumber).trim() === String(pallet.palletNumber).trim()
              );
              const linkedFills = matchingShortfall?.linkedShortFills || [];
              const hasAttachedShortFill = linkedFills.length > 0;
              const shortfillUnitsTotal = linkedFills.reduce((s, l) => s + (l.unitsFilled || 0), 0);
              const shortfillSources = linkedFills.map((l) => `#${l.shortFillInvoiceNo}`).join(', ');

              // Check if this pallet is a shortfill supplier (supplies units to a prior shortfall)
              const supplierLink = (entry.shortFillLinks || []).find(
                (sfl) => String(sfl.arrivedPalletNumber || sfl.palletNumber).trim() === String(displayPalletNum).trim() ||
                        String(sfl.arrivedPalletNumber || sfl.palletNumber).trim() === String(pallet.palletNumber).trim()
              );

              // Determine Pallet Type: "Shortfall" | "Shortfill" | "Full"
              const isShortfillType = hasAttachedShortFill || Boolean(supplierLink);
              const isShortfallType = !isShortfillType && (
                Boolean(matchingShortfall && (matchingShortfall.shortfallUnits > 0 || matchingShortfall.remainingShortfallUnits > 0)) ||
                Boolean((pallet.receivedBatteries || 0) < (pallet.invoicedBatteries || 0))
              );
              const palletType: 'Full' | 'Shortfall' | 'Shortfill' = isShortfillType
                ? 'Shortfill'
                : isShortfallType
                ? 'Shortfall'
                : 'Full';

              return (
                <tr
                  key={pallet.id}
                  onClick={() => {
                    if (!isStuffed && !isPending) {
                      onTogglePallet(pallet.id, entry.customer);
                    }
                  }}
                  className={`transition-colors select-none ${
                    isStuffed
                      ? 'bg-slate-50/70 text-content-muted cursor-not-allowed'
                      : isPending
                      ? 'bg-amber-50/30 text-amber-900 cursor-not-allowed'
                      : isSelected
                      ? 'bg-brand-primary-soft/70 hover:bg-brand-primary-soft cursor-pointer'
                      : 'hover:bg-slate-50/80 cursor-pointer'
                  }`}
                >
                  {/* Checkbox */}
                  <td className="p-2.5 text-center border-r border-divider/50" onClick={(e) => e.stopPropagation()}>
                    {!isStuffed && !isPending ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onTogglePallet(pallet.id, entry.customer)}
                        className="rounded border-divider text-brand-primary focus:ring-brand-primary cursor-pointer w-3.5 h-3.5"
                      />
                    ) : (
                      <span className="text-content-muted text-[10px]">—</span>
                    )}
                  </td>

                  {/* PLT No. */}
                  <td className="p-2.5 font-bold text-brand-primary border-r border-divider/50 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span>PLT #{displayPalletNum}</span>
                      {hasAttachedShortFill && (
                        <span
                          className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-200 mt-0.5 w-fit font-mono tracking-tight"
                          title={`Shortfill recovered: +${shortfillUnitsTotal} Units via Inward ${shortfillSources}`}
                        >
                          SHORTFILL ATTACHED
                        </span>
                      )}
                      {supplierLink && (
                        <span
                          className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-800 border border-blue-200 mt-0.5 w-fit font-mono tracking-tight"
                          title={`Shortfill Supplier: Fulfills ${supplierLink.unitsFilled} Units for Inward #${supplierLink.priorShortfallInvoiceNo} (Target PLT #${supplierLink.palletNumber})`}
                        >
                          FOR INV #{supplierLink.priorShortfallInvoiceNo}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Item / SKU */}
                  <td
                    className="p-2.5 font-mono text-[11px] text-content-primary border-r border-divider/50 max-w-[130px] truncate"
                    title={pallet.model}
                  >
                    {pallet.model || 'GENERIC'}
                  </td>

                  {/* Type: Full / Shortfall / Shortfill */}
                  <td className="p-2.5 text-center border-r border-divider/50 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase tracking-wider ${
                        palletType === 'Shortfill'
                          ? 'bg-purple-100 text-purple-800 border border-purple-200'
                          : palletType === 'Shortfall'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      }`}
                      title={
                        palletType === 'Shortfill'
                          ? hasAttachedShortFill
                            ? `Shortfill Attached (+${shortfillUnitsTotal} u via ${shortfillSources})`
                            : `Shortfill Supplier (Supplies #${supplierLink?.priorShortfallInvoiceNo})`
                          : palletType === 'Shortfall'
                          ? `Shortfall recorded: missing ${matchingShortfall?.remainingShortfallUnits ?? matchingShortfall?.shortfallUnits} units`
                          : 'Full Physical Inward Received'
                      }
                    >
                      {palletType}
                    </span>
                  </td>

                  {/* Qty (u) */}
                  <td className="p-2.5 text-right font-bold text-content-primary border-r border-divider/50 whitespace-nowrap">
                    {unitsMode && !isStuffed && !isPending ? (
                      <div className="flex items-center justify-end space-x-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="number"
                          min={1}
                          max={maxUnits}
                          value={currentUnits}
                          onChange={(e) => {
                            const parsed = parseInt(e.target.value, 10);
                            const val = isNaN(parsed) ? 1 : Math.max(1, Math.min(maxUnits, parsed));
                            handleCustomUnitsChange(pallet.id, val);
                          }}
                          className="w-14 px-1 py-0.5 text-right font-mono font-bold text-xs bg-surface border border-purple-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-purple-900 shadow-2xs"
                          title={`Available on floor: ${maxUnits} units`}
                        />
                        <span className="text-[10px] text-content-muted font-normal">/ {maxUnits} Units</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-end">
                        <span>{pallet.receivedBatteries || pallet.invoicedBatteries} Units</span>
                        {hasAttachedShortFill && (
                          <span
                            className="text-[10px] text-purple-700 font-semibold font-mono"
                            title={`Includes +${shortfillUnitsTotal} units recovered from ${shortfillSources}`}
                          >
                            (+{shortfillUnitsTotal} u via {shortfillSources})
                          </span>
                        )}
                        {supplierLink && (
                          <span
                            className="text-[10px] text-blue-700 font-semibold font-mono"
                            title={`Earmarked to fulfill Inv #${supplierLink.priorShortfallInvoiceNo}`}
                          >
                            (Supplies #{supplierLink.priorShortfallInvoiceNo})
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Gross Weight (kg) */}
                  <td className="p-2.5 text-right font-mono text-content-secondary border-r border-divider/50 whitespace-nowrap">
                    {displayGrossKg.toLocaleString(undefined, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 3
                    })}{' '}
                    kg
                  </td>

                  {/* Status Badge */}
                  <td className="p-2.5 text-center whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase tracking-wider ${
                        isStuffed
                          ? 'bg-slate-100 text-slate-600 border border-slate-200'
                          : isPending
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {isStuffed ? 'SHIPPED' : isPending ? 'PENDING' : 'READY'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <tbody id={`invoice-row-${entry.customInvoiceNo}`} className="border-b border-divider font-sans">
      {/* =========================================================================
          1. COLLAPSED INVOICE ROW (Reference Image Top Half)
          ========================================================================= */}
      <tr
        onClick={onToggleExpand}
        className={`transition-colors select-none cursor-pointer ${
          isExpanded ? 'bg-indigo-50/25 border-b border-divider' : 'hover:bg-slate-50/70'
        }`}
      >
        {/* Col 1: Invoice Number & Month Badge */}
        <td className="p-3 border-r border-divider/50 whitespace-nowrap">
          <div className="flex items-center space-x-2">
            <span
              className="font-mono text-xs font-bold text-brand-primary hover:underline"
              title="Click anywhere on row to expand/collapse"
            >
              #{entry.customInvoiceNo}
            </span>
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold border border-slate-200">
              {entry.month || 'OCT'}
            </span>
          </div>
        </td>

        {/* Col 3: Product / Description */}
        <td className="p-3 border-r border-divider/50 whitespace-nowrap min-w-[220px]">
          <span
            className="font-semibold text-content-primary text-xs truncate block max-w-[280px]"
            title={entry.customer}
          >
            {entry.customer}
          </span>
        </td>

        {/* Col 4: Port of Discharge (POD) */}
        <td className="p-3 border-r border-divider/50 whitespace-nowrap text-xs text-content-secondary">
          {entry.pod || '—'}
        </td>

        {/* Col 5: Invoice Date */}
        <td className="p-3 border-r border-divider/50 whitespace-nowrap text-xs font-mono text-content-secondary">
          {invoiceDateStr}
        </td>

        {/* Col 6: Carting / Gate-In */}
        <td className="p-3 border-r border-divider/50 whitespace-nowrap text-xs font-mono text-content-secondary">
          {gateInDateStr}
        </td>

        {/* Col 7: Ageing */}
        <td className="p-3 border-r border-divider/50 whitespace-nowrap">
          <span className="font-mono font-bold text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
            {entry.daysInCFS ?? 0}d
          </span>
        </td>

        {/* Col 8: Compact Operational Status Badges */}
        <td className="p-3 border-r border-divider/50 whitespace-nowrap min-w-[340px]">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {/* Shortfall Open Badge */}
            {hasOpenShortfall && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 flex items-center space-x-1.5 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                <span>Shortfall Open</span>
              </span>
            )}

            {/* 100% Received / Gate-In Pending */}
            {entry.actualReceivedPallets < entry.invoicedPallets ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onConfirmFullGateIn(entry.id);
                }}
                className="px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-medium flex items-center space-x-1 shrink-0 cursor-pointer"
                title="Click to confirm full receipt gate-in"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span>Gate-In ({entry.actualReceivedPallets}/{entry.invoicedPallets})</span>
              </button>
            ) : (
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300 text-[10px] font-medium flex items-center space-x-1 shrink-0">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>100% Recd</span>
              </span>
            )}

            {/* Dangerous Goods (DG) Badge */}
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border shrink-0 ${
                entry.dgCreated
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}
              title={entry.dgCreated ? 'Dangerous Goods Manifest Created' : 'DG Manifest Required'}
            >
              DG {entry.dgCreated ? '✓' : '—'}
            </span>

            {/* Bill of Lading (BL) Badge */}
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border shrink-0 ${
                entry.blCreated
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}
              title={entry.blCreated ? 'Bill of Lading Created' : 'BL Required'}
            >
              BL {entry.blCreated ? '✓' : '—'}
            </span>

            {/* DG & BL Required / Dispatched / Partially Dispatched / Outward Execution */}
            {isFullyDispatched ? (
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-semibold flex items-center space-x-1 shrink-0">
                <CheckCircle2 className="w-3 h-3 text-slate-400" />
                <span>Dispatched</span>
              </span>
            ) : isPartiallyDispatched ? (
              <div className="flex items-center space-x-1 shrink-0">
                <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-300 text-[10px] font-semibold flex items-center space-x-1 shrink-0">
                  <Truck className="w-3 h-3 text-amber-600" />
                  <span>Partially Dispatched ({entry.actualStuffedBatteries}u)</span>
                </span>
                {isOutwardUnlocked && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDispatch(entry);
                    }}
                    className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] flex items-center space-x-1 shadow-2xs transition-colors cursor-pointer shrink-0"
                    title={`Outward dispatch remaining ${entry.balanceBatteries} units (${entry.balancePallets} pallets)`}
                  >
                    <Truck className="w-3 h-3" />
                    <span>Outward ({entry.balancePallets}p)</span>
                  </button>
                )}
              </div>
            ) : isOutwardUnlocked ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDispatch(entry);
                }}
                className="px-2.5 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] flex items-center space-x-1 shadow-2xs transition-colors cursor-pointer shrink-0"
                title={`Outward dispatch ready for ${entry.balancePallets} pallets`}
              >
                <Truck className="w-3 h-3" />
                <span>Outward ({entry.balancePallets})</span>
              </button>
            ) : (
              <span
                className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-400 border border-slate-200 text-[10px] font-medium flex items-center space-x-1 shrink-0 cursor-not-allowed"
                title="Both DG Manifest and Bill of Lading must be generated before executing outward dispatch"
              >
                <Lock className="w-3 h-3 text-slate-400" />
                <span>DG &amp; BL Required</span>
              </span>
            )}
          </div>
        </td>

        {/* Col 8: Action Menu (⋮) */}
        <td
          className="p-3 text-center w-10 cursor-default"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            ref={actionButtonRef}
            type="button"
            onClick={toggleActionMenu}
            className="p-1 rounded text-content-muted hover:text-content-primary hover:bg-surface-secondary transition-colors cursor-pointer"
            title="Invoice Actions"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showActionMenu && menuPosition && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowActionMenu(false);
                }}
              />
              <div
                style={{
                  top: `${menuPosition.top}px`,
                  right: `${menuPosition.right}px`
                }}
                className="fixed w-44 bg-surface border border-divider rounded-xl shadow-2xl py-1 z-50 text-left text-xs font-sans animate-in fade-in zoom-in-95 duration-100"
                onClick={(e) => e.stopPropagation()}
              >
                {onEditInward && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowActionMenu(false);
                      onEditInward(entry);
                    }}
                    className="w-full px-3 py-2 hover:bg-surface-secondary text-content-primary flex items-center space-x-2 text-xs transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5 text-brand-primary" />
                    <span>Edit Inward</span>
                  </button>
                )}
                {onLoadDispatchTool && (entry.balancePallets || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowActionMenu(false);
                      onLoadDispatchTool(entry);
                    }}
                    className="w-full px-3 py-2 hover:bg-surface-secondary text-brand-primary flex items-center space-x-2 text-xs transition-colors cursor-pointer"
                  >
                    <ArrowRight className="w-3.5 h-3.5 text-brand-primary" />
                    <span>Dispatch Tool</span>
                  </button>
                )}
                {onOpenDispatch && (entry.balancePallets || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowActionMenu(false);
                      onOpenDispatch(entry);
                    }}
                    className="w-full px-3 py-2 hover:bg-emerald-50 text-emerald-700 flex items-center space-x-2 text-xs transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Dispatch</span>
                  </button>
                )}
                {hasOpenShortfall && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowActionMenu(false);
                      onRecordShortFill(entry);
                    }}
                    className="w-full px-3 py-2 hover:bg-amber-50 text-amber-800 flex items-center space-x-2 text-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-600" />
                    <span>Record Short Fill</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowActionMenu(false);
                    onDeleteInvoice(entry);
                  }}
                  className="w-full px-3 py-2 hover:bg-rose-50 text-rose-700 flex items-center space-x-2 text-xs transition-colors cursor-pointer border-t border-divider/60"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Delete Invoice</span>
                </button>
              </div>
            </>
          )}
        </td>
      </tr>

      {/* =========================================================================
          2. EXPANDED OPERATIONAL DETAILS (Reference Image Bottom Half)
          ========================================================================= */}
      {isExpanded && (
        <tr className="bg-surface">
          <td colSpan={8} className="p-4 sm:p-5 border-t border-divider space-y-4">
            {/* A. FOUR SUMMARY METRICS + SHIPMENT METADATA (Horizontal 5-block grid) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* 1. Invoiced */}
              <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3 flex flex-col justify-between">
                <span className="text-xs font-semibold text-content-secondary">Invoiced</span>
                <div className="mt-1">
                  <span className="text-sm font-bold text-content-primary">
                    {entry.invoicedPallets} Plt{' '}
                    <span className="font-normal text-xs text-content-muted">
                      ({entry.invoicedBatteries.toLocaleString()} Units)
                    </span>
                  </span>
                </div>
              </div>

              {/* 2. Actual Received */}
              <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3 flex flex-col justify-between">
                <span className="text-xs font-semibold text-emerald-900">Actual Received</span>
                <div className="mt-1">
                  <span className="text-sm font-bold text-emerald-700">
                    {entry.actualReceivedPallets} Plt{' '}
                    <span className="font-normal text-xs text-emerald-600">
                      ({(entry.actualReceivedBatteries || 0).toLocaleString()} Units)
                    </span>
                  </span>
                </div>
              </div>

              {/* 3. Shortfall */}
              <div className="bg-rose-50/60 border border-rose-200/80 rounded-xl p-3 flex flex-col justify-between">
                <span className="text-xs font-semibold text-rose-900">Shortfall</span>
                <div className="mt-1">
                  <span className="text-sm font-bold text-rose-600">
                    {entry.shortfallPallets || 0} Plt / {entry.shortfallBatteries || 0} Units
                  </span>
                </div>
              </div>

              {/* 4. Floor Balance & Exact WT */}
              <div className="bg-indigo-50/50 border border-indigo-200/80 rounded-xl p-3 flex flex-col justify-between">
                <span className="text-xs font-semibold text-indigo-900">Floor Balance &amp; Exact WT</span>
                <div className="mt-1">
                  <div className="text-sm font-bold text-brand-primary">
                    {entry.balancePallets} Plt{' '}
                    <span className="font-normal text-xs text-indigo-600">
                      ({(entry.balanceBatteries || 0).toLocaleString()} Units)
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-content-secondary mt-0.5">
                    GW: {exactGrossKg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg
                    {exactNetKg !== undefined &&
                      ` | NW: ${exactNetKg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg`}
                  </div>
                </div>
              </div>

              {/* 5. Shipment Metadata (Compact 2x2 grid) */}
              <div className="bg-surface border border-divider rounded-xl p-3 text-xs font-mono flex flex-col justify-between">
                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
                  <div className="flex items-center space-x-1.5 truncate">
                    <Package className="w-3.5 h-3.5 text-content-muted shrink-0" />
                    <span className="text-content-muted">Container:</span>
                    <strong className="text-content-primary truncate">{entry.containerNo || '—'}</strong>
                  </div>
                  <div className="flex items-center space-x-1.5 truncate">
                    <Calendar className="w-3.5 h-3.5 text-content-muted shrink-0" />
                    <span className="text-content-muted">Stuffing:</span>
                    <span className="text-content-primary truncate">{entry.stuffingDate || '—'}</span>
                  </div>
                  <div className="flex items-center space-x-1.5 truncate">
                    <Lock className="w-3.5 h-3.5 text-content-muted shrink-0" />
                    <span className="text-content-muted">Seal No.:</span>
                    <span className="text-content-primary truncate">{entry.sealNo || '—'}</span>
                  </div>
                  <div className="flex items-center space-x-1.5 truncate">
                    <FileText className="w-3.5 h-3.5 text-content-muted shrink-0" />
                    <span className="text-content-muted">SB No.:</span>
                    <span className="text-content-primary truncate">{entry.shippingBillNo || '—'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* B. SHORTFALL & SHORT-FILL TRACEABILITY STRIP */}
            {(shortfallsList.length > 0 || isShortFillReconciled || (entry.shortfallBatteries || 0) > 0) && (
              <div className="bg-amber-50/50 border border-amber-200/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center space-x-1.5 font-bold text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Shortfall &amp; Short-Fill Traceability</span>
                  </div>

                  {shortfallsList.length > 0 ? (
                    shortfallsList.map((sf) => (
                      <div key={sf.id} className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-brand-primary">
                          PLT #{sf.palletNumber}
                        </span>
                        <span className="text-content-secondary">
                          Billed: <strong className="text-content-primary">{sf.billedUnits} Units</strong> • Short:{' '}
                          <strong className="text-rose-600">{sf.shortfallUnits} Units</strong> • Remaining:{' '}
                          <strong className="text-amber-700">{sf.remainingShortfallUnits} Units</strong>
                        </span>
                        <span className="text-content-muted text-[11px]">
                          ({sf.openedDate} - {sf.openedMonth})
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-content-secondary">
                        Total Shortfall: <strong className="text-rose-600">{entry.shortfallBatteries} Units</strong>
                      </span>
                    </div>
                  )}

                  {/* Reconciled Short Fill Link (if this invoice filled a prior invoice) */}
                  {(entry.shortFillLinks || []).map((link, idx) => (
                    <div
                      key={idx}
                      className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center space-x-1.5"
                    >
                      <CheckCircle2 className="w-3 h-3 text-blue-600 shrink-0" />
                      <span>
                        Fulfills <strong>{link.unitsFilled} Units</strong> on Inv <strong>#{link.priorShortfallInvoiceNo}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* C. PALLET INVENTORY SECTION (Header + 2 Side-by-Side Tables) */}
            <div className="space-y-3">
              {/* Header Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-content-primary">
                  <Package className="w-4 h-4 text-brand-primary" />
                  <span>
                    Pallet Units ({allPallets.length} Total • {readyPallets.length} Ready in Warehouse)
                  </span>

                  {/* Units Mode Toggle Switch */}
                  <div
                    onClick={() => setUnitsMode(!unitsMode)}
                    className="inline-flex items-center space-x-2 text-xs font-semibold text-content-secondary hover:text-content-primary cursor-pointer select-none group px-2.5 py-1 rounded-lg border border-divider bg-surface hover:bg-surface-secondary/60 transition-colors shadow-2xs"
                    title="Toggle Units Mode: Enter custom unit quantities to dispatch from each pallet"
                  >
                    <span className="text-xs font-semibold text-content-secondary group-hover:text-content-primary transition-colors">
                      Units Mode
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={unitsMode}
                      onClick={(e) => {
                        e.stopPropagation();
                        setUnitsMode(!unitsMode);
                      }}
                      className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        unitsMode ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          unitsMode ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {selectedThisInvoiceCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-brand-primary text-white text-[10px] font-mono font-bold">
                      {selectedThisInvoiceCount} Selected{unitsMode && ` (${selectedTotalUnits} Units)`}
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-3">
                  {/* Search PLT / SKU */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-content-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={palletSearchQuery}
                      onChange={(e) => setPalletSearchQuery(e.target.value)}
                      placeholder="Search PLT / SKU..."
                      className="pl-8 pr-3 py-1 bg-surface border border-divider rounded-lg text-xs w-44 text-content-primary placeholder-content-muted focus:outline-none focus:border-brand-primary font-sans"
                    />
                  </div>

                  {/* Select All Ready Checkbox */}
                  {readyPallets.length > 0 && (
                    <label
                      className="flex items-center space-x-1.5 text-xs font-semibold text-brand-primary hover:text-brand-primary-hover cursor-pointer select-none"
                      onClick={(e) => {
                        e.preventDefault();
                        if (areAllReadySelected) {
                          onDeselectAllPallets(readyPalletIds);
                        } else {
                          onSelectAllPallets(readyPalletIds, entry.customer);
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={areAllReadySelected}
                        onChange={() => {}}
                        className="rounded border-divider text-brand-primary focus:ring-brand-primary cursor-pointer w-3.5 h-3.5"
                      />
                      <span>Select All Ready</span>
                    </label>
                  )}
                </div>
              </div>

              {/* Two Side-by-Side Pallet Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {renderPalletTable(leftTablePallets)}
                {renderPalletTable(rightTablePallets)}
              </div>
            </div>

            {/* D. BOTTOM OPERATIONAL ACTION BAR */}
            <div className="pt-2 border-t border-divider flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="text-content-secondary">
                Selected: <strong className="text-content-primary font-bold">{selectedThisInvoiceCount}</strong> of{' '}
                {readyPallets.length} ready pallets
                {unitsMode && selectedThisInvoiceCount > 0 && (
                  <span className="text-purple-700 font-bold ml-1.5">
                    ({selectedTotalUnits} units to dispatch)
                  </span>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </tbody>
  );
}
