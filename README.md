# Pre-Shift Check PWA

Offline-first Progressive Web App for pre-shift safety checklists on agricultural equipment.

## Features

- ✅ **Offline-First**: Complete checks without network connectivity
- ✅ **QR Code Scanning**: Quick asset identification via deep links
- ✅ **Auto-Sync**: Automatic synchronization when connectivity is restored
- ✅ **PWA**: Installable on mobile devices
- ✅ **IndexedDB**: Persistent local storage using Dexie
- ✅ **Fault Tracking**: Automatic fault creation for failed checks

## Quick Start

### Local Development

```bash
# Install dependencies
make install

# Run both server and client
make dev
```

- Client: http://localhost:4200
- Server API: http://localhost:3000/api

### Docker

```bash
# Build and run
make docker-run

# Access at http://localhost:8080
```

### Kubernetes

```bash
# With Ingress (requires ingress-nginx)
make k8s-apply

# With NodePort (for mobile testing)
make k8s-nodeport

# Access at http://<minikube-ip>:30080
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Mobile Browser                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │               Angular 20 PWA Client                   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐ │  │
│  │  │  Dashboard  │  │ Check Form  │  │   History    │ │  │
│  │  └─────────────┘  └─────────────┘  └──────────────┘ │  │
│  │  ┌─────────────────────────────────────────────────┐ │  │
│  │  │           Service Worker (ngsw)                 │ │  │
│  │  │        App Shell + API Caching                  │ │  │
│  │  └─────────────────────────────────────────────────┘ │  │
│  │  ┌─────────────────────────────────────────────────┐ │  │
│  │  │           IndexedDB (Dexie)                     │ │  │
│  │  │  assets | checklists | events | faults | meta  │ │  │
│  │  └─────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ POST /api/events
                              │ POST /api/faults
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Node.js API Server                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Express API                                            ││
│  │  GET /api/assets          POST /api/events/batch        ││
│  │  GET /api/checklists      POST /api/faults/batch        ││
│  │  GET /api/faults                                        ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │  In-Memory Database (Map)                               ││
│  │  Mock data: 8 assets, 3 checklists, sample faults       ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Data Model

### Assets
```typescript
interface Asset {
  asset_id: string;      // "TRAC001"
  name: string;          // "John Deere 8R 410"
  machine_class: string; // "Tractor" | "Harvester" | "Sprayer"
  qr_code_value: string; // Used for QR deep links
}
```

### Checklists
```typescript
interface Checklist {
  checklist_id: string;
  machine_class: string;
  status: 'ACTIVE' | 'INACTIVE';
  version: string;
  items: ChecklistItem[];
}

interface ChecklistItem {
  item_id: string;
  text: string;
  priority: 'LOW' | 'MED' | 'HIGH';
  sort_order: number;
}
```

### PreShiftCheckEvent
```typescript
interface PreShiftCheckEvent {
  event_id: string;           // UUID v4, client-generated
  asset_id: string;
  machine_class: string;
  checklist_snapshot: object; // Immutable copy at time of check
  responses: CheckResponse[]; // YES/NO per item
  reporter: { name, user_id? };
  started_at: string;
  completed_at: string;
  result: 'PASS' | 'FAIL';
  sync_status: 'PENDING' | 'SYNCED' | 'ERROR'; // Client-only
}
```

### Faults
```typescript
interface Fault {
  fault_id: string;            // UUID v4, client-generated
  asset_id: string;
  status: 'OPEN' | 'CLOSED';
  origin: 'PRE_SHIFT_CHECK';
  priority: 'LOW' | 'MED' | 'HIGH';
  description: string;
  source_event_id?: string;
  sync_status: 'PENDING' | 'SYNCED' | 'ERROR'; // Client-only
}
```

## Offline-First Sync Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   User       │     │   Client     │     │   Server     │
│   Action     │     │   (PWA)      │     │   (API)      │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │ Complete Check     │                    │
       │───────────────────>│                    │
       │                    │                    │
       │                    │ Save to IndexedDB  │
       │                    │ (sync_status=PENDING)
       │                    │                    │
       │                    │                    │
       │<───────────────────│                    │
       │ "Check saved locally"                   │
       │                    │                    │
       │                    │                    │
 ══════╪════════════════════╪════════════════════╪══════
       │  [Online Event or Manual Sync]          │
       │                    │                    │
       │                    │ POST /api/events/batch
       │                    │───────────────────>│
       │                    │                    │
       │                    │ POST /api/faults/batch
       │                    │───────────────────>│
       │                    │                    │
       │                    │<───────────────────│
       │                    │  200 OK            │
       │                    │                    │
       │                    │ Update IndexedDB   │
       │                    │ (sync_status=SYNCED)
       │                    │                    │
       │                    │ GET /api/faults?asset_id=...
       │                    │───────────────────>│
       │                    │                    │
       │                    │<───────────────────│
       │                    │ Refresh local faults
       │                    │                    │
```

## QR Code Deep Links

QR codes should encode URLs in this format:

```
https://your-domain.com/pre-shift?asset_id=TRAC001
```

For local development:
```
http://localhost:4200/pre-shift?asset_id=TRAC001
```

For Kubernetes (NodePort):
```
http://<YOUR_HOST_IP>:30080/pre-shift?asset_id=TRAC001
```

### Sample QR URLs for Testing

| Asset | URL |
|-------|-----|
| TRAC001 | `/pre-shift?asset_id=TRAC001` |
| TRAC002 | `/pre-shift?asset_id=TRAC002` |
| HARV001 | `/pre-shift?asset_id=HARV001` |
| SPRY001 | `/pre-shift?asset_id=SPRY001` |

Generate QR codes at: https://www.qr-code-generator.com/

## Testing on Mobile Device

### Option 1: Kubernetes with NodePort (Recommended)

1. Deploy to Kubernetes:
   ```bash
   make k8s-nodeport
   ```

2. Find your host IP:
   ```bash
   hostname -I | awk '{print $1}'
   ```
   
3. If using Minikube:
   ```bash
   minikube ip
   ```

4. Access from phone: `http://<HOST_IP>:30080`

5. For PWA install prompt, you may need HTTPS. Use ngrok for testing:
   ```bash
   ngrok http 30080
   ```

### Option 2: Docker Compose

1. Run Docker Compose:
   ```bash
   make docker-run
   ```

2. Access from phone: `http://<HOST_IP>:8080`

### Testing Offline Mode

1. Open the app on your phone
2. Let it sync (green "Online" indicator, assets/checklists load)
3. Enable Airplane Mode
4. Complete a pre-shift check
5. Check shows "PENDING" status
6. Disable Airplane Mode
7. Check auto-syncs (or tap "Sync Now")

## iOS Limitations

iOS Safari has some PWA limitations:

- **Service Worker**: Fully supported
- **IndexedDB**: Supported, but data may be cleared if app not used for 7 days
- **Push Notifications**: Not supported
- **Background Sync**: Not supported - sync only works when app is open
- **Install Prompt**: No automatic prompt - user must use "Add to Home Screen"

**Recommendation**: Keep the app open briefly after completing checks to ensure sync completes.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/assets` | List all assets |
| GET | `/api/assets/:id` | Get single asset |
| GET | `/api/checklists/active?machine_class=...` | Get active checklist |
| POST | `/api/events` | Upsert single event |
| POST | `/api/events/batch` | Batch upsert events |
| GET | `/api/faults?asset_id=...&status=OPEN` | List faults |
| POST | `/api/faults` | Upsert single fault |
| POST | `/api/faults/batch` | Batch upsert faults |
| GET | `/api/health` | Health check |

See `server/openapi.yaml` for full API specification.

## Mock Data

The server includes mock data for testing:

**Assets (8)**:
- 3 Tractors: TRAC001, TRAC002, TRAC003
- 3 Harvesters: HARV001, HARV002, HARV003
- 2 Sprayers: SPRY001, SPRY002

**Checklists (3 active)**:
- Tractor: 10 items
- Harvester: 12 items
- Sprayer: 9 items

**Pre-existing Faults (4 OPEN)**:
- TRAC001: 2 open faults
- HARV001: 1 open fault
- SPRY001: 1 open fault

## Development

### Project Structure

```
pre-shift-check-pwa/
├── client/                 # Angular 20 PWA
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/ # UI components
│   │   │   ├── services/   # Database, API, Sync
│   │   │   └── models/     # TypeScript types
│   │   └── environments/   # Environment config
│   ├── Dockerfile
│   └── ngsw-config.json    # Service Worker config
├── server/                 # Node.js Express API
│   ├── src/
│   │   ├── index.ts        # Express server
│   │   ├── types.ts        # TypeScript types
│   │   └── mock-data.ts    # Mock data
│   ├── Dockerfile
│   └── openapi.yaml        # API specification
├── k8s/                    # Kubernetes manifests
│   ├── namespace.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   └── combined-deployment.yaml
├── docker-compose.yml
├── Makefile
└── README.md
```

### Running Tests

```bash
# All tests
make test

# Server tests only
cd server && npm test

# Client tests only
cd client && npm test
```

## License

MIT

