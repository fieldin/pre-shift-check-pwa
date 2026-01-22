import { Component, inject, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { DatabaseService } from '../../services/database.service';
import { SyncService } from '../../services/sync.service';
import { UpdateService } from '../../services/update.service';
import { UtilsService } from '../../services/utils.service';

/**
 * DashboardComponent
 * 
 * Main landing page for the Pre-Shift Check PWA.
 * 
 * Features:
 * - Displays current operator identity
 * - Shows online/offline status
 * - Provides quick navigation to all app sections
 * - Displays pending upload count
 * - Shows cached data statistics
 * - Handles PWA update notifications
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  // ==========================================
  // Dependency Injection
  // ==========================================
  
  /** Database service for local data access */
  db = inject(DatabaseService);
  
  /** Sync service for data synchronization */
  syncService = inject(SyncService);
  
  /** Update service for PWA updates */
  updateService = inject(UpdateService);
  
  /** Utility functions */
  utils = inject(UtilsService);
  
  /** Router for navigation */
  private router = inject(Router);

  // ==========================================
  // Reactive State (from database service)
  // ==========================================
  
  /** Number of cached assets - reactive from database */
  assetsCount = computed(() => this.db.assetsCount());
  
  /** Number of cached checklists - reactive from database */
  checklistsCount = computed(() => this.db.checklistsCount());

  // ==========================================
  // Lifecycle Hooks
  // ==========================================

  /**
   * Initialize component on mount
   * Waits for database to be ready, then triggers initial sync
   */
  async ngOnInit(): Promise<void> {
    // Wait for database to load saved data (reporter name, etc.)
    await this.db.waitForInit();
    // Then trigger sync (will be skipped if offline)
    this.syncService.initialSync();
  }

  // ==========================================
  // User Actions
  // ==========================================

  /**
   * Trigger manual data sync
   * Syncs pending data and refreshes local cache
   * Cache stats will automatically update via reactive signals
   */
  syncNow(): void {
    this.syncService.manualSync();
  }

  /**
   * Apply available PWA update
   * Reloads the application with new version
   */
  applyUpdate(): void {
    this.updateService.applyUpdate();
  }
}
