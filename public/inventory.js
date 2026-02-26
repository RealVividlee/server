const inventoryUpdatedAt = document.getElementById('inventoryUpdatedAt');
const inventorySections = document.getElementById('inventorySections');
const amsSummary = document.getElementById('amsSummary');
let inventorySignature = '';

const filamentStatusLabel = {
  in_stock: 'In stock',
  low: 'Low stock',
  out: 'Out of stock',
};

const getStatusMeta = (sectionKey, status) => {
  if (sectionKey === 'filament') {
    return {
      label: filamentStatusLabel[status] ?? status,
      tone: status,
    };
  }

  const isUnavailable = status === 'out';
  return {
    label: isUnavailable ? 'Unavailable' : 'Available',
    tone: isUnavailable ? 'unavailable' : 'available',
  };
};

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const renderTable = (sectionKey, title, items, classes = 'inventory-block') => {
  const rows = items.map((item) => {
    const statusMeta = getStatusMeta(sectionKey, item.status);
    return `<tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.qty)} ${escapeHtml(item.unit)}</td>
      <td><span class="inventory-status inventory-status-${escapeHtml(statusMeta.tone)}">${escapeHtml(statusMeta.label)}</span></td>
      <td>${escapeHtml(item.notes ?? '')}</td>
    </tr>`;
  }).join('');

  return `<section class="${classes}">
      <h3>${escapeHtml(title)}</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Item</th><th>Qty</th><th>Status</th><th>Notes</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
};

const renderInventory = (data) => {
  if (!data || !inventorySections || !amsSummary) {
    return;
  }

  inventoryUpdatedAt.textContent = data.updatedAt ? `Last updated: ${data.updatedAt}` : 'Last updated: —';

  const featuredFilament = renderTable('filament', 'Available filament', data.filament ?? [], 'inventory-block inventory-block-featured');

  const compactSections = [
    ['printers', 'Printers', data.printers ?? []],
    ['buildPlates', 'Build plates', data.buildPlates ?? []],
    ['nozzles', 'Nozzles', data.nozzles ?? []],
  ];

  const compactMarkup = compactSections
    .map(([sectionKey, title, items]) => renderTable(sectionKey, title, items, 'inventory-block inventory-block-compact'))
    .join('');

  inventorySections.innerHTML = `${featuredFilament}<div class="inventory-compact-grid">${compactMarkup}</div>`;

  const ams = data.ams ?? {};
  const loaded = Array.isArray(ams.loaded) ? ams.loaded : [];
  const loadedList = loaded.length
    ? `<ul>${loaded.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul>`
    : '<p>No AMS slots currently assigned.</p>';

  amsSummary.innerHTML = `<p><strong>AMS Enabled:</strong> ${ams.enabled ? 'Yes' : 'No'}</p>
    <p><strong>Systems:</strong> ${escapeHtml(ams.systems ?? 0)} · <strong>Slots/system:</strong> ${escapeHtml(ams.slotsPerSystem ?? 0)}</p>
    <p><strong>Dry-box ready:</strong> ${ams.dryBoxReady ? 'Yes' : 'No'}</p>
    <p><strong>Loaded now:</strong></p>${loadedList}
    <p>${escapeHtml(ams.notes ?? '')}</p>`;
};

const applyDataIfChanged = (data) => {
  const signature = JSON.stringify(data);
  if (signature === inventorySignature) {
    return;
  }

  inventorySignature = signature;
  renderInventory(data);
};

const refreshInventory = async () => {
  try {
    const response = await fetch(`inventory-data.js?ts=${Date.now()}`, { cache: 'no-store' });
    const source = await response.text();
    const scopedWindow = {};
    Function('window', source)(scopedWindow);
    applyDataIfChanged(scopedWindow.INVENTORY_DATA);
  } catch {
    // Keep the currently rendered inventory if refresh fails.
  }
};

applyDataIfChanged(window.INVENTORY_DATA);
setInterval(refreshInventory, 5000);
