import express from 'express';
import cors from 'cors';
import { mockAssets, mockChecklists, mockFaults, mockEvents } from './mock-data.js';
const app = express();
const PORT = process.env.PORT || 3000;
// In-memory storage (initialized with mock data)
const db = {
    assets: new Map(mockAssets.map(a => [a.asset_id, a])),
    checklists: new Map(mockChecklists.map(c => [c.checklist_id, c])),
    faults: new Map(mockFaults.map(f => [f.fault_id, f])),
    events: new Map(mockEvents.map(e => [e.event_id, e]))
};
// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
// Request logging
app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});
// ==========================================
// Health Check
// ==========================================
app.get('/health', (_req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});
app.get('/api/health', (_req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});
// ==========================================
// Assets API
// ==========================================
app.get('/api/assets', (_req, res) => {
    const assets = Array.from(db.assets.values());
    res.json(assets);
});
app.get('/api/assets/:asset_id', (req, res) => {
    const assetId = req.params.asset_id;
    const asset = db.assets.get(assetId);
    if (!asset) {
        res.status(404).json({ error: 'Asset not found' });
        return;
    }
    res.json(asset);
});
// ==========================================
// Checklists API
// ==========================================
app.get('/api/checklists', (_req, res) => {
    const checklists = Array.from(db.checklists.values());
    res.json(checklists);
});
app.get('/api/checklists/active', (req, res) => {
    const machineClass = req.query.machine_class;
    if (!machineClass) {
        res.status(400).json({ error: 'machine_class query parameter is required' });
        return;
    }
    const checklists = Array.from(db.checklists.values())
        .filter(c => c.machine_class === machineClass && c.status === 'ACTIVE');
    if (checklists.length === 0) {
        res.status(404).json({ error: `No active checklist found for machine_class: ${machineClass}` });
        return;
    }
    // Return the first active checklist for the machine class
    res.json(checklists[0]);
});
// ==========================================
// Events API (PreShiftCheckEvent)
// ==========================================
app.get('/api/events', (req, res) => {
    let events = Array.from(db.events.values());
    // Filter by asset_id if provided
    const assetId = req.query.asset_id;
    if (assetId) {
        events = events.filter(e => e.asset_id === assetId);
    }
    // Sort by created_at desc
    events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json(events);
});
/**
 * Get the last unresolved failed check for an asset
 * Returns null if no failed check exists or if the last check was PASS
 * This allows drivers to see failed checks from other drivers
 */
app.get('/api/events/last-failed/:asset_id', (req, res) => {
    const assetId = req.params.asset_id;
    // Get all events for this asset, sorted by completed_at desc
    const assetEvents = Array.from(db.events.values())
        .filter(e => e.asset_id === assetId)
        .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
    if (assetEvents.length === 0) {
        res.json(null);
        return;
    }
    // Check the most recent event
    const lastEvent = assetEvents[0];
    // If the last check was a PASS, there's no unresolved failure
    if (lastEvent.result === 'PASS') {
        res.json(null);
        return;
    }
    // The last check was a FAIL, return it
    res.json(lastEvent);
});
app.get('/api/events/:event_id', (req, res) => {
    const eventId = req.params.event_id;
    const event = db.events.get(eventId);
    if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
    }
    res.json(event);
});
// Upsert single event (idempotent by event_id)
app.post('/api/events', (req, res) => {
    const event = req.body;
    if (!event.event_id) {
        res.status(400).json({ error: 'event_id is required' });
        return;
    }
    const existing = db.events.get(event.event_id);
    const now = new Date().toISOString();
    if (existing) {
        // Update existing
        const updated = { ...event, updated_at: now };
        db.events.set(event.event_id, updated);
        res.json({ action: 'updated', event: updated });
    }
    else {
        // Create new
        const created = { ...event, created_at: now, updated_at: now };
        db.events.set(event.event_id, created);
        res.status(201).json({ action: 'created', event: created });
    }
});
// Batch upsert events
app.post('/api/events/batch', (req, res) => {
    const { events } = req.body;
    if (!Array.isArray(events)) {
        res.status(400).json({ error: 'events array is required' });
        return;
    }
    const response = {
        processed: events.length,
        created: 0,
        updated: 0,
        errors: []
    };
    const now = new Date().toISOString();
    for (const event of events) {
        try {
            if (!event.event_id) {
                response.errors.push({ id: 'unknown', error: 'event_id is required' });
                continue;
            }
            const existing = db.events.get(event.event_id);
            if (existing) {
                db.events.set(event.event_id, { ...event, updated_at: now });
                response.updated++;
            }
            else {
                db.events.set(event.event_id, { ...event, created_at: now, updated_at: now });
                response.created++;
            }
        }
        catch (err) {
            response.errors.push({
                id: event.event_id || 'unknown',
                error: err instanceof Error ? err.message : 'Unknown error'
            });
        }
    }
    res.json(response);
});
// ==========================================
// Faults API
// ==========================================
app.get('/api/faults', (req, res) => {
    let faults = Array.from(db.faults.values());
    // Filter by asset_id if provided
    const assetId = req.query.asset_id;
    if (assetId) {
        faults = faults.filter(f => f.asset_id === assetId);
    }
    // Filter by status if provided
    const status = req.query.status;
    if (status) {
        faults = faults.filter(f => f.status === status);
    }
    // Sort by created_at desc
    faults.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json(faults);
});
app.get('/api/faults/:fault_id', (req, res) => {
    const faultId = req.params.fault_id;
    const fault = db.faults.get(faultId);
    if (!fault) {
        res.status(404).json({ error: 'Fault not found' });
        return;
    }
    res.json(fault);
});
// Upsert single fault (idempotent by fault_id)
app.post('/api/faults', (req, res) => {
    const fault = req.body;
    if (!fault.fault_id) {
        res.status(400).json({ error: 'fault_id is required' });
        return;
    }
    const existing = db.faults.get(fault.fault_id);
    const now = new Date().toISOString();
    if (existing) {
        // Update existing
        const updated = { ...fault, updated_at: now };
        db.faults.set(fault.fault_id, updated);
        res.json({ action: 'updated', fault: updated });
    }
    else {
        // Create new
        const created = { ...fault, created_at: now, updated_at: now };
        db.faults.set(fault.fault_id, created);
        res.status(201).json({ action: 'created', fault: created });
    }
});
// Batch upsert faults
app.post('/api/faults/batch', (req, res) => {
    const { faults } = req.body;
    if (!Array.isArray(faults)) {
        res.status(400).json({ error: 'faults array is required' });
        return;
    }
    const response = {
        processed: faults.length,
        created: 0,
        updated: 0,
        errors: []
    };
    const now = new Date().toISOString();
    for (const fault of faults) {
        try {
            if (!fault.fault_id) {
                response.errors.push({ id: 'unknown', error: 'fault_id is required' });
                continue;
            }
            const existing = db.faults.get(fault.fault_id);
            if (existing) {
                db.faults.set(fault.fault_id, { ...fault, updated_at: now });
                response.updated++;
            }
            else {
                db.faults.set(fault.fault_id, { ...fault, created_at: now, updated_at: now });
                response.created++;
            }
        }
        catch (err) {
            response.errors.push({
                id: fault.fault_id || 'unknown',
                error: err instanceof Error ? err.message : 'Unknown error'
            });
        }
    }
    res.json(response);
});
// Update fault status (for closing faults)
app.patch('/api/faults/:fault_id', (req, res) => {
    const faultId = req.params.fault_id;
    const fault = db.faults.get(faultId);
    if (!fault) {
        res.status(404).json({ error: 'Fault not found' });
        return;
    }
    const updates = req.body;
    const now = new Date().toISOString();
    const updated = { ...fault, ...updates, updated_at: now };
    db.faults.set(faultId, updated);
    res.json(updated);
});
// ==========================================
// Sync status endpoint (for debugging)
// ==========================================
app.get('/api/status', (_req, res) => {
    res.json({
        assets: db.assets.size,
        checklists: db.checklists.size,
        activeChecklists: Array.from(db.checklists.values()).filter(c => c.status === 'ACTIVE').length,
        events: db.events.size,
        faults: db.faults.size,
        openFaults: Array.from(db.faults.values()).filter(f => f.status === 'OPEN').length,
        timestamp: new Date().toISOString()
    });
});
// ==========================================
// Error handling
// ==========================================
app.use((err, _req, res, _next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
});
// 404 handler
app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
});
// ==========================================
// Start server
// ==========================================
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║           Pre-Shift Check API Server                         ║
╠══════════════════════════════════════════════════════════════╣
║  Server running on port ${PORT}                                  ║
║  Health: http://localhost:${PORT}/health                         ║
║  API:    http://localhost:${PORT}/api                            ║
╠══════════════════════════════════════════════════════════════╣
║  Endpoints:                                                  ║
║    GET  /api/assets                                          ║
║    GET  /api/assets/:asset_id                                ║
║    GET  /api/checklists                                      ║
║    GET  /api/checklists/active?machine_class=...             ║
║    GET  /api/events                                          ║
║    POST /api/events                                          ║
║    POST /api/events/batch                                    ║
║    GET  /api/faults?asset_id=...&status=OPEN                 ║
║    POST /api/faults                                          ║
║    POST /api/faults/batch                                    ║
║    GET  /api/status                                          ║
╚══════════════════════════════════════════════════════════════╝
  `);
});
export default app;
//# sourceMappingURL=index.js.map