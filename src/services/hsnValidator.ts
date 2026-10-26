// Strict 8-Digit Indian Customs Tariff / RITC (Request Information Tariff Classification) Validator
// In accordance with Customs Tariff Act, 1975 & ICEGATE Electronic Data Interchange specs

export interface HsnValidationResult {
  isValid: boolean;
  cleanedCode: string;
  length: number;
  chapter?: string;
  chapterDescription?: string;
  suggestedFix?: string;
  reason?: string;
}

// Major Chapters commonly handled by Indian CHAs (Nhava Sheva / Mumbai Air Cargo)
export const COMMON_CUSTOMS_CHAPTERS: Record<string, string> = {
  '84': 'Nuclear reactors, boilers, machinery and mechanical appliances; parts thereof',
  '85': 'Electrical machinery and equipment and parts thereof; sound recorders and reproducers',
  '73': 'Articles of iron or steel',
  '72': 'Iron and steel',
  '29': 'Organic chemicals',
  '30': 'Pharmaceutical products',
  '39': 'Plastics and articles thereof',
  '61': 'Articles of apparel and clothing accessories, knitted or crocheted',
  '62': 'Articles of apparel and clothing accessories, not knitted or crocheted',
  '63': 'Other made up textile articles; sets; worn clothing',
  '71': 'Natural or cultured pearls, precious or semi-precious stones, precious metals',
  '87': 'Vehicles other than railway or tramway rolling-stock, and parts and accessories',
  '90': 'Optical, photographic, cinematographic, measuring, checking, precision instruments',
  '94': 'Furniture; bedding, mattresses, mattress supports, cushions',
  '38': 'Miscellaneous chemical products',
  '48': 'Paper and paperboard; articles of paper pulp, of paper or of paperboard',
  '68': 'Articles of stone, plaster, cement, asbestos, mica or similar materials',
  '76': 'Aluminium and articles thereof',
  '82': 'Tools, implements, cutlery, spoons and forks, of base metal',
  '83': 'Miscellaneous articles of base metal'
};

/**
 * Validates an HSN/RITC code strictly against ICEGATE 8-digit requirements.
 */
export function validateHsnCode(rawHsn: string | number | undefined | null): HsnValidationResult {
  if (!rawHsn) {
    return {
      isValid: false,
      cleanedCode: '',
      length: 0,
      reason: 'HSN code is missing'
    };
  }

  // Strip spaces, dots, dashes (e.g., "8481.80.90" -> "84818090")
  const cleaned = String(rawHsn).replace(/[^0-9]/g, '');
  const length = cleaned.length;
  const chapter = length >= 2 ? cleaned.substring(0, 2) : undefined;
  const chapterDescription = chapter ? COMMON_CUSTOMS_CHAPTERS[chapter] : undefined;

  if (length === 8) {
    return {
      isValid: true,
      cleanedCode: cleaned,
      length: 8,
      chapter,
      chapterDescription
    };
  }

  // Invalid length detection & auto-pad suggestion
  let suggestedFix: string | undefined = undefined;
  let reason = '';

  if (length < 8) {
    // ICEGATE pad with trailing zeroes
    suggestedFix = cleaned.padEnd(8, '0');
    reason = `Truncated code (${length} digits). ICEGATE mandates exact 8-digit RITC code.`;
  } else {
    suggestedFix = cleaned.substring(0, 8);
    reason = `Excess digits (${length} digits). Truncated to 8-digit RITC code.`;
  }

  return {
    isValid: false,
    cleanedCode: cleaned,
    length,
    chapter,
    chapterDescription,
    suggestedFix,
    reason
  };
}

/**
 * Quick helper to auto-fix an HSN code to 8 digits
 */
export function autoPadHsn(rawHsn: string | number | undefined | null): string {
  const result = validateHsnCode(rawHsn);
  if (result.isValid) return result.cleanedCode;
  return result.suggestedFix || '84818090';
}
