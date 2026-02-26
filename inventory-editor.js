const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const host = '0.0.0.0';
const port = Number(process.env.INVENTORY_EDITOR_PORT || 4280);
const inventoryFile = path.join(__dirname, 'public', 'inventory-data.js');

const editorHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Inventory GUI Editor</title>
  <style>
    :root {
      --bg: #0f1115;
      --surface: #171a21;
      --line: #2a3040;
      --ink: #eceff4;
      --ink-soft: #a9b1c2;
      --accent: #7c9cff;
      --danger: #c95f6a;
    }
    body { font-family: Inter, system-ui, sans-serif; margin: 0; background: var(--bg); color: var(--ink); }
    main { width: min(1200px, 95%); margin: 1rem auto 1.8rem; }
    h1 { margin-bottom: .35rem; }
    p { color: var(--ink-soft); }
    .panel { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: .9rem; }
    .toolbar { display: flex; gap: .6rem; align-items: center; flex-wrap: wrap; margin-bottom: .9rem; }
    button { background: var(--accent); color: #fff; border: 0; border-radius: 8px; padding: .56rem .8rem; font-weight: 700; cursor: pointer; }
    button.secondary { background: #2a3345; }
    button.danger { background: var(--danger); }
    .status { font-weight: 700; color: var(--ink-soft); }
    .ok { color: #63d689; }
    .err { color: #ff7b7b; }
    .meta { display: grid; grid-template-columns: 180px 1fr; gap: .5rem .7rem; align-items: center; margin-bottom: .7rem; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem; }
    .section { border: 1px solid var(--line); border-radius: 10px; padding: .7rem; background: #141924; }
    .section h3 { margin: 0 0 .6rem; }
    .row { display: grid; grid-template-columns: 2fr .7fr .9fr 1fr 2fr auto; gap: .4rem; margin-bottom: .35rem; }
    .row.head { font-weight: 700; color: var(--ink-soft); font-size: .85rem; }
    .row input, .row select, .meta input, textarea {
      width: 100%; border: 1px solid #37445f; background: #111722; color: var(--ink);
      border-radius: 7px; padding: .42rem .5rem; font: inherit;
    }
    textarea { min-height: 70px; }
    .ams-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .6rem; }
    .footer-note { margin-top: .7rem; font-size: .9rem; }
    @media (max-width: 980px) {
      .grid { grid-template-columns: 1fr; }
      .row { grid-template-columns: 1fr; }
      .row.head { display: none; }
    }
  </style>
</head>
<body>
  <main>
    <h1>Inventory GUI Editor</h1>
    <p>Edit inventory with forms instead of raw JSON. Save changes and your inventory page updates automatically.</p>

    <div class="panel">
      <div class="toolbar">
        <button id="reloadBtn" class="secondary">Reload from file</button>
        <button id="saveBtn">Save inventory</button>
        <span id="status" class="status">Ready</span>
      </div>

      <div class="meta">
        <label for="updatedAt">Last updated</label>
        <input id="updatedAt" placeholder="YYYY-MM-DD" />
      </div>

      <div class="grid" id="sections"></div>

      <div class="section" style="margin-top:.8rem;">
        <h3>AMS</h3>
        <div class="ams-grid">
          <label>Enabled <select id="amsEnabled"><option value="true">Yes</option><option value="false">No</option></select></label>
          <label>Dry-box ready <select id="amsDry"><option value="true">Yes</option><option value="false">No</option></select></label>
          <label>Systems <input id="amsSystems" type="number" min="0" step="1" /></label>
          <label>Slots per system <input id="amsSlots" type="number" min="0" step="1" /></label>
        </div>
        <label>Loaded spools (one per line)</label>
        <textarea id="amsLoaded"></textarea>
        <label>Notes</label>
        <textarea id="amsNotes"></textarea>
      </div>

      <p class="footer-note">Endpoint: <code>/api/inventory</code></p>
    </div>
  </main>

  <template id="sectionTemplate">
    <section class="section">
      <h3></h3>
      <div class="row head">
        <div>Name</div><div>Qty</div><div>Unit</div><div>Status</div><div>Notes</div><div></div>
      </div>
      <div class="rows"></div>
      <button type="button" class="secondary add-row">+ Add row</button>
    </section>
  </template>

  <script>
    const statusEl = document.getElementById('status');
    const sectionsRoot = document.getElementById('sections');

    const sectionDefs = [
      { key: 'filament', label: 'Filament' },
      { key: 'printers', label: 'Printers' },
      { key: 'buildPlates', label: 'Build plates' },
      { key: 'nozzles', label: 'Nozzles' },
    ];

    const setStatus = (text, cls='status') => {
      statusEl.className = cls;
      statusEl.textContent = text;
    };

    const createItemRow = (item = {}) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = \
        '<input data-field="name" placeholder="Item name" />' +
        '<input data-field="qty" type="number" step="1" min="0" placeholder="0" />' +
        '<input data-field="unit" placeholder="spools / nozzle / printer" />' +
        '<select data-field="status"><option value="in_stock">in_stock</option><option value="low">low</option><option value="out">out</option></select>' +
        '<input data-field="notes" placeholder="Notes" />' +
        '<button type="button" class="danger remove">Remove</button>';

      row.querySelector('[data-field="name"]').value = item.name ?? '';
      row.querySelector('[data-field="qty"]').value = Number(item.qty ?? 0);
      row.querySelector('[data-field="unit"]').value = item.unit ?? '';
      row.querySelector('[data-field="status"]').value = item.status ?? 'in_stock';
      row.querySelector('[data-field="notes"]').value = item.notes ?? '';
      row.querySelector('.remove').addEventListener('click', () => row.remove());
      return row;
    };

    const renderSections = (data) => {
      sectionsRoot.innerHTML = '';
      const tpl = document.getElementById('sectionTemplate');

      sectionDefs.forEach((section) => {
        const frag = tpl.content.cloneNode(true);
        const card = frag.querySelector('.section');
        const heading = frag.querySelector('h3');
        const rowsRoot = frag.querySelector('.rows');
        const addBtn = frag.querySelector('.add-row');

        heading.textContent = section.label;
        const list = Array.isArray(data[section.key]) ? data[section.key] : [];
        list.forEach((entry) => rowsRoot.appendChild(createItemRow(entry)));
        if (list.length === 0) {
          rowsRoot.appendChild(createItemRow());
        }

        addBtn.addEventListener('click', () => rowsRoot.appendChild(createItemRow()));
        card.dataset.sectionKey = section.key;
        sectionsRoot.appendChild(card);
      });
    };

    const collectSectionRows = (sectionEl) => {
      const rows = [];
      sectionEl.querySelectorAll('.rows .row').forEach((row) => {
        const name = row.querySelector('[data-field="name"]').value.trim();
        const qtyRaw = row.querySelector('[data-field="qty"]').value;
        const unit = row.querySelector('[data-field="unit"]').value.trim();
        const status = row.querySelector('[data-field="status"]').value;
        const notes = row.querySelector('[data-field="notes"]').value.trim();

        if (!name && !unit && !notes && !qtyRaw) {
          return;
        }

        rows.push({
          name,
          qty: Number(qtyRaw || 0),
          unit,
          status,
          notes,
        });
      });
      return rows;
    };

    const load = async () => {
      try {
        setStatus('Loading...');
        const res = await fetch('/api/inventory');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Load failed');

        document.getElementById('updatedAt').value = data.updatedAt ?? '';
        renderSections(data);

        const ams = data.ams ?? {};
        document.getElementById('amsEnabled').value = String(Boolean(ams.enabled));
        document.getElementById('amsDry').value = String(Boolean(ams.dryBoxReady));
        document.getElementById('amsSystems').value = Number(ams.systems ?? 0);
        document.getElementById('amsSlots').value = Number(ams.slotsPerSystem ?? 0);
        document.getElementById('amsLoaded').value = Array.isArray(ams.loaded) ? ams.loaded.join('\n') : '';
        document.getElementById('amsNotes').value = ams.notes ?? '';

        setStatus('Loaded', 'status ok');
      } catch (error) {
        setStatus(error.message, 'status err');
      }
    };

    const save = async () => {
      try {
        const payload = {
          updatedAt: document.getElementById('updatedAt').value.trim(),
          ams: {
            enabled: document.getElementById('amsEnabled').value === 'true',
            systems: Number(document.getElementById('amsSystems').value || 0),
            slotsPerSystem: Number(document.getElementById('amsSlots').value || 0),
            dryBoxReady: document.getElementById('amsDry').value === 'true',
            loaded: document.getElementById('amsLoaded').value
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean),
            notes: document.getElementById('amsNotes').value.trim(),
          },
        };

        document.querySelectorAll('[data-section-key]').forEach((sectionEl) => {
          payload[sectionEl.dataset.sectionKey] = collectSectionRows(sectionEl);
        });

        const res = await fetch('/api/inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const out = await res.json();
        if (!res.ok) throw new Error(out.error || 'Save failed');
        setStatus('Saved ✔', 'status ok');
      } catch (error) {
        setStatus(error.message, 'status err');
      }
    };

    document.getElementById('reloadBtn').addEventListener('click', load);
    document.getElementById('saveBtn').addEventListener('click', save);
    load();
  </script>
</body>
</html>`;

const readInventoryData = () => {
  const source = fs.readFileSync(inventoryFile, 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  return sandbox.window.INVENTORY_DATA;
};

const writeInventoryData = (data) => {
  const serialized = `// Edit this file to update live inventory shown on inventory.html.\n// Tip: duplicate existing entries and adjust name/notes/qty/status.\nwindow.INVENTORY_DATA = ${JSON.stringify(data, null, 2)};\n`;
  fs.writeFileSync(inventoryFile, serialized, 'utf8');
};

const readJsonBody = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > 4 * 1024 * 1024) {
      reject(new Error('Payload too large'));
    }
  });
  req.on('end', () => {
    try {
      resolve(JSON.parse(raw || '{}'));
    } catch {
      reject(new Error('Invalid JSON'));
    }
  });
  req.on('error', reject);
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(editorHtml);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/inventory') {
    try {
      const data = readInventoryData();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/inventory') {
    try {
      const data = await readJsonBody(req);
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Inventory root must be an object');
      }
      writeInventoryData(data);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, host, () => {
  console.log(`Inventory editor running at http://${host}:${port}`);
  console.log('Tip: Keep your main site server running too, then open /inventory.html to watch live updates.');
});
