import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatabaseService } from '../../services/database.service';
import { UtilsService } from '../../services/utils.service';
import type { Asset } from '../../models/types';

/**
 * SelectAssetComponent
 * 
 * Asset selection screen with search and QR code deep-link support.
 * 
 * Features:
 * - Handles QR code deep links (?asset_id=XXX)
 * - Search/filter assets by name, ID, or machine class
 * - Validates asset and checklist availability before proceeding
 * - Works fully offline with cached assets
 */
@Component({
  selector: 'app-select-asset',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './select-asset.component.html',
  styleUrl: './select-asset.component.scss'
})
export class SelectAssetComponent implements OnInit {
  // ==========================================
  // Dependency Injection
  // ==========================================
  
  private db = inject(DatabaseService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  
  /** Utility functions */
  utils = inject(UtilsService);

  // ==========================================
  // Component State
  // ==========================================
  
  /** Current search query */
  searchQuery = '';
  
  /** All assets from local cache */
  allAssets = signal<Asset[]>([]);
  
  /** Filtered assets based on search */
  filteredAssets = signal<Asset[]>([]);
  
  /** Error message to display */
  errorMessage = signal<string | null>(null);
  
  /** Loading state indicator */
  loading = signal(false);

  // ==========================================
  // Lifecycle Hooks
  // ==========================================

  /**
   * Initialize component
   * Handles QR deep links or loads asset list
   * Waits for database initialization first (critical for offline mode)
   */
  async ngOnInit(): Promise<void> {
    // Wait for database to be initialized (critical for offline mode)
    await this.db.waitForInit();

    // Check for QR code deep link
    const assetId = this.route.snapshot.queryParamMap.get('asset_id');
    if (assetId) {
      await this.handleDeepLink(assetId);
      return;
    }
    await this.loadAssets();
  }

  // ==========================================
  // Data Loading
  // ==========================================

  /**
   * Load all cached assets
   */
  async loadAssets(): Promise<void> {
    const assets = await this.db.getAssets();
    this.allAssets.set(assets);
    this.filteredAssets.set(assets);
  }

  // ==========================================
  // Search & Filter
  // ==========================================

  /**
   * Filter assets based on search query
   * Matches against name, asset_id, and machine_class
   */
  onSearch(): void {
    if (!this.searchQuery.trim()) {
      this.filteredAssets.set(this.allAssets());
      return;
    }

    const query = this.searchQuery.toLowerCase();
    const filtered = this.allAssets().filter(a =>
      a.name.toLowerCase().includes(query) ||
      a.asset_id.toLowerCase().includes(query) ||
      a.machine_class.toLowerCase().includes(query)
    );
    this.filteredAssets.set(filtered);
  }

  /**
   * Clear search query and show all assets
   */
  clearSearch(): void {
    this.searchQuery = '';
    this.filteredAssets.set(this.allAssets());
  }

  // ==========================================
  // Navigation
  // ==========================================

  /**
   * Handle asset selection from list
   * @param asset - The selected asset
   */
  async selectAsset(asset: Asset): Promise<void> {
    await this.navigateToCheck(asset.asset_id);
  }

  /**
   * Handle QR code deep link
   * Looks up asset by ID or QR code value
   * @param assetId - Asset ID from query parameter
   */
  async handleDeepLink(assetId: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      // Try to find asset by ID first
      let asset = await this.db.getAsset(assetId);
      
      // If not found, try by QR code value
      if (!asset) {
        asset = await this.db.getAssetByQrCode(assetId);
      }

      if (!asset) {
        this.errorMessage.set(`Asset "${assetId}" not found. Please sync data.`);
        this.loading.set(false);
        await this.loadAssets();
        return;
      }

      await this.navigateToCheck(asset.asset_id);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to load asset');
      this.loading.set(false);
      await this.loadAssets();
    }
  }

  /**
   * Navigate to check screen with validation
   * @param assetId - Asset ID to start check for
   */
  async navigateToCheck(assetId: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    // Validate that check can be started
    const check = await this.db.canStartCheck(assetId);
    if (!check.canStart) {
      this.errorMessage.set(check.error || 'Cannot start check');
      this.loading.set(false);
      return;
    }

    this.router.navigate(['/check', assetId]);
  }
}
