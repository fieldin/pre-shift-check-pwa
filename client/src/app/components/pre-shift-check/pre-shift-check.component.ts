import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../../services/database.service';
import { SyncService } from '../../services/sync.service';
import { UtilsService } from '../../services/utils.service';
import type { Asset, Checklist, PreShiftCheckEvent, CheckFormItem, CheckResponse, Fault } from '../../models/types';

/**
 * Interface for displaying failed items from previous checks
 */
interface PreviousFailedItem {
  item_id: string;
  text: string;
  comment?: string;
  priority: string;
}

/**
 * Interface for previous failed check summary
 */
interface PreviousFailedCheck {
  event_id: string;
  reporter_name: string;
  completed_at: string;
  failed_items: PreviousFailedItem[];
}

/**
 * PreShiftCheckComponent
 * 
 * Main checklist execution screen where operators complete pre-shift safety checks.
 * 
 * Features:
 * - Displays asset information and existing faults
 * - Shows last failed check if unresolved (for other drivers to see)
 * - Shows checklist items with YES/NO answers
 * - Requires comments for NO answers
 * - Calculates PASS/FAIL result in real-time
 * - Creates events and faults on submission
 * - Works fully offline
 */
@Component({
  selector: 'app-pre-shift-check',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './pre-shift-check.component.html',
  styleUrl: './pre-shift-check.component.scss'
})
export class PreShiftCheckComponent implements OnInit {
  // ==========================================
  // Dependency Injection
  // ==========================================

  private db = inject(DatabaseService);
  private syncService = inject(SyncService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  /** Utility functions for formatting and validation */
  utils = inject(UtilsService);

  // ==========================================
  // Reactive State
  // ==========================================

  /** Current asset being checked */
  asset = signal<Asset | null>(null);

  /** Active checklist for this asset's machine class */
  checklist = signal<Checklist | null>(null);

  /** Previous failed check that hasn't been resolved (for other drivers to see) */
  previousFailedCheck = signal<PreviousFailedCheck | null>(null);

  /** Form items with answers and validation state */
  formItems = signal<CheckFormItem[]>([]);

  /** Error message to display */
  errorMessage = signal<string | null>(null);

  /** Loading state indicator */
  loading = signal(true);

  /** Timestamp when check was started */
  private startedAt = new Date().toISOString();

  // ==========================================
  // Computed Values
  // ==========================================

  /**
   * Count of items with an answer (YES or NO)
   */
  answeredCount = computed(() =>
    this.formItems().filter(item => item.answer !== null).length
  );

  /**
   * Progress percentage (0-100) based on answered items
   */
  completionProgress = computed(() =>
    this.utils.calculateProgress(this.answeredCount(), this.formItems().length)
  );

  /**
   * Count of NO answers (failed items)
   */
  failCount = computed(() =>
    this.utils.countFailedResponses(this.formItems())
  );

  /**
   * Whether the check will pass (all YES answers)
   */
  willPass = computed(() =>
    this.formItems().every(item => item.answer === 'YES')
  );

  /**
   * Whether the form can be submitted
   * Requires all items answered and valid comments for NO answers
   */
  canSubmit = computed(() => {
    const items = this.formItems();
    // All items must have an answer
    if (items.some(item => item.answer === null)) return false;
    // All NO answers must have a comment
    if (items.some(item => item.answer === 'NO' && !item.comment.trim())) return false;
    return true;
  });

  // ==========================================
  // Lifecycle Hooks
  // ==========================================

  /**
   * Initialize component and load data
   * Waits for database to be initialized first (important for offline mode)
   */
  async ngOnInit(): Promise<void> {
    const assetId = this.route.snapshot.paramMap.get('assetId');
    if (!assetId) {
      this.errorMessage.set('No asset ID provided');
      this.loading.set(false);
      return;
    }

    // Wait for database to be initialized (critical for offline mode)
    await this.db.waitForInit();
    await this.loadData(assetId);
  }

  // ==========================================
  // Data Loading
  // ==========================================

  /**
   * Load all required data for the check
   * @param assetId - ID of the asset to check
   */
  async loadData(assetId: string): Promise<void> {
    try {
      // Verify check can be started
      const check = await this.db.canStartCheck(assetId);
      if (!check.canStart) {
        this.errorMessage.set(check.error || 'Cannot start check');
        this.loading.set(false);
        return;
      }

      // Load asset
      const asset = await this.db.getAsset(assetId);
      if (!asset) {
        this.errorMessage.set('Asset not found');
        this.loading.set(false);
        return;
      }
      this.asset.set(asset);

      // Load checklist for this machine class
      const checklist = await this.db.getActiveChecklist(asset.machine_class);
      if (!checklist) {
        this.errorMessage.set(`No active checklist for ${asset.machine_class}`);
        this.loading.set(false);
        return;
      }
      this.checklist.set(checklist);

      // Initialize form items from checklist
      const items = this.initializeFormItems(checklist);
      this.formItems.set(items);

      // Load previous failed check if exists (for other drivers to see)
      await this.loadPreviousFailedCheck(assetId);

      this.loading.set(false);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to load data');
      this.loading.set(false);
    }
  }

  /**
   * Initialize form items from checklist
   * @param checklist - The checklist to use
   * @returns Array of form items with default values
   */
  private initializeFormItems(checklist: Checklist): CheckFormItem[] {
    return checklist.items
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(item => ({
        item_id: item.item_id,
        text: item.text,
        priority: item.priority,
        answer: null,
        comment: '',
        isValid: true
      }));
  }

  /**
   * Load the last failed check for this asset if it hasn't been resolved
   * This helps other drivers see issues reported by previous drivers
   * 
   * Strategy:
   * 1. Check server cache (fetched during "Refresh Data" sync)
   * 2. Fall back to local events from this device
   * 
   * @param assetId - Asset ID to check
   */
  private async loadPreviousFailedCheck(assetId: string): Promise<void> {
    // First try the cached data from server (populated during sync/refresh)
    let lastFailedEvent = await this.db.getCachedLastFailedCheck(assetId);

    // Fall back to local events from this device
    if (!lastFailedEvent) {
      lastFailedEvent = await this.db.getLastUnresolvedFailedCheck(assetId);
    }

    if (!lastFailedEvent) {
      this.previousFailedCheck.set(null);
      return;
    }

    // Convert event to display format
    this.setPreviousFailedCheckFromEvent(lastFailedEvent);
  }

  /**
   * Convert a failed event to the display format
   * @param event - The failed event to convert
   */
  private setPreviousFailedCheckFromEvent(event: PreShiftCheckEvent): void {
    // Extract failed items from the event
    const failedItems: PreviousFailedItem[] = event.responses
      .filter(r => r.answer === 'NO')
      .map(r => {
        const checklistItem = event.checklist_snapshot.items.find(
          i => i.item_id === r.item_id
        );
        return {
          item_id: r.item_id,
          text: checklistItem?.text || r.item_id,
          comment: r.comment,
          priority: checklistItem?.priority || 'MED'
        };
      });

    this.previousFailedCheck.set({
      event_id: event.event_id,
      reporter_name: event.reporter.name,
      completed_at: event.completed_at,
      failed_items: failedItems
    });
  }

  // ==========================================
  // User Actions
  // ==========================================

  /**
   * Set answer for a checklist item
   * @param item - The form item being answered
   * @param answer - The answer ('YES' or 'NO')
   */
  setAnswer(item: CheckFormItem, answer: 'YES' | 'NO'): void {
    const items = this.formItems();
    const idx = items.findIndex(i => i.item_id === item.item_id);
    if (idx === -1) return;

    const updated = [...items];
    updated[idx] = {
      ...updated[idx],
      answer,
      // Clear comment if YES, keep comment if NO
      comment: answer === 'YES' ? '' : updated[idx].comment,
      // Validate: YES is always valid, NO requires comment
      isValid: answer === 'YES' || updated[idx].comment.trim().length > 0
    };
    this.formItems.set(updated);
  }

  /**
   * Validate a form item (called on comment input)
   * @param item - The form item to validate
   */
  validateItem(item: CheckFormItem): void {
    const items = this.formItems();
    const idx = items.findIndex(i => i.item_id === item.item_id);
    if (idx === -1) return;

    const updated = [...items];
    updated[idx] = {
      ...updated[idx],
      isValid: this.utils.validateCheckResponse(item.answer, item.comment)
    };
    this.formItems.set(updated);
  }

  /**
   * Submit the completed check
   * Creates event and faults, then navigates to completion screen
   */
  async submitCheck(): Promise<void> {
    if (!this.canSubmit() || !this.asset() || !this.checklist()) return;

    // Get reporter identity
    const reporter = await this.db.getReporter();
    if (!reporter) {
      this.errorMessage.set('Reporter not set');
      return;
    }

    const now = new Date().toISOString();
    const eventId = uuidv4();

    // Build responses array
    const responses = this.buildResponses();

    // Create checklist snapshot for immutability
    const checklistSnapshot = this.createChecklistSnapshot();

    // Create the event
    const event = this.createEvent(eventId, responses, checklistSnapshot, reporter, now);
    await this.db.saveEvent(event);

    // Create faults for NO answers
    await this.createFaultsForFailedItems(eventId, reporter, now);

    // Trigger background sync
    this.syncService.syncQueue();

    // Navigate to completion screen
    this.router.navigate(['/check-complete', eventId]);
  }

  /**
   * Navigate back with confirmation if progress exists
   */
  goBack(): void {
    const answered = this.answeredCount();
    if (answered > 0) {
      if (confirm('Are you sure you want to leave? Your progress will be lost.')) {
        this.router.navigate(['/select-asset']);
      }
    } else {
      this.router.navigate(['/select-asset']);
    }
  }

  // ==========================================
  // Helper Methods
  // ==========================================

  /**
   * Build responses array from form items
   */
  private buildResponses(): CheckResponse[] {
    return this.formItems().map(item => ({
      item_id: item.item_id,
      answer: item.answer!,
      comment: item.answer === 'NO' ? item.comment : undefined
    }));
  }

  /**
   * Create immutable checklist snapshot
   */
  private createChecklistSnapshot() {
    return {
      checklist_id: this.checklist()!.checklist_id,
      version: this.checklist()!.version,
      machine_class: this.checklist()!.machine_class,
      items: this.checklist()!.items
    };
  }

  /**
   * Create the pre-shift check event
   */
  private createEvent(
    eventId: string,
    responses: CheckResponse[],
    checklistSnapshot: any,
    reporter: { name: string; user_id?: string },
    now: string
  ): PreShiftCheckEvent {
    return {
      event_id: eventId,
      asset_id: this.asset()!.asset_id,
      machine_class: this.asset()!.machine_class,
      checklist_snapshot: checklistSnapshot,
      responses,
      reporter,
      started_at: this.startedAt,
      completed_at: now,
      created_at: now,
      updated_at: now,
      result: this.willPass() ? 'PASS' : 'FAIL',
      sync_status: 'PENDING'
    };
  }

  /**
   * Create faults for all NO answers
   */
  private async createFaultsForFailedItems(
    eventId: string,
    reporter: { name: string; user_id?: string },
    now: string
  ): Promise<void> {
    const noItems = this.formItems().filter(item => item.answer === 'NO');

    for (const item of noItems) {
      const checklistItem = this.checklist()!.items.find(ci => ci.item_id === item.item_id);
      const fault: Fault = {
        fault_id: uuidv4(),
        asset_id: this.asset()!.asset_id,
        status: 'OPEN',
        origin: 'PRE_SHIFT_CHECK',
        priority: checklistItem?.priority || 'MED',
        description: `${item.text} - ${item.comment}`,
        source_event_id: eventId,
        created_at: now,
        updated_at: now,
        reporter,
        sync_status: 'PENDING'
      };
      await this.db.saveFault(fault);
    }
  }
}
