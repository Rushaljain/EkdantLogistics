import React from 'react';
import { 
  CheckCircle2, 
  Scale, 
  Binary, 
  Calculator, 
  ShieldAlert, 
  Wand2, 
  Sparkles,
  FileKey
} from 'lucide-react';
import type { CustomsAuditReport } from '../types/customs';

interface AuditStatusBarProps {
  auditReport: CustomsAuditReport;
  onAutoPadAllHsns: () => void;
  onAutoReconcileMath: () => void;
}

export const AuditStatusBar: React.FC<AuditStatusBarProps> = ({
  auditReport,
  onAutoPadAllHsns,
  onAutoReconcileMath
}) => {
  return (
    <div className="bg-slate-900 border-b border-slate-800 px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Compliance checklist chips */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Strict 8-Digit HSN Rule */}
          <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs border transition-colors ${
            auditReport.allHsnValid
              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/80'
              : 'bg-rose-950/50 text-rose-300 border-rose-800 animate-pulse'
          }`}>
            <Binary className="w-3.5 h-3.5" />
            <span className="font-semibold">
              8-Digit HSN: {auditReport.allHsnValid ? '100% Valid' : `${auditReport.invalidHsnCount} Truncated`}
            </span>
            {!auditReport.allHsnValid && (
              <button
                onClick={onAutoPadAllHsns}
                className="ml-1 bg-rose-700 hover:bg-rose-600 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 font-bold shadow"
                title="Auto-pad 2/4/6 digit codes with trailing zeroes to reach 8 digits"
              >
                <Wand2 className="w-2.5 h-2.5" /> Auto-Fix
              </button>
            )}
          </div>

          {/* 2. Arithmetic Reconciliation Rule */}
          <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs border transition-colors ${
            auditReport.isHeaderMathBalanced
              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/80'
              : 'bg-amber-950/50 text-amber-300 border-amber-800'
          }`}>
            <Calculator className="w-3.5 h-3.5" />
            <span className="font-semibold">
              Math Drift: {auditReport.isHeaderMathBalanced ? 'Balanced (Δ ≤ 0.5)' : `Diff: ${auditReport.headerMathDifference}`}
            </span>
            {!auditReport.isHeaderMathBalanced && (
              <button
                onClick={onAutoReconcileMath}
                className="ml-1 bg-amber-600 hover:bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 font-bold shadow"
                title="Auto-sync Header total to match sum of Line Items"
              >
                <Sparkles className="w-2.5 h-2.5" /> Balance
              </button>
            )}
          </div>

          {/* 3. Physical Weight Logic (Gross >= Net) */}
          <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs border ${
            auditReport.weightRulePassed
              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/80'
              : 'bg-rose-950/60 text-rose-200 border-rose-700'
          }`}>
            <Scale className="w-3.5 h-3.5" />
            <span className="font-semibold">
              Weight Rule: {auditReport.weightRulePassed ? 'Gross ≥ Net' : 'Gross < Net (REJECT)'}
            </span>
          </div>

          {/* 4. e-Sanchit IRN DSC status */}
          <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs border ${
            auditReport.hasESanchitIrn
              ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/80'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}>
            <FileKey className="w-3.5 h-3.5" />
            <span className="font-semibold">
              e-Sanchit IRN: {auditReport.hasESanchitIrn ? 'DSC Bound' : 'Missing (16-char)'}
            </span>
          </div>
        </div>

        {/* Global ICEGATE Clearance Readiness Pill */}
        <div className="flex items-center space-x-2">
          {auditReport.overallAuditPassed ? (
            <div className="flex items-center space-x-1.5 bg-emerald-600/20 text-emerald-400 border border-emerald-600 px-3 py-1 rounded-full text-xs font-bold shadow-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>ICEGATE PRE-CHECK PASSED</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 bg-rose-600/20 text-rose-400 border border-rose-600 px-3 py-1 rounded-full text-xs font-bold shadow-sm">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>ACTION REQUIRED (CUSTOMS QUERIES DETECTED)</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
