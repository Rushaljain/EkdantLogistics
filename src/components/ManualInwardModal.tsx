// Ekdant Logistics - Manual Inward Pop-Up Modal
// Document-First SmartFill + Row-by-Row Tallying (Received, Shortfall, Shortfill)
// Strict Floor Inventory Hygiene (0 phantom stock, exact decimal weights, zero drift)

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { DateInput } from './DateInput.tsx';
import {
  X,
  Minus,
  Maximize2,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ArrowDownToLine,
  Boxes,
  RefreshCw,
  Sparkles,
  Loader2,
  Check,
  Pencil,
  Layers,
  Lock
} from 'lucide-react';
import type {
  CFSLedgerEntry,
  ReceiptMode,
  ExtractedShipmentJSON,
  PalletRowReceiptStatus,
  PartialReceiptLog
} from '../types/index.ts';
import {
  getCFSLedgerEntries,
  recordManualInward,
  cleanInvoiceNumber,
  getSuppliedShortFillsForInvoice,
  type ManualInwardShortfallInput,
  type ManualInwardShortFillInput,
  type RecordManualInwardParams,
  toExactWeight,
  formatToDDMMYYYY
} from '../utils/inventoryStore.ts';
import { parseDocumentsToJSON } from '../utils/documentParser.ts';

interface ManualInwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newEntry: CFSLedgerEntry) => void;
  editingEntry?: CFSLedgerEntry | null;
  initialShortfallInvoiceNo?: string;
}

export interface InwardPalletRow {
  id: string;
  palletNumber: string;
  model: string;
  billedUnits: number | '';
  grossWeightKg?: number;
  netWeightKg?: number;
  receiptStatus: PalletRowReceiptStatus;
  // Multi-part intake tracking
  partialReceipts?: PartialReceiptLog[];
  currentArrivalDate?: string;
  currentReceivedUnits?: number | '';
  // Shortfall options
  isFullMissing?: boolean;
  shortfallUnits?: number | '';
  // Shortfill options
  priorInvoiceNo?: string;
  priorShortfallPalletNumber?: string;
  shortfillEntirePallet?: boolean;
  shortfillUnits?: number | '';
  regularUnits?: number;
  palletNumberChanged?: boolean;
  arrivedPalletNumber?: string;
  // Per-pallet Saved state
  isSaved?: boolean;
}

export function ManualInwardModal({
  isOpen,
  onClose,
  onSuccess,
  editingEntry,
  initialShortfallInvoiceNo
}: ManualInwardModalProps): React.JSX.Element | null {
  // Fresh entries fetched whenever modal opens
  const existingEntries = useMemo(() => {
    if (!isOpen) return [];
    return getCFSLedgerEntries();
  }, [isOpen]);

  const isReadOnly = Boolean(
    editingEntry && (
      (editingEntry.actualStuffedPallets || 0) > 0 ||
      (editingEntry.pallets && editingEntry.pallets.length > 0 && editingEntry.pallets.every((p) => p.status === 'STUFFED_DISPATCHED')) ||
      (editingEntry.balancePallets === 0 && (editingEntry.actualStuffedBatteries || 0) > 0)
    )
  );

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
        (sum, sf) =>
          sum +
          (sf.status !== 'CLEARED' && (sf.remainingShortfallUnits ?? sf.shortfallUnits) > 0
            ? sf.remainingShortfallUnits ?? sf.shortfallUnits
            : 0),
        0
      );
    }
    return e.shortfallBatteries || 0;
  };

  // All prior invoices (both dispatched and in CFS) available for selection, prioritizing open shortfalls
  const allPriorInvoices = useMemo(() => {
    return existingEntries
      .filter((e) => e.customInvoiceNo && e.customInvoiceNo.trim())
      .sort((a, b) => {
        const remA = getEntryRemainingShortfallUnits(a);
        const remB = getEntryRemainingShortfallUnits(b);
        if (remA > 0 && remB === 0) return -1;
        if (remB > 0 && remA === 0) return 1;
        return a.customInvoiceNo.localeCompare(b.customInvoiceNo);
      });
  }, [existingEntries]);

  // Invoices with open shortfalls (for shortfill dropdown)
  const openShortfallInvoices = useMemo(() => {
    return allPriorInvoices.filter((e) => getEntryRemainingShortfallUnits(e) > 0);
  }, [allPriorInvoices]);

  // Document Upload & SmartFill State
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isParsingDoc, setIsParsingDoc] = useState(false);
  const [parsingProgressMsg, setParsingProgressMsg] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [pendingSmartFill, setPendingSmartFill] = useState<ExtractedShipmentJSON | null>(null);
  const [showSmartFillPrompt, setShowSmartFillPrompt] = useState(false);

  // Form State: Commercial Identity & Consignee
  const [customInvoiceNo, setCustomInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [customer, setCustomer] = useState('');
  const [consigneeAddress, setConsigneeAddress] = useState('');
  const [exporterShipper, setExporterShipper] = useState('');
  const [pod, setPod] = useState('');

  // Form State: Invoiced Quantities & Exact Weights
  const [invoicedPalletsStr, setInvoicedPalletsStr] = useState('');
  const [invoicedBatteriesStr, setInvoicedBatteriesStr] = useState('');
  const [manualGrossWeightKgStr, setManualGrossWeightKgStr] = useState('');
  const [manualNetWeightKgStr, setManualNetWeightKgStr] = useState('');

  // Form State: Gate-In & Haulier Logistics
  const [truckReportingDate, setTruckReportingDate] = useState('');
  const [cartingInDate, setCartingInDate] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [cartingSlipNo, setCartingSlipNo] = useState('');
  const [remarks, setRemarks] = useState('');

  // Form State: Pallet Rows Breakdown
  const [palletRows, setPalletRows] = useState<InwardPalletRow[]>([]);

  // Validation & Submission State
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMinimised, setIsMinimised] = useState(false);

  // Clean reset form state
  const resetForm = () => {
    setCustomInvoiceNo('');
    setInvoiceDate('');
    setCustomer('');
    setConsigneeAddress('');
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
    setIsMinimised(false);
    setErrorMsg(null);
    setUploadedFileName('');
    setPendingSmartFill(null);
    setShowSmartFillPrompt(false);
    setIsParsingDoc(false);
    setParsingProgressMsg('');
  };

  // Prepopulate form when editing an existing inward
  useEffect(() => {
    if (!isOpen) return;
    if (editingEntry) {
      setCustomInvoiceNo(editingEntry.customInvoiceNo || '');
      setInvoiceDate(editingEntry.invoiceDate || editingEntry.cartingInDate || '');
      setCustomer(editingEntry.customer || '');
      setConsigneeAddress(editingEntry.consigneeAddress || editingEntry.sourceShipmentJson?.consigneeAddress || '');
      setExporterShipper(editingEntry.exporterShipper || '');
      setPod(editingEntry.pod || '');
      setInvoicedPalletsStr(String(editingEntry.invoicedPallets || ''));
      setInvoicedBatteriesStr(String(editingEntry.invoicedBatteries || ''));
      setManualGrossWeightKgStr(String(editingEntry.invoicedGrossWeightKg || editingEntry.actualGrossWeightKg || ''));
      setManualNetWeightKgStr(
        editingEntry.invoicedNetWeightKg !== undefined
          ? String(editingEntry.invoicedNetWeightKg)
          : editingEntry.actualNetWeightKg !== undefined
          ? String(editingEntry.actualNetWeightKg)
          : ''
      );
      setTruckReportingDate(editingEntry.truckReportingDate || editingEntry.cartingInDate || '');
      setCartingInDate(editingEntry.cartingInDate || '');
      setVehicleNo(editingEntry.vehicleNo || '');
      setCartingSlipNo(editingEntry.shippingBillNo || '');
      setRemarks(editingEntry.remarks || '');

      if (editingEntry.pallets && editingEntry.pallets.length > 0) {
        const rows: InwardPalletRow[] = editingEntry.pallets.map((p, idx) => {
          const sf = editingEntry.shortfalls?.find(
            (s) => String(s.palletNumber).trim() === String(p.palletNumber).trim()
          );
          const sfi = editingEntry.shortFillLinks?.find(
            (s) => String(s.palletNumber).trim() === String(p.palletNumber).trim() ||
                   String(s.arrivedPalletNumber).trim() === String(p.palletNumber).trim()
          );

          let receiptStatus: PalletRowReceiptStatus = 'RECEIVED';
          let isFullMissing = false;
          let shortfallUnits: number | '' = '';
          let priorInvoiceNo = '';
          let priorShortfallPalletNumber = '';
          let shortfillUnits: number | '' = '';
          let regularUnits = 0;

          const bUnits = p.invoicedBatteries || p.receivedBatteries || 0;

          if (p.receiptStatus === 'NOT_RECEIVED' || (p.status === 'PENDING_GATE_IN' && !sf)) {
            receiptStatus = 'NOT_RECEIVED';
          } else if (p.receiptStatus === 'PARTIALLY_RECEIVED' || ((p.pendingUnits || 0) > 0 && !sf)) {
            receiptStatus = 'PARTIALLY_RECEIVED';
          } else if (sf) {
            receiptStatus = 'SHORTFALL';
            isFullMissing = sf.mode === 'PALLET';
            shortfallUnits = sf.shortfallUnits;
          } else if (sfi) {
            receiptStatus = 'SHORTFILL';
            priorInvoiceNo = sfi.priorShortfallInvoiceNo;
            priorShortfallPalletNumber = String(sfi.palletNumber);
            shortfillUnits = sfi.unitsFilled;
            regularUnits = Math.max(0, bUnits - sfi.unitsFilled);
          }

          return {
            id: p.id || `plt_row_${Date.now()}_${idx}`,
            palletNumber: String(p.palletNumber),
            model: p.model || 'STANDARD',
            billedUnits: bUnits,
            grossWeightKg: p.grossWeightKg,
            netWeightKg: p.netWeightKg,
            receiptStatus,
            partialReceipts: p.partialReceipts || [],
            currentReceivedUnits: (p.partialReceipts && p.partialReceipts.length > 0) ? '' : (p.receivedBatteries || ''),
            currentArrivalDate: editingEntry.cartingInDate || '',
            isFullMissing,
            shortfallUnits,
            priorInvoiceNo,
            priorShortfallPalletNumber,
            shortfillEntirePallet: isFullMissing || (typeof shortfillUnits === 'number' && shortfillUnits === bUnits),
            shortfillUnits,
            regularUnits,
            palletNumberChanged: Boolean(sfi?.arrivedPalletNumber && String(sfi.arrivedPalletNumber) !== String(sfi.palletNumber)),
            arrivedPalletNumber: sfi?.arrivedPalletNumber ? String(sfi.arrivedPalletNumber) : '',
            isSaved: true
          };
        });
        setPalletRows(rows);
      }
    }
  }, [isOpen, editingEntry]);

  // Pre-configure shortfill row when launched specifically to record a shortfill for a prior invoice
  useEffect(() => {
    if (!isOpen || editingEntry || !initialShortfallInvoiceNo) return;
    const cleanTarget = cleanInvoiceNumber(initialShortfallInvoiceNo);
    const targetEntry = allPriorInvoices.find(
      (e) => cleanInvoiceNumber(e.customInvoiceNo) === cleanTarget
    );
    if (!targetEntry) return;

    const openPlts = getOpenPalletsForInvoice(targetEntry.customInvoiceNo);
    const firstPlt = openPlts[0];
    const remUnits = firstPlt
      ? (firstPlt.remainingShortfallUnits ?? firstPlt.shortfallUnits)
      : (targetEntry.shortfallBatteries || 0);

    setCustomer(targetEntry.customer || '');
    setConsigneeAddress(targetEntry.consigneeAddress || '');
    setExporterShipper(targetEntry.exporterShipper || '');
    setPod(targetEntry.pod || '');

    setPalletRows([
      {
        id: `plt_row_${Date.now()}_shortfill_0`,
        palletNumber: firstPlt ? String(firstPlt.palletNumber) : '1',
        model: 'STANDARD',
        billedUnits: remUnits,
        receiptStatus: 'SHORTFILL',
        isFullMissing: false,
        shortfallUnits: '',
        priorInvoiceNo: targetEntry.customInvoiceNo,
        priorShortfallPalletNumber: firstPlt ? String(firstPlt.palletNumber) : '1',
        shortfillEntirePallet: true,
        shortfillUnits: remUnits,
        regularUnits: 0,
        palletNumberChanged: false,
        arrivedPalletNumber: '',
        isSaved: true
      }
    ]);
  }, [isOpen, editingEntry, initialShortfallInvoiceNo, allPriorInvoices]);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Top Invoiced Numbers
  const invPallets = parseInt(invoicedPalletsStr, 10) || 0;
  const invBatteries = parseInt(invoicedBatteriesStr, 10) || 0;
  const grossKg = parseFloat(manualGrossWeightKgStr) || 0;
  const netKg = manualNetWeightKgStr.trim() ? parseFloat(manualNetWeightKgStr) : undefined;

  // -------------------------------------------------------------
  // DOCUMENT UPLOAD & SMARTFILL LOGIC (Supports multiple documents)
  // -------------------------------------------------------------
  const processUploadedFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setErrorMsg(null);
    setIsParsingDoc(true);
    const summaryLabel = files.length > 1
      ? `${files.length} documents (${files.map(f => f.name).join(', ')})`
      : files[0].name;
    setParsingProgressMsg(`Extracting ${summaryLabel}...`);
    try {
      const customKey = localStorage.getItem('ekdant_custom_gemini_key') || undefined;
      const result = await parseDocumentsToJSON(
        files,
        'SINGLE_INVOICE',
        customKey,
        (progress) => {
          setParsingProgressMsg(progress.message || 'Extracting data...');
        }
      );

      if (result.shipmentJson) {
        setUploadedFileName(summaryLabel);
        setPendingSmartFill(result.shipmentJson);
        setShowSmartFillPrompt(true);
      } else {
        setErrorMsg('Document parsed without shipment data. Please verify file.');
      }
    } catch (err: any) {
      setErrorMsg(`Document parsing failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsParsingDoc(false);
      setParsingProgressMsg('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processUploadedFiles(Array.from(e.target.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUploadedFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleApplySmartFill = () => {
    if (!pendingSmartFill) return;

    if (pendingSmartFill.invoiceNumbers && pendingSmartFill.invoiceNumbers.length > 0) {
      setCustomInvoiceNo(pendingSmartFill.invoiceNumbers[0].toUpperCase());
    }
    if (pendingSmartFill.invoiceDates && pendingSmartFill.invoiceDates.length > 0) {
      setInvoiceDate(pendingSmartFill.invoiceDates[0]);
    }
    if (pendingSmartFill.consigneeName) {
      setCustomer(pendingSmartFill.consigneeName);
    }
    if (pendingSmartFill.consigneeAddress) {
      setConsigneeAddress(pendingSmartFill.consigneeAddress);
    }
    if (pendingSmartFill.shipperName) {
      setExporterShipper(pendingSmartFill.shipperName);
    }
    if (pendingSmartFill.portOfDischarge) {
      setPod(pendingSmartFill.portOfDischarge);
    }

    const docPallets = pendingSmartFill.pallets || [];
    const docPalletCount = pendingSmartFill.totalPallets || docPallets.length;
    const docBoxesCount =
      pendingSmartFill.totalBoxes ||
      docPallets.reduce((s, p) => s + (p.boxCount || 0), 0) ||
      pendingSmartFill.totalPackages;

    if (docPalletCount > 0) {
      setInvoicedPalletsStr(String(docPalletCount));
    }
    if (docBoxesCount > 0) {
      setInvoicedBatteriesStr(String(docBoxesCount));
    }
    const sumDocPalletNet = docPallets.reduce((s, p) => s + (p.netWeightKg || 0), 0);
    const sumDocPalletGross = docPallets.reduce((s, p) => s + (p.grossWeightKg || 0), 0);

    if (sumDocPalletGross > 0 && sumDocPalletGross > (pendingSmartFill.grossWeightKg || 0)) {
      setManualGrossWeightKgStr(String(toExactWeight(sumDocPalletGross)));
    } else if (pendingSmartFill.grossWeightKg > 0) {
      setManualGrossWeightKgStr(String(toExactWeight(pendingSmartFill.grossWeightKg)));
    }

    if (sumDocPalletNet > 0 && (pendingSmartFill.netWeightKg === 0 || sumDocPalletNet > pendingSmartFill.netWeightKg)) {
      setManualNetWeightKgStr(String(toExactWeight(sumDocPalletNet)));
    } else if (pendingSmartFill.netWeightKg > 0) {
      setManualNetWeightKgStr(String(toExactWeight(pendingSmartFill.netWeightKg)));
    }

    // Populate pallet rows directly from document
    if (docPallets.length > 0) {
      const rows: InwardPalletRow[] = docPallets.map((p, idx) => ({
        id: `plt_row_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        palletNumber: String(p.palletNumber || idx + 1),
        model: p.modelCode || 'STANDARD',
        billedUnits: p.boxCount || '',
        grossWeightKg: p.grossWeightKg ? toExactWeight(p.grossWeightKg) : undefined,
        netWeightKg: p.netWeightKg ? toExactWeight(p.netWeightKg) : undefined,
        receiptStatus: 'RECEIVED',
        isFullMissing: false,
        shortfallUnits: '',
        priorInvoiceNo: '',
        priorShortfallPalletNumber: '',
        shortfillEntirePallet: false,
        shortfillUnits: '',
        regularUnits: 0,
        palletNumberChanged: false,
        arrivedPalletNumber: ''
      }));
      setPalletRows(rows);
    } else if (docPalletCount > 0) {
      const avgUnits = docBoxesCount > 0 ? Math.floor(docBoxesCount / docPalletCount) : 0;
      const remainder = docBoxesCount > 0 ? docBoxesCount - avgUnits * docPalletCount : 0;
      const rows: InwardPalletRow[] = [];
      for (let i = 1; i <= docPalletCount; i++) {
        const units = i === docPalletCount ? avgUnits + remainder : avgUnits;
        rows.push({
          id: `plt_row_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          palletNumber: String(i),
          model: 'STANDARD',
          billedUnits: units > 0 ? units : '',
          receiptStatus: 'RECEIVED',
          isFullMissing: false,
          shortfallUnits: '',
          priorInvoiceNo: '',
          priorShortfallPalletNumber: '',
          shortfillEntirePallet: false,
          shortfillUnits: '',
          regularUnits: 0,
          palletNumberChanged: false,
          arrivedPalletNumber: ''
        });
      }
      setPalletRows(rows);
    }

    setShowSmartFillPrompt(false);
  };

  const handleDismissSmartFill = () => {
    setShowSmartFillPrompt(false);
  };

  // -------------------------------------------------------------
  // PALLET ROW HANDLERS
  // -------------------------------------------------------------
  const handleAddPalletRow = () => {
    const nextPalletNum = palletRows.length + 1;
    setPalletRows((prev) => [
      ...prev,
      {
        id: `plt_row_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        palletNumber: String(nextPalletNum),
        model: '',
        billedUnits: '',
        netWeightKg: undefined,
        grossWeightKg: undefined,
        receiptStatus: 'RECEIVED',
        isFullMissing: false,
        shortfallUnits: '',
        priorInvoiceNo: '',
        priorShortfallPalletNumber: '',
        shortfillEntirePallet: false,
        shortfillUnits: '',
        regularUnits: 0,
        palletNumberChanged: false,
        arrivedPalletNumber: ''
      }
    ]);
  };

  const handleRemovePalletRow = (rowId: string) => {
    setPalletRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  const handleUpdatePalletRow = (rowId: string, updates: Partial<InwardPalletRow>) => {
    setPalletRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const updated = { ...r, ...updates };

        // If status switches to SHORTFALL: default to partial unless specified
        if (updates.receiptStatus === 'SHORTFALL' && r.receiptStatus !== 'SHORTFALL') {
          updated.isFullMissing = false;
          updated.shortfallUnits = '';
        }

        // If toggling full pallet missing
        if (updates.isFullMissing !== undefined) {
          if (updates.isFullMissing) {
            updated.shortfallUnits = updated.billedUnits;
          } else {
            updated.shortfallUnits = '';
          }
        }

        // If status switches to SHORTFILL: preselect prior invoice if available
        if (updates.receiptStatus === 'SHORTFILL' && r.receiptStatus !== 'SHORTFILL') {
          if (!updated.priorInvoiceNo && openShortfallInvoices.length > 0) {
            const firstInv = openShortfallInvoices[0];
            updated.priorInvoiceNo = firstInv.customInvoiceNo;
            const openPlts = (firstInv.shortfalls || []).filter(
              (sf) => sf.status !== 'CLEARED' && (sf.remainingShortfallUnits ?? sf.shortfallUnits) > 0
            );
            if (openPlts.length > 0) {
              updated.priorShortfallPalletNumber = String(openPlts[0].palletNumber);
              updated.shortfillUnits = openPlts[0].remainingShortfallUnits ?? openPlts[0].shortfallUnits;
            }
          }
          updated.regularUnits = 0;
        }

        return updated;
      })
    );
  };

  const handleAutoPopulatePalletRows = () => {
    if (invPallets <= 0) return;
    const avgUnits = invBatteries > 0 ? Math.floor(invBatteries / invPallets) : 0;
    const remainder = invBatteries > 0 ? invBatteries - avgUnits * invPallets : 0;
    const avgNet = netKg && invPallets > 0 ? toExactWeight(netKg / invPallets) : undefined;
    const avgGross = grossKg > 0 && invPallets > 0 ? toExactWeight(grossKg / invPallets) : undefined;

    const newRows: InwardPalletRow[] = [];
    for (let i = 1; i <= invPallets; i++) {
      const units = i === invPallets ? avgUnits + remainder : avgUnits;
      newRows.push({
        id: `plt_row_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
        palletNumber: String(i),
        model: 'STANDARD',
        billedUnits: units > 0 ? units : '',
        netWeightKg: avgNet,
        grossWeightKg: avgGross,
        receiptStatus: 'RECEIVED',
        isFullMissing: false,
        shortfallUnits: '',
        priorInvoiceNo: '',
        priorShortfallPalletNumber: '',
        shortfillEntirePallet: false,
        shortfillUnits: '',
        regularUnits: 0,
        palletNumberChanged: false,
        arrivedPalletNumber: ''
      });
    }
    setPalletRows(newRows);
  };

  // Helper to get open shortfall pallets for a specific prior invoice
  const getOpenPalletsForInvoice = (invNo?: string) => {
    if (!invNo) return [];
    const targetClean = cleanInvoiceNumber(invNo);
    const entry = allPriorInvoices.find(
      (e) => cleanInvoiceNumber(e.customInvoiceNo) === targetClean
    );
    if (!entry) return [];

    if (entry.shortfalls && entry.shortfalls.length > 0) {
      const openSfs = entry.shortfalls.filter(
        (sf) => sf.status !== 'CLEARED' && (sf.remainingShortfallUnits ?? sf.shortfallUnits) > 0
      );
      if (openSfs.length > 0) return openSfs;
    }

    if ((entry.shortfallBatteries || 0) > 0) {
      return [
        {
          id: `sf_synth_${entry.id}`,
          mode: 'UNITS' as const,
          palletNumber: '1',
          billedUnits: entry.shortfallBatteries || 0,
          shortfallUnits: entry.shortfallBatteries || 0,
          remainingShortfallUnits: entry.shortfallBatteries || 0,
          openedDate: entry.invoiceDate || '',
          openedMonth: entry.month || '',
          status: 'OPEN' as const,
          linkedShortFills: []
        }
      ];
    }

    return [];
  };

  // -------------------------------------------------------------
  // LIVE SUMMARY FOOTER METRICS
  // -------------------------------------------------------------
  const summaryMetrics = useMemo(() => {
    if (palletRows.length === 0) {
      const gKg = parseFloat(manualGrossWeightKgStr) || 0;
      const nKg = parseFloat(manualNetWeightKgStr) || 0;
      const tKg = gKg >= nKg && nKg > 0 ? toExactWeight(gKg - nKg) : 0;
      return {
        totalInvoicedPallets: invPallets,
        totalInvoicedUnits: invBatteries,
        floorPallets: invPallets,
        floorUnits: invBatteries,
        pendingPallets: 0,
        pendingUnits: 0,
        shortfallPallets: 0,
        shortfallUnits: 0,
        shortfillPallets: 0,
        shortfillUnits: 0,
        totalNetWeightSum: nKg,
        totalGrossWeightSum: gKg,
        totalPalletTareSum: tKg
      };
    }

    let invoicedUnitsSum = 0;
    let floorPalletsCount = 0;
    let floorUnitsSum = 0;
    let pendingPalletsCount = 0;
    let pendingUnitsSum = 0;
    let shortfallPalletsCount = 0;
    let shortfallUnitsSum = 0;
    let shortfillPalletsCount = 0;
    let shortfillUnitsSum = 0;

    let netWeightSum = 0;
    let grossWeightSum = 0;
    let palletTareSum = 0;

    palletRows.forEach((row) => {
      const bUnits = typeof row.billedUnits === 'number' ? row.billedUnits : 0;
      invoicedUnitsSum += bUnits;

      const pGross = typeof row.grossWeightKg === 'number' ? row.grossWeightKg : (parseFloat(String(row.grossWeightKg || '')) || 0);
      const pNet = typeof row.netWeightKg === 'number' ? row.netWeightKg : (parseFloat(String(row.netWeightKg || '')) || 0);
      netWeightSum += pNet;
      grossWeightSum += pGross;
      if (pGross >= pNet && pNet > 0) {
        palletTareSum += (pGross - pNet);
      }

      if (row.receiptStatus === 'RECEIVED') {
        floorPalletsCount += 1;
        floorUnitsSum += bUnits;
      } else if (row.receiptStatus === 'NOT_RECEIVED') {
        pendingPalletsCount += 1;
        pendingUnitsSum += bUnits;
      } else if (row.receiptStatus === 'PARTIALLY_RECEIVED') {
        const landedUnits = row.partialReceipts && row.partialReceipts.length > 0
          ? row.partialReceipts.reduce((sum, r) => sum + (r.unitsReceived || 0), 0)
          : (typeof row.currentReceivedUnits === 'number' ? row.currentReceivedUnits : 0);
        const pendUnits = Math.max(0, bUnits - landedUnits);
        if (landedUnits > 0) floorPalletsCount += 1;
        floorUnitsSum += landedUnits;
        if (pendUnits > 0) {
          pendingUnitsSum += pendUnits;
          if (landedUnits === 0) pendingPalletsCount += 1;
        }
      } else if (row.receiptStatus === 'SHORTFALL') {
        if (row.isFullMissing) {
          shortfallPalletsCount += 1;
          shortfallUnitsSum += bUnits;
          // 0 units and 0 pallets enter floor stock
        } else {
          floorPalletsCount += 1;
          const sfUnits = typeof row.shortfallUnits === 'number' ? row.shortfallUnits : 0;
          const recdUnits = Math.max(0, bUnits - sfUnits);
          floorUnitsSum += recdUnits;
          shortfallUnitsSum += sfUnits;
        }
      } else if (row.receiptStatus === 'SHORTFILL') {
        floorPalletsCount += 1;
        shortfillPalletsCount += 1;
        const fillUnits = typeof row.shortfillUnits === 'number' ? row.shortfillUnits : 0;
        const regUnits = typeof row.regularUnits === 'number' ? row.regularUnits : 0;
        const enteringUnits = fillUnits + regUnits;
        floorUnitsSum += enteringUnits;
        shortfillUnitsSum += fillUnits;
      }
    });

    const totalInvoicedPallets = Math.max(
      invPallets,
      palletRows.filter((r) => r.receiptStatus !== 'SHORTFILL').length
    );
    const totalInvoicedUnits = Math.max(invBatteries, invoicedUnitsSum);

    return {
      totalInvoicedPallets,
      totalInvoicedUnits,
      floorPallets: floorPalletsCount,
      floorUnits: floorUnitsSum,
      pendingPallets: pendingPalletsCount,
      pendingUnits: pendingUnitsSum,
      shortfallPallets: shortfallPalletsCount,
      shortfallUnits: shortfallUnitsSum,
      shortfillPallets: shortfillPalletsCount,
      shortfillUnits: shortfillUnitsSum,
      totalNetWeightSum: toExactWeight(netWeightSum),
      totalGrossWeightSum: toExactWeight(grossWeightSum),
      totalPalletTareSum: toExactWeight(palletTareSum)
    };
  }, [palletRows, invPallets, invBatteries, manualGrossWeightKgStr, manualNetWeightKgStr]);

  // Auto-sync Net Wt input cell with the total breakdown net weight
  useEffect(() => {
    if (palletRows.length > 0 && summaryMetrics.totalNetWeightSum > 0) {
      const currentNet = parseFloat(manualNetWeightKgStr) || 0;
      if (Math.abs(summaryMetrics.totalNetWeightSum - currentNet) > 0.001) {
        setManualNetWeightKgStr(String(summaryMetrics.totalNetWeightSum));
      }
    }
  }, [summaryMetrics.totalNetWeightSum, palletRows.length, manualNetWeightKgStr]);

  // -------------------------------------------------------------
  // FORM SUBMISSION & MAPPING
  // -------------------------------------------------------------
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

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
    if (grossKg <= 0) {
      setErrorMsg('Manual Gross Weight (kg) is required and must be greater than 0.');
      return;
    }

    const hasRows = palletRows.length > 0;
    if (hasRows) {
      // Validate each row
      for (let i = 0; i < palletRows.length; i++) {
        const row = palletRows[i];
        if (!row.palletNumber.trim()) {
          setErrorMsg(`Pallet row #${i + 1}: Pallet Number is required.`);
          return;
        }

        if (row.receiptStatus === 'RECEIVED' || row.receiptStatus === 'NOT_RECEIVED' || row.receiptStatus === 'PARTIALLY_RECEIVED') {
          if (typeof row.billedUnits !== 'number' || row.billedUnits <= 0) {
            setErrorMsg(`Pallet ${row.palletNumber}: Please enter valid Billed Units greater than 0.`);
            return;
          }
        } else if (row.receiptStatus === 'SHORTFALL') {
          if (typeof row.billedUnits !== 'number' || row.billedUnits <= 0) {
            setErrorMsg(`Pallet ${row.palletNumber}: Please enter valid Invoiced / Billed Units greater than 0.`);
            return;
          }
          if (!row.isFullMissing) {
            const sfUnits = typeof row.shortfallUnits === 'number' ? row.shortfallUnits : 0;
            if (sfUnits <= 0) {
              setErrorMsg(`Pallet ${row.palletNumber}: Please enter Shortfall Units > 0 or check "Entire Pallet Not Received".`);
              return;
            }
            if (sfUnits >= row.billedUnits) {
              setErrorMsg(
                `Pallet ${row.palletNumber}: For partial missing units, shortfall units (${sfUnits}) must be less than billed units (${row.billedUnits}). For a full missing pallet, please check "Entire Pallet Not Received".`
              );
              return;
            }
          }
        } else if (row.receiptStatus === 'SHORTFILL') {
          if (!row.priorInvoiceNo) {
            setErrorMsg(`Pallet row #${i + 1}: Please select a Prior Shortfall Invoice to reconcile.`);
            return;
          }
          if (!row.priorShortfallPalletNumber) {
            setErrorMsg(`Pallet row #${i + 1}: Please select a Missing Shortfall Pallet.`);
            return;
          }
          const fillUnits = typeof row.shortfillUnits === 'number' ? row.shortfillUnits : 0;
          if (fillUnits <= 0) {
            setErrorMsg(`Pallet row #${i + 1}: Please enter Short-Fill Units greater than 0.`);
            return;
          }
          if (row.palletNumberChanged && !row.arrivedPalletNumber?.trim()) {
            setErrorMsg(`Pallet row #${i + 1}: Arrived Pallet No. is required when "Pallet number changed" is checked.`);
            return;
          }
        }
      }
    } else {
      if (invPallets <= 0) {
        setErrorMsg('Received Pallets must be greater than 0.');
        return;
      }
      if (invBatteries <= 0) {
        setErrorMsg('Received Units / Batteries must be greater than 0.');
        return;
      }
    }

    // Map physical floor pallets (only items that physically enter floor stock)
    const floorPallets: {
      palletNumber: string | number;
      model: string;
      brand?: string;
      invoicedBatteries: number;
      receivedBatteries: number;
      grossWeightKg?: number;
      netWeightKg?: number;
      receiptStatus?: PalletRowReceiptStatus;
      partialReceipts?: PartialReceiptLog[];
      pendingUnits?: number;
    }[] = [];

    const shortfallInputs: ManualInwardShortfallInput[] = [];
    const shortFillInputs: ManualInwardShortFillInput[] = [];

    if (hasRows) {
      palletRows.forEach((row, idx) => {
        const pNum = row.palletNumber.trim() || String(idx + 1);
        const bUnits = typeof row.billedUnits === 'number' ? row.billedUnits : 0;

        if (row.receiptStatus === 'RECEIVED') {
          floorPallets.push({
            palletNumber: pNum,
            model: row.model || 'STANDARD',
            invoicedBatteries: bUnits,
            receivedBatteries: bUnits,
            grossWeightKg: row.grossWeightKg,
            netWeightKg: row.netWeightKg,
            receiptStatus: 'RECEIVED',
            partialReceipts: [],
            pendingUnits: 0
          });
        } else if (row.receiptStatus === 'NOT_RECEIVED') {
          floorPallets.push({
            palletNumber: pNum,
            model: row.model || 'STANDARD',
            invoicedBatteries: bUnits,
            receivedBatteries: 0,
            grossWeightKg: 0,
            netWeightKg: 0,
            receiptStatus: 'NOT_RECEIVED',
            partialReceipts: [],
            pendingUnits: bUnits
          });
        } else if (row.receiptStatus === 'PARTIALLY_RECEIVED') {
          const landedUnits = row.partialReceipts && row.partialReceipts.length > 0
            ? row.partialReceipts.reduce((sum, r) => sum + (r.unitsReceived || 0), 0)
            : (typeof row.currentReceivedUnits === 'number' ? row.currentReceivedUnits : 0);
          const pendUnits = Math.max(0, bUnits - landedUnits);

          floorPallets.push({
            palletNumber: pNum,
            model: row.model || 'STANDARD',
            invoicedBatteries: bUnits,
            receivedBatteries: landedUnits,
            grossWeightKg: row.grossWeightKg,
            netWeightKg: row.netWeightKg,
            receiptStatus: 'PARTIALLY_RECEIVED',
            partialReceipts: row.partialReceipts || (landedUnits > 0 ? [{
              id: `pr_${Date.now()}_${idx}`,
              arrivalDate: row.currentArrivalDate || cartingInDate || formatToDDMMYYYY(new Date()),
              unitsReceived: landedUnits,
              recordedAt: new Date().toISOString()
            }] : []),
            pendingUnits: pendUnits
          });
        } else if (row.receiptStatus === 'SHORTFALL') {
          if (row.isFullMissing) {
            // Full pallet missing: DOES NOT enter floor stock! (0 phantom stock)
            shortfallInputs.push({
              mode: 'PALLET',
              palletNumber: pNum,
              billedUnits: bUnits,
              shortfallUnits: bUnits
            });
          } else {
            // Partial shortfall: received units enter floor, missing units enter backlog
            const sfUnits = typeof row.shortfallUnits === 'number' ? row.shortfallUnits : 0;
            const recdUnits = Math.max(0, bUnits - sfUnits);
            if (recdUnits > 0) {
              floorPallets.push({
                palletNumber: pNum,
                model: row.model || 'STANDARD',
                invoicedBatteries: bUnits,
                receivedBatteries: recdUnits,
                grossWeightKg: row.grossWeightKg,
                netWeightKg: row.netWeightKg
              });
            }
            if (sfUnits > 0) {
              shortfallInputs.push({
                mode: 'UNITS',
                palletNumber: pNum,
                billedUnits: bUnits,
                shortfallUnits: sfUnits
              });
            }
          }
        } else if (row.receiptStatus === 'SHORTFILL') {
          const fillUnits = typeof row.shortfillUnits === 'number' ? row.shortfillUnits : 0;
          const regUnits = typeof row.regularUnits === 'number' ? row.regularUnits : 0;
          const totalUnits = fillUnits + regUnits;
          const physicalPalletNo =
            row.palletNumberChanged && row.arrivedPalletNumber?.trim()
              ? row.arrivedPalletNumber.trim()
              : pNum;

          if (totalUnits > 0) {
            floorPallets.push({
              palletNumber: physicalPalletNo,
              model: row.model || 'STANDARD',
              invoicedBatteries: totalUnits,
              receivedBatteries: totalUnits,
              grossWeightKg: row.grossWeightKg,
              netWeightKg: row.netWeightKg
            });
          }

          if (row.priorInvoiceNo && fillUnits > 0) {
            const targetClean = cleanInvoiceNumber(row.priorInvoiceNo);
            const priorEntry = allPriorInvoices.find(
              (e) => cleanInvoiceNumber(e.customInvoiceNo) === targetClean
            );
            shortFillInputs.push({
              priorShortfallInvoiceNo: row.priorInvoiceNo,
              priorShortfallLedgerId: priorEntry?.id,
              palletNumber: row.priorShortfallPalletNumber || pNum,
              arrivedPalletNumber:
                row.palletNumberChanged && row.arrivedPalletNumber?.trim()
                  ? row.arrivedPalletNumber.trim()
                  : undefined,
              unitsFilled: fillUnits,
              regularUnits: regUnits
            });
          }
        }
      });
    }

    const finalInvoicedPallets = summaryMetrics.totalInvoicedPallets;
    const finalInvoicedBatteries = summaryMetrics.totalInvoicedUnits;

    let computedReceiptMode: ReceiptMode = 'RECEIVED_FULL';
    if (summaryMetrics.pendingUnits > 0) {
      computedReceiptMode = 'PARTIAL_INWARD';
    } else if (shortfallInputs.length > 0) {
      computedReceiptMode = 'SHORT_FALL';
    } else if (shortFillInputs.length > 0) {
      computedReceiptMode = 'SHORT_FILL';
    }

    setIsSubmitting(true);
    try {
      const inwardParams: RecordManualInwardParams = {
        existingEntryId: editingEntry?.id,
        customer: trimmedCustomer,
        consigneeAddress: consigneeAddress.trim() || (pendingSmartFill?.consigneeAddress || editingEntry?.consigneeAddress || ''),
        sourceShipmentJson: pendingSmartFill || editingEntry?.sourceShipmentJson,
        exporterShipper: exporterShipper.trim(),
        customInvoiceNo: trimmedInvoice,
        invoiceDate: invoiceDate.trim(),
        pod: pod.trim(),
        receiptMode: computedReceiptMode,
        invoicedPallets: finalInvoicedPallets,
        invoicedBatteries: finalInvoicedBatteries,
        invoicedGrossWeightKg: grossKg,
        invoicedNetWeightKg: netKg,
        actualGrossWeightKg: grossKg,
        actualNetWeightKg: netKg,
        cartingInDate: cartingInDate.trim(),
        vehicleNo: vehicleNo.trim().toUpperCase(),
        truckReportingDate: truckReportingDate.trim(),
        pallets: floorPallets.length > 0 ? floorPallets : undefined,
        shortfallInputs: shortfallInputs.length > 0 ? shortfallInputs : undefined,
        shortFillInputs: shortFillInputs.length > 0 ? shortFillInputs : undefined,
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
              {summaryMetrics.floorPallets > 0
                ? `${summaryMetrics.floorPallets} plts floor`
                : '0 plts'}
              {summaryMetrics.floorUnits > 0 ? ` • ${summaryMetrics.floorUnits} units` : ''}
              {summaryMetrics.shortfallUnits > 0
                ? ` • ${summaryMetrics.shortfallUnits} Units shortfall`
                : ''}
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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-fade-in">
      <div className="bg-surface border border-divider rounded-2xl max-w-[1500px] w-[96vw] max-h-[94vh] flex flex-col shadow-2xl overflow-hidden font-sans relative">
        {/* MODAL HEADER */}
        <div className="px-5 py-3 border-b border-divider flex items-center justify-between gap-4 bg-surface-secondary/40 shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold shrink-0">
              <ArrowDownToLine className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-content-primary tracking-tight flex items-center space-x-2">
                <span className="truncate">
                  {isReadOnly
                    ? 'View Inward Entry & Details'
                    : editingEntry
                    ? 'Edit Inward Entry & Verification'
                    : 'Stock-In / Inward Entry & Verification'}
                </span>
                {editingEntry && (
                  <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-brand-primary/10 text-brand-primary border border-brand-primary/30 shrink-0">
                    #{editingEntry.customInvoiceNo}
                  </span>
                )}
                {isReadOnly && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300 shrink-0 flex items-center space-x-1">
                    <Lock className="w-3 h-3 text-amber-600" />
                    <span>DISPATCHED (LOCKED)</span>
                  </span>
                )}
              </h2>
            </div>
          </div>

          {/* Compact Header Upload Section (Reference Img 1) */}
          <div className="flex items-center space-x-2 shrink-0">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              accept=".pdf,.xlsx,.xls,.doc,.docx,.csv,.txt"
              multiple
              className="hidden"
            />
            {isParsingDoc ? (
              <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-brand-primary/10 text-brand-primary text-xs font-medium border border-brand-primary/20">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{parsingProgressMsg || 'Analyzing...'}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-surface border border-divider hover:border-brand-primary/40 hover:bg-surface-secondary text-brand-primary font-semibold text-xs flex items-center space-x-1.5 cursor-pointer shadow-2xs transition-colors"
                title="Upload Packing List & Commercial Invoice to auto-fill"
              >
                <Sparkles className="w-3.5 h-3.5 text-brand-primary" />
                <span>Choose Document(s)</span>
              </button>
            )}

            <div className="h-4 w-px bg-divider mx-1" />

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

        {/* SMARTFILL CONFIRMATION PROMPT DIALOG */}
        {showSmartFillPrompt && pendingSmartFill && (
          <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface border border-emerald-500/30 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 animate-scale-up">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-content-primary">
                    Document Uploaded &amp; Parsed
                  </h3>
                  <p className="text-xs text-content-secondary font-mono truncate max-w-xs">
                    {uploadedFileName}
                  </p>
                </div>
              </div>

              {/* Extracted Details Snapshot */}
              <div className="p-3 rounded-xl bg-surface-secondary/70 border border-divider text-xs space-y-2">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-content-muted block">Invoice Number:</span>
                    <strong className="text-content-primary font-mono">
                      {pendingSmartFill.invoiceNumbers?.[0] || 'N/A'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-content-muted block">Customer / Consignee:</span>
                    <strong className="text-content-primary truncate block">
                      {pendingSmartFill.consigneeName || 'N/A'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-content-muted block">Total Pallets:</span>
                    <strong className="text-content-primary font-mono">
                      {pendingSmartFill.totalPallets || pendingSmartFill.pallets?.length || 0} Plts
                    </strong>
                  </div>
                  <div>
                    <span className="text-content-muted block">Total Units / Boxes:</span>
                    <strong className="text-content-primary font-mono">
                      {pendingSmartFill.totalBoxes ||
                        pendingSmartFill.pallets?.reduce((s, p) => s + (p.boxCount || 0), 0) ||
                        0}{' '}
                      Units
                    </strong>
                  </div>
                  <div>
                    <span className="text-content-muted block">Gross Weight:</span>
                    <strong className="text-content-primary font-mono">
                      {toExactWeight(pendingSmartFill.grossWeightKg)} kg
                    </strong>
                  </div>
                  <div>
                    <span className="text-content-muted block">Net Weight:</span>
                    <strong className="text-content-primary font-mono">
                      {pendingSmartFill.netWeightKg > 0
                        ? `${toExactWeight(pendingSmartFill.netWeightKg)} kg`
                        : '—'}
                    </strong>
                  </div>
                </div>
              </div>

              <p className="text-xs text-content-secondary">
                Document data is ready. How would you like to proceed with this inward entry?
              </p>

              <div className="flex items-center justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={handleDismissSmartFill}
                  className="px-3.5 py-2 rounded-lg border border-divider text-content-secondary hover:text-content-primary text-xs font-semibold hover:bg-surface-secondary transition-colors cursor-pointer"
                >
                  Proceed Manually
                </button>
                <button
                  type="button"
                  onClick={handleApplySmartFill}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>SmartFill Form</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FORM CONTENT (Scrollable) */}
        <form
          onSubmit={handleSubmit}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`overflow-y-auto p-4 sm:p-5 space-y-5 flex-1 transition-colors ${
            isDragOver ? 'bg-brand-primary/5 ring-2 ring-brand-primary ring-inset rounded-b-2xl' : ''
          }`}
        >
          {/* Dispatched Lock Banner */}
          {isReadOnly && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-950 flex items-center justify-between gap-3 animate-fade-in font-sans">
              <div className="flex items-center space-x-2.5">
                <Lock className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  <strong>Dispatched Shipment (Read-Only):</strong> This invoice has been stuffed into containers and dispatched. All fields are locked. To edit inward details, undo the dispatch first in <strong>Section 2: Status Logs</strong>.
                </span>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-xs flex items-start space-x-2 animate-fade-in">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <fieldset disabled={isReadOnly} className="contents">

          {/* SECTION 1: COMMERCIAL IDENTITY & CONSIGNEE */}
          <div className="space-y-2.5">
            <div className="flex items-center space-x-2 pb-1.5 border-b border-divider/60">
              <span className="text-xs font-bold text-content-primary uppercase tracking-wider">
                1. Commercial Identity &amp; Consignee
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs items-end">
              <div>
                <label className="block text-content-secondary font-medium mb-1 truncate" title="Custom Invoice No.">
                  Invoice No. <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={customInvoiceNo}
                  onChange={(e) => setCustomInvoiceNo(e.target.value.toUpperCase())}
                  className="w-full px-2.5 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary focus:ring-1 focus:ring-brand-primary text-content-primary font-mono font-medium outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-content-secondary font-medium mb-1">
                  Invoice Date
                </label>
                <DateInput
                  value={invoiceDate}
                  onChange={setInvoiceDate}
                />
              </div>

              <div>
                <label className="block text-content-secondary font-medium mb-1 truncate" title="Consignee / Customer">
                  Consignee / Customer <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  list="known-customers-list"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary outline-none transition-colors"
                />
                <datalist id="known-customers-list">
                  {knownCustomers.map((cust) => (
                    <option key={cust} value={cust} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-content-secondary font-medium mb-1 truncate" title="Consignee Address">
                  Consignee Address
                </label>
                <input
                  type="text"
                  placeholder="Address from invoice"
                  value={consigneeAddress}
                  onChange={(e) => setConsigneeAddress(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-content-secondary font-medium mb-1 truncate" title="Exporter / Shipper">
                  Exporter / Shipper
                </label>
                <input
                  type="text"
                  value={exporterShipper}
                  onChange={(e) => setExporterShipper(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-content-secondary font-medium mb-1 truncate" title="Port of Discharge (POD)">
                  POD
                </label>
                <input
                  type="text"
                  value={pod}
                  onChange={(e) => setPod(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: INVOICED QUANTITIES & EXACT WEIGHTS */}
          <div className="space-y-2.5">
            <div className="flex items-center space-x-2 pb-1.5 border-b border-divider/60">
              <span className="text-xs font-bold text-content-primary uppercase tracking-wider">
                2. Invoiced Quantities &amp; Exact Weights
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs items-end">
              <div>
                <label className="block text-content-secondary font-medium mb-1 truncate" title="Invoiced Pallets">
                  Invoiced Plts <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  required
                  value={invoicedPalletsStr}
                  onChange={(e) => setInvoicedPalletsStr(e.target.value)}
                  onKeyDown={(e) => {
                    if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                  }}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full px-2.5 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary font-mono font-medium outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              <div>
                <label className="block text-content-secondary font-medium mb-1 truncate" title="Invoiced Units / Batteries">
                  Invoiced Units <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  required
                  value={invoicedBatteriesStr}
                  onChange={(e) => setInvoicedBatteriesStr(e.target.value)}
                  onKeyDown={(e) => {
                    if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                  }}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full px-2.5 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary font-mono font-medium outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              <div>
                <label className="block text-content-secondary font-medium mb-1 truncate" title="Manual Gross Weight (kg)">
                  Gross Wt (kg) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  required
                  value={manualGrossWeightKgStr}
                  onChange={(e) => setManualGrossWeightKgStr(e.target.value)}
                  onKeyDown={(e) => {
                    if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                  }}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full px-2.5 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary font-mono font-bold outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              <div>
                <label className="block text-content-secondary font-medium truncate mb-1" title="Manual Net Weight (kg)">
                  Net Wt (kg)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  value={manualNetWeightKgStr}
                  onChange={(e) => setManualNetWeightKgStr(e.target.value)}
                  onKeyDown={(e) => {
                    if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                  }}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full px-2.5 py-2 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary font-mono outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2B: PALLET VERIFICATION & BREAKDOWN */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-divider/60">
              <div className="flex items-center space-x-2">
                <Boxes className="w-4 h-4 text-brand-primary" />
                <span className="text-xs font-bold text-content-primary uppercase tracking-wider">
                  2B. Pallet Verification &amp; Breakdown
                </span>
              </div>
              <div className="flex items-center space-x-2">
                {invPallets > 0 && (
                  <button
                    type="button"
                    onClick={handleAutoPopulatePalletRows}
                    className="px-2.5 py-1 rounded-lg bg-surface border border-divider hover:bg-surface-secondary text-content-secondary hover:text-content-primary text-xs font-medium flex items-center space-x-1 cursor-pointer transition-colors"
                    title={`Auto-generate ${invPallets} pallet rows matching Invoiced Pallets`}
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
            <div className="p-2.5 rounded-lg bg-surface-secondary/60 border border-divider text-xs flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-content-secondary">
                <span>
                  Pallet Rows: <strong className="text-content-primary">{palletRows.length}</strong>
                </span>
                <span>•</span>
                <span>
                  Floor Received:{' '}
                  <strong className="text-emerald-700 font-mono font-bold">
                    {summaryMetrics.floorPallets} Plts ({summaryMetrics.floorUnits} Units)
                  </strong>
                </span>
                {summaryMetrics.shortfallUnits > 0 && (
                  <>
                    <span>•</span>
                    <span>
                      Shortfall:{' '}
                      <strong className="text-amber-700 font-mono font-bold">
                        {summaryMetrics.shortfallPallets} Plts ({summaryMetrics.shortfallUnits} Units)
                      </strong>
                    </span>
                  </>
                )}
                {summaryMetrics.shortfillUnits > 0 && (
                  <>
                    <span>•</span>
                    <span>
                      Shortfill:{' '}
                      <strong className="text-blue-700 font-mono font-bold">
                        {summaryMetrics.shortfillUnits} Units
                      </strong>
                    </span>
                  </>
                )}
                {summaryMetrics.totalGrossWeightSum > 0 && (
                  <>
                    <span>•</span>
                    <span>
                      Total Gross:{' '}
                      <strong className="text-content-primary font-mono font-bold">
                        {summaryMetrics.totalGrossWeightSum} kg
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      Total Net:{' '}
                      <strong className="text-content-primary font-mono font-bold">
                        {summaryMetrics.totalNetWeightSum} kg
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      Pallet Tare Wood:{' '}
                      <strong className="text-amber-800 dark:text-amber-300 font-mono font-bold">
                        {summaryMetrics.totalPalletTareSum} kg
                      </strong>
                    </span>
                  </>
                )}
              </div>

              <div className="shrink-0">
                {palletRows.length === 0 ? null : summaryMetrics.floorUnits + summaryMetrics.shortfallUnits === invBatteries ? (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 font-semibold text-[11px] border border-emerald-500/20">
                    ✓ Matches Invoiced ({invBatteries} Units)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 font-semibold text-[11px] border border-amber-500/20">
                    Floor ({summaryMetrics.floorUnits} Units) + Missing ({summaryMetrics.shortfallUnits} Units) vs Invoiced ({invBatteries} Units)
                  </span>
                )}
              </div>
            </div>

            {/* PALLET ROWS CARDS */}
            {palletRows.length === 0 ? (
              <div className="py-3 px-4 rounded-xl bg-surface-secondary/30 border border-dashed border-divider text-center text-xs text-content-muted">
                <p>
                  No individual pallet rows added yet.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {palletRows.map((row, idx) => {
                  const bUnits = typeof row.billedUnits === 'number' ? row.billedUnits : 0;
                  const sfUnits = typeof row.shortfallUnits === 'number' ? row.shortfallUnits : 0;
                  const recdUnits = row.isFullMissing ? 0 : Math.max(0, bUnits - sfUnits);

                  const pGross = typeof row.grossWeightKg === 'number' ? row.grossWeightKg : (parseFloat(String(row.grossWeightKg || '')) || 0);
                  const pNet = typeof row.netWeightKg === 'number' ? row.netWeightKg : (parseFloat(String(row.netWeightKg || '')) || 0);
                  const palletTare = pGross > 0 && pNet > 0 && pGross >= pNet ? toExactWeight(pGross - pNet) : 0;

                  const priorPallets = getOpenPalletsForInvoice(row.priorInvoiceNo);
                  const targetSf = priorPallets.find(
                    (sf) => String(sf.palletNumber).trim() === String(row.priorShortfallPalletNumber).trim()
                  );
                  const maxFill = targetSf
                    ? targetSf.remainingShortfallUnits ?? targetSf.shortfallUnits
                    : 9999;

                  // Check if this pallet in the editing entry has an attached shortfill (received recovery from another inward)
                  const linkedShortfall = editingEntry?.shortfalls?.find(
                    (s) => String(s.palletNumber).trim() === String(row.palletNumber).trim()
                  );
                  const attachedFills = linkedShortfall?.linkedShortFills || [];
                  const hasAttachedFills = attachedFills.length > 0;
                  const totalAttachedUnits = attachedFills.reduce((sum, f) => sum + (f.unitsFilled || 0), 0);

                  // Check if this pallet was received as a shortfill supply for another invoice
                  const supplierShortFills = editingEntry
                    ? getSuppliedShortFillsForInvoice(editingEntry, allPriorInvoices).filter(
                        (s) => String(s.palletNumber).trim() === String(row.palletNumber).trim() ||
                               String(s.arrivedPalletNumber).trim() === String(row.palletNumber).trim()
                      )
                    : [];

                  return (
                    <div
                      key={row.id}
                      className={`p-3 rounded-xl border transition-all text-xs space-y-2.5 ${
                        hasAttachedFills
                          ? 'bg-purple-50/30 border-purple-300'
                          : row.receiptStatus === 'SHORTFALL'
                          ? 'bg-amber-50/40 dark:bg-amber-950/15 border-amber-300 dark:border-amber-800/60'
                          : row.receiptStatus === 'SHORTFILL'
                          ? 'bg-blue-50/40 dark:bg-blue-950/15 border-blue-300 dark:border-blue-800/60'
                          : 'bg-surface-secondary/40 border-divider'
                      }`}
                    >
                      {/* Shortfill Recovery Indicator Banner (when editing an inward that received a shortfill) */}
                      {hasAttachedFills && (
                        <div className="px-3 py-2 rounded-lg bg-purple-100/70 border border-purple-200 text-purple-950 text-xs flex flex-wrap items-center justify-between gap-2 shadow-2xs">
                          <div className="flex items-center space-x-1.5 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                            <span>
                              <strong>Shortfill Attached:</strong> +{totalAttachedUnits} Units recovered via Inward{' '}
                              <strong>{attachedFills.map((f) => `#${f.shortFillInvoiceNo}`).join(', ')}</strong>
                            </span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-purple-200 text-purple-900 font-mono">
                            {linkedShortfall?.remainingShortfallUnits === 0 ? 'Shortfall 100% Fulfilled' : `${linkedShortfall?.remainingShortfallUnits} Units Still Pending`}
                          </span>
                        </div>
                      )}

                      {/* Shortfill Supplier Banners (when this pallet was inwarded to supply another invoice's shortfall) */}
                      {supplierShortFills.map((supplierShortFill, sIdx) => (
                        <div key={sIdx} className="px-3 py-2 rounded-lg bg-blue-100/70 border border-blue-200 text-blue-950 text-xs flex flex-wrap items-center justify-between gap-2 shadow-2xs">
                          <div className="flex items-center space-x-1.5 font-medium">
                            <Boxes className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>
                              <strong>Shortfill Supplier:</strong> Supplies {supplierShortFill.unitsFilled} Units to Inward{' '}
                              <strong>#{supplierShortFill.priorShortfallInvoiceNo}</strong> (Target PLT #{supplierShortFill.palletNumber})
                              {(supplierShortFill.filledDate || supplierShortFill.date) && (
                                <span className="text-blue-800 font-normal ml-1">on {supplierShortFill.filledDate || supplierShortFill.date}</span>
                              )}
                            </span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-blue-200 text-blue-900 font-mono">
                            Earmarked Recovery Stock
                          </span>
                        </div>
                      ))}

                      {/* ROW TOP HEADER: Pallet No, Model, Billed Units, Net kg, Gross kg, Pallet Wt, Status, Delete */}
                      <div className="grid grid-cols-12 gap-2.5 items-center">
                        <div className="col-span-12 sm:col-span-1 text-content-muted font-mono font-medium text-[11px] flex flex-col justify-center">
                          <span>#{idx + 1}</span>
                          {hasAttachedFills && (
                            <span className="text-[8px] font-bold uppercase px-1 py-0.2 rounded bg-purple-100 text-purple-800 font-mono tracking-tight mt-0.5 w-fit" title="Shortfill Attached">
                              +SF
                            </span>
                          )}
                          {supplierShortFills.length > 0 && (
                            <span className="text-[8px] font-bold uppercase px-1 py-0.2 rounded bg-blue-100 text-blue-800 font-mono tracking-tight mt-0.5 w-fit" title="Supplies Shortfill">
                              SUPPLY
                            </span>
                          )}
                        </div>

                        {/* Pallet No */}
                        <div className="col-span-6 sm:col-span-2">
                          <label className="block text-[10px] text-content-secondary font-medium mb-0.5">
                            Pallet No. <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={row.palletNumber}
                            onChange={(e) =>
                              handleUpdatePalletRow(row.id, { palletNumber: e.target.value })
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-divider text-content-primary font-mono outline-none focus:border-brand-primary"
                          />
                        </div>

                        {/* Model */}
                        <div className="col-span-6 sm:col-span-2">
                          <label className="block text-[10px] text-content-secondary font-medium mb-0.5">
                            Model
                          </label>
                          <input
                            type="text"
                            value={row.model}
                            onChange={(e) =>
                              handleUpdatePalletRow(row.id, { model: e.target.value })
                            }
                            className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-divider text-content-primary font-mono text-xs outline-none focus:border-brand-primary"
                          />
                        </div>

                        {/* Billed Units */}
                        <div className="col-span-4 sm:col-span-1">
                          <label className="block text-[10px] text-content-secondary font-medium mb-0.5">
                            Billed <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            required
                            value={row.billedUnits}
                            onChange={(e) => {
                              const val =
                                e.target.value === ''
                                  ? ''
                                  : Math.max(1, parseInt(e.target.value, 10) || 1);
                              handleUpdatePalletRow(row.id, {
                                billedUnits: val,
                                ...(row.isFullMissing ? { shortfallUnits: val } : {})
                              });
                            }}
                            onWheel={(e) => e.currentTarget.blur()}
                            className="w-full px-2 py-1.5 rounded-lg bg-surface border border-divider text-content-primary font-mono font-bold outline-none focus:border-brand-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>

                        {/* Net Weight (kg) */}
                        <div className="col-span-4 sm:col-span-1">
                          <label className="block text-[10px] text-content-secondary font-medium mb-0.5" title="Net Weight of batteries on this pallet in kg">
                            Net kg
                          </label>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={row.netWeightKg !== undefined ? row.netWeightKg : ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0);
                              handleUpdatePalletRow(row.id, { netWeightKg: val });
                            }}
                            onWheel={(e) => e.currentTarget.blur()}
                            className="w-full px-2 py-1.5 rounded-lg bg-surface border border-divider text-content-primary font-mono text-xs outline-none focus:border-brand-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>

                        {/* Gross Weight (kg) */}
                        <div className="col-span-4 sm:col-span-1">
                          <label className="block text-[10px] text-content-secondary font-medium mb-0.5" title="Gross Weight of this pallet including wooden pallet/dunnage in kg">
                            Gross kg
                          </label>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={row.grossWeightKg !== undefined ? row.grossWeightKg : ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0);
                              handleUpdatePalletRow(row.id, { grossWeightKg: val });
                            }}
                            onWheel={(e) => e.currentTarget.blur()}
                            className="w-full px-2 py-1.5 rounded-lg bg-surface border border-divider text-content-primary font-mono text-xs font-semibold outline-none focus:border-brand-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>

                        {/* Palette Weight = Gross - Net */}
                        <div className="col-span-4 sm:col-span-1">
                          <label className="block text-[10px] text-content-secondary font-medium mb-0.5" title="Palette Weight (Tare Wood) = Gross Weight - Net Weight">
                            Pallet Wt
                          </label>
                          <div
                            className={`h-[34px] px-1.5 rounded-lg border flex items-center justify-center font-mono font-bold text-xs truncate ${
                              palletTare > 0
                                ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700/60'
                                : 'bg-surface border-divider text-content-muted'
                            }`}
                            title={`Palette Weight (Tare Wood) = Gross (${pGross} kg) - Net (${pNet} kg) = ${palletTare} kg`}
                          >
                            {palletTare > 0 ? `${palletTare} kg` : '—'}
                          </div>
                        </div>

                        {/* Receipt Status */}
                        <div className="col-span-6 sm:col-span-2">
                          <label className="block text-[10px] text-content-secondary font-medium mb-0.5">
                            Receipt Status <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={row.receiptStatus}
                            onChange={(e) => {
                              const val = e.target.value as PalletRowReceiptStatus;
                              const updates: Partial<InwardPalletRow> = { receiptStatus: val };
                              if (val === 'PARTIALLY_RECEIVED' || val === 'SHORTFALL' || val === 'SHORTFILL') {
                                updates.isSaved = false;
                              }
                              handleUpdatePalletRow(row.id, updates);
                            }}
                            className={`w-full px-2 py-1.5 rounded-lg font-semibold outline-none cursor-pointer border text-xs ${
                              row.receiptStatus === 'RECEIVED'
                                ? 'bg-emerald-500/10 text-emerald-800 border-emerald-300'
                                : row.receiptStatus === 'NOT_RECEIVED'
                                ? 'bg-slate-500/10 text-slate-800 border-slate-300'
                                : row.receiptStatus === 'PARTIALLY_RECEIVED'
                                ? 'bg-indigo-500/10 text-indigo-800 border-indigo-300'
                                : row.receiptStatus === 'SHORTFALL'
                                ? 'bg-amber-500/10 text-amber-800 border-amber-400'
                                : 'bg-blue-500/10 text-blue-800 border-blue-400'
                            }`}
                          >
                            <option value="RECEIVED">Received (Full Physical)</option>
                            <option value="PARTIALLY_RECEIVED">Partially Received (Split Intake)</option>
                            <option value="NOT_RECEIVED">Not Received (Arriving Later)</option>
                            <option value="SHORTFALL">Shortfall (Missing / Partial)</option>
                            <option value="SHORTFILL">Shortfill (Reconcile Prior)</option>
                          </select>
                        </div>

                        {/* Action: Edit & Delete */}
                        <div className="col-span-2 sm:col-span-1 text-right flex items-center justify-end space-x-1">
                          <button
                            type="button"
                            onClick={() => handleUpdatePalletRow(row.id, { isSaved: !row.isSaved })}
                            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                              row.isSaved
                                ? 'text-brand-primary hover:bg-brand-primary/10'
                                : 'text-amber-800 bg-amber-100 hover:bg-amber-200'
                            }`}
                            title={row.isSaved ? "Edit pallet configuration" : "Close edit mode"}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemovePalletRow(row.id)}
                            className="p-1.5 text-content-muted hover:text-red-600 transition-colors cursor-pointer"
                            title="Remove pallet row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* STATUS-SPECIFIC SUB-CARD */}

                      {/* 1. RECEIVED FULL */}
                      {row.receiptStatus === 'RECEIVED' && (
                        <div className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-800 border border-emerald-500/20 text-[11px] flex items-center justify-between">
                          <span className="flex items-center space-x-1.5">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>
                              Full Physical Receipt: <strong>{bUnits} units</strong> entering active floor inventory.
                            </span>
                          </span>
                          <span className="font-mono font-semibold">0 missing</span>
                        </div>
                      )}

                      {/* 2. NOT RECEIVED (ARRIVING LATER) */}
                      {row.receiptStatus === 'NOT_RECEIVED' && (
                        <div className="px-2.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px] flex items-center justify-between">
                          <span className="flex items-center space-x-1.5 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>
                              <strong>Not Received Yet:</strong> Pallet arriving in a future shipment • <strong>0 units</strong> on floor now • <strong>{bUnits} units</strong> pending arrival.
                            </span>
                          </span>
                          <span className="font-mono font-bold text-amber-800 bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 rounded text-[10px]">
                            PENDING INWARD
                          </span>
                        </div>
                      )}

                      {/* 3. PARTIALLY RECEIVED (SPLIT INTAKE) */}
                      {row.receiptStatus === 'PARTIALLY_RECEIVED' && (() => {
                        const pastReceipts = row.partialReceipts || [];
                        const pastTotalUnits = pastReceipts.reduce((s, r) => s + (r.unitsReceived || 0), 0);
                        const totalLandedUnits = pastReceipts.length > 0 ? pastTotalUnits : (typeof row.currentReceivedUnits === 'number' ? row.currentReceivedUnits : 0);
                        const pendingUnits = Math.max(0, bUnits - totalLandedUnits);

                        return (
                          <>
                            {/* When Pallet is Saved: Show Clean Info Banner */}
                            {row.isSaved ? (
                              <div className="px-3 py-2 rounded-lg bg-indigo-500/10 text-indigo-950 dark:text-indigo-200 border border-indigo-500/30 text-xs flex items-center justify-between">
                                <span className="flex items-center space-x-2">
                                  <Boxes className="w-4 h-4 text-indigo-600 shrink-0" />
                                  <span>
                                    <strong>Partially Received Pallet:</strong> {totalLandedUnits} units landed ({pastReceipts.length} {pastReceipts.length === 1 ? 'batch' : 'batches'}) • <strong>{pendingUnits} units</strong> pending in future deliveries.
                                  </span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdatePalletRow(row.id, { isSaved: false })}
                                  className="text-indigo-700 dark:text-indigo-300 hover:text-indigo-950 dark:hover:text-white font-semibold flex items-center space-x-1 cursor-pointer ml-2 shrink-0 underline text-[11px]"
                                  title="Edit partial intake logs"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>Edit Pallet</span>
                                </button>
                              </div>
                            ) : (
                              <div className="p-3 rounded-lg bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/60 space-y-2.5">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-indigo-950 dark:text-indigo-200 flex items-center space-x-1.5">
                                    <Boxes className="w-4 h-4 text-indigo-600 shrink-0" />
                                    <span>Partially Received Pallet (Split Intake Across Trucks / Dates)</span>
                                  </span>
                                  <div className="text-[11px] font-mono flex items-center space-x-2">
                                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                                      Landed: {totalLandedUnits} u
                                    </span>
                                    <span className={`px-2 py-0.5 rounded font-bold ${pendingUnits > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                      {pendingUnits > 0 ? `Pending: ${pendingUnits} u` : 'Fully Landed'}
                                    </span>
                                  </div>
                                </div>

                                {/* Intake Controls */}
                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end pt-1 bg-surface p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900/40">
                                  <div className="sm:col-span-4">
                                    <label className="block text-[10px] text-content-secondary font-medium mb-1">
                                      Date of Arrival
                                    </label>
                                    <DateInput
                                      value={row.currentArrivalDate || cartingInDate || ''}
                                      onChange={(d) => handleUpdatePalletRow(row.id, { currentArrivalDate: d })}
                                    />
                                  </div>

                                  <div className="sm:col-span-4">
                                    <label className="block text-[10px] text-content-secondary font-medium mb-1">
                                      Quantity Received (Units)
                                    </label>
                                    <input
                                      type="number"
                                      min="1"
                                      max={pendingUnits > 0 ? pendingUnits : bUnits}
                                      step="1"
                                      value={row.currentReceivedUnits !== undefined ? row.currentReceivedUnits : ''}
                                      placeholder={pendingUnits > 0 ? `Max ${pendingUnits}` : 'Units'}
                                      onChange={(e) => {
                                        const val = e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1);
                                        handleUpdatePalletRow(row.id, { currentReceivedUnits: val });
                                      }}
                                      onWheel={(e) => e.currentTarget.blur()}
                                      className="w-full px-2.5 py-1.5 rounded-lg border font-mono font-bold bg-surface border-indigo-200 text-indigo-900 outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
                                    />
                                  </div>

                                  <div className="sm:col-span-4 flex items-center justify-end">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const val = typeof row.currentReceivedUnits === 'number' ? row.currentReceivedUnits : 0;
                                        if (val <= 0) {
                                          setErrorMsg(`Pallet ${row.palletNumber}: Please enter Quantity Received greater than 0.`);
                                          return;
                                        }
                                        if (val > pendingUnits && pastReceipts.length > 0) {
                                          setErrorMsg(`Pallet ${row.palletNumber}: Received units cannot exceed remaining pending ${pendingUnits} units.`);
                                          return;
                                        }
                                        const arrDate = row.currentArrivalDate || cartingInDate || formatToDDMMYYYY(new Date());
                                        const newLog: PartialReceiptLog = {
                                          id: `pr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                                          arrivalDate: arrDate,
                                          unitsReceived: val,
                                          recordedAt: new Date().toISOString()
                                        };
                                        const updatedLogs = [...pastReceipts, newLog];
                                        handleUpdatePalletRow(row.id, {
                                          partialReceipts: updatedLogs,
                                          currentReceivedUnits: '',
                                          isSaved: false
                                        });
                                        setErrorMsg(null);
                                      }}
                                      className="w-full px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center space-x-1 shadow-xs cursor-pointer"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      <span>Log Intake Batch</span>
                                    </button>
                                  </div>
                                </div>

                                {/* Past Intake Logs Table */}
                                {pastReceipts.length > 0 && (
                                  <div className="space-y-1.5">
                                    <span className="text-[10px] font-bold text-content-secondary uppercase tracking-wider block">
                                      Recorded Intake Logs ({pastReceipts.length}):
                                    </span>
                                    <div className="border border-indigo-100 dark:border-indigo-900/40 rounded-lg overflow-hidden bg-surface">
                                      <table className="w-full text-[11px] font-mono">
                                        <thead className="bg-indigo-50/60 dark:bg-indigo-950/40 text-content-secondary text-[10px]">
                                          <tr>
                                            <th className="py-1 px-2 text-left">#</th>
                                            <th className="py-1 px-2 text-left">Date of Arrival</th>
                                            <th className="py-1 px-2 text-right">Units Received</th>
                                            <th className="py-1 px-2 text-right">Action</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-indigo-50 dark:divide-indigo-950/40">
                                          {pastReceipts.map((log, lIdx) => (
                                            <tr key={log.id}>
                                              <td className="py-1 px-2 text-content-muted">{lIdx + 1}</td>
                                              <td className="py-1 px-2 font-medium">{log.arrivalDate}</td>
                                              <td className="py-1 px-2 text-right font-bold text-emerald-700">+{log.unitsReceived} u</td>
                                              <td className="py-1 px-2 text-right">
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const updatedLogs = pastReceipts.filter((_, idx) => idx !== lIdx);
                                                    handleUpdatePalletRow(row.id, { partialReceipts: updatedLogs });
                                                  }}
                                                  className="text-red-500 hover:text-red-700 p-0.5 cursor-pointer"
                                                  title="Remove this intake log"
                                                >
                                                  <Trash2 className="w-3 h-3 inline" />
                                                </button>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}

                                {/* Save Pallet Action */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-indigo-200 dark:border-indigo-800/60">
                                  <span className="text-[11px] text-indigo-900 dark:text-indigo-300">
                                    Review recorded logs and click Save Pallet to lock intake into inward.
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const currentInputUnits = typeof row.currentReceivedUnits === 'number' ? row.currentReceivedUnits : 0;
                                      let finalReceipts = [...pastReceipts];
                                      if (currentInputUnits > 0) {
                                        if (currentInputUnits > pendingUnits && pastReceipts.length > 0) {
                                          setErrorMsg(`Pallet ${row.palletNumber}: Received units cannot exceed remaining pending ${pendingUnits} units.`);
                                          return;
                                        }
                                        const arrDate = row.currentArrivalDate || cartingInDate || formatToDDMMYYYY(new Date());
                                        finalReceipts.push({
                                          id: `pr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                                          arrivalDate: arrDate,
                                          unitsReceived: currentInputUnits,
                                          recordedAt: new Date().toISOString()
                                        });
                                      }
                                      if (finalReceipts.length === 0) {
                                        setErrorMsg(`Pallet ${row.palletNumber}: Please enter received units or log at least one intake batch.`);
                                        return;
                                      }
                                      setErrorMsg(null);
                                      handleUpdatePalletRow(row.id, {
                                        partialReceipts: finalReceipts,
                                        currentReceivedUnits: '',
                                        isSaved: true
                                      });
                                    }}
                                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer self-end sm:self-auto"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Save Pallet</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}

                      {/* 2. SHORTFALL (MISSING) */}
                      {row.receiptStatus === 'SHORTFALL' && (
                        <>
                          {/* When Pallet is Saved: Show Clean Info Banner */}
                          {row.isSaved ? (
                            <div className="px-3 py-2 rounded-lg bg-amber-500/10 text-amber-900 border border-amber-500/30 text-xs flex items-center justify-between">
                              <span className="flex items-center space-x-2">
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                <span>
                                  {row.isFullMissing ? (
                                    <>
                                      <strong>Entire Pallet Not Received (Full Missing):</strong> {bUnits} units missing (Transferred to Shortfall Backlog) • <strong>0 units</strong> entering floor stock.
                                    </>
                                  ) : (
                                    <>
                                      <strong>Partial Shortfall:</strong> {row.shortfallUnits || 0} units missing in Backlog • <strong>{recdUnits} units</strong> entering active floor inventory.
                                    </>
                                  )}
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdatePalletRow(row.id, { isSaved: false })}
                                className="text-amber-800 hover:text-amber-950 font-semibold flex items-center space-x-1 cursor-pointer ml-2 shrink-0 underline text-[11px]"
                                title="Edit shortfall settings"
                              >
                                <Pencil className="w-3 h-3" />
                                <span>Edit Pallet</span>
                              </button>
                            </div>
                          ) : (
                            /* Editing Configuration Form */
                            <div className="p-3 rounded-lg bg-surface border border-amber-300 dark:border-amber-700/60 space-y-2.5 animate-scale-up">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <label className="flex items-center space-x-2 text-xs font-semibold text-amber-900 dark:text-amber-300 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(row.isFullMissing)}
                                    onChange={(e) =>
                                      handleUpdatePalletRow(row.id, {
                                        isFullMissing: e.target.checked
                                      })
                                    }
                                    className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                                  />
                                  <span>Entire Pallet Not Received (Full Pallet Missing)</span>
                                </label>

                                <div className="text-[11px] font-mono">
                                  {row.isFullMissing ? (
                                    <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-800 font-bold">
                                      0 Units on Floor • {bUnits} Units to Backlog
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-800 font-bold">
                                      Floor: {recdUnits} Units • Backlog: {sfUnits} Units
                                    </span>
                                  )}
                                </div>
                              </div>

                              {row.isFullMissing ? (
                                <p className="text-[11px] text-amber-800 dark:text-amber-300/90">
                                  ⚠️ Pallet #{row.palletNumber} will NOT enter floor inventory (0 phantom stock). The full {bUnits} units are recorded strictly in the Shortfall Backlog.
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                  <div>
                                    <label className="block text-[10px] text-content-secondary font-medium mb-1">
                                      Missing / Shortfall Units <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                      type="number"
                                      min="1"
                                      max={Math.max(1, bUnits - 1)}
                                      step="1"
                                      required
                                      value={row.shortfallUnits}
                                      onChange={(e) => {
                                        const val =
                                          e.target.value === ''
                                            ? ''
                                            : Math.max(1, parseInt(e.target.value, 10) || 1);
                                        handleUpdatePalletRow(row.id, { shortfallUnits: val });
                                      }}
                                      onWheel={(e) => e.currentTarget.blur()}
                                      className="w-full px-2.5 py-1.5 rounded-lg border font-mono font-bold bg-surface border-amber-300 text-amber-800 outline-none focus:ring-1 focus:ring-amber-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <span className="text-[10px] text-content-muted mt-0.5 block">
                                      Must be less than billed {bUnits} units
                                    </span>
                                  </div>

                                  <div className="flex flex-col justify-center">
                                    <span className="text-[10px] text-content-secondary font-medium">
                                      Physical Units Entering Warehouse Floor:
                                    </span>
                                    <span className="text-sm font-mono font-bold text-emerald-700">
                                      {recdUnits} Units
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Save Pallet Action */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-amber-200">
                                <span className="text-[11px] text-amber-800">
                                  Review values and click Save Pallet to apply into inward.
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!row.isFullMissing) {
                                      const sf = typeof row.shortfallUnits === 'number' ? row.shortfallUnits : 0;
                                      if (sf <= 0 || sf >= bUnits) {
                                        setErrorMsg(`Pallet ${row.palletNumber}: Missing units (${sf}) must be between 1 and ${bUnits - 1}`);
                                        return;
                                      }
                                    }
                                    setErrorMsg(null);
                                    handleUpdatePalletRow(row.id, { isSaved: true });
                                  }}
                                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer self-end sm:self-auto"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Save Pallet</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {/* 3. SHORTFILL (RECOVERY & AUTO-SPLIT) */}
                      {row.receiptStatus === 'SHORTFILL' && (() => {
                        const sfillUnits = typeof row.shortfillUnits === 'number' ? row.shortfillUnits : 0;
                        const autoRegUnits = Math.max(0, bUnits - sfillUnits);

                        return (
                          <>
                            {/* When Pallet is Saved: Show Clean Info Banner */}
                            {row.isSaved ? (
                              <div className="px-3 py-2 rounded-lg bg-purple-500/10 text-purple-900 border border-purple-500/30 text-xs flex items-center justify-between">
                                <span className="flex items-center space-x-2">
                                  <Layers className="w-4 h-4 text-purple-600 shrink-0" />
                                  <span>
                                    <strong>Shortfill Reconciled:</strong> {sfillUnits} recovery units for INV #{row.priorInvoiceNo || '—'} (PLT #{row.priorShortfallPalletNumber || '—'})
                                    {autoRegUnits > 0 && ` + ${autoRegUnits} regular new units`}
                                    {' '}• <strong>{bUnits} units</strong> entering active floor inventory.
                                  </span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdatePalletRow(row.id, { isSaved: false })}
                                  className="text-purple-800 hover:text-purple-950 font-semibold flex items-center space-x-1 cursor-pointer ml-2 shrink-0 underline text-[11px]"
                                  title="Edit shortfill settings"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>Edit Pallet</span>
                                </button>
                              </div>
                            ) : (
                              /* Editing Configuration Form */
                              <div className="p-3 rounded-lg bg-surface border border-purple-300 dark:border-purple-700/60 space-y-2.5 animate-scale-up">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                                  {/* Prior Invoice Dropdown */}
                                  <div className="sm:col-span-2">
                                    <label className="block text-[10px] text-content-secondary font-medium mb-1">
                                      Prior Shortfall Invoice <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                      value={row.priorInvoiceNo}
                                      onChange={(e) => {
                                        const inv = e.target.value;
                                        const openPlts = getOpenPalletsForInvoice(inv);
                                        const firstPlt = openPlts[0];
                                        handleUpdatePalletRow(row.id, {
                                          priorInvoiceNo: inv,
                                          priorShortfallPalletNumber: firstPlt
                                            ? String(firstPlt.palletNumber)
                                            : '',
                                          shortfillUnits: firstPlt
                                            ? Math.min(bUnits, firstPlt.remainingShortfallUnits ?? firstPlt.shortfallUnits)
                                            : ''
                                        });
                                      }}
                                      className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-divider text-content-primary font-mono text-xs outline-none cursor-pointer focus:border-brand-primary"
                                    >
                                      <option value="">-- Select Prior Invoice --</option>
                                      {openShortfallInvoices.map((ent) => {
                                        const rem = getEntryRemainingShortfallUnits(ent);
                                        return (
                                          <option key={ent.id} value={ent.customInvoiceNo}>
                                            {ent.customInvoiceNo} — {ent.customer || 'No Customer'} ({rem} Units short)
                                          </option>
                                        );
                                      })}
                                    </select>
                                  </div>

                                  {/* Missing Pallet Dropdown */}
                                  <div>
                                    <label className="block text-[10px] text-content-secondary font-medium mb-1">
                                      Missing Pallet <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                      value={row.priorShortfallPalletNumber}
                                      onChange={(e) => {
                                        const pNum = e.target.value;
                                        const matched = priorPallets.find(
                                          (sf) => String(sf.palletNumber).trim() === pNum.trim()
                                        );
                                        handleUpdatePalletRow(row.id, {
                                          priorShortfallPalletNumber: pNum,
                                          shortfillUnits: matched
                                            ? Math.min(bUnits, matched.remainingShortfallUnits ?? matched.shortfallUnits)
                                            : ''
                                        });
                                      }}
                                      className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-divider text-content-primary font-mono text-xs outline-none cursor-pointer focus:border-brand-primary"
                                    >
                                      <option value="">-- Select Pallet --</option>
                                      {priorPallets.map((sf) => (
                                        <option key={sf.id} value={String(sf.palletNumber)}>
                                          PLT #{sf.palletNumber} (
                                          {sf.remainingShortfallUnits ?? sf.shortfallUnits} Units rem)
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  {/* Shortfill Units Input */}
                                  <div>
                                    <label className="block text-[10px] text-content-secondary font-medium mb-1">
                                      Shortfill Units <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                      type="number"
                                      min="1"
                                      max={maxFill || bUnits || undefined}
                                      step="1"
                                      required
                                      value={row.shortfillUnits}
                                      onChange={(e) => {
                                        const val =
                                          e.target.value === ''
                                            ? ''
                                            : Math.max(1, parseInt(e.target.value, 10) || 1);
                                        handleUpdatePalletRow(row.id, { shortfillUnits: val });
                                      }}
                                      onWheel={(e) => e.currentTarget.blur()}
                                      className="w-full px-2.5 py-1.5 rounded-lg border font-mono font-bold bg-surface border-purple-300 text-purple-700 outline-none focus:ring-1 focus:ring-purple-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                  </div>
                                </div>

                                {/* Auto-Calculated Split Banner */}
                                <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-950 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 font-sans">
                                  <span>
                                    <strong>Auto-Calculated Split:</strong>{' '}
                                    <span className="text-purple-700 font-bold font-mono">{sfillUnits} Shortfill Units</span> (reconciling INV #{row.priorInvoiceNo || '—'}) +{' '}
                                    <span className="text-blue-700 font-bold font-mono">{autoRegUnits} Regular New Units</span>
                                  </span>
                                  <span className="font-mono font-bold text-purple-800">
                                    = {bUnits} Total Units on Floor
                                  </span>
                                </div>

                                {/* Transit Pallet Renumbering Toggle */}
                                <div className="pt-1 border-t border-divider/60">
                                  <label className="flex items-center space-x-1.5 text-[11px] text-content-secondary font-medium mb-1 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(row.palletNumberChanged)}
                                      onChange={(e) =>
                                        handleUpdatePalletRow(row.id, {
                                          palletNumberChanged: e.target.checked,
                                          arrivedPalletNumber: e.target.checked
                                            ? row.arrivedPalletNumber
                                            : ''
                                        })
                                      }
                                      className="rounded border-divider text-brand-primary focus:ring-brand-primary cursor-pointer"
                                    />
                                    <span>Pallet Number Changed on Arrival</span>
                                  </label>
                                  {row.palletNumberChanged ? (
                                    <input
                                      type="text"
                                      required
                                      value={row.arrivedPalletNumber || ''}
                                      onChange={(e) =>
                                        handleUpdatePalletRow(row.id, {
                                          arrivedPalletNumber: e.target.value
                                        })
                                      }
                                      placeholder="Enter arrived pallet number..."
                                      className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-purple-300 text-purple-800 font-mono text-xs outline-none focus:ring-1 focus:ring-purple-500"
                                    />
                                  ) : (
                                    <span className="text-[10px] text-content-muted block">
                                      Uses PLT #{row.priorShortfallPalletNumber || row.palletNumber}
                                    </span>
                                  )}
                                </div>

                                {/* Save Pallet Action */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-purple-200">
                                  <span className="text-[11px] text-purple-800">
                                    Review split and click Save Pallet to apply reconciliation into inward.
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!row.priorInvoiceNo) {
                                        setErrorMsg(`Pallet ${row.palletNumber}: Please select a Prior Shortfall Invoice.`);
                                        return;
                                      }
                                      if (!row.priorShortfallPalletNumber) {
                                        setErrorMsg(`Pallet ${row.palletNumber}: Please select a Missing Shortfall Pallet.`);
                                        return;
                                      }
                                      if (sfillUnits <= 0) {
                                        setErrorMsg(`Pallet ${row.palletNumber}: Please enter Shortfill Units > 0.`);
                                        return;
                                      }
                                      setErrorMsg(null);
                                      handleUpdatePalletRow(row.id, { isSaved: true, regularUnits: autoRegUnits });
                                    }}
                                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer self-end sm:self-auto"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Save Pallet</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION 3: GATE-IN & HAULIER DETAILS */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 pb-2 border-b border-divider/60">
              <span className="text-xs font-bold text-content-primary uppercase tracking-wider">
                3. Gate-In &amp; Haulier Details
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div>
                <label className="block text-content-secondary font-medium mb-1">
                  Truck Reporting Date
                </label>
                <DateInput
                  value={truckReportingDate}
                  onChange={setTruckReportingDate}
                />
              </div>

              <div>
                <label className="block text-content-secondary font-medium mb-1">
                  Carting In Date
                </label>
                <DateInput
                  value={cartingInDate}
                  onChange={setCartingInDate}
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

          {/* LIVE SUMMARY FOOTER STRIP */}
          <div className={`grid gap-2.5 p-3 rounded-xl bg-surface-secondary/70 border border-divider ${
            summaryMetrics.pendingUnits > 0 ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'
          }`}>
            {/* 1. TOTAL INVOICED */}
            <div className="p-2.5 rounded-lg bg-surface border border-divider">
              <span className="text-[10px] text-content-secondary font-semibold uppercase tracking-wider block">
                Total Invoiced
              </span>
              <span className="text-xs sm:text-sm font-bold font-mono text-content-primary">
                {summaryMetrics.totalInvoicedPallets} Plts • {summaryMetrics.totalInvoicedUnits} Units
              </span>
            </div>

            {/* 2. ENTERING FLOOR STOCK */}
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wider block">
                Entering Floor Stock
              </span>
              <span className="text-xs sm:text-sm font-bold font-mono text-emerald-800">
                {summaryMetrics.floorPallets} Plts • {summaryMetrics.floorUnits} Units
              </span>
            </div>

            {/* 3. PENDING ARRIVAL (IN-PROGRESS CARTING) */}
            {summaryMetrics.pendingUnits > 0 && (
              <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                <span className="text-[10px] text-indigo-700 font-semibold uppercase tracking-wider block">
                  Pending Arrival
                </span>
                <span className="text-xs sm:text-sm font-bold font-mono text-indigo-800">
                  {summaryMetrics.pendingPallets} Plts • {summaryMetrics.pendingUnits} Units
                </span>
              </div>
            )}

            {/* 4. SHORTFALL TO BACKLOG */}
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <span className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider block">
                Shortfall to Backlog
              </span>
              <span className="text-xs sm:text-sm font-bold font-mono text-amber-800">
                {summaryMetrics.shortfallPallets} Plts • {summaryMetrics.shortfallUnits} Units
              </span>
            </div>

            {/* 5. SHORTFILL RECONCILED */}
            <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <span className="text-[10px] text-blue-700 font-semibold uppercase tracking-wider block">
                Shortfill Reconciled
              </span>
              <span className="text-xs sm:text-sm font-bold font-mono text-blue-800">
                {summaryMetrics.shortfillPallets} Plts • {summaryMetrics.shortfillUnits} Units
              </span>
            </div>
          </div>

          {/* Pending Inward Notice */}
          {summaryMetrics.pendingUnits > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-center space-x-2 shadow-2xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Partial Inward In-Progress:</strong> {summaryMetrics.pendingUnits} units ({summaryMetrics.pendingPallets} pallets) are pending arrival in future shipments. This invoice will be marked <strong>Pending Inward</strong>. Future deliveries can be logged directly into this invoice anytime.
              </span>
            </div>
          )}
          </fieldset>

          {/* ACTION BUTTONS */}
          <div className="pt-2 border-t border-divider flex items-center justify-end space-x-2.5">
            {isReadOnly ? (
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2 rounded-lg bg-surface hover:bg-surface-secondary text-content-primary border border-divider text-xs font-semibold transition-colors cursor-pointer"
              >
                Close View
              </button>
            ) : (
              <>
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
                  <span>
                    {isSubmitting
                      ? (editingEntry ? 'Updating Inward...' : 'Recording Inward...')
                      : (editingEntry ? 'Save & Update Inward' : 'Confirm Stock-Inward')}
                  </span>
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
