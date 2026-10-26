import React, { useState } from 'react';
import { X, Sparkles, Key, CheckCircle, ExternalLink } from 'lucide-react';

interface GeminiApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentKey: string;
  onSaveKey: (newKey: string, model: string) => void;
}

export const GeminiApiKeyModal: React.FC<GeminiApiKeyModalProps> = ({
  isOpen,
  onClose,
  currentKey,
  onSaveKey
}) => {
  const [apiKey, setApiKey] = useState<string>(currentKey);
  const [model, setModel] = useState<string>('gemini-2.5-flash');
  const [isSaved, setIsSaved] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveKey(apiKey.trim(), model);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-950 border border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-sky-400" />
            <h2 className="text-sm font-bold text-white">
              Google Gemini Vision Engine Configuration
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
          <div>
            <p className="text-slate-300 leading-relaxed mb-3">
              Ekdant Logistics utilizes Google Gemini Vision to ingest multi-page commercial invoices and packing lists (SAP, Tally, scanned exports) directly into structured ICEGATE EDI records.
            </p>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-300 block mb-1">
              Google Gemini API Key
            </label>
            <div className="relative">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-100 font-mono text-xs focus:ring-1 focus:ring-sky-500 outline-none"
              />
              <Key className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
            </div>
            <p className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
              <span>Saved locally in your secure browser session</span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:underline flex items-center gap-1"
              >
                Get API Key <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </p>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-300 block mb-1">
              Vision Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-100 text-xs focus:ring-1 focus:ring-sky-500 outline-none font-mono"
            >
              <option value="gemini-2.5-flash">gemini-2.5-flash (Recommended - Fast & High Precision)</option>
              <option value="gemini-1.5-flash">gemini-1.5-flash (High Availability Fallback)</option>
            </select>
          </div>

          <div className="pt-2 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center space-x-1.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold px-4 py-2 rounded text-xs transition-colors shadow-sm"
            >
              {isSaved ? (
                <>
                  <CheckCircle className="w-4 h-4 text-emerald-300" />
                  <span>Saved!</span>
                </>
              ) : (
                <span>Save Configuration</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
