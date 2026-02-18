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
  custom: 1.2,
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
const draftStorageKey = 'maple-layer-quote-draft-v1';
const draftSaveDebounceMs = 250;

const form = document.getElementById('quote-form');
const estimatePreview = document.getElementById('live-estimate-value');
const estimateTimeline = document.getElementById('live-estimate-time');
const estimateMeta = document.getElementById('live-estimate-meta');
const liveBreakdown = document.getElementById('live-breakdown');
const optionCards = document.getElementById('option-cards');
const missionInput = document.getElementById('missionInput');
const missionResult = document.getElementById('missionResult');
const missionMode = document.getElementById('missionMode');
const missionSource = document.getElementById('missionSource');
const translateMissionButton = document.getElementById('translateMission');
const applyMissionOptionButton = document.getElementById('applyMissionOption');
const draftStatus = document.getElementById('draft-status');
const promoStatus = document.getElementById('promo-status');
const clearDraftButton = document.getElementById('clearDraft');
const rushCheckbox = document.getElementById('rush');
const designHelpCheckbox = document.getElementById('designHelp');
const promoInput = document.getElementById('promoCode');
const year = document.getElementById('year');

const projectNameInput = document.getElementById('projectName');
const materialInput = document.getElementById('material');
const colorProfileInput = document.getElementById('colorProfile');
const quantityInput = document.getElementById('quantity');
const weightInput = document.getElementById('weight');
const finishInput = document.getElementById('finish');
const layerDetailInput = document.getElementById('layerDetail');
const infillDensityInput = document.getElementById('infillDensity');
const supportLevelInput = document.getElementById('supportLevel');
const useCaseInput = document.getElementById('useCase');
const emailInput = document.getElementById('email');
const modelFileInput = document.getElementById('modelFile');

let draftSaveTimeout;
let translatedMissionPlan;
let aiEndpointStatus = 'unknown';
let currentOrderId;


year.textContent = new Date().getFullYear();

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const getDeliveryValue = () => {
  const selected = document.querySelector('input[name="delivery"]:checked');
  return selected ? selected.value : 'ship';
};

const getFormValues = () => ({
  projectName: projectNameInput.value.trim(),
  material: materialInput.value,
  colorProfile: colorProfileInput.value,
  quantity: Number(quantityInput.value),
  weight: Number(weightInput.value),
  finish: finishInput.value,
  layerDetail: layerDetailInput.value,
  infillDensity: infillDensityInput.value,
  supportLevel: supportLevelInput.value,
  useCase: useCaseInput.value,
  delivery: getDeliveryValue(),
  hasUploadedFile: modelFileInput.files.length > 0,
  rush: rushCheckbox.checked,
  designHelp: designHelpCheckbox.checked,
  promoCode: promoInput.value.trim().toUpperCase(),
});

const updatePromoStatus = (promoCode) => {
  if (!promoCode) {
    promoStatus.textContent = 'Try WELCOME10 or MAKER5.';
    promoStatus.classList.remove('is-valid', 'is-invalid');
    return;
  }

  if (promoCodes[promoCode]) {
    promoStatus.textContent = `Promo applied: ${promoCode}.`;
    promoStatus.classList.add('is-valid');
    promoStatus.classList.remove('is-invalid');
    return;
  }

  promoStatus.textContent = `Promo code ${promoCode} is not recognized.`;
  promoStatus.classList.add('is-invalid');
  promoStatus.classList.remove('is-valid');
};

const calculateQuote = (overrides = {}) => {
  const values = { ...getFormValues(), ...overrides };

  if (!values.projectName || values.quantity <= 0 || values.weight <= 0 || Number.isNaN(values.quantity) || Number.isNaN(values.weight)) {
    return {
      isValid: false,
      promoCode: values.promoCode,
      message: 'Please enter a valid project name, quantity, and weight.',
    };
  }

  const baseUnit = Math.max(5, values.weight * materialRatePerGram[values.material]);
  const unitWithColor = baseUnit * colorMultiplier[values.colorProfile];
  const unitWithFinish = unitWithColor * finishMultiplier[values.finish];
  const unitWithDetail = unitWithFinish * layerDetailMultiplier[values.layerDetail];
  const unitWithInfill = unitWithDetail * infillMultiplier[values.infillDensity];
  const customizedUnit = unitWithInfill * supportLevelMultiplier[values.supportLevel];
  const rushFee = values.rush ? customizedUnit * (rushMultiplier - 1) * values.quantity : 0;
  const printCost = customizedUnit * values.quantity;
  const designReviewFee = values.designHelp ? designHelpFee : 0;
  const subtotal = printCost + rushFee + designReviewFee;
  const setupHelpFee = subtotal < 25 ? 4 : 0;
  const shipping = values.delivery === 'pickup' ? 0 : subtotal >= 90 ? 0 : 8;
  const discountRate = promoCodes[values.promoCode] ?? 0;
  const discount = subtotal * discountRate;
  const total = subtotal + setupHelpFee + shipping - discount;

  const leadTimeDays = values.rush
    ? 'about 1–2 business days'
    : values.finish === 'premium'
      ? 'about 4–6 business days'
      : 'about 2–4 business days';

  return {
    isValid: true,
    ...values,
    leadTimeDays,
    fileText: values.hasUploadedFile ? 'File received.' : 'No file uploaded yet.',
    printCost,
    rushFee,
    designReviewFee,
    setupHelpFee,
    shipping,
    discount,
    total,
    hasPromo: discountRate > 0,
  };
};

const setDraftStatus = (text) => {
  draftStatus.textContent = text;
};

const persistDraft = () => {
  const draft = {
    projectName: projectNameInput.value,
    material: materialInput.value,
    colorProfile: colorProfileInput.value,
    quantity: quantityInput.value,
    weight: weightInput.value,
    finish: finishInput.value,
    layerDetail: layerDetailInput.value,
    infillDensity: infillDensityInput.value,
    supportLevel: supportLevelInput.value,
    useCase: useCaseInput.value,
    delivery: getDeliveryValue(),
    email: emailInput.value,
    promoCode: promoInput.value,
    rush: rushCheckbox.checked,
    designHelp: designHelpCheckbox.checked,
    missionInput: missionInput.value,
    missionMode: missionMode.value,
    orderId: currentOrderId,
  };

  try {
    localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    setDraftStatus('Draft saved.');
  } catch {
    setDraftStatus('Could not save draft in this browser.');
  }
};

const scheduleDraftSave = () => {
  clearTimeout(draftSaveTimeout);
  draftSaveTimeout = setTimeout(persistDraft, draftSaveDebounceMs);
};

const loadDraft = () => {
  let rawDraft;
  try {
    rawDraft = localStorage.getItem(draftStorageKey);
  } catch {
    setDraftStatus('Draft storage is unavailable in this browser.');
    return;
  }

  if (!rawDraft) {
    return;
  }

  try {
    const draft = JSON.parse(rawDraft);
    projectNameInput.value = draft.projectName ?? '';
    materialInput.value = draft.material ?? 'PLA';
    colorProfileInput.value = draft.colorProfile ?? 'standard';
    quantityInput.value = draft.quantity ?? '1';
    weightInput.value = draft.weight ?? '60';
    finishInput.value = draft.finish ?? 'standard';
    layerDetailInput.value = draft.layerDetail ?? 'balanced';
    infillDensityInput.value = draft.infillDensity ?? 'standard';
    supportLevelInput.value = draft.supportLevel ?? 'standard';
    useCaseInput.value = draft.useCase ?? 'prototype';
    emailInput.value = draft.email ?? '';
    promoInput.value = draft.promoCode ?? '';
    rushCheckbox.checked = Boolean(draft.rush);
    designHelpCheckbox.checked = Boolean(draft.designHelp);
    missionInput.value = draft.missionInput ?? '';
    missionMode.value = draft.missionMode ?? 'auto';
    currentOrderId = draft.orderId;

    const delivery = draft.delivery === 'pickup' ? 'pickup' : 'ship';
    const deliveryInput = document.querySelector(`input[name="delivery"][value="${delivery}"]`);
    if (deliveryInput) {
      deliveryInput.checked = true;
    }

    setDraftStatus('Loaded your saved draft.');
  } catch {
    setDraftStatus('Could not load saved draft. Starting fresh.');
  }
};

const resetOptionCards = () => {
  if (!optionCards) {
    return;
  }

  optionCards.innerHTML = `
    <article class="option-card"><h4>Budget</h4><p>Add project details to generate options.</p></article>
    <article class="option-card"><h4>Balanced</h4><p>We will show speed/cost tradeoffs here.</p></article>
    <article class="option-card"><h4>Premium</h4><p>Best finish and support recommendations appear here.</p></article>`;
};

const updateMissionModeLabel = () => {
  if (missionMode.value === 'ai') {
    missionSource.textContent = 'Current mode: AI only';
    return;
  }

  if (missionMode.value === 'rules') {
    missionSource.textContent = 'Current mode: Rules only';
    return;
  }

  missionSource.textContent = 'Current mode: Auto (AI first, fallback to rules)';
};

const clearDraft = () => {
  try {
    localStorage.removeItem(draftStorageKey);
  } catch {
    // ignore storage removal failures
  }

  form.reset();
  const shipOption = document.querySelector('input[name="delivery"][value="ship"]');
  if (shipOption) {
    shipOption.checked = true;
  }

  missionMode.value = 'auto';
  resetOptionCards();
  missionResult.textContent = 'No mission translated yet.';
  updateMissionModeLabel();
  translatedMissionPlan = undefined;
  currentOrderId = undefined;

  setDraftStatus('Saved draft cleared.');
  renderLiveEstimate();
};

const renderLiveBreakdown = (quote) => {
  if (!quote.isValid) {
    liveBreakdown.innerHTML = '<li>Print cost: —</li><li>Setup fee: —</li><li>Shipping: —</li>';
    return;
  }

  const discountText = quote.hasPromo ? `-${currency.format(quote.discount)}` : 'none';
  liveBreakdown.innerHTML = `<li>Print cost: ${currency.format(quote.printCost)}</li>
    <li>Detail profile: ${quote.layerDetail}</li>
    <li>Infill profile: ${quote.infillDensity}</li>
    <li>Support profile: ${quote.supportLevel}</li>
    <li>Rush fee: ${currency.format(quote.rushFee)}</li>
    <li>Design review: ${currency.format(quote.designReviewFee)}</li>
    <li>Setup fee: ${currency.format(quote.setupHelpFee)}</li>
    <li>Shipping: ${currency.format(quote.shipping)}</li>
    <li>Promo discount: ${discountText}</li>`;
};

const generateOptions = () => {
  if (!optionCards) {
    return;
  }

  const base = calculateQuote();

  if (!base.isValid) {
    optionCards.innerHTML = '<article class="option-card"><h4>Need more info</h4><p>Enter project name, quantity, and weight first.</p></article>';
    return;
  }

  const options = [
    {
      name: 'Budget',
      quote: calculateQuote({ finish: 'standard', material: 'PLA', rush: false, designHelp: false, promoCode: '' }),
      note: 'Lowest cost path for quick validation and test parts.',
    },
    {
      name: 'Balanced',
      quote: calculateQuote({ finish: base.finish, material: base.material, rush: false, designHelp: false, promoCode: base.promoCode }),
      note: 'Keeps your selected material while avoiding rush or extra services.',
    },
    {
      name: 'Premium',
      quote: calculateQuote({ finish: 'premium', material: base.material === 'PLA' ? 'PETG' : base.material, rush: true, designHelp: true, promoCode: base.promoCode }),
      note: 'Best polish and turnaround with added review support.',
    },
  ];

  optionCards.innerHTML = options
    .map(({ name, quote, note }) => `<article class="option-card"><h4>${name}</h4><p class="option-price">${currency.format(quote.total)}</p><p>${quote.leadTimeDays}</p><p>${note}</p></article>`)
    .join('');
};

const heuristicMissionPlan = (text) => {
  const plan = {
    material: 'PLA',
    finish: 'standard',
    colorProfile: 'standard',
    rush: false,
    designHelp: false,
    useCase: 'prototype',
    reasons: [],
    source: 'rules',
  };

  if (text.includes('outdoor') || text.includes('sun') || text.includes('heat')) {
    plan.material = 'PETG';
    plan.reasons.push('Switched to PETG for better heat/outdoor durability.');
  }

  if (text.includes('detailed') || text.includes('clean') || text.includes('client') || text.includes('display')) {
    plan.finish = 'premium';
    plan.colorProfile = 'silk';
    plan.useCase = 'display';
    plan.reasons.push('Upgraded finish/color for presentation quality.');
  }

  if (text.includes('matte') || text.includes('non-gloss')) {
    plan.colorProfile = 'matte';
    plan.reasons.push('Applied matte color profile for low-glare appearance.');
  }

  if (text.includes('light') || text.includes('lantern') || text.includes('glow') || text.includes('see-through')) {
    plan.colorProfile = 'translucent';
    plan.reasons.push('Applied translucent profile for light-passing parts.');
  }

  if (text.includes('strong') || text.includes('load') || text.includes('weight') || text.includes('replacement')) {
    plan.material = plan.material === 'PLA' ? 'PETG' : plan.material;
    plan.useCase = 'replacement';
    plan.designHelp = true;
    plan.reasons.push('Enabled design review for structural reliability.');
  }

  if (text.includes('fast') || text.includes('urgent') || text.includes('tomorrow') || text.includes('asap')) {
    plan.rush = true;
    plan.reasons.push('Enabled rush production to reduce lead time.');
  }

  if (text.includes('gift')) {
    plan.useCase = 'gift';
  }

  return plan;
};

const fetchAiMissionPlan = async (text) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch('/api/mission-translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mission: text }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = new Error('AI endpoint unavailable');
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    const plan = {
      material: data.material,
      finish: data.finish,
      colorProfile: data.colorProfile,
      rush: Boolean(data.rush),
      designHelp: Boolean(data.designHelp),
      useCase: data.useCase,
      reasons: Array.isArray(data.reasons) ? data.reasons : ['AI recommendation received.'],
      source: 'ai',
    };

    if (!plan.material || !plan.finish || !plan.colorProfile || !plan.useCase) {
      throw new Error('AI response was incomplete');
    }

    return plan;
  } finally {
    clearTimeout(timeout);
  }
};

const translateMission = async () => {
  const text = missionInput.value.trim().toLowerCase();

  if (!text) {
    missionResult.textContent = 'Add a mission description first.';
    translatedMissionPlan = undefined;
    return;
  }

  missionResult.textContent = 'Analyzing mission...';

  let plan;
  let usedSource = 'rules';
  const shouldAttemptAi = missionMode.value === 'ai' || (missionMode.value === 'auto' && aiEndpointStatus !== 'unavailable');

  if (shouldAttemptAi) {
    try {
      plan = await fetchAiMissionPlan(text);
      usedSource = 'ai';
      aiEndpointStatus = 'available';
    } catch (error) {
      if (error?.status === 404 || error?.status === 405 || error?.status === 501) {
        aiEndpointStatus = 'unavailable';
      }

      if (missionMode.value === 'ai') {
        missionResult.textContent = 'AI mode selected, but AI endpoint is not available. Switch to auto or rules mode.';
        missionSource.textContent = 'Current mode: AI only (endpoint unavailable)';
        translatedMissionPlan = undefined;
        return;
      }
    }
  }

  if (!plan) {
    plan = heuristicMissionPlan(text);
    usedSource = 'rules';
  }

  translatedMissionPlan = plan;
  missionSource.textContent = usedSource === 'ai'
    ? 'Source: AI recommendation'
    : missionMode.value === 'auto'
      ? aiEndpointStatus === 'unavailable'
        ? 'Source: Rules engine (AI endpoint unavailable)'
        : 'Source: Rules fallback (AI unavailable)'
      : 'Source: Rules engine';

  missionResult.innerHTML = `<strong>Recommended plan:</strong> ${plan.material}, ${plan.finish} finish, ${plan.colorProfile} color profile.${plan.rush ? ' Rush enabled.' : ''}${plan.designHelp ? ' Design review enabled.' : ''}<br>${plan.reasons.join(' ') || 'Using balanced defaults based on your note.'}`;
};

const applyTranslatedMission = () => {
  if (!translatedMissionPlan) {
    missionResult.textContent = 'Translate a mission first, then apply it.';
    return;
  }

  materialInput.value = translatedMissionPlan.material;
  finishInput.value = translatedMissionPlan.finish;
  colorProfileInput.value = translatedMissionPlan.colorProfile;
  rushCheckbox.checked = translatedMissionPlan.rush;
  designHelpCheckbox.checked = translatedMissionPlan.designHelp;
  useCaseInput.value = translatedMissionPlan.useCase;

  if (translatedMissionPlan.useCase === 'replacement') {
    infillDensityInput.value = 'strong';
    supportLevelInput.value = 'complex';
  } else if (translatedMissionPlan.useCase === 'display' || translatedMissionPlan.useCase === 'gift') {
    layerDetailInput.value = 'fine';
  } else {
    layerDetailInput.value = 'balanced';
    infillDensityInput.value = 'standard';
    supportLevelInput.value = 'standard';
  }

  missionResult.textContent = 'Translated plan applied to your quote form and customization settings.';
  handleFormUpdate();
};

const renderLiveEstimate = () => {
  const quote = calculateQuote();
  updatePromoStatus(quote.promoCode);

  if (!quote.isValid) {
    estimatePreview.textContent = '—';
    estimateTimeline.textContent = 'Add valid project details to preview your estimate.';
    estimateMeta.textContent = 'Includes print cost, setup fee, and delivery.';
    renderLiveBreakdown(quote);
    return;
  }

  estimatePreview.textContent = currency.format(quote.total);
  estimateTimeline.textContent = `Estimated lead time: ${quote.leadTimeDays}`;

  if (quote.rush) {
    estimateMeta.textContent = 'Rush production enabled (35% faster-turnaround fee applied).';
  } else if (quote.designHelp) {
    estimateMeta.textContent = 'Design review is enabled (+$12) for printability checks.';
  } else if (quote.layerDetail !== 'balanced' || quote.infillDensity !== 'standard' || quote.supportLevel !== 'standard') {
    estimateMeta.textContent = 'Advanced print customizations are active for this estimate.';
  } else if (quote.colorProfile !== 'standard') {
    estimateMeta.textContent = 'Special color profile selected (material finishing surcharge applied).';
  } else {
    estimateMeta.textContent = 'Standard production timeline selected.';
  }

  renderLiveBreakdown(quote);
};

const handleFormUpdate = () => {
  scheduleDraftSave();
  renderLiveEstimate();
};


const readModelFileAsPayload = () => {
  const file = modelFileInput.files[0];
  if (!file) {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] : '';
      resolve({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        base64,
      });
    };
    reader.onerror = () => {
      reject(new Error('Could not read uploaded file.'));
    };
    reader.readAsDataURL(file);
  });
};

const submitConfirmedQuote = async (quote) => {
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      quote: {
        projectName: quote.projectName,
        material: quote.material,
        colorProfile: quote.colorProfile,
        quantity: quote.quantity,
        weight: quote.weight,
        finish: quote.finish,
        layerDetail: quote.layerDetail,
        infillDensity: quote.infillDensity,
        supportLevel: quote.supportLevel,
        delivery: quote.delivery,
        useCase: quote.useCase,
        rush: quote.rush,
        designHelp: quote.designHelp,
        promoCode: quote.promoCode,
        leadTimeDays: quote.leadTimeDays,
        fileText: quote.fileText,
        printCost: Number(quote.printCost.toFixed(2)),
        rushFee: Number(quote.rushFee.toFixed(2)),
        designReviewFee: Number(quote.designReviewFee.toFixed(2)),
        setupHelpFee: Number(quote.setupHelpFee.toFixed(2)),
        shipping: Number(quote.shipping.toFixed(2)),
        discount: Number(quote.discount.toFixed(2)),
        total: Number(quote.total.toFixed(2)),
      },
      mission: missionInput.value.trim(),
      customerEmail: emailInput.value.trim(),
      modelFile: await readModelFileAsPayload(),
    }),
  });

  if (!response.ok) {
    let message = 'Could not confirm quote right now. Please try again.';

    try {
      const payload = await response.json();
      if (payload?.error) {
        message = `Could not confirm quote: ${payload.error}`;
      }
    } catch {
      // ignore JSON parsing failures and keep generic message
    }

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return response.json();
};

form.addEventListener('input', handleFormUpdate);
form.addEventListener('change', handleFormUpdate);
clearDraftButton.addEventListener('click', clearDraft);
translateMissionButton.addEventListener('click', translateMission);
missionMode.addEventListener('change', () => {
  updateMissionModeLabel();
  persistDraft();
});
applyMissionOptionButton.addEventListener('click', applyTranslatedMission);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const quote = calculateQuote();

  if (!quote.isValid) {
    estimateMeta.textContent = quote.message;
    return;
  }

  estimateMeta.textContent = 'Confirming your quote...';

  try {
    const data = await submitConfirmedQuote(quote);
    currentOrderId = data.order.id;
    persistDraft();
    estimateMeta.textContent = `Quote confirmed for ${quote.projectName}. Redirecting to order status...`;
    window.location.href = `order-status.html?orderId=${encodeURIComponent(currentOrderId)}`;
  } catch (error) {
    estimateMeta.textContent = error?.message || 'Could not confirm quote right now. Please try again.';
  }
});

loadDraft();
updateMissionModeLabel();
resetOptionCards();
renderLiveEstimate();
