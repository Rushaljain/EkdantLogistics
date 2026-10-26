// ICEGATE Official Standard UQC (Unit Quantity Code) Normalizer
// Based on Indian Customs Electronic Data Interchange System (ICES 1.5) Standard Directory

export const ICEGATE_UQC_MAP: Record<string, string> = {
  // Pieces / Numbers
  'PIECES': 'PCS',
  'PIECE': 'PCS',
  'PCS': 'PCS',
  'PC': 'PCS',
  'NUMBERS': 'NOS',
  'NUMBER': 'NOS',
  'NOS': 'NOS',
  'NO': 'NOS',
  'UNITS': 'UNT',
  'UNIT': 'UNT',
  'ITEMS': 'PCS',
  'ITEM': 'PCS',

  // Boxes / Cartons / Packages
  'BOXES': 'BOX',
  'BOX': 'BOX',
  'BXS': 'BOX',
  'CARTONS': 'CTN',
  'CARTON': 'CTN',
  'CTN': 'CTN',
  'PACKS': 'PAC',
  'PACK': 'PAC',
  'PACKETS': 'PAC',
  'PACKET': 'PAC',
  'PKTS': 'PAC',
  'PKT': 'PAC',
  'PACKAGES': 'PKG',
  'PACKAGE': 'PKG',
  'BAGS': 'BAG',
  'BAG': 'BAG',
  'BUNDLES': 'BDL',
  'BUNDLE': 'BDL',
  'CRATES': 'CRT',
  'CRATE': 'CRT',
  'DRUMS': 'DRM',
  'DRUM': 'DRM',

  // Weight
  'KILOGRAMS': 'KGS',
  'KILOGRAM': 'KGS',
  'KILOS': 'KGS',
  'KGS': 'KGS',
  'KG': 'KGS',
  'GRAMS': 'GMS',
  'GRAM': 'GMS',
  'GMS': 'GMS',
  'GM': 'GMS',
  'METRIC TONNES': 'MTS',
  'METRIC TONS': 'MTS',
  'METRIC TON': 'MTS',
  'MT': 'MTS',
  'TONNES': 'TON',
  'TONS': 'TON',
  'QUINTALS': 'QTL',
  'QUINTAL': 'QTL',
  'POUNDS': 'LBS',
  'LBS': 'LBS',

  // Length & Area & Volume
  'METERS': 'MTR',
  'METER': 'MTR',
  'METRES': 'MTR',
  'METRE': 'MTR',
  'MTRS': 'MTR',
  'MTR': 'MTR',
  'M': 'MTR',
  'YARDS': 'YDS',
  'YARD': 'YDS',
  'FEET': 'FTS',
  'FOOT': 'FTS',
  'INCHES': 'INC',
  'INCH': 'INC',
  'SQUARE METERS': 'SQM',
  'SQUARE METRES': 'SQM',
  'SQM': 'SQM',
  'SQ.M': 'SQM',
  'SQUARE FEET': 'SQF',
  'SQ.FT': 'SQF',
  'LITERS': 'LTR',
  'LITER': 'LTR',
  'LITRES': 'LTR',
  'LITRE': 'LTR',
  'LTRS': 'LTR',
  'LTR': 'LTR',
  'L': 'LTR',

  // Sets & Pairs
  'SETS': 'SET',
  'SET': 'SET',
  'PAIRS': 'PRS',
  'PAIR': 'PRS',
  'PRS': 'PRS',
  'DOZENS': 'DZN',
  'DOZEN': 'DZN',
  'DZN': 'DZN',
  'DOZ': 'DZN',
  'THOUSANDS': 'THD',
  'THOUSAND': 'THD',
  'ROLLS': 'ROL',
  'ROLL': 'ROL',
  'ROD': 'ROD',
  'TUBES': 'TUB',
  'TUBE': 'TUB'
};

export const STANDARD_ICEGATE_UQCS = [
  'PCS', 'BOX', 'MTR', 'NOS', 'KGS', 'DZN', 'BAG', 'ROL', 'SET',
  'CTN', 'PAC', 'GMS', 'MTS', 'SQM', 'LTR', 'PRS', 'BDL', 'DRM', 'THD'
];

/**
 * Normalizes an unstructured unit string to the ICEGATE standard 3-letter UQC.
 * Defaults to 'PCS' if unrecognized.
 */
export function normalizeUqc(rawUnit: string | undefined | null): { uqc: string; wasNormalized: boolean } {
  if (!rawUnit) return { uqc: 'PCS', wasNormalized: false };

  const cleaned = rawUnit.trim().toUpperCase().replace(/[^A-Z0-9\s.]/g, '');

  // Exact match in official list
  if (STANDARD_ICEGATE_UQCS.includes(cleaned)) {
    return { uqc: cleaned, wasNormalized: true };
  }

  // Dictionary lookup
  if (ICEGATE_UQC_MAP[cleaned]) {
    return { uqc: ICEGATE_UQC_MAP[cleaned], wasNormalized: true };
  }

  // Token fuzzy search
  for (const [key, code] of Object.entries(ICEGATE_UQC_MAP)) {
    if (cleaned.startsWith(key) || cleaned.endsWith(key) || key.startsWith(cleaned)) {
      return { uqc: code, wasNormalized: true };
    }
  }

  // Default fallback
  return { uqc: 'PCS', wasNormalized: false };
}
