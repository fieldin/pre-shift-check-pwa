import { describe, it, expect, beforeEach } from '@jest/globals';
// Mock data for testing
const mockChecklistItems = [
    { item_id: 'T01', text: 'Engine oil level is acceptable', priority: 'HIGH', sort_order: 1 },
    { item_id: 'T02', text: 'Coolant level is adequate', priority: 'HIGH', sort_order: 2 },
    { item_id: 'T03', text: 'Tires are in good condition', priority: 'MED', sort_order: 3 },
];
// ==========================================
// YES/NO + Comment Validation Tests
// ==========================================
describe('Response Validation', () => {
    function validateResponse(response) {
        if (!response.item_id) {
            return { valid: false, error: 'item_id is required' };
        }
        if (!['YES', 'NO'].includes(response.answer)) {
            return { valid: false, error: 'answer must be YES or NO' };
        }
        if (response.answer === 'NO' && (!response.comment || response.comment.trim() === '')) {
            return { valid: false, error: 'comment is required when answer is NO' };
        }
        return { valid: true };
    }
    it('should accept YES answer without comment', () => {
        const response = { item_id: 'T01', answer: 'YES' };
        const result = validateResponse(response);
        expect(result.valid).toBe(true);
    });
    it('should accept YES answer with optional comment', () => {
        const response = { item_id: 'T01', answer: 'YES', comment: 'All good' };
        const result = validateResponse(response);
        expect(result.valid).toBe(true);
    });
    it('should accept NO answer with comment', () => {
        const response = { item_id: 'T01', answer: 'NO', comment: 'Oil level is low' };
        const result = validateResponse(response);
        expect(result.valid).toBe(true);
    });
    it('should reject NO answer without comment', () => {
        const response = { item_id: 'T01', answer: 'NO' };
        const result = validateResponse(response);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('comment is required when answer is NO');
    });
    it('should reject NO answer with empty comment', () => {
        const response = { item_id: 'T01', answer: 'NO', comment: '   ' };
        const result = validateResponse(response);
        expect(result.valid).toBe(false);
    });
    it('should reject response without item_id', () => {
        const response = { answer: 'YES' };
        const result = validateResponse(response);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('item_id is required');
    });
});
// ==========================================
// PASS/FAIL Calculation Tests
// ==========================================
describe('PASS/FAIL Calculation', () => {
    function calculateResult(responses) {
        // PASS if all answers are YES, FAIL if any answer is NO
        return responses.every(r => r.answer === 'YES') ? 'PASS' : 'FAIL';
    }
    it('should return PASS when all answers are YES', () => {
        const responses = [
            { item_id: 'T01', answer: 'YES' },
            { item_id: 'T02', answer: 'YES' },
            { item_id: 'T03', answer: 'YES' },
        ];
        expect(calculateResult(responses)).toBe('PASS');
    });
    it('should return FAIL when one answer is NO', () => {
        const responses = [
            { item_id: 'T01', answer: 'YES' },
            { item_id: 'T02', answer: 'NO', comment: 'Issue found' },
            { item_id: 'T03', answer: 'YES' },
        ];
        expect(calculateResult(responses)).toBe('FAIL');
    });
    it('should return FAIL when multiple answers are NO', () => {
        const responses = [
            { item_id: 'T01', answer: 'NO', comment: 'Issue 1' },
            { item_id: 'T02', answer: 'NO', comment: 'Issue 2' },
            { item_id: 'T03', answer: 'YES' },
        ];
        expect(calculateResult(responses)).toBe('FAIL');
    });
    it('should return FAIL when all answers are NO', () => {
        const responses = [
            { item_id: 'T01', answer: 'NO', comment: 'Issue 1' },
            { item_id: 'T02', answer: 'NO', comment: 'Issue 2' },
            { item_id: 'T03', answer: 'NO', comment: 'Issue 3' },
        ];
        expect(calculateResult(responses)).toBe('FAIL');
    });
    it('should return PASS for empty responses array', () => {
        const responses = [];
        expect(calculateResult(responses)).toBe('PASS');
    });
});
// ==========================================
// Sync Upsert Flow Tests
// ==========================================
describe('Sync Upsert Flow', () => {
    // Mock in-memory database
    let mockDb;
    beforeEach(() => {
        mockDb = new Map();
    });
    function upsertEvent(event) {
        const now = new Date().toISOString();
        const existing = mockDb.get(event.event_id);
        if (existing) {
            const updated = { ...event, created_at: existing.created_at, updated_at: now };
            mockDb.set(event.event_id, updated);
            return { action: 'updated', event: updated };
        }
        else {
            const created = { ...event, created_at: now, updated_at: now };
            mockDb.set(event.event_id, created);
            return { action: 'created', event: created };
        }
    }
    it('should create new event when not exists', () => {
        const event = { event_id: 'EVT-001', asset_id: 'TRAC001', result: 'PASS' };
        const result = upsertEvent(event);
        expect(result.action).toBe('created');
        expect(mockDb.has('EVT-001')).toBe(true);
        expect(result.event.created_at).toBeDefined();
        expect(result.event.updated_at).toBeDefined();
    });
    it('should update existing event when exists', () => {
        // First create
        const event1 = { event_id: 'EVT-001', asset_id: 'TRAC001', result: 'PASS' };
        const result1 = upsertEvent(event1);
        const originalCreatedAt = result1.event.created_at;
        // Then update
        const event2 = { event_id: 'EVT-001', asset_id: 'TRAC001', result: 'FAIL' };
        const result2 = upsertEvent(event2);
        expect(result2.action).toBe('updated');
        expect(result2.event.result).toBe('FAIL');
        expect(result2.event.created_at).toBe(originalCreatedAt); // created_at preserved
    });
    it('should be idempotent - multiple upserts with same data', () => {
        const event = { event_id: 'EVT-001', asset_id: 'TRAC001', result: 'PASS' };
        upsertEvent(event);
        upsertEvent(event);
        upsertEvent(event);
        expect(mockDb.size).toBe(1);
    });
    it('should handle batch upserts correctly', () => {
        const events = [
            { event_id: 'EVT-001', asset_id: 'TRAC001', result: 'PASS' },
            { event_id: 'EVT-002', asset_id: 'TRAC002', result: 'FAIL' },
            { event_id: 'EVT-001', asset_id: 'TRAC001', result: 'FAIL' }, // Duplicate - should update
        ];
        const results = events.map(e => upsertEvent(e));
        expect(mockDb.size).toBe(2);
        expect(results[0].action).toBe('created');
        expect(results[1].action).toBe('created');
        expect(results[2].action).toBe('updated');
        expect(mockDb.get('EVT-001')?.result).toBe('FAIL'); // Last one wins
    });
});
// ==========================================
// Fault Creation Tests
// ==========================================
describe('Fault Creation from Failed Checks', () => {
    function createFaultsFromResponses(eventId, assetId, responses, items) {
        const noResponses = responses.filter(r => r.answer === 'NO');
        return noResponses.map((response, index) => {
            const item = items.find(i => i.item_id === response.item_id);
            return {
                fault_id: `FAULT-${eventId}-${index}`,
                asset_id: assetId,
                status: 'OPEN',
                origin: 'PRE_SHIFT_CHECK',
                priority: item?.priority || 'MED',
                description: `${item?.text || response.item_id} - ${response.comment}`,
                source_event_id: eventId,
            };
        });
    }
    it('should create no faults when all answers are YES', () => {
        const responses = [
            { item_id: 'T01', answer: 'YES' },
            { item_id: 'T02', answer: 'YES' },
        ];
        const faults = createFaultsFromResponses('EVT-001', 'TRAC001', responses, mockChecklistItems);
        expect(faults).toHaveLength(0);
    });
    it('should create one fault per NO answer', () => {
        const responses = [
            { item_id: 'T01', answer: 'YES' },
            { item_id: 'T02', answer: 'NO', comment: 'Coolant is low' },
        ];
        const faults = createFaultsFromResponses('EVT-001', 'TRAC001', responses, mockChecklistItems);
        expect(faults).toHaveLength(1);
        expect(faults[0].status).toBe('OPEN');
        expect(faults[0].origin).toBe('PRE_SHIFT_CHECK');
        expect(faults[0].source_event_id).toBe('EVT-001');
    });
    it('should inherit priority from checklist item', () => {
        const responses = [
            { item_id: 'T01', answer: 'NO', comment: 'Oil level low' }, // HIGH priority
            { item_id: 'T03', answer: 'NO', comment: 'Tire worn' }, // MED priority
        ];
        const faults = createFaultsFromResponses('EVT-001', 'TRAC001', responses, mockChecklistItems);
        expect(faults).toHaveLength(2);
        expect(faults[0].priority).toBe('HIGH');
        expect(faults[1].priority).toBe('MED');
    });
    it('should include item text and comment in description', () => {
        const responses = [
            { item_id: 'T01', answer: 'NO', comment: 'Showing 2 quarts low' },
        ];
        const faults = createFaultsFromResponses('EVT-001', 'TRAC001', responses, mockChecklistItems);
        expect(faults[0].description).toContain('Engine oil level is acceptable');
        expect(faults[0].description).toContain('Showing 2 quarts low');
    });
});
//# sourceMappingURL=api.test.js.map