import type { Asset, Checklist, Fault } from './types.js';

// ==========================================
// Mock Assets - 8 assets across 3 machine classes
// ==========================================
export const mockAssets: Asset[] = [
  // Tractors (3)
  {
    asset_id: 'TRAC001',
    name: 'John Deere 8R 410',
    machine_class: 'Tractor',
    qr_code_value: 'TRAC001'
  },
  {
    asset_id: 'TRAC002',
    name: 'Case IH Magnum 380',
    machine_class: 'Tractor',
    qr_code_value: 'TRAC002'
  },
  {
    asset_id: 'TRAC003',
    name: 'New Holland T7.315',
    machine_class: 'Tractor',
    qr_code_value: 'TRAC003'
  },
  // Harvesters (3)
  {
    asset_id: 'HARV001',
    name: 'John Deere S790',
    machine_class: 'Harvester',
    qr_code_value: 'HARV001'
  },
  {
    asset_id: 'HARV002',
    name: 'Case IH 9250',
    machine_class: 'Harvester',
    qr_code_value: 'HARV002'
  },
  {
    asset_id: 'HARV003',
    name: 'CLAAS LEXION 8900',
    machine_class: 'Harvester',
    qr_code_value: 'HARV003'
  },
  // Sprayers (2)
  {
    asset_id: 'SPRY001',
    name: 'John Deere R4045',
    machine_class: 'Sprayer',
    qr_code_value: 'SPRY001'
  },
  {
    asset_id: 'SPRY002',
    name: 'Case IH Patriot 4440',
    machine_class: 'Sprayer',
    qr_code_value: 'SPRY002'
  }
];

// ==========================================
// Mock Checklists - One ACTIVE per machine class
// ==========================================
export const mockChecklists: Checklist[] = [
  // Tractor Checklist (10 items)
  {
    checklist_id: 'CL-TRACTOR-V1',
    machine_class: 'Tractor',
    status: 'ACTIVE',
    version: '1.2',
    items: [
      { item_id: 'T01', text: 'Engine oil level is within acceptable range', priority: 'HIGH', sort_order: 1 },
      { item_id: 'T02', text: 'Coolant level is adequate', priority: 'HIGH', sort_order: 2 },
      { item_id: 'T03', text: 'Hydraulic fluid level is within range', priority: 'HIGH', sort_order: 3 },
      { item_id: 'T04', text: 'Tire pressure and condition are acceptable', priority: 'MED', sort_order: 4 },
      { item_id: 'T05', text: 'All lights and indicators are functional', priority: 'MED', sort_order: 5 },
      { item_id: 'T06', text: 'Brakes respond correctly', priority: 'HIGH', sort_order: 6 },
      { item_id: 'T07', text: 'Steering operates smoothly', priority: 'HIGH', sort_order: 7 },
      { item_id: 'T08', text: 'Seat belt is functional and undamaged', priority: 'HIGH', sort_order: 8 },
      { item_id: 'T09', text: 'ROPS/cab structure is secure', priority: 'HIGH', sort_order: 9 },
      { item_id: 'T10', text: 'No visible fluid leaks', priority: 'MED', sort_order: 10 }
    ]
  },
  // Harvester Checklist (12 items)
  {
    checklist_id: 'CL-HARVESTER-V1',
    machine_class: 'Harvester',
    status: 'ACTIVE',
    version: '2.0',
    items: [
      { item_id: 'H01', text: 'Engine oil level is within acceptable range', priority: 'HIGH', sort_order: 1 },
      { item_id: 'H02', text: 'Coolant level is adequate', priority: 'HIGH', sort_order: 2 },
      { item_id: 'H03', text: 'Hydraulic fluid level is within range', priority: 'HIGH', sort_order: 3 },
      { item_id: 'H04', text: 'All belt tensions are correct', priority: 'HIGH', sort_order: 4 },
      { item_id: 'H05', text: 'Header cutting components are sharp and undamaged', priority: 'MED', sort_order: 5 },
      { item_id: 'H06', text: 'Feederhouse chains are properly tensioned', priority: 'MED', sort_order: 6 },
      { item_id: 'H07', text: 'Rotor/cylinder components are in good condition', priority: 'HIGH', sort_order: 7 },
      { item_id: 'H08', text: 'Cleaning shoe sieves are clear', priority: 'MED', sort_order: 8 },
      { item_id: 'H09', text: 'Grain tank unloading auger operates smoothly', priority: 'LOW', sort_order: 9 },
      { item_id: 'H10', text: 'All safety guards are in place', priority: 'HIGH', sort_order: 10 },
      { item_id: 'H11', text: 'Fire extinguisher is present and charged', priority: 'HIGH', sort_order: 11 },
      { item_id: 'H12', text: 'GPS/yield monitor systems are functional', priority: 'LOW', sort_order: 12 }
    ]
  },
  // Sprayer Checklist (9 items)
  {
    checklist_id: 'CL-SPRAYER-V1',
    machine_class: 'Sprayer',
    status: 'ACTIVE',
    version: '1.5',
    items: [
      { item_id: 'S01', text: 'Engine oil level is within acceptable range', priority: 'HIGH', sort_order: 1 },
      { item_id: 'S02', text: 'Coolant level is adequate', priority: 'HIGH', sort_order: 2 },
      { item_id: 'S03', text: 'Spray tank is clean from previous chemical residue', priority: 'HIGH', sort_order: 3 },
      { item_id: 'S04', text: 'All nozzles are clear and matched', priority: 'HIGH', sort_order: 4 },
      { item_id: 'S05', text: 'Boom sections fold and unfold properly', priority: 'MED', sort_order: 5 },
      { item_id: 'S06', text: 'Spray pump pressure is within specifications', priority: 'HIGH', sort_order: 6 },
      { item_id: 'S07', text: 'All hoses and fittings are leak-free', priority: 'HIGH', sort_order: 7 },
      { item_id: 'S08', text: 'Rate controller is calibrated', priority: 'MED', sort_order: 8 },
      { item_id: 'S09', text: 'Personal protective equipment is available', priority: 'HIGH', sort_order: 9 }
    ]
  },
  // Inactive checklist (for testing)
  {
    checklist_id: 'CL-TRACTOR-OLD',
    machine_class: 'Tractor',
    status: 'INACTIVE',
    version: '1.0',
    items: [
      { item_id: 'TO1', text: 'Old checklist item', priority: 'LOW', sort_order: 1 }
    ]
  }
];

// ==========================================
// Mock Faults - Some pre-existing OPEN faults
// ==========================================
const now = new Date().toISOString();

export const mockFaults: Fault[] = [
  {
    fault_id: 'FAULT-001',
    asset_id: 'TRAC001',
    status: 'OPEN',
    origin: 'PRE_SHIFT_CHECK',
    priority: 'MED',
    description: 'Tire pressure on rear left is low (28 psi, should be 35). Found during pre-shift check.',
    source_event_id: 'EVT-HISTORICAL-001',
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    reporter: { name: 'Mike Johnson', user_id: 'USR001' }
  },
  {
    fault_id: 'FAULT-002',
    asset_id: 'TRAC001',
    status: 'OPEN',
    origin: 'MANUAL',
    priority: 'LOW',
    description: 'Dashboard warning light intermittently flashing - needs investigation.',
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    reporter: { name: 'Sarah Williams', user_id: 'USR002' }
  },
  {
    fault_id: 'FAULT-003',
    asset_id: 'HARV001',
    status: 'OPEN',
    origin: 'PRE_SHIFT_CHECK',
    priority: 'HIGH',
    description: 'Belt tension on main drive appears loose. Operator noted squealing sound.',
    source_event_id: 'EVT-HISTORICAL-002',
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    reporter: { name: 'David Martinez', user_id: 'USR003' }
  },
  {
    fault_id: 'FAULT-004',
    asset_id: 'SPRY001',
    status: 'OPEN',
    origin: 'PRE_SHIFT_CHECK',
    priority: 'HIGH',
    description: 'Nozzle #5 on left boom section is clogged. Needs cleaning or replacement.',
    source_event_id: 'EVT-HISTORICAL-003',
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    reporter: { name: 'Emily Chen', user_id: 'USR004' }
  },
  {
    fault_id: 'FAULT-005',
    asset_id: 'TRAC002',
    status: 'CLOSED',
    origin: 'PRE_SHIFT_CHECK',
    priority: 'HIGH',
    description: 'Brake response delayed - fixed by bleeding brake lines.',
    source_event_id: 'EVT-HISTORICAL-004',
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    reporter: { name: 'Mike Johnson', user_id: 'USR001' }
  }
];

// ==========================================
// Mock Events - Some historical events
// ==========================================
export const mockEvents: import('./types.js').PreShiftCheckEvent[] = [
  {
    event_id: 'EVT-HISTORICAL-001',
    asset_id: 'TRAC001',
    machine_class: 'Tractor',
    checklist_snapshot: {
      checklist_id: 'CL-TRACTOR-V1',
      version: '1.2',
      machine_class: 'Tractor',
      items: mockChecklists[0].items
    },
    responses: [
      { item_id: 'T01', answer: 'YES' },
      { item_id: 'T02', answer: 'YES' },
      { item_id: 'T03', answer: 'YES' },
      { item_id: 'T04', answer: 'NO', comment: 'Rear left tire pressure is low at 28 psi' },
      { item_id: 'T05', answer: 'YES' },
      { item_id: 'T06', answer: 'YES' },
      { item_id: 'T07', answer: 'YES' },
      { item_id: 'T08', answer: 'YES' },
      { item_id: 'T09', answer: 'YES' },
      { item_id: 'T10', answer: 'YES' }
    ],
    reporter: { name: 'Mike Johnson', user_id: 'USR001' },
    started_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 600000).toISOString(),
    completed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    result: 'FAIL'
  }
];

