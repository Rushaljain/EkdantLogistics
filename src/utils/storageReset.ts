// Ekdant Logistics - Storage Purge & Clean-State Manager
// Completely clears browser storage (localStorage, sessionStorage, IndexedDB) to eliminate cross-session bleed

import type { BLManifest, DGManifest, ExtractedShipmentJSON, UploadMode } from '../types';

export interface ArchivedShipment {
  id: string;
  archivedAt: string;
  mode: UploadMode;
  shipmentJson: ExtractedShipmentJSON;
  dgManifest?: DGManifest;
  blManifest?: BLManifest;
  dgCustomOverrides?: Record<string, string>;
  blCustomOverrides?: Record<string, string>;
  title?: string;
}

const STORAGE_SAVED_SESSIONS_KEY = 'ekdant_saved_work_sessions_v1';

/**
 * Returns saved work sessions from localStorage (persisted across sessions)
 */
export function getSavedWorkSessions(): ArchivedShipment[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_SAVED_SESSIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Failed to read saved work sessions:', err);
    return [];
  }
}

/**
 * Saves or updates a work session with full truth JSON, manifests, layouts, and overrides.
 */
export function saveWorkSession(
  shipmentJson: ExtractedShipmentJSON,
  dgManifest?: DGManifest,
  blManifest?: BLManifest,
  dgCustomOverrides?: Record<string, string>,
  blCustomOverrides?: Record<string, string>
): ArchivedShipment {
  const invoiceRef = shipmentJson.invoiceNumbers?.[0] || shipmentJson.bookingNumber || shipmentJson.shipperReference || 'Shipment';
  const record: ArchivedShipment = {
    id: `save-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    archivedAt: new Date().toISOString(),
    mode: shipmentJson.uploadMode,
    title: `${invoiceRef} (${shipmentJson.pallets?.length || 0} Pallets)`,
    shipmentJson: JSON.parse(JSON.stringify(shipmentJson)),
    dgManifest: dgManifest ? JSON.parse(JSON.stringify(dgManifest)) : undefined,
    blManifest: blManifest ? JSON.parse(JSON.stringify(blManifest)) : undefined,
    dgCustomOverrides: dgCustomOverrides ? JSON.parse(JSON.stringify(dgCustomOverrides)) : {},
    blCustomOverrides: blCustomOverrides ? JSON.parse(JSON.stringify(blCustomOverrides)) : {}
  };

  if (typeof window !== 'undefined') {
    try {
      const existing = getSavedWorkSessions();
      // Keep most recent first
      const updated = [record, ...existing.filter((s) => s.id !== record.id)].slice(0, 50);
      window.localStorage.setItem(STORAGE_SAVED_SESSIONS_KEY, JSON.stringify(updated));
    } catch (err) {
      console.warn('Failed to write work session to localStorage:', err);
    }
  }

  return record;
}

/**
 * Deletes a saved work session by ID.
 */
export function deleteSavedWorkSession(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getSavedWorkSessions();
    const updated = existing.filter((s) => s.id !== id);
    window.localStorage.setItem(STORAGE_SAVED_SESSIONS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to delete work session from localStorage:', err);
  }
}

// In-memory archive store for current session isolation
let inMemoryArchive: ArchivedShipment[] = [];

const KNOWN_INDEXED_DB_NAMES = [
  'ekdant_workspace_db_v1',
  'ekdant_workspace_db',
  'ekdant_storage',
  'ekdant-storage',
  'ekdant_db',
  'keyval-store'
];

/**
 * Completely purges all browser storage:
 * - window.localStorage
 * - window.sessionStorage
 * - All IndexedDB databases created by legacy versions
 * Flushes in-memory cache to guarantee zero cross-session data contamination.
 */
export async function purgeAllWorkspaceStorage(): Promise<void> {
  // 1. Clear Web Storage (preserving Format Library & Custom API Key across resets)
  if (typeof window !== 'undefined') {
    try {
      const preservedLibrary = window.localStorage.getItem('ekdant_format_library_v1');
      const preservedKey = window.localStorage.getItem('ekdant_custom_gemini_key');
      const preservedSavedSessions = window.localStorage.getItem(STORAGE_SAVED_SESSIONS_KEY);

      window.localStorage.clear();

      if (preservedLibrary) {
        window.localStorage.setItem('ekdant_format_library_v1', preservedLibrary);
      }
      if (preservedKey) {
        window.localStorage.setItem('ekdant_custom_gemini_key', preservedKey);
      }
      if (preservedSavedSessions) {
        window.localStorage.setItem(STORAGE_SAVED_SESSIONS_KEY, preservedSavedSessions);
      }
    } catch (e) {
      console.warn('[StorageReset] localStorage clear failed:', e);
    }

    try {
      window.sessionStorage.clear();
    } catch (e) {
      console.warn('[StorageReset] sessionStorage clear failed:', e);
    }

    // 2. Clear IndexedDB
    if (window.indexedDB) {
      const deleteDb = (dbName: string): Promise<void> => {
        return new Promise((resolve) => {
          try {
            const req = window.indexedDB.deleteDatabase(dbName);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => resolve();
          } catch {
            resolve();
          }
        });
      };

      const dbNamesToDelete = new Set<string>(KNOWN_INDEXED_DB_NAMES);

      // If browser supports indexedDB.databases(), discover and delete all DBs
      if (typeof window.indexedDB.databases === 'function') {
        try {
          const dbs = await window.indexedDB.databases();
          for (const db of dbs) {
            if (db.name) {
              dbNamesToDelete.add(db.name);
            }
          }
        } catch (e) {
          console.warn('[StorageReset] indexedDB.databases() lookup failed:', e);
        }
      }

      await Promise.all(Array.from(dbNamesToDelete).map((name) => deleteDb(name)));
    }
  }

  // 3. Reset in-memory session archive
  inMemoryArchive = [];
  console.info('[StorageReset] Workspace storage purged clean.');
}

/**
 * Archives current session data cleanly into isolated in-memory list
 */
export function archiveCurrentSession(
  shipmentJson: ExtractedShipmentJSON,
  dgManifest?: DGManifest,
  blManifest?: BLManifest
): ArchivedShipment {
  const record: ArchivedShipment = {
    id: `archive-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    archivedAt: new Date().toISOString(),
    mode: shipmentJson.uploadMode,
    shipmentJson: JSON.parse(JSON.stringify(shipmentJson)),
    dgManifest: dgManifest ? JSON.parse(JSON.stringify(dgManifest)) : undefined,
    blManifest: blManifest ? JSON.parse(JSON.stringify(blManifest)) : undefined
  };

  inMemoryArchive.push(record);
  return record;
}

/**
 * Returns all archived shipments in the current session
 */
export function getArchivedShipments(): ArchivedShipment[] {
  return [...inMemoryArchive];
}

/**
 * Clears the in-memory archive
 */
export function clearArchivedShipments(): void {
  inMemoryArchive = [];
}
