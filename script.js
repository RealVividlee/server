const materialRatePerGram = {
  PLA: 0.09,
  PETG: 0.13,
  ABS: 0.15,
  Resin: 0.2,
};

const finishMultiplier = {
  standard: 1,
  premium: 1.2,
};

const colorMultiplier = {
  standard: 1,
  silk: 1.12,
  custom: 1.2,
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
const nextSteps = document.getElementById('quote-next-steps');
const estimatePreview = document.getElementById('live-estimate-value');
const estimateTimeline = document.getElementById('live-estimate-time');
const estimateMeta = document.getElementById('live-estimate-meta');
const liveBreakdown = document.getElementById('live-breakdown');
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
const useCaseInput = document.getElementById('useCase');
const emailInput = document.getElementById('email');
const modelFileInput = document.getElementById('modelFile');

let draftSaveTimeout;

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

const computeQuote = () => {
  const values = getFormValues();

  if (
    !values.projectName
    || values.quantity <= 0
    || values.weight <= 0
    || Number.isNaN(values.quantity)
    || Number.isNaN(values.weight)
  ) {
    return {
      isValid: false,
      promoCode: values.promoCode,
      message: 'Please enter a valid project name, quantity, and weight.',
    };
  }

  const baseUnit = Math.max(5, values.weight * materialRatePerGram[values.material]);
  const unitWithColor = baseUnit * colorMultiplier[values.colorProfile];
  const unitWithFinish = unitWithColor * finishMultiplier[values.finish];
  const rushFee = values.rush ? unitWithFinish * (rushMultiplier - 1) * values.quantity : 0;
  const printCost = unitWithFinish * values.quantity;
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

  const shippingText =
    values.delivery === 'pickup' ? 'Local pickup selected' : shipping === 0 ? 'Free shipping' : `${currency.format(shipping)} shipping`;

  return {
    isValid: true,
    ...values,
    leadTimeDays,
    fileText: values.hasUploadedFile ? 'File received.' : 'No file uploaded yet.',
    shippingText,
    printCost,
    rushFee,
    designReviewFee,
    subtotal,
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
    useCase: useCaseInput.value,
    delivery: getDeliveryValue(),
    email: emailInput.value,
    promoCode: promoInput.value,
    rush: rushCheckbox.checked,
    designHelp: designHelpCheckbox.checked,
  };

  try {
    localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    setDraftStatus('Draft saved.');
  } catch (error) {
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
  } catch (error) {
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
    useCaseInput.value = draft.useCase ?? 'prototype';
    emailInput.value = draft.email ?? '';
    promoInput.value = draft.promoCode ?? '';
    rushCheckbox.checked = Boolean(draft.rush);
    designHelpCheckbox.checked = Boolean(draft.designHelp);

    const delivery = draft.delivery === 'pickup' ? 'pickup' : 'ship';
    const deliveryInput = document.querySelector(`input[name="delivery"][value="${delivery}"]`);

    if (deliveryInput) {
      deliveryInput.checked = true;
    }

    setDraftStatus('Loaded your saved draft.');
  } catch (error) {
    setDraftStatus('Could not load saved draft. Starting fresh.');
  }
};

const clearDraft = () => {
  try {
    localStorage.removeItem(draftStorageKey);
  } catch (error) {
    // ignore storage removal failures
  }

  form.reset();
  const shipOption = document.querySelector('input[name="delivery"][value="ship"]');

  if (shipOption) {
    shipOption.checked = true;
  }

  setDraftStatus('Saved draft cleared.');
  nextSteps.hidden = true;
  renderLiveEstimate();
};

const renderLiveBreakdown = (quote) => {
  if (!quote.isValid) {
    liveBreakdown.innerHTML = '<li>Print cost: —</li><li>Setup fee: —</li><li>Shipping: —</li>';
    return;
  }

  const discountText = quote.hasPromo ? `-${currency.format(quote.discount)}` : 'none';

  liveBreakdown.innerHTML = `<li>Print cost: ${currency.format(quote.printCost)}</li>
    <li>Rush fee: ${currency.format(quote.rushFee)}</li>
    <li>Design review: ${currency.format(quote.designReviewFee)}</li>
    <li>Setup fee: ${currency.format(quote.setupHelpFee)}</li>
    <li>Shipping: ${currency.format(quote.shipping)}</li>
    <li>Promo discount: ${discountText}</li>`;
};

const renderLiveEstimate = () => {
  const quote = computeQuote();

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

form.addEventListener('input', handleFormUpdate);
form.addEventListener('change', handleFormUpdate);
clearDraftButton.addEventListener('click', clearDraft);

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const quote = computeQuote();

  if (!quote.isValid) {
    estimateMeta.textContent = quote.message;
    nextSteps.hidden = true;
    return;
  }

  estimateMeta.textContent = `Estimate confirmed for ${quote.projectName}. ${quote.fileText}`;
  nextSteps.hidden = false;
  nextSteps.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

loadDraft();
renderLiveEstimate();
