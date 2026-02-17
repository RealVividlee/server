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

const useCaseNotes = {
  prototype: 'Prototype jobs are usually quick for us.',
  replacement: 'Replacement parts get an extra fit check note before print.',
  display: 'Display models may benefit from premium cleanup for smoother surfaces.',
  gift: 'Gift projects can include simple cleanup touches upon request.',
  other: 'We can review custom project needs by email.',
};

const promoCodes = {
  WELCOME10: 0.1,
  MAKER5: 0.05,
};

const rushMultiplier = 1.35;
const designHelpFee = 12;
const draftStorageKey = 'maple-layer-quote-draft-v1';

const form = document.getElementById('quote-form');
const result = document.getElementById('quote-result');
const nextSteps = document.getElementById('quote-next-steps');
const estimatePreview = document.getElementById('live-estimate-value');
const estimateTimeline = document.getElementById('live-estimate-time');
const estimateMeta = document.getElementById('live-estimate-meta');
const draftStatus = document.getElementById('draft-status');
const clearDraftButton = document.getElementById('clearDraft');
const rushCheckbox = document.getElementById('rush');
const designHelpCheckbox = document.getElementById('designHelp');
const promoInput = document.getElementById('promoCode');
const year = document.getElementById('year');

year.textContent = new Date().getFullYear();

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const escapeHtml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

const computeQuote = () => {
  const projectName = document.getElementById('projectName').value.trim();
  const material = document.getElementById('material').value;
  const colorProfile = document.getElementById('colorProfile').value;
  const quantity = Number(document.getElementById('quantity').value);
  const weight = Number(document.getElementById('weight').value);
  const finish = document.getElementById('finish').value;
  const useCase = document.getElementById('useCase').value;
  const delivery = document.querySelector('input[name="delivery"]:checked').value;
  const hasUploadedFile = document.getElementById('modelFile').files.length > 0;
  const rush = rushCheckbox.checked;
  const designHelp = designHelpCheckbox.checked;
  const promoCode = promoInput.value.trim().toUpperCase();

  if (!projectName || quantity <= 0 || weight <= 0 || Number.isNaN(quantity) || Number.isNaN(weight)) {
    return {
      isValid: false,
      message: 'Please enter a valid project name, quantity, and weight.',
    };
  }

  const baseUnit = Math.max(5, weight * materialRatePerGram[material]);
  const unitWithColor = baseUnit * colorMultiplier[colorProfile];
  const unitWithFinish = unitWithColor * finishMultiplier[finish];
  const rushFee = rush ? unitWithFinish * (rushMultiplier - 1) * quantity : 0;
  const printCost = unitWithFinish * quantity;
  const subtotal = printCost + rushFee + (designHelp ? designHelpFee : 0);
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

  const shippingText =
    delivery === 'pickup' ? 'Local pickup selected' : shipping === 0 ? 'Free shipping' : `${currency.format(shipping)} shipping`;
  const fileText = hasUploadedFile ? 'File received.' : 'No file uploaded yet.';

  return {
    isValid: true,
    projectName,
    useCase,
    leadTimeDays,
    fileText,
    shippingText,
    printCost,
    rushFee,
    designHelp,
    setupHelpFee,
    shipping,
    discount,
    total,
    promoCode,
    hasPromo: discountRate > 0,
    rush,
    colorProfile,
  };
};

const saveDraft = () => {
  const draft = {
    projectName: document.getElementById('projectName').value,
    material: document.getElementById('material').value,
    colorProfile: document.getElementById('colorProfile').value,
    quantity: document.getElementById('quantity').value,
    weight: document.getElementById('weight').value,
    finish: document.getElementById('finish').value,
    useCase: document.getElementById('useCase').value,
    delivery: document.querySelector('input[name="delivery"]:checked').value,
    email: document.getElementById('email').value,
    promoCode: promoInput.value,
    rush: rushCheckbox.checked,
    designHelp: designHelpCheckbox.checked,
  };

  localStorage.setItem(draftStorageKey, JSON.stringify(draft));
  draftStatus.textContent = 'Draft saved.';
};

const loadDraft = () => {
  const rawDraft = localStorage.getItem(draftStorageKey);

  if (!rawDraft) {
    return;
  }

  try {
    const draft = JSON.parse(rawDraft);
    document.getElementById('projectName').value = draft.projectName ?? '';
    document.getElementById('material').value = draft.material ?? 'PLA';
    document.getElementById('colorProfile').value = draft.colorProfile ?? 'standard';
    document.getElementById('quantity').value = draft.quantity ?? '1';
    document.getElementById('weight').value = draft.weight ?? '60';
    document.getElementById('finish').value = draft.finish ?? 'standard';
    document.getElementById('useCase').value = draft.useCase ?? 'prototype';
    document.getElementById('email').value = draft.email ?? '';
    promoInput.value = draft.promoCode ?? '';
    rushCheckbox.checked = Boolean(draft.rush);
    designHelpCheckbox.checked = Boolean(draft.designHelp);

    const delivery = draft.delivery === 'pickup' ? 'pickup' : 'ship';
    const deliveryInput = document.querySelector(`input[name="delivery"][value="${delivery}"]`);

    if (deliveryInput) {
      deliveryInput.checked = true;
    }

    draftStatus.textContent = 'Loaded your saved draft.';
  } catch {
    draftStatus.textContent = 'Could not load saved draft. Starting fresh.';
  }
};

const clearDraft = () => {
  localStorage.removeItem(draftStorageKey);
  form.reset();
  document.querySelector('input[name="delivery"][value="ship"]').checked = true;
  draftStatus.textContent = 'Saved draft cleared.';
  nextSteps.hidden = true;
  result.textContent = "Fill in your details and we'll show a quick estimate.";
  renderLiveEstimate();
};

const renderLiveEstimate = () => {
  const quote = computeQuote();

  if (!quote.isValid) {
    estimatePreview.textContent = '—';
    estimateTimeline.textContent = 'Add valid project details to preview your estimate.';
    estimateMeta.textContent = 'Includes print cost, setup fee, and delivery.';
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
};

form.addEventListener('input', () => {
  saveDraft();
  renderLiveEstimate();
});

form.addEventListener('change', () => {
  saveDraft();
  renderLiveEstimate();
});

clearDraftButton.addEventListener('click', clearDraft);

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const quote = computeQuote();

  if (!quote.isValid) {
    result.textContent = quote.message;
    nextSteps.hidden = true;
    return;
  }

  const safeProjectName = escapeHtml(quote.projectName);
  const discountLine = quote.hasPromo
    ? `<li>Promo (${quote.promoCode}): -${currency.format(quote.discount)}</li>`
    : '<li>Promo: none</li>';
  const rushLine = quote.rush ? `<li>Rush fee: ${currency.format(quote.rushFee)}</li>` : '';
  const designReviewLine = quote.designHelp ? `<li>Design review: ${currency.format(designHelpFee)}</li>` : '<li>Design review: none</li>';

  result.innerHTML = `${safeProjectName}: estimated <strong>${currency.format(quote.total)}</strong> with a lead time of ${quote.leadTimeDays}. ${quote.fileText} ${useCaseNotes[quote.useCase]}
    <ul class="quote-breakdown">
      <li>Print cost: ${currency.format(quote.printCost)}</li>
      ${rushLine}
      ${designReviewLine}
      <li>Small-order setup: ${currency.format(quote.setupHelpFee)}</li>
      <li>${quote.shippingText}</li>
      ${discountLine}
      <li><strong>Total: ${currency.format(quote.total)}</strong></li>
    </ul>`;

  nextSteps.hidden = false;
});

loadDraft();
renderLiveEstimate();
