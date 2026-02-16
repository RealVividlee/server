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

const form = document.getElementById('quote-form');
const result = document.getElementById('quote-result');
const year = document.getElementById('year');

year.textContent = new Date().getFullYear();

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const projectName = document.getElementById('projectName').value.trim();
  const material = document.getElementById('material').value;
  const quantity = Number(document.getElementById('quantity').value);
  const weight = Number(document.getElementById('weight').value);
  const finish = document.getElementById('finish').value;
  const delivery = document.querySelector('input[name="delivery"]:checked').value;
  const hasUploadedFile = document.getElementById('modelFile').files.length > 0;

  if (!projectName || quantity <= 0 || weight <= 0) {
    result.textContent = 'Please enter a valid project name, quantity, and weight.';
    return;
  }

  const baseUnit = Math.max(5, weight * materialRatePerGram[material]);
  const unitWithFinish = baseUnit * finishMultiplier[finish];
  const subtotal = unitWithFinish * quantity;
  const setupHelpFee = subtotal < 25 ? 4 : 0;
  const shipping = delivery === 'pickup' ? 0 : subtotal >= 90 ? 0 : 8;
  const total = subtotal + setupHelpFee + shipping;
  const leadTimeDays = finish === 'premium' ? 'about 4–6 business days' : 'about 2–4 business days';

  const currency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  const feeText = setupHelpFee > 0 ? ` + ${currency.format(setupHelpFee)} small-order setup` : '';
  const shippingText = delivery === 'pickup' ? 'local pickup' : shipping === 0 ? 'free shipping' : `${currency.format(shipping)} shipping`;
  const fileText = hasUploadedFile ? 'File received.' : 'No file uploaded yet.';

  result.textContent = `${projectName}: estimated ${currency.format(total)} (${currency.format(
    subtotal,
  )} print cost${feeText}, ${shippingText}). Lead time is ${leadTimeDays}. ${fileText} We'll email you to confirm details before printing.`;
});
