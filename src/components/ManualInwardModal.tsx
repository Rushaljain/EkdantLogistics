// Ekdant Logistics - Manual Inward Pop-Up Modal (Prompt 2)
// Structured multi-column Excel-header entry with Point X manual exact weights,
// Shortfall builder (PALLET vs UNITS), and Multi-Short-Fill reconciliation flow.

import React, { useState, useMemo } from 'react';
import {
  X,
  Minus,
  Maximize2,
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

export interface ShortFillPalletRow {
  id: string;
  shortfallPalletNumber: string;
  palletNumberChanged: boolean;
  arrivedPalletNumber: string;
  unitsFilled: number | '';
  regularUnits: number | '';
}

interface ShortfallRowState {
  id: string;
  mode: ShortfallMode;
  palletNumber: string;
  billedUnits: number | '';
  shortfallUnits: number | '';
}

export function ManualInwardModal({
  isOpen,
  onClose,
  onSuccess
}: ManualInwardModalProps): React.JSX.Element | null {
  // Fresh entries fetched whenever modal opens
  const existingEntries = useMemo(() => {
    if (!isOpen) return [];
    return getCFSLedgerEntries();
  }, [isOpen]);

  // Distinct known customers
  const knownCustomers = useMemo(() => {
    const set = new Set<string>();
    existingEntries.forEach((e) => {
      if (e.customer && e.customer.trim()) set.add(e.customer.trim());
    });
    return Array.from(set).sort();
  }, [existingEntries]);

  // Helper to compute remaining shortfall units for any ledger entry
  const getEntryRemainingShortfallUnits = (e: CFSLedgerEntry): number => {
    if (e.shortfalls && e.shortfalls.length > 0) {
      return e.shortfalls.reduce(
        (sum, sf) => sum + (sf.status !== 'CLEARED' && (sf.remainingShortfallUnits ?? sf.shortfallUnits) > 0 ? (sf.remainingShortfallUnits ?? sf.shortfallUnits) : 0),
        0
      );
    }
    return e.shortfallBatteries || 0;
  };

  // All prior invoices (both dispatched and yet to be dispatched) available for selection
  const allPriorInvoices = useMemo(() => {
    return existingEntries
      .filter((e) => e.customInvoiceNo && e.customInvoiceNo.trim())
      .sort((a, b) => {
        // Prioritize invoices with open/pending shortfalls at top
        const remA = getEntryRemainingShortfallUnits(a);
        const remB = getEntryRemainingShortfallUnits(b);
        if (remA > 0 && remB === 0) return -1;
        if (remB > 0 && remA === 0) return 1;
        return a.customInvoiceNo.localeCompare(b.customInvoiceNo);
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
  const [invoicedStockPalletsStr, setInvoicedStockPalletsStr] = useState<string>('');
  const [invoicedStockBatteriesStr, setInvoicedStockBatteriesStr] = useState<string>('');

  // Multi-Row Short Fill Pallet Builder (when mode === 'SHORT_FILL')
  const [selectedPriorInvoiceNo, setSelectedPriorInvoiceNo] = useState<string>('');
  const [shortFillRows, setShortFillRows] = useState<ShortFillPalletRow[]>([]);

  // Validation Error State
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Minimise / Floating Drawer State
  const [isMinimised, setIsMinimised] = useState(false);

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
    setInvoicedStockPalletsStr('');
    setInvoicedStockBatteriesStr('');
    setSelectedPriorInvoiceNo('');
    setShortFillRows([]);
    setIsMinimised(false);
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

  // Average units per pallet for pallet rows
  const defaultUnitsPerPallet = invPallets > 0 && invBatteries > 0 ? Math.floor(invBatteries / invPallets) : '';

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
    const defaultUnits = invPallets > 0 && invBatteries > 0 ? Math.floor(invBatteries / invPallets) : '';
    setShortfallRows((prev) => [
      ...prev,
      {
        id: `sf_row_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        mode: 'PALLET',
        palletNumber: String(nextPalletNum),
        billedUnits: defaultUnits,
        shortfallUnits: defaultUnits
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
        const updated = { ...r, ...updates };
        if (updated.mode === 'PALLET') {
          // Full pallet missing: shortfallUnits equals billedUnits
          if (updates.billedUnits !== undefined) {
            updated.shortfallUnits = updates.billedUnits;
          } else if (updates.mode !== undefined) {
            updated.shortfallUnits = updated.billedUnits;
          }
        }
        return updated;
      })
    );
  };

  // Summary Metrics for Shortfall Mode - Uses exact shortfallUnits entered on rows
  const shortfallSummary = useMemo(() => {
    let sfPallets = 0;
    let sfBatteries = 0;

    shortfallRows.forEach((r) => {
      if (r.mode === 'PALLET') {
        sfPallets += 1;
        const b = typeof r.billedUnits === 'number' ? r.billedUnits : (typeof r.shortfallUnits === 'number' ? r.shortfallUnits : 0);
        sfBatteries += b;
      } else {
        sfBatteries += typeof r.shortfallUnits === 'number' ? r.shortfallUnits : 0;
      }
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
    return allPriorInvoices.find((e) => e.customInvoiceNo.trim().toUpperCase() === selectedPriorInvoiceNo.trim().toUpperCase()) || null;
  }, [selectedPriorInvoiceNo, allPriorInvoices]);

  // Open shortfall pallets in selected prior invoice (with fallback to all pallets on that invoice)
  const openShortfallPallets = useMemo(() => {
    if (!priorEntry) return [];
    if (priorEntry.shortfalls && priorEntry.shortfalls.length > 0) {
      const openSfs = priorEntry.shortfalls.filter((sf) => sf.status !== 'CLEARED' && (sf.remainingShortfallUnits ?? sf.shortfallUnits) > 0);
      if (openSfs.length > 0) return openSfs;
    }
    if ((priorEntry.shortfallBatteries || 0) > 0) {
      return [
        {
          id: `sf_synth_${priorEntry.id}`,
          mode: 'UNITS' as const,
          palletNumber: '1',
          billedUnits: priorEntry.shortfallBatteries || 0,
          shortfallUnits: priorEntry.shortfallBatteries || 0,
          remainingShortfallUnits: priorEntry.shortfallBatteries || 0,
          openedDate: priorEntry.invoiceDate || '',
          openedMonth: priorEntry.month || '',
          status: 'OPEN' as const,
          linkedShortFills: []
        }
      ];
    }
    // Fallback: If prior invoice had no explicit shortfalls, list all its pallets so any pallet can be reconciled
    if (priorEntry.pallets && priorEntry.pallets.length > 0) {
      return priorEntry.pallets.map((p, idx) => ({
        id: `sf_plt_${priorEntry.id}_${p.palletNumber || idx + 1}`,
        mode: 'UNITS' as const,
        palletNumber: p.palletNumber || idx + 1,
        billedUnits: p.invoicedBatteries || p.remainingUnits || 0,
        shortfallUnits: p.invoicedBatteries || p.remainingUnits || 0,
        remainingShortfallUnits: p.invoicedBatteries || p.remainingUnits || 0,
        openedDate: priorEntry.invoiceDate || '',
        openedMonth: priorEntry.month || '',
        status: 'OPEN' as const,
        linkedShortFills: []
      }));
    }
    // Final fallback: synthesize pallet rows up to invoicedPallets
    const numPlts = Math.max(1, priorEntry.invoicedPallets || 1);
    const avgUnits = Math.round((priorEntry.invoicedBatteries || 0) / numPlts);
    return Array.from({ length: numPlts }, (_, i) => ({
      id: `sf_synth_${priorEntry.id}_${i + 1}`,
      mode: 'UNITS' as const,
      palletNumber: String(i + 1),
      billedUnits: avgUnits,
      shortfallUnits: avgUnits,
      remainingShortfallUnits: avgUnits,
      openedDate: priorEntry.invoiceDate || '',
      openedMonth: priorEntry.month || '',
      status: 'OPEN' as const,
      linkedShortFills: []
    }));
  }, [priorEntry]);

  // Remaining shortfall units in selected prior invoice
  const priorRemainingShortfallUnits = useMemo(() => {
    if (!priorEntry) return 0;
    return getEntryRemainingShortfallUnits(priorEntry);
  }, [priorEntry]);

  // Multi-row Short Fill Handlers
  const handleSelectPriorInvoice = (invNo: string) => {
    setSelectedPriorInvoiceNo(invNo);
    const found = allPriorInvoices.find((ent) => ent.customInvoiceNo.trim().toUpperCase() === invNo.trim().toUpperCase());
    if (!found) {
      setShortFillRows([]);
      return;
    }

    const openPallets = (found.shortfalls || []).filter((sf) => sf.status !== 'CLEARED' && (sf.remainingShortfallUnits ?? sf.shortfallUnits) > 0);
    if (openPallets.length > 0) {
      const firstSf = openPallets[0];
      setShortFillRows([
        {
          id: `sfr_${Date.now()}_1`,
          shortfallPalletNumber: String(firstSf.palletNumber),
          palletNumberChanged: false,
          arrivedPalletNumber: '',
          unitsFilled: firstSf.remainingShortfallUnits ?? firstSf.shortfallUnits,
          regularUnits: 0
        }
      ]);
    } else if ((found.shortfallBatteries || 0) > 0) {
      setShortFillRows([
        {
          id: `sfr_${Date.now()}_1`,
          shortfallPalletNumber: '1',
          palletNumberChanged: false,
          arrivedPalletNumber: '',
          unitsFilled: found.shortfallBatteries || 0,
          regularUnits: 0
        }
      ]);
    } else {
      // Prior invoice without pre-existing shortfall records: allow reconciling against any pallet
      const firstPltNum = found.pallets?.[0]?.palletNumber ? String(found.pallets[0].palletNumber) : '1';
      setShortFillRows([
        {
          id: `sfr_${Date.now()}_1`,
          shortfallPalletNumber: firstPltNum,
          palletNumberChanged: false,
          arrivedPalletNumber: '',
          unitsFilled: '',
          regularUnits: 0
        }
      ]);
    }
  };

  const handleAddShortFillRow = () => {
    const usedPallets = new Set(shortFillRows.map((r) => String(r.shortfallPalletNumber)));
    const nextPallet = openShortfallPallets.find((sf) => !usedPallets.has(String(sf.palletNumber))) || openShortfallPallets[0];

    setShortFillRows((prev) => [
      ...prev,
      {
        id: `sfr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        shortfallPalletNumber: nextPallet ? String(nextPallet.palletNumber) : '',
        palletNumberChanged: false,
        arrivedPalletNumber: '',
        unitsFilled: nextPallet ? (nextPallet.remainingShortfallUnits ?? nextPallet.shortfallUnits) : '',
        regularUnits: 0
      }
    ]);
  };

  const handleRemoveShortFillRow = (rowId: string) => {
    setShortFillRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  const handleUpdateShortFillRow = (rowId: string, updates: Partial<ShortFillPalletRow>) => {
    setShortFillRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const updated = { ...r, ...updates };
        if (updates.shortfallPalletNumber && updates.shortfallPalletNumber !== r.shortfallPalletNumber) {
          const targetSf = openShortfallPallets.find((sf) => String(sf.palletNumber).trim() === String(updates.shortfallPalletNumber).trim());
          if (targetSf) {
            updated.unitsFilled = targetSf.remainingShortfallUnits ?? targetSf.shortfallUnits;
          }
        }
        return updated;
      })
    );
  };

  // Summary Metrics for Short Fill Mode
  const shortFillSummary = useMemo(() => {
    let totalShortFillUnits = 0;
    let totalRegularUnits = 0;

    shortFillRows.forEach((r) => {
      totalShortFillUnits += typeof r.unitsFilled === 'number' ? r.unitsFilled : 0;
      totalRegularUnits += typeof r.regularUnits === 'number' ? r.regularUnits : 0;
    });

    const totalEnteringUnits = totalShortFillUnits + totalRegularUnits;
    const distinctPalletsCount = shortFillRows.length;

    return {
      totalShortFillUnits,
      totalRegularUnits,
      totalEnteringUnits,
      distinctPalletsCount
    };
  }, [shortFillRows]);

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

    const effectiveUnits = invBatteries > 0 ? invBatteries : (receiptMode === 'SHORT_FILL' ? shortFillSummary.totalEnteringUnits : 0);
    const effectivePallets = invPallets > 0 ? invPallets : (receiptMode === 'SHORT_FILL' ? shortFillSummary.distinctPalletsCount : 0);

    if (effectivePallets <= 0) {
      setErrorMsg('Received Pallets must be greater than 0.');
      return;
    }
    if (effectiveUnits <= 0) {
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
      : receiptMode === 'SHORT_FILL' && shortFillRows.length > 0
      ? shortFillRows.map((r, idx) => {
          const pNum = r.palletNumberChanged && r.arrivedPalletNumber.trim()
            ? r.arrivedPalletNumber.trim()
            : (r.shortfallPalletNumber.trim() || String(idx + 1));
          const totalUnits = (Number(r.unitsFilled) || 0) + (Number(r.regularUnits) || 0);
          return {
            palletNumber: pNum,
            model: 'STANDARD',
            invoicedBatteries: totalUnits,
            receivedBatteries: totalUnits
          };
        })
      : undefined;

    // Shortfall specific validation - Includes Invoiced Units and Shortfall Units
    let mappedShortfallInputs: ManualInwardShortfallInput[] | undefined = undefined;
    if (receiptMode === 'SHORT_FALL') {
      if (shortfallRows.length === 0) {
        setErrorMsg('Short Fall mode selected: Please add at least one shortfall row, or switch to Received Full.');
        return;
      }
      for (let i = 0; i < shortfallRows.length; i++) {
        const row = shortfallRows[i];
        if (!row.palletNumber.trim()) {
          setErrorMsg(`Shortfall row #${i + 1}: Pallet Number is required.`);
          return;
        }
        const bUnits = typeof row.billedUnits === 'number' ? row.billedUnits : 0;
        const sfUnits = typeof row.shortfallUnits === 'number' ? row.shortfallUnits : 0;
        if (bUnits <= 0) {
          setErrorMsg(`Pallet ${row.palletNumber}: Please enter a valid number of Invoiced Units greater than 0.`);
          return;
        }
        if (sfUnits <= 0) {
          setErrorMsg(`Pallet ${row.palletNumber}: Please enter a valid number of Shortfall Units greater than 0.`);
          return;
        }
        if (row.mode === 'UNITS' && sfUnits >= bUnits) {
          setErrorMsg(`Pallet ${row.palletNumber}: For a partial units shortfall, shortfall units (${sfUnits}) must be less than invoiced units (${bUnits}). For a full pallet shortfall, choose "Pallet" mode.`);
          return;
        }
      }

      mappedShortfallInputs = shortfallRows.map((r) => {
        const bUnits = typeof r.billedUnits === 'number' ? r.billedUnits : (typeof r.shortfallUnits === 'number' ? r.shortfallUnits : 0);
        const sfUnits = typeof r.shortfallUnits === 'number' ? r.shortfallUnits : bUnits;
        return {
          mode: r.mode,
          palletNumber: r.palletNumber.trim(),
          billedUnits: bUnits,
          shortfallUnits: sfUnits
        };
      });
    }

    // Short Fill specific validation
    let mappedShortFillInputs: ManualInwardShortFillInput[] | undefined = undefined;
    if (receiptMode === 'SHORT_FILL') {
      if (!selectedPriorInvoiceNo) {
        setErrorMsg('Short Fill mode selected: Please select a prior shortfall invoice to reconcile.');
        return;
      }
      if (shortFillRows.length === 0) {
        setErrorMsg('Short Fill mode selected: Please add at least one short-fill pallet row.');
        return;
      }

      for (let i = 0; i < shortFillRows.length; i++) {
        const row = shortFillRows[i];
        if (!row.shortfallPalletNumber) {
          setErrorMsg(`Short-fill row #${i + 1}: Please select a shortfall pallet.`);
          return;
        }
        if (row.palletNumberChanged && !row.arrivedPalletNumber.trim()) {
          setErrorMsg(`Short-fill row #${i + 1}: Arrived Pallet No. is required when "Pallet number changed" is toggled on.`);
          return;
        }
        const filled = typeof row.unitsFilled === 'number' ? row.unitsFilled : 0;
        if (filled <= 0) {
          setErrorMsg(`Short-fill row #${i + 1}: Please enter positive Short-Fill Units greater than 0.`);
          return;
        }

        const targetSf = openShortfallPallets.find((sf) => String(sf.palletNumber).trim() === String(row.shortfallPalletNumber).trim());
        const maxAllowed = targetSf ? (targetSf.remainingShortfallUnits ?? targetSf.shortfallUnits) : priorRemainingShortfallUnits;
        if (maxAllowed > 0 && filled > maxAllowed) {
          setErrorMsg(`Short-fill row #${i + 1} (Pallet ${row.shortfallPalletNumber}): Units filled (${filled}) cannot exceed remaining shortfall (${maxAllowed} units).`);
          return;
        }
      }

      mappedShortFillInputs = shortFillRows.map((r) => ({
        priorShortfallInvoiceNo: selectedPriorInvoiceNo,
        priorShortfallLedgerId: priorEntry?.id,
        palletNumber: r.shortfallPalletNumber,
        arrivedPalletNumber: r.palletNumberChanged && r.arrivedPalletNumber.trim() ? r.arrivedPalletNumber.trim() : undefined,
        unitsFilled: typeof r.unitsFilled === 'number' ? r.unitsFilled : 0,
        regularUnits: typeof r.regularUnits === 'number' ? r.regularUnits : 0
      }));
    }

    setIsSubmitting(true);
    try {
      const computedShortfallInvoicedPallets = invoicedStockPalletsStr.trim()
        ? (parseInt(invoicedStockPalletsStr, 10) || 0)
        : (invPallets + shortfallSummary.sfPallets);

      const computedShortfallInvoicedBatteries = invoicedStockBatteriesStr.trim()
        ? (parseInt(invoicedStockBatteriesStr, 10) || 0)
        : (invBatteries + shortfallSummary.sfBatteries);

      const finalInvoicedPallets = receiptMode === 'SHORT_FALL'
        ? computedShortfallInvoicedPallets
        : (mappedPallets ? Math.max(effectivePallets, mappedPallets.length) : effectivePallets);

      const finalInvoicedBatteries = receiptMode === 'SHORT_FALL'
        ? computedShortfallInvoicedBatteries
        : effectiveUnits;

      const inwardParams: RecordManualInwardParams = {
        customer: trimmedCustomer,
        exporterShipper: exporterShipper.trim(),
        customInvoiceNo: trimmedInvoice,
        invoiceDate: invoiceDate.trim(),
        pod: pod.trim(),
        receiptMode,
        invoicedPallets: finalInvoicedPallets,
        invoicedBatteries: finalInvoicedBatteries,
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

  // MINIMISED FLOATING DRAWER BAR
  if (isMinimised) {
    return (
      <div className="fixed bottom-5 right-6 z-50 animate-fade-in font-sans">
        <div className="bg-surface border border-brand-primary/40 shadow-2xl rounded-2xl p-3 flex items-center space-x-3.5 max-w-md w-full ring-2 ring-brand-primary/20 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setIsMinimised(false)}
            className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold shrink-0 hover:bg-emerald-500/20 transition-colors cursor-pointer"
            title="Click to restore full form"
          >
            <ArrowDownToLine className="w-4 h-4" />
          </button>
          <div
            className="min-w-0 flex-1 cursor-pointer select-none"
            onClick={() => setIsMinimised(false)}
            title="Click to restore full form"
          >
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-content-primary truncate">
                Inward: {customInvoiceNo.trim() ? customInvoiceNo.trim() : 'New Entry'}
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Minimised
              </span>
            </div>
            <div className="text-[11px] text-content-secondary truncate">
              {invPallets > 0 ? `${invPallets} plts` : '0 plts'}
              {invBatteries > 0 ? ` • ${invBatteries} units` : ''}
              {customer ? ` • ${customer}` : ''}
            </div>
          </div>
          <div className="flex items-center space-x-1 shrink-0">
            <button
              type="button"
              onClick={() => setIsMinimised(false)}
              className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-secondary transition-colors cursor-pointer"
              title="Restore / Maximise"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-lg text-content-muted hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              title="Close & Discard"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

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
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={() => setIsMinimised(true)}
              className="p-1 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-secondary transition-colors cursor-pointer"
              title="Minimise"
            >
              <Minus className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="p-1 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-secondary transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
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
                {/* FACTORY INVOICED STOCK & QUANTITIES PANEL */}
                <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-800/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-blue-900 dark:text-blue-300 uppercase tracking-wider">
                      Factory Invoiced Stock &amp; Quantities
                    </span>
                    <span className="text-[10px] text-blue-700 dark:text-blue-400 font-medium">
                      Physically Inwarded: {invPallets} Plts • {invBatteries} Units
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[10px] text-blue-800 dark:text-blue-300 font-medium mb-1">
                        Invoiced Pallets <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={invoicedStockPalletsStr}
                        onChange={(e) => setInvoicedStockPalletsStr(e.target.value)}
                        placeholder={String(invPallets + shortfallSummary.sfPallets)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-divider text-content-primary font-mono font-bold outline-none focus:border-brand-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-[10px] text-content-muted mt-0.5 block">
                        Received ({invPallets}) + Shortfall ({shortfallSummary.sfPallets}) = {invPallets + shortfallSummary.sfPallets} Plts
                      </span>
                    </div>
                    <div>
                      <label className="block text-[10px] text-blue-800 dark:text-blue-300 font-medium mb-1">
                        Invoiced Units / Batteries <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={invoicedStockBatteriesStr}
                        onChange={(e) => setInvoicedStockBatteriesStr(e.target.value)}
                        placeholder={String(invBatteries + shortfallSummary.sfBatteries)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-divider text-content-primary font-mono font-bold outline-none focus:border-brand-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-[10px] text-content-muted mt-0.5 block">
                        Received ({invBatteries}) + Shortfall ({shortfallSummary.sfBatteries}) = {invBatteries + shortfallSummary.sfBatteries} Units
                      </span>
                    </div>
                  </div>
                </div>

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
                      className="p-3 rounded-xl bg-surface-secondary/50 border border-divider/80 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs"
                    >
                      <div className="sm:col-span-1 text-content-muted font-mono font-medium">
                        #{idx + 1}
                      </div>

                      <div className="sm:col-span-3">
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

                      <div className="sm:col-span-2">
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

                      <div className="sm:col-span-2">
                        <label className="block text-[10px] text-content-secondary font-medium mb-0.5">
                          Invoiced Units <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          required
                          value={row.billedUnits !== undefined ? row.billedUnits : ''}
                          onChange={(e) => {
                            const val = e.target.value.trim() ? Math.max(1, parseInt(e.target.value, 10) || 1) : '';
                            handleUpdateShortfallRow(row.id, {
                              billedUnits: val,
                              ...(row.mode === 'PALLET' ? { shortfallUnits: val } : {})
                            });
                          }}
                          onWheel={(e) => e.currentTarget.blur()}
                          placeholder="e.g. 100"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-divider text-content-primary font-mono font-medium outline-none focus:border-brand-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[10px] text-content-secondary font-medium mb-0.5">
                          Shortfall Units <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          required
                          disabled={row.mode === 'PALLET'}
                          value={row.mode === 'PALLET' ? (row.billedUnits !== undefined ? row.billedUnits : (row.shortfallUnits || '')) : (row.shortfallUnits !== undefined ? row.shortfallUnits : '')}
                          onChange={(e) => {
                            const val = e.target.value.trim() ? Math.max(1, parseInt(e.target.value, 10) || 1) : '';
                            handleUpdateShortfallRow(row.id, { shortfallUnits: val });
                          }}
                          onWheel={(e) => e.currentTarget.blur()}
                          className={`w-full px-2.5 py-1.5 rounded-lg border font-mono font-bold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                            row.mode === 'PALLET'
                              ? 'bg-surface-secondary text-content-muted border-divider/60 cursor-not-allowed'
                              : 'bg-surface border-amber-300 text-amber-700 focus:ring-1 focus:ring-amber-500'
                          }`}
                        />
                      </div>

                      <div className="sm:col-span-1 text-center">
                        <label className="block text-[10px] text-content-muted font-medium mb-0.5 uppercase">
                          Recd
                        </label>
                        <div className={`px-1.5 py-1 rounded font-mono font-bold text-xs ${row.mode === 'PALLET' ? 'bg-amber-500/10 text-amber-700' : 'bg-emerald-500/10 text-emerald-700'}`}>
                          {row.mode === 'PALLET'
                            ? '0 u'
                            : `${Math.max(0, (Number(row.billedUnits) || 0) - (Number(row.shortfallUnits) || 0))} u`}
                        </div>
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
              </div>
            )}

            {/* MODE: SHORT_FILL */}
            {receiptMode === 'SHORT_FILL' && (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs flex items-start space-x-2 text-blue-700">
                  <LinkIcon className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Short Fill links this incoming shipment to reconcile open shortfall pallets from a prior invoice. You can reconcile multiple pallets at once, note changed pallet numbers, and specify additional regular stock arriving on the same pallet.
                  </span>
                </div>

                {/* 1. Prior Shortfall Invoice Dropdown */}
                <div className="bg-surface-secondary/50 border border-divider/80 rounded-xl p-3.5 space-y-1.5">
                  <label className="block text-xs font-semibold text-content-primary">
                    1. Select Prior Shortfall Invoice <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedPriorInvoiceNo}
                    onChange={(e) => handleSelectPriorInvoice(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-surface border border-divider text-content-primary font-mono text-xs outline-none cursor-pointer focus:border-brand-primary"
                  >
                    <option value="">-- Select Prior Invoice ({allPriorInvoices.length} Available) --</option>
                    {allPriorInvoices.map((ent) => {
                      const rem = getEntryRemainingShortfallUnits(ent);
                      const isDispatched = (ent.actualStuffedPallets || 0) > 0 || (ent.balancePallets || 0) === 0;
                      const statusTag = isDispatched ? 'Dispatched' : 'In Warehouse';
                      const sfTag = rem > 0 ? ` • ${rem} u shortfall` : '';
                      return (
                        <option key={ent.id} value={ent.customInvoiceNo}>
                          {ent.customInvoiceNo} — {ent.customer || 'No Customer'} ({statusTag}{sfTag})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 2. Multi-Row Short-Fill Pallet Builder */}
                {selectedPriorInvoiceNo && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-content-primary uppercase tracking-wider">
                          2. Reconcile Shortfall Pallets
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          {shortFillRows.length} Pallet Row{shortFillRows.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddShortFillRow}
                        className="px-2.5 py-1 rounded-lg bg-surface border border-divider hover:bg-surface-secondary text-brand-primary text-xs font-semibold flex items-center space-x-1 cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Short-Fill Pallet Row</span>
                      </button>
                    </div>

                    {shortFillRows.length === 0 ? (
                      <div className="py-4 px-4 rounded-xl bg-surface-secondary/40 border border-dashed border-divider text-center text-xs text-content-muted">
                        No shortfall pallet rows added. Click <strong className="text-content-primary">"+ Add Short-Fill Pallet Row"</strong> to begin allocating arriving units.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {shortFillRows.map((row, idx) => {
                          const targetSf = openShortfallPallets.find((sf) => String(sf.palletNumber).trim() === String(row.shortfallPalletNumber).trim());
                          const maxRemaining = targetSf ? (targetSf.remainingShortfallUnits ?? targetSf.shortfallUnits) : priorRemainingShortfallUnits;
                          const totalPalletUnits = (Number(row.unitsFilled) || 0) + (Number(row.regularUnits) || 0);

                          return (
                            <div
                              key={row.id}
                              className="p-3.5 rounded-xl bg-surface-secondary/40 border border-divider space-y-3 text-xs"
                            >
                              <div className="flex items-center justify-between border-b border-divider/50 pb-2">
                                <div className="flex items-center space-x-2">
                                  <span className="font-mono font-bold text-brand-primary">Row #{idx + 1}</span>
                                  <span className="text-content-muted">•</span>
                                  <span className="text-[11px] text-content-secondary">
                                    Total Entering on Pallet: <strong className="text-content-primary font-mono">{totalPalletUnits} u</strong>
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveShortFillRow(row.id)}
                                  className="p-1 text-content-muted hover:text-red-600 transition-colors cursor-pointer"
                                  title="Remove short-fill row"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                                {/* Shortfall Pallet Dropdown */}
                                <div className="sm:col-span-4">
                                  <label className="block text-[10px] text-content-secondary font-medium mb-1">
                                    Shortfall Pallet <span className="text-red-500">*</span>
                                  </label>
                                  <select
                                    value={row.shortfallPalletNumber}
                                    onChange={(e) =>
                                      handleUpdateShortFillRow(row.id, {
                                        shortfallPalletNumber: e.target.value
                                      })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-divider text-content-primary font-mono text-xs outline-none cursor-pointer focus:border-brand-primary"
                                  >
                                    <option value="">-- Select Shortfall Pallet --</option>
                                    {openShortfallPallets.map((sf) => (
                                      <option key={sf.id} value={String(sf.palletNumber)}>
                                        PLT #{sf.palletNumber} ({sf.mode === 'PALLET' ? 'Full Pallet' : 'Partial'} · {sf.remainingShortfallUnits ?? sf.shortfallUnits} u remaining)
                                      </option>
                                    ))}
                                  </select>
                                  {targetSf && (
                                    <span className="text-[10px] text-amber-700 mt-0.5 block font-medium">
                                      Remaining: {maxRemaining} u short ({targetSf.mode === 'PALLET' ? 'Full Pallet' : 'Partial'})
                                    </span>
                                  )}
                                </div>

                                {/* Short-Fill Units Input */}
                                <div className="sm:col-span-3">
                                  <label className="block text-[10px] text-content-secondary font-medium mb-1">
                                    Short-Fill Units <span className="text-red-500">*</span>
                                  </label>
                                  <input
                                    type="number"
                                    min="1"
                                    max={maxRemaining || undefined}
                                    required
                                    value={row.unitsFilled}
                                    onChange={(e) =>
                                      handleUpdateShortFillRow(row.id, {
                                        unitsFilled: e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 0)
                                      })
                                    }
                                    onWheel={(e) => e.currentTarget.blur()}
                                    className="w-full px-2.5 py-1.5 rounded-lg border font-mono font-bold bg-surface border-blue-300 text-blue-700 outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                  <span className="text-[10px] text-content-muted mt-0.5 block">
                                    Max fill: {maxRemaining} u
                                  </span>
                                </div>

                                {/* Additional / Regular Units Input */}
                                <div className="sm:col-span-3">
                                  <label className="block text-[10px] text-content-secondary font-medium mb-1">
                                    Additional / Regular Units
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={row.regularUnits}
                                    onChange={(e) =>
                                      handleUpdateShortFillRow(row.id, {
                                        regularUnits: e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0)
                                      })
                                    }
                                    onWheel={(e) => e.currentTarget.blur()}
                                    className="w-full px-2.5 py-1.5 rounded-lg border font-mono font-medium bg-surface border-divider text-content-primary outline-none focus:border-brand-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                  <span className="text-[10px] text-content-muted mt-0.5 block">
                                    Regular stock (default 0)
                                  </span>
                                </div>

                                {/* Pallet Changed Toggle & Arrived Pallet Input */}
                                <div className="sm:col-span-2">
                                  <label className="flex items-center space-x-1.5 text-[10px] text-content-secondary font-medium mb-1 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={row.palletNumberChanged}
                                      onChange={(e) =>
                                        handleUpdateShortFillRow(row.id, {
                                          palletNumberChanged: e.target.checked,
                                          arrivedPalletNumber: e.target.checked ? row.arrivedPalletNumber : ''
                                        })
                                      }
                                      className="rounded border-divider text-brand-primary focus:ring-brand-primary cursor-pointer"
                                    />
                                    <span>Pallet No. Changed</span>
                                  </label>
                                  {row.palletNumberChanged ? (
                                    <input
                                      type="text"
                                      required
                                      value={row.arrivedPalletNumber}
                                      onChange={(e) =>
                                        handleUpdateShortFillRow(row.id, {
                                          arrivedPalletNumber: e.target.value
                                        })
                                      }
                                      placeholder="New Plt No."
                                      className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-amber-300 text-amber-800 font-mono text-xs outline-none focus:ring-1 focus:ring-amber-500"
                                    />
                                  ) : (
                                    <span className="text-[10px] text-content-muted block py-1.5">
                                      Keeps PLT #{row.shortfallPalletNumber || '—'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* 3. Short Fill Live Summary Strip */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
                        <span className="text-[10px] text-blue-700 uppercase font-semibold block">Short-Fill Units Applied</span>
                        <span className="font-mono font-bold text-blue-800">
                          {shortFillSummary.totalShortFillUnits} Units
                        </span>
                      </div>

                      <div className="p-2.5 rounded-lg bg-surface-secondary border border-divider text-xs">
                        <span className="text-[10px] text-content-secondary uppercase font-semibold block">Regular Units Added</span>
                        <span className="font-mono font-bold text-content-primary">
                          {shortFillSummary.totalRegularUnits} Units
                        </span>
                      </div>

                      <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
                        <span className="text-[10px] text-emerald-700 uppercase font-semibold block">Total Units Entering Floor Stock</span>
                        <span className="font-mono font-bold text-emerald-800">
                          {shortFillSummary.totalEnteringUnits} Units ({shortFillSummary.distinctPalletsCount} Pallets)
                        </span>
                      </div>
                    </div>
                  </div>
                )}
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
