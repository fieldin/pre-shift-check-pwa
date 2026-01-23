import { Injectable, inject, signal, computed } from '@angular/core';
import { DatabaseService } from './database.service';
import { ApiService } from './api.service';
import type { PreShiftCheckEvent, Fault, Asset, Checklist } from '../models/types';

export type SyncState = 'idle' | 'syncing' | 'success' | 'error';

/** Auto-sync interval in milliseconds (2 minutes) */
const AUTO_SYNC_INTERVAL = 2 * 60 * 1000;

/** Connectivity check interval in milliseconds (10 seconds for faster offline detection) */
const CONNECTIVITY_CHECK_INTERVAL = 10 * 1000;

@Injectable({
  providedIn: 'root'
})
export class SyncService {
  private db = inject(DatabaseService);
  private api = inject(ApiService);

  // Reactive signals for sync state
  private _syncState = signal<SyncState>('idle');
  private _syncMessage = signal<string>('');
  private _isOnline = signal(false); // Start as false, verify with actual ping

  readonly syncState = computed(() => this._syncState());
  readonly syncMessage = computed(() => this._syncMessage());
  readonly isOnline = computed(() => this._isOnline());
  readonly isSyncing = computed(() => this._syncState() === 'syncing');

  private syncInProgress = false;
  private autoSyncIntervalId: ReturnType<typeof setInterval> | null = null;
  private connectivityCheckIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.setupOnlineListeners();
    this.setupConnectivityCheck();
    this.setupAutoSync();
  }

  /**
   * Setup listeners for online/offline events
   * When coming back online, trigger a full sync
   */
  private setupOnlineListeners(): void {
    // Standard online/offline events
    window.addEventListener('online', () => {
      console.log('[Sync] Online event detected - verifying connectivity');
      // Don't trust the event alone, verify with actual ping
      this.checkConnectivity();
    });

    window.addEventListener('offline', () => {
      console.log('[Sync] Offline event detected');
      this._isOnline.set(false);
      // Stop auto-sync when offline
      this.stopAutoSync();
    });

    // Network Information API (better support on mobile)
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (connection) {
      connection.addEventListener('change', () => {
        console.log('[Sync] Network connection changed - checking connectivity');
        this.checkConnectivity();
      });
    }
  }

  /**
   * Setup periodic connectivity check to verify actual server reachability
   * navigator.onLine is unreliable - it only checks network interface, not actual internet
   */
  private setupConnectivityCheck(): void {
    // Check immediately on startup
    this.checkConnectivity();

    // Then check periodically
    this.connectivityCheckIntervalId = setInterval(() => {
      this.checkConnectivity();
    }, CONNECTIVITY_CHECK_INTERVAL);
  }

  /**
   * Check actual connectivity by pinging the server
   * This is more reliable than navigator.onLine which is unreliable on mobile
   * Note: We don't trust navigator.onLine on mobile - always verify with actual ping
   * 
   * Strategy: Default to offline, only go online after successful server ping
   */
  async checkConnectivity(): Promise<boolean> {
    // Check 1: If browser explicitly says offline, we're definitely offline
    if (!navigator.onLine) {
      console.log('[Sync] Browser reports offline (navigator.onLine = false)');
      this._isOnline.set(false);
      return false;
    }

    // Check 2: Use Network Information API if available (better on mobile)
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (connection) {
      // If connection type is 'none', we're offline
      if (connection.type === 'none' || connection.effectiveType === 'none') {
        console.log('[Sync] Network Information API reports no connection');
        this._isOnline.set(false);
        return false;
      }
      console.log(`[Sync] Network type: ${connection.type || connection.effectiveType || 'unknown'}`);
    }

    // Remember if we were online before (for triggering sync on reconnect)
    const wasOnline = this._isOnline();

    // Check 3: Actually ping the server (most reliable check)
    try {
      console.log('[Sync] Pinging server to verify connectivity...');
      const isConnected = await this.api.healthCheck();

      console.log(`[Sync] Server ping result: ${isConnected ? 'SUCCESS' : 'FAILED'}`);
      this._isOnline.set(isConnected);

      // If we just came online, trigger sync and restart auto-sync
      if (isConnected && !wasOnline) {
        console.log('[Sync] Connectivity restored - triggering full sync');
        this.initialSync();
        this.startAutoSync();
      }

      return isConnected;
    } catch (error) {
      console.log('[Sync] Server ping failed:', error);
      this._isOnline.set(false);
      return false;
    }
  }

  /**
   * Force offline status (useful when we know we're offline)
   */
  forceOffline(): void {
    console.log('[Sync] Forcing offline status');
    this._isOnline.set(false);
    this.stopAutoSync();
  }

  /**
   * Setup automatic sync every 2 minutes while online
   */
  private setupAutoSync(): void {
    // Only start auto-sync after connectivity is confirmed
    // The connectivity check will start it when online
  }

  /**
   * Start the auto-sync interval (every 2 minutes)
   */
  private startAutoSync(): void {
    // Clear any existing interval
    this.stopAutoSync();

    console.log('[Sync] Starting auto-sync (every 2 minutes)');
    this.autoSyncIntervalId = setInterval(() => {
      if (this._isOnline() && !this.syncInProgress) {
        console.log('[Sync] Auto-sync triggered');
        this.initialSync();
      }
    }, AUTO_SYNC_INTERVAL);
  }

  /**
   * Stop the auto-sync interval
   */
  private stopAutoSync(): void {
    if (this.autoSyncIntervalId) {
      console.log('[Sync] Stopping auto-sync');
      clearInterval(this.autoSyncIntervalId);
      this.autoSyncIntervalId = null;
    }
  }

  // ==========================================
  // Initial Data Sync (fetch from server)
  // ==========================================
  async initialSync(): Promise<void> {
    if (!this._isOnline()) {
      console.log('[Sync] Offline - skipping initial sync');
      return;
    }

    this._syncState.set('syncing');
    this._syncMessage.set('Syncing data...');

    try {
      // Fetch assets and checklists in parallel
      const [assets, checklists] = await Promise.all([
        this.api.getAssets(),
        this.api.getAllChecklists()
      ]);

      // Save to local database
      await this.db.saveAssets(assets);
      await this.db.saveChecklists(checklists);

      // IMPORTANT: Upload pending items FIRST before fetching last-failed-checks
      // This ensures we get the correct state after our events are uploaded
      // Example: Driver A has a pending FAIL from 10:00, Driver B passed at 10:30
      // We need to upload Driver A's event first, then fetch the correct last-failed state
      await this.syncQueue();

      // NOW fetch and cache last failed checks (after pending items are uploaded)
      // This ensures the cache reflects the true server state including our just-uploaded events
      await this.fetchLastFailedChecksForAllAssets(assets);

      // Update last sync time
      await this.db.setMeta('lastSyncAt', new Date().toISOString());

      this._syncState.set('success');
      this._syncMessage.set('Sync completed');

      console.log(`[Sync] Initial sync complete: ${assets.length} assets, ${checklists.length} checklists`);
    } catch (error) {
      console.error('[Sync] Initial sync failed:', error);
      this._syncState.set('error');
      this._syncMessage.set(error instanceof Error ? error.message : 'Sync failed');
    }
  }

  /**
   * Fetch and cache last failed checks for all assets
   * This runs during sync so data is available offline
   */
  private async fetchLastFailedChecksForAllAssets(assets: Asset[]): Promise<void> {
    this._syncMessage.set('Fetching failure reports...');

    // Clear old cache first
    await this.db.clearLastFailedChecksCache();

    // Fetch last failed check for each asset in parallel (with limit)
    const batchSize = 5; // Limit concurrent requests
    for (let i = 0; i < assets.length; i += batchSize) {
      const batch = assets.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (asset) => {
          try {
            const lastFailed = await this.api.getLastFailedCheck(asset.asset_id);
            await this.db.saveLastFailedCheck(asset.asset_id, lastFailed);
          } catch (error) {
            console.warn(`[Sync] Failed to fetch last failed check for ${asset.asset_id}:`, error);
          }
        })
      );
    }

    console.log(`[Sync] Cached last failed checks for ${assets.length} assets`);
  }

  // ==========================================
  // Queue Sync (upload pending items)
  // ==========================================
  async syncQueue(): Promise<void> {
    // Prevent concurrent syncs
    if (this.syncInProgress) {
      console.log('[Sync] Sync already in progress, skipping');
      return;
    }

    if (!this._isOnline()) {
      console.log('[Sync] Offline - cannot sync queue');
      return;
    }

    // Check if reporter is set
    const reporter = await this.db.getReporter();
    if (!reporter) {
      console.log('[Sync] No reporter set - cannot sync');
      this._syncMessage.set('Please set your name to enable sync');
      return;
    }

    this.syncInProgress = true;
    this._syncState.set('syncing');
    this._syncMessage.set('Uploading pending checks...');

    try {
      // 1. Sync pending events first
      const pendingEvents = await this.db.getPendingEvents();
      if (pendingEvents.length > 0) {
        console.log(`[Sync] Syncing ${pendingEvents.length} pending events`);
        await this.syncEvents(pendingEvents);
      }

      // 2. Then sync pending faults
      const pendingFaults = await this.db.getPendingFaults();
      if (pendingFaults.length > 0) {
        console.log(`[Sync] Syncing ${pendingFaults.length} pending faults`);
        await this.syncFaults(pendingFaults);
      }

      // 3. Refresh data for recently touched assets
      const touchedAssetIds = new Set<string>();
      pendingEvents.forEach(e => touchedAssetIds.add(e.asset_id));
      pendingFaults.forEach(f => touchedAssetIds.add(f.asset_id));

      for (const assetId of touchedAssetIds) {
        await this.refreshFaultsForAsset(assetId);
        // Also refresh last-failed-check cache for this asset
        // This ensures the failure state is correct after uploading events
        await this.refreshLastFailedCheckForAsset(assetId);
      }

      // Update last sync time
      await this.db.setMeta('lastSyncAt', new Date().toISOString());

      this._syncState.set('success');
      this._syncMessage.set('Sync completed');

      console.log('[Sync] Queue sync complete');
    } catch (error) {
      console.error('[Sync] Queue sync failed:', error);
      this._syncState.set('error');
      this._syncMessage.set(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      this.syncInProgress = false;
    }
  }

  private async syncEvents(events: PreShiftCheckEvent[]): Promise<void> {
    // Prepare events for server (remove client-only fields)
    const serverEvents = events.map(e => {
      const { sync_status, last_error, ...serverEvent } = e;
      return serverEvent;
    });

    try {
      const result = await this.api.batchUpsertEvents(serverEvents);

      // Mark successfully synced events
      const successIds = events
        .filter(e => !result.errors.find(err => err.id === e.event_id))
        .map(e => e.event_id);

      for (const eventId of successIds) {
        await this.db.updateEventSyncStatus(eventId, 'SYNCED');
      }

      // Mark failed events with errors
      for (const error of result.errors) {
        await this.db.updateEventSyncStatus(error.id, 'ERROR', error.error);
      }

      console.log(`[Sync] Events: ${result.created} created, ${result.updated} updated, ${result.errors.length} errors`);
    } catch (error) {
      // Mark all as error
      for (const event of events) {
        await this.db.updateEventSyncStatus(
          event.event_id,
          'ERROR',
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
      throw error;
    }
  }

  private async syncFaults(faults: Fault[]): Promise<void> {
    // Prepare faults for server (remove client-only fields)
    const serverFaults = faults.map(f => {
      const { sync_status, last_error, ...serverFault } = f;
      return serverFault;
    });

    try {
      const result = await this.api.batchUpsertFaults(serverFaults);

      // Mark successfully synced faults
      const successIds = faults
        .filter(f => !result.errors.find(err => err.id === f.fault_id))
        .map(f => f.fault_id);

      for (const faultId of successIds) {
        await this.db.updateFaultSyncStatus(faultId, 'SYNCED');
      }

      // Mark failed faults with errors
      for (const error of result.errors) {
        await this.db.updateFaultSyncStatus(error.id, 'ERROR', error.error);
      }

      console.log(`[Sync] Faults: ${result.created} created, ${result.updated} updated, ${result.errors.length} errors`);
    } catch (error) {
      // Mark all as error
      for (const fault of faults) {
        await this.db.updateFaultSyncStatus(
          fault.fault_id,
          'ERROR',
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
      throw error;
    }
  }

  async refreshFaultsForAsset(assetId: string): Promise<void> {
    try {
      const serverFaults = await this.api.getOpenFaultsByAsset(assetId);
      await this.db.replaceSyncedFaultsForAsset(assetId, serverFaults);
      console.log(`[Sync] Refreshed ${serverFaults.length} faults for asset ${assetId}`);
    } catch (error) {
      console.error(`[Sync] Failed to refresh faults for asset ${assetId}:`, error);
    }
  }

  /**
   * Refresh the last-failed-check cache for a single asset
   * Called after uploading events to ensure cache reflects true server state
   */
  async refreshLastFailedCheckForAsset(assetId: string): Promise<void> {
    try {
      const lastFailed = await this.api.getLastFailedCheck(assetId);
      await this.db.saveLastFailedCheck(assetId, lastFailed);
      console.log(`[Sync] Refreshed last-failed-check for asset ${assetId}: ${lastFailed ? 'FAIL' : 'none'}`);
    } catch (error) {
      console.error(`[Sync] Failed to refresh last-failed-check for asset ${assetId}:`, error);
    }
  }

  // ==========================================
  // Manual Sync Trigger
  // ==========================================
  async manualSync(): Promise<void> {
    await this.initialSync();
  }

  // ==========================================
  // Retry sync for specific items
  // ==========================================
  async retryEvent(eventId: string): Promise<void> {
    const event = await this.db.getEvent(eventId);
    if (!event) return;

    await this.db.updateEventSyncStatus(eventId, 'PENDING');
    await this.syncQueue();
  }

  async retryFault(faultId: string): Promise<void> {
    const fault = await this.db.getFault(faultId);
    if (!fault) return;

    await this.db.updateFaultSyncStatus(faultId, 'PENDING');
    await this.syncQueue();
  }
}

