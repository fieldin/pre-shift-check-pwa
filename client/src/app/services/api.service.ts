import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';
import { environment } from '../../environments/environment';
import type { Asset, Checklist, PreShiftCheckEvent, Fault, BatchResponse } from '../models/types';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;
  private readonly REQUEST_TIMEOUT = 15000; // 15 seconds

  // ==========================================
  // Assets
  // ==========================================
  async getAssets(): Promise<Asset[]> {
    return this.get<Asset[]>('/assets');
  }

  async getAsset(assetId: string): Promise<Asset | null> {
    return this.get<Asset>(`/assets/${assetId}`);
  }

  // ==========================================
  // Checklists
  // ==========================================
  async getAllChecklists(): Promise<Checklist[]> {
    return this.get<Checklist[]>('/checklists');
  }

  async getActiveChecklist(machineClass: string): Promise<Checklist | null> {
    return this.get<Checklist>(`/checklists/active?machine_class=${encodeURIComponent(machineClass)}`);
  }

  // ==========================================
  // Events
  // ==========================================
  async getEvents(assetId?: string): Promise<PreShiftCheckEvent[]> {
    const params = assetId ? `?asset_id=${encodeURIComponent(assetId)}` : '';
    return this.get<PreShiftCheckEvent[]>(`/events${params}`);
  }

  /**
   * Get the last unresolved failed check for an asset from the server
   * Returns null if no failed check exists or if the last check was PASS
   */
  async getLastFailedCheck(assetId: string): Promise<PreShiftCheckEvent | null> {
    try {
      return await this.get<PreShiftCheckEvent | null>(`/events/last-failed/${encodeURIComponent(assetId)}`);
    } catch {
      return null;
    }
  }

  async upsertEvent(event: Omit<PreShiftCheckEvent, 'sync_status' | 'last_error'>): Promise<{ action: string; event: PreShiftCheckEvent }> {
    return this.post<{ action: string; event: PreShiftCheckEvent }>('/events', event);
  }

  async batchUpsertEvents(events: Omit<PreShiftCheckEvent, 'sync_status' | 'last_error'>[]): Promise<BatchResponse> {
    return this.post<BatchResponse>('/events/batch', { events });
  }

  // ==========================================
  // Faults
  // ==========================================
  async getFaults(assetId?: string, status?: 'OPEN' | 'CLOSED'): Promise<Fault[]> {
    const params = new URLSearchParams();
    if (assetId) params.set('asset_id', assetId);
    if (status) params.set('status', status);
    const queryString = params.toString();
    return this.get<Fault[]>(`/faults${queryString ? '?' + queryString : ''}`);
  }

  async getOpenFaultsByAsset(assetId: string): Promise<Fault[]> {
    return this.getFaults(assetId, 'OPEN');
  }

  async upsertFault(fault: Omit<Fault, 'sync_status' | 'last_error'>): Promise<{ action: string; fault: Fault }> {
    return this.post<{ action: string; fault: Fault }>('/faults', fault);
  }

  async batchUpsertFaults(faults: Omit<Fault, 'sync_status' | 'last_error'>[]): Promise<BatchResponse> {
    return this.post<BatchResponse>('/faults/batch', { faults });
  }

  // ==========================================
  // Health Check
  // ==========================================
  async checkHealth(): Promise<boolean> {
    try {
      await this.get<{ status: string }>('/health');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fast connectivity check with shorter timeout
   * Used for periodic online/offline detection
   * Uses native fetch with cache: 'no-store' to truly bypass ALL caches (browser + service worker)
   * This is more reliable on mobile devices than Angular HttpClient
   */
  async healthCheck(): Promise<boolean> {
    // Create an AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    try {
      // Use native fetch with cache: 'no-store' to bypass ALL caching
      // This is more reliable on mobile than Angular HttpClient
      const cacheBuster = Date.now();
      const response = await fetch(
        `${this.baseUrl}/health?_cb=${cacheBuster}`,
        {
          method: 'GET',
          cache: 'no-store', // Bypass browser cache completely
          signal: controller.signal,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        }
      );
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      clearTimeout(timeoutId);
      // Any error (network, timeout, abort) means we're offline
      return false;
    }
  }

  // ==========================================
  // Generic HTTP methods
  // ==========================================
  private async get<T>(endpoint: string): Promise<T> {
    try {
      const result = await firstValueFrom(
        this.http.get<T>(`${this.baseUrl}${endpoint}`).pipe(
          timeout(this.REQUEST_TIMEOUT),
          catchError((error: HttpErrorResponse) => {
            console.error(`GET ${endpoint} failed:`, error);
            throw this.handleError(error);
          })
        )
      );
      return result;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private async post<T>(endpoint: string, body: unknown): Promise<T> {
    try {
      const result = await firstValueFrom(
        this.http.post<T>(`${this.baseUrl}${endpoint}`, body).pipe(
          timeout(this.REQUEST_TIMEOUT),
          catchError((error: HttpErrorResponse) => {
            console.error(`POST ${endpoint} failed:`, error);
            throw this.handleError(error);
          })
        )
      );
      return result;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private handleError(error: unknown): Error {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return new Error('Network error: Unable to connect to server');
      }
      return new Error(error.error?.error || error.message || `HTTP Error ${error.status}`);
    }
    if (error instanceof Error) {
      return error;
    }
    return new Error('An unexpected error occurred');
  }
}

