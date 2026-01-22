import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'select-asset',
    loadComponent: () => import('./components/select-asset/select-asset.component').then(m => m.SelectAssetComponent)
  },
  {
    path: 'pre-shift',
    loadComponent: () => import('./components/select-asset/select-asset.component').then(m => m.SelectAssetComponent)
  },
  {
    path: 'check/:assetId',
    loadComponent: () => import('./components/pre-shift-check/pre-shift-check.component').then(m => m.PreShiftCheckComponent)
  },
  {
    path: 'check-complete/:eventId',
    loadComponent: () => import('./components/check-complete/check-complete.component').then(m => m.CheckCompleteComponent)
  },
  {
    path: 'edit-check/:eventId',
    loadComponent: () => import('./components/edit-check/edit-check.component').then(m => m.EditCheckComponent)
  },
  {
    path: 'pending',
    loadComponent: () => import('./components/pending/pending.component').then(m => m.PendingComponent)
  },
  {
    path: 'history',
    loadComponent: () => import('./components/history/history.component').then(m => m.HistoryComponent)
  },
  {
    path: 'settings',
    loadComponent: () => import('./components/settings/settings.component').then(m => m.SettingsComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
