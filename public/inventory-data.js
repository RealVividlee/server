// Edit this file to update live inventory shown on inventory.html.
// Tip: duplicate existing entries and adjust name/notes/qty/status.
window.INVENTORY_DATA = {
  updatedAt: '2026-02-17',
  filament: [
    { name: 'PLA - Matte Black', qty: 6, unit: 'spools', status: 'in_stock', notes: 'Primary prototype filament' },
    { name: 'PLA - Silk Copper', qty: 2, unit: 'spools', status: 'low', notes: 'Display and gift projects' },
    { name: 'PETG - Charcoal', qty: 4, unit: 'spools', status: 'in_stock', notes: 'Outdoor and functional parts' },
    { name: 'ABS - Natural', qty: 1, unit: 'spools', status: 'low', notes: 'High-temp jobs only' },
    { name: 'TPU 95A - Black', qty: 3, unit: 'spools', status: 'in_stock', notes: 'Flexible grips and bumpers' },
  ],
  printers: [
    { name: 'Bambu Lab X1C', qty: 1, unit: 'printer', status: 'in_stock', notes: 'Main production machine' },
    { name: 'Bambu Lab P1S', qty: 1, unit: 'printer', status: 'in_stock', notes: 'Secondary throughput' },
  ],
  buildPlates: [
    { name: 'Textured PEI Plate', qty: 3, unit: 'plates', status: 'in_stock', notes: 'General purpose' },
    { name: 'Smooth PEI Plate', qty: 1, unit: 'plates', status: 'low', notes: 'Display-face first layers' },
    { name: 'Engineering Plate', qty: 1, unit: 'plates', status: 'in_stock', notes: 'High-temp material runs' },
  ],
  nozzles: [
    { name: '0.4mm Hardened Steel', qty: 4, unit: 'nozzles', status: 'in_stock', notes: 'Default daily nozzle' },
    { name: '0.6mm Hardened Steel', qty: 2, unit: 'nozzles', status: 'in_stock', notes: 'Faster structural prints' },
    { name: '0.2mm Stainless', qty: 1, unit: 'nozzles', status: 'low', notes: 'Fine detail parts' },
  ],
  ams: {
    enabled: true,
    systems: 1,
    slotsPerSystem: 4,
    dryBoxReady: true,
    loaded: [
      'PLA Matte Black',
      'PETG Charcoal',
      'PLA Silk Copper',
      'TPU 95A Black'
    ],
    notes: 'AMS auto-switching enabled for multi-color/swap jobs. TPU is currently loaded manually when needed.'
  }
};
