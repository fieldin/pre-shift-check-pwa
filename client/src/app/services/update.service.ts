import { Injectable, inject, signal, computed } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class UpdateService {
  private swUpdate = inject(SwUpdate);

  private _updateAvailable = signal(false);
  private _updateVersion = signal<string | null>(null);

  readonly updateAvailable = computed(() => this._updateAvailable());
  readonly updateVersion = computed(() => this._updateVersion());

  constructor() {
    if (this.swUpdate.isEnabled) {
      this.setupUpdateListener();
      this.checkForUpdates();
    }
  }

  private setupUpdateListener(): void {
    this.swUpdate.versionUpdates
      .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
      .subscribe(event => {
        console.log('[Update] New version available:', event.latestVersion.hash);
        this._updateAvailable.set(true);
        this._updateVersion.set(event.latestVersion.hash.substring(0, 8));
      });
  }

  async checkForUpdates(): Promise<void> {
    if (!this.swUpdate.isEnabled) return;

    try {
      const hasUpdate = await this.swUpdate.checkForUpdate();
      console.log('[Update] Check result:', hasUpdate);
    } catch (error) {
      console.error('[Update] Check failed:', error);
    }
  }

  async applyUpdate(): Promise<void> {
    if (!this.swUpdate.isEnabled) {
      window.location.reload();
      return;
    }

    try {
      await this.swUpdate.activateUpdate();
      window.location.reload();
    } catch (error) {
      console.error('[Update] Apply failed:', error);
      window.location.reload();
    }
  }

  dismissUpdate(): void {
    this._updateAvailable.set(false);
  }
}

