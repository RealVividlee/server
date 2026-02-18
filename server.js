const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');

const host = '0.0.0.0';
const port = Number(process.env.PORT || 4173);
const rootDir = __dirname;
const dataDir = path.join(rootDir, 'data');
const uploadsDir = path.join(dataDir, 'uploads');
const dbPath = path.join(dataDir, 'orders.db');
const openAiApiKey = process.env.OPENAI_API_KEY;
const openAiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const reviewKey = process.env.REVIEW_KEY || 'local-review';
const maxJsonBodyBytes = Number(process.env.MAX_JSON_BODY_BYTES || 12 * 1024 * 1024);
const adminUsername = process.env.ADMIN_USERNAME || '';
const adminPassword = process.env.ADMIN_PASSWORD || '';

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
  )
`);

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

const getNextOrderNumber = () => {
  const row = db.prepare("SELECT id FROM orders ORDER BY CAST(SUBSTR(id, 4) AS INTEGER) DESC LIMIT 1").get();
  if (!row?.id) {
    return 1;
  }

  const numeric = Number(String(row.id).replace('ML-', ''));
  return Number.isFinite(numeric) ? numeric + 1 : 1;
};

let nextOrderNumber = getNextOrderNumber();

const persistOrder = (order) => {
  db.prepare(`
    INSERT INTO orders (id, created_at, updated_at, payload_json)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      updated_at=excluded.updated_at,
      payload_json=excluded.payload_json
  `).run(order.id, order.createdAt, order.updatedAt, JSON.stringify(order));
};

const getOrderById = (id) => {
  const row = db.prepare('SELECT payload_json FROM orders WHERE id = ?').get(id);
  if (!row?.payload_json) {
    return undefined;
  }

  try {
    return normalizeOrderShape(JSON.parse(row.payload_json));
  } catch {
    return undefined;
  }
};

const getAllOrders = () => {
  const rows = db.prepare('SELECT payload_json FROM orders ORDER BY created_at DESC').all();
  return rows
    .map((row) => {
      try {
        return normalizeOrderShape(JSON.parse(row.payload_json));
      } catch {
        return undefined;
      }
    })
    .filter(Boolean);
};


const normalizeOrderShape = (order) => {
  if (!order || typeof order !== 'object') {
    return order;
  }

  if (!order.orderDetails && order.quote) {
    order.orderDetails = order.quote;
  }

  if (order.quote) {
    delete order.quote;
  }

  if (order.receipt?.quoteSnapshot && !order.receipt.orderSnapshot) {
    order.receipt.orderSnapshot = order.receipt.quoteSnapshot;
    delete order.receipt.quoteSnapshot;
  }

  return order;
};


const toSafeBaseName = (value, fallback = 'upload.bin') => {
  const cleaned = String(value || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return cleaned || fallback;
};

const saveOrderUpload = (orderId, filePayload) => {
  if (!filePayload || typeof filePayload !== 'object') {
    return undefined;
  }

  const originalName = toSafeBaseName(filePayload.name, 'upload.bin');
  const mimeType = typeof filePayload.type === 'string' && filePayload.type.trim()
    ? filePayload.type.trim()
    : 'application/octet-stream';
  const base64 = typeof filePayload.base64 === 'string' ? filePayload.base64 : '';
  if (!base64) {
    return undefined;
  }

  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    return undefined;
  }

  if (!buffer.length) {
    return undefined;
  }

  const expectedSize = Number(filePayload.size || buffer.length);
  const storedFileName = `${orderId}-${Date.now()}-${originalName}`;
  const absolutePath = path.join(uploadsDir, storedFileName);
  fs.writeFileSync(absolutePath, buffer);

  return {
    originalName,
    mimeType,
    size: Number.isFinite(expectedSize) ? expectedSize : buffer.length,
    storedFileName,
  };
};

const readOrderUpload = (order) => {
  const file = order?.uploadedFile;
  if (!file?.storedFileName) {
    return undefined;
  }

  const absolutePath = path.join(uploadsDir, file.storedFileName);
  if (!fs.existsSync(absolutePath)) {
    return undefined;
  }

  return {
    absolutePath,
    originalName: file.originalName || 'download.bin',
    mimeType: file.mimeType || 'application/octet-stream',
  };
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

const createOrder = ({ orderDetails, mission, customerEmail, uploadedFile }) => {
  const id = `ML-${String(nextOrderNumber).padStart(4, '0')}`;
  nextOrderNumber += 1;

  const now = new Date().toISOString();
  const order = {
    id,
    status: 'file_review',
    note: 'Order confirmed. File review has started and we will update you soon.',
    createdAt: now,
    updatedAt: now,
    orderDetails,
    mission,
    customerEmail,
    uploadedFile,
  };

  persistOrder(order);
  return order;
};

const buildReceiptFromOrder = (order) => {
  const orderDetails = order.orderDetails || order.quote || {};
  const printCost = Number(orderDetails.printCost || 0);
  const rushFee = Number(orderDetails.rushFee || 0);
  const designReviewFee = Number(orderDetails.designReviewFee || 0);
  const setupFee = Number(orderDetails.setupHelpFee || 0);
  const shipping = Number(orderDetails.shipping || 0);
  const promoDiscount = Number(orderDetails.discount || 0);

  const subtotal = printCost + rushFee + designReviewFee + setupFee + shipping - promoDiscount;
  const taxRate = 0;
  const tax = subtotal * taxRate;
  const total = typeof orderDetails.total === 'number' ? orderDetails.total : subtotal + tax;

  return {
    receiptId: `RCPT-${order.id}`,
    issuedAt: new Date().toISOString(),
    orderId: order.id,
    customerEmail: order.customerEmail || 'not_provided',
    lineItems: [
      { label: 'Print cost', amount: printCost },
      { label: 'Rush fee', amount: rushFee },
      { label: 'Design review', amount: designReviewFee },
      { label: 'Setup fee', amount: setupFee },
      { label: 'Shipping', amount: shipping },
      { label: 'Promo discount', amount: -promoDiscount },
    ],
    taxRate,
    tax,
    subtotal,
    total,
    orderSnapshot: {
      projectName: orderDetails.projectName,
      material: orderDetails.material,
      colorProfile: orderDetails.colorProfile,
      quantity: orderDetails.quantity,
      weight: orderDetails.weight,
      finish: orderDetails.finish,
      layerDetail: orderDetails.layerDetail,
      infillDensity: orderDetails.infillDensity,
      supportLevel: orderDetails.supportLevel,
      delivery: orderDetails.delivery,
      useCase: orderDetails.useCase,
      rush: orderDetails.rush,
      designHelp: orderDetails.designHelp,
      promoCode: orderDetails.promoCode,
      leadTimeDays: orderDetails.leadTimeDays,
      fileText: orderDetails.fileText,
      mission: order.mission || '',
    },
  };
};

const updateOrderStatus = (order, status, note) => {
  order.status = status;
  order.note = typeof note === 'string' && note.trim()
    ? note.trim()
    : status === 'fully_confirmed'
      ? 'File review complete. Your order is now fully confirmed.'
      : status === 'canceled'
        ? 'Order canceled.'
        : 'File review in progress.';
  order.updatedAt = new Date().toISOString();

  if (status === 'fully_confirmed') {
    order.receipt = buildReceiptFromOrder(order);
  }

  if (status === 'canceled') {
    order.receipt = undefined;
  }

  persistOrder(order);
};


const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const isAdminAuthorized = (req) => {
  if (!adminUsername || !adminPassword) {
    return false;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Basic ')) {
    return false;
  }

  let decoded;
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    return false;
  }

  const separator = decoded.indexOf(':');
  if (separator < 0) {
    return false;
  }

  const username = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);

  return safeEqual(username, adminUsername) && safeEqual(password, adminPassword);
};

const requireAdminAccess = (req, res) => {
  if (!adminUsername || !adminPassword) {
    res.writeHead(404);
    res.end('Not found');
    return false;
  }

  if (!isAdminAuthorized(req)) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="LeeLayer Admin", charset="UTF-8"',
    });
    res.end('Unauthorized');
    return false;
  }

  return true;
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

  const adminPaths = new Set(['/admin', '/admin.html', '/admin.js']);
  if (adminPaths.has(requestUrl.pathname)) {
    if (!requireAdminAccess(req, res)) {
      return;
    }

    const target = requestUrl.pathname === '/admin' ? '/admin.html' : requestUrl.pathname;
    serveStatic(res, target);
    return;
  }

  if (requestUrl.pathname === '/api/orders' && req.method === 'GET') {
    const key = req.headers['x-review-key'];
    if (key !== reviewKey) {
      sendJson(res, 401, { error: 'Unauthorized.' });
      return;
    }

    sendJson(res, 200, { orders: getAllOrders() });
    return;
  }

  if (requestUrl.pathname === '/api/orders' && req.method === 'POST') {
    let raw = '';
    let tooLarge = false;

    req.on('data', (chunk) => {
      if (tooLarge) {
        return;
      }

      raw += chunk;
      if (raw.length > maxJsonBodyBytes) {
        tooLarge = true;
      }
    });

    req.on('end', () => {
      if (tooLarge) {
        sendJson(res, 413, { error: 'Payload too large. Reduce file size and try again.' });
        return;
      }

      let body;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON payload.' });
        return;
      }

      const incomingOrderDetails = body.order || body.quote;
      if (!incomingOrderDetails || typeof incomingOrderDetails !== 'object') {
        sendJson(res, 400, { error: 'Field "order" is required.' });
        return;
      }

      const mission = typeof body.mission === 'string' ? body.mission.trim() : '';
      const customerEmail = typeof body.customerEmail === 'string' ? body.customerEmail.trim() : '';
      const tentativeOrderId = `ML-${String(nextOrderNumber).padStart(4, '0')}`;
      const uploadedFile = saveOrderUpload(tentativeOrderId, body.modelFile);

      const order = createOrder({
        orderDetails: incomingOrderDetails,
        mission,
        customerEmail,
        uploadedFile,
      });

      sendJson(res, 201, { order });
    });

    return;
  }

  const orderMatch = requestUrl.pathname.match(/^\/api\/orders\/([A-Za-z0-9-]+)$/);
  if (orderMatch && req.method === 'GET') {
    const order = getOrderById(orderMatch[1]);
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

    const order = getOrderById(orderStatusMatch[1]);
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


  const orderFileMatch = requestUrl.pathname.match(/^\/api\/orders\/([A-Za-z0-9-]+)\/file$/);
  if (orderFileMatch && req.method === 'GET') {
    const key = req.headers['x-review-key'];
    if (key !== reviewKey) {
      sendJson(res, 401, { error: 'Unauthorized.' });
      return;
    }

    const order = getOrderById(orderFileMatch[1]);
    if (!order) {
      sendJson(res, 404, { error: 'Order not found.' });
      return;
    }

    const file = readOrderUpload(order);
    if (!file) {
      sendJson(res, 404, { error: 'Uploaded file not found for this order.' });
      return;
    }

    const stream = fs.createReadStream(file.absolutePath);
    const escapedName = encodeURIComponent(file.originalName).replace(/%20/g, '_');
    res.writeHead(200, {
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${escapedName}"`,
    });
    stream.pipe(res);
    stream.on('error', () => {
      res.writeHead(500);
      res.end('File download failed.');
    });
    return;
  }

  if (requestUrl.pathname === '/api/mission-translate' && req.method === 'POST') {
    let raw = '';
    let tooLarge = false;

    req.on('data', (chunk) => {
      if (tooLarge) {
        return;
      }

      raw += chunk;
      if (raw.length > maxJsonBodyBytes) {
        tooLarge = true;
      }
    });

    req.on('end', async () => {
      if (tooLarge) {
        sendJson(res, 413, { error: 'Payload too large.' });
        return;
      }

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
  console.log(`Order storage ready at ${dbPath}.`);
  console.log(`Upload storage ready at ${uploadsDir}.`);
  console.log(adminUsername && adminPassword
    ? 'Admin page protection enabled (HTTP Basic auth).'
    : 'Admin page disabled until ADMIN_USERNAME and ADMIN_PASSWORD are set.');
});
