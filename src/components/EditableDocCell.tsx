import React, { useRef } from 'react';

interface EditableDocCellProps {
  label: string;
  boxNumber?: string;
  value: string;
  onChange: (newValue: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  stage2Key?: string;
}

export function EditableDocCell({
  label,
  boxNumber,
  value,
  onChange,
  multiline = false,
  rows = 3,
  placeholder,
  className = '',
  inputClassName = '',
  stage2Key
}: EditableDocCellProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const isBlank = !value || value.trim() === '' || value.trim() === '---';
  const effectivePlaceholder = placeholder || `+ Enter ${label}`;

  const handleCellClick = () => {
    inputRef.current?.focus();
  };

  return (
    <div
      onClick={handleCellClick}
      className={`relative p-1.5 transition-all cursor-text flex flex-col justify-start group border border-slate-300 ${
        isBlank ? 'bg-amber-50/60' : 'bg-white'
      } hover:border-dashed hover:border-slate-500 focus-within:ring-2 focus-within:ring-sky-500 focus-within:bg-white focus-within:border-sky-500 ${className}`}
    >
      {/* Box Number & Field Label */}
      <div className="flex items-center justify-between mb-0.5 select-none pointer-events-none">
        <span className="text-[8px] font-bold text-slate-700 tracking-wider uppercase truncate leading-none">
          {boxNumber ? `${boxNumber}. ${label}` : label}
        </span>
        {isBlank && (
          <span className="text-[7.5px] font-mono font-bold text-amber-700 bg-amber-100/80 px-1 py-0.2 rounded border border-amber-300">
            Pending
          </span>
        )}
      </div>

      {/* In-place Editable Input / Textarea */}
      {multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          id={stage2Key ? `stage2-${stage2Key}` : undefined}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={effectivePlaceholder}
          className={`w-full bg-transparent text-[10px] font-semibold text-slate-900 placeholder:text-amber-800/60 placeholder:italic font-mono leading-tight focus:outline-none resize-none p-0.5 border-0 ${inputClassName}`}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          id={stage2Key ? `stage2-${stage2Key}` : undefined}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={effectivePlaceholder}
          className={`w-full bg-transparent text-[10px] font-semibold text-slate-900 placeholder:text-amber-800/60 placeholder:italic font-mono leading-tight focus:outline-none p-0.5 border-0 ${inputClassName}`}
        />
      )}
    </div>
  );
}
