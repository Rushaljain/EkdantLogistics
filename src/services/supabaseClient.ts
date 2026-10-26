// Supabase Client and Local Cache Fallback
// Provides persistent storage for Shipments, Exporter Masters, and Audit Logs

import { createClient } from '@supabase/supabase-js';
import type { ShipmentData, ExporterMasterData } from '../types/customs';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ekdant-customs-demo.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'demo-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

const LOCAL_STORAGE_KEY_SHIPMENTS = 'ekdant_customs_shipments_v1';
const LOCAL_STORAGE_KEY_MASTERS = 'ekdant_exporter_masters_v1';

/**
 * Saves a shipment to Supabase or local storage fallback
 */
export async function saveShipment(shipment: ShipmentData): Promise<void> {
  try {
    // Attempt Supabase insert/update if real credentials provided
    if (supabaseUrl && !supabaseUrl.includes('demo.supabase.co')) {
      await supabase
        .from('shipments')
        .upsert({
          id: shipment.id,
          job_no: shipment.jobNo,
          port_code: shipment.portCode,
          status: shipment.status,
          payload: shipment,
          updated_at: new Date().toISOString()
        });
    }
  } catch (err) {
    console.warn('Supabase remote sync skipped, saving locally:', err);
  }

  // Always sync locally for instant snappy HITL UI
  try {
    const existing = getSavedShipments();
    const filtered = existing.filter(s => s.id !== shipment.id);
    filtered.unshift(shipment);
    localStorage.setItem(LOCAL_STORAGE_KEY_SHIPMENTS, JSON.stringify(filtered.slice(0, 50)));
  } catch (e) {
    console.error('Failed to save to local cache:', e);
  }
}

/**
 * Loads recent shipments from local cache
 */
export function getSavedShipments(): ShipmentData[] {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY_SHIPMENTS);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * Loads Exporter Masters presets
 */
export function getExporterMasters(): ExporterMasterData[] {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY_MASTERS);
    if (data) return JSON.parse(data);
  } catch {}

  // Built-in presets for Ekdant Logistics regular clients
  return [
    {
      id: 'exp-1',
      companyName: 'APEX ENGINEERING EXPORTS PVT LTD',
      iec: '0391048291',
      gstin: '27AAACA9921E1Z8',
      adCode: '0290041',
      bankName: 'State Bank of India',
      branchCode: 'Commercial Branch Fort',
      address: 'Plot 42, MIDC Industrial Area, Turbhe, Navi Mumbai, Maharashtra 400705',
      stateCode: '27',
      defaultPortCode: 'INNSA1' // JNPT Nhava Sheva
    },
    {
      id: 'exp-2',
      companyName: 'MAHARASHTRA PRECISION VALVES & FLANGES LLP',
      iec: '0385019284',
      gstin: '27AAOFM5512B1ZC',
      adCode: '0340118',
      bankName: 'Bank of Baroda',
      branchCode: 'Nhava Sheva Port Branch',
      address: 'Survey No. 108, Uran Road, Dronagiri Node, Navi Mumbai, MH 400707',
      stateCode: '27',
      defaultPortCode: 'INNSA1'
    },
    {
      id: 'exp-3',
      companyName: 'SAHYADRI PHARMACEUTICALS & LIFE SCIENCES LTD',
      iec: '0399003418',
      gstin: '27AABCS8891D1Z1',
      adCode: '0150092',
      bankName: 'HDFC Bank Ltd',
      branchCode: 'Sahar Cargo Complex Andheri',
      address: 'Unit 4-B, Seepz SEZ, Andheri East, Mumbai, Maharashtra 400096',
      stateCode: '27',
      defaultPortCode: 'INBOM4' // Mumbai Air Cargo
    }
  ];
}
