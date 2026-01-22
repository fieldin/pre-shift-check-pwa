export type Priority = 'LOW' | 'MED' | 'HIGH';
export type ChecklistStatus = 'ACTIVE' | 'INACTIVE';
export type FaultStatus = 'OPEN' | 'CLOSED';
export type FaultOrigin = 'PRE_SHIFT_CHECK' | 'MANUAL' | 'SYSTEM';
export type SyncStatus = 'PENDING' | 'SYNCED' | 'ERROR';
export type CheckResult = 'PASS' | 'FAIL';
export type Answer = 'YES' | 'NO';
export interface Asset {
    asset_id: string;
    name: string;
    machine_class: string;
    qr_code_value: string;
}
export interface ChecklistItem {
    item_id: string;
    text: string;
    priority: Priority;
    sort_order: number;
}
export interface Checklist {
    checklist_id: string;
    machine_class: string;
    status: ChecklistStatus;
    version: string;
    items: ChecklistItem[];
}
export interface ChecklistSnapshot {
    checklist_id: string;
    version: string;
    machine_class: string;
    items: ChecklistItem[];
}
export interface CheckResponse {
    item_id: string;
    answer: Answer;
    comment?: string;
}
export interface Reporter {
    name: string;
    user_id?: string;
}
export interface PreShiftCheckEvent {
    event_id: string;
    asset_id: string;
    machine_class: string;
    checklist_snapshot: ChecklistSnapshot;
    responses: CheckResponse[];
    reporter: Reporter;
    started_at: string;
    completed_at: string;
    created_at: string;
    updated_at: string;
    result: CheckResult;
}
export interface Fault {
    fault_id: string;
    asset_id: string;
    status: FaultStatus;
    origin: FaultOrigin;
    priority: Priority;
    description: string;
    source_event_id?: string;
    created_at: string;
    updated_at: string;
    reporter: Reporter;
}
export interface BatchEventsRequest {
    events: PreShiftCheckEvent[];
}
export interface BatchFaultsRequest {
    faults: Fault[];
}
export interface BatchResponse {
    processed: number;
    created: number;
    updated: number;
    errors: Array<{
        id: string;
        error: string;
    }>;
}
//# sourceMappingURL=types.d.ts.map