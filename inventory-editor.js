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
  <title>Inventory Editor</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; margin: 0; background: #0f1115; color: #eceff4; }
    main { width: min(1100px, 94%); margin: 1.2rem auto; }
    .card { background: #171a21; border: 1px solid #2a3040; border-radius: 12px; padding: 1rem; }
    textarea { width: 100%; min-height: 62vh; background: #111722; color: #d6e0ff; border: 1px solid #37445f; border-radius: 10px; padding: .8rem; font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .row { display: flex; gap: .6rem; align-items: center; margin-bottom: .7rem; flex-wrap: wrap; }
    button { background: #7c9cff; color: #fff; border: 0; border-radius: 8px; padding: .55rem .8rem; font-weight: 700; cursor: pointer; }
    button.secondary { background: #2a3345; }
    .status { font-weight: 700; color: #a9b1c2; }
    .ok { color: #63d689; }
    .err { color: #ff7b7b; }
    code { background: #202a3b; padding: .15rem .35rem; border-radius: 5px; }
  </style>
</head>
<body>
  <main>
    <h1>Inventory Editor (External Tool)</h1>
    <p>Update inventory in real time. Save here and your site inventory page will auto-refresh within a few seconds.</p>
    <div class="card">
      <div class="row">
        <button id="reloadBtn" class="secondary">Reload from file</button>
        <button id="formatBtn" class="secondary">Format JSON</button>
        <button id="saveBtn">Save inventory</button>
        <span id="status" class="status">Ready</span>
      </div>
      <textarea id="editor" spellcheck="false"></textarea>
      <p>Status endpoint: <code>/api/inventory</code></p>
    </div>
  </main>
  <script>
    const editor = document.getElementById('editor');
    const statusEl = document.getElementById('status');

    const setStatus = (text, cls='status') => {
      statusEl.className = cls;
      statusEl.textContent = text;
    };

    const load = async () => {
      setStatus('Loading...');
      const res = await fetch('/api/inventory');
      const data = await res.json();
      editor.value = JSON.stringify(data, null, 2);
      setStatus('Loaded', 'status ok');
    };

    const save = async () => {
      try {
        const parsed = JSON.parse(editor.value);
        const res = await fetch('/api/inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed),
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
    document.getElementById('formatBtn').addEventListener('click', () => {
      try {
        editor.value = JSON.stringify(JSON.parse(editor.value), null, 2);
        setStatus('Formatted JSON', 'status ok');
      } catch (error) {
        setStatus(error.message, 'status err');
      }
    });

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
