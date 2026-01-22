import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { DatabaseService } from '../../services/database.service';
import { SyncService } from '../../services/sync.service';
import { UtilsService } from '../../services/utils.service';
import type { PreShiftCheckEvent, Fault } from '../../models/types';

/**
 * PendingComponent
 * 
 * Displays pending (unsynced) events and faults with management actions.
 * 
 * Features:
 * - Lists pending checks with status and error info
 * - Lists pending faults with priority indicators
 * - Edit, retry, and delete actions for pending items
 * - Manual sync trigger
 */
@Component({
  selector: 'app-pending',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './pending.component.html',
  styleUrl: './pending.component.scss'
})
export class PendingComponent implements OnInit {
  // ==========================================
  // Dependency Injection
  // ==========================================
  
  private db = inject(DatabaseService);
  private router = inject(Router);
  
  /** Sync service for data synchronization */
  syncService = inject(SyncService);
  
  /** Utility functions */
  utils = inject(UtilsService);

  // ==========================================
  // Component State
  // ==========================================
  
  /** List of pending/error events */
  pendingEvents = signal<PreShiftCheckEvent[]>([]);
  
  /** List of pending/error faults */
  pendingFaults = signal<Fault[]>([]);

  // ==========================================
  // Lifecycle Hooks
  // ==========================================

  /**
   * Initialize component and load pending items
   * Waits for database initialization first (critical for offline mode)
   */
  async ngOnInit(): Promise<void> {
    // Wait for database to be initialized (critical for offline mode)
    await this.db.waitForInit();
    
    await this.loadPending();
  }

  // ==========================================
  // Data Loading
  // ==========================================

  /**
   * Load all pending events and faults from local database
   */
  async loadPending(): Promise<void> {
    const events = await this.db.getPendingEvents();
    const faults = await this.db.getPendingFaults();
    this.pendingEvents.set(events);
    this.pendingFaults.set(faults);
  }

  // ==========================================
  // User Actions
  // ==========================================

  /**
   * Trigger manual sync of all pending items
   */
  syncNow(): void {
    this.syncService.manualSync().then(() => this.loadPending());
  }

  /**
   * Navigate to edit screen for an event
   * @param event - The event to edit
   */
  editEvent(event: PreShiftCheckEvent): void {
    this.router.navigate(['/edit-check', event.event_id]);
  }

  /**
   * Retry syncing a failed event
   * @param event - The event to retry
   */
  async retryEvent(event: PreShiftCheckEvent): Promise<void> {
    await this.syncService.retryEvent(event.event_id);
    await this.loadPending();
  }

  /**
   * Delete an event and its associated faults
   * @param event - The event to delete
   */
  async deleteEvent(event: PreShiftCheckEvent): Promise<void> {
    if (confirm('Delete this check and its associated faults?')) {
      await this.db.deleteEvent(event.event_id);
      await this.loadPending();
    }
  }

  /**
   * Retry syncing a failed fault
   * @param fault - The fault to retry
   */
  async retryFault(fault: Fault): Promise<void> {
    await this.syncService.retryFault(fault.fault_id);
    await this.loadPending();
  }
}
