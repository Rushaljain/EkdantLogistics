import type { DocumentTemplate } from '../types';

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  // Bill of Lading Templates
  {
    id: 'bol-standard',
    name: 'Standard Ocean Multimodal BOL',
    type: 'BOL',
    carrierOrClient: 'Standard Ocean B/L',
    isDefault: true,
    description: 'Universal FIATA / BIMCO compliant multimodal transport Bill of Lading layout.'
  },
  {
    id: 'bol-maersk',
    name: 'Maersk Style Master BOL',
    type: 'BOL',
    carrierOrClient: 'Maersk Line Layout',
    isDefault: false,
    description: 'Formatted to match Maersk global container line standards and booking clauses.'
  },
  {
    id: 'bol-msc',
    name: 'MSC Mediterranean Master BOL',
    type: 'BOL',
    carrierOrClient: 'MSC Intermodal Layout',
    isDefault: false,
    description: 'Containerized ocean Bill of Lading with multi-container & seal matrix.'
  },
  {
    id: 'bol-hapag',
    name: 'Hapag-Lloyd Ocean BOL',
    type: 'BOL',
    carrierOrClient: 'Hapag-Lloyd AG',
    isDefault: false,
    description: 'Strict container payload manifest with verified gross mass (VGM) notes.'
  },

  // Dangerous Goods Templates
  {
    id: 'dg-imo-standard',
    name: 'IMO Multimodal DG Declaration',
    type: 'DG',
    carrierOrClient: 'IMO / IMDG Code Standard',
    isDefault: true,
    description: 'Official IMO Multimodal Dangerous Goods Declaration complying with SOLAS VII & MARPOL III.'
  },
  {
    id: 'dg-solas-vgm',
    name: 'SOLAS / IMDG HazMat Manifest',
    type: 'DG',
    carrierOrClient: 'IMDG Marine Pollutant Form',
    isDefault: false,
    description: 'Specialized for Class 3 Flammables, Class 8 Corrosives, and Marine Pollutants with flashpoint.'
  }
];
