import { Injectable, signal, computed } from '@angular/core';
import Dexie, { Table } from 'dexie';
import type { Asset, Checklist, PreShiftCheckEvent, Fault, AppMeta } from '../models/types';

// ==========================================
// IndexedDB Database Schema using Dexie
// ==========================================
class PreShiftCheckDB extends Dexie {
  assets!: Table<Asset, string>;
  activeChecklists!: Table<Checklist, string>;
  events!: Table<PreShiftCheckEvent, string>;
  faults!: Table<Fault, string>;
  appMeta!: Table<AppMeta, string>;
  // Cached last failed checks per asset (fetched from server during sync)
  lastFailedChecks!: Table<PreShiftCheckEvent, string>;

  constructor() {
    super('PreShiftCheckDB');

    this.version(2).stores({
      // Primary key is asset_id, index on machine_class and qr_code_value
      assets: 'asset_id, machine_class, qr_code_value',
      // Primary key is checklist_id, index on machine_class and status
      activeChecklists: 'checklist_id, machine_class, status',
      // Primary key is event_id, index on asset_id and sync_status
      events: 'event_id, asset_id, sync_status, created_at',
      // Primary key is fault_id, index on asset_id, status, and sync_status
      faults: 'fault_id, asset_id, status, sync_status, source_event_id',
      // Key-value store for app metadata
      appMeta: 'key',
      // Cached last failed checks keyed by asset_id (from server)
      lastFailedChecks: 'asset_id'
    });
  }
}

@Injectable({
  providedIn: 'root'
})
export class DatabaseService {
  private db = new PreShiftCheckDB();

  // Reactive signals for UI
  private _pendingEventsCount = signal(0);
  private _pendingFaultsCount = signal(0);
  private _lastSyncAt = signal<string | null>(null);
  private _reporterName = signal<string | null>(null);

  // Computed values
  readonly pendingEventsCount = computed(() => this._pendingEventsCount());
  readonly pendingFaultsCount = computed(() => this._pendingFaultsCount());
  readonly totalPendingCount = computed(() => this._pendingEventsCount() + this._pendingFaultsCount());
  readonly lastSyncAt = computed(() => this._lastSyncAt());
  readonly reporterName = computed(() => this._reporterName());
  readonly hasReporter = computed(() => !!this._reporterName());

  constructor() {
    this.initializeSignals();
  }

  private async initializeSignals(): Promise<void> {
    await this.refreshPendingCounts();
    await this.loadAppMeta();
  }

  // ==========================================
  // Assets
  // ==========================================
  async getAssets(): Promise<Asset[]> {
    return this.db.assets.toArray();
  }

  async getAsset(assetId: string): Promise<Asset | undefined> {
    return this.db.assets.get(assetId);
  }

  async getAssetByQrCode(qrCode: string): Promise<Asset | undefined> {
    return this.db.assets.where('qr_code_value').equals(qrCode).first();
  }

  async saveAssets(assets: Asset[]): Promise<void> {
    await this.db.assets.bulkPut(assets);
  }

  async searchAssets(query: string): Promise<Asset[]> {
    const lowerQuery = query.toLowerCase();
    return this.db.assets
      .filter(a =>
        a.name.toLowerCase().includes(lowerQuery) ||
        a.asset_id.toLowerCase().includes(lowerQuery) ||
        a.machine_class.toLowerCase().includes(lowerQuery)
      )
      .toArray();
  }

  // ==========================================
  // Checklists
  // ==========================================
  async getActiveChecklist(machineClass: string): Promise<Checklist | undefined> {
    return this.db.activeChecklists
      .where({ machine_class: machineClass, status: 'ACTIVE' })
      .first();
  }

  async getAllActiveChecklists(): Promise<Checklist[]> {
    return this.db.activeChecklists.where('status').equals('ACTIVE').toArray();
  }

  async saveChecklists(checklists: Checklist[]): Promise<void> {
    // Only save active checklists
    const active = checklists.filter(c => c.status === 'ACTIVE');
    await this.db.activeChecklists.bulkPut(active);
  }

  // ==========================================
  // Events
  // ==========================================
  async getEvents(): Promise<PreShiftCheckEvent[]> {
    return this.db.events.orderBy('created_at').reverse().toArray();
  }

  async getEventsByAsset(assetId: string): Promise<PreShiftCheckEvent[]> {
    return this.db.events.where('asset_id').equals(assetId).reverse().sortBy('created_at');
  }

  /**
   * Get the last failed check for an asset that hasn't been resolved
   * A failed check is considered unresolved if there's no subsequent PASS check
   * @param assetId - Asset ID to check
   * @returns The last failed event if unresolved, null otherwise
   */
  async getLastUnresolvedFailedCheck(assetId: string): Promise<PreShiftCheckEvent | null> {
    // Get all events for this asset, sorted by date descending
    const events = await this.db.events
      .where('asset_id')
      .equals(assetId)
      .reverse()
      .sortBy('completed_at');

    if (events.length === 0) return null;

    // Check the most recent event
    const lastEvent = events[0];

    // If the last check was a PASS, there's no unresolved failure
    if (lastEvent.result === 'PASS') return null;

    // The last check was a FAIL, return it
    return lastEvent;
  }

  async getPendingEvents(): Promise<PreShiftCheckEvent[]> {
    return this.db.events.where('sync_status').anyOf(['PENDING', 'ERROR']).toArray();
  }

  async getEvent(eventId: string): Promise<PreShiftCheckEvent | undefined> {
    return this.db.events.get(eventId);
  }

  /**
   * Save or update an event in the local database
   * Uses upsert (put) - if event_id exists, updates it; otherwise creates new
   * This ensures editing a pending form updates the same record, not creating duplicates
   * @param event - The event to save
   */
  async saveEvent(event: PreShiftCheckEvent): Promise<void> {
    await this.db.events.put(event);
    await this.refreshPendingCounts();
  }

  async updateEventSyncStatus(eventId: string, status: 'PENDING' | 'SYNCED' | 'ERROR', error?: string): Promise<void> {
    await this.db.events.update(eventId, {
      sync_status: status,
      last_error: error,
      updated_at: new Date().toISOString()
    });
    await this.refreshPendingCounts();
  }

  async deleteEvent(eventId: string): Promise<void> {
    // Also delete associated faults
    await this.db.faults.where('source_event_id').equals(eventId).delete();
    await this.db.events.delete(eventId);
    await this.refreshPendingCounts();
  }

  // ==========================================
  // Faults
  // ==========================================
  async getFaults(): Promise<Fault[]> {
    return this.db.faults.orderBy('created_at').reverse().toArray();
  }

  async getFaultsByAsset(assetId: string): Promise<Fault[]> {
    return this.db.faults.where('asset_id').equals(assetId).toArray();
  }

  async getOpenFaultsByAsset(assetId: string): Promise<Fault[]> {
    return this.db.faults
      .where({ asset_id: assetId, status: 'OPEN' })
      .toArray();
  }

  async getPendingFaults(): Promise<Fault[]> {
    return this.db.faults.where('sync_status').anyOf(['PENDING', 'ERROR']).toArray();
  }

  async getFault(faultId: string): Promise<Fault | undefined> {
    return this.db.faults.get(faultId);
  }

  async saveFault(fault: Fault): Promise<void> {
    await this.db.faults.put(fault);
    await this.refreshPendingCounts();
  }

  async saveFaults(faults: Fault[]): Promise<void> {
    await this.db.faults.bulkPut(faults);
    await this.refreshPendingCounts();
  }

  async updateFaultSyncStatus(faultId: string, status: 'PENDING' | 'SYNCED' | 'ERROR', error?: string): Promise<void> {
    await this.db.faults.update(faultId, {
      sync_status: status,
      last_error: error,
      updated_at: new Date().toISOString()
    });
    await this.refreshPendingCounts();
  }

  async replaceSyncedFaultsForAsset(assetId: string, serverFaults: Fault[]): Promise<void> {
    // Delete existing SYNCED faults for this asset
    await this.db.faults
      .where({ asset_id: assetId, sync_status: 'SYNCED' })
      .delete();

    // Insert new faults from server
    if (serverFaults.length > 0) {
      const faultsWithSyncStatus = serverFaults.map(f => ({
        ...f,
        sync_status: 'SYNCED' as const
      }));
      await this.db.faults.bulkPut(faultsWithSyncStatus);
    }
  }

  /**
   * Delete all faults associated with an event
   * Used when editing a pending check to replace old faults with updated ones
   * @param eventId - The event ID whose faults should be deleted
   */
  async deleteFaultsByEventId(eventId: string): Promise<void> {
    await this.db.faults.where('source_event_id').equals(eventId).delete();
    await this.refreshPendingCounts();
  }

  // ==========================================
  // Last Failed Checks Cache (from server)
  // ==========================================

  /**
   * Save a last failed check for an asset (fetched from server during sync)
   * @param assetId - Asset ID
   * @param event - The failed event or null to clear
   */
  async saveLastFailedCheck(assetId: string, event: PreShiftCheckEvent | null): Promise<void> {
    if (event) {
      // Store with asset_id as the key for easy lookup
      await this.db.lastFailedChecks.put({ ...event, asset_id: assetId });
    } else {
      // Clear if no failure
      await this.db.lastFailedChecks.delete(assetId);
    }
  }

  /**
   * Get the cached last failed check for an asset
   * @param assetId - Asset ID to lookup
   * @returns The cached failed event or null
   */
  async getCachedLastFailedCheck(assetId: string): Promise<PreShiftCheckEvent | null> {
    const cached = await this.db.lastFailedChecks.get(assetId);
    return cached || null;
  }

  /**
   * Clear all cached last failed checks (used before refresh)
   */
  async clearLastFailedChecksCache(): Promise<void> {
    await this.db.lastFailedChecks.clear();
  }

  // ==========================================
  // App Meta
  // ==========================================
  async getMeta(key: string): Promise<string | number | boolean | null> {
    const meta = await this.db.appMeta.get(key);
    return meta?.value ?? null;
  }

  async setMeta(key: string, value: string | number | boolean | null): Promise<void> {
    await this.db.appMeta.put({ key, value });

    // Update signals
    if (key === 'lastSyncAt') {
      this._lastSyncAt.set(value as string | null);
    } else if (key === 'reporterName') {
      this._reporterName.set(value as string | null);
    }
  }

  async getReporter(): Promise<{ name: string; user_id?: string } | null> {
    const name = await this.getMeta('reporterName') as string | null;
    if (!name) return null;
    const userId = await this.getMeta('reporterUserId') as string | null;
    return { name, user_id: userId || undefined };
  }

  async setReporter(name: string, userId?: string): Promise<void> {
    await this.setMeta('reporterName', name);
    await this.setMeta('reporterUserId', userId || null);
    this._reporterName.set(name);
  }

  async clearReporter(): Promise<void> {
    await this.setMeta('reporterName', null);
    await this.setMeta('reporterUserId', null);
    this._reporterName.set(null);
  }

  private async loadAppMeta(): Promise<void> {
    const lastSync = await this.getMeta('lastSyncAt') as string | null;
    const reporter = await this.getMeta('reporterName') as string | null;
    this._lastSyncAt.set(lastSync);
    this._reporterName.set(reporter);
  }

  // ==========================================
  // Utilities
  // ==========================================
  async refreshPendingCounts(): Promise<void> {
    const pendingEvents = await this.db.events.where('sync_status').anyOf(['PENDING', 'ERROR']).count();
    const pendingFaults = await this.db.faults.where('sync_status').anyOf(['PENDING', 'ERROR']).count();
    this._pendingEventsCount.set(pendingEvents);
    this._pendingFaultsCount.set(pendingFaults);
  }

  async clearAllData(): Promise<void> {
    await Promise.all([
      this.db.assets.clear(),
      this.db.activeChecklists.clear(),
      this.db.events.clear(),
      this.db.faults.clear(),
      this.db.appMeta.clear()
    ]);
    this._pendingEventsCount.set(0);
    this._pendingFaultsCount.set(0);
    this._lastSyncAt.set(null);
    this._reporterName.set(null);
  }

  // Check if we have minimum required data to start a check
  async canStartCheck(assetId: string): Promise<{ canStart: boolean; error?: string }> {
    const asset = await this.getAsset(assetId);
    if (!asset) {
      return { canStart: false, error: 'Asset not found in local cache. Please sync data first.' };
    }

    const checklist = await this.getActiveChecklist(asset.machine_class);
    if (!checklist) {
      return { canStart: false, error: `No active checklist found for ${asset.machine_class}. Please sync data first.` };
    }

    const reporter = await this.getReporter();
    if (!reporter) {
      return { canStart: false, error: 'Please set your name before starting a check.' };
    }

    return { canStart: true };
  }
}

