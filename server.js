const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');

const host = '0.0.0.0';
const port = Number(process.env.PORT || 4173);
const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const rootDir = __dirname;
const defaultDataDir = isProduction
  ? '/var/lib/leelayer'
  : path.join(rootDir, 'data');
const dataDir = path.resolve(process.env.DATA_DIR || defaultDataDir);
const uploadsDir = path.join(dataDir, 'uploads');
const dbPath = path.join(dataDir, 'orders.db');
const openAiApiKey = process.env.OPENAI_API_KEY;
const openAiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const reviewKey = process.env.REVIEW_KEY || 'local-review';
const maxJsonBodyBytes = Number(process.env.MAX_JSON_BODY_BYTES || 12 * 1024 * 1024);
const maxUploadBytes = Number(process.env.MAX_UPLOAD_BYTES || 8 * 1024 * 1024);
const adminUsername = process.env.ADMIN_USERNAME || '';
const adminPassword = process.env.ADMIN_PASSWORD || '';
const orderTokenSecret = process.env.ORDER_TOKEN_SECRET || '';

if (isProduction && reviewKey === 'local-review') {
  throw new Error('REVIEW_KEY must be set to a strong value in production.');
}

if (isProduction && !orderTokenSecret) {
  throw new Error('ORDER_TOKEN_SECRET must be set in production.');
}

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


const materialRatePerGram = {
  PLA: 0.09,
  PETG: 0.13,
  ABS: 0.15,
  TPU: 0.18,
};

const finishMultiplier = {
  standard: 1,
  premium: 1.2,
};

const colorMultiplier = {
  standard: 1,
  matte: 1.06,
  silk: 1.12,
  translucent: 1.16,
};

const layerDetailMultiplier = {
  draft: 0.92,
  balanced: 1,
  fine: 1.16,
};

const infillMultiplier = {
  light: 0.94,
  standard: 1,
  strong: 1.12,
  max: 1.24,
};

const supportLevelMultiplier = {
  minimal: 0.96,
  standard: 1,
  complex: 1.14,
};

const promoCodes = {
  WELCOME10: 0.1,
  MAKER5: 0.05,
};

const rushMultiplier = 1.35;
const designHelpFee = 12;
const allowedUploadMimeTypes = new Set([
  'application/sla',
  'model/stl',
  'application/vnd.ms-pki.stl',
  'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
  'application/octet-stream',
]);
const allowedUploadExtensions = new Set(['.stl', '.3mf', '.obj']);
const orderTokenSecretRuntime = orderTokenSecret || crypto.randomBytes(32).toString('hex');

const createOrderId = () => `ML-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
const createAccessToken = () => crypto.randomBytes(24).toString('base64url');
const hashAccessToken = (token) => crypto.createHash('sha256').update(`${orderTokenSecretRuntime}:${String(token || '')}`).digest('hex');

const getClientIp = (req) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
};

const rateLimits = new Map();
const checkRateLimit = (req, bucket, { limit, windowMs }) => {
  const ip = getClientIp(req);
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const current = rateLimits.get(key);
  if (!current || current.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (current.count >= limit) {
    return false;
  }

  current.count += 1;
  return true;
};

const buildSecurityHeaders = (req, contentType = '') => {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };

  if (contentType.includes('text/html')) {
    headers['Content-Security-Policy'] = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
  }

  const proto = String(req.headers['x-forwarded-proto'] || '');
  if (proto === 'https') {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';
  }

  return headers;
};

const safeParsePositiveNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
};

const computeServerQuote = (input) => {
  const material = allowedMaterials.has(input?.material) ? input.material : 'PLA';
  const finish = allowedFinishes.has(input?.finish) ? input.finish : 'standard';
  const colorProfile = allowedColorProfiles.has(input?.colorProfile) ? input.colorProfile : 'standard';
  const layerDetail = ['draft', 'balanced', 'fine'].includes(input?.layerDetail) ? input.layerDetail : 'balanced';
  const infillDensity = ['light', 'standard', 'strong', 'max'].includes(input?.infillDensity) ? input.infillDensity : 'standard';
  const supportLevel = ['minimal', 'standard', 'complex'].includes(input?.supportLevel) ? input.supportLevel : 'standard';
  const delivery = input?.delivery === 'pickup' ? 'pickup' : 'ship';
  const quantity = Math.max(1, Math.round(safeParsePositiveNumber(input?.quantity, 1)));
  const weight = Math.max(1, safeParsePositiveNumber(input?.weight, 1));
  const rush = Boolean(input?.rush);
  const designHelp = Boolean(input?.designHelp);
  const promoCode = String(input?.promoCode || '').trim().toUpperCase();

  const baseUnit = Math.max(5, weight * materialRatePerGram[material]);
  const unitWithColor = baseUnit * colorMultiplier[colorProfile];
  const unitWithFinish = unitWithColor * finishMultiplier[finish];
  const unitWithDetail = unitWithFinish * layerDetailMultiplier[layerDetail];
  const unitWithInfill = unitWithDetail * infillMultiplier[infillDensity];
  const customizedUnit = unitWithInfill * supportLevelMultiplier[supportLevel];
  const rushFee = rush ? customizedUnit * (rushMultiplier - 1) * quantity : 0;
  const printCost = customizedUnit * quantity;
  const designReviewFee = designHelp ? designHelpFee : 0;
  const subtotal = printCost + rushFee + designReviewFee;
  const setupHelpFee = subtotal < 25 ? 4 : 0;
  const shipping = delivery === 'pickup' ? 0 : subtotal >= 90 ? 0 : 8;
  const discountRate = promoCodes[promoCode] ?? 0;
  const discount = subtotal * discountRate;
  const total = subtotal + setupHelpFee + shipping - discount;

  const leadTimeDays = rush
    ? 'about 1–2 business days'
    : finish === 'premium'
      ? 'about 4–6 business days'
      : 'about 2–4 business days';

  return {
    material,
    colorProfile,
    quantity,
    weight,
    finish,
    layerDetail,
    infillDensity,
    supportLevel,
    delivery,
    useCase: allowedUseCases.has(input?.useCase) ? input.useCase : 'prototype',
    rush,
    designHelp,
    promoCode,
    leadTimeDays,
    fileText: String(input?.fileText || '').slice(0, 2000),
    printCost: Number(printCost.toFixed(2)),
    rushFee: Number(rushFee.toFixed(2)),
    designReviewFee: Number(designReviewFee.toFixed(2)),
    setupHelpFee: Number(setupHelpFee.toFixed(2)),
    shipping: Number(shipping.toFixed(2)),
    discount: Number(discount.toFixed(2)),
    total: Number(total.toFixed(2)),
    projectName: String(input?.projectName || '').trim().slice(0, 120) || 'Untitled project',
  };
};

const sanitizeOrderForClient = (order) => {
  if (!order || typeof order !== 'object') {
    return order;
  }

  const copy = JSON.parse(JSON.stringify(order));
  delete copy.accessTokenHash;
  if (copy.uploadedFile && typeof copy.uploadedFile === 'object') {
    delete copy.uploadedFile.storedFileName;
  }
  return copy;
};
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

  if (buffer.length > maxUploadBytes) {
    throw new Error(`Uploaded file exceeds ${Math.round(maxUploadBytes / (1024 * 1024))}MB limit.`);
  }

  const extension = path.extname(originalName).toLowerCase();
  if (!allowedUploadExtensions.has(extension)) {
    throw new Error('Unsupported file type. Allowed: STL, 3MF, OBJ.');
  }

  if (!allowedUploadMimeTypes.has(mimeType)) {
    throw new Error('Unsupported upload MIME type.');
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

const createOrder = ({ id, orderDetails, mission, customerEmail, uploadedFile, accessTokenHash }) => {
  const safeId = typeof id === 'string' && id ? id : createOrderId();
  const now = new Date().toISOString();
  const order = {
    id: safeId,
    status: 'file_review',
    note: 'Order confirmed. File review has started and we will update you soon.',
    createdAt: now,
    updatedAt: now,
    orderDetails,
    mission,
    customerEmail,
    uploadedFile,
    accessTokenHash,
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


const hasOrderReviewAccess = (req) => {
  const key = req.headers['x-review-key'];
  if (key === reviewKey) {
    return true;
  }

  return isAdminAuthorized(req);
};

const hasOrderReadAccess = (req, order) => {
  if (hasOrderReviewAccess(req)) {
    return true;
  }

  const headerToken = req.headers['x-order-token'];
  const queryToken = new URL(req.url, `http://${req.headers.host || `localhost:${port}`}`).searchParams.get('token');
  const providedToken = String(headerToken || queryToken || '');
  if (!providedToken || !order?.accessTokenHash) {
    return false;
  }

  const providedHash = hashAccessToken(providedToken);
  return safeEqual(providedHash, order.accessTokenHash);
};

const requireAdminAccess = (req, res) => {
  if (!adminUsername || !adminPassword) {
    res.writeHead(404, buildSecurityHeaders(req));
    res.end('Not found');
    return false;
  }

  if (!isAdminAuthorized(req)) {
    res.writeHead(401, {
      ...buildSecurityHeaders(req),
      'WWW-Authenticate': 'Basic realm="LeeLayer Admin", charset="UTF-8"',
    });
    res.end('Unauthorized');
    return false;
  }

  return true;
};

const sendJson = (req, res, statusCode, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    ...buildSecurityHeaders(req, 'application/json; charset=utf-8'),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
};

const serveStatic = (req, res, pathname) => {
  const safePath = pathname === '/' ? '/index.html' : pathname;

  if (safePath.startsWith('/data/') || safePath === '/data' || safePath.includes('/.')) {
    res.writeHead(404, buildSecurityHeaders(req));
    res.end('Not found');
    return;
  }
  const resolved = path.resolve(rootDir, `.${safePath}`);

  if (!resolved.startsWith(rootDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(resolved, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      res.writeHead(404, buildSecurityHeaders(req));
      res.end('Not found');
      return;
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { ...buildSecurityHeaders(req, contentType), 'Content-Type': contentType });

    const stream = fs.createReadStream(resolved);
    stream.pipe(res);
    stream.on('error', () => {
      res.writeHead(500, buildSecurityHeaders(req));
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
    serveStatic(req, res, target);
    return;
  }

  if (requestUrl.pathname === '/api/orders' && req.method === 'GET') {
    if (!checkRateLimit(req, 'orders-list', { limit: 120, windowMs: 15 * 60 * 1000 })) {
      sendJson(req, res, 429, { error: 'Too many requests. Please try again shortly.' });
      return;
    }
    if (!hasOrderReviewAccess(req)) {
      sendJson(req, res, 401, { error: 'Unauthorized.' });
      return;
    }

    sendJson(req, res, 200, { orders: getAllOrders() });
    return;
  }

  if (requestUrl.pathname === '/api/orders' && req.method === 'POST') {
    if (!checkRateLimit(req, 'orders-create', { limit: 40, windowMs: 15 * 60 * 1000 })) {
      sendJson(req, res, 429, { error: 'Too many requests. Please try again shortly.' });
      return;
    }
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
        sendJson(req, res, 413, { error: 'Payload too large. Reduce file size and try again.' });
        return;
      }

      let body;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        sendJson(req, res, 400, { error: 'Invalid JSON payload.' });
        return;
      }

      const incomingOrderDetails = body.order || body.quote;
      if (!incomingOrderDetails || typeof incomingOrderDetails !== 'object') {
        sendJson(req, res, 400, { error: 'Field "order" is required.' });
        return;
      }

      const mission = typeof body.mission === 'string' ? body.mission.trim().slice(0, 2000) : '';
      const customerEmail = typeof body.customerEmail === 'string' ? body.customerEmail.trim().slice(0, 254) : '';
      const computedOrderDetails = computeServerQuote(incomingOrderDetails);
      const orderId = createOrderId();
      let uploadedFile;
      try {
        uploadedFile = saveOrderUpload(orderId, body.modelFile);
      } catch (uploadError) {
        sendJson(req, res, 400, { error: uploadError?.message || 'Invalid upload payload.' });
        return;
      }

      const accessToken = createAccessToken();
      const order = createOrder({
        id: orderId,
        orderDetails: computedOrderDetails,
        mission,
        customerEmail,
        uploadedFile,
        accessTokenHash: hashAccessToken(accessToken),
      });

      sendJson(req, res, 201, {
        order: sanitizeOrderForClient(order),
        accessToken,
      });
    });

    return;
  }

  const orderMatch = requestUrl.pathname.match(/^\/api\/orders\/([A-Za-z0-9-]+)$/);
  if (orderMatch && req.method === 'GET') {
    if (!checkRateLimit(req, 'order-read', { limit: 180, windowMs: 15 * 60 * 1000 })) {
      sendJson(req, res, 429, { error: 'Too many requests. Please try again shortly.' });
      return;
    }

    const order = getOrderById(orderMatch[1]);
    if (!order) {
      sendJson(req, res, 404, { error: 'Order not found.' });
      return;
    }

    if (!hasOrderReadAccess(req, order)) {
      sendJson(req, res, 401, { error: 'Unauthorized.' });
      return;
    }

    sendJson(req, res, 200, { order: sanitizeOrderForClient(order) });
    return;
  }

  const orderStatusMatch = requestUrl.pathname.match(/^\/api\/orders\/([A-Za-z0-9-]+)\/status$/);
  if (orderStatusMatch && req.method === 'PATCH') {
    if (!checkRateLimit(req, 'order-status', { limit: 120, windowMs: 15 * 60 * 1000 })) {
      sendJson(req, res, 429, { error: 'Too many requests. Please try again shortly.' });
      return;
    }
    if (!hasOrderReviewAccess(req)) {
      sendJson(req, res, 401, { error: 'Unauthorized.' });
      return;
    }

    const order = getOrderById(orderStatusMatch[1]);
    if (!order) {
      sendJson(req, res, 404, { error: 'Order not found.' });
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
        sendJson(req, res, 400, { error: 'Invalid JSON payload.' });
        return;
      }

      const allowed = new Set(['file_review', 'fully_confirmed', 'canceled']);
      if (!allowed.has(body.status)) {
        sendJson(req, res, 400, { error: 'Invalid status.' });
        return;
      }

      updateOrderStatus(order, body.status, body.note);
      sendJson(req, res, 200, { order: sanitizeOrderForClient(order) });
    });

    return;
  }


  const orderFileMatch = requestUrl.pathname.match(/^\/api\/orders\/([A-Za-z0-9-]+)\/file$/);
  if (orderFileMatch && req.method === 'GET') {
    if (!checkRateLimit(req, 'order-file', { limit: 80, windowMs: 15 * 60 * 1000 })) {
      sendJson(req, res, 429, { error: 'Too many requests. Please try again shortly.' });
      return;
    }
    if (!hasOrderReviewAccess(req)) {
      sendJson(req, res, 401, { error: 'Unauthorized.' });
      return;
    }

    const order = getOrderById(orderFileMatch[1]);
    if (!order) {
      sendJson(req, res, 404, { error: 'Order not found.' });
      return;
    }

    const file = readOrderUpload(order);
    if (!file) {
      sendJson(req, res, 404, { error: 'Uploaded file not found for this order.' });
      return;
    }

    const stream = fs.createReadStream(file.absolutePath);
    const escapedName = encodeURIComponent(file.originalName).replace(/%20/g, '_');
    res.writeHead(200, {
      ...buildSecurityHeaders(req, file.mimeType),
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${escapedName}"`,
      'Cache-Control': 'no-store',
    });
    stream.pipe(res);
    stream.on('error', () => {
      res.writeHead(500, buildSecurityHeaders(req));
      res.end('File download failed.');
    });
    return;
  }

  if (requestUrl.pathname === '/api/mission-translate' && req.method === 'POST') {
    if (!checkRateLimit(req, 'mission-translate', { limit: 50, windowMs: 15 * 60 * 1000 })) {
      sendJson(req, res, 429, { error: 'Too many requests. Please try again shortly.' });
      return;
    }
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
        sendJson(req, res, 413, { error: 'Payload too large.' });
        return;
      }

      let body;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        sendJson(req, res, 400, { error: 'Invalid JSON payload.' });
        return;
      }

      const mission = typeof body.mission === 'string' ? body.mission.trim() : '';
      if (!mission) {
        sendJson(req, res, 400, { error: 'Field "mission" is required.' });
        return;
      }

      try {
        const plan = await getMissionPlan(mission);
        sendJson(req, res, 200, plan);
      } catch {
        sendJson(req, res, 500, { error: 'Mission translation failed.' });
      }
    });

    return;
  }

  if (requestUrl.pathname === '/api/mission-translate' && req.method !== 'POST') {
    sendJson(req, res, 405, { error: 'Method not allowed.' });
    return;
  }

  serveStatic(req, res, requestUrl.pathname);
});

server.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}`);
  console.log(openAiApiKey
    ? `OpenAI integration enabled (model: ${openAiModel}).`
    : 'OpenAI integration disabled (set OPENAI_API_KEY to enable).');
  console.log('Order review API ready (REVIEW_KEY configured).');
  console.log(`Data directory: ${dataDir}`);
  console.log(`Order storage ready at ${dbPath}.`);
  console.log(`Upload storage ready at ${uploadsDir}.`);
  console.log(adminUsername && adminPassword
    ? 'Admin page protection enabled (HTTP Basic auth).'
    : 'Admin page disabled until ADMIN_USERNAME and ADMIN_PASSWORD are set.');
});
