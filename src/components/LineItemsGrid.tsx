import React from 'react';
import { 
  Plus, 
  Trash2, 
  Copy, 
  Wand2, 
  Calculator
} from 'lucide-react';
import type { LineItemData } from '../types/customs';
import { validateHsnCode, autoPadHsn } from '../services/hsnValidator';
import { normalizeUqc, STANDARD_ICEGATE_UQCS } from '../services/uqcNormalizer';
import { recalculateLineItemTotal } from '../services/arithmeticReconciliation';

interface LineItemsGridProps {
  items: LineItemData[];
  currency: string;
  onUpdateItem: (index: number, updated: LineItemData) => void;
  onAddItem: () => void;
  onDuplicateItem: (index: number) => void;
  onDeleteItem: (index: number) => void;
  onHoverItem: (index: number | null) => void;
}

export const LineItemsGrid: React.FC<LineItemsGridProps> = ({
  items,
  currency,
  onUpdateItem,
  onAddItem,
  onDuplicateItem,
  onDeleteItem,
  onHoverItem
}) => {
  const handleHsnChange = (index: number, val: string) => {
    const cleaned = val.replace(/[^0-9]/g, '');
    const hsnResult = validateHsnCode(cleaned);
    const item = items[index];
    onUpdateItem(index, {
      ...item,
      hsnCode: cleaned,
      isHsnValid: hsnResult.isValid
    });
  };

  const handlePadHsn = (index: number) => {
    const item = items[index];
    const padded = autoPadHsn(item.hsnCode);
    const hsnResult = validateHsnCode(padded);
    onUpdateItem(index, {
      ...item,
      hsnCode: padded,
      isHsnValid: hsnResult.isValid
    });
  };

  const handleUqcChange = (index: number, rawUnit: string) => {
    const norm = normalizeUqc(rawUnit);
    const item = items[index];
    onUpdateItem(index, {
      ...item,
      uqc: norm.uqc,
      originalUqc: rawUnit
    });
  };

  const handleQtyPriceChange = (index: number, qty: number, price: number) => {
    const item = items[index];
    const calc = Number((qty * price).toFixed(2));
    const isLineMathValid = Math.abs(item.itemTotalValue - calc) <= 0.5;
    onUpdateItem(index, {
      ...item,
      quantity: qty,
      unitPrice: price,
      calculatedTotal: calc,
      isLineMathValid
    });
  };

  const handleItemTotalChange = (index: number, total: number) => {
    const item = items[index];
    const calc = Number((item.quantity * item.unitPrice).toFixed(2));
    const isLineMathValid = Math.abs(total - calc) <= 0.5;
    onUpdateItem(index, {
      ...item,
      itemTotalValue: total,
      isLineMathValid
    });
  };

  const handleRecalculate = (index: number) => {
    const item = items[index];
    const fixed = recalculateLineItemTotal(item);
    onUpdateItem(index, fixed);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950 overflow-hidden">
      {/* Table Header Controls */}
      <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Customs Line Items Grid
          </span>
          <span className="text-xs text-slate-400 font-mono">
            ({items.length} {items.length === 1 ? 'item' : 'items'})
          </span>
        </div>

        <button
          onClick={onAddItem}
          className="flex items-center space-x-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs px-2.5 py-1 rounded font-semibold transition-all shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Line Item</span>
        </button>
      </div>

      {/* Grid Container */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-left text-xs text-slate-300">
          <thead className="bg-slate-900/90 sticky top-0 z-10 border-b border-slate-800 font-semibold text-[11px] text-slate-400 select-none">
            <tr>
              <th className="py-2 px-2 text-center w-12">#</th>
              <th className="py-2 px-3 min-w-[260px]">Description of Goods</th>
              <th className="py-2 px-3 w-40">HSN / RITC (8-Digit)</th>
              <th className="py-2 px-3 w-24 text-right">Quantity</th>
              <th className="py-2 px-2 w-24 text-center">UQC</th>
              <th className="py-2 px-3 w-28 text-right">Unit Rate ({currency})</th>
              <th className="py-2 px-3 w-36 text-right">Line Total ({currency})</th>
              <th className="py-2 px-2 w-20 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {items.map((item, idx) => {
              const isHsnValid = item.hsnCode && item.hsnCode.length === 8;
              const calcDiff = Math.abs(item.itemTotalValue - (item.quantity * item.unitPrice));
              const hasMathDrift = calcDiff > 0.50;

              return (
                <tr
                  key={item.id}
                  onMouseEnter={() => onHoverItem(idx)}
                  onMouseLeave={() => onHoverItem(null)}
                  className="hover:bg-slate-900/60 transition-colors group"
                >
                  {/* Row Number */}
                  <td className="py-2 px-2 text-center font-mono text-slate-500">
                    {item.itemNumber || idx + 1}
                  </td>

                  {/* Description */}
                  <td className="py-1 px-3">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => onUpdateItem(idx, { ...item, description: e.target.value })}
                      placeholder="Commercial Description..."
                      className="w-full bg-transparent px-2 py-1 rounded text-xs text-slate-200 hover:bg-slate-900 focus:bg-slate-900 focus:ring-1 focus:ring-sky-500 outline-none transition-colors"
                    />
                  </td>

                  {/* 8-Digit HSN/RITC with 1-Click Auto-Pad */}
                  <td className="py-1 px-3">
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        maxLength={8}
                        value={item.hsnCode}
                        onChange={(e) => handleHsnChange(idx, e.target.value)}
                        className={`w-full font-mono text-xs px-2 py-1 rounded border outline-none transition-colors ${
                          isHsnValid
                            ? 'bg-transparent border-transparent hover:border-slate-700 text-slate-200 focus:bg-slate-900 focus:ring-1 focus:ring-sky-500'
                            : 'bg-rose-950/40 border-rose-600 text-rose-300 font-bold focus:ring-1 focus:ring-rose-500'
                        }`}
                        placeholder="8-digit HSN"
                      />
                      {!isHsnValid && (
                        <button
                          type="button"
                          onClick={() => handlePadHsn(idx)}
                          className="absolute right-1 text-[10px] bg-rose-600 hover:bg-rose-500 text-white font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 shadow"
                          title="Auto-pad to 8-digit RITC code"
                        >
                          <Wand2 className="w-2.5 h-2.5" /> Pad
                        </button>
                      )}
                    </div>
                    {!isHsnValid && (
                      <span className="text-[9px] text-rose-400 font-mono pl-2 block">
                        ICEGATE reject: {item.hsnCode.length}/8 digits
                      </span>
                    )}
                  </td>

                  {/* Quantity */}
                  <td className="py-1 px-3 text-right">
                    <input
                      type="number"
                      step="any"
                      value={item.quantity}
                      onChange={(e) => handleQtyPriceChange(idx, parseFloat(e.target.value) || 0, item.unitPrice)}
                      className="w-full font-mono text-xs text-right bg-transparent px-2 py-1 rounded hover:bg-slate-900 focus:bg-slate-900 focus:ring-1 focus:ring-sky-500 outline-none text-slate-200"
                    />
                  </td>

                  {/* UQC (Normalized with Standard Dropdown) */}
                  <td className="py-1 px-2 text-center">
                    <select
                      value={item.uqc.toUpperCase()}
                      onChange={(e) => handleUqcChange(idx, e.target.value)}
                      className="bg-slate-900 border border-slate-800 text-[11px] font-mono font-semibold text-sky-400 rounded px-1 py-1 focus:ring-1 focus:ring-sky-500 outline-none"
                      title={item.originalUqc ? `Extracted as: ${item.originalUqc}` : 'ICEGATE UQC'}
                    >
                      {STANDARD_ICEGATE_UQCS.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </td>

                  {/* Unit Price */}
                  <td className="py-1 px-3 text-right">
                    <input
                      type="number"
                      step="any"
                      value={item.unitPrice}
                      onChange={(e) => handleQtyPriceChange(idx, item.quantity, parseFloat(e.target.value) || 0)}
                      className="w-full font-mono text-xs text-right bg-transparent px-2 py-1 rounded hover:bg-slate-900 focus:bg-slate-900 focus:ring-1 focus:ring-sky-500 outline-none text-slate-200"
                    />
                  </td>

                  {/* Line Total with Math Drift Indicator */}
                  <td className="py-1 px-3 text-right">
                    <div className="relative flex items-center justify-end">
                      <input
                        type="number"
                        step="0.01"
                        value={item.itemTotalValue}
                        onChange={(e) => handleItemTotalChange(idx, parseFloat(e.target.value) || 0)}
                        className={`w-full font-mono font-bold text-xs text-right px-2 py-1 rounded border outline-none ${
                          hasMathDrift
                            ? 'bg-amber-950/40 border-amber-600 text-amber-300'
                            : 'bg-transparent border-transparent hover:border-slate-800 text-slate-100 focus:bg-slate-900 focus:ring-1 focus:ring-sky-500'
                        }`}
                      />
                      {hasMathDrift && (
                        <button
                          type="button"
                          onClick={() => handleRecalculate(idx)}
                          className="ml-1 text-[10px] bg-amber-600 hover:bg-amber-500 text-white font-bold p-1 rounded shrink-0"
                          title={`Recalculate (Diff: ${calcDiff.toFixed(2)})`}
                        >
                          <Calculator className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {hasMathDrift && (
                      <span className="text-[9px] text-amber-400 font-mono text-right block pr-1">
                        Calc: {(item.quantity * item.unitPrice).toFixed(2)}
                      </span>
                    )}
                  </td>

                  {/* Row Actions */}
                  <td className="py-1 px-2 text-center">
                    <div className="flex items-center justify-center space-x-1 opacity-60 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onDuplicateItem(idx)}
                        className="p-1 text-slate-400 hover:text-sky-400 rounded"
                        title="Duplicate Row"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onDeleteItem(idx)}
                        className="p-1 text-slate-400 hover:text-rose-400 rounded"
                        title="Delete Row"
                        disabled={items.length <= 1}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
