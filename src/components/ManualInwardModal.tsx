// Ekdant Logistics - Manual Inward Pop-Up Modal (Prompt 2)
// Structured multi-column Excel-header entry with Point X manual exact weights,
// Shortfall builder (PALLET vs UNITS), and Multi-Short-Fill reconciliation flow.

import React, { useState, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ArrowDownToLine,
  Layers,
  Boxes,
  RefreshCw,
  Link as LinkIcon
} from 'lucide-react';
import type {
  CFSLedgerEntry,
  ReceiptMode,
  ShortfallMode
} from '../types/index.ts';
import {
  getCFSLedgerEntries,
  recordManualInward,
  type ManualInwardShortfallInput,
  type ManualInwardShortFillInput,
  type RecordManualInwardParams
} from '../utils/inventoryStore.ts';

interface ManualInwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newEntry: CFSLedgerEntry) => void;
}

export interface InwardPalletRow {
  id: string;
  palletNumber: string;
  qty: number | '';
}

interface ShortfallRowState {
  id: string;
  mode: ShortfallMode;
  palletNumber: string;
  shortfallUnits: number;
}

export function ManualInwardModal({
  isOpen,
  onClose,
  onSuccess
}: ManualInwardModalProps): React.JSX.Element | null {
  // Existing entries for autocompleting customers and discovering open shortfalls
  const existingEntries = useMemo(() => getCFSLedgerEntries(), []);

  // Distinct known customers
  const knownCustomers = useMemo(() => {
    const set = new Set<string>();
    existingEntries.forEach((e) => {
      if (e.customer && e.customer.trim()) set.add(e.customer.trim());
    });
    return Array.from(set).sort();
  }, [existingEntries]);

  // Existing entries that currently have open shortfalls
  const openShortfallEntries = useMemo(() => {
    return existingEntries.filter((e) => {
      const hasOpenRecord = e.shortfalls && e.shortfalls.some((sf) => sf.status !== 'CLEARED' && sf.remainingShortfallUnits > 0);
      const hasPendingQty = (e.shortfallBatteries || 0) > 0 || (e.shortfallPallets || 0) > 0;
      return hasOpenRecord || hasPendingQty;
    });
  }, [existingEntries]);

  // Form State: Identity & Party (Clean blank defaults)
  const [customInvoiceNo, setCustomInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [customer, setCustomer] = useState('');
  const [exporterShipper, setExporterShipper] = useState('');
  const [pod, setPod] = useState('');

  // Quantities & Exact Weights (Point X manual inputs)
  const [invoicedPalletsStr, setInvoicedPalletsStr] = useState('');
  const [invoicedBatteriesStr, setInvoicedBatteriesStr] = useState('');
  const [manualGrossWeightKgStr, setManualGrossWeightKgStr] = useState('');
  const [manualNetWeightKgStr, setManualNetWeightKgStr] = useState('');

  // Gate-In & Transport Logistics
  const [truckReportingDate, setTruckReportingDate] = useState('');
  const [cartingInDate, setCartingInDate] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [cartingSlipNo, setCartingSlipNo] = useState('');
  const [remarks, setRemarks] = useState('');

  // Actual Received Pallets Breakdown
  const [palletRows, setPalletRows] = useState<InwardPalletRow[]>([]);

  // Receipt Mode: 'RECEIVED_FULL' | 'SHORT_FALL' | 'SHORT_FILL'
  const [receiptMode, setReceiptMode] = useState<ReceiptMode>('RECEIVED_FULL');

  // Shortfall Entry Rows (when mode === 'SHORT_FALL')
  const [shortfallRows, setShortfallRows] = useState<ShortfallRowState[]>([]);

  // Short Fill Selection (when mode === 'SHORT_FILL')
  const [selectedPriorInvoiceNo, setSelectedPriorInvoiceNo] = useState<string>('');
  const [shortFillPalletNumber, setShortFillPalletNumber] = useState<string>('');
  const [shortFillUnitsStr, setShortFillUnitsStr] = useState<string>('');

  // Validation Error State
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Clean reset form state
  const resetForm = () => {
    setCustomInvoiceNo('');
    setInvoiceDate('');
    setCustomer('');
    setExporterShipper('');
    setPod('');
    setInvoicedPalletsStr('');
    setInvoicedBatteriesStr('');
    setManualGrossWeightKgStr('');
    setManualNetWeightKgStr('');
    setTruckReportingDate('');
    setCartingInDate('');
    setVehicleNo('');
    setCartingSlipNo('');
    setRemarks('');
    setPalletRows([]);
    setReceiptMode('RECEIVED_FULL');
    setShortfallRows([]);
    setSelectedPriorInvoiceNo('');
    setShortFillPalletNumber('');
    setShortFillUnitsStr('');
    setErrorMsg(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Auto-calculated numbers
  const invPallets = parseInt(invoicedPalletsStr, 10) || 0;
  const invBatteries = parseInt(invoicedBatteriesStr, 10) || 0;
  const grossKg = parseFloat(manualGrossWeightKgStr) || 0;
  const netKg = manualNetWeightKgStr.trim() ? parseFloat(manualNetWeightKgStr) : undefined;

  // Average units per pallet for quick defaulting
  const defaultUnitsPerPallet = invPallets > 0 && invBatteries > 0 ? Math.floor(invBatteries / invPallets) : 32;

  // Actual Received Pallet Row Handlers
  const handleAddPalletRow = () => {
    const nextPalletNum = palletRows.length + 1;
    setPalletRows((prev) => [
      ...prev,
      {
        id: `plt_row_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        palletNumber: String(nextPalletNum),
        qty: defaultUnitsPerPallet || ''
      }
    ]);
  };

  const handleRemovePalletRow = (rowId: string) => {
    setPalletRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  const handleUpdatePalletRow = (rowId: string, field: 'palletNumber' | 'qty', value: any) => {
    setPalletRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        if (field === 'qty') {
          const parsed = value === '' ? '' : Math.max(0, parseInt(value, 10) || 0);
          return { ...r, qty: parsed };
        }
        return { ...r, [field]: value };
      })
    );
  };

  const handleAutoPopulatePalletRows = () => {
    if (invPallets <= 0) return;
    const avgUnits = invBatteries > 0 ? Math.floor(invBatteries / invPallets) : 0;
    const remainder = invBatteries > 0 ? invBatteries - (avgUnits * invPallets) : 0;

    const newRows: InwardPalletRow[] = [];
    for (let i = 1; i <= invPallets; i++) {
      const units = i === invPallets ? avgUnits + remainder : avgUnits;
      newRows.push({
        id: `plt_row_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
        palletNumber: String(i),
        qty: units > 0 ? units : ''
      });
    }
    setPalletRows(newRows);
  };

  const totalPalletRowsQty = useMemo(() => {
    return palletRows.reduce((sum, r) => sum + (typeof r.qty === 'number' ? r.qty : 0), 0);
  }, [palletRows]);

  // Add a new shortfall row
  const handleAddShortfallRow = () => {
    const nextPalletNum = shortfallRows.length + 1;
    setShortfallRows((prev) => [
      ...prev,
      {
        id: `sf_row_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        mode: 'PALLET',
        palletNumber: String(nextPalletNum),
        shortfallUnits: defaultUnitsPerPallet || 0
      }
    ]);
  };

  // Remove a shortfall row
  const handleRemoveShortfallRow = (rowId: string) => {
    setShortfallRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  // Update a shortfall row
  const handleUpdateShortfallRow = (rowId: string, updates: Partial<ShortfallRowState>) => {
    setShortfallRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        return { ...r, ...updates };
      })
    );
  };

  // Summary Metrics for Shortfall Mode - Uses exact shortfallUnits entered on rows (zero hardcoded defaults)
  const shortfallSummary = useMemo(() => {
    let sfPallets = 0;
    let sfBatteries = 0;

    shortfallRows.forEach((r) => {
      if (r.mode === 'PALLET') {
        sfPallets += 1;
      }
      sfBatteries += r.shortfallUnits || 0;
    });

    const enteringPallets = Math.max(0, invPallets - sfPallets);
    const enteringBatteries = Math.max(0, invBatteries - sfBatteries);

    return {
      sfPallets,
      sfBatteries,
      enteringPallets,
      enteringBatteries
    };
  }, [shortfallRows, invPallets, invBatteries]);

  // Target Prior Entry for Short Fill Mode
  const priorEntry = useMemo(() => {
    if (!selectedPriorInvoiceNo) return null;
    return openShortfallEntries.find((e) => e.customInvoiceNo.trim().toUpperCase() === selectedPriorInvoiceNo.trim().toUpperCase()) || null;
  }, [selectedPriorInvoiceNo, openShortfallEntries]);

  // Remaining shortfall units in selected prior invoice
  const priorRemainingShortfallUnits = useMemo(() => {
    if (!priorEntry) return 0;
    if (priorEntry.shortfalls && priorEntry.shortfalls.length > 0) {
      return priorEntry.shortfalls.reduce((sum, sf) => sum + (sf.status !== 'CLEARED' ? sf.remainingShortfallUnits : 0), 0);
    }
    return priorEntry.shortfallBatteries || 0;
  }, [priorEntry]);

  // Form Submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Validation
    const trimmedInvoice = customInvoiceNo.trim().toUpperCase();
    if (!trimmedInvoice) {
      setErrorMsg('Invoice Number is required.');
      return;
    }
    const trimmedCustomer = customer.trim();
    if (!trimmedCustomer) {
      setErrorMsg('Customer name is required.');
      return;
    }
    if (invPallets <= 0) {
      setErrorMsg('Received Pallets must be greater than 0.');
      return;
    }
    if (invBatteries <= 0) {
      setErrorMsg('Received Units/Batteries must be greater than 0.');
      return;
    }
    if (grossKg <= 0) {
      setErrorMsg('Manual Gross Weight (kg) is required and must be greater than 0.');
      return;
    }

    // Pallet breakdown validation (if custom rows provided)
    if (palletRows.length > 0) {
      for (let i = 0; i < palletRows.length; i++) {
        const row = palletRows[i];
        if (!row.palletNumber.trim()) {
          setErrorMsg(`Pallet row #${i + 1}: Pallet Number is required.`);
          return;
        }
        if (typeof row.qty !== 'number' || row.qty <= 0) {
          setErrorMsg(`Pallet ${row.palletNumber}: Please enter a valid quantity of units greater than 0.`);
          return;
        }
      }
    }

    const mappedPallets = palletRows.length > 0
      ? palletRows.map((r, idx) => ({
          palletNumber: r.palletNumber.trim() || String(idx + 1),
          model: 'STANDARD',
          invoicedBatteries: Number(r.qty) || 0,
          receivedBatteries: Number(r.qty) || 0
        }))
      : undefined;

    // Shortfall specific validation - Uses exact shortfallUnits entered on each row
    let mappedShortfallInputs: ManualInwardShortfallInput[] | undefined = undefined;
    if (receiptMode === 'SHORT_FALL') {
      if (shortfallRows.length === 0) {
        setErrorMsg('Short Fall mode selected: Please add at least one shortfall row, or switch to Received Full.');
        return;
      }
      for (const row of shortfallRows) {
        if (!row.palletNumber.trim()) {
          setErrorMsg('Pallet Number is required for all shortfall rows.');
          return;
        }
        if (!row.shortfallUnits || row.shortfallUnits <= 0) {
          setErrorMsg(`Pallet ${row.palletNumber}: Please enter a valid number of shortfall units greater than 0.`);
          return;
        }
      }

      mappedShortfallInputs = shortfallRows.map((r) => ({
        mode: r.mode,
        palletNumber: r.palletNumber.trim(),
        billedUnits: r.shortfallUnits,
        shortfallUnits: r.shortfallUnits
      }));
    }

    // Short Fill specific validation
    let mappedShortFillInputs: ManualInwardShortFillInput[] | undefined = undefined;
    if (receiptMode === 'SHORT_FILL') {
      if (!selectedPriorInvoiceNo) {
        setErrorMsg('Short Fill mode selected: Please select a prior shortfall invoice to reconcile.');
        return;
      }
      const filledUnits = parseInt(shortFillUnitsStr, 10) || 0;
      if (filledUnits <= 0) {
        setErrorMsg('Please specify a positive number of units to fill against the prior shortfall.');
        return;
      }
      if (filledUnits > priorRemainingShortfallUnits) {
        setErrorMsg(`Units to fill (${filledUnits}) cannot exceed the prior invoice's remaining shortfall (${priorRemainingShortfallUnits} units).`);
        return;
      }
      mappedShortFillInputs = [
        {
          priorShortfallInvoiceNo: selectedPriorInvoiceNo,
          priorShortfallLedgerId: priorEntry?.id,
          palletNumber: shortFillPalletNumber.trim() || undefined,
          unitsFilled: filledUnits
        }
      ];
    }

    setIsSubmitting(true);
    try {
      const inwardParams: RecordManualInwardParams = {
        customer: trimmedCustomer,
        exporterShipper: exporterShipper.trim(),
        customInvoiceNo: trimmedInvoice,
        invoiceDate: invoiceDate.trim(),
        pod: pod.trim(),
        receiptMode,
        invoicedPallets: mappedPallets ? Math.max(invPallets, mappedPallets.length) : invPallets,
        invoicedBatteries: invBatteries,
        invoicedGrossWeightKg: grossKg,
        invoicedNetWeightKg: netKg,
        actualGrossWeightKg: grossKg,
        actualNetWeightKg: netKg,
        cartingInDate: cartingInDate.trim(),
        vehicleNo: vehicleNo.trim().toUpperCase(),
        truckReportingDate: truckReportingDate.trim(),
        pallets: mappedPallets,
        shortfallInputs: mappedShortfallInputs,
        shortFillInputs: mappedShortFillInputs,
        remarks: remarks.trim()
      };

      const newEntry = recordManualInward(inwardParams);
      resetForm();
      onSuccess(newEntry);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to record manual inward.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-fade-in">
      <div className="bg-surface border border-divider rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        {/* MODAL HEADER */}
        <div className="px-5 py-4 border-b border-divider flex items-center justify-between bg-surface-secondary/40 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
              <ArrowDownToLine className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-content-primary tracking-tight">
                Stock-In / Manual Inward Entry
              </h2>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-secondary transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FORM CONTENT (Vertical scroll only, zero horizontal overflow) */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-5 flex-1">
          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-xs flex items-start space-x-2 animate-fade-in">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* SECTION 1: IDENTITY & PARTY */}
          <div className="bg-surface border border-divider rounded-xl p-4 space-y-3 shadow-xs">
            <div className="flex items-center space-x-2 pb-2 border-b border-divider/60">
              <span className="text-xs font-bold text-content-primary uppercase tracking-wider">
                1. Commercial Identity & Consignee
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div>
                <label className="block text-content-secondary font-medium mb-1">
                  Custom Invoice No. <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={customInvoiceNo}
                  onChange={(e) => setCustomInvoiceNo(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary focus:ring-1 focus:ring-brand-primary text-content-primary font-mono font-medium outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-content-secondary font-medium mb-1">
                  Invoice Date
                </label>
                <input
                  type="text"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary font-mono outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-content-secondary font-medium mb-1">
                  Consignee / Customer <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  list="known-customers-list"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary outline-none transition-colors"
                />
                <datalist id="known-customers-list">
                  {knownCustomers.map((cust) => (
                    <option key={cust} value={cust} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-content-secondary font-medium mb-1">
                  Exporter / Shipper
                </label>
                <input
                  type="text"
                  value={exporterShipper}
                  onChange={(e) => setExporterShipper(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-content-secondary font-medium mb-1">
                  Port of Discharge (POD)
                </label>
                <input
                  type="text"
                  value={pod}
                  onChange={(e) => setPod(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: QUANTITIES & EXACT DECIMAL WEIGHTS (POINT X) */}
          <div className="bg-surface border border-divider rounded-xl p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-divider/60">
              <span className="text-xs font-bold text-content-primary uppercase tracking-wider">
                2. Received Quantities & Exact Weights
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-content-secondary font-medium mb-1">
                  Received Pallets <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={invoicedPalletsStr}
                  onChange={(e) => setInvoicedPalletsStr(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary font-mono font-medium outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              <div>
                <label className="block text-content-secondary font-medium mb-1">
                  Received Units / Batteries <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={invoicedBatteriesStr}
                  onChange={(e) => setInvoicedBatteriesStr(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary font-mono font-medium outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              <div>
                <label className="block text-content-secondary font-medium mb-1">
                  Manual Gross Weight (kg) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={manualGrossWeightKgStr}
                  onChange={(e) => setManualGrossWeightKgStr(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary font-mono font-bold outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              <div>
                <label className="block text-content-secondary font-medium mb-1">
                  Manual Net Weight (kg)
                </label>
                <input
                  type="number"
                  step="any"
                  value={manualNetWeightKgStr}
                  onChange={(e) => setManualNetWeightKgStr(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary font-mono outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2B: ACTUAL RECEIVED PALLETS BREAKDOWN */}
          <div className="bg-surface border border-divider rounded-xl p-4 space-y-3 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-divider/60">
              <div className="flex items-center space-x-2">
                <Boxes className="w-4 h-4 text-brand-primary" />
                <span className="text-xs font-bold text-content-primary uppercase tracking-wider">
                  2B. Actual Received Pallets Breakdown
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface-secondary text-content-secondary border border-divider">
                  {palletRows.length} Pallet{palletRows.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                {invPallets > 0 && (
                  <button
                    type="button"
                    onClick={handleAutoPopulatePalletRows}
                    className="px-2.5 py-1 rounded-lg bg-surface border border-divider hover:bg-surface-secondary text-content-secondary hover:text-content-primary text-xs font-medium flex items-center space-x-1 cursor-pointer transition-colors"
                    title={`Auto-generate ${invPallets} pallet rows matching Received Pallets`}
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Auto-Fill Rows ({invPallets})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAddPalletRow}
                  className="px-2.5 py-1 rounded-lg bg-surface border border-divider hover:bg-surface-secondary text-brand-primary text-xs font-semibold flex items-center space-x-1 cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Pallet</span>
                </button>
              </div>
            </div>

            {/* LIVE HELPER STRIP */}
            <div className="p-2.5 rounded-lg bg-surface-secondary/60 border border-divider text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2 text-content-secondary">
                <span>Pallet Rows: <strong className="text-content-primary">{palletRows.length}</strong></span>
                <span>•</span>
                <span>Rows Total: <strong className="text-content-primary font-mono">{totalPalletRowsQty} u</strong></span>
                <span>•</span>
                <span>Received: <strong className="text-content-primary font-mono">{invBatteries} u</strong></span>
              </div>

              <div>
                {palletRows.length === 0 ? (
                  <span className="text-[11px] text-content-muted">
                    Auto-split across {invPallets || 1} pallet(s) if rows not added
                  </span>
                ) : receiptMode === 'SHORT_FALL' ? (
                  totalPalletRowsQty === invBatteries ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 font-semibold text-[11px] border border-emerald-500/20">
                      ✓ Matches Received ({invBatteries} u) — {shortfallSummary.sfBatteries} u short
                    </span>
                  ) : totalPalletRowsQty === shortfallSummary.enteringBatteries ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 font-semibold text-[11px] border border-emerald-500/20">
                      ✓ Matches Floor Stock ({shortfallSummary.enteringBatteries} u)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 font-semibold text-[11px] border border-amber-500/20">
                      ⚠️ Rows ({totalPalletRowsQty} u) vs Received ({invBatteries} u) | Shortfall: {shortfallSummary.sfBatteries} u
                    </span>
                  )
                ) : totalPalletRowsQty === invBatteries ? (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 font-semibold text-[11px] border border-emerald-500/20">
                    ✓ Matches Received ({invBatteries} u)
                  </span>
                ) : totalPalletRowsQty < invBatteries ? (
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 font-semibold text-[11px] border border-amber-500/20">
                    ⚠️ {invBatteries - totalPalletRowsQty} u unassigned
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-700 font-semibold text-[11px] border border-rose-500/20">
                    ⚠️ +{totalPalletRowsQty - invBatteries} u over received
                  </span>
                )}
              </div>
            </div>

            {/* PALLET ROWS GRID */}
            {palletRows.length === 0 ? (
              <div className="py-3 px-4 rounded-lg bg-surface-secondary/30 border border-dashed border-divider text-center text-xs text-content-muted">
                No individual pallet rows added. Click <strong className="text-content-primary">"Auto-Fill Rows"</strong> or <strong className="text-content-primary">"+ Add Pallet"</strong> to specify real pallet numbers (e.g. 5644, 5645) and exact unit counts.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {palletRows.map((row, idx) => (
                  <div
                    key={row.id}
                    className="p-2.5 rounded-lg bg-surface-secondary/40 border border-divider/80 grid grid-cols-12 gap-2 items-center text-xs"
                  >
                    <div className="col-span-1 text-content-muted font-mono font-medium text-[11px]">
                      #{idx + 1}
                    </div>

                    <div className="col-span-6 sm:col-span-5">
                      <label className="block text-[10px] text-content-secondary font-medium mb-0.5">
                        Pallet No. <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={row.palletNumber}
                        onChange={(e) => handleUpdatePalletRow(row.id, 'palletNumber', e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-divider text-content-primary font-mono outline-none focus:border-brand-primary"
                      />
                    </div>

                    <div className="col-span-4 sm:col-span-5">
                      <label className="block text-[10px] text-content-secondary font-medium mb-0.5">
                        Qty (Units) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={row.qty}
                        onChange={(e) => handleUpdatePalletRow(row.id, 'qty', e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-divider text-content-primary font-mono font-bold outline-none focus:border-brand-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>

                    <div className="col-span-1 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemovePalletRow(row.id)}
                        className="p-1.5 text-content-muted hover:text-red-600 transition-colors cursor-pointer"
                        title="Remove pallet row"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 3: GATE-IN & TRANSPORT LOGISTICS */}
          <div className="bg-surface border border-divider rounded-xl p-4 space-y-3 shadow-xs">
            <div className="flex items-center space-x-2 pb-2 border-b border-divider/60">
              <span className="text-xs font-bold text-content-primary uppercase tracking-wider">
                3. Gate-In & Haulier Details
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div>
                <label className="block text-content-secondary font-medium mb-1">
                  Truck Reporting Date
                </label>
                <input
                  type="text"
                  value={truckReportingDate}
                  onChange={(e) => setTruckReportingDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary font-mono outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-content-secondary font-medium mb-1">
                  Carting In Date
                </label>
                <input
                  type="text"
                  value={cartingInDate}
                  onChange={(e) => setCartingInDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary font-mono outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-content-secondary font-medium mb-1">
                  Vehicle / Truck No.
                </label>
                <input
                  type="text"
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary font-mono outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-content-secondary font-medium mb-1">
                  Carting Slip / Gate Pass
                </label>
                <input
                  type="text"
                  value={cartingSlipNo}
                  onChange={(e) => setCartingSlipNo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-content-secondary font-medium mb-1">
                  Remarks / Notes
                </label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: RECEIPT MODE TOGGLE */}
          <div className="bg-surface border border-divider rounded-xl p-4 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-divider/60">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-brand-primary" />
                <span className="text-xs font-bold text-content-primary uppercase tracking-wider">
                  4. Physical Receipt Mode
                </span>
              </div>
              <div className="flex items-center space-x-1.5 p-1 bg-surface-secondary rounded-lg border border-divider/60">
                <button
                  type="button"
                  onClick={() => setReceiptMode('RECEIVED_FULL')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    receiptMode === 'RECEIVED_FULL'
                      ? 'bg-surface text-emerald-600 shadow-xs'
                      : 'text-content-secondary hover:text-content-primary'
                  }`}
                >
                  Received Full
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReceiptMode('SHORT_FALL');
                    if (shortfallRows.length === 0) {
                      handleAddShortfallRow();
                    }
                  }}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    receiptMode === 'SHORT_FALL'
                      ? 'bg-surface text-amber-600 shadow-xs'
                      : 'text-content-secondary hover:text-content-primary'
                  }`}
                >
                  Short Fall
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptMode('SHORT_FILL')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    receiptMode === 'SHORT_FILL'
                      ? 'bg-surface text-blue-600 shadow-xs'
                      : 'text-content-secondary hover:text-content-primary'
                  }`}
                >
                  Short Fill
                </button>
              </div>
            </div>

            {/* MODE: RECEIVED_FULL */}
            {receiptMode === 'RECEIVED_FULL' && (
              <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs flex items-center justify-between">
                <div className="flex items-center space-x-2 text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    100% Full Gate-In: All <strong>{invPallets} pallets</strong> ({invBatteries || 0} units) will enter active floor stock.
                  </span>
                </div>
                <span className="text-[11px] font-mono font-semibold text-emerald-700">
                  0 shortfall
                </span>
              </div>
            )}

            {/* MODE: SHORT_FALL */}
            {receiptMode === 'SHORT_FALL' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-content-secondary">
                    Specify which pallet(s) or unit quantities fell short from the factory. Only physically received units will enter available floor stock.
                  </p>
                  <button
                    type="button"
                    onClick={handleAddShortfallRow}
                    className="px-2.5 py-1 rounded-lg bg-surface border border-divider hover:bg-surface-secondary text-brand-primary text-xs font-semibold flex items-center space-x-1 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Shortfall Row</span>
                  </button>
                </div>

                {/* Shortfall Rows Table */}
                <div className="space-y-2">
                  {shortfallRows.map((row, idx) => (
                    <div
                      key={row.id}
                      className="p-3 rounded-xl bg-surface-secondary/50 border border-divider/80 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center text-xs"
                    >
                      <div className="sm:col-span-1 text-content-muted font-mono font-medium">
                        #{idx + 1}
                      </div>

                      <div className="sm:col-span-4">
                        <label className="block text-[10px] text-content-secondary font-medium mb-0.5">
                          Shortfall Type
                        </label>
                        <select
                          value={row.mode}
                          onChange={(e) =>
                            handleUpdateShortfallRow(row.id, {
                              mode: e.target.value as ShortfallMode
                            })
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-divider text-content-primary font-medium outline-none cursor-pointer"
                        >
                          <option value="PALLET">Pallet (Full Pallet Missing)</option>
                          <option value="UNITS">Units (Partial Units Missing)</option>
                        </select>
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-[10px] text-content-secondary font-medium mb-0.5">
                          Pallet No. <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={row.palletNumber}
                          onChange={(e) => handleUpdateShortfallRow(row.id, { palletNumber: e.target.value })}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-divider text-content-primary font-mono outline-none"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-[10px] text-content-secondary font-medium mb-0.5">
                          Shortfall Units <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          required
                          value={row.shortfallUnits || ''}
                          onChange={(e) =>
                            handleUpdateShortfallRow(row.id, {
                              shortfallUnits: Math.max(0, parseInt(e.target.value, 10) || 0)
                            })
                          }
                          onWheel={(e) => e.currentTarget.blur()}
                          className="w-full px-2.5 py-1.5 rounded-lg border font-mono font-bold bg-surface border-amber-300 text-amber-700 outline-none focus:ring-1 focus:ring-amber-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        {row.mode === 'PALLET' && (
                          <div className="mt-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-700 font-medium text-[10px] flex items-center justify-between">
                            <span>Full Pallet Short</span>
                            <span className="font-mono font-bold">0 Recd</span>
                          </div>
                        )}
                      </div>

                      <div className="sm:col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveShortfallRow(row.id)}
                          className="p-1.5 text-content-muted hover:text-red-600 transition-colors cursor-pointer"
                          title="Remove row"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Shortfall Live Summary Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="p-2.5 rounded-lg bg-surface-secondary/60 border border-divider text-xs">
                    <span className="text-[10px] text-content-muted uppercase block">Total Invoiced</span>
                    <span className="font-mono font-bold text-content-primary">
                      {invPallets} Pallets • {invBatteries} Units
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
                    <span className="text-[10px] text-emerald-700 uppercase font-semibold block">Entering Floor Stock</span>
                    <span className="font-mono font-bold text-emerald-700">
                      {shortfallSummary.enteringPallets} Pallets • {shortfallSummary.enteringBatteries} Units
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
                    <span className="text-[10px] text-amber-700 uppercase font-semibold block">Total Shortfall Recorded</span>
                    <span className="font-mono font-bold text-amber-700">
                      {shortfallSummary.sfPallets} Pallets • {shortfallSummary.sfBatteries} Units
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* MODE: SHORT_FILL */}
            {receiptMode === 'SHORT_FILL' && (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs flex items-start space-x-2 text-blue-700">
                  <LinkIcon className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Short Fill links this incoming shipment to reconcile a prior shortfall invoice. You can clear part or all of the pending shortfall units.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-content-secondary font-medium mb-1">
                      Prior Shortfall Invoice <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedPriorInvoiceNo}
                      onChange={(e) => {
                        const inv = e.target.value;
                        setSelectedPriorInvoiceNo(inv);
                        const found = openShortfallEntries.find((ent) => ent.customInvoiceNo === inv);
                        const firstOpen = found?.shortfalls?.find((sf) => sf.status !== 'CLEARED');
                        setShortFillPalletNumber(firstOpen ? String(firstOpen.palletNumber) : '');
                        const remUnits = found?.shortfallBatteries || firstOpen?.remainingShortfallUnits || 0;
                        setShortFillUnitsStr(String(remUnits));
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-surface border border-divider text-content-primary font-mono outline-none cursor-pointer"
                    >
                      <option value="">-- Select Prior Shortfall Invoice --</option>
                      {openShortfallEntries.map((ent) => (
                        <option key={ent.id} value={ent.customInvoiceNo}>
                          {ent.customInvoiceNo} — {ent.customer} ({ent.shortfallBatteries || 0} units pending)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-content-secondary font-medium mb-1">
                      Shortfall Pallet Reference
                    </label>
                    <input
                      type="text"
                      value={shortFillPalletNumber}
                      onChange={(e) => setShortFillPalletNumber(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-surface border border-divider text-content-primary font-mono outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-content-secondary font-medium mb-1">
                      Units to Fill <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={priorRemainingShortfallUnits || undefined}
                      value={shortFillUnitsStr}
                      onChange={(e) => setShortFillUnitsStr(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full px-3 py-2 rounded-lg bg-surface border border-divider text-content-primary font-mono font-bold text-blue-600 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    {priorRemainingShortfallUnits > 0 && (
                      <span className="text-[10px] text-content-muted mt-0.5 block">
                        Max available to fill: {priorRemainingShortfallUnits} units
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ACTION BUTTONS */}
          <div className="pt-3 border-t border-divider flex items-center justify-end space-x-2.5">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg border border-divider hover:bg-surface-secondary text-content-secondary hover:text-content-primary text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Recording Inward...' : 'Confirm Stock-Inward'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
