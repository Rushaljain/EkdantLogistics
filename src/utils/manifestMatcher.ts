// Ekdant Logistics - Dynamic Manifest Matcher & Two-Way Session Enrichment
// Matches ExtractedShipmentJSON against FormatSchemaJSON and provides two-way sync between DG & BL manifests

import type { ExtractedShipmentJSON, FormatSchemaJSON, MappedManifestField } from '../types/index.ts';

/**
 * Builds a dynamic mapped manifest list from a shipment JSON and a target format schema.
 * Populates known fields, evaluates composite math (e.g. VGM), and marks status.
 */
export function buildMappedManifest(
  shipment: ExtractedShipmentJSON,
  format: FormatSchemaJSON,
  customOverrides: Record<string, string> = {}
): MappedManifestField[] {
  return format.fields.map((field) => {
    let resolvedValue = '';

    // 1. Check if user provided a custom override for this specific template fieldId
    if (customOverrides[field.fieldId] !== undefined) {
      resolvedValue = customOverrides[field.fieldId];
    } else if (field.mappedShipmentKey && field.mappedShipmentKey in shipment) {
      // 2. Read value from ExtractedShipmentJSON
      const rawVal = shipment[field.mappedShipmentKey];

      if (Array.isArray(rawVal)) {
        resolvedValue = rawVal.filter(Boolean).join(', ');
      } else if (typeof rawVal === 'boolean') {
        resolvedValue = rawVal ? 'YES' : 'NO';
      } else if (typeof rawVal === 'number') {
        resolvedValue = rawVal === 0 ? '' : String(rawVal);
      } else if (typeof rawVal === 'string') {
        resolvedValue = rawVal.trim();
        if (resolvedValue === '0' || resolvedValue === '---' || resolvedValue === 'NIL') {
          // If strictly empty or placeholder, set blank
          resolvedValue = resolvedValue === '0' ? '' : resolvedValue;
        }
      }
    }

    // 3. Composite logic for VGM / Total Gross Mass including Tare
    const isVgmField =
      field.fieldId.includes('vgm') ||
      field.labelInTemplate.toLowerCase().includes('verified gross mass') ||
      field.labelInTemplate.toLowerCase().includes('total weight incl. tare');

    if (isVgmField) {
      // Only compute if both grossWeightKg > 0 and tareWeightKg > 0
      if (shipment.grossWeightKg > 0 && shipment.tareWeightKg > 0) {
        resolvedValue = (shipment.grossWeightKg + shipment.tareWeightKg).toFixed(2).replace(/\.00$/, '');
      } else if (shipment.grossWeightKg > 0) {
        resolvedValue = String(shipment.grossWeightKg);
      } else {
        resolvedValue = '';
      }
    }

    // 4. Combined Name & Address formatting if label suggests both
    const labelLower = field.labelInTemplate.toLowerCase();
    if (field.mappedShipmentKey === 'shipperAddress' && labelLower.includes('name') && labelLower.includes('address')) {
      if (shipment.shipperName && shipment.shipperAddress) {
        resolvedValue = `${shipment.shipperName}\n${shipment.shipperAddress}`;
      }
    } else if (field.mappedShipmentKey === 'consigneeAddress' && labelLower.includes('name') && labelLower.includes('address')) {
      if (shipment.consigneeName && shipment.consigneeAddress) {
        resolvedValue = `${shipment.consigneeName}\n${shipment.consigneeAddress}`;
      }
    } else if (field.mappedShipmentKey === 'notifyPartyAddress' && labelLower.includes('name') && labelLower.includes('address')) {
      if (shipment.notifyPartyName && shipment.notifyPartyAddress) {
        resolvedValue = `${shipment.notifyPartyName}\n${shipment.notifyPartyAddress}`;
      }
    }

    // 5. Container & Seal combined box
    if (
      (field.fieldId.includes('container_seal') || (labelLower.includes('container') && labelLower.includes('seal'))) &&
      field.fieldType !== 'table'
    ) {
      if (shipment.containerNumber && shipment.sealNumber) {
        resolvedValue = `${shipment.containerNumber} / SEAL: ${shipment.sealNumber}`;
      } else if (shipment.containerNumber) {
        resolvedValue = shipment.containerNumber;
      }
    }

    // 6. Vessel and Voyage combined box
    if (
      (field.fieldId.includes('vessel_voyage') || (labelLower.includes('vessel') && labelLower.includes('voyage'))) &&
      shipment.vesselName
    ) {
      resolvedValue = shipment.voyageNumber
        ? `${shipment.vesselName} / ${shipment.voyageNumber}`
        : shipment.vesselName;
    }

    // Determine status: strictly "" or "0" is PENDING_BLANK
    const isPopulated = resolvedValue.trim() !== '' && resolvedValue.trim() !== '0';

    return {
      fieldId: field.fieldId,
      labelInTemplate: field.labelInTemplate,
      sectionName: field.sectionName || 'General Details',
      fieldType: field.fieldType,
      mappedShipmentKey: field.mappedShipmentKey,
      value: isPopulated ? resolvedValue : '',
      status: isPopulated ? 'POPULATED' : 'PENDING_BLANK'
    };
  });
}

/**
 * Updates central ExtractedShipmentJSON when an operator edits a mapped field in either DG or BL manifest
 */
export function updateShipmentFromManifestField(
  currentShipment: ExtractedShipmentJSON,
  field: MappedManifestField,
  newValue: string
): ExtractedShipmentJSON {
  if (!field.mappedShipmentKey || !(field.mappedShipmentKey in currentShipment)) {
    return currentShipment;
  }

  const updated: ExtractedShipmentJSON = { ...currentShipment };
  const key = field.mappedShipmentKey;
  const currentVal = updated[key];

  if (typeof currentVal === 'number') {
    const parsedNum = parseFloat(newValue.replace(/,/g, ''));
    (updated as any)[key] = isNaN(parsedNum) ? 0 : parsedNum;
  } else if (typeof currentVal === 'boolean') {
    (updated as any)[key] = newValue.trim().toLowerCase() === 'true' || newValue.trim().toLowerCase() === 'yes';
  } else if (Array.isArray(currentVal)) {
    (updated as any)[key] = newValue
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  } else {
    (updated as any)[key] = newValue;
  }

  // Decompose composite fields back to their components if applicable
  if (field.fieldId.includes('container_seal') || field.labelInTemplate.toLowerCase().includes('seal')) {
    if (newValue.includes('/')) {
      const parts = newValue.split('/').map(s => s.trim());
      updated.containerNumber = parts[0] || updated.containerNumber;
      updated.sealNumber = (parts[1] || '').replace(/^SEAL:\s*/i, '') || updated.sealNumber;
    }
  }

  if (field.fieldId.includes('vessel_voyage') || field.labelInTemplate.toLowerCase().includes('voyage')) {
    if (newValue.includes('/')) {
      const parts = newValue.split('/').map(s => s.trim());
      updated.vesselName = parts[0] || updated.vesselName;
      updated.voyageNumber = parts[1] || updated.voyageNumber;
    }
  }

  return updated;
}

/**
 * Aggregates summary statistics for a mapped manifest
 */
export function getManifestStats(fields: MappedManifestField[]) {
  const total = fields.length;
  const populated = fields.filter(f => f.status === 'POPULATED').length;
  const pending = total - populated;
  const percentage = total > 0 ? Math.round((populated / total) * 100) : 0;

  return { total, populated, pending, percentage };
}

/**
 * Groups manifest fields by section for clean accordion/card rendering
 */
export function groupManifestFieldsBySection(
  fields: MappedManifestField[]
): Record<string, MappedManifestField[]> {
  const groups: Record<string, MappedManifestField[]> = {};
  for (const field of fields) {
    const sec = field.sectionName || 'General Details';
    if (!groups[sec]) {
      groups[sec] = [];
    }
    groups[sec].push(field);
  }
  return groups;
}
