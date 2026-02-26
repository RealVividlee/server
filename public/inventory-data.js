// Edit this file to update live inventory shown on inventory.html.
// Tip: duplicate existing entries and adjust name/notes/qty/status.
window.INVENTORY_DATA = {
  updatedAt: '2026-02-24',
  filament: [
    { name: 'PLA - Matte Black', qty: 6, unit: 'spools', status: 'in_stock', notes: 'Primary prototype filament' },
    { name: 'PLA - Silk Copper', qty: 2, unit: 'spools', status: 'low', notes: 'Display and gift projects' },
    { name: 'PETG - Charcoal', qty: 4, unit: 'spools', status: 'in_stock', notes: 'Outdoor and functional parts' },
    { name: 'ABS - Natural', qty: 1, unit: 'spools', status: 'low', notes: 'High-temp jobs only' },
    { name: 'TPU 95A - Black', qty: 3, unit: 'spools', status: 'in_stock', notes: 'Flexible grips and bumpers' },
  ],
  printers: [
    { name: 'Bambu Lab P1S', qty: 1, unit: 'printer', status: 'in_stock', notes: 'Primary Bambu production machine' },
    { name: 'AnkerMake M5C', qty: 1, unit: 'printer', status: 'in_stock', notes: 'Secondary production machine' },
  ],
  buildPlates: [
    { name: 'Textured PEI Plate (P1S)', qty: 1, unit: 'plate', status: 'in_stock', notes: 'Only plate for P1S' },
    { name: 'Textured PEI Plate (M5C)', qty: 1, unit: 'plate', status: 'in_stock', notes: 'Only plate for M5C' },
  ],
  nozzles: [
    { name: 'P1S 0.2mm Stainless Steel', qty: 1, unit: 'nozzle', status: 'in_stock', notes: 'Fine detail parts' },
    { name: 'P1S 0.4mm Stainless Steel', qty: 1, unit: 'nozzle', status: 'in_stock', notes: 'Standard stainless setup' },
    { name: 'P1S 0.6mm Hardened Steel', qty: 1, unit: 'nozzle', status: 'in_stock', notes: 'Faster structural prints' },
    { name: 'M5C 0.4mm Brass', qty: 1, unit: 'nozzle', status: 'in_stock', notes: 'Default M5C nozzle' },
    { name: 'M5C 0.8mm Brass', qty: 1, unit: 'nozzle', status: 'in_stock', notes: 'Large line-width / speed setup' },
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
