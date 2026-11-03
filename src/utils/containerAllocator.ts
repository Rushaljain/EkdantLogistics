// Container Allocation and Pallet Segregation Engine
// Groups pallets & line items into standard ISO containers (20GP, 40GP, 40HC, 45HC)
// Backed by LAFF (Largest Weight / Area Fit First) optimizer with 25T weight caps & 11-pallet floor caps

import type { ContainerAllocation, ContainerType, LineItem, Pallet } from '../types';
import { CONTAINER_SPECS } from '../types';
import { 
  optimizeContainerAllocation, 
  generateIsoContainerNumber, 
  generateSealNumber as generateOptimizedSealNumber
} from './containerOptimizer';
import type { ContainerOptimizationSummary } from './containerOptimizer';

export { optimizeContainerAllocation, generateIsoContainerNumber };
export type { ContainerOptimizationSummary };

export function generateContainerNumber(index: number = 0): string {
  return generateIsoContainerNumber(index);
}

export function generateSealNumber(index: number = 0): string {
  return generateOptimizedSealNumber(index);
}

/**
 * Automatically segregates line items into Pallets and allocates them across ISO Containers
 * using the LAFF (Largest Weight / Area Fit First) solver with 25-ton weight caps and 11-pallet footprint caps.
 */
export function allocateContainers(
  lineItems: LineItem[],
  preferredContainerType: ContainerType = '20GP',
  explicitPalletCount?: number
): { containers: ContainerAllocation[]; pallets: Pallet[]; summary?: ContainerOptimizationSummary } {
  return optimizeContainerAllocation(lineItems, undefined, {
    preferredContainerType,
    explicitPalletCount
  });
}

export function createEmptyContainer(type: ContainerType = '20GP', index: number = 0): ContainerAllocation {
  const spec = CONTAINER_SPECS[type];
  return {
    id: `cont-${Date.now()}-${index + 1}-${Math.random().toString(36).slice(2, 6)}`,
    containerNumber: generateContainerNumber(index),
    sealNumber: generateSealNumber(index),
    containerType: type,
    maxPayloadKg: spec.maxPayloadKg,
    maxPallets: spec.maxPallets,
    tareWeightKg: spec.tareWeightKg,
    pallets: [],
    assignedPalletIds: [],
    totalGrossWeightKg: 0,
    totalNetWeightKg: 0,
    totalPackages: 0,
    totalPallets: 0,
    isOverweight: false,
    isOverCapacity: false,
    isSpillover: index > 0,
    weightUtilizationPct: 0,
    palletUtilizationPct: 0,
    hasDangerousGoods: false
  };
}

export function recalculateContainer(cont: ContainerAllocation): ContainerAllocation {
  const gross = cont.pallets.reduce((s, p) => s + (p.grossWeightKg || 0), 0);
  const net = cont.pallets.reduce((s, p) => s + (p.netWeightKg || 0), 0);
  const pkgs = cont.pallets.reduce((s, p) => s + (p.packageCount || 0), 0);
  const spec = CONTAINER_SPECS[cont.containerType] || CONTAINER_SPECS['20GP'];
  const palletCount = cont.pallets.length;
  const weightUtil = Math.round((gross / spec.maxPayloadKg) * 100);
  const palletUtil = Math.round((palletCount / spec.maxPallets) * 100);

  return {
    ...cont,
    maxPayloadKg: spec.maxPayloadKg,
    maxPallets: spec.maxPallets,
    tareWeightKg: spec.tareWeightKg,
    totalGrossWeightKg: Number(gross.toFixed(2)),
    totalNetWeightKg: Number(net.toFixed(2)),
    totalPackages: pkgs,
    totalPallets: palletCount,
    weightUtilizationPct: weightUtil,
    palletUtilizationPct: palletUtil,
    isOverweight: gross > spec.maxPayloadKg,
    isOverCapacity: palletCount > spec.maxPallets,
    hasDangerousGoods: cont.pallets.some(p => p.isDangerousGoods)
  };
}
