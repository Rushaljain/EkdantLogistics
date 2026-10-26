import React from 'react';
import { Sparkles, Inbox, Trash2 } from 'lucide-react';
import type { ConvertedInvoice } from '../types';
import { OutputCard } from './OutputCard';

interface ConvertedOutputsFeedProps {
  invoices: ConvertedInvoice[];
  onEdit: (invoice: ConvertedInvoice) => void;
  onDelete: (invoiceId: string) => void;
  onClearAll: () => void;
  onLoadSample: () => void;
}

export const ConvertedOutputsFeed: React.FC<ConvertedOutputsFeedProps> = ({
  invoices,
  onEdit,
  onDelete,
  onClearAll,
  onLoadSample
}) => {
  return (
    <div className="space-y-4">
      {/* Feed Header */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center space-x-2">
          <h2 className="text-sm font-bold text-slate-900 tracking-tight">
            Converted Outputs
          </h2>
          <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700">
            {invoices.length}
          </span>
        </div>

        {invoices.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm('Are you sure you want to clear all converted document history?')) {
                onClearAll();
              }
            }}
            className="text-xs text-slate-400 hover:text-rose-600 transition-colors flex items-center space-x-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {/* Invoice Cards List */}
      {invoices.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
            <Inbox className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">
            No converted documents yet
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm leading-relaxed">
            Upload your commercial invoice or packing list PDF on the left, or test instantly with our pre-loaded customs sample.
          </p>
          <button
            onClick={onLoadSample}
            className="mt-4 inline-flex items-center space-x-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100/80 px-3.5 py-1.5 rounded-lg transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Load Sample Invoice</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {invoices.map(inv => (
            <OutputCard
              key={inv.id}
              invoice={inv}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};
