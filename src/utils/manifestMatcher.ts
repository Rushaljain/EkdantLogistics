// Ekdant Logistics - Dynamic Manifest Matcher & Two-Way Session Enrichment
// Matches ExtractedShipmentJSON against FormatSchemaJSON and provides two-way sync between DG & BL manifests

import type { ExtractedShipmentJSON, FormatSchemaJSON, MappedManifestField } from '../types/index.ts';
import {
  resolveFieldValueByKeywords,
  buildCombinedDgCargoBlock,
  synthesizePalletRanges,
  normalizeShipmentState,
  IMDG_UN_LOOKUP
} from './manifestKeywordReference.ts';


/**
 * Builds a dynamic mapped manifest list from a shipment JSON and a target format schema.
 * Populates known fields, evaluates composite math (e.g. VGM), and marks status.
 */
export function buildMappedManifest(
  rawShipment: ExtractedShipmentJSON,
  format: FormatSchemaJSON,
  customOverrides: Record<string, string> = {}
): MappedManifestField[] {
  // Always normalize shipment state at line 1 to eliminate any execution-order conflicts
  const shipment = normalizeShipmentState(rawShipment);
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
          resolvedValue = resolvedValue === '0' ? '' : resolvedValue;
        }
      }
    }

    const labelLower = field.labelInTemplate.toLowerCase();
    const fieldIdLower = field.fieldId.toLowerCase();

    // 3. Strict Box 19 / VGM Invariant:
    // NEVER copy grossWeightKg alone into Total gross (incl. tare) when tareWeightKg is 0 or blank.
    // Only when BOTH grossWeightKg > 0 AND tareWeightKg > 0 may it compute grossWeightKg + tareWeightKg.
    const isVgmField =
      fieldIdLower.includes('vgm') ||
      fieldIdLower.includes('total_gross_incl_tare') ||
      fieldIdLower.includes('total_weight_incl_tare') ||
      fieldIdLower === 'box_19_total_gross' ||
      fieldIdLower === 'box_19_total_gross_incl_tare' ||
      labelLower.includes('total gross (incl') ||
      labelLower.includes('total weight incl') ||
      labelLower.includes('incl. tare') ||
      labelLower.includes('including tare') ||
      labelLower.includes('verified gross mass');

    if (isVgmField) {
      if (shipment.grossWeightKg > 0 && shipment.tareWeightKg > 0) {
        resolvedValue = String(Number((shipment.grossWeightKg + shipment.tareWeightKg).toFixed(2)));
      } else {
        resolvedValue = '';
      }
    }

    // 4. Composite Party Blocks (Shipper, Consignee, Notify Party)
    const hasSeparateShipperAddress = format.fields.some(
      f => f.fieldId !== field.fieldId && f.mappedShipmentKey === 'shipperAddress'
    );
    const isShipperPartyBox =
      field.mappedShipmentKey === 'shipperAddress' ||
      (field.mappedShipmentKey === 'shipperName' && !hasSeparateShipperAddress) ||
      fieldIdLower.includes('box_1_shipper') ||
      fieldIdLower === 'bl_shipper' ||
      (labelLower.includes('shipper') && !labelLower.includes('reference') && !labelLower.includes('declaration'));

    if (isShipperPartyBox && !hasSeparateShipperAddress) {
      const parts: string[] = [];
      if (shipment.shipperName && shipment.shipperName.trim()) {
        parts.push(shipment.shipperName.trim());
      }
      if (shipment.shipperAddress && shipment.shipperAddress.trim()) {
        const addr = shipment.shipperAddress.trim();
        if (!shipment.shipperName || !addr.toLowerCase().startsWith(shipment.shipperName.trim().toLowerCase())) {
          parts.push(addr);
        } else {
          parts.length = 0;
          parts.push(addr);
        }
      }
      if (shipment.shipperIec && shipment.shipperIec.trim()) {
        parts.push(`IEC: ${shipment.shipperIec.trim()}`);
      }
      if (shipment.shipperGstin && shipment.shipperGstin.trim()) {
        parts.push(`GSTIN: ${shipment.shipperGstin.trim()}`);
      }
      if (shipment.onBehalfOf && shipment.onBehalfOf.trim()) {
        parts.push(`ON BEHALF OF:\n${shipment.onBehalfOf.trim()}`);
      }
      resolvedValue = parts.filter(Boolean).join('\n');
    }

    const hasSeparateConsigneeAddress = format.fields.some(
      f => f.fieldId !== field.fieldId && f.mappedShipmentKey === 'consigneeAddress'
    );
    const isConsigneePartyBox =
      field.mappedShipmentKey === 'consigneeAddress' ||
      (field.mappedShipmentKey === 'consigneeName' && !hasSeparateConsigneeAddress) ||
      fieldIdLower.includes('box_6_consignee') ||
      fieldIdLower === 'bl_consignee' ||
      labelLower.includes('consignee');

    if (isConsigneePartyBox && !hasSeparateConsigneeAddress) {
      if (shipment.consigneeName && shipment.consigneeAddress) {
        const addr = shipment.consigneeAddress.trim();
        const name = shipment.consigneeName.trim();
        if (!addr.toLowerCase().startsWith(name.toLowerCase())) {
          resolvedValue = `${name}\n${addr}`;
        } else {
          resolvedValue = addr;
        }
      } else if (shipment.consigneeName || shipment.consigneeAddress) {
        resolvedValue = (shipment.consigneeAddress || shipment.consigneeName).trim();
      }
    }

    const hasSeparateNotifyAddress = format.fields.some(
      f => f.fieldId !== field.fieldId && f.mappedShipmentKey === 'notifyPartyAddress'
    );
    const isNotifyPartyBox =
      field.mappedShipmentKey === 'notifyPartyAddress' ||
      (field.mappedShipmentKey === 'notifyPartyName' && !hasSeparateNotifyAddress) ||
      fieldIdLower.includes('notify_party') ||
      labelLower.includes('notify party');

    if (isNotifyPartyBox && !hasSeparateNotifyAddress) {
      if (shipment.notifyPartyName && shipment.notifyPartyAddress) {
        const addr = shipment.notifyPartyAddress.trim();
        const name = shipment.notifyPartyName.trim();
        if (!addr.toLowerCase().startsWith(name.toLowerCase())) {
          resolvedValue = `${name}\n${addr}`;
        } else {
          resolvedValue = addr;
        }
      } else if (shipment.notifyPartyName || shipment.notifyPartyAddress) {
        resolvedValue = (shipment.notifyPartyAddress || shipment.notifyPartyName).trim();
      }
    }

    // 5. Shipper's Reference / Invoice Reference (Box 4):
    // If invoiceNumbers is non-empty, include them alongside shipperReference so invoice numbers are never lost
    const isShipperRefBox =
      field.mappedShipmentKey === 'shipperReference' ||
      fieldIdLower.includes('shipper_ref') ||
      fieldIdLower === 'bl_export_references' ||
      labelLower.includes("shipper's ref") ||
      labelLower.includes('shipper reference') ||
      labelLower.includes('export references');

    if (isShipperRefBox) {
      const invStr = shipment.invoiceNumbers && shipment.invoiceNumbers.length > 0
        ? shipment.invoiceNumbers.join(', ')
        : '';
      const refStr = shipment.shipperReference ? shipment.shipperReference.trim() : '';

      if (refStr && invStr) {
        if (!refStr.toLowerCase().includes(invStr.toLowerCase())) {
          resolvedValue = `${refStr}\nINV: ${invStr}`;
        } else {
          resolvedValue = refStr;
        }
      } else if (invStr) {
        resolvedValue = `INV: ${invStr}`;
      } else if (refStr) {
        resolvedValue = refStr;
      }
    }

    // 6. Composite Package Count & Type (e.g. "12 PALLETS (2880 BOXES)")
    const isCompositePkgCount =
      (fieldIdLower.includes('package') || labelLower.includes('package') || labelLower.includes('packages')) &&
      (labelLower.includes('number and kind') || labelLower.includes('kind of package') || labelLower.includes('no. & kind') || labelLower.includes('no of pkgs') || labelLower.includes('total packages') || labelLower.includes('total pkgs') || labelLower.includes('packages or units') || labelLower.includes('packages / units')) &&
      !labelLower.includes('description');

    if (isCompositePkgCount && customOverrides[field.fieldId] === undefined) {
      const outerCount = shipment.outerPackagingCount > 0 ? shipment.outerPackagingCount : shipment.totalPallets;
      const outerType = shipment.outerPackagingType ? shipment.outerPackagingType.trim() : 'PALLETS';
      const innerCount = shipment.innerPackageCount > 0 ? shipment.innerPackageCount : (shipment.totalBoxes > 0 ? shipment.totalBoxes : shipment.totalPackages);
      const innerType = shipment.innerPackageType ? shipment.innerPackageType.trim() : 'BOXES';

      if (outerCount > 0 && innerCount > 0) {
        resolvedValue = `${outerCount} ${outerType} (${innerCount} ${innerType})`;
      } else if (outerCount > 0) {
        resolvedValue = `${outerCount} ${outerType}`;
      } else if (innerCount > 0) {
        resolvedValue = `${innerCount} ${innerType}`;
      }
    }

    // 7. Box 14 / Combined DG Cargo Description Block
    const hasSeparateUnField = format.fields.some(
      f => f.fieldId !== field.fieldId && (f.mappedShipmentKey === 'unNumber' || f.fieldId.toLowerCase().includes('un_number'))
    );
    const hasSeparateMarksField = format.fields.some(
      f => f.fieldId !== field.fieldId && f.mappedShipmentKey === 'shippingMarks'
    );

    const isCombinedDgCargoBox =
      format.documentType === 'DG' &&
      (
        fieldIdLower.includes('box_14_cargo') ||
        fieldIdLower.includes('box14') ||
        fieldIdLower.includes('combined_cargo') ||
        (labelLower.includes('number and kind of packages') && labelLower.includes('description of goods')) ||
        (labelLower.includes('shipping marks') && labelLower.includes('description')) ||
        ((field.mappedShipmentKey === 'productDescription' || field.mappedShipmentKey === 'properShippingName') && !hasSeparateUnField)
      );

    if (isCombinedDgCargoBox && customOverrides[field.fieldId] === undefined) {
      const includeMarks = !hasSeparateMarksField || labelLower.includes('shipping marks') || labelLower.includes('marks & nos');
      resolvedValue = buildCombinedDgCargoBlock(shipment, includeMarks);
    }

    // 8. Strict Proper Shipping Name field (Box 15b): strictly official IMDG PSN, never the long commercial description
    const isPsnField =
      field.mappedShipmentKey === 'properShippingName' ||
      fieldIdLower.includes('proper_shipping_name') ||
      labelLower.includes('proper shipping name');

    if (isPsnField && customOverrides[field.fieldId] === undefined) {
      if (shipment.properShippingName && shipment.properShippingName.trim()) {
        resolvedValue = shipment.properShippingName.trim();
      } else if (shipment.unNumber) {
        const unDigits = shipment.unNumber.replace(/\D/g, '');
        const imdgRef = IMDG_UN_LOOKUP[unDigits];
        if (imdgRef) {
          resolvedValue = imdgRef.properShippingName;
        }
      }
    }

    // 9. Master BL Cargo Description & Packages Composite Assembly
    const isBlCargoDescriptionBox =
      format.documentType === 'BL' &&
      customOverrides[field.fieldId] === undefined &&
      (
        fieldIdLower.includes('cargo_description') ||
        fieldIdLower.includes('description_of_goods') ||
        fieldIdLower.includes('description_of_packages') ||
        labelLower.includes('description of goods') ||
        labelLower.includes('description of packages') ||
        labelLower.includes('kind of packages') ||
        labelLower.includes('particulars furnished by shipper') ||
        (labelLower.includes('packages') && labelLower.includes('description'))
      );

    if (isBlCargoDescriptionBox) {
      const descLines: string[] = [];
      const contType = shipment.containerType ? shipment.containerType.trim() : "20'";
      descLines.push(`1 X ${contType} FCL SAID TO CONTAIN`);

      const outerCount = shipment.outerPackagingCount > 0 ? shipment.outerPackagingCount : shipment.totalPallets;
      const outerType = shipment.outerPackagingType ? shipment.outerPackagingType.trim() : 'PALLETS';
      const innerCount = shipment.innerPackageCount > 0 ? shipment.innerPackageCount : (shipment.totalBoxes > 0 ? shipment.totalBoxes : shipment.totalPackages);
      const innerType = shipment.innerPackageType ? shipment.innerPackageType.trim() : 'BOXES';

      if (outerCount > 0 && innerCount > 0) {
        descLines.push(`TOTAL ${outerCount} ${outerType} (${innerCount} ${innerType})`);
      } else if (outerCount > 0) {
        descLines.push(`TOTAL ${outerCount} ${outerType}`);
      } else if (innerCount > 0) {
        descLines.push(`TOTAL ${innerCount} ${innerType}`);
      }

      if (shipment.productDescription && shipment.productDescription.trim()) {
        descLines.push(shipment.productDescription.trim());
      }
      const existingText = descLines.join(' ');
      const hasBrandMention = /brand\s*name|brand\s*:/i.test(existingText);
      if (shipment.brandName && shipment.brandName.trim() && !hasBrandMention && !existingText.toLowerCase().includes(shipment.brandName.toLowerCase())) {
        descLines.push(`BRAND: ${shipment.brandName.trim()}`);
      }
      if (shipment.hsnCode && shipment.hsnCode.trim()) {
        descLines.push(`H.S. CODE NO. ${shipment.hsnCode.trim()}`);
      }
      if (shipment.shippingBillNumbers && shipment.shippingBillNumbers.trim()) {
        descLines.push(`SHIPPING BILL NO(S): ${shipment.shippingBillNumbers.trim()}`);
      }
      if (shipment.isDangerousGoods || shipment.unNumber) {
        const dgInfoParts: string[] = [];
        if (shipment.unNumber) dgInfoParts.push(`UN NO. ${shipment.unNumber.replace(/^UN\s*/i, '')}`);
        if (shipment.imoClass) dgInfoParts.push(`IMCO CLASS: ${shipment.imoClass}`);
        if (shipment.packingGroup) dgInfoParts.push(`PG: ${shipment.packingGroup}`);
        if (dgInfoParts.length > 0) {
          descLines.push(dgInfoParts.join(' | '));
        }
      }
      if (shipment.freightTerms && shipment.freightTerms.trim()) {
        descLines.push(shipment.freightTerms.trim().toUpperCase());
      }
      if (shipment.freeTimeClause && shipment.freeTimeClause.trim()) {
        descLines.push(`"${shipment.freeTimeClause.trim()}"`);
      }

      if (descLines.length > 0) {
        resolvedValue = descLines.join('\n');
      }
    }

    // Append synthesized pallet number ranges from shipment.pallets[] into Marks and Numbers when present
    const isMarksField =
      field.mappedShipmentKey === 'shippingMarks' ||
      fieldIdLower.includes('shipping_marks') ||
      fieldIdLower.includes('marks_and_numbers') ||
      labelLower.includes('shipping marks') ||
      labelLower.includes('marks & nos') ||
      labelLower.includes('marks and numbers');

    if (isMarksField && shipment.pallets && shipment.pallets.length > 0) {
      const palletRanges = synthesizePalletRanges(shipment.pallets);
      if (palletRanges.length > 0) {
        const firstRange = palletRanges[0];
        if (!resolvedValue.includes(firstRange)) {
          const palletStr = `PALLET NOS: ${palletRanges.join(', ')}`;
          resolvedValue = resolvedValue.trim() ? `${resolvedValue.trim()}\n${palletStr}` : palletStr;
        }
      }
    }

    // 10. Container & Seal combined box
    if (
      (fieldIdLower.includes('container_seal') || (labelLower.includes('container') && labelLower.includes('seal'))) &&
      field.fieldType !== 'table'
    ) {
      if (shipment.containerNumber && shipment.sealNumber) {
        resolvedValue = `${shipment.containerNumber} / SEAL: ${shipment.sealNumber}`;
      } else if (shipment.containerNumber) {
        resolvedValue = shipment.containerNumber;
      }
    }

    // 10. Vessel and Voyage combined box
    if (
      (fieldIdLower.includes('vessel_voyage') || (labelLower.includes('vessel') && labelLower.includes('voyage'))) &&
      shipment.vesselName
    ) {
      resolvedValue = shipment.voyageNumber
        ? `${shipment.vesselName} / ${shipment.voyageNumber}`
        : shipment.vesselName;
    }

    // 11. Global Keyword Reference & Cascading Fallback Engine
    let isValueBlank = !resolvedValue || resolvedValue.trim() === '' || resolvedValue.trim() === '0' || resolvedValue.trim() === '---';

    if (isValueBlank) {
      const keywordResolved = resolveFieldValueByKeywords(
        field.labelInTemplate,
        field.fieldId,
        shipment,
        format.documentType
      );
      if (keywordResolved) {
        resolvedValue = keywordResolved;
        isValueBlank = false;
      }
    }

    // 10. Secondary Smart Fallback Keyword Chains (when still blank)
    if (isValueBlank && !isVgmField) {
      // Chain 1: Transport Document / Booking / Reference Number Fields
      const isTransportDocOrRefField =
        !labelLower.includes('container') &&
        !labelLower.includes('seal') &&
        !labelLower.includes('declaration') &&
        (
          field.mappedShipmentKey === 'bookingNumber' ||
          field.mappedShipmentKey === 'shipperReference' ||
          field.mappedShipmentKey === 'forwarderReference' ||
          fieldIdLower.includes('booking') ||
          fieldIdLower.includes('transport_doc') ||
          fieldIdLower.includes('doc_no') ||
          fieldIdLower.includes('document_no') ||
          fieldIdLower.includes('bill_of_lading') ||
          labelLower.includes('transport document') ||
          labelLower.includes('booking') ||
          labelLower.includes('bill of lading') ||
          labelLower.includes('b/l no') ||
          labelLower.includes('bol no') ||
          labelLower.includes('document no') ||
          labelLower.includes('invoice ref') ||
          labelLower.includes('export ref') ||
          labelLower.includes('reference')
        );

      if (isTransportDocOrRefField) {
        // Fallback 1: Commercial invoice numbers joined
        if (shipment.invoiceNumbers && shipment.invoiceNumbers.length > 0) {
          resolvedValue = shipment.invoiceNumbers.join(', ');
        }
        // Fallback 2: Shipper reference
        else if (shipment.shipperReference && shipment.shipperReference.trim()) {
          resolvedValue = shipment.shipperReference.trim();
        }
      }

      // Chain 2: Shipping Marks / Package Description Fields
      const isMarksOrPackageField =
        field.mappedShipmentKey === 'shippingMarks' ||
        field.mappedShipmentKey === 'productDescription' ||
        fieldIdLower.includes('shipping_marks') ||
        fieldIdLower.includes('cargo_description') ||
        fieldIdLower.includes('package') ||
        labelLower.includes('shipping marks') ||
        labelLower.includes('marks & nos') ||
        labelLower.includes('marks and numbers') ||
        labelLower.includes('packages') ||
        labelLower.includes('package description') ||
        labelLower.includes('description of goods');

      if ((!resolvedValue || resolvedValue.trim() === '') && isMarksOrPackageField) {
        // If it's a numeric package count field
        if (field.fieldType === 'number' || labelLower.includes('package count') || labelLower.includes('total number of packages')) {
          if (shipment.totalPallets > 0) {
            resolvedValue = String(shipment.totalPallets);
          } else if (shipment.outerPackagingCount > 0) {
            resolvedValue = String(shipment.outerPackagingCount);
          } else if (shipment.totalBoxes > 0) {
            resolvedValue = String(shipment.totalBoxes);
          } else if (shipment.innerPackageCount > 0) {
            resolvedValue = String(shipment.innerPackageCount);
          }
        } else {
          // Fallback 1: shipment.shippingMarks
          if (shipment.shippingMarks && shipment.shippingMarks.trim()) {
            resolvedValue = shipment.shippingMarks.trim();
          }
          // Fallback 2: combine shipment.productDescription + packaging counts
          else {
            const pkgParts: string[] = [];
            if (shipment.outerPackagingCount > 0) {
              pkgParts.push(`${shipment.outerPackagingCount} ${shipment.outerPackagingType || 'PALLETS'}`);
            }
            if (shipment.innerPackageCount > 0) {
              pkgParts.push(`${shipment.innerPackageCount} ${shipment.innerPackageType || 'BOXES'}`);
            }
            const pkgStr = pkgParts.join(' / ');
            const descStr = shipment.productDescription || shipment.properShippingName || '';
            if (pkgStr && descStr) {
              resolvedValue = `${pkgStr}\n${descStr}`;
            } else if (pkgStr || descStr) {
              resolvedValue = pkgStr || descStr;
            }
          }
        }
      }

      // Chain 3: Port & Routing Fields (portOfLoading, portOfDischarge, finalDestination)
      const isPodField =
        field.mappedShipmentKey === 'portOfDischarge' ||
        field.mappedShipmentKey === 'portOfDischargeDg' ||
        fieldIdLower.includes('port_of_discharge') ||
        fieldIdLower.includes('discharge') ||
        labelLower.includes('port of discharge') ||
        labelLower.includes('discharge port');

      const isDestField =
        field.mappedShipmentKey === 'finalDestination' ||
        field.mappedShipmentKey === 'placeOfDelivery' ||
        fieldIdLower.includes('destination') ||
        fieldIdLower.includes('place_of_delivery') ||
        labelLower.includes('final destination') ||
        labelLower.includes('destination') ||
        labelLower.includes('place of delivery');

      const isPolField =
        field.mappedShipmentKey === 'portOfLoading' ||
        field.mappedShipmentKey === 'placeOfReceipt' ||
        fieldIdLower.includes('port_of_loading') ||
        fieldIdLower.includes('place_of_receipt') ||
        labelLower.includes('port of loading') ||
        labelLower.includes('place of receipt');

      if ((!resolvedValue || resolvedValue.trim() === '') && isPodField) {
        // Fallback: If portOfDischarge is empty in a BL format, fallback to finalDestination / placeOfDelivery / portOfDischargeDg
        resolvedValue = shipment.portOfDischarge || shipment.finalDestination || shipment.placeOfDelivery || shipment.portOfDischargeDg || '';
      } else if ((!resolvedValue || resolvedValue.trim() === '') && isDestField) {
        // Fallback: If finalDestination is empty, fallback to portOfDischarge / placeOfDelivery
        resolvedValue = shipment.finalDestination || shipment.portOfDischarge || shipment.placeOfDelivery || '';
      } else if ((!resolvedValue || resolvedValue.trim() === '') && isPolField) {
        // Fallback: If portOfLoading is empty, fallback to placeOfReceipt (and vice versa)
        resolvedValue = shipment.portOfLoading || shipment.placeOfReceipt || '';
      }
    }

    // Determine status: strictly "" or "0" is PENDING_BLANK. If populated via fallback or primary, mark POPULATED
    const isPopulated = resolvedValue.trim() !== '' && resolvedValue.trim() !== '0' && resolvedValue.trim() !== '---';

    // Assign fieldCategory: Stage-2 Carrier / Operational fields vs Signatures vs Core Invoice Data
    let fieldCategory: 'INVOICE_DATA' | 'STAGE2_CARRIER' | 'SIGNATURE_HAULIER' = 'INVOICE_DATA';

    const isSignature =
      fieldIdLower.includes('signature') ||
      fieldIdLower.includes('haulier') ||
      fieldIdLower.includes('driver') ||
      fieldIdLower.includes('vehicle_reg') ||
      fieldIdLower.includes('receiving_org') ||
      labelLower.includes('signature') ||
      labelLower.includes('haulier') ||
      labelLower.includes('vehicle reg') ||
      labelLower.includes('driver') ||
      labelLower.includes('receiving organization') ||
      labelLower.includes('certificate of packing') ||
      labelLower.includes('container packing certificate') ||
      labelLower.includes('shipper declaration');

    const isStage2 =
      fieldIdLower.includes('container') ||
      fieldIdLower.includes('seal') ||
      fieldIdLower.includes('tare') ||
      fieldIdLower.includes('vgm') ||
      fieldIdLower.includes('vessel') ||
      fieldIdLower.includes('voyage') ||
      fieldIdLower.includes('carrier') ||
      fieldIdLower.includes('pre_carriage') ||
      fieldIdLower.includes('shipping_bill') ||
      fieldIdLower.includes('free_time') ||
      fieldIdLower.includes('cube') ||
      fieldIdLower.includes('volume') ||
      labelLower.includes('container') ||
      labelLower.includes('seal') ||
      labelLower.includes('tare') ||
      labelLower.includes('incl. tare') ||
      labelLower.includes('vgm') ||
      labelLower.includes('vessel') ||
      labelLower.includes('voyage') ||
      labelLower.includes('carrier') ||
      labelLower.includes('pre-carriage') ||
      labelLower.includes('shipping bill') ||
      labelLower.includes('free time') ||
      labelLower.includes('cube') ||
      labelLower.includes('measurement');

    if (isSignature) {
      fieldCategory = 'SIGNATURE_HAULIER';
    } else if (isStage2) {
      fieldCategory = 'STAGE2_CARRIER';
    }

    return {
      fieldId: field.fieldId,
      labelInTemplate: field.labelInTemplate,
      sectionName: field.sectionName || 'General Details',
      fieldType: field.fieldType,
      mappedShipmentKey: field.mappedShipmentKey,
      value: isPopulated ? resolvedValue : '',
      status: isPopulated ? 'POPULATED' : 'PENDING_BLANK',
      fieldCategory
    };
  });
}

/**
 * Updates central ExtractedShipmentJSON when an operator edits a mapped field in either DG or BL manifest.
 * Handles two-way decomposition of composite fields back to atomic shipment state.
 */
export function updateShipmentFromManifestField(
  currentShipment: ExtractedShipmentJSON,
  field: MappedManifestField,
  newValue: string
): ExtractedShipmentJSON {
  const updated: ExtractedShipmentJSON = { ...currentShipment };
  const key = field.mappedShipmentKey;
  const fieldIdLower = field.fieldId.toLowerCase();
  const labelLower = field.labelInTemplate.toLowerCase();

  if (key && key in updated) {
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
  }

  // Two-way composite decomposition:

  // 1. Shipper Party Block (Shipper Name, Address, and ON BEHALF OF)
  if (
    key === 'shipperAddress' ||
    key === 'shipperName' ||
    fieldIdLower.includes('shipper') ||
    (labelLower.includes('shipper') && !labelLower.includes('ref'))
  ) {
    let shipperContent = newValue;
    if (newValue.includes('ON BEHALF OF:')) {
      const [shipperPart, onBehalfPart] = newValue.split(/ON BEHALF OF:\s*/i);
      updated.onBehalfOf = onBehalfPart.trim();
      shipperContent = shipperPart;
    }

    const rawLines = shipperContent.trim().split('\n').map(l => l.trim()).filter(Boolean);
    const cleanAddressLines: string[] = [];

    for (const line of rawLines) {
      if (/^IEC:\s*/i.test(line)) {
        updated.shipperIec = line.replace(/^IEC:\s*/i, '').trim();
      } else if (/^GSTIN:\s*/i.test(line)) {
        updated.shipperGstin = line.replace(/^GSTIN:\s*/i, '').trim();
      } else {
        cleanAddressLines.push(line);
      }
    }

    if (cleanAddressLines.length > 0) {
      updated.shipperName = cleanAddressLines[0];
      updated.shipperAddress = cleanAddressLines.slice(1).join('\n') || cleanAddressLines[0];
    }
  }

  // 2. Consignee Party Block
  if (
    key === 'consigneeAddress' ||
    key === 'consigneeName' ||
    fieldIdLower.includes('consignee') ||
    labelLower.includes('consignee')
  ) {
    const lines = newValue.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      updated.consigneeName = lines[0];
      updated.consigneeAddress = lines.slice(1).join('\n');
    }
  }

  // 3. Notify Party Block
  if (
    key === 'notifyPartyAddress' ||
    key === 'notifyPartyName' ||
    fieldIdLower.includes('notify') ||
    labelLower.includes('notify')
  ) {
    const lines = newValue.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      updated.notifyPartyName = lines[0];
      updated.notifyPartyAddress = lines.slice(1).join('\n');
    }
  }

  // 4. Shipper's Reference & Invoice Reference
  if (
    key === 'shipperReference' ||
    fieldIdLower.includes('shipper_ref') ||
    labelLower.includes("shipper's ref") ||
    labelLower.includes('export ref')
  ) {
    if (newValue.includes('INV:')) {
      const [refPart, invPart] = newValue.split(/INV:\s*/i);
      updated.shipperReference = refPart.trim();
      updated.invoiceNumbers = invPart.split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  // 5. Container & Seal decomposition
  if (fieldIdLower.includes('container_seal') || labelLower.includes('seal')) {
    if (newValue.includes('/')) {
      const parts = newValue.split('/').map(s => s.trim());
      updated.containerNumber = parts[0] || updated.containerNumber;
      updated.sealNumber = (parts[1] || '').replace(/^SEAL:\s*/i, '') || updated.sealNumber;
    }
  }

  // 6. Vessel & Voyage decomposition
  if (fieldIdLower.includes('vessel_voyage') || labelLower.includes('voyage')) {
    if (newValue.includes('/')) {
      const parts = newValue.split('/').map(s => s.trim());
      updated.vesselName = parts[0] || updated.vesselName;
      updated.voyageNumber = parts[1] || updated.voyageNumber;
    }
  }

  // 7. Direct VGM / Total Gross Mass including Tare adjustment
  const isVgm =
    fieldIdLower.includes('vgm') ||
    fieldIdLower.includes('total_gross_incl_tare') ||
    labelLower.includes('total gross (incl') ||
    labelLower.includes('incl. tare') ||
    labelLower.includes('including tare');

  if (isVgm) {
    const enteredVgm = parseFloat(newValue.replace(/,/g, ''));
    if (!isNaN(enteredVgm) && updated.grossWeightKg > 0 && enteredVgm > updated.grossWeightKg) {
      updated.tareWeightKg = Number((enteredVgm - updated.grossWeightKg).toFixed(2));
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

  // Breakdown by fieldCategory
  const invoiceDataFields = fields.filter(f => f.fieldCategory === 'INVOICE_DATA' || !f.fieldCategory);
  const invoiceDataTotal = invoiceDataFields.length;
  const invoiceDataPopulated = invoiceDataFields.filter(f => f.status === 'POPULATED').length;
  const invoiceDataPending = invoiceDataTotal - invoiceDataPopulated;
  const invoiceDataPercentage = invoiceDataTotal > 0 ? Math.round((invoiceDataPopulated / invoiceDataTotal) * 100) : 0;

  const stage2Pending = fields.filter(f => f.fieldCategory === 'STAGE2_CARRIER' && f.status === 'PENDING_BLANK').length;
  const signaturePending = fields.filter(f => f.fieldCategory === 'SIGNATURE_HAULIER' && f.status === 'PENDING_BLANK').length;

  return {
    total,
    populated,
    pending,
    percentage,
    invoiceDataTotal,
    invoiceDataPopulated,
    invoiceDataPending,
    invoiceDataPercentage,
    stage2Pending,
    signaturePending
  };
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
