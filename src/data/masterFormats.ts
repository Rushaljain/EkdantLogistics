import type { MasterFormat } from '../types';

export const PRESEEDED_MASTER_FORMATS: MasterFormat[] = [
  {
    id: 'fmt-one-line',
    name: 'ONE Line Multimodal (Myanmar/Yangon)',
    carrierOrClient: 'ONE Line (Ocean Network Express)',
    description: 'ONE Line standard multimodal format for Myanmar (Yangon) mapping ONEU2878769, 22 pallets, 676 boxes, 18,502.70 kg gross, UN 2794 Class 8.',
    isPreseeded: true
  },
  {
    id: 'fmt-cma-cgm',
    name: 'CMA CGM Standard (Middle East/Jeddah)',
    carrierOrClient: 'CMA CGM',
    description: 'CMA CGM standard containerized format for Middle East (Jeddah) mapping 12 pallets 5644-5655, 22,620 kg gross, UN 2794 Class 8.',
    isPreseeded: true
  },
  {
    id: 'fmt-default-ekdant',
    name: 'Default Ekdant Format',
    carrierOrClient: 'Ekdant Standard Logistics',
    description: 'Universal standard multimodal Master BOL and IMDG Dangerous Goods declaration layout.',
    isPreseeded: true
  }
];
