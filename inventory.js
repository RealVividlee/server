const inventoryUpdatedAt = document.getElementById('inventoryUpdatedAt');
const inventorySections = document.getElementById('inventorySections');
const amsSummary = document.getElementById('amsSummary');

const statusLabel = {
  in_stock: 'In stock',
  low: 'Low stock',
  out: 'Out of stock',
};

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const renderTable = (title, items) => {
  const rows = items.map((item) => `<tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.qty)} ${escapeHtml(item.unit)}</td>
      <td><span class="inventory-status inventory-status-${escapeHtml(item.status)}">${escapeHtml(statusLabel[item.status] ?? item.status)}</span></td>
      <td>${escapeHtml(item.notes ?? '')}</td>
    </tr>`).join('');

  return `<section class="inventory-block">
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

const renderInventory = () => {
  const data = window.INVENTORY_DATA;
  if (!data || !inventorySections || !amsSummary) {
    return;
  }

  inventoryUpdatedAt.textContent = data.updatedAt ? `Last updated: ${data.updatedAt}` : 'Last updated: —';

  const sections = [
    ['Available filament', data.filament ?? []],
    ['Printers', data.printers ?? []],
    ['Build plates', data.buildPlates ?? []],
    ['Nozzles', data.nozzles ?? []],
  ];

  inventorySections.innerHTML = sections.map(([title, items]) => renderTable(title, items)).join('');

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

renderInventory();
