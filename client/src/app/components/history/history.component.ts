import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DatabaseService } from '../../services/database.service';
import { UtilsService } from '../../services/utils.service';
import type { PreShiftCheckEvent } from '../../models/types';

/**
 * HistoryComponent
 * 
 * Displays completed pre-shift check history with filtering.
 * 
 * Features:
 * - Lists all completed checks
 * - Filter by result (All, Pass, Fail)
 * - Navigate to event details
 */
@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './history.component.html',
  styleUrl: './history.component.scss'
})
export class HistoryComponent implements OnInit {
  // ==========================================
  // Dependency Injection
  // ==========================================
  
  private db = inject(DatabaseService);
  
  /** Utility functions */
  utils = inject(UtilsService);

  // ==========================================
  // Component State
  // ==========================================
  
  /** All events from local database */
  allEvents = signal<PreShiftCheckEvent[]>([]);
  
  /** Current filter selection */
  filter = signal<'all' | 'pass' | 'fail'>('all');
  
  /** Filtered events based on current filter */
  filteredEvents = signal<PreShiftCheckEvent[]>([]);

  // ==========================================
  // Lifecycle Hooks
  // ==========================================

  /**
   * Initialize component and load events
   * Waits for database initialization first (critical for offline mode)
   */
  async ngOnInit(): Promise<void> {
    // Wait for database to be initialized (critical for offline mode)
    await this.db.waitForInit();
    
    const events = await this.db.getEvents();
    this.allEvents.set(events);
    this.applyFilter();
  }

  // ==========================================
  // Filter Actions
  // ==========================================

  /**
   * Set the active filter
   * @param filter - Filter to apply ('all', 'pass', or 'fail')
   */
  setFilter(filter: 'all' | 'pass' | 'fail'): void {
    this.filter.set(filter);
    this.applyFilter();
  }

  /**
   * Apply current filter to events list
   */
  private applyFilter(): void {
    const all = this.allEvents();
    switch (this.filter()) {
      case 'pass':
        this.filteredEvents.set(all.filter(e => e.result === 'PASS'));
        break;
      case 'fail':
        this.filteredEvents.set(all.filter(e => e.result === 'FAIL'));
        break;
      default:
        this.filteredEvents.set(all);
    }
  }
}
