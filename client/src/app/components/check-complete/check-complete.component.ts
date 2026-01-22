import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { DatabaseService } from '../../services/database.service';
import { UtilsService } from '../../services/utils.service';
import type { PreShiftCheckEvent } from '../../models/types';

/**
 * Failed Item Interface
 * Represents a checklist item that was marked as NO
 */
interface FailedItem {
  item_id: string;
  text: string;
  comment?: string;
}

/**
 * CheckCompleteComponent
 * 
 * Displays completion status and summary after a pre-shift check.
 * 
 * Features:
 * - Shows PASS/FAIL result with visual indicator
 * - Displays check summary information
 * - Lists all issues found (NO answers)
 * - Shows sync status
 * - Navigation to dashboard or new check
 */
@Component({
  selector: 'app-check-complete',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './check-complete.component.html',
  styleUrl: './check-complete.component.scss'
})
export class CheckCompleteComponent implements OnInit {
  // ==========================================
  // Dependency Injection
  // ==========================================

  private db = inject(DatabaseService);
  private route = inject(ActivatedRoute);

  /** Utility functions */
  utils = inject(UtilsService);

  // ==========================================
  // Component State
  // ==========================================

  /** The completed event */
  event = signal<PreShiftCheckEvent | null>(null);

  /** List of failed items from the check */
  failedItems = signal<FailedItem[]>([]);

  // ==========================================
  // Lifecycle Hooks
  // ==========================================

  /**
   * Initialize component and load event data
   */
  async ngOnInit(): Promise<void> {
    const eventId = this.route.snapshot.paramMap.get('eventId');
    if (!eventId) return;

    await this.loadEvent(eventId);
  }

  // ==========================================
  // Data Loading
  // ==========================================

  /**
   * Load event from database and extract failed items
   * @param eventId - ID of the event to load
   */
  private async loadEvent(eventId: string): Promise<void> {
    const event = await this.db.getEvent(eventId);
    if (!event) return;

    this.event.set(event);
    this.extractFailedItems(event);
  }

  /**
   * Extract failed items (NO answers) from event responses
   * @param event - The event to extract from
   */
  private extractFailedItems(event: PreShiftCheckEvent): void {
    const failed = event.responses
      .filter(r => r.answer === 'NO')
      .map(r => {
        const item = event.checklist_snapshot.items.find(i => i.item_id === r.item_id);
        return {
          item_id: r.item_id,
          text: item?.text || r.item_id,
          comment: r.comment
        };
      });
    this.failedItems.set(failed);
  }
}
