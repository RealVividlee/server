const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const host = '0.0.0.0';
const port = Number(process.env.PORT || 4173);
const rootDir = __dirname;
const openAiApiKey = process.env.OPENAI_API_KEY;
const openAiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const reviewKey = process.env.REVIEW_KEY || 'local-review';
const orders = new Map();
let nextOrderNumber = 1;


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

const allowedMaterials = new Set(['PLA', 'PETG', 'ABS', 'TPU']);
const allowedFinishes = new Set(['standard', 'premium']);
const allowedColorProfiles = new Set(['standard', 'matte', 'silk', 'translucent']);
const allowedUseCases = new Set(['prototype', 'display', 'replacement', 'gift']);

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

const sanitizePlan = (plan, fallbackReason) => {
  const material = allowedMaterials.has(plan?.material) ? plan.material : 'PLA';
  const finish = allowedFinishes.has(plan?.finish) ? plan.finish : 'standard';
  const colorProfile = allowedColorProfiles.has(plan?.colorProfile) ? plan.colorProfile : 'standard';
  const useCase = allowedUseCases.has(plan?.useCase) ? plan.useCase : 'prototype';

  return {
    material,
    finish,
    colorProfile,
    rush: Boolean(plan?.rush),
    designHelp: Boolean(plan?.designHelp),
    useCase,
    reasons: Array.isArray(plan?.reasons) && plan.reasons.length > 0
      ? plan.reasons.filter((reason) => typeof reason === 'string').slice(0, 4)
      : [fallbackReason],
  };
};

const fetchOpenAiPlan = async (mission) => {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model: openAiModel,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a print job planner. Return ONLY JSON with keys: material, finish, colorProfile, rush, designHelp, useCase, reasons. material must be one of PLA, PETG, ABS, TPU. finish must be standard or premium. colorProfile must be standard, matte, silk, or translucent. useCase must be prototype, display, replacement, or gift. reasons must be a short array of plain-English strings.',
        },
        {
          role: 'user',
          content: `Mission: ${mission}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    let message = `OpenAI request failed (${response.status}).`;

    try {
      const parsedError = JSON.parse(body);
      const apiMessage = parsedError?.error?.message;
      if (typeof apiMessage === 'string' && apiMessage.trim()) {
        if (response.status === 429) {
          message = 'OpenAI quota exceeded or billing not active.';
        } else {
          message = `OpenAI error: ${apiMessage.trim().slice(0, 120)}`;
        }
      }
    } catch {
      // keep generic message
    }

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI response did not include message content.');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('OpenAI content was not valid JSON.');
  }

  return sanitizePlan(parsed, 'OpenAI returned an incomplete plan; using safe defaults.');
};

const getMissionPlan = async (mission) => {
  if (!openAiApiKey) {
    const fallback = heuristicMissionPlan(mission);
    return {
      ...fallback,
      reasons: [...fallback.reasons, 'OPENAI_API_KEY not configured, using local rules fallback.'],
    };
  }

  try {
    return await fetchOpenAiPlan(mission);
  } catch (error) {
    const fallback = heuristicMissionPlan(mission);
    const status = Number(error?.status);
    let reason = 'OpenAI was unavailable, using local rules fallback.';

    if (status === 429) {
      reason = 'OpenAI quota limit reached. Check billing/usage, then retry.';
    } else if (status === 401) {
      reason = 'OpenAI API key is invalid or unauthorized.';
    } else if (status === 403) {
      reason = 'OpenAI access is forbidden for this key/project.';
    }

    return {
      ...fallback,
      reasons: [...fallback.reasons, reason],
    };
  }
};

const createOrder = ({ quote, mission, customerEmail }) => {
  const id = `ML-${String(nextOrderNumber).padStart(4, '0')}`;
  nextOrderNumber += 1;

  const now = new Date().toISOString();
  const order = {
    id,
    status: 'file_review',
    note: 'Quote confirmed. File review has started and we will update you soon.',
    createdAt: now,
    updatedAt: now,
    quote,
    mission,
    customerEmail,
  };

  orders.set(id, order);
  return order;
};

const updateOrderStatus = (order, status, note) => {
  order.status = status;
  order.note = typeof note === 'string' && note.trim()
    ? note.trim()
    : status === 'fully_confirmed'
      ? 'File review complete. Your quote is now fully confirmed.'
      : status === 'canceled'
        ? 'Order canceled.'
        : 'File review in progress.';
  order.updatedAt = new Date().toISOString();
};

const sendJson = (res, statusCode, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
};

const serveStatic = (res, pathname) => {
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

  if (requestUrl.pathname === '/api/orders' && req.method === 'GET') {
    const allOrders = [...orders.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    sendJson(res, 200, { orders: allOrders });
    return;
  }

  if (requestUrl.pathname === '/api/orders' && req.method === 'POST') {
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

      if (!body.quote || typeof body.quote !== 'object') {
        sendJson(res, 400, { error: 'Field "quote" is required.' });
        return;
      }

      const order = createOrder({
        quote: body.quote,
        mission: typeof body.mission === 'string' ? body.mission.trim() : '',
        customerEmail: typeof body.customerEmail === 'string' ? body.customerEmail.trim() : '',
      });

      sendJson(res, 201, { order });
    });

    return;
  }

  const orderMatch = requestUrl.pathname.match(/^\/api\/orders\/([A-Za-z0-9-]+)$/);
  if (orderMatch && req.method === 'GET') {
    const order = orders.get(orderMatch[1]);
    if (!order) {
      sendJson(res, 404, { error: 'Order not found.' });
      return;
    }

    sendJson(res, 200, { order });
    return;
  }

  const orderStatusMatch = requestUrl.pathname.match(/^\/api\/orders\/([A-Za-z0-9-]+)\/status$/);
  if (orderStatusMatch && req.method === 'PATCH') {
    const key = req.headers['x-review-key'];
    if (key !== reviewKey) {
      sendJson(res, 401, { error: 'Unauthorized.' });
      return;
    }

    const order = orders.get(orderStatusMatch[1]);
    if (!order) {
      sendJson(res, 404, { error: 'Order not found.' });
      return;
    }

    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });

    req.on('end', () => {
      let body;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON payload.' });
        return;
      }

      const allowed = new Set(['file_review', 'fully_confirmed', 'canceled']);
      if (!allowed.has(body.status)) {
        sendJson(res, 400, { error: 'Invalid status.' });
        return;
      }

      updateOrderStatus(order, body.status, body.note);
      sendJson(res, 200, { order });
    });

    return;
  }

  if (requestUrl.pathname === '/api/mission-translate' && req.method === 'POST') {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        req.destroy();
      }
    });

    req.on('end', async () => {
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

      try {
        const plan = await getMissionPlan(mission);
        sendJson(res, 200, plan);
      } catch {
        sendJson(res, 500, { error: 'Mission translation failed.' });
      }
    });

    return;
  }

  if (requestUrl.pathname === '/api/mission-translate' && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  serveStatic(res, requestUrl.pathname);
});

server.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}`);
  console.log(openAiApiKey
    ? `OpenAI integration enabled (model: ${openAiModel}).`
    : 'OpenAI integration disabled (set OPENAI_API_KEY to enable).');
  console.log(`Order review API ready (set REVIEW_KEY, current default: ${reviewKey}).`);
});
