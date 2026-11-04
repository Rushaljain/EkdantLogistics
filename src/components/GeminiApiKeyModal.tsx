import React, { useState } from 'react';
import { X, Sparkles, Key, CheckCircle, ExternalLink, ShieldCheck } from 'lucide-react';

interface GeminiApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentKey: string;
  onSaveKey: (newKey: string) => void;
}

export const GeminiApiKeyModal: React.FC<GeminiApiKeyModalProps> = ({
  isOpen,
  onClose,
  currentKey,
  onSaveKey
}) => {
  const [apiKey, setApiKey] = useState<string>(() => {
    return currentKey && !currentKey.startsWith('AQ.') ? currentKey : '';
  });
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = apiKey.trim();

    if (!cleanKey) {
      setError('Please enter a Gemini API key.');
      return;
    }

    setError(null);
    onSaveKey(cleanKey);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-xs select-none">
      <div className="bg-white border border-zinc-200 rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-3.5 bg-zinc-50/80 border-b border-zinc-200 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center border border-zinc-200">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-zinc-900 tracking-tight">
                Google Gemini API Key
              </h2>
              <p className="text-[11px] text-zinc-400 font-normal">
                Required for AI PDF parsing & data extraction
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="text-zinc-400 hover:text-zinc-600 p-1 rounded-md hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
          <div>
            <label className="text-[11px] font-medium text-zinc-700 block mb-1">
              Gemini API Key
            </label>
            <div className="relative">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setError(null);
                }}
                placeholder="AIzaSy..."
                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-1.5 pr-8 text-zinc-900 font-mono text-xs focus:bg-white focus:border-zinc-400 outline-none transition-colors"
                autoFocus
              />
              <Key className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {error && (
              <p className="text-[11px] text-rose-600 mt-1 font-medium">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between mt-2 text-[11px] text-zinc-500">
              <span className="flex items-center gap-1 text-zinc-400">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Saved in your browser
              </span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-zinc-900 hover:underline font-medium flex items-center gap-1"
              >
                Get API key from Google <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-[11px] text-zinc-600 leading-relaxed">
            <span className="font-semibold text-zinc-900 block mb-0.5">Where do I find this?</span>
            Visit <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-zinc-900 font-medium underline">Google AI Studio</a>, click <strong>Create API key</strong>, and paste the key here. It will be stored in your browser session.
          </div>

          {/* Action buttons */}
          <div className="pt-1 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-3.5 py-1.5 rounded-lg text-xs transition-colors shadow-2xs cursor-pointer"
            >
              {isSaved ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Saved!</span>
                </>
              ) : (
                <span>Save Key</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
