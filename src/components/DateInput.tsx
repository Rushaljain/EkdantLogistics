import React, { useRef } from 'react';
import { Calendar } from 'lucide-react';

export function parseDateToIso(str?: string | null): string {
  if (!str) return '';
  const trimmed = str.trim();
  if (!trimmed) return '';

  // Check if already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Check DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY or DD/MM/YY
  const parts = trimmed.split(/[./-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    let year = parts[2];
    if (year.length === 2) {
      year = `20${year}`;
    }
    if (year.length === 4) {
      return `${year}-${month}-${day}`;
    }
  }

  // Fallback to Date parser
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  return '';
}

export function formatIsoToDDMMYYYY(isoStr: string): string {
  if (!isoStr) return '';
  const parts = isoStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return isoStr;
}

interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
}

export const DateInput: React.FC<DateInputProps> = ({
  value,
  onChange,
  placeholder = 'DD/MM/YYYY',
  className = '',
  required = false,
  disabled = false,
  id
}) => {
  const hiddenDateInputRef = useRef<HTMLInputElement>(null);
  const isoValue = parseDateToIso(value);

  const handleIsoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) {
      onChange('');
      return;
    }
    const [y, m, d] = val.split('-');
    if (y && m && d) {
      onChange(`${d}/${m}/${y}`);
    }
  };

  const handleIconClick = () => {
    if (hiddenDateInputRef.current) {
      try {
        if (typeof hiddenDateInputRef.current.showPicker === 'function') {
          hiddenDateInputRef.current.showPicker();
        } else {
          hiddenDateInputRef.current.focus();
        }
      } catch {
        hiddenDateInputRef.current.focus();
      }
    }
  };

  return (
    <div className="relative flex items-center w-full">
      <input
        type="text"
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={`w-full px-3 py-2 pr-9 rounded-lg bg-surface border border-divider focus:border-brand-primary text-content-primary font-mono outline-none transition-colors ${className}`}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6">
        <button
          type="button"
          tabIndex={-1}
          onClick={handleIconClick}
          className="text-content-muted hover:text-brand-primary transition-colors cursor-pointer p-0.5"
          title="Choose date from calendar dropdown"
        >
          <Calendar className="w-4 h-4" />
        </button>
        <input
          ref={hiddenDateInputRef}
          type="date"
          tabIndex={-1}
          value={isoValue}
          onChange={handleIsoChange}
          disabled={disabled}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer pointer-events-auto"
          title="Choose date from calendar dropdown"
        />
      </div>
    </div>
  );
};
