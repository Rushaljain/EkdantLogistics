import React, { useState, useRef } from 'react';
import { Header } from './components/Header';
import { PdfViewerPane } from './components/PdfViewerPane';
import { AuditStatusBar } from './components/AuditStatusBar';
import { CustomsHeaderCards } from './components/CustomsHeaderCards';
import { LineItemsGrid } from './components/LineItemsGrid';
import { StickyMathFooter } from './components/StickyMathFooter';
import { EdiInspectorModal } from './components/EdiInspectorModal';
import { GeminiApiKeyModal } from './components/GeminiApiKeyModal';
import { SAMPLE_SHIPMENT_NHAVA_SHEVA } from './data/mockInvoices';
import type { 
  ShipmentData, 
  CustomsPortCode, 
  UserRole, 
  LineItemData, 
  ExporterMasterData 
} from './types/customs';
import { 
  runCustomsPreflightAudit, 
  autoReconcileHeaderTotal 
} from './services/arithmeticReconciliation';
import { autoPadHsn, validateHsnCode } from './services/hsnValidator';
import { 
  extractInvoiceWithGemini, 
  buildShipmentFromExtractedData 
} from './services/geminiExtraction';
import { saveShipment, getSavedShipments } from './services/supabaseClient';
import { Loader2, Sparkles } from 'lucide-react';

export function App() {
  const [shipment, setShipment] = useState<ShipmentData>(() => {
    const saved = getSavedShipments();
    return saved.length > 0 ? saved[0] : SAMPLE_SHIPMENT_NHAVA_SHEVA;
  });

  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
  const [userRole, setUserRole] = useState<UserRole>('OPERATOR');
  const [isEdiModalOpen, setIsEdiModalOpen] = useState<boolean>(false);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState<boolean>(false);
  const [geminiKey, setGeminiKey] = useState<string>(() => {
    return localStorage.getItem('ekdant_gemini_key') || import.meta.env.VITE_GEMINI_API_KEY || '';
  });
  const [geminiModel, setGeminiModel] = useState<string>('gemini-2.5-flash');
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [uploadedPdfUrl, setUploadedPdfUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Recalculate audit report whenever shipment changes
  const updateShipmentWithAudit = (updated: ShipmentData) => {
    const auditReport = runCustomsPreflightAudit(
      updated.exporter,
      updated.invoice,
      updated.packages,
      updated.lineItems
    );
    const newShipment = {
      ...updated,
      auditReport,
      status: auditReport.overallAuditPassed ? ('AUDIT_PASSED' as const) : ('AUDIT_PENDING' as const)
    };
    setShipment(newShipment);
    saveShipment(newShipment);
  };

  // Port change handler
  const handlePortChange = (port: CustomsPortCode) => {
    updateShipmentWithAudit({
      ...shipment,
      portCode: port,
      customsHouse: port === 'INNSA1' ? 'Nhava Sheva / JNPT' : 'Mumbai Air Cargo',
      invoice: {
        ...shipment.invoice,
        portOfLoading: port
      }
    });
  };

  // 1-Click Auto-Balance Header Math
  const handleAutoReconcileMath = () => {
    const newHeaderTotal = autoReconcileHeaderTotal(shipment.lineItems);
    updateShipmentWithAudit({
      ...shipment,
      invoice: {
        ...shipment.invoice,
        invoiceTotal: newHeaderTotal
      }
    });
  };

  // 1-Click Auto-Pad all HSNs to 8 digits
  const handleAutoPadAllHsns = () => {
    const updatedLineItems = shipment.lineItems.map(item => {
      const padded = autoPadHsn(item.hsnCode);
      const hsnResult = validateHsnCode(padded);
      return {
        ...item,
        hsnCode: padded,
        isHsnValid: hsnResult.isValid
      };
    });
    updateShipmentWithAudit({
      ...shipment,
      lineItems: updatedLineItems
    });
  };

  // Update Exporter Master
  const handleUpdateExporter = (exporter: ExporterMasterData) => {
    updateShipmentWithAudit({
      ...shipment,
      exporter,
      portCode: exporter.defaultPortCode || shipment.portCode
    });
  };

  // Update Invoice Header
  const handleUpdateInvoice = (invoicePartial: Partial<ShipmentData['invoice']>) => {
    updateShipmentWithAudit({
      ...shipment,
      invoice: {
        ...shipment.invoice,
        ...invoicePartial
      }
    });
  };

  // Update Packages & Weights
  const handleUpdatePackages = (packagesPartial: Partial<ShipmentData['packages']>) => {
    const updatedPackages = {
      ...shipment.packages,
      ...packagesPartial
    };
    updatedPackages.weightRulePassed = updatedPackages.grossWeightKg >= updatedPackages.netWeightKg;
    updateShipmentWithAudit({
      ...shipment,
      packages: updatedPackages
    });
  };

  // Line item handlers
  const handleUpdateItem = (index: number, updatedItem: LineItemData) => {
    const newItems = [...shipment.lineItems];
    newItems[index] = updatedItem;
    updateShipmentWithAudit({
      ...shipment,
      lineItems: newItems
    });
  };

  const handleAddItem = () => {
    const nextNum = shipment.lineItems.length + 1;
    const newItem: LineItemData = {
      id: `item-${Date.now()}`,
      itemNumber: nextNum,
      description: 'NEW INDUSTRIAL GOODS LINE ITEM',
      hsnCode: '84818090',
      quantity: 1,
      uqc: 'PCS',
      unitPrice: 100.00,
      itemTotalValue: 100.00,
      calculatedTotal: 100.00,
      isLineMathValid: true,
      isHsnValid: true,
      schemeCode: '00'
    };
    updateShipmentWithAudit({
      ...shipment,
      lineItems: [...shipment.lineItems, newItem]
    });
  };

  const handleDuplicateItem = (index: number) => {
    const source = shipment.lineItems[index];
    const cloned: LineItemData = {
      ...source,
      id: `item-${Date.now()}`,
      itemNumber: shipment.lineItems.length + 1
    };
    const newItems = [...shipment.lineItems];
    newItems.splice(index + 1, 0, cloned);
    updateShipmentWithAudit({
      ...shipment,
      lineItems: newItems
    });
  };

  const handleDeleteItem = (index: number) => {
    if (shipment.lineItems.length <= 1) return;
    const newItems = shipment.lineItems.filter((_, idx) => idx !== index);
    updateShipmentWithAudit({
      ...shipment,
      lineItems: newItems
    });
  };

  // PDF File Upload & Gemini AI Extraction
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileUrl = URL.createObjectURL(file);
    setUploadedPdfUrl(fileUrl);

    // If no Gemini key, notify and open key modal
    if (!geminiKey) {
      setIsKeyModalOpen(true);
      return;
    }

    try {
      setIsExtracting(true);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          const extracted = await extractInvoiceWithGemini(base64, geminiKey, geminiModel);
          const newShipment = buildShipmentFromExtractedData(extracted, file.name);
          updateShipmentWithAudit(newShipment);
        } catch (err: any) {
          alert(`Gemini Extraction Error: ${err.message || 'Failed to extract invoice'}`);
        } finally {
          setIsExtracting(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setIsExtracting(false);
      console.error(err);
    }
  };

  const handleSaveGeminiKey = (newKey: string, model: string) => {
    setGeminiKey(newKey);
    setGeminiModel(model);
    localStorage.setItem('ekdant_gemini_key', newKey);
  };

  const handleLoadSample = (sample: ShipmentData) => {
    setUploadedPdfUrl(null);
    updateShipmentWithAudit(sample);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <Header
        currentPort={shipment.portCode}
        onPortChange={handlePortChange}
        userRole={userRole}
        onRoleChange={setUserRole}
        hasGeminiKey={Boolean(geminiKey)}
        onOpenKeyModal={() => setIsKeyModalOpen(true)}
        onLoadSample={handleLoadSample}
        onUploadPdfClick={() => fileInputRef.current?.click()}
        jobNo={shipment.jobNo}
      />

      {/* Hidden File Input for PDF Ingestion */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Gemini AI Extraction Loading Overlay */}
      {isExtracting && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
          <div className="p-4 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col items-center max-w-sm">
            <Loader2 className="w-10 h-10 text-sky-400 animate-spin mb-3" />
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-400" /> Google Gemini Vision
            </h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              Extracting structured Indian Customs EDI line items, 8-digit HSN codes, UQC values, and commercial totals...
            </p>
          </div>
        </div>
      )}

      {/* Main Split-Screen HITL Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane: Interactive Document & PDF Preview (45% Width) */}
        <div className="w-[45%] h-full hidden md:block">
          <PdfViewerPane
            shipment={shipment}
            activeItemIndex={activeItemIndex}
            uploadedPdfUrl={uploadedPdfUrl}
          />
        </div>

        {/* Right Pane: HITL Audit & Reconciliation Engine (55% Width) */}
        <div className="flex-1 h-full flex flex-col overflow-hidden bg-slate-950">
          {/* Compliance Status Bar */}
          <AuditStatusBar
            auditReport={shipment.auditReport}
            onAutoPadAllHsns={handleAutoPadAllHsns}
            onAutoReconcileMath={handleAutoReconcileMath}
          />

          {/* Exporter, Commercial Invoice, and Weight Master Cards */}
          <CustomsHeaderCards
            shipment={shipment}
            onUpdateExporter={handleUpdateExporter}
            onUpdateInvoice={handleUpdateInvoice}
            onUpdatePackages={handleUpdatePackages}
          />

          {/* Interactive Line Items Grid */}
          <LineItemsGrid
            items={shipment.lineItems}
            currency={shipment.invoice.currency}
            onUpdateItem={handleUpdateItem}
            onAddItem={handleAddItem}
            onDuplicateItem={handleDuplicateItem}
            onDeleteItem={handleDeleteItem}
            onHoverItem={setActiveItemIndex}
          />

          {/* Sticky Reconciled Math Footer with Exporters */}
          <StickyMathFooter
            shipment={shipment}
            onAutoReconcile={handleAutoReconcileMath}
            onOpenEdiInspector={() => setIsEdiModalOpen(true)}
          />
        </div>
      </div>

      {/* ICEGATE ICES 1.5 Flat File Inspector Modal */}
      <EdiInspectorModal
        isOpen={isEdiModalOpen}
        onClose={() => setIsEdiModalOpen(false)}
        shipment={shipment}
      />

      {/* Gemini Vision API Key Configuration Modal */}
      <GeminiApiKeyModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        currentKey={geminiKey}
        onSaveKey={handleSaveGeminiKey}
      />
    </div>
  );
}

export default App;
