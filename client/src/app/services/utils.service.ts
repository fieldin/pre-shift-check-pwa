import { Injectable } from '@angular/core';

/**
 * UtilsService
 * 
 * Provides common utility functions used across multiple components.
 * This service centralizes formatting, calculations, and helper methods
 * to ensure consistency and reduce code duplication.
 */
@Injectable({
  providedIn: 'root'
})
export class UtilsService {

  // ==========================================
  // Date & Time Formatting
  // ==========================================

  /**
   * Formats an ISO date string to a relative time (e.g., "Just now", "5 min ago")
   * @param isoString - ISO 8601 date string
   * @returns Human-readable relative time string
   */
  formatRelativeTime(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hr ago`;
    return date.toLocaleDateString();
  }

  /**
   * Formats an ISO date string to a short date with time
   * @param isoString - ISO 8601 date string
   * @returns Formatted date string (e.g., "01/22/2026 14:30")
   */
  formatDateTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  /**
   * Formats an ISO date string to time only
   * @param isoString - ISO 8601 date string
   * @returns Formatted time string (e.g., "14:30")
   */
  formatTime(isoString: string): string {
    return new Date(isoString).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  /**
   * Formats an ISO date string with smart "Today", "Yesterday" labels
   * @param isoString - ISO 8601 date string
   * @returns Formatted date string with relative day label
   */
  formatSmartDate(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

    if (diffDays === 0) {
      return 'Today ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  }

  /**
   * Formats an ISO date string to full locale string
   * @param isoString - ISO 8601 date string
   * @returns Full locale formatted date string
   */
  formatFullDate(isoString: string): string {
    return new Date(isoString).toLocaleString();
  }

  // ==========================================
  // String Formatting
  // ==========================================

  /**
   * Gets initials from a full name
   * @param name - Full name string
   * @returns Uppercase initials (max 2 characters)
   */
  getInitials(name: string): string {
    if (!name) return '?';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  /**
   * Truncates a string to a maximum length with ellipsis
   * @param text - Text to truncate
   * @param maxLength - Maximum length before truncation
   * @returns Truncated string with ellipsis if needed
   */
  truncate(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  // ==========================================
  // Asset Helpers
  // ==========================================

  /**
   * Gets an emoji icon for a machine class
   * @param machineClass - Machine class identifier
   * @returns Emoji representing the machine type
   */
  getAssetIcon(machineClass: string): string {
    switch (machineClass?.toLowerCase()) {
      case 'tractor': return '🚜';
      case 'harvester': return '🌾';
      case 'sprayer': return '💧';
      case 'loader': return '🏗️';
      case 'truck': return '🚛';
      default: return '🔧';
    }
  }

  // ==========================================
  // Validation Helpers
  // ==========================================

  /**
   * Checks if a string is empty or only whitespace
   * @param value - String to check
   * @returns True if empty or whitespace only
   */
  isEmpty(value: string | null | undefined): boolean {
    return !value || value.trim().length === 0;
  }

  /**
   * Validates that a comment is provided for a NO answer
   * @param answer - The answer ('YES' | 'NO' | null)
   * @param comment - The comment text
   * @returns True if validation passes
   */
  validateCheckResponse(answer: 'YES' | 'NO' | null, comment: string): boolean {
    if (answer !== 'NO') return true;
    return !this.isEmpty(comment);
  }

  // ==========================================
  // Calculation Helpers
  // ==========================================

  /**
   * Calculates percentage progress
   * @param current - Current value
   * @param total - Total value
   * @returns Percentage (0-100)
   */
  calculateProgress(current: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((current / total) * 100);
  }

  /**
   * Determines if a pre-shift check result is PASS or FAIL
   * @param responses - Array of check responses
   * @returns 'PASS' if all YES, 'FAIL' if any NO
   */
  calculateCheckResult(responses: Array<{ answer: 'YES' | 'NO' | null }>): 'PASS' | 'FAIL' {
    return responses.every(r => r.answer === 'YES') ? 'PASS' : 'FAIL';
  }

  /**
   * Counts the number of failed (NO) responses
   * @param responses - Array of check responses
   * @returns Number of NO answers
   */
  countFailedResponses(responses: Array<{ answer: 'YES' | 'NO' | null }>): number {
    return responses.filter(r => r.answer === 'NO').length;
  }

  // ==========================================
  // Priority Helpers
  // ==========================================

  /**
   * Gets CSS class for priority badge
   * @param priority - Priority level (HIGH, MED, LOW)
   * @returns CSS class name for the badge
   */
  getPriorityBadgeClass(priority: string): string {
    switch (priority?.toUpperCase()) {
      case 'HIGH': return 'badge-error';
      case 'MED': return 'badge-warning';
      case 'LOW': return 'badge-info';
      default: return 'badge-info';
    }
  }

  /**
   * Gets CSS class for sync status badge
   * @param status - Sync status (SYNCED, PENDING, ERROR)
   * @returns CSS class name for the badge
   */
  getSyncStatusBadgeClass(status: string): string {
    switch (status?.toUpperCase()) {
      case 'SYNCED': return 'badge-success';
      case 'PENDING': return 'badge-warning';
      case 'ERROR': return 'badge-error';
      default: return 'badge-info';
    }
  }

  /**
   * Gets CSS class for check result
   * @param result - Check result (PASS, FAIL)
   * @returns CSS class name
   */
  getResultClass(result: string): string {
    return result === 'PASS' ? 'pass' : 'fail';
  }
}

