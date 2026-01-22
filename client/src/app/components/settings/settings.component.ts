import { Component, inject, OnInit, signal } from '@angular/core';
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
  // Cache Statistics
  // ==========================================
  
  /** Cached data counts */
  cacheStats = signal({ assets: 0, checklists: 0, events: 0, faults: 0 });

  // ==========================================
  // Lifecycle Hooks
  // ==========================================

  /**
   * Initialize component and load current settings
   */
  async ngOnInit(): Promise<void> {
    await this.loadCurrentReporter();
    await this.loadCacheStats();
  }

  // ==========================================
  // Data Loading
  // ==========================================

  /**
   * Load current reporter identity from database
   */
  private async loadCurrentReporter(): Promise<void> {
    const reporter = await this.db.getReporter();
    if (reporter) {
      this.reporterName = reporter.name;
      this.reporterUserId = reporter.user_id || '';
    }
  }

  /**
   * Load cached data statistics
   */
  async loadCacheStats(): Promise<void> {
    const [assets, checklists, events, faults] = await Promise.all([
      this.db.getAssets(),
      this.db.getAllActiveChecklists(),
      this.db.getEvents(),
      this.db.getFaults()
    ]);

    this.cacheStats.set({
      assets: assets.length,
      checklists: checklists.length,
      events: events.length,
      faults: faults.length
    });
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
   */
  syncNow(): void {
    this.syncService.manualSync().then(() => this.loadCacheStats());
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
      await this.loadCacheStats();
      this.router.navigate(['/']);
    }
  }
}
