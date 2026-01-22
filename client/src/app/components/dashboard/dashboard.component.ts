import { Component, inject, OnInit, signal } from '@angular/core';
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
  // Reactive State
  // ==========================================
  
  /** Number of cached assets */
  assetsCount = signal(0);
  
  /** Number of cached checklists */
  checklistsCount = signal(0);

  // ==========================================
  // Lifecycle Hooks
  // ==========================================

  /**
   * Initialize component on mount
   * Loads cached data stats and triggers initial sync
   */
  ngOnInit(): void {
    this.loadStats();
    this.syncService.initialSync();
  }

  // ==========================================
  // Data Loading
  // ==========================================

  /**
   * Load cached data statistics
   * Retrieves counts of assets and checklists from local database
   */
  async loadStats(): Promise<void> {
    const assets = await this.db.getAssets();
    const checklists = await this.db.getAllActiveChecklists();
    this.assetsCount.set(assets.length);
    this.checklistsCount.set(checklists.length);
  }

  // ==========================================
  // User Actions
  // ==========================================

  /**
   * Trigger manual data sync
   * Syncs pending data and refreshes local cache
   */
  syncNow(): void {
    this.syncService.manualSync().then(() => this.loadStats());
  }

  /**
   * Apply available PWA update
   * Reloads the application with new version
   */
  applyUpdate(): void {
    this.updateService.applyUpdate();
  }
}
