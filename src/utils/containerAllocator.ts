// Container Allocation and Pallet Segregation Engine
// Groups pallets & line items into standard ISO containers (20GP, 40GP, 40HC, 45HC)
// Validates max payload weights, tare weights, and hazardous goods segregation

import type { ContainerAllocation, ContainerType, LineItem, Pallet } from '../types';
import { CONTAINER_SPECS } from '../types';

const SAMPLE_CONTAINER_PREFIXES = ['MSCU', 'TGHU', 'CMAU', 'MEDU', 'HLXU', 'EGLV', 'TEMU'];
const SAMPLE_SEAL_PREFIXES = ['EMC', 'MSC', 'CMA', 'HL', 'ONE'];

export function generateContainerNumber(index: number = 0): string {
  const prefix = SAMPLE_CONTAINER_PREFIXES[index % SAMPLE_CONTAINER_PREFIXES.length];
  const digits = Math.floor(1000000 + Math.random() * 9000000).toString().slice(0, 7);
  return `${prefix}${digits}`;
}

export function generateSealNumber(index: number = 0): string {
  const prefix = SAMPLE_SEAL_PREFIXES[index % SAMPLE_SEAL_PREFIXES.length];
  const digits = Math.floor(100000 + Math.random() * 900000).toString().slice(0, 6);
  return `${prefix}${digits}`;
}

/**
 * Automatically segregates line items into Pallets and allocates them across ISO Containers
 * based on payload limits (e.g., 26,500 kg for 40HC, 21,700 kg for 20GP).
 */
export function allocateContainers(
  lineItems: LineItem[],
  preferredContainerType: ContainerType = '40HC',
  explicitPalletCount?: number
): { containers: ContainerAllocation[]; pallets: Pallet[] } {
  if (!lineItems || lineItems.length === 0) {
    const defaultCont: ContainerAllocation = {
      id: `cont-${Date.now()}-1`,
      containerNumber: generateContainerNumber(0),
      sealNumber: generateSealNumber(0),
      containerType: preferredContainerType,
      maxPayloadKg: CONTAINER_SPECS[preferredContainerType].maxPayloadKg,
      tareWeightKg: CONTAINER_SPECS[preferredContainerType].tareWeightKg,
      pallets: [],
      assignedPalletIds: [],
      totalGrossWeightKg: 0,
      totalNetWeightKg: 0,
      totalPackages: 0,
      isOverweight: false,
      hasDangerousGoods: false
    };
    return { containers: [defaultCont], pallets: [] };
  }

  // 1. Synthesize / cluster line items into Pallets
  // If line items have explicit pallet numbers, group by them; otherwise group by ~1,000-1,500 kg per pallet or count
  const pallets: Pallet[] = [];
  const targetPalletsCount = Math.max(
    explicitPalletCount || 0,
    Math.ceil(lineItems.reduce((acc, it) => acc + (it.grossWeightKg || it.quantity * 20), 0) / 1200),
    1
  );

  // Divide items across pallets
  let currentPalletItems: LineItem[] = [];
  let currentPalletGross = 0;
  let currentPalletNet = 0;
  let currentPalletPackages = 0;
  let palletIdx = 1;
  const basePalletNumber = 5644; // Standard commercial pallet series e.g. 5644-5655

  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    const itemGross = item.grossWeightKg > 0 ? item.grossWeightKg : Number((item.quantity * 18.5).toFixed(2));
    const itemNet = item.netWeightKg > 0 ? item.netWeightKg : Number((itemGross * 0.92).toFixed(2));
    const packages = Math.max(1, Math.round(item.quantity));

    currentPalletItems.push(item);
    currentPalletGross += itemGross;
    currentPalletNet += itemNet;
    currentPalletPackages += packages;

    const isLastItem = i === lineItems.length - 1;
    const shouldClosePallet = currentPalletGross >= 1400 || (isLastItem && currentPalletItems.length > 0) || pallets.length + 1 < targetPalletsCount;

    if (shouldClosePallet) {
      const palletNo = `PLT-${basePalletNumber + palletIdx - 1}`;
      const hasDg = currentPalletItems.some(it => it.isDangerousGood);
      const palletId = `plt-${Date.now()}-${palletIdx}`;

      // Update item references
      currentPalletItems.forEach(it => {
        it.palletNumber = palletNo;
      });

      pallets.push({
        id: palletId,
        palletNumber: palletNo,
        packageCount: currentPalletPackages,
        packageType: currentPalletItems[0]?.uqc === 'DRUM' ? 'DRUM' : 'BOX',
        grossWeightKg: Number(currentPalletGross.toFixed(2)),
        netWeightKg: Number(currentPalletNet.toFixed(2)),
        dimensions: '120 x 80 x 165 cm',
        isDangerousGoods: hasDg,
        lineItemIds: currentPalletItems.map(it => it.id)
      });

      currentPalletItems = [];
      currentPalletGross = 0;
      currentPalletNet = 0;
      currentPalletPackages = 0;
      palletIdx++;
    }
  }

  // 2. Allocate Pallets into Containers
  const spec = CONTAINER_SPECS[preferredContainerType];
  const containers: ContainerAllocation[] = [];
  let currentCont: ContainerAllocation = createEmptyContainer(preferredContainerType, 0);

  for (let p = 0; p < pallets.length; p++) {
    const pallet = pallets[p];
    const willExceedWeight = currentCont.totalGrossWeightKg + pallet.grossWeightKg > spec.maxPayloadKg;
    const willExceedPalletCapacity = currentCont.pallets.length >= (preferredContainerType === '20GP' ? 11 : 24);

    if ((willExceedWeight || willExceedPalletCapacity) && currentCont.pallets.length > 0) {
      containers.push(recalculateContainer(currentCont));
      currentCont = createEmptyContainer(preferredContainerType, containers.length);
    }

    pallet.assignedContainerId = currentCont.id;
    currentCont.pallets.push(pallet);
    currentCont.assignedPalletIds.push(pallet.id);
    currentCont.totalGrossWeightKg += pallet.grossWeightKg;
    currentCont.totalNetWeightKg += pallet.netWeightKg;
    currentCont.totalPackages += pallet.packageCount;
    if (pallet.isDangerousGoods) currentCont.hasDangerousGoods = true;

    // Stamp line items with container number
    pallet.lineItemIds.forEach(id => {
      const it = lineItems.find(x => x.id === id);
      if (it) it.containerNumber = currentCont.containerNumber;
    });
  }

  if (currentCont.pallets.length > 0 || containers.length === 0) {
    containers.push(recalculateContainer(currentCont));
  }

  return { containers, pallets };
}

export function createEmptyContainer(type: ContainerType = '40HC', index: number = 0): ContainerAllocation {
  const spec = CONTAINER_SPECS[type];
  return {
    id: `cont-${Date.now()}-${index + 1}-${Math.random().toString(36).slice(2, 6)}`,
    containerNumber: generateContainerNumber(index),
    sealNumber: generateSealNumber(index),
    containerType: type,
    maxPayloadKg: spec.maxPayloadKg,
    tareWeightKg: spec.tareWeightKg,
    pallets: [],
    assignedPalletIds: [],
    totalGrossWeightKg: 0,
    totalNetWeightKg: 0,
    totalPackages: 0,
    isOverweight: false,
    hasDangerousGoods: false
  };
}

export function recalculateContainer(cont: ContainerAllocation): ContainerAllocation {
  const gross = cont.pallets.reduce((s, p) => s + (p.grossWeightKg || 0), 0);
  const net = cont.pallets.reduce((s, p) => s + (p.netWeightKg || 0), 0);
  const pkgs = cont.pallets.reduce((s, p) => s + (p.packageCount || 0), 0);
  const spec = CONTAINER_SPECS[cont.containerType] || CONTAINER_SPECS['40HC'];

  return {
    ...cont,
    maxPayloadKg: spec.maxPayloadKg,
    tareWeightKg: spec.tareWeightKg,
    totalGrossWeightKg: Number(gross.toFixed(2)),
    totalNetWeightKg: Number(net.toFixed(2)),
    totalPackages: pkgs,
    totalPallets: cont.pallets.length,
    isOverweight: gross > spec.maxPayloadKg,
    hasDangerousGoods: cont.pallets.some(p => p.isDangerousGoods)
  };
}
