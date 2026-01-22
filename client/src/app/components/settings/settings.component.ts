import { Component, inject, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatabaseService } from '../../services/database.service';
import { SyncService } from '../../services/sync.service';
import { UtilsService } from '../../services/utils.service';

/**
 * SettingsComponent
 * 
 * User settings and app configuration screen.
 * 
 * Features:
 * - Set operator identity (name and optional user ID)
 * - View sync status and trigger manual sync
 * - View cached data statistics
 * - Clear all local data (danger zone)
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit {
  // ==========================================
  // Dependency Injection
  // ==========================================
  
  /** Database service for local data access */
  db = inject(DatabaseService);
  
  /** Sync service for data synchronization */
  syncService = inject(SyncService);
  
  /** Utility functions */
  utils = inject(UtilsService);
  
  private router = inject(Router);

  // ==========================================
  // Form State
  // ==========================================
  
  /** Reporter name input */
  reporterName = '';
  
  /** Reporter user ID input */
  reporterUserId = '';

  // ==========================================
  // Cache Statistics (reactive from database service)
  // ==========================================
  
  /** Cached data counts - reactive computed from database signals */
  cacheStats = computed(() => ({
    assets: this.db.assetsCount(),
    checklists: this.db.checklistsCount(),
    events: this.db.eventsCount(),
    faults: this.db.faultsCount()
  }));

  // ==========================================
  // Lifecycle Hooks
  // ==========================================

  /**
   * Initialize component and load current settings
   * Waits for database initialization first (critical for offline mode)
   */
  async ngOnInit(): Promise<void> {
    // Wait for database to be initialized (critical for offline mode)
    await this.db.waitForInit();

    // First, try to use the already-loaded signal value (immediate)
    this.loadReporterFromSignal();
    
    // Then try to load fresh from database (may fail offline, but signal value is already set)
    await this.loadCurrentReporter();
    
    // Refresh cache stats (will fail gracefully if offline)
    await this.db.refreshCacheStats();
  }

  // ==========================================
  // Data Loading
  // ==========================================

  /**
   * Load reporter from signal (sync, always available)
   */
  private loadReporterFromSignal(): void {
    const name = this.db.getReporterNameSync();
    if (name) {
      this.reporterName = name;
    }
  }

  /**
   * Load current reporter identity from database
   */
  private async loadCurrentReporter(): Promise<void> {
    try {
      const reporter = await this.db.getReporter();
      if (reporter) {
        this.reporterName = reporter.name;
        this.reporterUserId = reporter.user_id || '';
      }
    } catch (error) {
      console.error('[Settings] Failed to load reporter:', error);
      // Keep the signal value we already loaded
    }
  }

  // ==========================================
  // User Actions
  // ==========================================

  /**
   * Save reporter identity to database
   */
  async saveReporter(): Promise<void> {
    if (!this.reporterName.trim()) return;

    await this.db.setReporter(
      this.reporterName.trim(),
      this.reporterUserId.trim() || undefined
    );

    alert('Identity saved!');
  }

  /**
   * Trigger manual data sync
   * Cache stats will automatically update via reactive signals
   */
  syncNow(): void {
    this.syncService.manualSync();
  }

  /**
   * Clear all local data with confirmation
   * WARNING: This is destructive and cannot be undone
   */
  async clearAllData(): Promise<void> {
    const pending = this.db.totalPendingCount();
    let message = 'Are you sure you want to clear all local data?';

    if (pending > 0) {
      message += `\n\nWARNING: You have ${pending} unsynced item(s) that will be permanently lost!`;
    }

    if (confirm(message)) {
      await this.db.clearAllData();
      this.reporterName = '';
      this.reporterUserId = '';
      // Cache stats will automatically update via reactive signals
      this.router.navigate(['/']);
    }
  }
}
