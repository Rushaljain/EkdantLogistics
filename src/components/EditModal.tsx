import React, { useState } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  Wand2, 
  CheckCircle2, 
  AlertTriangle, 
  Building2, 
  FileText, 
  Scale
} from 'lucide-react';
import type { ConvertedInvoice, LineItem, CustomsPort } from '../types';
import { EXPORTER_PROFILES } from '../data/profiles';
import { ICEGATE_UQC_LIST, cleanHsn, generateMockIrn } from '../utils/geminiExtractor';

interface EditModalProps {
  invoice: ConvertedInvoice | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: ConvertedInvoice) => void;
}

export const EditModal: React.FC<EditModalProps> = ({
  invoice,
  isOpen,
  onClose,
  onSave
}) => {
  if (!isOpen || !invoice) return null;

  const [formData, setFormData] = useState<ConvertedInvoice>(() => ({
    ...invoice,
    lineItems: invoice.lineItems.map(it => ({ ...it }))
  }));

  // Auto-fill from Exporter profile
  const handleSelectExporter = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const profile = EXPORTER_PROFILES.find(p => p.id === e.target.value);
    if (profile) {
      setFormData(prev => ({
        ...prev,
        exporterName: profile.companyName,
        iec: profile.iec,
        gstin: profile.gstin,
        adCode: profile.adCode,
        portOfLoading: profile.defaultPort
      }));
    }
  };

  // Line item updates
  const handleItemChange = (index: number, field: keyof LineItem, value: any) => {
    setFormData(prev => {
      const updated = [...prev.lineItems];
      const target = { ...updated[index], [field]: value };

      // Auto-recalc row total if quantity or unitPrice changed
      if (field === 'quantity' || field === 'unitPrice') {
        const qty = field === 'quantity' ? Number(value) || 0 : target.quantity;
        const rate = field === 'unitPrice' ? Number(value) || 0 : target.unitPrice;
        target.total = Number((qty * rate).toFixed(2));
      }

      updated[index] = target;
      return { ...prev, lineItems: updated };
    });
  };

  const handleAddItem = () => {
    const newItem: LineItem = {
      id: `item-${Date.now()}`,
      itemNumber: formData.lineItems.length + 1,
      description: 'NEW INDUSTRIAL GOODS ITEM',
      hsnCode: '84818090',
      quantity: 1,
      uqc: 'NOS',
      unitPrice: 100.0,
      total: 100.0
    };
    setFormData(prev => ({
      ...prev,
      lineItems: [...prev.lineItems, newItem]
    }));
  };

  const handleDeleteItem = (index: number) => {
    if (formData.lineItems.length <= 1) return;
    setFormData(prev => ({
      ...prev,
      lineItems: prev.lineItems.filter((_, idx) => idx !== index)
    }));
  };

  // 1-Click Auto-Fix HSN & Totals
  const handleAutoFix = () => {
    setFormData(prev => {
      let sum = 0;
      const fixedItems = prev.lineItems.map(it => {
        const paddedHsn = cleanHsn(it.hsnCode);
        const correctTotal = Number((it.quantity * it.unitPrice).toFixed(2));
        sum += correctTotal;
        return {
          ...it,
          hsnCode: paddedHsn,
          total: correctTotal
        };
      });

      return {
        ...prev,
        lineItems: fixedItems,
        invoiceTotal: Number(sum.toFixed(2)),
        status: 'converted'
      };
    });
  };

  // Live Math calculations
  const itemsSum = Number(
    formData.lineItems.reduce((acc, it) => acc + (it.total || 0), 0).toFixed(2)
  );
  const headerTotal = Number(formData.invoiceTotal.toFixed(2));
  const mathDiff = Number(Math.abs(itemsSum - headerTotal).toFixed(2));
  const isBalanced = mathDiff <= 0.5;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      status: isBalanced && formData.lineItems.every(i => i.hsnCode.length === 8) ? 'converted' : 'review_suggested'
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-4xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Top Header */}
        <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                Preview & Edit Invoice
                <span className="font-mono text-xs text-indigo-600 font-semibold">
                  {formData.invoiceNumber}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Verify statutory declarations, 8-digit HSN codes, and commercial totals before EDI export
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {/* SECTION 1: Shipment & Statutory Header Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                Shipment & Statutory Information
              </h3>

              {/* Filing Type Toggle: Export vs Import */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/60">
                <button
                  type="button"
                  onClick={() => setFormData(p => ({ ...p, filingType: 'EXPORT' }))}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                    formData.filingType === 'EXPORT'
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Export (.sb)
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(p => ({ ...p, filingType: 'IMPORT' }))}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                    formData.filingType === 'IMPORT'
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Import (.be)
                </button>
              </div>
            </div>

            {/* Header Form Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {/* Invoice Number */}
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">
                  Invoice Number
                </label>
                <input
                  type="text"
                  value={formData.invoiceNumber}
                  onChange={(e) => setFormData(p => ({ ...p, invoiceNumber: e.target.value }))}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>

              {/* Invoice Date */}
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">
                  Invoice Date
                </label>
                <input
                  type="date"
                  value={formData.invoiceDate}
                  onChange={(e) => setFormData(p => ({ ...p, invoiceDate: e.target.value }))}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>

              {/* e-Sanchit IRN */}
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-slate-600">
                    16-Digit e-Sanchit IRN
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormData(p => ({ ...p, esanchitIrn: generateMockIrn(formData.portOfLoading) }))}
                    className="text-[10px] text-indigo-600 font-semibold hover:underline"
                  >
                    Generate Mock IRN
                  </button>
                </div>
                <input
                  type="text"
                  maxLength={16}
                  value={formData.esanchitIrn}
                  onChange={(e) => setFormData(p => ({ ...p, esanchitIrn: e.target.value.toUpperCase() }))}
                  placeholder="e.g. 2026102700948215"
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>

              {/* Exporter Name with Profile Dropdown */}
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-slate-600">
                    Exporter / Consignor Name
                  </label>
                  <select
                    onChange={handleSelectExporter}
                    className="text-[10px] bg-slate-100 text-slate-700 rounded px-1.5 py-0.5 border border-slate-200 outline-none"
                    defaultValue=""
                  >
                    <option value="" disabled>Auto-fill Profile...</option>
                    {EXPORTER_PROFILES.map(p => (
                      <option key={p.id} value={p.id}>{p.companyName.slice(0, 28)}...</option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  value={formData.exporterName}
                  onChange={(e) => setFormData(p => ({ ...p, exporterName: e.target.value }))}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>

              {/* 10-Digit IEC */}
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">
                  10-Digit IEC
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={formData.iec}
                  onChange={(e) => setFormData(p => ({ ...p, iec: e.target.value.toUpperCase() }))}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>

              {/* 15-Digit GSTIN */}
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">
                  15-Digit GSTIN
                </label>
                <input
                  type="text"
                  maxLength={15}
                  value={formData.gstin}
                  onChange={(e) => setFormData(p => ({ ...p, gstin: e.target.value.toUpperCase() }))}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>

              {/* 7-Digit Bank AD Code */}
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">
                  Bank AD Code (7 Digits)
                </label>
                <input
                  type="text"
                  maxLength={7}
                  value={formData.adCode}
                  onChange={(e) => setFormData(p => ({ ...p, adCode: e.target.value }))}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>

              {/* Consignee Name */}
              <div className="md:col-span-2">
                <label className="text-[11px] font-medium text-slate-600 block mb-1">
                  Consignee / Buyer (Overseas)
                </label>
                <input
                  type="text"
                  value={formData.consigneeName}
                  onChange={(e) => setFormData(p => ({ ...p, consigneeName: e.target.value }))}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>

              {/* Port of Loading */}
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">
                  Port of Loading
                </label>
                <select
                  value={formData.portOfLoading}
                  onChange={(e) => setFormData(p => ({ ...p, portOfLoading: e.target.value as CustomsPort }))}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none font-medium"
                >
                  <option value="INNSA1">Nhava Sheva (INNSA1)</option>
                  <option value="INBOM4">Mumbai Air Cargo (INBOM4)</option>
                </select>
              </div>

              {/* Port of Discharge & Destination Country */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-slate-600 block mb-1">
                    Discharge Port
                  </label>
                  <input
                    type="text"
                    value={formData.portOfDischarge}
                    onChange={(e) => setFormData(p => ({ ...p, portOfDischarge: e.target.value.toUpperCase() }))}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-600 block mb-1">
                    Country
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    value={formData.destinationCountry}
                    onChange={(e) => setFormData(p => ({ ...p, destinationCountry: e.target.value.toUpperCase() }))}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* Currency, Exch Rate, Incoterm */}
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">
                  Currency
                </label>
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData(p => ({ ...p, currency: e.target.value }))}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none font-semibold"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="INR">INR</option>
                  <option value="AED">AED</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">
                  Exchange Rate (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.exchangeRate}
                  onChange={(e) => setFormData(p => ({ ...p, exchangeRate: parseFloat(e.target.value) || 1 }))}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">
                  Incoterm
                </label>
                <select
                  value={formData.incoterm}
                  onChange={(e) => setFormData(p => ({ ...p, incoterm: e.target.value as any }))}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none font-semibold"
                >
                  <option value="FOB">FOB</option>
                  <option value="CIF">CIF</option>
                  <option value="CFR">CFR</option>
                  <option value="EXW">EXW</option>
                </select>
              </div>

              {/* Total Invoice Value */}
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">
                  Header Invoice Total
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.invoiceTotal}
                  onChange={(e) => setFormData(p => ({ ...p, invoiceTotal: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono font-bold text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>

              {/* Manifest Weights: Gross & Net & Packages */}
              <div className="md:col-span-4 grid grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="text-[11px] font-medium text-slate-600 block mb-1">
                    Gross Weight (KG)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.grossWeightKg}
                    onChange={(e) => setFormData(p => ({ ...p, grossWeightKg: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-600 block mb-1">
                    Net Weight (KG)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.netWeightKg}
                    onChange={(e) => setFormData(p => ({ ...p, netWeightKg: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-600 block mb-1">
                    Packages ({formData.packageType || 'BOX'})
                  </label>
                  <input
                    type="number"
                    value={formData.totalPackages}
                    onChange={(e) => setFormData(p => ({ ...p, totalPackages: parseInt(e.target.value) || 1 }))}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-900 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: Editable Line Items Table */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-indigo-600" />
                  Line Items & Tariff Codes
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">
                  ({formData.lineItems.length} {formData.lineItems.length === 1 ? 'item' : 'items'})
                </span>
              </div>

              {/* Table Actions */}
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleAutoFix}
                  className="flex items-center space-x-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-200/60 transition-colors"
                  title="Auto-pad short HSN codes with trailing zeros and synchronize arithmetic totals"
                >
                  <Wand2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Auto-Fix HSN & Totals</span>
                </button>

                <button
                  type="button"
                  onClick={handleAddItem}
                  className="flex items-center space-x-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Item</span>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="border border-slate-200/80 rounded-xl overflow-hidden bg-white shadow-subtle">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-semibold text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-10">#</th>
                    <th className="py-2.5 px-3 min-w-[200px]">Description</th>
                    <th className="py-2.5 px-3 w-32">HSN (8-Digit)</th>
                    <th className="py-2.5 px-2 w-20 text-right">Qty</th>
                    <th className="py-2.5 px-2 w-20 text-center">Unit</th>
                    <th className="py-2.5 px-3 w-24 text-right">Price</th>
                    <th className="py-2.5 px-3 w-28 text-right">Total</th>
                    <th className="py-2.5 px-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {formData.lineItems.map((item, idx) => {
                    const cleanCode = item.hsnCode.replace(/[^0-9]/g, '');
                    const isHsnValid = cleanCode.length === 8;
                    const calculated = Number((item.quantity * item.unitPrice).toFixed(2));
                    const isMathValid = Math.abs(item.total - calculated) <= 0.5;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-2 px-3 text-center font-mono text-slate-400">
                          {item.itemNumber || idx + 1}
                        </td>

                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                            className="w-full bg-transparent px-2 py-1 rounded text-slate-800 hover:bg-slate-100/60 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                            placeholder="Description..."
                          />
                        </td>

                        {/* HSN Code with Inline Validation */}
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            maxLength={8}
                            value={item.hsnCode}
                            onChange={(e) => handleItemChange(idx, 'hsnCode', e.target.value.replace(/[^0-9]/g, ''))}
                            className={`w-full font-mono px-2 py-1 rounded border outline-none transition-colors ${
                              isHsnValid
                                ? 'border-transparent bg-transparent hover:border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-900'
                                : 'border-amber-400 bg-amber-50/60 text-amber-900 font-bold focus:border-amber-500 focus:ring-1 focus:ring-amber-500'
                            }`}
                            placeholder="8-digit code"
                            title={!isHsnValid ? `Must be 8 digits for ICEGATE (found ${item.hsnCode.length})` : 'Valid 8-digit HSN'}
                          />
                        </td>

                        {/* Qty */}
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            step="any"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-full font-mono text-right bg-transparent px-1.5 py-1 rounded hover:bg-slate-100/60 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800"
                          />
                        </td>

                        {/* UQC Dropdown */}
                        <td className="py-2 px-2 text-center">
                          <select
                            value={item.uqc}
                            onChange={(e) => handleItemChange(idx, 'uqc', e.target.value)}
                            className="bg-slate-50 border border-slate-200 text-[11px] font-mono font-medium rounded px-1.5 py-1 text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            {ICEGATE_UQC_LIST.map(u => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </td>

                        {/* Unit Price */}
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            step="any"
                            value={item.unitPrice}
                            onChange={(e) => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-full font-mono text-right bg-transparent px-1.5 py-1 rounded hover:bg-slate-100/60 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none text-slate-800"
                          />
                        </td>

                        {/* Total with Inline Math Validation */}
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={item.total}
                            onChange={(e) => handleItemChange(idx, 'total', parseFloat(e.target.value) || 0)}
                            className={`w-full font-mono font-bold text-right px-1.5 py-1 rounded border outline-none ${
                              isMathValid
                                ? 'border-transparent bg-transparent hover:border-slate-200 focus:bg-white focus:border-indigo-500 text-slate-900'
                                : 'border-rose-400 bg-rose-50/60 text-rose-900'
                            }`}
                            title={!isMathValid ? `Math drift: Expected ${calculated}` : 'Math balances'}
                          />
                        </td>

                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(idx)}
                            disabled={formData.lineItems.length <= 1}
                            className="p-1 text-slate-300 hover:text-rose-600 rounded disabled:opacity-30 transition-colors"
                            title="Delete Item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 3: Modal Footer with Math Balance Area */}
          <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
            {/* Left: Math Balance Indicator */}
            <div className="flex items-center space-x-3">
              <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                isBalanced
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}>
                {isBalanced ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Totals Reconciled</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Variance: {mathDiff.toFixed(2)} {formData.currency}</span>
                  </>
                )}
              </div>

              <div className="text-xs text-slate-500 font-mono">
                Items Sum: <strong className="text-slate-800">{itemsSum.toFixed(2)}</strong> | Header Total: <strong className="text-slate-800">{headerTotal.toFixed(2)}</strong>
              </div>
            </div>

            {/* Right: Action Buttons */}
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all"
              >
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
