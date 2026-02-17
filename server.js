const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const host = '0.0.0.0';
const port = Number(process.env.PORT || 4173);
const rootDir = __dirname;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const heuristicMissionPlan = (text) => {
  const normalized = String(text || '').toLowerCase();
  const plan = {
    material: 'PLA',
    finish: 'standard',
    colorProfile: 'standard',
    rush: false,
    designHelp: false,
    useCase: 'prototype',
    reasons: [],
  };

  if (normalized.includes('outdoor') || normalized.includes('sun') || normalized.includes('heat')) {
    plan.material = 'PETG';
    plan.reasons.push('Selected PETG for better outdoor and heat resistance.');
  }

  if (normalized.includes('strong') || normalized.includes('load') || normalized.includes('weight') || normalized.includes('replacement')) {
    plan.material = 'PETG';
    plan.useCase = 'replacement';
    plan.designHelp = true;
    plan.reasons.push('Enabled design help for structural reliability checks.');
  }

  if (normalized.includes('clean') || normalized.includes('client') || normalized.includes('display') || normalized.includes('detailed')) {
    plan.finish = 'premium';
    plan.colorProfile = 'silk';
    plan.useCase = 'display';
    plan.reasons.push('Upgraded to premium finish and silk profile for presentation quality.');
  }

  if (normalized.includes('fast') || normalized.includes('urgent') || normalized.includes('asap') || normalized.includes('tomorrow')) {
    plan.rush = true;
    plan.reasons.push('Enabled rush to reduce lead time.');
  }

  if (normalized.includes('gift')) {
    plan.useCase = 'gift';
    plan.colorProfile = 'silk';
    plan.reasons.push('Adjusted for gift presentation quality.');
  }

  if (plan.reasons.length === 0) {
    plan.reasons.push('Applied balanced defaults based on mission text.');
  }

  return plan;
};

const sendJson = (res, statusCode, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
};

const serveStatic = (req, res, pathname) => {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const resolved = path.resolve(rootDir, `.${safePath}`);

  if (!resolved.startsWith(rootDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(resolved, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });

    const stream = fs.createReadStream(resolved);
    stream.pipe(res);
    stream.on('error', () => {
      res.writeHead(500);
      res.end('Server error');
    });
  });
};

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || `localhost:${port}`}`);

  if (requestUrl.pathname === '/api/mission-translate' && req.method === 'POST') {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        req.destroy();
      }
    });

    req.on('end', () => {
      let body;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON payload.' });
        return;
      }

      const mission = typeof body.mission === 'string' ? body.mission.trim() : '';
      if (!mission) {
        sendJson(res, 400, { error: 'Field "mission" is required.' });
        return;
      }

      const plan = heuristicMissionPlan(mission);
      sendJson(res, 200, plan);
    });

    return;
  }

  if (requestUrl.pathname === '/api/mission-translate' && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  serveStatic(req, res, requestUrl.pathname);
});

server.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}`);
});
