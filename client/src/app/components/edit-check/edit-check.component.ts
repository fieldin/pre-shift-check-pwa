import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../../services/database.service';
import { UtilsService } from '../../services/utils.service';
import type { PreShiftCheckEvent, CheckFormItem, CheckResponse, Fault } from '../../models/types';

/**
 * EditCheckComponent
 * 
 * Allows editing of pending (unsynced) pre-shift check events.
 * 
 * Features:
 * - Load existing event responses
 * - Modify YES/NO answers
 * - Update comments for NO answers
 * - Recalculate PASS/FAIL result
 * - Update faults based on changes
 * - Locked editing for already synced events
 */
@Component({
  selector: 'app-edit-check',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './edit-check.component.html',
  styleUrl: './edit-check.component.scss'
})
export class EditCheckComponent implements OnInit {
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

  /** The event being edited */
  event = signal<PreShiftCheckEvent | null>(null);

  /** Form items with answers and validation */
  formItems = signal<CheckFormItem[]>([]);

  /** Error message to display */
  errorMessage = signal<string | null>(null);

  /** Loading state indicator */
  loading = signal(true);

  /** Whether the event is locked (synced) */
  isLocked = signal(false);

  // ==========================================
  // Computed Values
  // ==========================================

  /**
   * Count of answered items
   */
  answeredCount = computed(() =>
    this.formItems().filter(item => item.answer !== null).length
  );

  /**
   * Progress percentage based on answered items
   */
  completionProgress = computed(() =>
    this.utils.calculateProgress(this.answeredCount(), this.formItems().length)
  );

  /**
   * Count of NO answers
   */
  failCount = computed(() =>
    this.utils.countFailedResponses(this.formItems())
  );

  /**
   * Whether check will pass (all YES)
   */
  willPass = computed(() =>
    this.formItems().every(item => item.answer === 'YES')
  );

  /**
   * Whether form can be submitted
   */
  canSubmit = computed(() => {
    const items = this.formItems();
    if (items.some(item => item.answer === null)) return false;
    if (items.some(item => item.answer === 'NO' && !item.comment.trim())) return false;
    return true;
  });

  // ==========================================
  // Lifecycle Hooks
  // ==========================================

  /**
   * Initialize component and load event
   */
  async ngOnInit(): Promise<void> {
    const eventId = this.route.snapshot.paramMap.get('eventId');
    if (!eventId) {
      this.errorMessage.set('No event ID provided');
      this.loading.set(false);
      return;
    }

    await this.loadEvent(eventId);
  }

  // ==========================================
  // Data Loading
  // ==========================================

  /**
   * Load event and initialize form
   * @param eventId - ID of the event to edit
   */
  private async loadEvent(eventId: string): Promise<void> {
    try {
      const event = await this.db.getEvent(eventId);
      if (!event) {
        this.errorMessage.set('Event not found');
        this.loading.set(false);
        return;
      }

      // Check if event is locked (already synced)
      if (event.sync_status === 'SYNCED') {
        this.isLocked.set(true);
        this.loading.set(false);
        return;
      }

      this.event.set(event);
      this.initializeFormItems(event);
      this.loading.set(false);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to load event');
      this.loading.set(false);
    }
  }

  /**
   * Initialize form items from event responses
   * @param event - The event to load responses from
   */
  private initializeFormItems(event: PreShiftCheckEvent): void {
    const items = event.checklist_snapshot.items
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(checkItem => {
        const response = event.responses.find(r => r.item_id === checkItem.item_id);
        return {
          item_id: checkItem.item_id,
          text: checkItem.text,
          priority: checkItem.priority,
          answer: response?.answer ?? null,
          comment: response?.comment ?? '',
          isValid: response?.answer !== 'NO' || (response?.comment?.trim().length ?? 0) > 0
        };
      });
    this.formItems.set(items);
  }

  // ==========================================
  // User Actions
  // ==========================================

  /**
   * Set answer for a form item
   * @param item - The item being answered
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
      comment: answer === 'YES' ? '' : updated[idx].comment,
      isValid: answer === 'YES' || updated[idx].comment.trim().length > 0
    };
    this.formItems.set(updated);
  }

  /**
   * Validate a form item
   * @param item - The item to validate
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
   * Save changes to the event
   * 
   * IMPORTANT: This updates the SAME event (same event_id), not creating a new one.
   * The pending uploads count remains unchanged because we're updating, not adding.
   * This ensures offline edits modify the existing pending form instead of duplicating it.
   */
  async saveChanges(): Promise<void> {
    if (!this.canSubmit() || !this.event()) return;

    const now = new Date().toISOString();

    // Build updated responses from form
    const responses = this.buildResponses();

    // Update the SAME event (keeps original event_id)
    // db.events.put() performs an upsert - updates existing record, doesn't create new
    const updatedEvent = this.createUpdatedEvent(responses, now);
    await this.db.saveEvent(updatedEvent);

    // Update faults: delete old pending faults, create new ones for current NO answers
    // All faults remain linked to the same event via source_event_id
    await this.updateFaults(updatedEvent, now);

    this.router.navigate(['/pending']);
  }

  /**
   * Navigate back to pending list
   */
  goBack(): void {
    this.router.navigate(['/pending']);
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
   * Create updated event object
   */
  private createUpdatedEvent(responses: CheckResponse[], now: string): PreShiftCheckEvent {
    return {
      ...this.event()!,
      responses,
      result: this.willPass() ? 'PASS' : 'FAIL',
      updated_at: now,
      sync_status: 'PENDING'
    };
  }

  /**
   * Update faults based on new responses
   * Deletes existing faults and creates new ones for NO answers
   */
  private async updateFaults(updatedEvent: PreShiftCheckEvent, now: string): Promise<void> {
    // Delete existing faults for this event
    await this.db.deleteFaultsByEventId(updatedEvent.event_id);

    // Create new faults for NO answers
    const noItems = this.formItems().filter(item => item.answer === 'NO');
    for (const item of noItems) {
      const checklistItem = this.event()!.checklist_snapshot.items.find(
        ci => ci.item_id === item.item_id
      );
      const fault: Fault = {
        fault_id: uuidv4(),
        asset_id: this.event()!.asset_id,
        status: 'OPEN',
        origin: 'PRE_SHIFT_CHECK',
        priority: checklistItem?.priority || 'MED',
        description: `${item.text} - ${item.comment}`,
        source_event_id: updatedEvent.event_id,
        created_at: now,
        updated_at: now,
        reporter: this.event()!.reporter,
        sync_status: 'PENDING'
      };
      await this.db.saveFault(fault);
    }
  }
}
