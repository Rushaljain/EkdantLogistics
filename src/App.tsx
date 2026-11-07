import React, { useEffect, useState } from 'react';
import {
  RotateCcw,
  CheckCircle2,
  Layers,
  FileText,
  Boxes,
  Database,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import type { UploadMode, ExtractedShipmentJSON, DGManifest, BLManifest } from './types';
import { createEmptyShipmentJSON, createEmptyDGManifest, createEmptyBLManifest, deriveDGManifestFromJSON, deriveBLManifestFromDG } from './types';
import { purgeAllWorkspaceStorage } from './utils/storageReset';

export function App(): React.JSX.Element {
  const [mode, setMode] = useState<UploadMode>('SINGLE_INVOICE');
  const [isPurging, setIsPurging] = useState(false);
  const [lastPurgedAt, setLastPurgedAt] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<number>(1);
  const [emptyJson, setEmptyJson] = useState<ExtractedShipmentJSON>(() => createEmptyShipmentJSON('SINGLE_INVOICE'));
  const [emptyDg, setEmptyDg] = useState<DGManifest>(() => createEmptyDGManifest());
  const [emptyBl, setEmptyBl] = useState<BLManifest>(() => createEmptyBLManifest());

  // Execute hard purge on initial mount to guarantee clean-slate
  useEffect(() => {
    let isMounted = true;
    purgeAllWorkspaceStorage()
      .then(() => {
        if (isMounted) {
          setLastPurgedAt(new Date().toLocaleTimeString());
        }
      })
      .catch((err) => {
        console.error('Initial storage purge failed:', err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleHardReset = async () => {
    setIsPurging(true);
    try {
      await purgeAllWorkspaceStorage();
      const freshJson = createEmptyShipmentJSON(mode);
      const freshDg = deriveDGManifestFromJSON(freshJson);
      const freshBl = deriveBLManifestFromDG(freshDg, undefined, freshJson);
      setEmptyJson(freshJson);
      setEmptyDg(freshDg);
      setEmptyBl(freshBl);
      setLastPurgedAt(new Date().toLocaleTimeString());
      setActiveStep(1);
    } finally {
      setIsPurging(false);
    }
  };

  const handleModeChange = (newMode: UploadMode) => {
    setMode(newMode);
    const freshJson = createEmptyShipmentJSON(newMode);
    const freshDg = deriveDGManifestFromJSON(freshJson);
    const freshBl = deriveBLManifestFromDG(freshDg, undefined, freshJson);
    setEmptyJson(freshJson);
    setEmptyDg(freshDg);
    setEmptyBl(freshBl);
  };

  const steps = [
    { num: 1, title: '1. Raw JSON State', desc: 'Universal Truth Object (Post-Parse)', status: 'Clean Slate Ready' },
    { num: 2, title: '2. DG Manifest', desc: 'IMO Boxes 1 to 22 (Zero Fallbacks)', status: 'Schema Ready' },
    { num: 3, title: '3. BL Manifest', desc: '30 Master Fields (Auto-Inherited)', status: 'Inheritance Active' },
    { num: 4, title: '4. Output Render', desc: 'Document Agnostic Issuance', status: 'Standby for Phase 2' }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Boxes className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold tracking-tight text-white">EKDANT LOGISTICS</h1>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Clean Slate v2.0
                </span>
              </div>
              <p className="text-xs text-slate-400">Universal Maritime Extraction & 2-Manifest Engine</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {lastPurgedAt && (
              <div className="hidden sm:flex items-center space-x-2 text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-3 py-1.5 rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Storage Purged: {lastPurgedAt}</span>
              </div>
            )}
            <button
              id="hard-reset-btn"
              onClick={handleHardReset}
              disabled={isPurging}
              className="inline-flex items-center space-x-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-800 hover:border-red-700 transition disabled:opacity-50 cursor-pointer shadow-sm shadow-red-950"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isPurging ? 'animate-spin' : ''}`} />
              <span>{isPurging ? 'Purging Storage...' : 'Hard Reset Storage & Session'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-8">
        {/* Upload Mode Selector Card */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <Layers className="w-5 h-5 text-cyan-400" />
                <h2 className="text-base font-semibold text-white">Shipment Ingestion Mode</h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Select whether incoming documents represent a single invoice or multi-invoice consolidation. Never auto-guessed.
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <label htmlFor="upload-mode-select" className="text-xs font-medium text-slate-300 whitespace-nowrap">
                Upload Mode:
              </label>
              <select
                id="upload-mode-select"
                value={mode}
                onChange={(e) => handleModeChange(e.target.value as UploadMode)}
                className="bg-slate-800 text-white border border-slate-700 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500 hover:border-slate-600 transition"
              >
                <option value="SINGLE_INVOICE">Mode 1: Single Invoice → 1 DG & 1 BL</option>
                <option value="MULTI_INVOICE">Mode 2: Multi-Invoice Consolidation → 1 DG & 1 BL</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <div
              onClick={() => handleModeChange('SINGLE_INVOICE')}
              className={`p-4 rounded-xl border cursor-pointer transition ${
                mode === 'SINGLE_INVOICE'
                  ? 'bg-cyan-950/30 border-cyan-500/60 ring-1 ring-cyan-500/30'
                  : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">Mode 1: Single Invoice Ingestion</span>
                {mode === 'SINGLE_INVOICE' && <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Processes a single commercial invoice with packing list and generates 1 DG Declaration and 1 Master BL.
              </p>
            </div>

            <div
              onClick={() => handleModeChange('MULTI_INVOICE')}
              className={`p-4 rounded-xl border cursor-pointer transition ${
                mode === 'MULTI_INVOICE'
                  ? 'bg-cyan-950/30 border-cyan-500/60 ring-1 ring-cyan-500/30'
                  : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">Mode 2: Multi-Invoice Consolidation</span>
                {mode === 'MULTI_INVOICE' && <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Consolidates multiple commercial invoices & packing lists into a single consolidated DG Declaration and 1 Master BL.
              </p>
            </div>
          </div>
        </section>

        {/* 4-Step Pipeline Status */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-wider font-bold text-slate-400">
              Two-Manifest Processing Pipeline
            </h3>
            <span className="text-xs text-cyan-400 font-medium">Phase 1: Foundation Verified</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((s) => {
              const isSelected = activeStep === s.num;
              return (
                <div
                  key={s.num}
                  onClick={() => setActiveStep(s.num)}
                  className={`p-4 rounded-xl border transition cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 border-cyan-500 ring-1 ring-cyan-500/30'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      Step {s.num}
                    </span>
                    <span className="text-[11px] font-medium text-cyan-400 flex items-center space-x-1">
                      <Sparkles className="w-3 h-3" />
                      <span>{s.status}</span>
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-white mt-2">{s.title}</h4>
                  <p className="text-xs text-slate-400 mt-1">{s.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Foundation Architecture Highlights */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
              <Database className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-semibold text-white">Zero State Bleed</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              `IndexedDB`, `localStorage`, and `sessionStorage` have been completely decoupled. New upload sessions start on an isolated, clean slate.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-semibold text-white">Strict Zero-Fallback Schema</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Missing fields default strictly to empty string `""`—never synthetic strings like `"NA"`, `"TBN"`, or fabricated random container/seal numbers.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-purple-950 border border-purple-800 flex items-center justify-center text-purple-400">
              <FileText className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-semibold text-white">2-Manifest Auto-Inheritance</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Shared fields automatically propagate from DG Manifest (Boxes 1–22) into Master BL Manifest (30 fields), leaving only pending BL inputs.
            </p>
          </div>
        </section>

        {/* Diagnostic Inspector for Current Step */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Active Step Inspector:
              </span>
              <span className="text-sm font-semibold text-cyan-400">
                {steps[activeStep - 1]?.title}
              </span>
            </div>
            <span className="text-xs text-slate-400">
              Mode: <code className="text-cyan-300 font-mono">{mode}</code>
            </span>
          </div>

          <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 font-mono text-xs overflow-x-auto max-h-72 text-slate-300">
            {activeStep === 1 && (
              <pre>{JSON.stringify(emptyJson, null, 2)}</pre>
            )}
            {activeStep === 2 && (
              <pre>{JSON.stringify(emptyDg, null, 2)}</pre>
            )}
            {activeStep === 3 && (
              <pre>{JSON.stringify(emptyBl, null, 2)}</pre>
            )}
            {activeStep === 4 && (
              <div className="text-center py-8 text-slate-400 space-y-2 font-sans">
                <CheckCircle2 className="w-8 h-8 text-cyan-400 mx-auto" />
                <p className="font-semibold text-white">Phase 1 Reset Complete & Ready</p>
                <p className="text-xs max-w-md mx-auto text-slate-400">
                  Clean-slate baseline established. No extractors or document generators have been built yet per Phase 1 instructions. Ready for Phase 2 implementation.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 px-6 py-4 text-center text-xs text-slate-400">
        Ekdant Logistics &bull; Phase 1 Clean-Slate Verification Shell &bull; Universal Maritime Architecture
      </footer>
    </div>
  );
}

export default App;
